import { listProjects } from "../project.ts";
import type { Project } from "../types.ts";
import { hostOf } from "./library.ts";
import { normalizeHook } from "./rules.ts";
import { listPosts, loadClient } from "./store.ts";
import { textsOf } from "./arabic.ts";
import { DESIGN_IDS, type DesignChoice, type DesignId } from "./designs.ts";
import { FORMAT_IDS, formatForIdea, type FormatId } from "./formats.ts";
import type { Idea, Post, Slide } from "./types.ts";

/** Something already made for a client, reduced to what a new piece must not repeat. */
export type Made = {
  id: string;
  kind: "carousel" | "single" | "reel" | "video";
  title: string;
  /** Slide texts or narration sentences. */
  lines: string[];
  /** A video's scene beats, in order. */
  beats?: string[];
  voice?: string;
  creativity?: string;
  artStyle?: string;
  /** A carousel's post format, design and slide layouts in order. */
  format?: string;
  design?: string;
  layouts?: string[];
  /** A reel's style. */
  reelStyle?: string;
  /** The pictures it used: a carousel's picture prompts, a reel's planned subjects. */
  pictures?: string[];
  createdAt: string;
};

/** An idea at least this close to something made is a duplicate (overlap of its words). On Risero's history, ideas scored 0.49-0.95 against their own posts and at most 0.35 against anything else. */
export const DUPLICATE_AT = 0.42;
/** A sentence at least this close to an earlier video's sentence is a repeat. */
const SENTENCE_AT = 0.6;

const STOP = new Set([
  "the", "and", "for", "you", "your", "with", "that", "this", "from", "are", "not",
  "في", "من", "على", "إلى", "الى", "عن", "اللي", "علشان", "عشان", "بعد", "قبل", "كل", "مع", "لما", "انت", "إنت", "أنت", "كده", "دي", "ده", "هو", "هي", "إن", "ان", "أن", "لو",
]);

/** The meaningful words of a text: normalized, 3+ letters, no stop words. */
function words(text: string): Set<string> {
  return new Set(normalizeHook(text).split(" ").filter((word) => word.length >= 3 && !STOP.has(word)));
}

/** How alike two sentences are: shared words over all words (0-1). */
export function similarity(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const word of x) if (y.has(word)) shared++;
  return shared / (x.size + y.size - shared);
}

/** How much of the shorter text the longer one already says (0-1); short texts never count. */
function overlap(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  if (Math.min(x.size, y.size) < 6) return similarity(a, b);
  let shared = 0;
  for (const word of x) if (y.has(word)) shared++;
  return shared / Math.min(x.size, y.size);
}

const textOf = (made: Made) => [made.title, ...made.lines].join(" ");

/** The made piece a new text repeats, or null when its message is new. */
export function duplicateOf(text: string, history: Made[], threshold = DUPLICATE_AT): { made: Made; score: number } | null {
  let best: { made: Made; score: number } | null = null;
  for (const made of history) {
    const score = overlap(text, textOf(made));
    if (score >= threshold && (!best || score > best.score)) best = { made, score };
  }
  return best;
}

const sentences = (lines: string[]) =>
  lines
    .flatMap((line) => line.split(/(?<=[.!?؟…])\s+|\.{2,}|\n/))
    .map((sentence) => sentence.trim())
    .filter((sentence) => words(sentence).size >= 3);

const videosOf = (history: Made[]) => history.filter((made) => (made.kind === "reel" || made.kind === "video") && made.beats?.length);

/** What a reel draft repeats of the client's earlier videos, as instructions to fix it. Empty when it's new. */
export function reelProblems(draft: { beats: string[]; lines: string[] }, history: Made[]): string[] {
  const problems: string[] = [];
  const videos = videosOf(history);
  const recent = videos.slice(0, 2);
  if (draft.beats[0] && recent.some((video) => video.beats![0] === draft.beats[0])) problems.push(`It opens with a "${draft.beats[0]}" scene like the last reels; open with a different kind of scene.`);
  for (const video of videos) {
    const same = draft.beats.filter((beat, i) => video.beats![i] === beat).length;
    if (same / Math.max(draft.beats.length, video.beats!.length) >= 0.5) {
      problems.push(`Its scene order (${draft.beats.join(" → ")}) repeats "${video.title}" (${video.beats!.join(" → ")}); use other scene types in another order.`);
      break;
    }
  }
  const earlier = videos.flatMap((video) => sentences(video.lines));
  for (const sentence of sentences(draft.lines)) {
    if (earlier.some((old) => similarity(sentence, old) >= SENTENCE_AT)) problems.push(`The sentence «${sentence}» was already said in an earlier video; say something new.`);
  }
  return problems;
}

const VOICES = { male: ["Charon", "Orus"], female: ["Sulafat", "Kore", "Aoede"] } as const;

/** The next narrator after the last reel's, keeping the brief's voice gender. */
export function nextVoice(history: Made[], gender: "male" | "female" = "male"): string {
  const list = VOICES[gender];
  const last = videosOf(history).find((video) => video.voice)?.voice ?? history.find((made) => made.voice)?.voice;
  const index = list.indexOf(last as never);
  return list[(index + 1) % list.length];
}

/** Creative and bold take turns, so reels don't share one direction. */
export function nextCreativity(history: Made[]): "creative" | "bold" {
  const last = history.find((made) => made.kind === "reel" && made.creativity)?.creativity;
  return last === "creative" ? "bold" : "creative";
}

