import { test } from "node:test";
import assert from "node:assert/strict";

import { completion, knownAnswers, mergeAnswers, QUESTIONS, SECTIONS, validateAnswers, visible, type Answers } from "./questionnaire.ts";
import type { Client } from "./types.ts";

const client = {
  id: "risero",
  name: "Risero",
  url: "https://diaaeziada.risero.io/",
  language: "ar",
  avoid: "No prices",
  brand: { summary: "Booking pages for coaches", services: ["Booking page", "Dashboard"] },
  brief: { business: "Booking pages", audience: "Coaches and consultants", problems: ["Lost bookings"], result: "Full calendar", features: ["Self booking"], cta: { label: "Book a free call", url: "https://cal.com/x" }, tone: "friendly" },
  knowledge: { howItWorks: [], different: ["All in one place"], personas: [], objections: [], proof: [], facts: [], use: [], avoid: ["No invented results"], questions: [], updatedAt: "" },
} as unknown as Client;

test("every question has an id, both languages, a section and a known kind; ids are unique", () => {
  const ids = new Set<string>();
  for (const q of QUESTIONS) {
    assert.ok(!ids.has(q.id), `duplicate ${q.id}`);
    ids.add(q.id);
    assert.ok(q.label.en && q.label.ar, q.id);
    assert.ok(SECTIONS.some((s) => s.id === q.section), q.id);
    assert.ok(["short", "long", "single", "multi"].includes(q.kind), q.id);
    if (q.kind === "single" || q.kind === "multi") assert.ok(q.options?.length, `${q.id} has no options`);
  }
  assert.ok(SECTIONS.length >= 8);
});

test("answers are cleaned: unknown questions, wrong option ids and over-long text are reported, the rest kept", () => {
  const { answers, errors } = validateAnswers({
    "overview.what": "  We build booking pages  ",
    "voice.tone": ["friendly", "nonsense"],
    "made.up": "x",
    "overview.different": "a".repeat(5000),
    "goals.primary": "leads",
  });
  assert.equal(answers["overview.what"], "We build booking pages");
  assert.deepEqual(answers["voice.tone"], ["friendly"]);
  assert.equal(answers["goals.primary"], "leads");
  assert.equal(answers["made.up"], undefined);
  assert.ok((answers["overview.different"] as string).length <= 2000);
  assert.ok(errors.some((e) => e.question === "made.up"));
  assert.ok(errors.some((e) => e.question === "voice.tone"));
  assert.ok(errors.some((e) => e.question === "overview.different"));
});

test("a choice can carry the client's own words next to the options", () => {
  const { answers, errors } = validateAnswers({ "voice.tone": ["premium", "other:warm like a friend"] });
  assert.deepEqual(answers["voice.tone"], ["premium", "other:warm like a friend"]);
  assert.equal(errors.length, 0);
});

test("empty answers are dropped, so clearing a field clears it", () => {
  const base: Answers = { "overview.what": { value: "Booking pages", source: "website", updatedAt: "" } };
  const merged = mergeAnswers(base, { "overview.what": "", "audience.who": "Coaches" }, "app", "2026-10-21T10:00:00.000Z");
  assert.equal(merged["overview.what"], undefined);
  assert.equal(merged["audience.who"]?.value, "Coaches");
  assert.equal(merged["audience.who"]?.source, "app");
});

test("conditional questions show only when their trigger is answered", () => {
  const offer = QUESTIONS.find((q) => q.id === "goals.offerDetails")!;
  assert.equal(visible(offer, {}), false);
  assert.equal(visible(offer, { "goals.hasOffer": "yes" }), true);
});

test("progress counts required and visible questions; a partial profile is fine", () => {
  const empty = completion({});
  assert.equal(empty.answered, 0);
  assert.ok(empty.required > 0);
  assert.equal(empty.done, false);
  const some = completion({ "overview.what": { value: "Booking pages", source: "app", updatedAt: "" } });
  assert.equal(some.answered, 1);
  assert.ok(some.bySection.overview.answered === 1);
});

test("what the website and Knowledge already say is offered for confirmation, not asked from scratch", () => {
  const known = knownAnswers(client);
  assert.match(known["overview.what"]!, /Booking pages for coaches/);
  assert.match(known["audience.who"]!, /Coaches and consultants/);
  assert.match(known["rules.never"]!, /No prices/);
  assert.equal(known["output.language"], "ar");
});
