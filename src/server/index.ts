import { spawn, type ChildProcess } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, rename, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize, sep } from "node:path";

import { addAsset, cloneVoice, FONTS, importFromYouTube, makeCharacter, readStyle, removeAsset, type AssetKind } from "../brand/brand.ts";
import { LLM_URL, OUTPUT_DIR, ROOT, brandDir, loadChannel, loadChannels, saveChannel, type Channel } from "../config.ts";
import { imageIsCurrent } from "../media/images.ts";
import { narratorKey, voiceIsCurrent } from "../media/voice.ts";
import { build, channelOf, compose, createMarketing, createProject, factCheck, MARKETING_VOICES, render } from "../pipeline.ts";
import { assistantTurn, defaultScript, listSessions, loadSession, newSession, saveSession, sessionDir, type Session } from "../marketing/session.ts";
import { readSite } from "../marketing/site.ts";
import { placeMarketing } from "../render/marketing-kit.ts";
import { listProjects, loadProject, projectDir, saveProject } from "../project.ts";
import { completeSignIn, connectionStatus, signIn, uploadVideo, type Privacy } from "../publish/youtube.ts";
import { lookOf } from "../render/looks.ts";
import { suggestTopics } from "../script/topics.ts";
import { productsOf } from "../script/versus.ts";
import { placeVersus } from "../render/versus.ts";
import { placeDeep } from "../render/deepdive.ts";
import { addProductPhoto } from "../media/products.ts";
import { addScenePhoto } from "../media/photos.ts";
import { LOOKS, STYLES, VISUAL_TYPES, type Creativity, type FormatId, type Project, type Scene, type StyleId } from "../types.ts";
import { enqueue, getJob, recentJobs } from "./jobs.ts";
import { handleClients, startClientSchedule } from "./clients.ts";
import { usageFolders } from "../clients/library.ts";
import { appendUsage, collectUsage, readUsage, STUDIO_LEDGER, summarize } from "../usage.ts";
import { gateway } from "ai";

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
  ".webp": "image/webp",
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

let balanceCache: { at: number; value: number | null } = { at: 0, value: null };

/** What is left on the AI Gateway, in dollars; asked at most once a minute. */
async function gatewayBalance(): Promise<number | null> {
  if (Date.now() - balanceCache.at < 60_000) return balanceCache.value;
  const value = await gateway.getCredits().then((credits) => Number(credits.balance), () => null);
  balanceCache = { at: Date.now(), value };
  return value;
}

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

/**
 * Where each scene sits in a versus, arena or deep-dive video, which open on
 * an intro and leave gaps between scenes: the timeline uses these instead of
 * laying scenes end to end.
 */
function timingOf(project: Project): { starts: number[]; lengths: number[] } | undefined {
  if (project.style !== "versus" && project.style !== "deepdive" && project.style !== "marketing") return undefined;
  const { scenes, total } = project.style === "deepdive" ? placeDeep(project) : project.style === "marketing" ? placeMarketing(project) : placeVersus(project);
  const starts = scenes.map((scene) => scene.start);
  return { starts, lengths: starts.map((start, index) => (starts[index + 1] ?? total) - start) };
}

/** What the studio shows per scene beyond the project file itself. */
function withState(project: Project) {
  const dir = projectDir(project.id);
  const channel = channelOf(project);

  return {
    ...project,
    hasComposition: existsSync(join(dir, "index.html")),
    hasVideo: existsSync(join(dir, "video.mp4")),
    timing: timingOf(project),
    scenes: project.scenes.map((scene) => ({
      ...scene,
      voiceCurrent: voiceIsCurrent(dir, scene, narratorKey(channel)),
      imageCurrent: imageIsCurrent(dir, scene, lookOf(project, scene)),
    })),
  };
}

