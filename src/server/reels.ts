import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { promisify } from "node:util";

const runExec = promisify(execFile);

import { cleanError, loadChannel, OUTPUT_DIR } from "../config.ts";
import { reportProgress } from "../progress.ts";
import { canBeWide, checkReel, isStory, LOOK_STYLES, linesKey, listReels, loadReel, newReel, REEL_STYLES, reelDir, saveReel, speedOf, styleJob, voiceIsCurrent, type Reel, type ReelOptions, type ReelStyle } from "../reels/store.ts";
import { writeReel } from "../reels/write.ts";
import { clientVoice, loadClientNow, ownerOf, writeClientReel } from "../reels/client.ts";
import { renderReel } from "../../reels/render.mjs";
import { takeName, voiceLines } from "../../reels/voice.mjs";
import { rawBody } from "./body.ts";
import type { Ctx } from "./clients.ts";
import { enqueue } from "./jobs.ts";
import { readUsage, summarize } from "../usage.ts";
import { uploadVideo, type Privacy } from "../publish/youtube.ts";
import type { Project } from "../types.ts";

/** The narrator a reel is voiced with: the channel's (or client's), at the reel's speed. */
const narratorOf = (reel: Reel) => {
  const narrator = ownerOf(reel).narrator;
  return narrator ? { ...narrator, speed: speedOf(reel) } : undefined;
};

/**
 * A reel as the app sees it: whether its voice still matches its lines, what it has cost so far
 * (US dollars), and each line's spoken take (a file in its folder) when it has one.
 */
const shown = async (reel: Reel) => {
  const narrator = narratorOf(reel);
  const takes = reel.lines.map((line) => {
    const file = narrator && line.trim() ? `audio/${takeName(narrator, line)}` : null;
    return file && existsSync(join(reelDir(reel.id), file)) ? file : null;
  });
  const allTakesReady = reel.lines.every((line, i) => !line.trim() || Boolean(takes[i]));
  return { ...reel, ...(reel.error ? { error: cleanError(reel.error) } : {}), voiceCurrent: voiceIsCurrent(reel) && allTakesReady, takes, cost: (await readUsage(reelDir(reel.id))).reduce((sum, entry) => sum + entry.cost, 0) };
};

/** A reel's page in the studio. */
const reelPage = (id: string) => `/reels/${id}`;

/** Largest picture or clip that can be added to a reel. */
const MAX_MEDIA = 60 * 1024 * 1024;
const MEDIA_TYPES = [".jpg", ".jpeg", ".png", ".webp", ".mp4", ".mov"];

/** A job on a reel: its costs go to the reel's folder, and the job links to its page. */
const reelJob = (id: string, label: string, work: (log: (message: string) => void) => Promise<unknown>) =>
  Object.assign(enqueue(label, work, undefined, () => reelDir(id)), { link: reelPage(id) });

/** Queues writing (or re-writing after a failure) a channel or client reel. */
function queueWriteReel(reel: Reel) {
  const client = reel.client ? loadClientNow(reel.client.id) : undefined;
  const channel = client ? undefined : loadChannel(reel.channel);
  const label = client ? `Write ${client.name} reel: ${reel.topic}` : `Write reel: ${reel.topic}`;
  return reelJob(reel.id, label, async (log) => {
    try {
      const written = client ? await writeClientReel(reel, client, log) : await writeReel(reel, channel!, log);
      await saveReel({ ...written, status: "ready", error: undefined });
    } catch (error) {
      const clean = cleanError(error);
      await saveReel({ ...(await loadReel(reel.id)), status: "failed", error: clean });
      throw error;
    }
    return reel.id;
  });
}

