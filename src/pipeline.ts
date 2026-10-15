import { execFile } from "node:child_process";
import { copyFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { copyBrand } from "./brand/brand.ts";
import { loadChannel } from "./config.ts";
import { assertLlmRunning } from "./llm.ts";
import { drawProject } from "./media/images.ts";
import { audioSeconds, voiceProject } from "./media/voice.ts";
import { loadProject, newProjectId, projectDir, saveProject } from "./project.ts";
import { buildComposition } from "./render/composition.ts";
import { buildExplainer } from "./render/explainer.ts";
import { buildMixedPreview, buildSegments } from "./render/mixed.ts";
import { addSoundtrack } from "./media/soundtrack.ts";
import { lookOf } from "./render/looks.ts";
import { buildWhiteboard, HAND_ASSET } from "./render/whiteboard.ts";
import { reviewScenes, toScenes, writeScript } from "./script/write.ts";
import { writeVersus } from "./script/versus.ts";
import { writeDeepDive } from "./script/deepdive.ts";
import { photoCredits, preparePhotos } from "./media/photos.ts";
import { buildDeepDive, deepChapters } from "./render/deepdive.ts";
import { prepareProducts } from "./media/products.ts";
import { buildVersus, chapters } from "./render/versus.ts";
import { renderThumbnail } from "./render/thumbnail.ts";
import type { FormatId, Project, StyleId } from "./types.ts";

const run = promisify(execFile);

export type Log = (message: string) => void;

/** Step 1: Bonsai writes the script into a new project. */
export async function createProject(channelId: string, format: FormatId, topic: string, style: StyleId = "motion", log: Log = console.log): Promise<Project> {
  const channel = loadChannel(channelId);
  if (style === "versus") return createVersus(channelId, format, topic, log);
  if (style === "deepdive") return createDeepDive(channelId, format, topic, log);
  await assertLlmRunning();

  log(`script: Bonsai is writing "${topic}" ...`);
  const draft = await writeScript(channel, format, topic);
  const now = new Date().toISOString();
  const project: Project = {
    id: newProjectId(channelId, format, topic),
    channel: channelId,
    format,
    style,
    topic,
    title: draft.title,
    description: draft.description,
    tags: draft.tags ?? [],
    scenes: toScenes(draft.scenes),
    createdAt: now,
    updatedAt: now,
  };

  await saveProject(project);
  log(`script: ${project.scenes.length} scenes saved as ${project.id}`);
  return project;
}

/** Step 1 for a versus video: researched on the web and written through the AI Gateway, not Bonsai. */
async function createVersus(channelId: string, format: FormatId, topic: string, log: Log): Promise<Project> {
  const draft = await writeVersus(loadChannel(channelId), format, topic, log);
  const now = new Date().toISOString();
  const project: Project = {
    id: newProjectId(channelId, format, topic),
    channel: channelId,
    format,
    style: "versus",
    topic,
    title: draft.title,
    description: draft.description,
    tags: draft.tags,
    versus: draft.versus,
    scenes: draft.scenes,
    createdAt: now,
    updatedAt: now,
  };
  await saveProject(project);
  log(`script: ${project.scenes.length} rounds saved as ${project.id}`);
  return project;
}

/** Step 1 for a deep dive: researched on the web and written through the AI Gateway, not Bonsai. */
async function createDeepDive(channelId: string, format: FormatId, topic: string, log: Log): Promise<Project> {
  const draft = await writeDeepDive(loadChannel(channelId), format, topic, log);
  const now = new Date().toISOString();
  const project: Project = {
    id: newProjectId(channelId, format, topic),
    channel: channelId,
    format,
    style: "deepdive",
    topic,
    title: draft.title,
    description: draft.description,
    tags: draft.tags,
    deepdive: draft.deepdive,
    scenes: draft.scenes,
    createdAt: now,
    updatedAt: now,
  };
  await saveProject(project);
  log(`script: ${project.scenes.length} chapters saved as ${project.id}`);
  return project;
}

const CHAPTERS = /\n*(?:⏱️ (?:Chapters|الفصول)\n)?(?:\d+:\d{2} .*(?:\n|$)){2,}/;

const CREDITS = /\n*(?:Photos|الصور):\n(?:- .*(?:\n|$))+/;

/**
 * Puts the chapter list (timed from the voice) into a versus or deep-dive
 * description, replacing an old one, and a deep dive's photo credits before
 * its hashtags.
 */
function withChapters(project: Project, arabic: boolean): string {
  const introLabel = arabic ? "المقدمة" : "Intro";
  const list = `⏱️ ${arabic ? "الفصول" : "Chapters"}\n${project.style === "deepdive" ? deepChapters(project, introLabel) : chapters(project, introLabel)}`;
  const base = project.description.replace(CHAPTERS, "\n").replace(CREDITS, "\n").trim();
  const [summary, ...rest] = base.split(/\n\n/);
  const credits = project.style === "deepdive" ? photoCredits(project, arabic) : "";
  if (credits) {
    // Credits go before the closing hashtags line, if there is one.
    const tail = rest.length && /^#/.test(rest.at(-1)!) ? rest.splice(-1) : [];
    rest.push(credits, ...tail);
  }
  return [summary, list, ...rest].join("\n\n");
}

/** Steps 2-3: voices and pictures for every scene that changed since last time. */
export async function prepareMedia(id: string, options: { images?: boolean } = {}, log: Log = console.log): Promise<Project> {
  const project = await loadProject(id);
  const channel = loadChannel(project.channel);
  const dir = projectDir(id);

  const voiced = await voiceProject(dir, project.scenes, channel);
  log(`voice: ${voiced} scene(s) spoken by ${channel.narrator ? "Gemini" : "ElevenLabs"}, ${project.scenes.length - voiced} unchanged`);
  await saveProject(project);

  if (project.versus) {
    const drawn = await prepareProducts(dir, project);
    if (drawn) log(`products: ${drawn} AI picture(s); upload real photos on the project page to replace them`);
    await saveProject(project);
  }

  if (project.style === "deepdive") {
    const found = await preparePhotos(dir, project, log);
    if (found) log(`photos: ${found} found; replace any on the project page`);
    await saveProject(project);
  }

  if ((options.images ?? true) && project.style !== "versus" && project.style !== "deepdive") {
    const drawn = await drawProject(dir, project.scenes, channel, project.format, (scene) => lookOf(project, scene));
    log(`pictures: ${drawn} drawn, ${project.scenes.length - drawn} unchanged`);
    await saveProject(project);
  }

  return project;
}

/** Step 4: writes index.html (the HyperFrames composition) and youtube.txt. */
export async function compose(id: string, log: Log = console.log): Promise<Project> {
  const project = await loadProject(id);
  const channel = loadChannel(project.channel);
  const dir = projectDir(id);
  await copyBrand(channel, dir);

  if (project.style === "versus" || project.style === "deepdive") {
    await writeFile(join(dir, "index.html"), project.style === "versus" ? buildVersus(project, channel) : buildDeepDive(project, channel));
    project.description = withChapters(project, channel.language === "ar");
    await saveProject(project);
    await renderThumbnail(project, channel, dir).then(
      () => log("compose: thumbnail.png drawn"),
      (error: unknown) => log(`compose: no thumbnail (${error instanceof Error ? error.message : error})`),
    );
  } else if (project.style === "mixed") {
    // One composition per run of same-look scenes; index.html only previews them.
    const segments = buildSegments(project, channel);
    if (segments.some((segment) => segment.look === "whiteboard")) await copyFile(HAND_ASSET, join(dir, "hand.png"));
    for (const segment of segments) await writeFile(join(dir, segment.file), segment.html);
    await writeFile(join(dir, "index.html"), buildMixedPreview(project, segments));
    log(`compose: ${segments.length} segments (${segments.map((segment) => segment.look).join(", ")})`);
  } else if (project.style === "whiteboard") {
    await copyFile(HAND_ASSET, join(dir, "hand.png"));
    await writeFile(join(dir, "index.html"), buildWhiteboard(project, { channel }));
  } else if (project.style === "explainer") {
    await writeFile(join(dir, "index.html"), buildExplainer(project, channel));
  } else {
    await writeFile(join(dir, "index.html"), buildComposition(project, channel));
  }
  const hashtags = project.style === "versus" || project.style === "deepdive" ? `Tags: ${project.tags.join(", ")}` : project.tags.map((tag) => `#${tag.replace(/\s+/g, "")}`).join(" ");
  await writeFile(join(dir, "youtube.txt"), `${project.title}\n\n${project.description}\n\n${hashtags}\n`);
  log("compose: index.html written");
  return project;
}

/** Step 5: HyperFrames renders index.html to video.mp4. */
export async function render(id: string, quality: "draft" | "standard" | "high" = "standard", log: Log = console.log): Promise<Project> {
  const dir = projectDir(id);
  const started = Date.now();

  const project = await loadProject(id);
  const hyperframes = (args: string[]) => run("npx", ["hyperframes", "render", ...args, "--quality", quality], { cwd: dir, maxBuffer: 256 * 1024 * 1024 });

  if (project.style === "mixed") {
    // Each segment renders on its own, then they are joined end to end.
    const segments = buildSegments(project, loadChannel(project.channel));
    for (const [index, segment] of segments.entries()) {
      log(`render: segment ${index + 1}/${segments.length} (${segment.look}, ${segment.duration.toFixed(1)}s) ...`);
      await hyperframes(["-c", segment.file, "--output", `run-${index + 1}.mp4`]);
    }
    const inputs = segments.flatMap((_, index) => ["-i", `run-${index + 1}.mp4`]);
    const joins = segments.map((_, index) => `[${index}:v][${index}:a]`).join("");
    await run(
      "ffmpeg",
      ["-v", "error", "-y", ...inputs, "-filter_complex", `${joins}concat=n=${segments.length}:v=1:a=1[v][a]`, "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "video-raw.mp4"],
      { cwd: dir, maxBuffer: 64 * 1024 * 1024 },
    );
  } else {
    log(`render: HyperFrames (${quality}) ...`);
    await hyperframes(["--output", "video-raw.mp4"]);
  }

  if (project.soundtrack !== false) {
    log("render: mixing music and sound effects ...");
    await addSoundtrack(project, join(dir, "video-raw.mp4"), join(dir, "video.mp4"));
  } else {
    await rename(join(dir, "video-raw.mp4"), join(dir, "video.mp4"));
  }

  const seconds = await audioSeconds(join(dir, "video.mp4"));
  project.render = { path: "video.mp4", seconds, renderedAt: new Date().toISOString() };
  await saveProject(project);
  log(`render: ${seconds.toFixed(1)}s video in ${Math.round((Date.now() - started) / 1000)}s`);
  return project;
}

/** Bonsai re-checks every claim; changed scenes keep their id so only they get re-voiced. */
export async function factCheck(id: string, log: Log = console.log): Promise<Project> {
  const project = await loadProject(id);
  const channel = loadChannel(project.channel);
  const drafts = project.scenes.map(({ narration, imagePrompt, visual }) => ({ narration, imagePrompt, visual }));
  const reviewed = await reviewScenes(channel, project.topic, drafts, "fact-check");
  let changed = 0;

  project.scenes.forEach((scene, index) => {
    const next = reviewed[index];
    if (JSON.stringify([scene.narration, scene.visual, scene.imagePrompt]) === JSON.stringify([next.narration, next.visual, next.imagePrompt])) return;
    Object.assign(scene, { narration: next.narration.trim(), visual: next.visual, imagePrompt: next.imagePrompt?.trim() ?? scene.imagePrompt });
    changed++;
  });

  await saveProject(project);
  log(`fact-check: ${changed} scene(s) changed`);
  return project;
}

/** Everything after the script, in order. */
export async function build(id: string, options: { images?: boolean; render?: boolean; quality?: "draft" | "standard" | "high" } = {}, log: Log = console.log): Promise<Project> {
  await prepareMedia(id, options, log);
  const project = await compose(id, log);
  return options.render === false ? project : render(id, options.quality, log);
}
