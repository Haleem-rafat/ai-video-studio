import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { generateImage, generateText, Output } from "ai";
import { z } from "zod";

import { recordImage } from "../usage.ts";
import { proofread } from "./arabic.ts";
import { FLAT_SLIDE, fitSlides, slideProblems, toSlide } from "./slides.ts";
import { styleOf, withPictures, type PictureAmount } from "./styles.ts";
import { businessContext } from "./context.ts";
import { formatForIdea, formatOf, formatProblems, type FormatId } from "./formats.ts";
import { pictureRepeats } from "./history.ts";
import { needsRewrite, reviewScript, rewriteNotes, scriptOf } from "./review.ts";
import type { Client, Idea, ScriptReview, Slide } from "./types.ts";

const WRITER_MODEL = "anthropic/claude-sonnet-5.5";
const ART_MODEL = "bfl/flux-3-image";

const CAROUSEL = z.object({
  slides: z.array(FLAT_SLIDE),
  caption: z.string().describe("The Instagram caption: the hook line, 2-4 short lines of value, a question that invites comments, the call to action. No hashtags in it"),
  hashtags: z.array(z.string()).describe("12-20 hashtags without #: 3-5 broad, the rest niche and local"),
});

/** The format a post is written in: the one chosen, the idea's own for "auto", none for a single image. */
export function resolveFormat(idea: Pick<Idea, "format" | "angle">, choice: FormatId | "auto" | undefined): FormatId | undefined {
  if (idea.format === "single" || !choice) return undefined;
  return choice === "auto" ? formatForIdea(idea) : choice;
}

