import { gateway, generateText, Output, stepCountIs } from "ai";
import { z } from "zod";

import type { Channel } from "../config.ts";
import type { FormatId, Product, Scene } from "../types.ts";

// Searches the web (Perplexity Search, run by the AI Gateway) until it has
// official specs for both, so nothing comes from a model's stale memory.
const RESEARCH_MODEL = "anthropic/claude-sonnet-5.5";
const WRITER_MODEL = "anthropic/claude-sonnet-5.5";

/**
 * What makes a title, description and tags work on YouTube search and
 * suggested videos: the searched words first, both names, a reason to click.
 */
export const SEO = {
  title:
    "YouTube title in the channel's language, 45-70 characters: the exact words people search (both product names in Latin script) in the first 40 characters, then a curiosity gap or bold claim; no clickbait the video doesn't pay off",
  description:
    "YouTube description in the channel's language: the first sentence (shown in search, under 150 characters) repeats the title's search words naturally; then a 2-line summary, the key points as bullets, a comment question, a subscribe line, and sources. No chapters (added later), no hashtags",
  tags: "Search phrases people type, 10-15: both names alone and together, 'X vs Y', the category (e.g. best laptop 2026), each in English and in the channel's language",
} as const;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const PRODUCT = z.object({
  name: z.string().describe("Full product name in Latin script, e.g. iPhone 18 Pro Max"),
  short: z.string().describe("A 2-3 word label for table headers, e.g. 18 Pro Max"),
  color: hex.describe("A signature colour of this product (a launch colour), readable on a dark background"),
});

const DRAFT = z.object({
  title: z.string().describe(SEO.title),
  description: z.string().describe(SEO.description),
  tags: z.array(z.string()).max(15).describe(SEO.tags),
  hashtags: z.array(z.string()).max(5).describe("Without #"),
  hook: z.string().describe("A 3-6 word on-screen hook for the intro, e.g. «الفرق $100 بس… يستاهل؟»"),
  thumbnail: z.object({
    headline: z.string().describe("2-3 huge words for the thumbnail, a question or bold claim"),
    highlight: z.string().describe("The one word of the headline drawn in the accent colour"),
    tag: z.string().describe("A tiny badge like +$100 or 2x, or empty"),
  }),
  a: PRODUCT,
  b: PRODUCT,
  sections: z
    .array(
      z.object({
        title: z.string().describe("Topic name on screen, 1-3 words; empty for the intro"),
        pose: z.enum(["point", "think", "wave"]),
        rows: z
          .array(z.object({ label: z.string().describe("What the row compares, 1-3 words, e.g. Battery, Price, GPU cores"), a: z.string(), b: z.string(), winner: z.enum(["a", "b", "none"]) }))
          .max(3)
          .describe("Spec rows, product A first; values under 30 characters, the number first when there is one (e.g. 6144 CUDA, 24h); winner gets a check mark, none when equal"),
        narration: z.string().describe("What the narrator says in this section"),
      }),
    )
    .min(4),
});

export type VersusDraft = {
  title: string;
  description: string;
  tags: string[];
  versus: { a: Product; b: Product; hook: string; thumbnail: { headline: string; highlight?: string; tag?: string } };
  scenes: Scene[];
};

/** What a section says, and the on-screen facts its numbers must match. */
export type Spoken = { narration: string; facts: string };

/**
 * A second read of the narration: numbers written out as words are easy to
 * get wrong (1,299 said as "one thousand three hundred…"), so every spoken
 * figure is checked against the rows and the research and corrected.
 */
