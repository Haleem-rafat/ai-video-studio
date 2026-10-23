/**
 * The studio as an MCP server, so Claude (Claude Code, Claude Desktop) can
 * make and edit videos. It talks to the running studio on :4300 through the
 * same API the app uses, so jobs still run one at a time and every video
 * shows up in the app with its progress and cost.
 *
 *   claude mcp add video-studio -- node /path/to/ai-video-studio/src/mcp/server.ts
 *
 * Nothing here publishes to YouTube or deletes a project; those stay in the app.
 */
import { join } from "node:path";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

/** Where project folders live; computed here so this process never loads the studio's API keys. */
const OUTPUT_DIR = join(import.meta.dirname, "..", "..", "output");
const STUDIO = (process.env.STUDIO_URL ?? "http://localhost:4300").replace(/\/$/, "");

type Job = { id: string; label: string; projectId?: string; status: "queued" | "running" | "done" | "failed"; log: string[]; stages: { stage: string; done?: number; total?: number }[]; cost: number; result?: unknown; error?: string };
type Scene = { id: string; narration: string; visual: Record<string, unknown> & { type: string }; imagePrompt: string; voiceCurrent?: boolean };
type Project = {
  id: string;
  title: string;
  topic: string;
  channel: string;
  format: "short" | "long";
  style?: string;
  createdAt: string;
  updatedAt: string;
  render?: { seconds: number; renderedAt: string };
  scenes: Scene[];
  hasComposition: boolean;
  hasVideo: boolean;
  marketing?: { brand: { name: string; url: string }; post?: { caption: string; hashtags: string[] } };
};

async function call<T>(method: string, path: string, data?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${STUDIO}${path}`, {
      method,
      headers: data === undefined ? undefined : { "Content-Type": "application/json" },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
  } catch {
    throw new Error(`The studio isn't running at ${STUDIO}. Start it with: cd ai-video-studio && npm run server`);
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((result as { error?: string }).error ?? `Studio answered ${response.status}`);
  return result as T;
}

const text = (value: unknown) => ({ content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] });

/** Runs a tool and turns a thrown error into a readable tool error instead of a crash. */
const safe =
  <A,>(run: (args: A) => Promise<unknown>) =>
  async (args: A) => {
    try {
      return text(await run(args));
    } catch (error) {
      return { ...text(error instanceof Error ? error.message : String(error)), isError: true };
    }
  };

const files = (project: Pick<Project, "id" | "hasVideo" | "marketing">) => ({
  app: `${STUDIO}/projects/${project.id}`,
  video: project.hasVideo ? join(OUTPUT_DIR, project.id, "video.mp4") : null,
  ...(project.marketing ? { caption: join(OUTPUT_DIR, project.id, "post.txt") } : {}),
});

const jobView = (job: Job) => {
  const stage = job.stages.at(-1);
  return {
    job: job.id,
    label: job.label,
    status: job.status,
    step: stage ? `${stage.stage}${stage.total ? ` ${stage.done ?? 0}/${stage.total}` : ""}` : null,
    cost: `$${job.cost.toFixed(3)}`,
    lastLog: job.log.slice(-5),
    ...(job.projectId ? { project: job.projectId } : {}),
    ...(job.status === "done" && job.result !== undefined ? { result: job.result } : {}),
    ...(job.error ? { error: job.error } : {}),
  };
};

/** Waits up to `seconds` for a job to finish, so Claude doesn't have to poll in a tight loop. */
async function waitFor(id: string, seconds: number): Promise<Job> {
  const until = Date.now() + seconds * 1000;
  let job = await call<Job>("GET", `/api/jobs/${id}`);
  while ((job.status === "queued" || job.status === "running") && Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    job = await call<Job>("GET", `/api/jobs/${id}`);
  }
  return job;
}

const server = new McpServer({ name: "video-studio", version: "0.1.0" });

