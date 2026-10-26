import { test } from "node:test";
import assert from "node:assert/strict";

import { artPeople, artPlanPrompt, artRepeats } from "./art.ts";
import type { Project } from "../types.ts";

const project = {
  format: "short",
  scenes: [{ narration: "Clients disappear in your DMs", visual: { type: "marketing", beat: "pain" } }],
  marketing: { brand: { name: "Risero", summary: "Booking pages", colors: { background: "#111", accent: "#a78bfa", cta: "#ff8a65", text: "#fff" } }, brief: { audience: "Coaches" } },
} as unknown as Project;

test("without a client's history the art director's brief is as before", () => {
  assert.doesNotMatch(artPlanPrompt(project), /ALREADY USED/);
});

test("with a client's history it must pick another art style and never reuse a picture", () => {
  const text = artPlanPrompt({ ...project, marketing: { ...project.marketing!, artAvoid: { styles: ["soft 3D clay render"], pictures: ["a coach answering messages late at night"] } } });
  assert.match(text, /ART STYLES ALREADY USED/);
  assert.match(text, /soft 3D clay render/);
  assert.match(text, /PICTURES ALREADY USED/);
  assert.match(text, /a coach answering messages late at night/);
});

test("a plan that reuses a style or a picture is caught", () => {
  const avoid = { styles: ["soft 3D clay render, rounded shapes, studio lighting"], pictures: ["a coach answering messages late at night at her desk"] };
  const repeats = artRepeats({ style: "soft 3D clay render with rounded shapes and studio lighting", subjects: ["a coach answering messages late at night at her desk", "a lighthouse at dawn"] }, avoid);
  assert.equal(repeats.length, 2);
  assert.deepEqual(artRepeats({ style: "risograph print, grainy two-colour", subjects: ["a lighthouse at dawn"] }, avoid), []);
});

test("an Arabic video's people look like its audience: Egyptian by default, Gulf for a Gulf reel", () => {
  const arabic = { ...project, marketing: { ...project.marketing!, language: "ar" } } as Project;
  assert.match(artPlanPrompt(arabic), /Egyptian/);
  assert.match(artPeople(arabic.marketing!), /Arab/);
  const gulf = { ...project, marketing: { ...project.marketing!, language: "ar", dialect: "gulf" } } as Project;
  assert.match(artPeople(gulf.marketing!), /Gulf|Saudi|Emirati/);
  assert.doesNotMatch(artPeople(gulf.marketing!), /Egyptian/);
});

test("an English video's people aren't steered", () => {
  assert.equal(artPeople({ ...project.marketing!, language: "en" }), "");
});
