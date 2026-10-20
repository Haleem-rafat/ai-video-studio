import { test } from "node:test";
import assert from "node:assert/strict";

import { captionText, cleanHashtags, ideaProblems, normalizeHook } from "./rules.ts";

const good = [
  { format: "reel", goal: "awareness", angle: "myth", hook: "بتنشر كل يوم وجدولك فاضي؟" },
  { format: "carousel", goal: "details", angle: "how-to", hook: "إزاي العميل يحجز لوحده" },
  { format: "carousel", goal: "offer", angle: "before-after", hook: "قبل وبعد صفحة الحجز" },
  { format: "single", goal: "awareness", angle: "stat", hook: "٣ رسايل قبل كل حجز" },
  { format: "carousel", goal: "details", angle: "mistakes", hook: "٥ غلطات في لينك البايو" },
] as const;

test("a good batch has no problems", () => {
  assert.deepEqual(ideaProblems([...good], []), []);
});

test("counts, reels, carousels and goals are checked", () => {
  const noReel = good.map((i) => ({ ...i, format: "carousel" as const }));
  assert.match(ideaProblems(noReel, []).join("\n"), /reel/);
  const noOffer = good.map((i) => ({ ...i, goal: "awareness" as const }));
  assert.match(ideaProblems(noOffer, []).join("\n"), /offer/);
  assert.match(ideaProblems(good.slice(0, 4), []).join("\n"), /exactly 5/);
});

test("repeated angles and old hooks are caught, whatever the punctuation", () => {
  const twice = [...good.slice(0, 4), { ...good[4], angle: "myth" as const }];
  assert.match(ideaProblems(twice, []).join("\n"), /angle "myth"/);
  assert.match(ideaProblems([...good], ["بتنشر كل يوم، وجدولك فاضي!"]).join("\n"), /already used/);
});

test("hooks over 120 characters are too long", () => {
  const long = [{ ...good[0], hook: "ا".repeat(121) }, ...good.slice(1)];
  assert.match(ideaProblems(long, []).join("\n"), /120/);
});

test("normalizeHook drops Arabic diacritics, punctuation and case", () => {
  assert.equal(normalizeHook("  Hello, World!  "), "hello world");
  assert.equal(normalizeHook("مَرْحَبًا؟"), "مرحبا");
});

test("hashtags lose # and spaces, are unique and at most 30", () => {
  const tags = cleanHashtags(["#Risero", "حجز مواعيد", "risero", ...Array.from({ length: 40 }, (_, i) => `t${i}`)]);
  assert.equal(tags[0], "Risero");
  assert.equal(tags[1], "حجز_مواعيد");
  assert.equal(tags.length, 30);
});

test("captionText keeps the whole post within 2,200 characters", () => {
  const text = captionText("x".repeat(3000), ["a", "b"]);
  assert.ok(text.length <= 2200);
  assert.ok(text.endsWith("#a #b"));
  assert.ok(text.includes("…"));
});
