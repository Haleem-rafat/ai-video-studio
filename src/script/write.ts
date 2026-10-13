import { readFileSync } from "node:fs";
import { join } from "node:path";

import { FORMATS, ROOT, loadPrompt, type Channel } from "../config.ts";
import { chat, extractJson } from "../llm.ts";
import { VISUAL_TYPES, type FormatId, type Scene, type Visual } from "../types.ts";

type DraftScene = { narration: string; imagePrompt?: string; visual: Visual };

export type DraftScript = { title: string; description: string; tags: string[]; scenes: DraftScene[] };

type Outline = {
  title: string;
  description: string;
  tags: string[];
  hook: string;
  chapters: { heading: string; question: string; points: string[] }[];
};

const VISUALS = readFileSync(join(ROOT, "prompts", "visuals.md"), "utf8");

export function countWords(scenes: { narration: string }[]): number {
  return scenes.reduce((total, scene) => total + scene.narration.split(/\s+/).filter(Boolean).length, 0);
}

/** Problems with a set of scenes; empty means usable. */
export function checkScenes(scenes: DraftScene[], minWords: number, maxWords: number): string[] {
  if (!Array.isArray(scenes) || scenes.length < 3) return ["fewer than 3 scenes"];

  const problems: string[] = [];

  scenes.forEach((scene, index) => {
    if (!scene.narration?.trim()) problems.push(`scene ${index + 1} has no narration`);
    if (!VISUAL_TYPES.includes(scene.visual?.type)) problems.push(`scene ${index + 1} has visual "${scene.visual?.type}"`);
  });

  const words = countWords(scenes);
  // 10% slack: a slightly long or short script is still a fine video.
  if (words < minWords * 0.9 || words > maxWords * 1.1) problems.push(`${words} words, wanted ${minWords}-${maxWords}`);

  return problems;
}

/** Asks until the reply parses and passes `check`; logs every rejection. */
async function askUntilValid<T>(label: string, prompt: string, maxTokens: number, check: (value: T) => string[], attempts = 3): Promise<T> {
  let lastError = "";

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const started = Date.now();
    const reply = await chat(prompt, { maxTokens });
    const seconds = Math.round((Date.now() - started) / 1000);

    try {
      const value = extractJson<T>(reply);
      const problems = check(value);

      if (problems.length === 0) {
        console.log(`  ${label}: ok (${seconds}s${attempt > 1 ? `, attempt ${attempt}` : ""})`);
        return value;
      }

      lastError = problems.join("; ");
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    console.log(`  ${label}: attempt ${attempt} rejected (${seconds}s): ${lastError}`);
  }

  throw new Error(`${label}: nothing usable after ${attempts} attempts: ${lastError}`);
}

async function writeShort(channel: Channel, topic: string): Promise<DraftScript> {
  const format = FORMATS.short;
  const prompt = loadPrompt("script", {
    formatLabel: format.label,
    channelName: channel.name,
    audience: channel.audience,
    tone: channel.tone,
    topic,
    minWords: format.minWords,
    maxWords: format.maxWords,
    visuals: VISUALS,
  });

  const script = await askUntilValid<DraftScript>("script", prompt, 5000, (value) => [
    ...(value.title ? [] : ["missing title"]),
    ...checkScenes(value.scenes, format.minWords, format.maxWords),
  ]);

  return { ...script, scenes: await reviewScenes(channel, topic, script.scenes, "fact-check") };
}

/**
 * A second pass where Bonsai checks its own claims. Writing and checking in
 * one reply misses far more: the first draft states a wrong date as
 * confidently as a right one. Falls back to the draft if the review breaks it.
 */
export async function reviewScenes(channel: Channel, topic: string, scenes: DraftScene[], label: string): Promise<DraftScene[]> {
  const prompt = loadPrompt("review", {
    channelName: channel.name,
    topic,
    scenes: JSON.stringify(scenes.map((scene, index) => ({ scene: index + 1, ...scene })), null, 1),
  });
  const words = countWords(scenes);

  try {
    const reviewed = await askUntilValid<{ issues: string[]; scenes: DraftScene[] }>(label, prompt, 6000, (value) => [
      ...(value.scenes?.length === scenes.length ? [] : [`returned ${value.scenes?.length} scenes, expected ${scenes.length}`]),
      ...checkScenes(value.scenes, Math.round(words * 0.8), Math.round(words * 1.2)),
    ], 2);

    for (const issue of reviewed.issues ?? []) console.log(`    fixed: ${issue}`);

    return reviewed.scenes;
  } catch (error) {
    console.log(`  ${label}: kept the draft (${error instanceof Error ? error.message : error})`);
    return scenes;
  }
}

