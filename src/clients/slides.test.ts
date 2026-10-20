import { test } from "node:test";
import assert from "node:assert/strict";

import { fitSlides, LIMITS, slideProblems, toSlide, type FlatSlide } from "./slides.ts";
import type { Slide } from "./types.ts";

const flat = (over: Partial<FlatSlide>): FlatSlide => ({
  layout: "list", title: "", subtitle: "", value: "", label: "", note: "", items: [], myth: "", fact: "",
  before: [], after: [], text: "", by: "", bars: [], unit: "", button: "", art: "", ...over,
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
  const [fitted] = fitSlides([long]) as [{ title: string }];
  assert.equal(fitted.title.length, LIMITS.title);
  assert.ok(fitted.title.endsWith("…"));
  assert.equal((long as { title: string }).title.length, LIMITS.title + 10, "the original is left alone");
});
