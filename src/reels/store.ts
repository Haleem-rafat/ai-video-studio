import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { OUTPUT_DIR, type Channel } from "../config.ts";

/**
 * A code-drawn reel (reels/): a 9:16 video in one of the reel styles, voiced
 * line by line. Its folder holds reel.json, media/, the voice and the videos;
 * the style JSON the renderer reads is written from it on each render.
 */
export type ReelStyle = "rpg" | "news" | "proof" | "kinetic" | "diagram" | "editorial" | "3d" | "aurora" | "variety" | "flat" | "sketch";
export const REEL_STYLES: readonly ReelStyle[] = ["rpg", "news", "proof", "kinetic", "diagram", "editorial", "3d", "aurora", "variety", "flat", "sketch"];
/** The styles drawn from a StoryReel (reels/lib/story.js). */
export const STORY_STYLES: readonly ReelStyle[] = ["diagram", "editorial", "3d", "aurora", "variety", "flat", "sketch"];
/** The story looks drawn by reels/lib/scenes.js (aurora glass, variety captions, flat vector, sketch notebook): they also draw point and chat scenes. */
export const LOOK_STYLES: readonly ReelStyle[] = ["aurora", "variety", "flat", "sketch"];
export const isStory = (style: ReelStyle) => STORY_STYLES.includes(style);

export type Expression = "talk" | "smile" | "wink";

/** RPG: a quest log that checks off as lines finish, and a talking pixel portrait. */
export type RpgReel = {
  level: number;
  /** `shirt` and `hairColor` override the preset's colours (reels/rpg/character.js). */
  character: { preset: "girl" | "guy"; name: string; shirt?: string; hairColor?: string };
  quests: { text: string; xp: number }[];
  /** One per line: the face while it is said, the word underlined, the quest checked when it ends. */
  subs: { line: number; expression: Expression; key: string; questIndex?: number }[];
};

export type NewsStat = { label: string; value: string; sub: string; count?: boolean };

/** Breaking news: scenes that each cover a few lines, with a picture, a headline and stat cards. */
export type NewsReel = {
  company: { name: string; glyph?: string; logo?: string };
  credit: string;
  source: string;
  date: string;
  scenes: { lines: [number, number]; media: string; headline: string; highlight: string; stats: NewsStat[] }[];
};

export type Pose = "point" | "think" | "wave";

/** Proof: real screenshots on top, the channel's character talking below, a hook card and a "comment the keyword" ask. */
export type ProofReel = {
  /** English hook card for the first 2 seconds; `highlight` sits on the blue bar. */
  hook: { title: string; highlight: string };
  /** What viewers comment to get the link. */
  keyword: string;
  scenes: { lines: [number, number]; media: string; url: string; stat?: { value: string; label: string } }[];
  /** One per line: the character's pose and the caption words drawn in the accent colour. */
  subs: { line: number; pose: Pose; keys: string[] }[];
  /** The character's pose pictures, in media/. */
  avatar: Record<Pose, string>;
};

export type KineticKind = "hook" | "text" | "chat" | "dm" | "browser" | "phone" | "counter" | "grid" | "cta";
export const KINETIC_KINDS: readonly KineticKind[] = ["hook", "text", "chat", "dm", "browser", "phone", "counter", "grid", "cta"];
export type CounterIcon = "eye" | "star" | "clock" | "dollar" | "users" | "download" | "bolt";

/**
 * Motion reel: kinetic typography over black with UI mockups (chat, DM, browser, phone), rolling
 * counters and a cursor that clicks; one key word per line in an italic serif inside a Figma-style
 * selection box. Mockup text comes from the reel's facts, pictures from media/.
 */
export type KineticReel = {
  /** What viewers comment to get the link (the CTA scene). */
  keyword: string;
  scenes: {
    lines: [number, number];
    kind: KineticKind;
    /** browser / phone: a picture in media/; browser: the address shown. */
    media?: string;
    url?: string;
    /** Window or chat title. */
    title?: string;
    /** chat / dm: the bubbles, alternating "you" then "reply". */
    messages?: string[];
    /** counter: a real number, its label and icon. */
    counter?: { value: string; label: string; icon: CounterIcon };
    /** grid: 3–6 short labels. */
    items?: string[];
    /** The button the cursor clicks, if any. */
    button?: string;
  }[];
  /** One per line: the word set in the serif selection box. */
  subs: { line: number; key: string }[];
};

