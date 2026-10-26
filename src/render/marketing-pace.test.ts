import { test } from "node:test";
import assert from "node:assert/strict";

import { cameraCuts, stepsOf, stillStretches } from "./marketing-pace.ts";

test("camera cuts land on each phrase, never closer than a second apart", () => {
  assert.deepEqual(cameraCuts([0, 1.8, 2.2, 4.1], 6), [1.8, 4.1]);
});

test("a long phrase gets extra cuts, so the picture never holds still longer than ~2.2s", () => {
  const cuts = cameraCuts([0], 7.5);
  const gaps = [0, ...cuts, 7.5].slice(1).map((t, i, all) => t - (i ? all[i - 1] : 0));
  assert.ok(cuts.length >= 2, `cuts ${cuts}`);
  assert.ok(gaps.every((gap) => gap <= 2.3), `gaps ${gaps}`);
});

test("no cut in the scene's first or last half second", () => {
  assert.deepEqual(cameraCuts([0.3, 2, 5.8], 6), [2, 4]);
});

test("step scenes are numbered among themselves: Arabic ordinals, digits and English", () => {
  const scenes = [
    { narration: "السعر كام؟ ده سؤال عن الثقة.", visual: { headline: "السعر كام؟" } },
    { narration: "الخطوة الأولى: اسأله الأول.", visual: { headline: "الخطوة 1" } },
    { narration: "الخطوة 2: وضّح إيه اللي بيغيّر السعر.", visual: { headline: "" } },
    { narration: "الخطوة التالتة: اختم بخطوة واضحة.", visual: { headline: "اختم بوضوح" } },
    { narration: "رديت بإيه آخر مرة؟", visual: { headline: "" } },
  ];
  assert.deepEqual(stepsOf(scenes), [null, { n: 1, total: 3 }, { n: 2, total: 3 }, { n: 3, total: 3 }, null]);
  assert.deepEqual(stepsOf([{ narration: "Step 1: ask first.", visual: {} }, { narration: "Tip 2: be clear.", visual: {} }]), [{ n: 1, total: 2 }, { n: 2, total: 2 }]);
});

test("a single step mention isn't a step reel", () => {
  assert.deepEqual(stepsOf([{ narration: "الخطوة الأولى إنك تسأل.", visual: {} }, { narration: "وبس.", visual: {} }]), [null, null]);
});

test("still stretches: frames that barely change for longer than the limit", () => {
  // 4 frames a second: moving for 1s, still for 3s, moving again.
  const diffs = [...Array(4).fill(9), ...Array(12).fill(0.2), ...Array(4).fill(9)];
  assert.deepEqual(stillStretches(diffs, 4, 2.5), [{ from: 1, to: 4 }]);
  assert.deepEqual(stillStretches([...Array(8).fill(0.2), 9], 4, 2.5), []);
});

test("an English word or number in an Arabic caption keeps its punctuation outside", async () => {
  const { captionWord } = await import("./marketing.ts");
  assert.equal(captionWord("2:"), '<bdi dir="ltr">2</bdi>:');
  assert.equal(captionWord("Instagram،"), '<bdi dir="ltr">Instagram</bdi>،');
  assert.equal(captionWord("وضّح"), "وضّح");
  assert.equal(captionWord("$50"), '<bdi dir="ltr">$50</bdi>');
});
