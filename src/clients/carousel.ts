import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { generateImage, generateText, Output } from "ai";
import { z } from "zod";

import { recordImage } from "../usage.ts";
import { FLAT_SLIDE, fitSlides, slideProblems, toSlide } from "./slides.ts";
import { styleOf, withPictures, type PictureAmount } from "./styles.ts";
import type { Client, Idea, Slide } from "./types.ts";

const WRITER_MODEL = "anthropic/claude-sonnet-5.5";
const ART_MODEL = "bfl/flux-3-image";

const CAROUSEL = z.object({
  slides: z.array(FLAT_SLIDE),
  caption: z.string().describe("The Instagram caption: the hook line, 2-4 short lines of value, a question that invites comments, the call to action. No hashtags in it"),
  hashtags: z.array(z.string()).describe("12-20 hashtags without #: 3-5 broad, the rest niche and local"),
});

/** The slides and caption of a carousel (5-8 slides) or a single image (1 cover), checked and fitted to the limits. */
export async function writeCarousel(client: Client, idea: Idea, log: (message: string) => void, pictures: PictureAmount = "light"): Promise<{ slides: Slide[]; caption: string; hashtags: string[] }> {
  const kind = idea.format === "single" ? "single" : "carousel";
  const arabic = client.language === "ar";
  const prompt = `You design Instagram ${kind === "single" ? "single-image posts" : "infographic carousels"} for ${client.name} (${client.url}).

THE IDEA (goal: ${idea.goal}, angle: ${idea.angle})
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

RULES
- ${kind === "single" ? "Exactly 1 slide: a cover whose title is the hook, sharpened, and a subtitle with the one takeaway." : "5-8 slides. Slide 1 is the cover (the hook as a title that makes people swipe). The last slide is the cta. Between them, one idea per slide, using the layouts that fit the content: stat, list, myth-fact, before-after, steps, quote, chart."}
- Very short text: a title under 70 characters, list items under 70, a stat value like "3x" or "15".
- Numbers not given in the client's facts are examples: put "${arabic ? "مثال" : "example"}" in the note or the chart unit.
- Art: ${pictures === "rich" ? "an English picture prompt for EVERY slide" : "an English picture prompt for the cover and at most 2 other slides"}: the subject only (a phone with a calendar, a tangle of chat bubbles), never text, never logos; the art style is added later.
- Language: ${arabic ? "Egyptian colloquial Arabic, natural; brand and platform names in Latin script" : "simple, natural English"}.`;

  const write = (extra = "") => generateText({ telemetry: { functionId: "carousel" }, model: WRITER_MODEL, output: Output.object({ schema: CAROUSEL }), prompt: prompt + extra });
  const toSlides = (output: z.infer<typeof CAROUSEL>) => output.slides.map((flat) => toSlide(flat, client.brief.cta)).filter((slide): slide is Slide => slide !== null);
  log(`carousel: writing "${idea.hook}" ...`);
  let { output } = await write();
  let slides = toSlides(output);
  const problems = slideProblems(slides, kind);
  if (problems.length) {
    log(`carousel: fixing ${problems.length} problem(s) ...`);
    ({ output } = await write(`\n\nYOUR FIRST ANSWER HAD THESE PROBLEMS:\n${problems.map((p) => `- ${p}`).join("\n")}\nWrite the slides again without them.`));
    slides = toSlides(output);
  }
  // Whatever the writer did, the post opens on a cover and a carousel ends on the client's call to action.
  if (kind === "single") slides = slides.filter((slide) => slide.layout === "cover").slice(0, 1);
  if (slides[0]?.layout !== "cover") slides = [{ layout: "cover", title: idea.hook }, ...slides.filter((slide) => slide.layout !== "cover")];
  if (kind === "carousel" && slides.at(-1)?.layout !== "cta") slides.push({ layout: "cta", title: client.brief.cta.label, button: client.brief.cta.label, url: client.brief.cta.url });
  slides = withPictures(slides, pictures, (slide) => `An illustration of: ${"title" in slide ? slide.title : "text" in slide ? slide.text : "myth" in slide ? slide.fact : idea.hook}`);
  return { slides: fitSlides(slides), caption: output.caption.trim(), hashtags: output.hashtags };
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