/** Applies studio edits, keeping the generated audio and pictures it cannot change. */
function applyEdits(project: Project, edits: Partial<Project>): Project {
  if (typeof edits.title === "string") project.title = edits.title;
  if (typeof edits.description === "string") project.description = edits.description;
  if (Array.isArray(edits.tags)) project.tags = edits.tags.map(String);
  if (edits.style !== undefined && edits.style !== project.style) {
    if (!STYLES.includes(edits.style)) throw new HttpError(400, `Style is one of ${STYLES.join(", ")}.`);
    // Versus and deep-dive scenes are their own kind; other looks can't show them, and vice versa.
    const own = ["versus", "deepdive", "marketing"];
    if (own.includes(edits.style) || own.includes(project.style ?? "")) throw new HttpError(400, "A versus or deep-dive video can't switch to another look. Start a new video instead.");
    project.style = edits.style;
  }
  if (edits.versus && project.versus) {
    for (const side of ["a", "b"] as const) {
      const next = edits.versus[side];
      if (!next) continue;
      project.versus[side] = {
        ...project.versus[side],
        name: String(next.name ?? project.versus[side].name),
        short: String(next.short ?? project.versus[side].short),
        color: /^#[0-9a-fA-F]{6}$/.test(String(next.color)) ? String(next.color) : project.versus[side].color,
      };
    }
    if (typeof edits.versus.hook === "string") project.versus.hook = edits.versus.hook;
    if (edits.versus.thumbnail) project.versus.thumbnail = { ...project.versus.thumbnail, ...edits.versus.thumbnail, headline: String(edits.versus.thumbnail.headline ?? project.versus.thumbnail?.headline ?? "") };
  }
  if (edits.deepdive && project.deepdive) {
    if (typeof edits.deepdive.hook === "string") project.deepdive.hook = edits.deepdive.hook;
    if (edits.deepdive.thumbnail) project.deepdive.thumbnail = { ...project.deepdive.thumbnail, ...edits.deepdive.thumbnail, headline: String(edits.deepdive.thumbnail.headline ?? project.deepdive.thumbnail?.headline ?? "") };
    const query = edits.deepdive.cover?.query;
    // A new search drops the old photo; the next preview update finds one.
    if (typeof query === "string" && query.trim() !== project.deepdive.cover?.query) project.deepdive.cover = { query: query.trim() };
  }
  if (edits.marketing && project.marketing) {
    if (typeof edits.marketing.captions === "boolean") project.marketing.captions = edits.marketing.captions;
    const voice = edits.marketing.narrator?.voice;
    if (typeof voice === "string" && /^[A-Za-z]+$/.test(voice)) project.marketing.narrator.voice = voice;
    const colors = edits.marketing.brand?.colors;
    if (colors) {
      for (const key of Object.keys(project.marketing.brand.colors) as (keyof typeof colors)[]) {
        if (/^#[0-9a-fA-F]{6}$/.test(String(colors[key]))) project.marketing.brand.colors[key] = String(colors[key]);
      }
    }
  }
  if (typeof edits.soundtrack === "boolean") project.soundtrack = edits.soundtrack;

  if (Array.isArray(edits.scenes)) {
    const previous = new Map(project.scenes.map((scene) => [scene.id, scene]));
    project.scenes = edits.scenes.map((edit): Scene => {
      if (!/^s[a-z0-9]+$/.test(edit.id)) throw new HttpError(400, `Bad scene id "${edit.id}"`);
      if (!VISUAL_TYPES.includes(edit.visual?.type)) throw new HttpError(400, `Bad visual on ${edit.id}`);
      const old = previous.get(edit.id);
      if (edit.visual.type === "deepdive" && edit.visual.photo) {
        const before = old?.visual.type === "deepdive" ? old.visual.photo : undefined;
        const query = String(edit.visual.photo.query ?? "").trim();
        // Keep the found or uploaded photo unless its search words changed.
        edit.visual.photo = query === before?.query && before?.path ? before : query ? { query } : undefined;
        if (!edit.visual.photo) delete edit.visual.photo;
      }
      return {
        id: edit.id,
        narration: String(edit.narration ?? ""),
        visual: edit.visual,
        imagePrompt: String(edit.imagePrompt ?? ""),
        imageSeed: Number(edit.imageSeed ?? old?.imageSeed ?? 0),
        ...(edit.look && LOOKS.includes(edit.look) ? { look: edit.look } : {}),
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

  // Instagram clients: daily ideas, carousels and reels (src/server/clients.ts).
  if (path.startsWith("/api/clients") || path.startsWith("/client-files/") || path.startsWith("/client-styles/")) {
    const handled = await handleClients({ path, method, url, request, response, json, body, sendFile, inside, fail: (status, message) => new HttpError(status, message) });
    if (handled) return;
  }

  if (path === "/api/status") {
    const [llm, credit] = await Promise.all([llmRunning(), elevenCredit()]);
    const starting = Boolean(llmProcess && llmProcess.exitCode === null && !llm);
    return json(response, 200, { llm, llmStarting: starting, llmLog: llmLog.slice(-5), credit, jobs: recentJobs() });
  }

  if (path === "/api/llm/start" && method === "POST") {
    if (!(await llmRunning())) startLlm();
    return json(response, 200, { ok: true });
  }

  if (path === "/api/channels" && method === "GET") return json(response, 200, loadChannels());

  if (path === "/api/channels" && method === "POST") {
    const input = await body<{ name?: string; language?: "en" | "ar" }>(request);
    const name = input.name?.trim();
    if (!name) throw new HttpError(400, "Give the channel a name");
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `channel-${Date.now().toString(36)}`;
    if (loadChannels().some((channel) => channel.id === id)) throw new HttpError(409, `A channel called "${id}" already exists`);
    const arabic = input.language === "ar";
    const channel: Channel = {
      id,
      name,
      language: arabic ? "ar" : "en",
      audience: "curious viewers who like clear, quick explanations",
      tone: "clear, friendly and energetic",
      voiceId: loadChannels()[0]?.voiceId ?? "",
      imageStyle: "clean modern illustration, soft studio lighting, no text, no letters",
      mascot: { kind: "robot", name: "Pixel" },
      colors: { background: "#0f172a", panel: "#1e293b", text: "#f8fafc", accent: "#f97316", muted: "#94a3b8" },
      font: arabic ? FONTS["Arabic (SF Arabic)"] : FONTS["Avenir Next"],
      device: "laptop",
      brand: {},
    };
    saveChannel(channel);
    return json(response, 201, channel);
  }

  if ((match = path.match(/^\/api\/channels\/([a-z0-9-]+)$/)) && method === "PUT") {
    const channel = loadChannel(match[1]);
    const edits = await body<Partial<Channel>>(request);
    const allowed = ["name", "language", "audience", "tone", "voiceId", "imageStyle", "colors", "font", "device", "mascot"] as const;
    const next: Channel = { ...channel };
    for (const key of allowed) if (edits[key] !== undefined) (next as Record<string, unknown>)[key] = edits[key];
    if (edits.brand?.handle !== undefined) next.brand = { ...channel.brand, handle: edits.brand.handle.trim() || undefined };
    if (!/^#[0-9a-fA-F]{6}$/.test(next.colors.accent)) throw new HttpError(400, "Colors must be #rrggbb");
    saveChannel(next);
    return json(response, 200, next);
  }

  if ((match = path.match(/^\/api\/channels\/([a-z0-9-]+)\/assets$/)) && method === "POST") {
    const input = await body<{ kind: AssetKind; data: string }>(request);
    if (!["logo", "banner", "mascot", "reference", "photo"].includes(input.kind)) throw new HttpError(400, "Unknown picture kind");
    return json(response, 200, await addAsset(match[1], input.kind, input.data));
  }

  if ((match = path.match(/^\/api\/channels\/([a-z0-9-]+)\/voice$/)) && method === "POST") {
    const id = match[1];
    const input = await body<{ data: string; consent?: boolean }>(request);
    if (!input.consent) throw new HttpError(400, "Confirm the recording is your own voice");
    return json(response, 202, enqueue(`Clone ${loadChannel(id).name}'s voice`, () => cloneVoice(id, input.data)));
  }

  if ((match = path.match(/^\/api\/channels\/([a-z0-9-]+)\/assets\/([\w.-]+)$/)) && method === "DELETE") {
    return json(response, 200, await removeAsset(match[1], match[2]));
  }

  if ((match = path.match(/^\/api\/channels\/([a-z0-9-]+)\/(import|style|character)$/)) && method === "POST") {
    const [, id, action] = match;
    const channel = loadChannel(id);
    const input = await body<{ description?: string }>(request);
    const job =
      action === "import"
        ? enqueue(`Import ${channel.name} from YouTube`, () => importFromYouTube(id))
        : action === "style"
          ? enqueue(`Read ${channel.name}'s style`, () => readStyle(loadChannel(id)))
          : enqueue(`Make ${channel.name}'s character`, () => makeCharacter(id, input.description ?? ""));
    return json(response, 202, job);
  }

  if ((match = path.match(/^\/brand\/([a-z0-9-]+)\/([\w.-]+)$/))) {
    return sendFile(request, response, inside(brandDir(match[1]), match[2]));
  }

  if (path === "/api/topics" && method === "POST") {
    const input = await body<{ channel: string; format: FormatId; focus?: string; count?: number }>(request);
    const job = enqueue(`Topic ideas for ${input.channel}`, () => suggestTopics(loadChannel(input.channel), input.format, input.count ?? 10, input.focus ?? ""));
    return json(response, 202, job);
  }

  if ((match = path.match(/^\/api\/jobs\/([\w-]+)$/))) {
    const job = getJob(match[1]);
    return job ? json(response, 200, job) : json(response, 404, { error: "No such job" });
  }

  if ((match = path.match(/^\/api\/projects\/([a-z0-9-]+)\/usage$/)) && method === "GET") {
    const entries = await readUsage(projectDir(match[1]));
    return json(response, 200, { entries, summary: summarize(entries) });
  }

  if (path === "/api/usage" && method === "GET") {
    // Every video's, chat's and channel job's costs; a chat copied into its videos counts once.
    const seen = new Set<string>();
    const folders = [...(await listProjects()).map((project) => projectDir(project.id)), ...(await listSessions()).map((session) => sessionDir(session.id)), ...(await usageFolders()), STUDIO_LEDGER];
    const entries = (await Promise.all(folders.map((folder) => readUsage(folder)))).flat().filter((entry) => {
      if (!entry.generationId) return true;
      if (seen.has(entry.generationId)) return false;
      seen.add(entry.generationId);
      return true;
    });
    const month = new Date().toISOString().slice(0, 7);
    const videos = (await listProjects()).filter((project) => project.render).length;
    const total = summarize(entries);
    return json(response, 200, { total, month: summarize(entries.filter((entry) => entry.at.startsWith(month))), videos, perVideo: videos ? total.cost / videos : 0, balance: await gatewayBalance() });
  }

  if (path === "/api/projects" && method === "GET") {
    const projects = await listProjects();
    const costs = await Promise.all(projects.map(async (project) => (await readUsage(projectDir(project.id))).reduce((sum, entry) => sum + entry.cost, 0)));
    return json(response, 200, projects.map(({ scenes, ...rest }, index) => ({ ...rest, sceneCount: scenes.length, hasVideo: existsSync(join(projectDir(rest.id), "video.mp4")), cost: costs[index] })));
  }

  if (path === "/api/projects" && method === "POST") {
    const input = await body<{ channel: string; format: FormatId | "both"; topic: string; style?: StyleId }>(request);
    if (!input.topic?.trim()) throw new HttpError(400, "A topic is required.");
    if (input.format !== "short" && input.format !== "long" && input.format !== "both") throw new HttpError(400, "Format is short, long or both.");
    const style = input.style ?? "motion";
    if (!STYLES.includes(style)) throw new HttpError(400, `Style is one of ${STYLES.join(", ")}.`);
    if ((style === "versus" || style === "arena") && !productsOf(input.topic)) throw new HttpError(400, 'For a versus video, write the topic as "Product A vs Product B".');
    loadChannel(input.channel);
    // "Both" writes two scripts: a long video for the laptop and a Short, each sized for its format.
    const formats: FormatId[] = input.format === "both" ? ["long", "short"] : [input.format];
    const jobs = formats.map((format) => enqueue(`Write script: ${input.topic}${formats.length > 1 ? ` (${format === "long" ? "16:9" : "9:16"})` : ""}`, async () => (await createProject(input.channel, format, input.topic.trim(), style)).id));
    return json(response, 202, jobs[0]);
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

  if (path === "/api/youtube/callback" && method === "GET") {
    const { ok, message } = completeSignIn(url.searchParams);
    response.writeHead(ok ? 200 : 400, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<!doctype html><meta charset="utf-8"><title>YouTube</title><body style="font:15px system-ui;display:grid;place-items:center;height:90vh"><p>${message}</p></body>`);
    return;
  }

  if (path === "/api/youtube" && method === "GET") {
    return json(response, 200, await connectionStatus(loadChannels().map((channel) => channel.id)));
  }

  if ((match = path.match(/^\/api\/youtube\/([a-z0-9-]+)\/connect$/)) && method === "POST") {
    const channel = loadChannel(match[1]);
    const job = enqueue(`Connect YouTube for ${channel.name}`, async () => (await signIn(channel.id)).youtubeChannel.title);
    return json(response, 202, job);
  }

  if ((match = path.match(/^\/api\/projects\/([a-z0-9-]+)\/publish$/)) && method === "POST") {
    const id = match[1];
    if ((await loadProject(id)).marketing) throw new HttpError(400, "A marketing video isn't uploaded to a YouTube channel. Download video.mp4 and post.txt instead.");
    const input = await body<{ privacy?: Privacy; publishAt?: string; force?: boolean }>(request);
    const privacy = input.privacy ?? "private";
    if (!["private", "unlisted", "public"].includes(privacy)) throw new HttpError(400, "Privacy is private, unlisted or public.");
    if (input.publishAt !== undefined) {
      const at = Date.parse(input.publishAt);
      // YouTube rejects a publishAt that is not in the future.
      if (!Number.isFinite(at) || at < Date.now() + 5 * 60_000) throw new HttpError(400, "Pick a publish time at least 5 minutes from now.");
    }
    const project = await loadProject(id);
    const videoPath = join(projectDir(id), "video.mp4");
    if (!existsSync(videoPath)) throw new HttpError(400, "Render the video first.");
    if (project.youtube && !input.force) throw new HttpError(409, `Already on YouTube: ${project.youtube.url}`);

    const channel = loadChannel(project.channel);
    const label = input.publishAt ? `Upload to YouTube (scheduled ${new Date(input.publishAt).toLocaleString()})` : `Upload to YouTube (${privacy})`;
    const job = enqueue(
      label,
      async () => {
        const thumbnail = join(projectDir(id), "thumbnail.png");
        const upload = await uploadVideo(await loadProject(id), videoPath, {
          privacy,
          madeForKids: channel.madeForKids ?? false,
          publishAt: input.publishAt,
          language: channel.language ?? "en",
          thumbnail: existsSync(thumbnail) ? thumbnail : undefined,
        });
        // Re-read so edits made during the upload are kept.
        const latest = await loadProject(id);
        latest.youtube = upload;
        await saveProject(latest);
        console.log(`uploaded: ${upload.url}`);
        return upload.url;
      },
      id,
    );
    return json(response, 202, job);
  }

  if ((match = path.match(/^\/api\/projects\/([a-z0-9-]+)\/product\/(a|b)$/)) && method === "POST") {
    const [, id, side] = match;
    const input = await body<{ data: string }>(request);
    const project = await addProductPhoto(projectDir(id), await loadProject(id), side as "a" | "b", input.data);
    await saveProject(project);
    return json(response, 200, withState(project));
  }

  if ((match = path.match(/^\/api\/projects\/([a-z0-9-]+)\/photo\/(cover|s[a-z0-9]+)$/)) && method === "POST") {
    const [, id, target] = match;
    const input = await body<{ data: string }>(request);
    const project = await addScenePhoto(projectDir(id), await loadProject(id), target, input.data);
    await saveProject(project);
    return json(response, 200, withState(project));
  }

  if ((match = path.match(/^\/api\/projects\/([a-z0-9-]+)\/compose$/)) && method === "POST") {
    await compose(match[1]);
    return json(response, 200, { ok: true });
  }

  // ------------------------------------------------ marketing videos: website, chat, brief
  if (path === "/api/marketing/script" && method === "GET") {
    const language = url.searchParams.get("language") === "en" ? "en" : "ar";
    return json(response, 200, { script: await defaultScript(language), voices: MARKETING_VOICES });
  }

  if (path === "/api/marketing" && method === "GET") return json(response, 200, await listSessions());

  if (path === "/api/marketing" && method === "POST") {
    const input = await body<{ url?: string; language?: string; format?: FormatId | "both"; creativity?: Creativity; script?: string }>(request);
    const site = String(input.url ?? "").trim();
    if (!/^(https?:\/\/)?[\w-]+(\.[\w-]+)+/i.test(site)) throw new HttpError(400, "Add the website address, e.g. https://example.com");
    const language = input.language === "en" ? "en" : "ar";
    if (input.format !== "short" && input.format !== "long" && input.format !== "both") throw new HttpError(400, "Format is short, long or both.");
    const script = String(input.script ?? "").trim() || (await defaultScript(language));
    const session = newSession({ url: /^https?:\/\//i.test(site) ? site : `https://${site}`, language, format: input.format, creativity: input.creativity === "faithful" || input.creativity === "bold" ? input.creativity : "creative", script });
    await saveSession(session);
    const job = enqueue(`Read website: ${session.url.replace(/^https?:\/\//, "")}`, async (log) => {
      try {
        session.brand = await readSite(session.url, sessionDir(session.id), log);
        session.status = "chat";
        await saveSession(session);
        log("chat: preparing the first question ...");
        await assistantTurn(session);
        await saveSession(session);
        return session.id;
      } catch (error) {
        session.status = "failed";
        session.error = error instanceof Error ? error.message : String(error);
        await saveSession(session);
        throw error;
      }
    }, undefined, () => sessionDir(session.id));
    return json(response, 202, { session, job });
  }

  if ((match = path.match(/^\/api\/marketing\/([a-z0-9-]+)$/))) {
    const session = await loadSession(match[1]);
    if (method === "GET") return json(response, 200, session);
    if (method === "PUT") {
      // Edits from the brief panel: the user can correct any field the chat filled.
      const edits = await body<Partial<Pick<Session, "brief" | "script">> & { colors?: Record<string, string> }>(request);
      if (edits.brief) session.brief = { ...session.brief, ...edits.brief, cta: { ...session.brief.cta, ...(edits.brief.cta ?? {}) } };
      if (typeof edits.script === "string" && edits.script.trim()) session.script = edits.script;
      if (edits.colors && session.brand) {
        for (const [key, value] of Object.entries(edits.colors)) if (key in session.brand.colors && /^#[0-9a-fA-F]{6}$/.test(value)) session.brand.colors[key as keyof typeof session.brand.colors] = value;
      }
      await saveSession(session);
      return json(response, 200, session);
    }
  }

  if ((match = path.match(/^\/api\/marketing\/([a-z0-9-]+)\/messages$/)) && method === "POST") {
    const session = await loadSession(match[1]);
    if (session.status !== "chat" && session.status !== "done") throw new HttpError(409, "The website is still being read.");
    const { text } = await body<{ text?: string }>(request);
    if (!text?.trim()) throw new HttpError(400, "Write a message.");
    session.messages.push({ role: "user", text: text.trim().slice(0, 4000) });
    await saveSession(session);
    const { error, entries } = await collectUsage("Chat", () => assistantTurn(session));
    await appendUsage(sessionDir(session.id), entries.map((entry) => ({ ...entry, step: "chat" })));
    if (error) session.messages.push({ role: "assistant", text: `⚠️ ${error instanceof Error ? error.message : String(error)}` });
    await saveSession(session);
    return json(response, 200, session);
  }

  if ((match = path.match(/^\/api\/marketing\/([a-z0-9-]+)\/create$/)) && method === "POST") {
    const session = await loadSession(match[1]);
    if (session.missing.length) throw new HttpError(400, `The brief still needs: ${session.missing.join(", ")}`);
    const formats: FormatId[] = session.format === "both" ? ["short", "long"] : [session.format];
    const jobs = formats.map((format) =>
      enqueue(`Write script: ${session.brand?.name ?? "marketing"} marketing video (${format === "long" ? "16:9" : "9:16"})`, async (log) => (await createMarketing(session.id, log, format)).id),
    );
    return json(response, 202, jobs[0]);
  }

  if ((match = path.match(/^\/marketing-files\/([a-z0-9-]+)\/(.+)$/))) {
    return sendFile(request, response, inside(sessionDir(match[1]), match[2]));
  }

  if ((match = path.match(/^\/files\/([a-z0-9-]+)\/(.+)$/))) {
    const dir = projectDir(match[1]);
    const file = inside(dir, match[2]);
    // Any composition can be previewed: a mixed video's segments are run-N.html.
    const preview = url.searchParams.has("preview") && file.endsWith(".html");
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
  startClientSchedule();
});

/**
 * Google sends YouTube sign-ins to Framecast's callback (localhost:3000).
 * When Framecast isn't running, the studio stands in on that port for the
 * callback alone and passes it here; when Framecast is up, it keeps the port.
 */
const FRAMECAST_PORT = 3000;
const standIn = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname !== "/api/youtube/callback") {
    response.writeHead(404, { "Content-Type": "text/plain" });
    return void response.end("Only the studio's YouTube sign-in is handled here while Framecast is off.");
  }
  response.writeHead(302, { Location: `http://localhost:${PORT}/api/youtube/callback${url.search}` });
  response.end();
});
standIn.on("error", () => {});
standIn.listen(FRAMECAST_PORT, "127.0.0.1");