/** Voices the reel's lines unless the voice already matches them. */
async function ensureVoice(reel: Reel, log: (message: string) => void, remuxVideo = false): Promise<Reel> {
  const channel = ownerOf(reel);
  const narrator = narratorOf(reel);
  if (!narrator) throw new Error(`${channel.name} has no Gemini narrator`);
  const allTakesExist = reel.lines.every((line) => !line.trim() || existsSync(join(reelDir(reel.id), "audio", takeName(narrator, line))));
  if (voiceIsCurrent(reel) && allTakesExist && !remuxVideo) return reel;
  const timing = await voiceLines(reelDir(reel.id), reel.lines, narrator, { language: channel.language ?? "ar", log });
  const seconds = timing.at(-1)!.end;
  const dialect = reel.options?.dialect ?? reel.client?.dialect;
  const dir = reelDir(reel.id);
  const videoPath = join(dir, "video.mp4");
  const voicePath = join(dir, "voice.mp3");
  let nextRender = reel.render;
  if (remuxVideo && existsSync(videoPath) && existsSync(voicePath)) {
    const tmpPath = join(dir, "video-remux.mp4");
    try {
      await runExec("ffmpeg", [
        "-v", "error", "-y",
        "-i", videoPath,
        "-i", voicePath,
        "-filter_complex", "[1:a]loudnorm=I=-14:TP=-1.5:LRA=11[a]",
        "-map", "0:v:0", "-map", "[a]",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
        "-movflags", "+faststart",
        tmpPath,
      ]);
      await rename(tmpPath, videoPath);
      nextRender = { file: "video.mp4", seconds: seconds + 1.8, at: new Date().toISOString() };
      log("voice: updated video.mp4 audio track immediately");
    } catch {
      // Ignore remux error if video.mp4 is currently being written by full render
    }
  }
  const latest = await loadReel(reel.id);
  return saveReel({
    ...latest,
    voice: { of: linesKey(reel.lines, speedOf(reel)), seconds, at: new Date().toISOString(), voice: narrator.voice, ...(dialect ? { dialect } : {}) },
    ...(nextRender ? { render: nextRender } : {}),
  });
}

/** Writes the renderer's JSON for the reel and returns its path. */
async function writeJob(reel: Reel): Promise<string> {
  const problem = checkReel(reel);
  if (problem) throw new Error(problem);
  const file = join(reelDir(reel.id), `${reel.style}.json`);
  await writeFile(file, `${JSON.stringify(styleJob(reel, ownerOf(reel)), null, 1)}\n`);
  return file;
}

/** A few moments to look at: a second into lines spread over the reel. */
async function previewTimes(reel: Reel): Promise<number[]> {
  const timing = JSON.parse(await readFile(join(reelDir(reel.id), "timing.json"), "utf8")) as { start: number; end: number }[];
  const picks = [0, 0.2, 0.4, 0.6, 0.8, 1].map((at) => timing[Math.round(at * (timing.length - 1))]);
  return [...new Set(picks.map((line) => +Math.min(line.end, line.start + 1.6).toFixed(1)))];
}

/** Applies the app's edits; only the editable parts change. */
function edited(reel: Reel, edits: Partial<Reel>): Reel {
  const next = { ...reel };
  if (typeof edits.title === "string") next.title = edits.title.trim() || reel.title;
  // Empty lines are kept (other settings point at lines by number); a render refuses them.
  if (Array.isArray(edits.lines)) next.lines = edits.lines.map((line) => String(line).trim());
  if (edits.rpg && reel.style === "rpg") next.rpg = edits.rpg;
  if (edits.news && reel.style === "news") next.news = edits.news;
  if (edits.proof && reel.style === "proof") next.proof = edits.proof;
  if (edits.kinetic && reel.style === "kinetic") next.kinetic = edits.kinetic;
  if (edits.story && isStory(reel.style)) next.story = edits.story;
  if (edits.options) {
    next.options = cleanOptions(edits.options);
    if (next.client && (next.options.voice || next.options.dialect)) {
      next.client = {
        ...next.client,
        ...(next.options.voice ? { voice: next.options.voice } : {}),
        ...(next.options.dialect ? { dialect: next.options.dialect } : {}),
      };
    }
  }
  if (edits.client && next.client) {
    next.client = {
      ...next.client,
      ...(typeof edits.client.voice === "string" && edits.client.voice.trim() ? { voice: edits.client.voice.trim() } : {}),
      ...(edits.client.dialect === "egyptian" || edits.client.dialect === "gulf" ? { dialect: edits.client.dialect } : {}),
    };
  }
  if (edits.youtube) next.youtube = edits.youtube;
  return next;
}

