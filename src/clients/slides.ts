import { z } from "zod";

import type { Slide, SlideLayout } from "./types.ts";

/** Characters per field before the slide gets crowded at 1080×1350. */
export const LIMITS = {
  title: 70,
  subtitle: 110,
  value: 12,
  label: 80,
  note: 90,
  item: 70,
  myth: 140,
  fact: 140,
  side: 60,
  step: 80,
  text: 180,
  by: 40,
  bar: 24,
  button: 30,
} as const;

type LimitKey = keyof typeof LIMITS;

const LAYOUTS = ["cover", "stat", "list", "myth-fact", "before-after", "steps", "quote", "chart", "cta"] as const satisfies readonly SlideLayout[];

/**
 * What the writer returns per slide: one flat shape, every field present and
 * empty when its layout doesn't use it (structured output handles this better
 * than a union). `toSlide` turns it into the typed slide.
 */
export const FLAT_SLIDE = z.object({
  layout: z
    .enum(LAYOUTS)
    .describe(
      "cover: the hook (title) and a short promise (subtitle). stat: one big number (value, digits) with what it means (label) and an optional note. " +
        "list: a title and 2-5 short items. myth-fact: a common belief and the truth. before-after: 2-4 short lines each. steps: a title and 2-4 steps (in items). " +
        "quote: one line someone would say, optional by. chart: a title and 2-5 bars (label, value number) with a unit. cta: the closing ask (title) and button text",
    ),
  title: z.string(),
  subtitle: z.string(),
  value: z.string(),
  label: z.string(),
  note: z.string(),
  items: z.array(z.string()).describe("list: the items. steps: the steps"),
  myth: z.string(),
  fact: z.string(),
  before: z.array(z.string()),
  after: z.array(z.string()),
  text: z.string(),
  by: z.string(),
  bars: z.array(z.object({ label: z.string(), value: z.number() })),
  unit: z.string(),
  button: z.string(),
  art: z.string().describe("An illustration for this slide, as a picture prompt in English (a subject, no text in it), or empty. Only the cover and at most 2 others"),
});

export type FlatSlide = z.infer<typeof FLAT_SLIDE>;

const clean = (text: string) => text.trim();
const lines = (list: string[]) => list.map(clean).filter(Boolean);
const optional = <K extends string>(key: K, text: string): Partial<Record<K, string>> => (clean(text) ? ({ [key]: clean(text) } as Record<K, string>) : {});

/** The typed slide, or null when the writer left out what the layout needs. The cta always points at the client's own link. */
export function toSlide(flat: FlatSlide, cta: { label: string; url: string }): Slide | null {
  const art = clean(flat.art) ? { art: { prompt: clean(flat.art) } } : {};
  switch (flat.layout) {
    case "cover":
      return clean(flat.title) ? { layout: "cover", title: clean(flat.title), ...optional("subtitle", flat.subtitle), ...art } : null;
    case "stat":
      return clean(flat.value) && clean(flat.label) ? { layout: "stat", value: clean(flat.value), label: clean(flat.label), ...optional("note", flat.note), ...art } : null;
    case "list":
      return clean(flat.title) && lines(flat.items).length >= 2 ? { layout: "list", title: clean(flat.title), items: lines(flat.items).slice(0, 5), ...art } : null;
    case "myth-fact":
      return clean(flat.myth) && clean(flat.fact) ? { layout: "myth-fact", myth: clean(flat.myth), fact: clean(flat.fact), ...art } : null;
    case "before-after":
      return lines(flat.before).length && lines(flat.after).length ? { layout: "before-after", before: lines(flat.before).slice(0, 4), after: lines(flat.after).slice(0, 4), ...art } : null;
    case "steps":
      return clean(flat.title) && lines(flat.items).length >= 2 ? { layout: "steps", title: clean(flat.title), steps: lines(flat.items).slice(0, 4), ...art } : null;
    case "quote":
      return clean(flat.text) ? { layout: "quote", text: clean(flat.text), ...optional("by", flat.by), ...art } : null;
    case "chart": {
      const bars = flat.bars
        .filter((bar) => clean(bar.label) && Number.isFinite(bar.value) && bar.value >= 0)
        .slice(0, 5)
        .map((bar) => ({ label: clean(bar.label), value: bar.value }));
      return clean(flat.title) && bars.length >= 2 ? { layout: "chart", title: clean(flat.title), bars, ...optional("unit", flat.unit), ...art } : null;
    }
    case "cta":
      return { layout: "cta", title: clean(flat.title) || cta.label, button: clean(flat.button) || cta.label, url: cta.url, ...art };
  }
}

type Field = { key: LimitKey; get: () => string; set: (text: string) => void };

/** Every text field of a slide with its limit, for checking and cutting. */
function fields(slide: Slide): Field[] {
  const s = slide as unknown as Record<string, unknown>;
  const one = (key: string, limit: LimitKey): Field[] => (typeof s[key] === "string" ? [{ key: limit, get: () => s[key] as string, set: (text) => void (s[key] = text) }] : []);
  const many = (key: string, limit: LimitKey): Field[] =>
    Array.isArray(s[key]) ? (s[key] as string[]).map((_, i) => ({ key: limit, get: () => (s[key] as string[])[i], set: (text: string) => void ((s[key] as string[])[i] = text) })) : [];
  const bars: Field[] = slide.layout === "chart" ? slide.bars.map((bar) => ({ key: "bar", get: () => bar.label, set: (text: string) => void (bar.label = text) })) : [];
  return [
    ...one("title", "title"), ...one("subtitle", "subtitle"), ...one("value", "value"), ...one("label", "label"), ...one("note", "note"),
    ...many("items", "item"), ...one("myth", "myth"), ...one("fact", "fact"), ...many("before", "side"), ...many("after", "side"),
    ...many("steps", "step"), ...one("text", "text"), ...one("by", "by"), ...one("button", "button"), ...bars,
  ];
}

/** What a set of slides breaks, as sentences the writer can fix. Empty when it's fine. */
export function slideProblems(slides: Slide[], kind: "carousel" | "single"): string[] {
  const problems: string[] = [];
  if (kind === "single") {
    if (slides.length !== 1) problems.push(`A single image has exactly 1 slide (you wrote ${slides.length}).`);
  } else if (slides.length < 5 || slides.length > 8) problems.push(`A carousel has 5-8 slides (you wrote ${slides.length}).`);
  if (slides[0]?.layout !== "cover") problems.push("The first slide must be a cover.");
  if (kind === "carousel" && slides.at(-1)?.layout !== "cta") problems.push("The last slide must be a cta.");
  if (slides.filter((slide) => slide.art).length > 3) problems.push("At most 3 slides have art.");
  slides.forEach((slide, index) => {
    for (const field of fields(slide)) {
      if (field.get().length > LIMITS[field.key]) problems.push(`Slide ${index + 1} (${slide.layout}): a ${field.key} is ${field.get().length} characters; keep it under ${LIMITS[field.key]}.`);
    }
  });
  return problems;
}

/** Copies of the slides with every over-limit text cut to its limit, ending in "…". */
export function fitSlides(slides: Slide[]): Slide[] {
  return slides.map((original) => {
    const slide = structuredClone(original);
    for (const field of fields(slide)) {
      const text = field.get();
      if (text.length > LIMITS[field.key]) field.set(`${text.slice(0, LIMITS[field.key] - 1).trimEnd()}…`);
    }
    return slide;
  });
}
