import { IDEA_GOALS, type Idea } from "./types.ts";

const CAPTION_LIMIT = 2200;
const MAX_HASHTAGS = 30;

/** Compares hooks: no case, punctuation, Arabic diacritics or extra spaces. */
export function normalizeHook(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** What a day's batch of ideas breaks of the rules, as sentences the writer can fix. Empty when it's fine. */
export function ideaProblems(ideas: Pick<Idea, "format" | "goal" | "angle" | "hook">[], pastHooks: string[], mode: "promo" | "value" | "mix" = "promo"): string[] {
  const problems: string[] = [];
  if (ideas.length !== 5) problems.push(`Write exactly 5 ideas (you wrote ${ideas.length}).`);
  if (!ideas.some((i) => i.format === "reel")) problems.push("At least 1 idea must be a reel.");
  if (ideas.filter((i) => i.format === "carousel").length < 2) problems.push("At least 2 ideas must be carousels.");
  // Value content never needs an offer; promo needs every goal.
  for (const goal of IDEA_GOALS) if ((mode === "promo" || goal !== "offer") && !ideas.some((i) => i.goal === goal)) problems.push(`At least 1 idea must have the goal "${goal}".`);

  const angles = new Map<string, number>();
  for (const idea of ideas) angles.set(idea.angle, (angles.get(idea.angle) ?? 0) + 1);
  for (const [angle, count] of angles) if (count > 1) problems.push(`The angle "${angle}" is used ${count} times; use each angle once.`);

  const past = new Set(pastHooks.map(normalizeHook));
  for (const idea of ideas) {
    if (idea.hook.length > 120) problems.push(`The hook "${idea.hook.slice(0, 40)}…" is over 120 characters.`);
    if (past.has(normalizeHook(idea.hook))) problems.push(`The hook "${idea.hook}" was already used in the last 14 days.`);
  }
  return problems;
}

/** Instagram hashtags: no "#", spaces become "_", no repeats (ignoring case), at most 30. */
export function cleanHashtags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.replace(/^#+/, "").trim().replace(/\s+/g, "_");
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag);
    if (out.length === MAX_HASHTAGS) break;
  }
  return out;
}

/** The text to paste into Instagram: caption, a blank line, hashtags; the caption is cut to fit 2,200 characters. */
export function captionText(caption: string, hashtags: string[]): string {
  const tags = cleanHashtags(hashtags).map((tag) => `#${tag}`).join(" ");
  const room = CAPTION_LIMIT - (tags ? tags.length + 2 : 0);
  const body = caption.trim().length > room ? `${caption.trim().slice(0, room - 1)}…` : caption.trim();
  return tags ? `${body}\n\n${tags}` : body;
}
