import { gateway, generateText, Output, stepCountIs } from "ai";
import { z } from "zod";

import type { Channel } from "../config.ts";
import { DEEP_LAYOUTS, type FormatId, type Photo, type Scene, type Thumbnail } from "../types.ts";
import { checkNumbers, SEO } from "./versus.ts";

// Same models as a versus video: researched on the web, so nothing comes from a model's stale memory.
const RESEARCH_MODEL = "anthropic/claude-sonnet-5.5";
const WRITER_MODEL = "anthropic/claude-sonnet-5.5";

const PHOTO_QUERY = z
  .string()
  .describe(
    "2-5 English words to find a REAL photo of this on Wikimedia Commons (e.g. 'silicon wafer', 'EUV lithography machine', 'Snapdragon chip', 'smartphone logic board'). Give almost every chapter one: diagram layouts open on it for 2-3 seconds",
  );

const DRAFT = z.object({
  title: z.string().describe(SEO.title),
  description: z.string().describe(SEO.description),
  tags: z.array(z.string()).max(15).describe(SEO.tags),
  hashtags: z.array(z.string()).max(5).describe("Without #"),
  hook: z.string().describe("A 3-6 word on-screen hook for the intro"),
  thumbnail: z.object({
    headline: z.string().describe("2-3 huge words for the thumbnail, a question or bold claim"),
    highlight: z.string().describe("The one word of the headline drawn in the accent colour"),
    tag: z.string().describe("A tiny badge like 3nm or 19B, or empty"),
  }),
  cover: PHOTO_QUERY.describe("English words for the thumbnail's real photo: the most striking real object of the topic, e.g. 'smartphone system on chip'"),
  sections: z
    .array(
      z.object({
        title: z.string().describe("Chapter name on screen, 1-4 words; empty for the intro"),
        layout: z.enum(DEEP_LAYOUTS).describe(
          "photo: a real photo + up to 3 short points. blocks: a chip map, 4-9 parts that light up in order. steps: 3-6 numbered steps of a process. stat: one big number. table: 2-5 columns compared. grid: an overview of many products as cards (e.g. a whole product family)",
        ),
        items: z
          .array(z.object({ label: z.string(), note: z.string(), cells: z.array(z.string()).describe("table with 3-5 columns only: the row's values, the row name first; else empty") }))
          .max(24)
          .describe(
            "photo: points (label 2-4 words, note optional). blocks: the parts (label like CPU, GPU, NPU; note 2-5 words on its job). steps: label 2-4 words, note one short line. stat: ONE item, label is the number with its unit (e.g. 19B, 3nm), note what it counts. table: label is the left value, note the right value, or use cells for 3-5 columns. grid: one card per product (label = its name, note = 2-4 words such as year · process), in row order; a card with an empty label is an empty cell",
          ),
        heads: z.array(z.string()).describe("table only: the column headers (as many as the columns); else empty"),
        columns: z.number().int().describe("grid only: cards per row; else 0"),
        photo: PHOTO_QUERY,
        pose: z.enum(["point", "think", "wave"]),
        narration: z.string().describe("What the narrator says in this section"),
      }),
    )
    .min(6),
});

export type DeepDiveDraft = {
  title: string;
  description: string;
  tags: string[];
  deepdive: { hook: string; thumbnail: Thumbnail; cover: Photo };
  scenes: Scene[];
};

/**
 * Researches the topic on the web, then writes a long explainer in the
 * channel's language and dialect: an intro, chapters that build the idea
 * step by step with a real photo, a chip map, steps, a number or a table
 * each, and a recap.
 */
