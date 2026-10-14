import { execFile } from "node:child_process";
import { copyFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { loadChannel } from "./config.ts";
import { assertLlmRunning } from "./llm.ts";
import { drawProject } from "./media/images.ts";
import { audioSeconds, voiceProject } from "./media/voice.ts";
import { loadProject, newProjectId, projectDir, saveProject } from "./project.ts";
import { buildComposition } from "./render/composition.ts";
import { buildExplainer } from "./render/explainer.ts";
import { buildWhiteboard, HAND_ASSET } from "./render/whiteboard.ts";
import { reviewScenes, toScenes, writeScript } from "./script/write.ts";
import type { FormatId, Project, StyleId } from "./types.ts";

const run = promisify(execFile);

export type Log = (message: string) => void;

/** Step 1: Bonsai writes the script into a new project. */
export async function createProject(channelId: string, format: FormatId, topic: string, style: StyleId = "motion", log: Log = console.log): Promise<Project> {
  const channel = loadChannel(channelId);
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

/** Steps 2-3: voices and pictures for every scene that changed since last time. */
export async function prepareMedia(id: string, options: { images?: boolean } = {}, log: Log = console.log): Promise<Project> {
  const project = await loadProject(id);
  const channel = loadChannel(project.channel);
  const dir = projectDir(id);

  const voiced = await voiceProject(dir, project.scenes, channel.voiceId);
  log(`voice: ${voiced} scene(s) spoken by ElevenLabs, ${project.scenes.length - voiced} unchanged`);
  await saveProject(project);

  if (options.images ?? true) {
    const drawn = await drawProject(dir, project.scenes, channel, project.format, project.style);
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

  if (project.style === "whiteboard") {
    await copyFile(HAND_ASSET, join(dir, "hand.png"));
    await writeFile(join(dir, "index.html"), buildWhiteboard(project));
  } else if (project.style === "explainer") {
    await writeFile(join(dir, "index.html"), buildExplainer(project, channel));
  } else {
    await writeFile(join(dir, "index.html"), buildComposition(project, channel));
  }
  await writeFile(join(dir, "youtube.txt"), `${project.title}\n\n${project.description}\n\n${project.tags.map((tag) => `#${tag.replace(/\s+/g, "")}`).join(" ")}\n`);
  log("compose: index.html written");
  return project;
}

/** Step 5: HyperFrames renders index.html to video.mp4. */
export async function render(id: string, quality: "draft" | "standard" | "high" = "standard", log: Log = console.log): Promise<Project> {
  const dir = projectDir(id);
  const started = Date.now();

  log(`render: HyperFrames (${quality}) ...`);
  await run("npx", ["hyperframes", "render", "--output", "video.mp4", "--quality", quality], { cwd: dir, maxBuffer: 256 * 1024 * 1024 });

  const project = await loadProject(id);
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