const FORMAT = z.enum(["short", "long", "both"]).describe("short = vertical 9:16, long = horizontal 16:9, both = one of each");
const WAIT = z.number().min(0).max(55).optional().describe("Seconds to wait for the job to finish before answering (max 55). Call job_status again to keep waiting");

server.registerTool(
  "studio_status",
  { title: "Studio status", description: "Whether the studio is running, the jobs in its queue, and this month's AI spend.", inputSchema: {} },
  safe(async () => {
    const [status, usage] = await Promise.all([call<{ jobs: Job[] }>("GET", "/api/status"), call<{ month: { cost: number }; balance: number | null; videos: number }>("GET", "/api/usage")]);
    return {
      running: true,
      jobs: status.jobs.filter((job) => job.status === "running" || job.status === "queued").map(jobView),
      spentThisMonth: `$${usage.month.cost.toFixed(2)}`,
      gatewayBalance: usage.balance === null ? "unknown" : `$${usage.balance.toFixed(2)}`,
      renderedVideos: usage.videos,
    };
  }),
);

server.registerTool(
  "list_channels",
  { title: "List channels", description: "The studio's channels (each has its language, voice, colours and look). A video is made for one of them.", inputSchema: {} },
  safe(async () => (await call<{ id: string; name: string; language: string; tone: string }[]>("GET", "/api/channels")).map(({ id, name, language, tone }) => ({ id, name, language, tone }))),
);