export async function checkNumbers(sections: Spoken[], research: string, channel: Channel, log: (message: string) => void): Promise<string[]> {
  const { output } = await generateText({
    model: WRITER_MODEL,
    output: Output.object({ schema: z.object({ narrations: z.array(z.string()), fixes: z.array(z.string()) }) }),
    prompt: `Check these video narrations (${channel.dialect ?? channel.language ?? "English"}) number by number.
For every number, price, size or time the narrator says, confirm it equals the figure in that section's on-screen facts, or in the research when the facts don't have it.
Numbers must be written in digits ("$1,299", "45 ساعة"); rewrite any number spelled out in words as digits. Fix only wrong or spelled-out figures, keeping the dialect and wording otherwise identical. Return one narration per section, in order, and list each fix in "fixes" (empty when all correct).

Sections:
${sections.map((section, index) => `${index + 1}. on screen: ${section.facts || "none"}\n   narration: ${section.narration}`).join("\n")}

Research:
${research}`,
  });
  if (output.narrations.length !== sections.length) return sections.map((section) => section.narration);
  if (output.fixes.length) log(`script: fixed ${output.fixes.length} spoken number(s): ${output.fixes.join("; ")}`);
  const checked = sections.map((section, index) => ({ ...section, narration: output.narrations[index] || section.narration }));

  // A last mechanical pass: every figure in digits must appear in the rows or the research.
  const figures = (text: string) => (text.match(/\d[\d,.]*/g) ?? []).map((n) => n.replace(/[,.]$/, "").replace(/,/g, ""));
  const known = new Set(figures(research));
  checked.forEach((section, index) => {
    const rows = new Set(figures(section.facts));
    const unknown = figures(section.narration).filter((n) => !rows.has(n) && !known.has(n));
    if (unknown.length) log(`script: check section ${index + 1}, these numbers aren't in the research: ${unknown.join(", ")}`);
  });
  return checked.map((section) => section.narration);
}

/**
 * Splits "iPhone 17 Pro Max vs iPhone 18 Pro Max" (also "ضد", "ولا", "or").
 * A question after a colon is the angle of the video:
 * "Apple M5 vs Intel x86: why is M faster and why did Apple switch?"
 */
export function productsOf(topic: string): [string, string] | null {
  const [pair] = topic.split(":");
  const parts = pair.split(/\s+(?:vs\.?|versus|ضد|ولا|مقابل|or)\s+/i).map((part) => part.trim()).filter(Boolean);
  return parts.length === 2 ? [parts[0], parts[1]] : null;
}

const angleOf = (topic: string) => topic.split(":").slice(1).join(":").trim();

/**
 * Researches both products on the web, then writes a comparison in the
 * channel's language and dialect: an intro, one section per topic with spec
 * rows and a winner, and an honest verdict.
 */