export type StoryKind = "hook" | "photo" | "layers" | "touch" | "phone" | "timeline" | "quote" | "stamp" | "price" | "bars" | "specs" | "choice" | "follow" | "point" | "chat";
export const STORY_KINDS: readonly StoryKind[] = ["hook", "photo", "layers", "touch", "phone", "timeline", "quote", "stamp", "price", "bars", "specs", "choice", "follow", "point", "chat"];
/** Scene kinds only the 3D reel draws. */
export const ONLY_3D: readonly StoryKind[] = ["touch", "phone", "timeline"];
/** Scene kinds only the newer looks (LOOK_STYLES) draw. */
export const ONLY_LOOKS: readonly StoryKind[] = ["point", "chat"];
/** The iPhone bodies the 3D reel can build (reels/3d/phones.js), one per design generation. */
export const PHONE_MODELS = ["original", "3g", "4", "5", "6", "7", "x", "11", "11pro", "12", "13", "14pro", "15", "16", "17", "air", "17pro", "18pro", "duo"] as const;
export type PhoneModel = (typeof PHONE_MODELS)[number];

/** A reel's frame: 9:16 for Reels and Shorts, or 16:9 for a long YouTube video (3D reel). */
export type ReelShape = "tall" | "wide";

/**
 * Diagram, editorial and 3D reels: one picture idea per scene under the words being said.
 * Diagram: charcoal, a gold-punch headline, one big word at a time. Editorial: dark spotlight
 * stage and light grid paper, the line at the top with its key word selected. 3D: the diagram
 * look with its picture scenes in three.js (a MacBook or iPad with the photo on its screen, exploded
 * display layers, a finger touching a cut-through screen).
 */
export type StoryReel = {
  /** The opening headline (diagram); `highlight` is drawn in gold. */
  headline: { text: string; highlight: string };
  /** The channel's logo in media/, for the follow card. */
  logo?: string;
  scenes: {
    lines: [number, number];
    kind: StoryKind;
    /** A short caption: the photo's tag, the stamp's chip, the choice's question. */
    label?: string;
    /** hook / photo: a press picture in media/. */
    media?: string;
    /** 3D reel, hook / photo: the device the picture is shown on (laptop by default). */
    device?: "laptop" | "tablet";
    /** phone: the iPhone body built in 3D, its year and name; `media` is its real photo, `credit` the photo's author. */
    phone?: PhoneModel;
    year?: string;
    title?: string;
    credit?: string;
    /** layers: top to bottom, 2–6 short names. */
    layers?: string[];
    /** quote: a real line from a press page; `highlight` is part of `text`. */
    quote?: { source: string; text: string; highlight: string };
    stamp?: string;
    price?: { value: string; label: string };
    /** bars: 2–3 real numbers, the last one is the subject. */
    bars?: { label: string; value: number; shown: string }[];
    /** bars: the sticker on the chart, e.g. "+$900". */
    delta?: string;
    specs?: string[];
    choice?: [string, string];
    /** point: a big number or sign and one short sentence (a tip, a mistake in a countdown). */
    point?: { mark: string; text: string };
    /** chat: 2–4 bubbles, alternating the client then the reply; `title` names the chat. */
    messages?: string[];
  }[];
  /** One per line: the key word (gold in diagram, selected in editorial). */
  subs: { line: number; key: string }[];
  /** timeline: every stop on it, in order; a timeline scene lights its own `year`. */
  timeline?: { year: string; title: string; phone?: PhoneModel }[];
};

/** Per-reel choices over the channel's defaults. */
export type ReelOptions = {
  /** #rrggbb; the channel's accent when unset. */
  accent?: string;
  /** Background beat (news, proof); on unless false. */
  music?: boolean;
  /** Beat volume, 0–1.5 (default 0.55 news, 0.4 proof). */
  musicGain?: number;
  /** Voice speed, 0.8–1.3 (1 = as spoken); changing it voices every line again. */
  speed?: number;
  /** Motion reel: the Figma-blue selection box instead of the channel accent. */
  figmaBlue?: boolean;
  /** Narrator voice override (e.g. Charon, Orus, Fenrir, Puck, Zephyr, Laomedeia, Sulafat, Kore). */
  voice?: string;
  /** Dialect override for Arabic reels ("egyptian" | "gulf"). */
  dialect?: "egyptian" | "gulf";
  /** Custom voice style/direction instructions. */
  voiceStyle?: string;
};

