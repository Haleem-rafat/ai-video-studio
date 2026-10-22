import { test } from "node:test";
import assert from "node:assert/strict";

import { carouselPrompt } from "./carousel.ts";
import { FORMATS } from "./formats.ts";
import type { Client, Idea } from "./types.ts";

const client = {
  id: "risero",
  name: "Risero",
  url: "https://diaaeziada.risero.io/",
  language: "ar",
  avoid: "",
  brand: { summary: "Booking pages" },
  brief: { audience: "Coaches", problems: ["Lost bookings"], features: ["Self booking"], cta: { label: "احجز", url: "https://x" }, tone: "friendly" },
} as unknown as Client;
const idea: Idea = { id: "2026-10-22-1", format: "carousel", goal: "details", angle: "trend", hook: "الرسايل ولا صفحة حجز؟", outline: ["a", "b"], why: "", status: "new" };

test("a chosen format puts its structure, its layouts and its caption rule in the writer's prompt", () => {
  const text = carouselPrompt(client, idea, { format: "versus" });
  assert.match(text, /POST FORMAT: This vs that/);
  assert.ok(text.includes(FORMATS.versus.structure));
  assert.match(text, /versus/);
  assert.ok(text.includes(FORMATS.versus.caption!));
});

test("Auto takes the format from the idea's angle; with no format the prompt is as before", () => {
  assert.match(carouselPrompt(client, { ...idea, angle: "question" }, { format: "auto" }), /POST FORMAT: People also ask/);
  assert.doesNotMatch(carouselPrompt(client, idea, {}), /POST FORMAT/);
  assert.doesNotMatch(carouselPrompt(client, idea, { format: "auto" }), /POST FORMAT/, "a trend idea has no format of its own");
});

test("a single image ignores the format: it is one cover", () => {
  assert.doesNotMatch(carouselPrompt(client, { ...idea, format: "single" }, { format: "versus" }), /POST FORMAT/);
});

test("the writer sees the slide orders of the last carousels and is told not to repeat them", () => {
  const text = carouselPrompt(client, idea, { recentOrders: [["cover", "list", "list", "cta"], ["cover", "myth-fact", "cta"]] });
  assert.match(text, /cover → list → list → cta/);
  assert.match(text, /different order/i);
  assert.doesNotMatch(carouselPrompt(client, idea, {}), /RECENT SLIDE ORDERS/);
});

test("the writer is shown the pictures already used and never handed a stock subject to copy", () => {
  const text = carouselPrompt(client, idea, { recentPictures: ["a smartphone showing a calendar", "a coach at her desk at night"] });
  assert.match(text, /PICTURES ALREADY USED/);
  assert.match(text, /a smartphone showing a calendar/);
  assert.doesNotMatch(carouselPrompt(client, idea, {}), /a phone with a calendar/, "no example subject for the writer to copy");
});

test("with No pictures the writer plans no pictures at all", () => {
  assert.match(carouselPrompt(client, idea, { pictures: "none" }), /no pictures/i);
  assert.doesNotMatch(carouselPrompt(client, idea, { pictures: "none" }), /picture prompt for the cover/);
});
