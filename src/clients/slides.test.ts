import { test } from "node:test";
import assert from "node:assert/strict";

import { fitSlides, LIMITS, slideProblems, toSlide, type FlatSlide } from "./slides.ts";
import type { Slide } from "./types.ts";

const flat = (over: Partial<FlatSlide>): FlatSlide => ({
  layout: "list", title: "", subtitle: "", value: "", label: "", note: "", items: [], myth: "", fact: "",
  before: [], after: [], text: "", by: "", bars: [], unit: "", button: "", art: "",
  leftLabel: "", rightLabel: "", leftPoints: [], rightPoints: [], question: "", answer: "", problem: "", fix: "", messages: [], ...over,
});
const cta = { label: "احجز مكالمة مجانية", url: "https://diaaeziada.risero.io/#booking-link" };

test("toSlide keeps only its layout's fields and drops empty ones", () => {
  assert.deepEqual(toSlide(flat({ layout: "cover", title: "عنوان", art: "a calendar" }), cta), { layout: "cover", title: "عنوان", art: { prompt: "a calendar" } });
  assert.deepEqual(toSlide(flat({ layout: "list", title: "t", items: ["a", " ", "b"] }), cta), { layout: "list", title: "t", items: ["a", "b"] });
  assert.deepEqual(toSlide(flat({ layout: "steps", title: "t", items: ["one", "two"] }), cta), { layout: "steps", title: "t", steps: ["one", "two"] });
});

test("a cta slide always takes the client's link, and its label when the button is empty", () => {
  assert.deepEqual(toSlide(flat({ layout: "cta", title: "يلا" }), cta), { layout: "cta", title: "يلا", button: cta.label, url: cta.url });
});

test("a slide missing what its layout needs is dropped", () => {
  assert.equal(toSlide(flat({ layout: "stat", value: "" }), cta), null);
  assert.equal(toSlide(flat({ layout: "chart", title: "t", bars: [{ label: "a", value: 1 }] }), cta), null);
});

const cover: Slide = { layout: "cover", title: "t" };
const end: Slide = { layout: "cta", title: "t", button: "b", url: "u" };
const list: Slide = { layout: "list", title: "t", items: ["a", "b"] };

test("a carousel opens on a cover, ends on a cta and has 5-8 slides", () => {
  assert.deepEqual(slideProblems([cover, list, list, list, end], "carousel"), []);
  assert.match(slideProblems([list, list, list, list, end], "carousel").join("\n"), /cover/);
  assert.match(slideProblems([cover, list, list, list, list], "carousel").join("\n"), /cta/);
  assert.match(slideProblems([cover, list, end], "carousel").join("\n"), /5-8/);
});

test("a single image is one cover", () => {
  assert.deepEqual(slideProblems([cover], "single"), []);
  assert.match(slideProblems([cover, end], "single").join("\n"), /exactly 1/);
});

test("over-long text is reported, then cut with an ellipsis", () => {
  const long: Slide = { layout: "list", title: "ع".repeat(LIMITS.title + 10), items: ["a", "b"] };
  assert.match(slideProblems([cover, long, list, list, end], "carousel").join("\n"), /title/);
  const [fitted] = fitSlides([long]) as unknown as [{ title: string }];
  assert.equal(fitted.title.length, LIMITS.title);
  assert.ok(fitted.title.endsWith("…"));
  assert.equal((long as { title: string }).title.length, LIMITS.title + 10, "the original is left alone");
});

test("the new layouts: checklist, versus, faq, fix and chat come out typed, and incomplete ones are dropped", () => {
  assert.deepEqual(toSlide(flat({ layout: "checklist", title: "قبل ما تنشر", items: ["اللينك شغال", " ", "الأسعار واضحة"] }), cta), { layout: "checklist", title: "قبل ما تنشر", items: ["اللينك شغال", "الأسعار واضحة"] });
  assert.deepEqual(toSlide(flat({ layout: "versus", title: "", leftLabel: "الرسايل", rightLabel: "صفحة حجز", leftPoints: ["بطيء"], rightPoints: ["فوري", "24/7"] }), cta), {
    layout: "versus",
    left: { label: "الرسايل", points: ["بطيء"] },
    right: { label: "صفحة حجز", points: ["فوري", "24/7"] },
  });
  assert.equal(toSlide(flat({ layout: "versus", leftLabel: "A", rightLabel: "", leftPoints: ["x"], rightPoints: ["y"] }), cta), null);
  assert.deepEqual(toSlide(flat({ layout: "faq", question: "غالي؟", answer: "أول مكالمة مجانية" }), cta), { layout: "faq", question: "غالي؟", answer: "أول مكالمة مجانية" });
  assert.deepEqual(toSlide(flat({ layout: "fix", problem: "لينك بايو فيه ٦ لينكات", fix: "صفحة واحدة واضحة" }), cta), { layout: "fix", problem: "لينك بايو فيه ٦ لينكات", fix: "صفحة واحدة واضحة" });
  assert.deepEqual(
    toSlide(flat({ layout: "chat", messages: [{ from: "them", text: "متاح بكرة؟" }, { from: "us", text: " " }, { from: "us", text: "احجز من اللينك" }] }), cta),
    { layout: "chat", messages: [{ from: "them", text: "متاح بكرة؟" }, { from: "us", text: "احجز من اللينك" }] },
  );
  assert.equal(toSlide(flat({ layout: "chat", messages: [{ from: "them", text: "hi" }] }), cta), null, "a chat needs at least two messages");
});

test("the new layouts' texts are checked against their limits and cut to fit", () => {
  const long = "ا".repeat(400);
  const slides: Slide[] = [
    { layout: "faq", question: long, answer: long },
    { layout: "versus", left: { label: long, points: [long] }, right: { label: "b", points: ["c"] } },
    { layout: "chat", messages: [{ from: "them", text: long }, { from: "us", text: "ok" }] },
  ];
  const problems = slideProblems(slides, "single").join(" ");
  assert.match(problems, /question/);
  assert.match(problems, /answer/);
  assert.match(problems, /message/);
  assert.match(problems, /vsLabel/);
  const fitted = fitSlides(slides);
  assert.ok((fitted[0] as { question: string }).question.length <= LIMITS.question);
  assert.ok((fitted[2] as { messages: { text: string }[] }).messages[0].text.length <= LIMITS.message);
});

test("edited slides need a known layout and a picture description; a picture's file stays inside its post", async () => {
  const { editedSlideProblems } = await import("./slides.ts");
  assert.deepEqual(editedSlideProblems([{ layout: "cover", title: "x", art: { prompt: "a desk", file: "art/01.png" } }]), []);
  assert.equal(editedSlideProblems([]).length, 1);
  assert.equal(editedSlideProblems([{ layout: "poster" }, { layout: "quote", text: "x", art: { prompt: " " } }, { layout: "quote", text: "x", art: { prompt: "y", file: "../../client.json" } }]).length, 3);
});