/** Per-reel options as the app sent them, kept in range. */
function cleanOptions(input: ReelOptions): ReelOptions {
  const out: ReelOptions = {};
  if (typeof input.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(input.accent)) out.accent = input.accent;
  if (input.music === false) out.music = false;
  if (typeof input.musicGain === "number" && Number.isFinite(input.musicGain)) out.musicGain = Math.min(1.5, Math.max(0, input.musicGain));
  if (typeof input.speed === "number" && Number.isFinite(input.speed) && input.speed !== 1) out.speed = Math.round(Math.min(1.3, Math.max(0.8, input.speed)) * 100) / 100;
  if (input.figmaBlue) out.figmaBlue = true;
  if (typeof input.voice === "string" && input.voice.trim()) out.voice = input.voice.trim();
  if (input.dialect === "egyptian" || input.dialect === "gulf") out.dialect = input.dialect;
  if (typeof input.voiceStyle === "string" && input.voiceStyle.trim()) out.voiceStyle = input.voiceStyle.trim().slice(0, 500);
  return out;
}

/** Reels whose job ended with the studio are marked failed, so they can be written again. */
export async function startReels(): Promise<void> {
  for (const reel of await listReels()) if (reel.status === "writing") await saveReel({ ...reel, status: "failed", error: "The studio stopped while it was written" });
}

