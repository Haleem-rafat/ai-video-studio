import { execFile, spawn } from "node:child_process";
import { copyFile, cp, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

import { copyBrand } from "./brand/brand.ts";
import { loadChannel, type Channel } from "./config.ts";
import { assertLlmRunning } from "./llm.ts";
import { drawProject } from "./media/images.ts";
import { audioSeconds, voiceProject } from "./media/voice.ts";
import { listProjects, loadProject, newProjectId, projectDir, saveProject } from "./project.ts";
import { buildComposition } from "./render/composition.ts";
import { buildExplainer } from "./render/explainer.ts";
import { buildMixedPreview, buildSegments } from "./render/mixed.ts";
import { addSoundtrack } from "./media/soundtrack.ts";
import { lookOf } from "./render/looks.ts";
import { buildWhiteboard, HAND_ASSET } from "./render/whiteboard.ts";
import { reviewScenes, toScenes, writeScript } from "./script/write.ts";
import { writeVersus } from "./script/versus.ts";
import { recentResearch, writeProsCons } from "./script/proscons.ts";
import { writeDeepDive } from "./script/deepdive.ts";
import { photoCredits, preparePhotos } from "./media/photos.ts";
import { buildDeepDive, deepChapters } from "./render/deepdive.ts";
import { prepareProducts } from "./media/products.ts";
import { fetchPressMedia } from "./media/press.ts";
import { buildVersus, chapters } from "./render/versus.ts";
import { buildArena } from "./render/arena.ts";
import { buildProsCons } from "./render/proscons.ts";
import { renderThumbnail } from "./render/thumbnail.ts";
import { buildMarketing } from "./render/marketing.ts";
import { loadSession, saveSession, sessionDir } from "./marketing/session.ts";
import { writeMarketing } from "./marketing/write.ts";
import { directArt, drawArt } from "./marketing/art.ts";
import { reportProgress } from "./progress.ts";
import { stillMoments } from "./media/motion.ts";
import { prepareProjectSpeech } from "./clients/speech.ts";
import { appendUsage, readUsage, recordLocal } from "./usage.ts";
import type { FormatId, Project, StyleId, VersusLook } from "./types.ts";

const run = promisify(execFile);

export type Log = (message: string) => void;

/** Gemini voices for a marketing video's narrator. */
export const MARKETING_VOICES = { male: "Charon", female: "Sulafat" } as const;

export const MARKETING_STYLE = {
  ar: "اقرأ باللهجة المصرية العامية، بصوت طبيعي وهادي وواثق، كأنك بتشرح فكرة لصاحب بيزنس، مش بتقرأ إعلان. إيقاع أسرع شوية في المشاكل، وأهدى عند الحل. انطق أسماء البراندات والمنصات بالإنجليزي.",
  en: "Read naturally, calm and confident, like explaining an idea to a business owner, not reading an ad. A little quicker through the problems, calmer at the solution.",
};

/** Marketing videos belong to no YouTube channel: this is their owner in project ids and lists. */
export const MARKETING_OWNER = "marketing";

/**
 * The channel a project is voiced and built with. A marketing video has
 * none of its own: one is made from its brand and brief, so nothing of a
 * YouTube channel (voice, logo, handle) leaks into a client's video.
 */
export function channelOf(project: Pick<Project, "channel" | "marketing">): Channel {
  const m = project.marketing;
  if (!m) return loadChannel(project.channel);
  const { brand, brief } = m;
  return {
    id: MARKETING_OWNER,
    name: brand.name,
    language: m.language,
    dialect: m.language === "ar" ? "Egyptian colloquial Arabic" : "English",
    // Marketing reads brisker than a channel's explainers: a calm voice at 1.15x keeps an ad moving.
    narrator: { provider: "gemini", voice: m.narrator.voice, style: m.narrator.style, speed: m.narrator.speed ?? 1.15 },
    audience: brief.audience,
    tone: brief.tone,
    voiceId: "",
    imageStyle: "",
    mascot: { kind: "robot", name: "" },
    colors: { background: brand.colors.background, panel: brand.colors.panel, text: brand.colors.text, accent: brand.colors.accent, muted: brand.colors.muted },
    font: brand.fonts.body,
  };
}

/** Step 1 for a marketing video: written from a finished chat; the website's screenshots move into the project. */
export async function createMarketing(sessionId: string, log: Log = console.log, only?: FormatId): Promise<Project> {
  const session = await loadSession(sessionId);
  if (!session.brand) throw new Error("The website hasn't been read yet");
  if (session.missing.length) throw new Error(`The brief still needs: ${session.missing.join(", ")}`);
  session.status = "writing";
  await saveSession(session);
  try {
    const { brand, brief, language } = session;
    const format: FormatId = only ?? (session.format === "long" ? "long" : "short");
    const creativity = session.creativity ?? "faithful";
    const draft = await writeMarketing({ brand, brief, script: session.script, language, format, creativity }, log);
    const now = new Date().toISOString();
    const project: Project = {
      id: newProjectId(MARKETING_OWNER, format, `${brand.name} marketing`),
      channel: MARKETING_OWNER,
      format,
      style: "marketing",
      topic: `Marketing video for ${brand.name} (${brand.url})`,
      title: draft.title,
      description: `${draft.caption}\n\n${draft.hashtags.map((tag) => `#${tag}`).join(" ")}`.trim(),
      tags: draft.hashtags,
      marketing: {
        brand,
        brief,
        creativity,
        language,
        narrator: { voice: MARKETING_VOICES[brief.voice || "male"], style: MARKETING_STYLE[language] },
        captions: Boolean(brief.captions),
        post: { caption: draft.caption, hashtags: draft.hashtags },
      },
      scenes: draft.scenes,
      createdAt: now,
      updatedAt: now,
    };
    await cp(join(sessionDir(sessionId), "shots"), join(projectDir(project.id), "shots"), { recursive: true });
    await saveProject(project);
    // What reading the website and the chat cost is part of what this video cost.
    await appendUsage(projectDir(project.id), (await readUsage(sessionDir(sessionId))).map((entry) => ({ ...entry, fromChat: true })));
    session.status = "done";
    session.projectId = project.id;
    await saveSession(session);
    log(`script: ${project.scenes.length} scenes saved as ${project.id}`);
    return project;
  } catch (error) {
    session.status = "chat";
    session.error = error instanceof Error ? error.message : String(error);
    await saveSession(session);
    throw error;
  }
}

/** Step 1: Bonsai writes the script into a new project. */
export async function createProject(channelId: string, format: FormatId, topic: string, style: StyleId = "motion", log: Log = console.log): Promise<Project> {
  const channel = loadChannel(channelId);
  if (style === "versus" || style === "arena" || style === "proscons") return createVersus(channelId, format, topic, style === "versus" ? "classic" : style, log);
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

/** Where a researched video keeps its notes, so later videos on the same products can reuse them. */
const RESEARCH_FILE = "research.md";

async function withResearch(projects: Project[]): Promise<(Project & { research?: string })[]> {
  return Promise.all(
    projects.map(async (project) => {
      const path = join(projectDir(project.id), RESEARCH_FILE);
      return existsSync(path) ? { ...project, research: await readFile(path, "utf8") } : project;
    }),
  );
}

/** Step 1 for a versus video: researched on the web and written through the AI Gateway, not Bonsai. */
async function createVersus(channelId: string, format: FormatId, topic: string, look: VersusLook, log: Log): Promise<Project> {
  // A pros-and-cons Short reuses a recent video's research on the same two products instead of searching again.
  const known = look === "proscons" ? recentResearch(await withResearch(await listProjects()), channelId, topic) : undefined;
  const draft = look === "proscons" ? await writeProsCons(loadChannel(channelId), format, topic, log, known) : await writeVersus(loadChannel(channelId), format, topic, log);
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
    versus: { ...draft.versus, look },
    scenes: draft.scenes,
    createdAt: now,
    updatedAt: now,
  };
  await saveProject(project);
  if ("research" in draft && typeof draft.research === "string") await writeFile(join(projectDir(project.id), RESEARCH_FILE), draft.research);
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
  const credits = photoCredits(project, arabic);
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
  const channel = channelOf(project);
  const dir = projectDir(id);

  // Arabic narration is spoken from its prepared text (English words in Arabic letters, numbers in words, vowel marks), never raw.
  await prepareProjectSpeech(project, log);
  const voiced = await voiceProject(dir, project.scenes, channel);
  log(`voice: ${voiced} scene(s) spoken by ${channel.narrator ? "Gemini" : "ElevenLabs"}, ${project.scenes.length - voiced} unchanged`);
  await saveProject(project);

  if (project.versus) {
    // Real press photos, footage and a cut-out product picture, looked for once per product.
    for (const side of ["a", "b"] as const) {
      const product = project.versus[side];
      if (product.pressAt) continue;
      const press = await fetchPressMedia(dir, product, side, log);
      const replace = press.image && product.imageSource !== "photo";
      project.versus[side] = {
        ...product,
        photos: [...(product.photos ?? []).filter((photo) => photo.source !== "press"), ...press.photos],
        clips: press.clips,
        ...(replace ? { image: press.image, imageSource: "photo" as const } : {}),
        pressAt: new Date().toISOString(),
      };
    }
    const drawn = await prepareProducts(dir, project);
    if (drawn) log(`products: ${drawn} AI picture(s); upload real photos on the project page to replace them`);
    await saveProject(project);
  }

  if (project.marketing) {
    // The video's own pictures: planned once, then drawn wherever one is missing.
    if (!project.marketing.art) {
      await directArt(project, log);
      await saveProject(project);
    }
    const drawn = await drawArt(dir, project, log);
    if (drawn) await saveProject(project);
  }

  if (project.style === "deepdive") {
    const found = await preparePhotos(dir, project, log);
    if (found) log(`photos: ${found} found; replace any on the project page`);
    await saveProject(project);
  }

  if ((options.images ?? true) && project.style !== "versus" && project.style !== "deepdive" && project.style !== "marketing") {
    const drawn = await drawProject(dir, project.scenes, channel, project.format, (scene) => lookOf(project, scene));
    log(`pictures: ${drawn} drawn, ${project.scenes.length - drawn} unchanged`);
    await saveProject(project);
  }

  return project;
}

/** Step 4: writes index.html (the HyperFrames composition) and youtube.txt. */
export async function compose(id: string, log: Log = console.log): Promise<Project> {
  const project = await loadProject(id);
  const channel = channelOf(project);
  const dir = projectDir(id);
  if (!project.marketing) await copyBrand(channel, dir);

  if (project.style === "marketing") {
    await writeFile(join(dir, "index.html"), buildMarketing(project));
    const post = project.marketing?.post;
    await writeFile(join(dir, "post.txt"), `${post?.caption ?? project.description}\n\n${(post?.hashtags ?? project.tags).map((tag) => `#${tag}`).join(" ")}\n`);
  } else if (project.style === "versus" || project.style === "deepdive") {
    const html = project.style === "deepdive" ? buildDeepDive(project, channel) : project.versus?.look === "arena" ? buildArena(project, channel) : project.versus?.look === "proscons" ? buildProsCons(project, channel) : buildVersus(project, channel);
    await writeFile(join(dir, "index.html"), html);
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
  const hashtags = project.style === "marketing" ? "" : project.style === "versus" || project.style === "deepdive" ? `Tags: ${project.tags.join(", ")}` : project.tags.map((tag) => `#${tag.replace(/\s+/g, "")}`).join(" ");
  await writeFile(join(dir, "youtube.txt"), `${project.title}\n\n${project.description}\n\n${hashtags}\n`);
  log("compose: index.html written");
  return project;
}

/** Step 5: HyperFrames renders index.html to video.mp4. */
export async function render(id: string, quality: "draft" | "standard" | "high" = "standard", log: Log = console.log): Promise<Project> {
  const dir = projectDir(id);
  const started = Date.now();

  const project = await loadProject(id);
  // HyperFrames prints "@hf-progress {"code":…,"pct":…}" lines: they drive the progress bar.
  const hyperframes = (args: string[], part = 0, parts = 1) =>
    new Promise<void>((resolve, reject) => {
      const child = spawn("npx", ["hyperframes", "render", ...args, "--quality", quality], { cwd: dir });
      let tail = "";
      const read = (chunk: Buffer) => {
        const text = tail + chunk.toString("utf8");
        const lines = text.split(/\r?\n/);
        tail = lines.pop() ?? "";
        for (const line of lines) {
          const match = line.match(/@hf-progress (\{.*\})/);
          if (!match) continue;
          const pct = Number((JSON.parse(match[1]) as { pct?: number }).pct ?? 0);
          reportProgress("render", Math.round(((part + pct / 100) / parts) * 100), 100);
        }
      };
      let errors = "";
      child.stdout.on("data", read);
      child.stderr.on("data", (chunk: Buffer) => {
        read(chunk);
        errors = (errors + chunk.toString("utf8")).slice(-4000);
      });
      child.on("error", reject);
      child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`HyperFrames stopped (${code}): ${errors.slice(-600)}`))));
    });

  if (project.style === "mixed") {
    // Each segment renders on its own, then they are joined end to end.
    const segments = buildSegments(project, loadChannel(project.channel));
    for (const [index, segment] of segments.entries()) {
      log(`render: segment ${index + 1}/${segments.length} (${segment.look}, ${segment.duration.toFixed(1)}s) ...`);
      await hyperframes(["-c", segment.file, "--output", `run-${index + 1}.mp4`], index, segments.length);
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

  reportProgress("render", 100, 100);
  if (project.soundtrack !== false) {
    log("mixing: music and sound effects ...");
    await addSoundtrack(project, join(dir, "video-raw.mp4"), join(dir, "video.mp4"));
  } else {
    await rename(join(dir, "video-raw.mp4"), join(dir, "video.mp4"));
  }

  const seconds = await audioSeconds(join(dir, "video.mp4"));
  // Moments where nothing moves lose viewers: they are found and named, never block the render.
  const stills = await stillMoments(join(dir, "video.mp4")).catch(() => []);
  const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  if (stills.length) log(`motion: ${stills.length} still moment(s), nothing moves at ${stills.map((still) => `${clock(still.from)}–${clock(still.to)}`).join(", ")}`);
  else log("motion: no still moments");
  project.render = { path: "video.mp4", seconds, renderedAt: new Date().toISOString(), ...(stills.length ? { stills } : {}) };
  recordLocal("render", `HyperFrames (${quality}, this Mac)`, Date.now() - started, { audioSeconds: seconds });
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