/**
 * A long script in one reply drifts and runs short, so it is planned first
 * and each part is written on its own against the shared outline.
 */
async function writeLong(channel: Channel, topic: string): Promise<DraftScript> {
  const base = { channelName: channel.name, audience: channel.audience, tone: channel.tone };
  const outline = await askUntilValid<Outline>("outline", loadPrompt("long-outline", { ...base, topic }), 4000, (value) =>
    Array.isArray(value.chapters) && value.chapters.length >= 4 && value.title ? [] : ["needs a title and at least 4 chapters"],
  );

  const outlineText = [`Hook: ${outline.hook}`, ...outline.chapters.map((chapter, index) => `${index + 1}. ${chapter.heading}: ${chapter.question} (${chapter.points.join("; ")})`)].join("\n");
  const { minWords, maxWords } = FORMATS.long;
  const hookWords = 60;
  const perChapter = Math.round((minWords + maxWords) / 2 - hookWords) / outline.chapters.length;
  const scenes: DraftScene[] = [];

  const parts = [
    { name: "the opening hook", brief: `Say this hook vividly, then promise what the viewer will learn: ${outline.hook}`, words: hookWords, scenes: "3-4", chapter: null },
    ...outline.chapters.map((chapter, index) => ({
      name: `chapter ${index + 1}, "${chapter.heading}"`,
      brief: `Answer: ${chapter.question}\nCover: ${chapter.points.join("; ")}`,
      words: Math.round(perChapter),
      scenes: `${Math.max(5, Math.round(perChapter / 22))}-${Math.round(perChapter / 16)}`,
      chapter: { number: index + 1, heading: chapter.heading },
    })),
  ];

  for (const [index, part] of parts.entries()) {
    const isLast = index === parts.length - 1;
    const min = Math.round(part.words * 0.85);
    const max = Math.round(part.words * 1.15);
    const prompt = loadPrompt("long-section", {
      ...base,
      title: outline.title,
      outline: outlineText,
      part: part.name,
      partBrief: part.brief,
      sceneCount: part.scenes,
      minWords: min,
      maxWords: max,
      ending: isLast ? "- This is the final part: give the payoff, one clear takeaway, then ask viewers to subscribe." : "- End with one sentence that makes the viewer want the next part.",
      visuals: VISUALS,
    });
    const section = await askUntilValid<{ scenes: DraftScene[] }>(`part ${index + 1}/${parts.length}`, prompt, 5000, (value) =>
      checkScenes(value.scenes, Math.round(min * 0.8), Math.round(max * 1.2)),
    );

    if (part.chapter) {
      // A chapter card opens every chapter; its narration is the heading itself.
      scenes.push({
        narration: `${part.chapter.heading}.`,
        imagePrompt: section.scenes[0]?.imagePrompt ?? "",
        visual: { type: "chapter", number: part.chapter.number, headline: part.chapter.heading },
      });
    }

    scenes.push(...(await reviewScenes(channel, topic, section.scenes, `fact-check ${index + 1}/${parts.length}`)));
  }

  console.log(`  long script: ${scenes.length} scenes, ${countWords(scenes)} words`);

  return { title: outline.title, description: outline.description, tags: outline.tags, scenes };
}

export async function writeScript(channel: Channel, format: FormatId, topic: string): Promise<DraftScript> {
  return format === "long" ? writeLong(channel, topic) : writeShort(channel, topic);
}

export function toScenes(draft: DraftScene[]): Scene[] {
  return draft.map((scene, index) => ({
    id: `s${String(index + 1).padStart(3, "0")}`,
    narration: scene.narration.trim(),
    visual: scene.visual,
    imagePrompt: scene.imagePrompt?.trim() ?? "",
  }));
}
