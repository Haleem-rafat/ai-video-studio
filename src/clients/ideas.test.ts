import { test } from "node:test";
import assert from "node:assert/strict";

import { numberIdeas, parseTrends, type IdeaDraft } from "./ideas.ts";

test("parseTrends reads a JSON reply with fences and drops entries without a url", () => {
  const reply = 'Here you go:\n```json\n{"trends":[{"title":"A","summary":"s","url":"https://a"},{"title":"B","summary":"s","url":""}]}\n```';
  assert.deepEqual(parseTrends(reply), [{ title: "A", summary: "s", url: "https://a" }]);
});

test("parseTrends returns no trends for a reply that is not JSON", () => {
  assert.deepEqual(parseTrends("sorry, I can't search right now"), []);
});

test("numberIdeas continues the day's numbering and starts every idea as new", () => {
  const draft: IdeaDraft = { format: "reel", goal: "offer", angle: "story", hook: "h", topic: "pricing replies", outline: ["a"], why: "w", persona: "", step: "", trend: "" };
  const ideas = numberIdeas("2026-10-20", 5, [draft, draft]);
  assert.equal(ideas[0].topic, "pricing replies");
  assert.deepEqual(ideas.map((i) => i.id), ["2026-10-20-6", "2026-10-20-7"]);
  assert.equal(ideas[0].status, "new");
  assert.equal("trend" in ideas[0], false);
});
