import { generateText, Output } from "ai";
import { z } from "zod";

import { sameLetters, spokenText } from "../media/spoken.ts";
import type { Scene } from "../types.ts";
import type { Client } from "./types.ts";

const MODEL = "anthropic/claude-sonnet-5.5";

/** Keys that hold ids, links, pictures or settings rather than words people read. */
const NOT_TEXT = new Set(["from", "id", "layout", "art", "url", "type", "beat", "imagePrompt", "image", "audio", "speech", "file", "prompt", "look", "imageSeed"]);
const ARABIC = /[ء-ي]/;

export type TextRef = { get: () => string; set: (text: string) => void };

/** Every text people read inside slides, scenes or captions, with a way to replace it. A `value` counts only when it is Arabic (else it is an icon word). */
export function textsOf(root: unknown): TextRef[] {
  const out: TextRef[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach((item, i) => (typeof item === "string" ? out.push({ get: () => node[i], set: (text) => void (node[i] = text) }) : walk(item)));
    } else if (node && typeof node === "object") {
      const record = node as Record<string, unknown>;
      for (const [key, value] of Object.entries(record)) {
        if (NOT_TEXT.has(key)) continue;
        if (typeof value === "string") {
          if (!value.trim() || (key === "value" && !ARABIC.test(value))) continue;
          out.push({ get: () => record[key] as string, set: (text) => void (record[key] = text) });
        } else walk(value);
      }
    }
  };
  walk(root);
  return out;
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

/** A fix is a fix when it keeps most of the words, or changes only a few letters; anything else is a rewrite and is refused. */
function isCorrection(before: string, after: string): boolean {
  if (before === after) return true;
  const x = new Set(before.split(/\s+/));
  const y = new Set(after.split(/\s+/));
  const shared = [...x].filter((word) => y.has(word)).length;
  return shared / Math.min(x.size, y.size) >= 0.5 || distance(before, after) / Math.max(before.length, after.length) <= 0.3;
}

export function acceptCorrections(before: string[], after: string[]): string[] {
  if (after.length !== before.length) return before;
  return before.map((text, i) => (isCorrection(text, after[i]) ? after[i] : text));
}

export function acceptMarks(before: string[], after: string[]): string[] {
  if (after.length !== before.length) return before;
  return before.map((text, i) => (sameLetters(text, after[i]) ? after[i] : text));
}

const LIST = z.object({ texts: z.array(z.string()) });

/**
 * Fixes real Arabic mistakes (spelling, hamza, ة/ه, ى/ي, wrong or broken words,
 * hashtags) in every text of `root`, in place. Egyptian colloquial stays.
 * Returns how many texts changed.
 */
export async function proofread(root: unknown, log: (message: string) => void): Promise<number> {
  const refs = textsOf(root);
  const before = refs.map((ref) => ref.get());
  if (!before.some((text) => ARABIC.test(text))) return 0;
  log(`proofread: checking ${before.length} texts ...`);
  const { output } = await generateText({
    telemetry: { functionId: "proofread" },
    model: MODEL,
    output: Output.object({ schema: LIST }),
    prompt: `You proofread Egyptian-Arabic Instagram marketing text. Egyptian colloquial words (إزاي، عايز، رسايل، ميعاد، أنهي) are CORRECT: keep them.
Fix only real mistakes: misspellings, wrong hamza (اصحاب → أصحاب), ة/ه, ى/ي, missing or extra letters, wrong or invented words, a sentence that does not make sense (make the smallest change that makes it clear), hashtags (correct spelling, words joined with _ , no #).
Never translate, never change brand names, numbers, links or English words, never restyle. Return the SAME number of texts, in the same order; unchanged texts exactly as given.

${JSON.stringify({ texts: before })}`,
  });
  const after = acceptCorrections(before, output.texts.map((text) => text.trim()));
  let changed = 0;
  refs.forEach((ref, i) => {
    if (after[i] !== before[i]) {
      changed++;
      ref.set(after[i]);
    }
  });
  if (changed) log(`proofread: fixed ${changed} text(s)`);
  return changed;
}

/**
 * Writes what the voice reads for each scene: brand names as the client says
 * them, numbers in Egyptian words, and vowel marks on words a voice misreads.
 * Marks that change any letter are dropped.
 */
export async function prepareSpeech(scenes: Scene[], client: Pick<Client, "language" | "pronounce">, log: (message: string) => void): Promise<void> {
  const plain = scenes.map((scene) => (client.language === "ar" ? spokenText(scene.narration, client.pronounce ?? {}) : scene.narration));
  let marked = plain;
  if (client.language === "ar") {
    log("speech: marking words a voice could misread ...");
    const { output } = await generateText({
      telemetry: { functionId: "speech" },
      model: MODEL,
      output: Output.object({ schema: LIST }),
      prompt: `These Egyptian-Arabic lines will be read by a text-to-speech voice that misreads words without vowel marks (it read «آراء» as «قراءة», «ميعادين يتداخلوا» as «مع عديني الدخل», «تنسيق» as «تنصيق»).
Add Arabic vowel marks (تشكيل) ONLY on the words a voice could misread, as an Egyptian speaker says them. Do not change, add or remove any letter, word or punctuation. Return the same number of lines in the same order.

${JSON.stringify({ texts: plain })}`,
    });
    marked = acceptMarks(plain, output.texts);
  }
  scenes.forEach((scene, i) => {
    scene.speech = { for: scene.narration, text: marked[i] };
  });
}
