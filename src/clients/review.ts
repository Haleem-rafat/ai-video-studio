import { generateText, Output } from "ai";
import { z } from "zod";

import type { Scene } from "../types.ts";
import { businessContext } from "./context.ts";
import { textsOf } from "./arabic.ts";
import type { Client, Idea, ScriptReview, Slide } from "./types.ts";

const MODEL = "anthropic/claude-sonnet-5.5";
const PASS = 4;

/** True when a review asks for a rewrite (any score under 4); a missing review never does. */
export function needsRewrite(review: Omit<ScriptReview, "rewritten"> | null): boolean {
  return Boolean(review && (review.understand < PASS || review.feel < PASS || review.truthful < PASS));
}

/** Slides or scenes as numbered lines a reviewer can read. */
export function scriptOf(input: { slides?: Slide[]; scenes?: Scene[] }): string {
  if (input.scenes) {
    return input.scenes
      .map((scene, i) => {
        const shown = textsOf(scene.visual).map((ref) => ref.get());
        return `${i + 1}. ${scene.narration}${shown.length ? ` (on screen: ${shown.join(" · ")})` : ""}`;
      })
      .join("\n");
  }
  return (input.slides ?? []).map((slide, i) => `${i + 1}. ${textsOf(slide).map((ref) => ref.get()).join(" · ")}`).join("\n");
}

const REVIEW = z.object({
  understand: z.number().int().min(1).max(5).describe("Would a customer who never heard of the product understand what it does and how it works for them?"),
  feel: z.number().int().min(1).max(5).describe("Would the target customer feel 'this is about me' — their situation, their words, their worry?"),
  truthful: z.number().int().min(1).max(5).describe("Is every claim supported by the client knowledge (no invented features, numbers or results)?"),
  notes: z.array(z.string()).describe("Concrete fixes for anything under 5: which slide or scene, what to change"),
});

/** Scores a script against the client's knowledge; null when the check itself fails (the post goes on). */
export async function reviewScript(client: Client, input: { kind: "carousel" | "single" | "reel"; idea: Idea; script: string; sell?: boolean }, log: (message: string) => void): Promise<Omit<ScriptReview, "rewritten"> | null> {
  try {
    log("review: checking the script against the client knowledge ...");
    const { output } = await generateText({
      telemetry: { functionId: "review" },
      model: MODEL,
      output: Output.object({ schema: REVIEW }),
      prompt: `You are the client's demanding marketing lead. Review this Instagram ${input.kind} script for ${client.name} before money is spent producing it. Score 1-5 honestly; 4 means good enough to publish.

THE IDEA: ${input.idea.hook} (goal ${input.idea.goal}${input.idea.persona ? `, for ${input.idea.persona}` : ""})
${input.sell === false ? `\nTHIS IS VALUE CONTENT, NOT AN AD: it must teach one practical thing and never pitch the product. Score "understand" as: would a viewer get the one takeaway and know how to apply it today? Score "truthful" low if it names the brand before the last frame, walks through the product's features, or invents facts. Never ask it to explain the product.\n` : ""}
${businessContext(client, "review") || `WHAT THE CLIENT SELLS\n${client.brand.summary}\nFeatures: ${client.brief.features.join(" | ")}\nAudience: ${client.brief.audience}`}

THE SCRIPT
${input.script}`,
    });
    log(`review: understand ${output.understand}/5, feels personal ${output.feel}/5, true ${output.truthful}/5`);
    return output;
  } catch (error) {
    log(`review: skipped (${error instanceof Error ? error.message : error})`);
    return null;
  }
}

/** The reviewer's notes as instructions for one rewrite. */
export function rewriteNotes(review: Omit<ScriptReview, "rewritten">, sell = true): string {
  if (!sell) return `\n\nA REVIEWER SCORED YOUR FIRST DRAFT: takeaway clear ${review.understand}/5, feels personal ${review.feel}/5, true and not an ad ${review.truthful}/5. Fix all of this:\n${review.notes.map((note) => `- ${note}`).join("\n")}\nWrite it again so the viewer gets one practical takeaway, feels it is about them, and nothing pitches the product.`;
  return `\n\nA REVIEWER SCORED YOUR FIRST DRAFT: understand ${review.understand}/5, feels personal ${review.feel}/5, true ${review.truthful}/5. Fix all of this:\n${review.notes.map((note) => `- ${note}`).join("\n")}\nWrite it again so a customer understands how the product works for them, feels it is about them, and every claim is in the client knowledge.`;
}