export type Reel = {
  id: string;
  channel: string;
  /** A marketing client's reel (src/reels/client.ts): its brand, narrator and dialect stand in for the channel's. */
  client?: { id: string; voice: string; dialect?: "egyptian" | "gulf" };
  style: ReelStyle;
  /** Unset is tall (9:16). */
  shape?: ReelShape;
  topic: string;
  title: string;
  status: "writing" | "ready" | "failed";
  error?: string;
  createdAt: string;
  updatedAt?: string;
  /** What the narrator says, one entry per line (numbers as digits, names in English). */
  lines: string[];
  rpg?: RpgReel;
  news?: NewsReel;
  proof?: ProofReel;
  kinetic?: KineticReel;
  /** Diagram and editorial reels. */
  story?: StoryReel;
  options?: ReelOptions;
  /** Pictures and clips in media/, for the news scenes. */
  media: string[];
  youtube?: { title: string; description: string; tags: string[] };
  /** A client reel's Instagram caption and hashtags (without #). */
  instagram?: { caption: string; hashtags: string[] };
  /** The source pages the writer used. */
  sources?: string[];
  /** `of` is the lines' fingerprint: a voice of other lines is out of date. */
  voice?: { of: string; seconds: number; at: string; voice?: string; dialect?: string };
  stills?: { files: string[]; at: string };
  render?: { file: string; seconds: number; at: string };
  /** Set once uploaded; `scheduledFor` means it is private until YouTube publishes it then. */
  upload?: { videoId: string; url: string; privacy: "private" | "unlisted" | "public"; youtubeChannel: string; uploadedAt: string; scheduledFor?: string };
};

/** output/.reels, or REELS_DIR in tests. */
export const reelsDir = () => process.env.REELS_DIR ?? join(OUTPUT_DIR, ".reels");
export const reelDir = (id: string) => join(reelsDir(), id);

/** The repo's reels/ folder: the style pages, voice.mjs and render.mjs. */
export const REELS_CODE = join(import.meta.dirname, "..", "..", "reels");

const pad = (n: number) => String(n).padStart(2, "0");