server.registerTool(
  "list_projects",
  {
    title: "List videos",
    description: "Video projects, newest first, with format, look, length, cost and whether a video was rendered.",
    inputSchema: { search: z.string().optional().describe("Only titles, topics or brands containing this"), limit: z.number().int().min(1).max(100).optional() },
  },
  safe(async ({ search, limit }: { search?: string; limit?: number }) => {
    const projects = await call<(Omit<Project, "scenes"> & { sceneCount: number; cost: number })[]>("GET", "/api/projects");
    const needle = search?.trim().toLowerCase();
    return projects
      .filter((project) => !needle || [project.title, project.topic, project.marketing?.brand.name ?? ""].some((field) => field.toLowerCase().includes(needle)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit ?? 25)
      .map((project) => ({
        id: project.id,
        title: project.title,
        channel: project.marketing?.brand.name ?? project.channel,
        format: project.format === "short" ? "9:16" : "16:9",
        look: project.style ?? "motion",
        scenes: project.sceneCount,
        created: project.createdAt,
        rendered: project.render ? `${project.render.seconds.toFixed(1)}s at ${project.render.renderedAt}` : null,
        cost: `$${project.cost.toFixed(2)}`,
      }));
  }),
);

server.registerTool(
  "get_project",
  { title: "Open a video", description: "A project's scenes (narration and what is on screen), its state and where its files are.", inputSchema: { project: z.string().describe("Project id") } },
  safe(async ({ project: id }: { project: string }) => {
    const project = await call<Project>("GET", `/api/projects/${id}`);
    return {
      id: project.id,
      title: project.title,
      topic: project.topic,
      format: project.format === "short" ? "9:16" : "16:9",
      look: project.style ?? "motion",
      created: project.createdAt,
      edited: project.updatedAt,
      rendered: project.render ?? null,
      previewReady: project.hasComposition,
      scenesNeedingVoice: project.scenes.filter((scene) => scene.voiceCurrent === false).length,
      files: files(project),
      post: project.marketing?.post ?? null,
      scenes: project.scenes.map((scene, index) => {
        const { type, headline, words, items, beat } = scene.visual as Record<string, unknown>;
        return { n: index + 1, id: scene.id, narration: scene.narration, visual: { type, beat, headline, words, items } };
      }),
    };
  }),
);

server.registerTool(
  "create_video",
  {
    title: "Write a new video",
    description:
      "Starts writing a video's script for a channel. Returns a job; when it is done its result is the new project id. Then call update_preview (voice + pictures) and render. Looks: motion, whiteboard, explainer, mixed, deepdive (long explainer with real photos), arena (fighting-game comparison; topic must be 'A vs B').",
    inputSchema: {
      channel: z.string().describe("Channel id from list_channels"),
      topic: z.string().min(3).describe("What the video is about, e.g. 'iPhone 18 Pro vs Pixel 11 Pro'"),
      format: FORMAT,
      look: z.enum(["motion", "whiteboard", "explainer", "mixed", "deepdive", "arena", "proscons", "versus"]).optional().describe("Default motion"),
      wait: WAIT,
    },
  },
  safe(async ({ channel, topic, format, look, wait }: { channel: string; topic: string; format: "short" | "long" | "both"; look?: string; wait?: number }) => {
    const job = await call<Job>("POST", "/api/projects", { channel, topic, format, style: look ?? "motion" });
    return { ...jobView(wait ? await waitFor(job.id, wait) : job), note: format === "both" ? "Two scripts are written (16:9 and 9:16); this is the first job, the second follows in the queue." : undefined };
  }),
);

server.registerTool(
  "start_marketing",
  {
    title: "Start a marketing video",
    description:
      "Reads a business website (facts, colours, logo) and opens a brief chat. Returns the session id and a job. When the job is done, call marketing_chat to see the assistant's questions, answer with marketing_reply until nothing is missing, then marketing_create.",
    inputSchema: {
      url: z.string().describe("The business website"),
      language: z.enum(["ar", "en"]).optional().describe("Default ar (Egyptian Arabic)"),
      format: FORMAT.optional().describe("Default both"),
      creativity: z.enum(["faithful", "creative", "bold"]).optional().describe("faithful follows the script word for word; bold is the most motion. Default creative"),
      script: z.string().optional().describe("Your own script or voice-over (optional; the studio's default script is used otherwise)"),
      wait: WAIT,
    },
  },
  safe(async ({ url, language, format, creativity, script, wait }: { url: string; language?: "ar" | "en"; format?: "short" | "long" | "both"; creativity?: string; script?: string; wait?: number }) => {
    const { session, job } = await call<{ session: { id: string }; job: Job }>("POST", "/api/marketing", { url, language: language ?? "ar", format: format ?? "both", creativity: creativity ?? "creative", script: script ?? "" });
    return { session: session.id, app: `${STUDIO}/marketing/${session.id}`, ...jobView(wait ? await waitFor(job.id, wait) : job) };
  }),
);

type Session = { id: string; status: string; brand?: { name: string; colors: Record<string, string>; services: string[] }; brief: unknown; messages: { role: string; text: string }[]; missing: string[]; projectId?: string; error?: string };
const sessionView = (session: Session) => ({
  session: session.id,
  status: session.status,
  brand: session.brand ? { name: session.brand.name, colors: session.brand.colors, services: session.brand.services } : null,
  brief: session.brief,
  missing: session.missing,
  readyToCreate: session.status !== "reading" && session.missing.length === 0,
  lastMessages: session.messages.slice(-4),
  ...(session.projectId ? { project: session.projectId } : {}),
  ...(session.error ? { error: session.error } : {}),
});

server.registerTool(
  "marketing_chat",
  { title: "Read a marketing brief", description: "A marketing session's brand, brief, what is still missing and the latest chat messages.", inputSchema: { session: z.string() } },
  safe(async ({ session }: { session: string }) => sessionView(await call<Session>("GET", `/api/marketing/${session}`))),
);

server.registerTool(
  "marketing_reply",
  { title: "Answer the brief chat", description: "Sends an answer to the marketing assistant; returns its reply and what is still missing.", inputSchema: { session: z.string(), message: z.string().min(1) } },
  safe(async ({ session, message }: { session: string; message: string }) => sessionView(await call<Session>("POST", `/api/marketing/${session}/messages`, { text: message }))),
);

server.registerTool(
  "marketing_create",
  {
    title: "Write the marketing video",
    description: "Writes the marketing video(s) from a finished brief. Returns a job whose result is the project id; then update_preview and render.",
    inputSchema: { session: z.string(), wait: WAIT },
  },
  safe(async ({ session, wait }: { session: string; wait?: number }) => {
    const job = await call<Job>("POST", `/api/marketing/${session}/create`);
    return jobView(wait ? await waitFor(job.id, wait) : job);
  }),
);

server.registerTool(
  "edit_scene",
  {
    title: "Edit a scene",
    description: "Changes one scene's narration and/or on-screen words. Changed narration is re-voiced on the next update_preview.",
    inputSchema: {
      project: z.string(),
      scene: z.union([z.number().int().min(1), z.string()]).describe("Scene number (1 = first) or scene id"),
      narration: z.string().optional(),
      headline: z.string().optional().describe("The scene's title on screen"),
      words: z.string().optional().describe("Short on-screen words (marketing scenes)"),
    },
  },
  safe(async ({ project: id, scene: which, narration, headline, words }: { project: string; scene: number | string; narration?: string; headline?: string; words?: string }) => {
    const project = await call<Project>("GET", `/api/projects/${id}`);
    const index = typeof which === "number" ? which - 1 : project.scenes.findIndex((scene) => scene.id === which);
    const scene = project.scenes[index];
    if (!scene) throw new Error(`No scene ${which}; the video has ${project.scenes.length}.`);
    if (narration !== undefined) scene.narration = narration;
    if (headline !== undefined) scene.visual.headline = headline;
    if (words !== undefined) scene.visual.words = words;
    const saved = await call<Project>("PUT", `/api/projects/${id}`, { scenes: project.scenes });
    const after = saved.scenes[index];
    return { saved: true, scene: index + 1, narration: after.narration, visual: { headline: after.visual.headline, words: after.visual.words }, needsVoice: after.voiceCurrent === false };
  }),
);

server.registerTool(
  "update_preview",
  {
    title: "Voice and build the preview",
    description: "Records the voice for changed scenes, draws missing pictures and builds the animated preview. Costs a little AI credit. Returns a job.",
    inputSchema: { project: z.string(), wait: WAIT },
  },
  safe(async ({ project, wait }: { project: string; wait?: number }) => {
    const job = await call<Job>("POST", `/api/projects/${project}/build`, { images: true });
    return { ...jobView(wait ? await waitFor(job.id, wait) : job), preview: `${STUDIO}/projects/${project}` };
  }),
);

server.registerTool(
  "render",
  {
    title: "Render the video",
    description: "Renders the mp4 (update_preview first if scenes changed). draft is fast for checking timing; high is the version to post. Returns a job; when done, get_project gives the video's path.",
    inputSchema: { project: z.string(), quality: z.enum(["draft", "standard", "high"]).optional().describe("Default high"), wait: WAIT },
  },
  safe(async ({ project, quality, wait }: { project: string; quality?: "draft" | "standard" | "high"; wait?: number }) => {
    const job = await call<Job>("POST", `/api/projects/${project}/render`, { quality: quality ?? "high" });
    const done = wait ? await waitFor(job.id, wait) : job;
    return { ...jobView(done), ...(done.status === "done" ? { files: files(await call<Project>("GET", `/api/projects/${project}`)) } : {}) };
  }),
);

server.registerTool(
  "job_status",
  { title: "Check a job", description: "A job's status, current step, cost and latest log lines. Can wait for it to finish.", inputSchema: { job: z.string(), wait: WAIT } },
  safe(async ({ job, wait }: { job: string; wait?: number }) => jobView(wait ? await waitFor(job, wait) : await call<Job>("GET", `/api/jobs/${job}`))),
);

server.registerTool(
  "project_cost",
  { title: "What a video cost", description: "Every AI call a video used (script, voice, pictures, art) and the total in US dollars.", inputSchema: { project: z.string() } },
  safe(async ({ project }: { project: string }) => {
    const { summary } = await call<{ summary: unknown }>("GET", `/api/projects/${project}/usage`);
    return summary;
  }),
);

await server.connect(new StdioServerTransport());
