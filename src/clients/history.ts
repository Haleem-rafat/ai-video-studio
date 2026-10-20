import { listProjects } from "../project.ts";
import type { Project } from "../types.ts";
import { hostOf } from "./library.ts";
import { normalizeHook } from "./rules.ts";
import { listPosts, loadClient } from "./store.ts";
import type { Post, Slide } from "./types.ts";

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

function slideLines(slide: Slide): string[] {
  const s = slide as Record<string, unknown>;
  const out: string[] = [];
  for (const key of ["title", "subtitle", "label", "note", "myth", "fact", "text"]) if (typeof s[key] === "string") out.push(s[key] as string);
  for (const key of ["items", "steps", "before", "after"]) if (Array.isArray(s[key])) out.push(...(s[key] as string[]));
  return out;
}

function fromPost(post: Post): Made {
  const lines = (post.slides ?? []).flatMap(slideLines);
  return { id: post.id, kind: post.kind, title: lines[0] ?? post.caption.split("\n")[0], lines: [...lines.slice(1), post.caption.split("\n")[0]], artStyle: post.artStyle ?? "flat", createdAt: post.createdAt };
}

function fromProject(project: Project, kind: "reel" | "video"): Made {
  return {
    id: project.id,
    kind,
    title: project.title,
    lines: project.scenes.map((scene) => scene.narration),
    beats: project.scenes.map((scene) => (scene.visual as { beat?: string }).beat ?? scene.visual.type),
    voice: project.marketing?.narrator.voice,
    creativity: project.marketing?.creativity,
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
    ...posts.filter((post) => post.kind !== "reel" && post.status === "done").map(fromPost),
    ...projects.filter((project) => reels.has(project.id)).map((project) => fromProject(project, "reel")),
    ...projects.filter((project) => !reels.has(project.id) && host && project.marketing && hostOf(project.marketing.brand.url) === host).map((project) => fromProject(project, "video")),
  ];
  return made.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