/** What the carousel writer is asked: the idea, the client, its business context, the format and the rules. */
export function carouselPrompt(
  client: Client,
  idea: Idea,
  options: { pictures?: PictureAmount; pastTitles?: string[]; format?: FormatId | "auto"; recentOrders?: string[][]; recentPictures?: string[] } = {},
): string {
  const { pictures = "light", pastTitles = [], recentOrders = [], recentPictures = [] } = options;
  const kind = idea.format === "single" ? "single" : "carousel";
  const arabic = client.language === "ar";
  const format = formatOf(resolveFormat(idea, options.format));
  return `You design Instagram ${kind === "single" ? "single-image posts" : "infographic carousels"} for ${client.name} (${client.url}).

THE IDEA (goal: ${idea.goal}, angle: ${idea.angle}${idea.persona ? `, for: ${idea.persona}` : ""}${idea.step ? `, shows: ${idea.step}` : ""})
Hook: ${idea.hook}
Outline: ${idea.outline.map((line, i) => `${i + 1}. ${line}`).join("  ")}

THE CLIENT
Offer: ${client.brand.summary}
Audience: ${client.brief.audience}
Problems: ${client.brief.problems.join(" | ")}
Features: ${client.brief.features.join(" | ")}
Call to action: "${client.brief.cta.label}" → ${client.brief.cta.url}
Tone: ${client.brief.tone}
Never: ${client.avoid || "nothing extra"}; never invent prices, testimonials, client counts or guarantees.

${businessContext(client, "carousel") ? `${businessContext(client, "carousel")}\n\n` : ""}${format ? `POST FORMAT: ${format.label.en}\n${format.structure}\nBuild it mostly from these layouts: ${format.layouts.join(", ")}.${format.caption ? `\nCaption: ${format.caption}` : ""}\n\n` : ""}${recentOrders.length ? `RECENT SLIDE ORDERS (already posted; use a different order and mix of layouts, so this post doesn't look like the last ones):\n${recentOrders.slice(0, 5).map((order) => `- ${order.join(" → ")}`).join("\n")}\n\n` : ""}${recentPictures.length ? `PICTURES ALREADY USED in this client's posts and reels (never reuse these subjects or close variants; invent new scenes, people, places and metaphors):\n${recentPictures.slice(0, 40).map((picture) => `- ${picture}`).join("\n")}\n\n` : ""}${pastTitles.length ? `SLIDE TITLES ALREADY POSTED (already paid for; never reuse them or their examples):\n${pastTitles.slice(0, 60).map((t) => `- ${t}`).join("\n")}\n\n` : ""}RULES
- ${kind === "single" ? "Exactly 1 slide: a cover whose title is the hook, sharpened, and a subtitle with the one takeaway." : "5-8 slides. Slide 1 is the cover (the hook as a title that makes people swipe). The last slide is the cta. Between them, one idea per slide, using the layouts that fit the content: stat, list, checklist, myth-fact, fix, before-after, versus, steps, faq, chat, quote, chart."}
- Write like someone who knows this product: show how it really works for the customer (a real step, a real screen, a real moment), in the customer's own words, about their own situation. No generic marketing lines.
- Very short text: a title under 70 characters, list items under 70, a stat value like "3x" or "15".
- Numbers not given in the client's facts are examples: put "${arabic ? "مثال" : "example"}" in the note or the chart unit.
- Art: ${
    pictures === "none"
      ? "no pictures: leave art empty on every slide; the design and the words carry the post."
      : `${pictures === "rich" ? "an English picture prompt for EVERY slide" : "an English picture prompt for the cover and at most 2 other slides"}: the subject only, never text, never logos; the art style is added later. Every picture is a fresh, specific visual idea for its slide: mix people in real moments, places, objects and visual metaphors, and never reach for a phone, a calendar or chat bubbles unless the slide is about exactly that.`
  }
- Language: ${arabic ? "Egyptian colloquial Arabic, natural, correctly spelled (hamza, ة/ه, ى/ي), also in hashtags; brand and platform names in Latin script" : "simple, natural English"}.`;}

/** The slides and caption of a carousel (5-8 slides) or a single image (1 cover), checked and fitted to the limits. */
export async function writeCarousel(
  client: Client,
  idea: Idea,
  log: (message: string) => void,
  pictures: PictureAmount = "light",
  pastTitles: string[] = [],
  choice?: FormatId | "auto",
  recentOrders: string[][] = [],
  recentPictures: string[] = [],
): Promise<{ slides: Slide[]; caption: string; hashtags: string[]; review?: ScriptReview; format?: FormatId }> {
  const kind = idea.format === "single" ? "single" : "carousel";
  const format = resolveFormat(idea, choice);
  const prompt = carouselPrompt(client, idea, { pictures, pastTitles, format, recentOrders, recentPictures });

  const write = (extra = "") => generateText({ telemetry: { functionId: "carousel" }, model: WRITER_MODEL, output: Output.object({ schema: CAROUSEL }), prompt: prompt + extra });
  const toSlides = (output: z.infer<typeof CAROUSEL>) => output.slides.map((flat) => toSlide(flat, client.brief.cta)).filter((slide): slide is Slide => slide !== null);

  /** One draft: written, its layout problems fixed once, opened on a cover and closed on the call to action. */
  const draft = async (extra = "") => {
    let { output } = await write(extra);
    let slides = toSlides(output);
    // A picture already used is sent back before anything is drawn, like a layout problem.
    const repeats = pictureRepeats(slides.map((slide) => slide.art?.prompt).filter((prompt): prompt is string => Boolean(prompt)), recentPictures);
    const problems = [...slideProblems(slides, kind), ...formatProblems(slides, format), ...repeats.map((prompt) => `The picture "${prompt}" repeats one this client already used: give that slide a new picture idea.`)];
    if (problems.length) {
      log(`carousel: fixing ${problems.length} problem(s) ...`);
      ({ output } = await write(`${extra}\n\nYOUR ANSWER HAD THESE PROBLEMS:\n${problems.map((p) => `- ${p}`).join("\n")}\nWrite the slides again without them.`));
      slides = toSlides(output);
    }
    if (kind === "single") slides = slides.filter((slide) => slide.layout === "cover").slice(0, 1);
    if (slides[0]?.layout !== "cover") slides = [{ layout: "cover", title: idea.hook }, ...slides.filter((slide) => slide.layout !== "cover")];
    if (kind === "carousel" && slides.at(-1)?.layout !== "cta") slides.push({ layout: "cta", title: client.brief.cta.label, button: client.brief.cta.label, url: client.brief.cta.url });
    slides = withPictures(slides, pictures, (slide) => `An illustration of: ${"title" in slide ? slide.title : "text" in slide ? slide.text : "myth" in slide ? slide.fact : idea.hook}`);
    return { slides: fitSlides(slides), caption: output.caption.trim(), hashtags: output.hashtags };
  };

  log(`carousel: writing "${idea.hook}" ...`);
  let result = await draft();
  // Checked before any picture is paid for; a weak script is written once more with the reviewer's notes.
  let review = await reviewScript(client, { kind, idea, script: `${scriptOf(result)}\nCAPTION: ${result.caption}` }, log);
  let rewritten = false;
  if (review && needsRewrite(review)) {
    log("carousel: rewriting with the reviewer's notes ...");
    result = await draft(rewriteNotes(review));
    review = (await reviewScript(client, { kind, idea, script: `${scriptOf(result)}\nCAPTION: ${result.caption}` }, log)) ?? review;
    rewritten = true;
  }
  await proofread(result, log);
  // A fix can make a text longer than its slide allows.
  return { ...result, slides: fitSlides(result.slides), ...(review ? { review: { ...review, rewritten } } : {}), ...(format ? { format } : {}) };
}

/** Draws every slide picture that has no file yet, in one style, into `dir`/art/. */
export async function drawSlideArt(dir: string, client: Client, slides: Slide[], log: (message: string) => void, artStyle?: string): Promise<Slide[]> {
  const { colors } = client.brand;
  const style = `${styleOf(artStyle).picture}, a palette of ${colors.accent}, ${colors.cta} and ${colors.panel} on a plain ${colors.background} background, no text, no letters, no logos, no watermark. Subject: `;
  const out = structuredClone(slides);
  await mkdir(join(dir, "art"), { recursive: true });
  for (const [index, slide] of out.entries()) {
    if (!slide.art || slide.art.file) continue;
    log(`art: slide ${index + 1} ...`);
    const result = await generateImage({ model: ART_MODEL, prompt: style + slide.art.prompt, aspectRatio: "1:1" });
    recordImage(ART_MODEL, result, "pictures");
    const file = `art/${String(index + 1).padStart(2, "0")}.${result.image.mediaType === "image/png" ? "png" : "jpg"}`;
    await writeFile(join(dir, file), result.image.uint8Array);
    slide.art.file = file;
  }
  return out;
}
