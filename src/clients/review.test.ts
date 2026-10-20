import { test } from "node:test";
import assert from "node:assert/strict";

import { needsRewrite, scriptOf } from "./review.ts";

test("a script is rewritten when any score is under 4", () => {
  assert.equal(needsRewrite({ understand: 4, feel: 5, truthful: 4, notes: [] }), false);
  assert.equal(needsRewrite({ understand: 3, feel: 5, truthful: 5, notes: [] }), true);
  assert.equal(needsRewrite(null), false, "no review (it failed) never blocks the post");
});

test("scriptOf turns slides and scenes into numbered text a reviewer can read", () => {
  const carousel = scriptOf({ slides: [{ layout: "cover", title: "عنوان" }, { layout: "list", title: "t", items: ["a", "b"] }] });
  assert.match(carousel, /1\. عنوان/);
  assert.match(carousel, /2\. t · a · b/);
  const reel = scriptOf({ scenes: [{ id: "s001", narration: "جملة", imagePrompt: "", visual: { type: "marketing", beat: "kinetic", headline: "h", words: ["w"], items: [] } }] });
  assert.match(reel, /1\. جملة \(on screen: h · w\)/);
});