/** Every text on a slide, whatever its layout (questions, chat messages, both sides of a versus…). */
function slideLines(slide: Slide): string[] {
  return textsOf(slide).map((ref) => ref.get());
}

/** A made carousel or image as history: its texts, and the format, design and slide order it used. */
export function madeFromPost(post: Post): Made {
  const lines = (post.slides ?? []).flatMap(slideLines);
  return {
    id: post.id,
    kind: post.kind,
    title: lines[0] ?? post.caption.split("\n")[0],
    lines: [...lines.slice(1), post.caption.split("\n")[0]],
    artStyle: post.artStyle ?? "flat",
    ...(post.postFormat ? { format: post.postFormat } : {}),
    design: post.design ?? "classic",
    layouts: (post.slides ?? []).map((slide) => slide.layout),
    pictures: (post.slides ?? []).map((slide) => slide.art?.prompt).filter((prompt): prompt is string => Boolean(prompt)),
    createdAt: post.createdAt,
  };
}

/** A picture this close to one already used is a repeat (share of words, like `duplicateOf`). */
export const PICTURE_REPEAT_AT = 0.45;

/** The new picture prompts that repeat a picture already used. */
export function pictureRepeats(prompts: string[], used: string[]): string[] {
  return prompts.filter((prompt) => used.some((old) => similarity(prompt, old) >= PICTURE_REPEAT_AT));
}

/** "Rotate" for designs: one the recent posts haven't used, else the one used longest ago (history newest first). */
export function pickDesign(history: { design?: string }[]): DesignId {
  const recent = history.map((made) => made.design).filter(Boolean) as string[];
  const unused = DESIGN_IDS.find((id) => !recent.includes(id));
  if (unused) return unused;
  return [...DESIGN_IDS].sort((a, b) => recent.indexOf(b) - recent.indexOf(a))[0];
}

/** The design for a new post: the one chosen, or for Rotate one the recent carousels and images haven't used. */
export function chooseDesign(choice: DesignChoice | undefined, history: { kind: string; design?: string }[]): DesignId | undefined {
  if (choice !== "rotate") return choice;
  return pickDesign(history.filter((made) => made.kind === "carousel" || made.kind === "single"));
}

/**
 * "Auto" format, without repeats: the idea's own format unless one of the last
 * two carousels used it; else a format the recent carousels haven't used, or
 * the one used longest ago. Comment-to-get is only made when chosen by hand.
 */
export function autoFormat(idea: Pick<Idea, "angle">, history: { kind: string; format?: string }[]): FormatId | undefined {
  const recent = history.filter((made) => made.kind === "carousel").map((made) => made.format).filter(Boolean) as string[];
  const own = formatForIdea(idea);
  if (own && !recent.slice(0, 2).includes(own)) return own;
  const candidates = FORMAT_IDS.filter((id) => id !== "comment" && id !== own);
  return candidates.find((id) => !recent.includes(id)) ?? [...candidates].sort((a, b) => recent.indexOf(b) - recent.indexOf(a))[0];
}

/** A reel's or video's planned picture subjects: saved as they were planned, or read back from the drawn queries. */
function subjectsOf(project: Project): string[] {
  const art = project.marketing?.art;
  if (!art) return [];
  if (art.subjects?.length) return art.subjects;
  const plain = (query: string) => (art.style && query.includes(`. ${art.style}`) ? query.slice(0, query.indexOf(`. ${art.style}`)) : query).trim();
  const backdrops = project.scenes.map((scene) => (scene.visual as { backdrop?: { query?: string } }).backdrop?.query).filter((query): query is string => Boolean(query));
  return [...backdrops, ...art.cards.map((card) => card.query ?? "").filter(Boolean)].map(plain);
}

export function madeFromProject(project: Project, kind: "reel" | "video"): Made {
  return {
    id: project.id,
    kind,
    title: project.title,
    lines: project.scenes.map((scene) => scene.narration),
    beats: project.scenes.map((scene) => (scene.visual as { beat?: string }).beat ?? scene.visual.type),
    voice: project.marketing?.narrator.voice,
    creativity: project.marketing?.creativity,
    ...(project.marketing?.art?.style ? { artStyle: project.marketing.art.style } : {}),
    ...(project.marketing?.reelStyle ? { reelStyle: project.marketing.reelStyle } : {}),
    pictures: subjectsOf(project),
    createdAt: project.createdAt,
  };
}

/** Everything made for a client (posts, reels, its earlier marketing videos), newest first. */
export async function loadHistory(clientId: string): Promise<Made[]> {
  const client = await loadClient(clientId);
  const [posts, projects] = await Promise.all([listPosts(clientId), listProjects()]);
  const host = hostOf(client.url);
  const reels = new Set(posts.map((post) => post.projectId).filter(Boolean));
  const made = [
    ...posts.filter((post) => post.kind !== "reel" && post.status === "done").map(madeFromPost),
    ...projects.filter((project) => reels.has(project.id)).map((project) => madeFromProject(project, "reel")),
    ...projects.filter((project) => !reels.has(project.id) && host && project.marketing && hostOf(project.marketing.brand.url) === host).map((project) => madeFromProject(project, "video")),
  ];
  return made.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
