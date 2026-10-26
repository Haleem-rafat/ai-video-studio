import { generateText, Output } from "ai";
import { z } from "zod";

import type { Project, Scene } from "../types.ts";

/**
 * The words on screen follow the words spoken. A marketing scene's headline,
 * tags and cards are written with its narration; when the narration is edited
 * afterwards, they're rewritten to match it, in the same shape, before the
 * preview is rebuilt.
 */

const MODEL = "anthropic/claude-sonnet-5.5";

type MarketingScene = Scene & { visual: Extract<Scene["visual"], { type: "marketing" }> };
const isMarketing = (scene: Scene): scene is MarketingScene => scene.visual.type === "marketing";

/** Scenes whose screen text was written for other words than they now say (or never marked). */
export function staleScreenText(scenes: Scene[]): MarketingScene[] {
  return scenes.filter(isMarketing).filter((scene) => scene.visual.textFor !== scene.narration);
}

const SCREEN = z.object({
  scenes: z.array(
    z.object({
      id: z.string(),
      headline: z.string(),
      words: z.array(z.string()),
      items: z.array(z.object({ label: z.string(), value: z.string() })),
    }),
  ),
});
type Screen = z.infer<typeof SCREEN>["scenes"][number];

export function screenTextPrompt(scenes: MarketingScene[], language: string): string {
  return `You keep a short video's on-screen text in step with its voice-over. The voice-over of these scenes was edited; rewrite each scene's on-screen text so it says what the voice now says.
Language: ${language}. Every on-screen word in it.

Rules:
- Change only what the new voice-over contradicts or no longer says. Text that still fits stays exactly as it is.
- What you change uses the voice-over's own words, so a viewer reads what they hear: the headline and tags (words) are short phrases from it.
- Cards (items) keep their job in the beat: split cards are a before (label: the messy way) → after (value: the clean way) pair, and may name the before in plain words even when the voice only says the after; notify cards are a notification's title and detail; path and chaos cards are short stations or pieces; stat's one card is the number and its meaning.
- Keep the same number of tags and cards and about the same length: the layout is fixed.
- Numbers in digits, as the voice-over writes them.

${scenes
  .map(
    (scene) => `Scene ${scene.id} (beat: ${scene.visual.beat})
VOICE-OVER NOW: ${scene.narration}
OLD ON SCREEN: headline «${scene.visual.headline}» · tags ${JSON.stringify(scene.visual.words)} · cards ${JSON.stringify(scene.visual.items.map((item) => ({ label: item.label, value: item.value ?? "" })))}`,
  )
  .join("\n\n")}`;
}

/** Puts a rewritten screen text on its scene: never more tags or cards than it had, and marked as matching its narration. */
export function applyScreenText(scene: MarketingScene, screen: Omit<Screen, "id">): void {
  const items = screen.items
    .map((item) => ({ label: item.label.trim(), ...(item.value.trim() ? { value: item.value.trim() } : {}) }))
    .filter((item) => item.label)
    .slice(0, scene.visual.items.length);
  scene.visual.headline = screen.headline.trim() || scene.visual.headline;
  scene.visual.words = screen.words.map((word) => word.trim()).filter(Boolean).slice(0, Math.max(scene.visual.words.length, 1));
  scene.visual.items = scene.visual.items.length && !items.length ? scene.visual.items : items;
  scene.visual.textFor = scene.narration;
}

/** Rewrites the screen text of every marketing scene whose voice-over changed; returns how many. */
export async function syncScreenText(project: Project, log: (message: string) => void = console.log): Promise<number> {
  const stale = staleScreenText(project.scenes);
  if (!stale.length) return 0;
  log(`screen text: ${stale.length} scene(s) say new words, matching their on-screen text ...`);
  const language = project.marketing?.language === "ar" ? (project.marketing.dialect === "gulf" ? "Gulf colloquial Arabic" : "Egyptian colloquial Arabic") : "English";
  const { output } = await generateText({ telemetry: { functionId: "screen-text" }, model: MODEL, output: Output.object({ schema: SCREEN }), prompt: screenTextPrompt(stale, language) });
  for (const scene of stale) {
    const screen = output.scenes.find((entry) => entry.id === scene.id);
    if (screen) applyScreenText(scene, screen);
  }
  return stale.length;
}