/** Handles /api/reels… and /reel-files/…; false when the path is not one of them. */
export async function handleReels(ctx: Ctx): Promise<boolean> {
  const { path, method, request, response, json, body, fail } = ctx;
  let match: RegExpMatchArray | null;
  const load = async (id: string) =>
    loadReel(id).catch(() => {
      throw fail(404, `No reel "${id}"`);
    });

  if (path === "/api/reels" && method === "GET") {
    json(response, 200, await Promise.all((await listReels()).map(shown)));
    return true;
  }

  if (path === "/api/reels" && method === "POST") {
    const input = await body<{ channel?: string; client?: string; style?: string; topic?: string; shape?: string }>(request);
    const topic = input.topic?.trim();
    if (!topic) throw fail(400, "A topic is required.");
    if (!REEL_STYLES.includes(input.style as ReelStyle)) throw fail(400, `Style is one of ${REEL_STYLES.join(", ")}.`);
    // A client's reel: written from its brief and knowledge, in its colours and voice.
    if (input.client) {
      if (!LOOK_STYLES.includes(input.style as ReelStyle)) throw fail(400, `A client reel's style is one of ${LOOK_STYLES.join(", ")}.`);
      let client;
      try {
        client = loadClientNow(input.client);
      } catch {
        throw fail(404, `No client "${input.client}"`);
      }
      const voice = await clientVoice(client);
      const reel = await saveReel({ ...(await newReel(`client-${client.id}`, input.style as ReelStyle, topic)), client: { id: client.id, ...voice } });
      const job = queueWriteReel(reel);
      json(response, 202, { ...job, reelId: reel.id });
      return true;
    }
    const channel = loadChannel(input.channel ?? "");
    const shape = input.shape === "wide" && canBeWide(input.style as ReelStyle) ? "wide" : "tall";
    const reel = await newReel(channel.id, input.style as ReelStyle, topic, shape);
    const job = queueWriteReel(reel);
    json(response, 202, { ...job, reelId: reel.id });
    return true;
  }

  if ((match = path.match(/^\/api\/reels\/([a-z0-9-]+)$/))) {
    const id = match[1];
    if (method === "GET") {
      json(response, 200, await shown(await load(id)));
      return true;
    }
    if (method === "PUT") {
      const reel = await load(id);
      json(response, 200, await shown(await saveReel(edited(reel, await body<Partial<Reel>>(request)))));
      return true;
    }
    if (method === "DELETE") {
      await load(id);
      // Moved aside rather than deleted, in case it was a mistake.
      await mkdir(join(OUTPUT_DIR, ".trash"), { recursive: true });
      await rename(reelDir(id), join(OUTPUT_DIR, ".trash", `reel-${id}`));
      json(response, 200, { deleted: [id] });
      return true;
    }
  }

  // Every AI call made for the reel, like a video's cost tab.
  if ((match = path.match(/^\/api\/reels\/([a-z0-9-]+)\/usage$/)) && method === "GET") {
    const entries = await readUsage(reelDir((await load(match[1])).id));
    json(response, 200, { entries, summary: summarize(entries) });
    return true;
  }

  // A picture or clip for the news scenes, sent as the request body.
  if ((match = path.match(/^\/api\/reels\/([a-z0-9-]+)\/media$/)) && method === "POST") {
    const reel = await load(match[1]);
    const name = basename(ctx.url.searchParams.get("name") ?? "picture.jpg").replace(/[^\w.-]+/g, "-");
    if (!MEDIA_TYPES.includes(extname(name).toLowerCase())) throw fail(400, `Add a ${MEDIA_TYPES.join(", ")} file`);
    const bytes = await rawBody(request, MAX_MEDIA).catch((error: Error) => {
      throw fail(413, error.message);
    });
    let file = `media/${name}`;
    for (let n = 2; existsSync(join(reelDir(reel.id), file)); n++) file = `media/${basename(name, extname(name))}-${n}${extname(name)}`;
    await mkdir(join(reelDir(reel.id), "media"), { recursive: true });
    await writeFile(join(reelDir(reel.id), file), bytes);
    json(response, 201, await shown(await saveReel({ ...reel, media: [...reel.media, file] })));
    return true;
  }

  if ((match = path.match(/^\/api\/reels\/([a-z0-9-]+)\/(write|voice|preview|render)$/)) && method === "POST") {
    const [, id, action] = match;
    const reel = await load(id);
    if (action === "write") {
      const next = await saveReel({ ...reel, status: "writing", error: undefined });
      json(response, 202, queueWriteReel(next));
      return true;
    }
    if (reel.status !== "ready") throw fail(409, "The reel is still being written.");
    const problem = checkReel(reel);
    if (problem) throw fail(400, problem);
    const label = action === "voice" ? "Voice reel" : action === "preview" ? "Preview reel" : "Render reel";
    const job = reelJob(id, `${label}: ${reel.title}`, async (log) => {
      const voiced = await ensureVoice(await loadReel(id), log, action === "voice");
      if (action === "voice") return id;
      const file = await writeJob(voiced);
      if (action === "preview") {
        const files = await renderReel(file, { stills: await previewTimes(voiced), log });
        await saveReel({ ...(await loadReel(id)), stills: { files: files.map((path: string) => path.slice(reelDir(id).length + 1)), at: new Date().toISOString() } });
        return id;
      }
      await renderReel(file, { log, onProgress: (done: number, total: number) => reportProgress("render", done, total) });
      await saveReel({ ...(await loadReel(id)), render: { file: "video.mp4", seconds: voiced.voice!.seconds + 1.8, at: new Date().toISOString() } });
      return id;
    });
    json(response, 202, job);
    return true;
  }

  if ((match = path.match(/^\/api\/reels\/([a-z0-9-]+)\/publish$/)) && method === "POST") {
    const id = match[1];
    const reel = await load(id);
    const input = await body<{ privacy?: Privacy; publishAt?: string; force?: boolean }>(request);
    const privacy = input.privacy ?? "private";
    if (!["private", "unlisted", "public"].includes(privacy)) throw fail(400, "Privacy is private, unlisted or public.");
    if (input.publishAt !== undefined) {
      const at = Date.parse(input.publishAt);
      // YouTube rejects a publishAt that is not in the future.
      if (!Number.isFinite(at) || at < Date.now() + 5 * 60_000) throw fail(400, "Pick a publish time at least 5 minutes from now.");
    }
    const video = join(reelDir(id), reel.render?.file ?? "video.mp4");
    if (!reel.render || !existsSync(video)) throw fail(400, "Render the reel first.");
    if (reel.upload && !input.force) throw fail(409, `Already on YouTube: ${reel.upload.url}`);
    if (reel.client) throw fail(400, "A client's reel is posted on the client's Instagram, not uploaded to YouTube.");
    const channel = loadChannel(reel.channel);
    const label = input.publishAt ? `Upload to YouTube (scheduled ${new Date(input.publishAt).toLocaleString()})` : `Upload to YouTube (${privacy})`;
    const job = reelJob(id, `${label}: ${reel.title}`, async () => {
      const text = reel.youtube ?? { title: reel.title, description: "", tags: [] };
      // The upload reads a video's channel and text; a tall reel is a Short, a wide one a long video.
      const asVideo = { channel: reel.channel, format: reel.shape === "wide" ? "long" : "short", title: text.title, description: text.description, tags: text.tags } as unknown as Project;
      const upload = await uploadVideo(asVideo, video, { privacy, madeForKids: channel.madeForKids ?? false, publishAt: input.publishAt, language: channel.language ?? "en" });
      await saveReel({ ...(await loadReel(id)), upload });
      return upload.url;
    });
    json(response, 202, job);
    return true;
  }

  if ((match = path.match(/^\/reel-files\/([a-z0-9-]+)\/(.+)$/))) {
    await ctx.sendFile(request, response, ctx.inside(reelDir(match[1]), match[2]));
    return true;
  }

  return false;
}
