import { generateText, Output } from "ai";
import { z } from "zod";

import type { Channel } from "../config.ts";
import type { FormatId, ProsConsKind, Scene } from "../types.ts";
import { checkNumbers, productsOf, researchPair, SEO, type VersusDraft } from "./versus.ts";

/**
 * A pros-and-cons video: a review and a comparison at once, in the spirit of
 * "the pros and cons of living in…" videos. Every chapter compares the specs,
 * explains one term in plain words, lists each product's pros and cons, and
 * names who won it; a chapter of the problems reviewers found, the score, and
 * who should buy which close it. It never assumes the dearer product wins.
 */

const WRITER_MODEL = "anthropic/claude-sonnet-5.5";
const KINDS = ["intro", "chapter", "problems", "score", "verdict"] as const satisfies readonly ProsConsKind[];

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const PRODUCT = z.object({
  name: z.string().describe("Full product name in Latin script, e.g. iPhone 18 Pro"),
  short: z.string().describe("A 1-2 word label, e.g. 18 Pro"),
  color: hex.describe("A signature colour of this product (a launch colour), readable on a dark background"),
});
const POINT = z.string().describe("One short point, under 45 characters, in the channel's language; product terms and numbers in Latin script and digits");
const SIDES = z.object({ a: z.array(POINT).max(3), b: z.array(POINT).max(3) });

const DRAFT = z.object({
  title: z.string().describe(SEO.title),
  description: z.string().describe(SEO.description),
  tags: z.array(z.string()).max(15).describe(SEO.tags),
  hashtags: z.array(z.string()).max(5).describe("Without #"),
  hook: z.string().describe("A 3-6 word on-screen hook for the intro, e.g. «أغلى بـ $800… بس أحسن؟»"),
  thumbnail: z.object({
    headline: z.string().describe("2-3 huge words for the thumbnail, a question or bold claim"),
    highlight: z.string().describe("The one word of the headline drawn in the accent colour"),
    tag: z.string().describe("A tiny badge like +$800, or empty"),
  }),
  a: PRODUCT,
  b: PRODUCT,
  sections: z
    .array(
      z.object({
        kind: z.enum(KINDS),
        title: z.string().describe("Chapter name on screen, 1-3 words; empty for the intro"),
        pose: z.enum(["point", "think", "wave"]),
        rows: z
          .array(z.object({ label: z.string(), a: z.string(), b: z.string(), winner: z.enum(["a", "b", "none"]) }))
          .max(3)
          .describe("Spec rows (product A first), values under 26 characters with the number first; winner none when equal. Chapters only"),
        explain: z.object({ term: z.string(), meaning: z.string() }).describe("A chapter's one term a normal buyer doesn't know (e.g. term «Telephoto 5x», meaning «عدسة بتقرب 5 مرات من غير ما الصورة تبوظ»), meaning under 90 characters; both empty when none"),
        pros: SIDES.describe("What each product does well in this chapter, 0-3 each"),
        cons: SIDES.describe("What each product does badly in this chapter, 0-3 each; the problems chapter is mostly cons"),
        verdict: z.enum(["a", "b", "tie"]).describe("Who wins this chapter; tie for the intro, score and verdict"),
        buyers: z.object({ a: z.string(), b: z.string() }).describe("The verdict only: who should buy A / B, under 70 characters each; else both empty"),
        narration: z.string().describe("What the narrator says in this section"),
      }),
    )
    .min(4),
});

/** What reviewers found, on top of the specs: the material a review needs. */
const REVIEWS =
  "Also gather what reviewers found after using them (hands-on reviews: 9to5Mac, The Verge, Tom's Guide, PetaPixel, Engadget, MKBHD and Arabic tech YouTubers): their pros and cons, battery test results, heat and sustained performance, " +
  "which apps work badly or aren't optimised (name them), multitasking, screen crease, durability, speakers, biometrics, repair cost, and what reviewers agree on. Where reviewers disagree, say who said what. ";

type Draft = z.infer<typeof DRAFT>;

/** The draft's sections as scenes: empty fields left out, so each chapter shows only what it has. */
export function prosConsScenes(sections: Draft["sections"]): Scene[] {
  const trimmed = (list: string[]) => list.map((item) => item.trim()).filter(Boolean);
  const sides = (value: { a: string[]; b: string[] }) => {
    const out = { a: trimmed(value.a), b: trimmed(value.b) };
    return out.a.length || out.b.length ? out : undefined;
  };
  return sections.map((section, index) => {
    const pros = sides(section.pros);
    const cons = sides(section.cons);
    const explain = section.explain.term.trim() && section.explain.meaning.trim() ? { term: section.explain.term.trim(), meaning: section.explain.meaning.trim() } : undefined;
    const buyers = section.kind === "verdict" && section.buyers.a.trim() && section.buyers.b.trim() ? { a: section.buyers.a.trim(), b: section.buyers.b.trim() } : undefined;
    return {
      id: `s${String(index + 1).padStart(3, "0")}`,
      narration: section.narration.trim(),
      visual: {
        type: "versus",
        title: section.title.trim(),
        pose: section.pose,
        kind: index === 0 ? "intro" : section.kind,
        rows: section.rows.map((row) => ({ ...(row.label.trim() ? { label: row.label.trim() } : {}), a: row.a, b: row.b, ...(row.winner === "none" ? {} : { winner: row.winner }) })),
        ...(explain ? { explain } : {}),
        ...(pros ? { pros } : {}),
        ...(cons ? { cons } : {}),
        ...(section.kind === "chapter" || section.kind === "problems" ? { verdict: section.verdict } : {}),
        ...(buyers ? { buyers } : {}),
      },
      imagePrompt: "",
    };
  });
}

