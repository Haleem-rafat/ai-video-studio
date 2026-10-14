import { spawn, type ChildProcess } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, rename, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize, sep } from "node:path";

import { LLM_URL, OUTPUT_DIR, ROOT, loadChannel, loadChannels } from "../config.ts";
import { imageIsCurrent } from "../media/images.ts";
import { voiceIsCurrent } from "../media/voice.ts";
import { build, compose, createProject, factCheck, render } from "../pipeline.ts";
import { listProjects, loadProject, projectDir, saveProject } from "../project.ts";
import { suggestTopics } from "../script/topics.ts";
import { STYLES, VISUAL_TYPES, type FormatId, type Project, type Scene, type StyleId } from "../types.ts";
import { enqueue, getJob, recentJobs } from "./jobs.ts";

const PORT = Number(process.env.PORT ?? 4300);
const DIST = join(ROOT, "dist");
const PREVIEW_RUNTIME = join(ROOT, "src", "server", "preview-runtime.js");

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
};

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// ---------------------------------------------------------------- Bonsai

let llmProcess: ChildProcess | null = null;
const llmLog: string[] = [];

async function llmRunning(): Promise<boolean> {
  try {
    return (await fetch(`${LLM_URL}/health`, { signal: AbortSignal.timeout(1500) })).ok;
  } catch {
    return false;
  }
}

function startLlm(): void {
  if (llmProcess && llmProcess.exitCode === null) return;

  llmProcess = spawn("bash", [join(ROOT, "bin", "start-llm.sh")], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  const keep = (chunk: Buffer) => {
    llmLog.push(...chunk.toString().split("\n").filter(Boolean));
    llmLog.splice(0, Math.max(0, llmLog.length - 200));
  };
  llmProcess.stdout?.on("data", keep);
  llmProcess.stderr?.on("data", keep);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    llmProcess?.kill();
    process.exit(0);
  });
}

// ---------------------------------------------------------- ElevenLabs credit

let creditCache: { at: number; value: unknown } | null = null;

async function elevenCredit(): Promise<unknown> {
  if (creditCache && Date.now() - creditCache.at < 60_000) return creditCache.value;
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return null;

  try {
    const response = await fetch("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": key } });
    const data = (await response.json()) as { character_count?: number; character_limit?: number };
    creditCache = { at: Date.now(), value: { used: data.character_count, limit: data.character_limit } };
  } catch {
    creditCache = { at: Date.now(), value: null };
  }

  return creditCache.value;
}

// ---------------------------------------------------------------- helpers

async function body<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  return (text ? JSON.parse(text) : {}) as T;
}

function json(response: ServerResponse, status: number, data: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(data));
}