export async function writeDeepDive(channel: Channel, format: FormatId, topic: string, log: (message: string) => void = console.log): Promise<DeepDiveDraft> {
  log(`research: looking up "${topic}" ...`);
  const research = await generateText({
    telemetry: { functionId: "research" },
    model: RESEARCH_MODEL,
    tools: { search: gateway.tools.perplexitySearch({ maxResults: 8 }) },
    stopWhen: stepCountIs(12),
    prompt:
      `Today is ${new Date().toISOString().slice(0, 10)}. Research this for an in-depth explainer video: "${topic}". ` +
      "Search the web several times: makers' own pages and press releases first (Apple, Qualcomm, MediaTek, Samsung, Google, TSMC, ASML, Arm), then trusted engineering sources (AnandTech archives, Chips and Cheese, IEEE Spectrum, Wikipedia for history). " +
      "Cover what the parts are and what each does, how they work together, how it is designed and manufactured end to end, history and key dates, and current real examples with their official figures (transistor counts, process nodes, core counts, power). " +
      "Products that have launched are official: state their specs plainly. Where sources disagree, give the maker's figure. End with the source URLs you used.",
  });
  log(`research: ${research.steps.length} step(s), ${research.text.length} characters of notes`);

  const short = format === "short";
  log(`script: writing the ${short ? "Short" : "video"} ...`);
  const { output } = await generateText({
    telemetry: { functionId: "script" },
    model: WRITER_MODEL,
    output: Output.object({ schema: DRAFT }),
    prompt: `You write in-depth explainer videos for the YouTube channel "${channel.name}".
Audience: ${channel.audience}
Tone: ${channel.tone}
Language: ${channel.dialect ?? (channel.language === "ar" ? "Modern Standard Arabic" : "English")}. Write every narration, title, item and the description in it; keep technical names (CPU, GPU, TSMC, 3nm) in Latin script.

Topic: ${topic}
When the topic asks for a structure (an overview first, one chapter per generation, a chapter count), follow it over the defaults below.

Structure:
- First section is the intro: empty title, layout "photo" with no items, pose "point". 2-3 short sentences, at most 15 seconds spoken: the first sentence is the hook (the most surprising fact, number or question), then promise what they'll know by the end. Background and caveats go in later chapters, never in the intro.
- Then ${short ? "4-5" : "12-16"} chapters that build the idea from zero, each answering one question a curious viewer would ask next. Pick the layout that shows it best and vary them: a real photo of the real thing (photo), the parts of a chip lighting up as you name them (blocks), a process (steps), one striking number (stat), a comparison (table), or an overview of a whole family of products (grid).
- Explain every idea in plain words a non-engineer gets, with one everyday analogy per idea (a city, a kitchen, a factory). Name real current examples.
- Last section: title like "the summary" in the channel's language, layout "steps" recapping the 3-5 key ideas, pose "wave". Ask viewers to comment, and to subscribe.
- ${short ? "Whole video 55-70 seconds spoken: each narration 1-2 short sentences." : "Whole video about 8-10 minutes spoken: each narration 4-7 sentences."}
- Items must match the narration in order: the narrator names each block, step or point in the order it is listed.

Rules:
- Use ONLY facts from the research below. Leave out anything unconfirmed.
- Every number the narrator says must match the items exactly.
- Narration is spoken by a text-to-speech voice that reads digits correctly: write EVERY number, size, year and percentage in digits (e.g. "3nm", "19 مليار", "2007", "50%"), never spelled out in words.
- Give almost every chapter a photo: viewers want to SEE the real thing. Photos must be of real, photographable things (a wafer, a cleanroom, a chip on a board, a lithography machine), never diagrams or logos.

Research:
${research.text}`,
  });

  const narrations = await checkNumbers(
    output.sections.map((section) => ({ narration: section.narration, facts: section.items.map((item) => `${item.label} ${item.note} ${item.cells.join(" ")}`).join(" ; ") })),
    research.text,
    channel,
    log,
  );

  const scenes: Scene[] = output.sections.map((section, index) => {
    const items = section.items.map((item) => ({
      label: item.label.trim(),
      ...(item.note.trim() ? { note: item.note.trim() } : {}),
      ...(section.layout === "table" && item.cells.length > 2 ? { cells: item.cells.map((cell) => cell.trim()) } : {}),
    }));
    const heads = section.heads.map((head) => head.trim());
    return {
      id: `s${String(index + 1).padStart(3, "0")}`,
      narration: narrations[index].trim(),
      visual: {
        type: "deepdive",
        title: section.title.trim(),
        layout: section.layout,
        items: section.layout === "stat" ? items.slice(0, 1) : items,
        ...(section.layout === "table" && heads.some(Boolean) ? { heads } : {}),
        ...(section.layout === "grid" && section.columns > 0 ? { columns: section.columns } : {}),
        ...(section.photo.trim() ? { photo: { query: section.photo.trim() } } : {}),
        pose: section.pose,
      },
      imagePrompt: "",
    };
  });

  const hashtags = output.hashtags.map((tag) => `#${tag.replace(/^#/, "").replace(/\s+/g, "_")}`).join(" ");
  return {
    title: output.title,
    description: `${output.description.trim()}\n\n${hashtags}`.trim(),
    tags: output.tags,
    deepdive: { hook: output.hook, thumbnail: output.thumbnail, cover: { query: output.cover.trim() || topic } },
    scenes,
  };
}