export async function writeVersus(channel: Channel, format: FormatId, topic: string, log: (message: string) => void = console.log): Promise<VersusDraft> {
  const pair = productsOf(topic);
  if (!pair) throw new Error('Write the topic as "Product A vs Product B"');
  const [a, b] = pair;
  const angle = angleOf(topic);

  log(`research: looking up ${a} and ${b} ...`);
  const research = await generateText({
    model: RESEARCH_MODEL,
    tools: { search: gateway.tools.perplexitySearch({ maxResults: 8 }) },
    stopWhen: stepCountIs(10),
    prompt:
      `Today is ${new Date().toISOString().slice(0, 10)}. Research ${a} and ${b} for a spec-by-spec comparison video. ` +
      "Search the web several times: the manufacturer's own pages and press releases first (e.g. apple.com newsroom and tech specs), then launch reviews (GSMArena, Macworld, The Verge). " +
      "Products that have launched are official: state their specs plainly, don't call them rumoured. " +
      "Report, for each, the specs that matter for its category. For phones: launch date and US launch price per storage, chip and process, CPU/GPU cores, RAM, display (size, refresh, peak brightness), every camera (MP, aperture, zoom), " +
      "video features, battery (capacity if published, rated video hours), charging (time to 50%, wireless watts), weight, thickness, materials, colours, connectivity, and what is new. " +
      "For chips and processors: instruction set and design (ARM/RISC vs x86/CISC, decoders, core types), process node, cores, clocks, memory design, power draw, benchmark scores (Geekbench single/multi, Cinebench) with the laptop they were measured in, " +
      "performance per watt, battery life of laptops using them, and the history behind them. " +
      (angle ? `The video must answer: "${angle}". Find the facts and dated events that answer it, with sources. ` : "") +
      "Where sources disagree, give the manufacturer's figure. Mark only truly unconfirmed items. End with the source URLs you used.",
  });
  log(`research: ${research.steps.length} step(s), ${research.text.length} characters of notes`);

  const short = format === "short";
  log(`script: writing the ${short ? "Short" : "video"} ...`);
  const { output } = await generateText({
    model: WRITER_MODEL,
    output: Output.object({ schema: DRAFT }),
    prompt: `You write comparison videos for the YouTube channel "${channel.name}".
Audience: ${channel.audience}
Tone: ${channel.tone}
Language: ${channel.dialect ?? (channel.language === "ar" ? "Modern Standard Arabic" : "English")}. Write every narration, title, row label word and the description in it.

Compare: A = ${a}, B = ${b}. Product A is always the left value of each row.
${angle ? `The video answers this question, so the sections must build up to a clear answer: "${angle}". Explain the why in plain words a non-engineer gets (an analogy per idea), while each section still shows rows comparing A and B.\n` : ""}
Structure:
- First section is the intro: empty title, no rows, pose "point". Hook the viewer with the most surprising difference (often the price gap) and promise an honest answer.
- Then ${short ? "4-5" : "10-12"} topic sections (for phones: performance, cooling, camera, video, battery, charging, display & design, colours, price; for chips: design, process, speed, efficiency, heat, battery, history … whichever matter here), each with 1-3 rows. Alternate poses point/think.
- Last section: title like "my honest verdict" in the channel's language, one row (who should buy A | who should buy B, winner none; or the one-line answer per side when the video answers a question), pose "wave". Give the answer, ask viewers to comment, and to subscribe.
- The intro is at most 15 seconds spoken (2-3 short sentences): the first sentence is the hook. Background goes in later sections.
- ${short ? "Whole video 55-70 seconds spoken: each narration 1-2 short sentences." : "Whole video about 6-8 minutes spoken: each narration 4-6 sentences that explain what the difference means in real use (an everyday example per section)."}

Rules:
- Use ONLY facts from the research below. If a spec is unconfirmed, leave it out; never say "reportedly" about a launched product.
- Every number the narrator says must match the rows exactly (the same price, hours, grams).
- Narration is spoken by a text-to-speech voice that reads digits correctly: write EVERY number, price, size and percentage in digits (e.g. "$1,299", "45 ساعة", "249 جرام", "50%"), never spelled out in words. Keep product names in Latin script.
- Rows are short on-screen values in Latin script and digits where natural (e.g. "A20 Pro · 2nm", "45h video", "$1,299"), with words in the channel's language where needed.
- Be honest: if A wins something, say so.

Research:
${research.text}`,
  });

  const narrations = await checkNumbers(
    output.sections.map((section) => ({ narration: section.narration, facts: section.rows.map((row) => `${row.a} | ${row.b}`).join(" ; ") })),
    research.text,
    channel,
    log,
  );
  const sections = output.sections.map((section, index) => ({ ...section, narration: narrations[index] }));

  const scenes: Scene[] = sections.map((section, index) => ({
    id: `s${String(index + 1).padStart(3, "0")}`,
    narration: section.narration.trim(),
    visual: {
      type: "versus",
      title: section.title.trim(),
      pose: section.pose,
      rows: section.rows.map((row) => ({ ...(row.label.trim() ? { label: row.label.trim() } : {}), a: row.a, b: row.b, ...(row.winner === "none" ? {} : { winner: row.winner }) })),
    },
    imagePrompt: "",
  }));

  const hashtags = output.hashtags.map((tag) => `#${tag.replace(/^#/, "").replace(/\s+/g, "_")}`).join(" ");
  return {
    title: output.title,
    description: `${output.description.trim()}\n\n${hashtags}`.trim(),
    tags: output.tags,
    versus: { a: output.a, b: output.b, hook: output.hook, thumbnail: output.thumbnail },
    scenes,
  };
}