/** Serves a file with Range support, which <video> and <audio> need to seek. */
async function sendFile(request: IncomingMessage, response: ServerResponse, path: string, extraHtml?: string): Promise<void> {
  const info = await stat(path).catch(() => null);
  if (!info?.isFile()) throw new HttpError(404, "Not found");

  const type = TYPES[extname(path)] ?? "application/octet-stream";

  if (extraHtml !== undefined) {
    const html = (await readFile(path, "utf8")).replace("</body>", `${extraHtml}</body>`);
    response.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    return void response.end(html);
  }

  const range = request.headers.range?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
    response.writeHead(206, {
      "Content-Type": type,
      "Content-Range": `bytes ${start}-${end}/${info.size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1,
    });
    return void createReadStream(path, { start, end }).pipe(response);
  }

  response.writeHead(200, { "Content-Type": type, "Content-Length": info.size, "Accept-Ranges": "bytes" });
  createReadStream(path).pipe(response);
}

/** Resolves a path inside a base folder, refusing anything that climbs out. */
function inside(base: string, relative: string): string {
  const full = normalize(join(base, decodeURIComponent(relative)));
  if (full !== base && !full.startsWith(base + sep)) throw new HttpError(403, "Forbidden");
  return full;
}

/** What the studio shows per scene beyond the project file itself. */
function withState(project: Project) {
  const dir = projectDir(project.id);
  const channel = loadChannel(project.channel);

  return {
    ...project,
    hasComposition: existsSync(join(dir, "index.html")),
    hasVideo: existsSync(join(dir, "video.mp4")),
    scenes: project.scenes.map((scene) => ({
      ...scene,
      voiceCurrent: voiceIsCurrent(dir, scene, channel.voiceId),
      imageCurrent: imageIsCurrent(dir, scene, project.style),
    })),
  };
}

/** Applies studio edits, keeping the generated audio and pictures it cannot change. */
function applyEdits(project: Project, edits: Partial<Project>): Project {
  if (typeof edits.title === "string") project.title = edits.title;
  if (typeof edits.description === "string") project.description = edits.description;
  if (Array.isArray(edits.tags)) project.tags = edits.tags.map(String);
  if (edits.style !== undefined) {
    if (!STYLES.includes(edits.style)) throw new HttpError(400, "Style is motion or whiteboard.");
    project.style = edits.style;
  }

  if (Array.isArray(edits.scenes)) {
    const previous = new Map(project.scenes.map((scene) => [scene.id, scene]));
    project.scenes = edits.scenes.map((edit): Scene => {
      if (!/^s[a-z0-9]+$/.test(edit.id)) throw new HttpError(400, `Bad scene id "${edit.id}"`);
      if (!VISUAL_TYPES.includes(edit.visual?.type)) throw new HttpError(400, `Bad visual on ${edit.id}`);
      const old = previous.get(edit.id);
      return {
        id: edit.id,
        narration: String(edit.narration ?? ""),
        visual: edit.visual,
        imagePrompt: String(edit.imagePrompt ?? ""),
        imageSeed: Number(edit.imageSeed ?? old?.imageSeed ?? 0),
        image: old?.image,
        audio: old?.audio,
      };
    });
  }

  return project;
}

// ---------------------------------------------------------------- routes

async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", "http://localhost");
  const path = url.pathname;
  const method = request.method ?? "GET";
  let match: RegExpMatchArray | null;

  if (path === "/api/status") {
    const [llm, credit] = await Promise.all([llmRunning(), elevenCredit()]);
    const starting = Boolean(llmProcess && llmProcess.exitCode === null && !llm);
    return json(response, 200, { llm, llmStarting: starting, llmLog: llmLog.slice(-5), credit, jobs: recentJobs() });
  }

  if (path === "/api/llm/start" && method === "POST") {
    if (!(await llmRunning())) startLlm();
    return json(response, 200, { ok: true });
  }

  if (path === "/api/channels") return json(response, 200, loadChannels());

  if (path === "/api/topics" && method === "POST") {
    const input = await body<{ channel: string; format: FormatId; focus?: string; count?: number }>(request);
    const job = enqueue(`Topic ideas for ${input.channel}`, () => suggestTopics(loadChannel(input.channel), input.format, input.count ?? 10, input.focus ?? ""));
    return json(response, 202, job);
  }

  if ((match = path.match(/^\/api\/jobs\/([\w-]+)$/))) {
    const job = getJob(match[1]);
    return job ? json(response, 200, job) : json(response, 404, { error: "No such job" });
  }

  if (path === "/api/projects" && method === "GET") {
    const projects = await listProjects();
    return json(response, 200, projects.map(({ scenes, ...rest }) => ({ ...rest, sceneCount: scenes.length, hasVideo: existsSync(join(projectDir(rest.id), "video.mp4")) })));
  }

  if (path === "/api/projects" && method === "POST") {
    const input = await body<{ channel: string; format: FormatId; topic: string; style?: StyleId }>(request);
    if (!input.topic?.trim()) throw new HttpError(400, "A topic is required.");
    if (input.format !== "short" && input.format !== "long") throw new HttpError(400, "Format is short or long.");
    const style = input.style ?? "motion";
    if (!STYLES.includes(style)) throw new HttpError(400, "Style is motion or whiteboard.");
    loadChannel(input.channel);
    const job = enqueue(`Write script: ${input.topic}`, async () => (await createProject(input.channel, input.format, input.topic.trim(), style)).id);
    return json(response, 202, job);
  }

  if ((match = path.match(/^\/api\/projects\/([a-z0-9-]+)$/))) {
    const id = match[1];
    if (method === "GET") return json(response, 200, withState(await loadProject(id)));
    if (method === "PUT") {
      const project = applyEdits(await loadProject(id), await body<Partial<Project>>(request));
      await saveProject(project);
      return json(response, 200, withState(project));
    }
    if (method === "DELETE") {
      // Moved aside rather than deleted, in case it was a mistake.
      await mkdir(join(OUTPUT_DIR, ".trash"), { recursive: true });
      await rename(projectDir(id), join(OUTPUT_DIR, ".trash", id));
      return json(response, 200, { ok: true });
    }
  }

  if ((match = path.match(/^\/api\/projects\/([a-z0-9-]+)\/(build|preview|render|factcheck)$/)) && method === "POST") {
    const [, id, action] = match;
    const options = await body<{ images?: boolean; quality?: "draft" | "standard" | "high" }>(request);
    await loadProject(id);
    const job =
      action === "build" || action === "preview"
        ? enqueue("Voice, pictures and preview", () => build(id, { images: options.images ?? true, render: false }), id)
        : action === "render"
          ? enqueue(`Render video (${options.quality ?? "standard"})`, () => render(id, options.quality ?? "standard"), id)
          : enqueue("Fact-check script", () => factCheck(id), id);
    return json(response, 202, job);
  }

  if ((match = path.match(/^\/api\/projects\/([a-z0-9-]+)\/compose$/)) && method === "POST") {
    await compose(match[1]);
    return json(response, 200, { ok: true });
  }

  if ((match = path.match(/^\/files\/([a-z0-9-]+)\/(.+)$/))) {
    const dir = projectDir(match[1]);
    const file = inside(dir, match[2]);
    const preview = url.searchParams.has("preview") && file.endsWith("index.html");
    return sendFile(request, response, file, preview ? `<script>${await readFile(PREVIEW_RUNTIME, "utf8")}</script>` : undefined);
  }

  if (path.startsWith("/api/")) throw new HttpError(404, "Unknown API route");

  // The studio itself: built files, falling back to index.html for the SPA.
  if (!existsSync(join(DIST, "index.html"))) throw new HttpError(503, "Studio not built. Run: npm run app");
  const asset = inside(DIST, path === "/" ? "index.html" : path.slice(1));
  return sendFile(request, response, existsSync(asset) ? asset : join(DIST, "index.html"));
}

createServer((request, response) => {
  route(request, response).catch((error: unknown) => {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : String(error);
    if (status === 500) console.error(error);
    if (!response.headersSent) json(response, status, { error: message });
    else response.end();
  });
}).listen(PORT, "127.0.0.1", () => {
  console.log(`AI Video Studio: http://localhost:${PORT}`);
  if (process.env.OPEN) spawn("open", [`http://localhost:${PORT}`]);
});