export function reelIdFor(topic: string, at = new Date()): string {
  const stamp = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}${pad(at.getHours())}${pad(at.getMinutes())}`;
  const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `${stamp}-${slug || "reel"}`;
}

export async function saveReel(reel: Reel): Promise<Reel> {
  const saved = { ...reel, updatedAt: new Date().toISOString() };
  await mkdir(reelDir(reel.id), { recursive: true });
  // Written aside and moved, so a crash never leaves half a file.
  const file = join(reelDir(reel.id), "reel.json");
  await writeFile(`${file}.tmp`, `${JSON.stringify(saved, null, 2)}\n`);
  await rename(`${file}.tmp`, file);
  return saved;
}

export async function loadReel(id: string): Promise<Reel> {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`No reel "${id}"`);
  return JSON.parse(await readFile(join(reelDir(id), "reel.json"), "utf8")) as Reel;
}

/** Newest first. */
export async function listReels(): Promise<Reel[]> {
  if (!existsSync(reelsDir())) return [];
  const entries = await readdir(reelsDir(), { withFileTypes: true });
  const reels = await Promise.all(entries.filter((entry) => entry.isDirectory() && existsSync(join(reelDir(entry.name), "reel.json"))).map((entry) => loadReel(entry.name)));
  return reels.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function newReel(channel: string, style: ReelStyle, topic: string, shape: ReelShape = "tall"): Promise<Reel> {
  let id = reelIdFor(topic);
  for (let n = 2; existsSync(reelDir(id)); n++) id = `${reelIdFor(topic)}-${n}`;
  return saveReel({ id, channel, style, ...(shape === "wide" ? { shape } : {}), topic, title: topic, status: "writing", createdAt: new Date().toISOString(), lines: [], media: [] });
}

/** The lines' fingerprint (with the voice speed), to tell when the voice no longer matches them. */
export const linesKey = (lines: string[], speed = 1) => createHash("sha1").update(`${speed === 1 ? "" : `${speed}\n`}${lines.join("\n")}`).digest("hex").slice(0, 12);

/** The voice speed a reel is spoken at. */
export const speedOf = (reel: Reel) => Math.min(1.3, Math.max(0.8, reel.options?.speed ?? 1));

export const activeVoiceOf = (reel: Reel) => reel.options?.voice || reel.client?.voice;
export const activeDialectOf = (reel: Reel) => reel.options?.dialect || reel.client?.dialect;

export const voiceIsCurrent = (reel: Reel) => {
  if (!reel.voice || reel.voice.of !== linesKey(reel.lines, speedOf(reel)) || !existsSync(join(reelDir(reel.id), "voice.mp3"))) return false;
  const wantVoice = activeVoiceOf(reel);
  if (reel.voice.voice && wantVoice && reel.voice.voice !== wantVoice) return false;
  if (!reel.voice.voice && reel.options?.voice && reel.options.voice !== reel.client?.voice) return false;
  const wantDialect = activeDialectOf(reel);
  if (reel.voice.dialect && wantDialect && reel.voice.dialect !== wantDialect) return false;
  return true;
};

const HEX = /^#[0-9a-fA-F]{6}$/;

/** The channel's colours for a reel, with the reel's own accent over the channel's. */
export function brandOf(reel: Reel, channel: Channel) {
  const accent = reel.options?.accent && HEX.test(reel.options.accent) ? reel.options.accent : channel.colors.accent;
  return { ...channel.colors, accent, font: channel.font };
}

/** Keeps a line reference inside the reel's lines after lines were removed. */
const clampLine = (n: number, count: number) => Math.max(0, Math.min(count - 1, Math.round(n)));

/** The JSON the renderer reads for this reel (reels/README.md). */
export function styleJob(reel: Reel, channel: Channel): Record<string, unknown> {
  const count = reel.lines.length;
  const common = { style: reel.style, voice: "voice.mp3", tail: 1.8, out: "video.mp4", ...(reel.shape === "wide" ? { width: 1920, height: 1080 } : {}) };
  if (reel.style === "rpg") {
    const rpg = reel.rpg!;
    return {
      ...common,
      code: "rpg/rpg.js",
      channel: channel.name.split(/\s+-\s+/)[0].toUpperCase(),
      level: rpg.level,
      character: rpg.character,
      quests: rpg.quests,
      // Every line is on screen once; quests point at real quests.
      subs: reel.lines.map((_, line) => {
        const sub = rpg.subs.find((s) => s.line === line);
        const quest = sub?.questIndex;
        return { line, expression: sub?.expression ?? "talk", key: sub?.key ?? "", ...(quest !== undefined && quest >= 0 && quest < rpg.quests.length ? { questIndex: quest } : {}) };
      }),
    };
  }
  const handle = channel.brand?.handle ?? `@${channel.id}`;
  const music = reel.options?.music === false ? {} : { music: "beat", ...(reel.options?.musicGain !== undefined ? { musicGain: reel.options.musicGain } : {}) };
  const spans = <T extends { lines: [number, number] }>(scenes: T[]) =>
    scenes.map((scene) => {
      const a = clampLine(scene.lines[0], count), b = clampLine(scene.lines[1], count);
      return { ...scene, lines: [Math.min(a, b), Math.max(a, b)] };
    });
  if (reel.style === "proof") {
    const proof = reel.proof!;
    return {
      ...common,
      ...(reel.options?.music === false ? {} : { music: "beat", musicGain: reel.options?.musicGain ?? 0.4 }),
      handle,
      accent: brandOf(reel, channel).accent,
      hook: proof.hook,
      keyword: proof.keyword,
      avatar: proof.avatar,
      scenes: spans(proof.scenes.filter((scene) => scene.media)),
      subs: reel.lines.map((_, line) => {
        const sub = proof.subs.find((s) => s.line === line);
        return { line, pose: sub?.pose ?? (["point", "think", "wave"] as const)[line % 3], keys: sub?.keys ?? [] };
      }),
    };
  }
  if (reel.style === "kinetic") {
    const kinetic = reel.kinetic!;
    return {
      ...common,
      ...(reel.options?.music === false ? {} : { music: "beat", musicGain: reel.options?.musicGain ?? 0.45 }),
      handle,
      accent: reel.options?.figmaBlue ? "#3b82f6" : brandOf(reel, channel).accent,
      keyword: kinetic.keyword,
      scenes: spans(kinetic.scenes.filter((scene) => (scene.kind === "browser" || scene.kind === "phone" ? scene.media : true))),
      subs: reel.lines.map((_, line) => ({ line, key: kinetic.subs.find((s) => s.line === line)?.key ?? "" })),
    };
  }
  if (isStory(reel.style)) {
    const story = reel.story!;
    return {
      ...common,
      ...(reel.options?.music === false ? {} : { music: "beat", musicGain: reel.options?.musicGain ?? 0.4 }),
      handle,
      channel: channel.brand?.youtube?.title?.split(/\s+-\s+/)[0] ?? channel.name,
      accent: brandOf(reel, channel).accent,
      ...(reel.options?.figmaBlue ? {} : reel.style === "editorial" ? { select: brandOf(reel, channel).accent } : {}),
      ...(story.logo ? { logo: story.logo } : {}),
      ...(LOOK_STYLES.includes(reel.style) ? lookExtras(reel, channel) : {}),
      headline: story.headline,
      ...(story.timeline?.length ? { timeline: story.timeline } : {}),
      scenes: spans(story.scenes.filter((scene) => (scene.kind === "photo" ? scene.media : true))),
      subs: reel.lines.map((_, line) => ({ line, key: story.subs.find((s) => s.line === line)?.key ?? "" })),
    };
  }
  const news = reel.news!;
  return {
    ...common,
    ...music,
    brand: brandOf(reel, channel),
    handle,
    initial: handle.replace("@", "").slice(0, 1).toUpperCase(),
    company: news.company.logo ? { logo: news.company.logo } : news.company.glyph ? { glyph: news.company.glyph } : { name: news.company.name },
    credit: news.credit,
    source: news.source,
    date: news.date,
    scenes: spans(news.scenes.filter((scene) => scene.media)),
  };
}

/** Music and second colour of the newer looks: upbeat rhythm across all styles. */
function lookExtras(reel: Reel, channel: Channel): Record<string, unknown> {
  const cta = (channel.colors as { cta?: string }).cta;
  const music = reel.options?.music === false ? {} : { music: "beat", bpm: { aurora: 124, variety: 128, flat: 124, sketch: 120 }[reel.style as "aurora" | "variety" | "flat" | "sketch"] ?? 124, musicGain: reel.options?.musicGain ?? 0.25 };
  return { ...music, fxGain: 1.2, ...(cta ? { accent2: cta } : {}), ...(reel.client ? { handle: channel.brand?.handle ?? "", channel: channel.name } : {}) };
}

/** Only the 3D reel has a 16:9 layout. */
export const canBeWide = (style: ReelStyle) => style === "3d";

/** Each news or proof scene starts after the one before; the first starts at line 0 and the last ends on the last line. */
export function checkReel(reel: Reel): string | null {
  if (!reel.lines.length) return "The reel has no lines";
  const empty = reel.lines.findIndex((line) => !line.trim());
  if (empty >= 0) return `Line ${empty + 1} is empty`;
  if (reel.style === "news") {
    const scenes = reel.news?.scenes ?? [];
    if (!scenes.length) return "Add a scene";
    if (scenes.some((scene) => !scene.media)) return "Every scene needs a picture";
    for (let i = 1; i < scenes.length; i++) if (scenes[i].lines[0] <= scenes[i - 1].lines[0]) return `Scene ${i + 1} must start on a later line than scene ${i}`;
  }
  if (reel.style === "proof") {
    const scenes = reel.proof?.scenes ?? [];
    if (!scenes.length) return "Add a scene";
    if (scenes.some((scene) => !scene.media)) return "Every scene needs a picture";
    for (let i = 1; i < scenes.length; i++) if (scenes[i].lines[0] <= scenes[i - 1].lines[0]) return `Scene ${i + 1} must start on a later line than scene ${i}`;
    if (!reel.proof?.avatar.point) return "The reel has no character pictures";
  }
  if (reel.style === "kinetic") {
    const scenes = reel.kinetic?.scenes ?? [];
    if (!scenes.length) return "Add a scene";
    for (let i = 1; i < scenes.length; i++) if (scenes[i].lines[0] <= scenes[i - 1].lines[0]) return `Scene ${i + 1} must start on a later line than scene ${i}`;
    const missing = scenes.findIndex((scene) => (scene.kind === "browser" || scene.kind === "phone") && !scene.media);
    if (missing >= 0) return `Scene ${missing + 1} (${scenes[missing].kind}) needs a picture`;
  }
  if (isStory(reel.style)) {
    const scenes = reel.story?.scenes ?? [];
    if (!scenes.length) return "Add a scene";
    for (let i = 1; i < scenes.length; i++) if (scenes[i].lines[0] <= scenes[i - 1].lines[0]) return `Scene ${i + 1} must start on a later line than scene ${i}`;
    const missing = scenes.findIndex((scene) => scene.kind === "photo" && !scene.media);
    if (missing >= 0) return `Scene ${missing + 1} (photo) needs a picture`;
    const only3d = scenes.findIndex((scene) => ONLY_3D.includes(scene.kind) && reel.style !== "3d");
    if (only3d >= 0) return `Scene ${only3d + 1} (${scenes[only3d].kind}) is drawn only in the 3D reel`;
    const onlyLooks = scenes.findIndex((scene) => ONLY_LOOKS.includes(scene.kind) && !LOOK_STYLES.includes(reel.style));
    if (onlyLooks >= 0) return `Scene ${onlyLooks + 1} (${scenes[onlyLooks].kind}) is drawn only in the aurora, variety, flat and sketch reels`;
  }
  if (reel.style === "rpg" && !reel.rpg?.quests.length) return "Add a quest";
  return null;
}
