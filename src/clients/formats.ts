import type { Idea, Slide, SlideLayout } from "./types.ts";

/**
 * Carousel post formats: what a carousel says and in what order. Each gives
 * the writer a structure and the slide layouts it is built from; `key` is the
 * layout without which the post isn't this format. Picked from current
 * Instagram trends (saveable lists and checklists, myth busting, this vs that,
 * teardowns, "people also ask", comment-to-get).
 */

export const FORMAT_IDS = ["list", "checklist", "mistakes", "myth", "before-after", "steps", "versus", "teardown", "story", "stats", "faq", "comment"] as const;
export type FormatId = (typeof FORMAT_IDS)[number];

type Text = { en: string; ar: string };
export type PostFormat = { id: FormatId; label: Text; description: Text; structure: string; layouts: SlideLayout[]; key: SlideLayout; caption?: string };

export const FORMATS: Record<FormatId, PostFormat> = {
  list: {
    id: "list",
    label: { en: "Numbered list", ar: "قايمة مرقّمة" },
    description: { en: "“5 ways to…”: saveable tips", ar: "«٥ طرق…»: نصايح تتحفظ" },
    structure: "A saveable numbered list. The cover promises a number ('5 ways…', '7 signs…'). Then the items, 2-3 per list slide or one per slide, each a concrete tip in the customer's words, not a slogan. Close on the call to action.",
    layouts: ["cover", "list", "steps", "cta"],
    key: "list",
    caption: "Ask readers to save the post for later.",
  },
  checklist: {
    id: "checklist",
    label: { en: "Checklist", ar: "تشيك ليست" },
    description: { en: "Things to check, made to be saved", ar: "حاجات تتشيّك، معمولة تتحفظ" },
    structure: "A checklist the reader saves and uses: the cover names it ('Checklist: before you post your bio link'). 1-2 checklist slides of 3-5 short, checkable items each. A last slide before the call to action can tell them what to do if they missed items.",
    layouts: ["cover", "checklist", "quote", "cta"],
    key: "checklist",
    caption: "Ask readers to save it and tick the list.",
  },
  mistakes: {
    id: "mistakes",
    label: { en: "Mistakes + fixes", ar: "أخطاء وحلولها" },
    description: { en: "“5 mistakes that…”, each with its fix", ar: "«٥ أخطاء…»، كل واحد بحلّه" },
    structure: "Common mistakes the audience really makes, each followed by its fix. The cover counts them ('3 mistakes that lose you bookings'). One fix slide per mistake (problem → fix), the fix showing how the client's product solves it where true. Close on the call to action.",
    layouts: ["cover", "fix", "cta"],
    key: "fix",
  },
  myth: {
    id: "myth",
    label: { en: "Myth vs fact", ar: "خرافة ولا حقيقة" },
    description: { en: "Bust what people wrongly believe", ar: "اكسر اللي الناس فاكراه غلط" },
    structure: "Myth busting: the cover teases a belief the audience holds. 3-5 myth-fact slides, each myth in the customer's words and the fact short and supported by the client's facts. Close on the call to action.",
    layouts: ["cover", "myth-fact", "cta"],
    key: "myth-fact",
  },
  "before-after": {
    id: "before-after",
    label: { en: "Before / after", ar: "قبل وبعد" },
    description: { en: "The change, made visible", ar: "التغيير قدام عينك" },
    structure: "A transformation: the cover shows the gap. A before-after slide (or two) contrasting the customer's day without and with the product, then the steps that get them there. Close on the call to action.",
    layouts: ["cover", "before-after", "steps", "cta"],
    key: "before-after",
  },
  steps: {
    id: "steps",
    label: { en: "Step by step", ar: "خطوة بخطوة" },
    description: { en: "How to do it, in order", ar: "تعملها إزاي، بالترتيب" },
    structure: "A how-to: the cover promises the result. Steps slides in order, each step a real action (a real screen, a real tap), ending on the result. Close on the call to action.",
    layouts: ["cover", "steps", "list", "cta"],
    key: "steps",
  },
  versus: {
    id: "versus",
    label: { en: "This vs that", ar: "ده ولا ده" },
    description: { en: "Two choices customers debate", ar: "اختيارين العملاء بيتخانقوا عليهم" },
    structure:
      "This vs that (the trending 'which one?' debate): the cover frames two choices the audience really debates (e.g. booking in DMs vs a booking page). 1-2 versus slides comparing them point by point (2-4 points each side), fair to both. A verdict slide (quote or stat) where the client's way wins for honest reasons. Close on the call to action.",
    layouts: ["cover", "versus", "quote", "stat", "cta"],
    key: "versus",
    caption: "End the caption by asking which side the reader is on.",
  },
  teardown: {
    id: "teardown",
    label: { en: "Teardown", ar: "تشريح" },
    description: { en: "What to fix in a typical example", ar: "إيه اللي يتصلّح في مثال معروف" },
    structure: "A teardown: take one typical real-world example the audience will recognise (a typical bio link, a typical booking DM) and show what to fix. The cover names it ('I fixed a typical coach's bio link'). Fix slides, one issue each, then a before-after of the result. Never name or mock a real person or competitor. Close on the call to action.",
    layouts: ["cover", "fix", "before-after", "cta"],
    key: "fix",
  },
  story: {
    id: "story",
    label: { en: "Customer story", ar: "حكاية عميل" },
    description: { en: "One moment, told like a chat", ar: "موقف واحد، متحكي زي الشات" },
    structure: "A short story of one typical customer moment: the cover hooks with the moment. Chat slides show the real conversation (the customer and the business, 3-5 short messages), then the turn, then the result (quote or before-after). Make it plausible and typical; never present an invented person as a real client. Close on the call to action.",
    layouts: ["cover", "chat", "quote", "before-after", "cta"],
    key: "chat",
  },
  stats: {
    id: "stats",
    label: { en: "Stats", ar: "أرقام" },
    description: { en: "Numbers that change minds", ar: "أرقام تغيّر رأيك" },
    structure: "Numbers that matter to the audience: the cover leads with the most surprising one. Stat and chart slides, each with what the number means for the customer. Numbers not in the client's facts are examples and are marked as such. Close on the call to action.",
    layouts: ["cover", "stat", "chart", "cta"],
    key: "stat",
  },
  faq: {
    id: "faq",
    label: { en: "People also ask", ar: "أسئلة الناس" },
    description: { en: "Real questions, honest short answers", ar: "أسئلة حقيقية وإجابات قصيرة صادقة" },
    structure: "The questions people really ask before buying (as searched and asked in DMs): the cover names the topic. 3-5 faq slides, one question each in the customer's words and a short honest answer from the client's knowledge. Close on the call to action.",
    layouts: ["cover", "faq", "cta"],
    key: "faq",
    caption: "Invite readers to ask their own question in the comments.",
  },
  comment: {
    id: "comment",
    label: { en: "Comment to get", ar: "علّق وخد" },
    description: { en: "Real value, then “comment KEYWORD”", ar: "قيمة حقيقية وبعدين «علّق بكلمة»" },
    structure:
      "Comment-to-get: give real value first (a short list, checklist or steps). The last slide asks readers to comment one short keyword to receive something the client can really send in a DM: the booking link, a free call slot, or the checklist itself in a message. Never promise a PDF, guide, template or file the client hasn't said they have.",
    layouts: ["cover", "list", "checklist", "steps", "cta"],
    key: "cta",
    caption: "Repeat the keyword in the caption: 'Comment «KEYWORD» and we'll send you …' (only what the client can send).",
  },
};

export function formatOf(id: string | undefined): PostFormat | undefined {
  return id && (FORMAT_IDS as readonly string[]).includes(id) ? FORMATS[id as FormatId] : undefined;
}

/** "Auto": the format the idea's angle points to; none for angles any format fits (a trend). */
export function formatForIdea(idea: Pick<Idea, "angle">): FormatId | undefined {
  const byAngle: Partial<Record<Idea["angle"], FormatId>> = { myth: "myth", mistakes: "mistakes", list: "list", "before-after": "before-after", "how-to": "steps", story: "story", stat: "stats", question: "faq" };
  return byAngle[idea.angle];
}

/** What a carousel misses to be its format, as sentences for the writer. */
export function formatProblems(slides: Slide[], id: FormatId | undefined): string[] {
  const format = formatOf(id);
  if (!format || format.key === "cta" || format.key === "cover") return [];
  return slides.some((slide) => slide.layout === format.key) ? [] : [`This is a "${format.label.en}" post: it needs at least one ${format.key} slide.`];
}