/** Everything a section shows, so the spoken numbers can be checked against it. */
const factsOf = (section: Draft["sections"][number]) =>
  [...section.rows.map((row) => `${row.a} | ${row.b}`), section.explain.meaning, ...section.pros.a, ...section.pros.b, ...section.cons.a, ...section.cons.b, section.buyers.a, section.buyers.b].filter(Boolean).join(" ; ");

export async function writeProsCons(channel: Channel, format: FormatId, topic: string, log: (message: string) => void = console.log): Promise<VersusDraft> {
  const pair = productsOf(topic);
  if (!pair) throw new Error('Write the topic as "Product A vs Product B"');
  const [a, b] = pair;
  const angle = topic.split(":").slice(1).join(":").trim();
  const research = await researchPair(a, b, angle, log, REVIEWS);

  const short = format === "short";
  log(`script: writing the pros-and-cons ${short ? "Short" : "video"} ...`);
  const { output } = await generateText({
    telemetry: { functionId: "script" },
    model: WRITER_MODEL,
    output: Output.object({ schema: DRAFT }),
    prompt: `You write honest review-and-comparison videos for the YouTube channel "${channel.name}", in the style of "the pros and cons of living in…" videos: every topic weighed fairly, pros and cons for each side, a clear winner per chapter.
Audience: ${channel.audience}
Tone: ${channel.tone}
Language: ${channel.dialect ?? (channel.language === "ar" ? "Modern Standard Arabic" : "English")}. Write every narration, title, point, label word and the description in it.

Compare: A = ${a}, B = ${b}. Product A is always the left value of each row and the first side of pros and cons.
${angle ? `The angle of this video: "${angle}". Every chapter builds toward answering it.\n` : ""}It is a review AND a comparison: explain what the specs mean in real life, what using each is like day to day, and the problems reviewers found. Never assume the more expensive one is better: a higher price must earn its wins, and say so plainly when it doesn't.

Structure:
- Section 1, kind "intro": empty title, no rows, no pros or cons, pose "point". At most 15 seconds spoken: hook with the most surprising fact (often the price gap against what you actually get) and promise an honest answer.
${
  short
    ? `- Then 2-3 sections of kind "chapter" on the angle only, each with 1-2 rows, a term explained, 1-2 pros and cons per side and a verdict.
- Last section, kind "verdict": title like "الخلاصة", buyers for each side, pose "wave": the one-line answer, ask viewers to comment, and to subscribe.
- Whole video 55-70 seconds spoken: each narration 1-2 short sentences.`
    : `- Then 7-9 sections of kind "chapter" (for phones: design & build, screens, performance & heat, camera, video, battery & charging, apps & software, durability & repair, price & value; whichever matter here), each with 1-3 rows, the one term a normal buyer wouldn't know explained in plain words, 1-3 pros and 1-3 cons per side, and a verdict. Alternate poses point/think.
- Then one section of kind "problems": title like "مشاكل محدش بيقولها": the real problems reviewers found after using them (apps that aren't ready, with names; crease; biometrics; heat; speakers; repair), mostly cons, said with which reviewer found them; verdict for the side with fewer problems.
- Then one section of kind "score": title like "النتيجة", no rows or points: count the "chapter" sections each won (the problems section doesn't count; ties count for no one), say the exact counts, and what that means.
- Last section, kind "verdict": title like "مين يشتري إيه؟", buyers for each side, pose "wave": the honest answer, ask viewers to comment, and to subscribe.
- Whole video about 8-10 minutes spoken: each chapter narration 5-7 sentences: the spec, what it means in real use (an everyday example), then the pros and cons in words.`
}

Rules:
- Use ONLY facts from the research below. Leave out what's unconfirmed; never say "reportedly" about a launched product. Name the reviewer when a point is one reviewer's finding.
- Every number the narrator says must match the rows and points exactly.
- Narration is spoken by a text-to-speech voice: write EVERY number, price, size and percentage in digits ("$1,999", "24 ساعة", "7.6 بوصة"), never in words. Product names in Latin script.
- Points and rows are short on-screen text; the narration says them in full sentences.
- Fair: each side gets real pros and real cons; a chapter is a tie when neither truly wins.

Research:
${research.text}`,
  });

  const narrations = await checkNumbers(
    output.sections.map((section) => ({ narration: section.narration, facts: factsOf(section) })),
    research.text,
    channel,
    log,
  );
  const scenes = prosConsScenes(output.sections.map((section, index) => ({ ...section, narration: narrations[index] })));
  const hashtags = output.hashtags.map((tag) => `#${tag.replace(/^#/, "").replace(/\s+/g, "_")}`).join(" ");
  return {
    title: output.title,
    description: `${output.description.trim()}\n\n${hashtags}`.trim(),
    tags: output.tags,
    versus: { a: output.a, b: output.b, hook: output.hook, thumbnail: output.thumbnail },
    scenes,
  };
}
