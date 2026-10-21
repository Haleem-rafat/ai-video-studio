import { test } from "node:test";
import assert from "node:assert/strict";

import { matchAnchors, positionAt, syncPlan, type Anchor } from "./sync.ts";

const a = (key: string, top: number): Anchor => ({ key, top });

test("headings on both pages are paired in order, from the top to the bottom of each page", () => {
  const pairs = matchAnchors([a("intro", 300), a("topics", 5800), a("book", 7600), a("faq", 9800)], [a("intro", 700), a("topics", 5700), a("book", 7600), a("faq", 10000)], 10400, 10800);
  assert.deepEqual(pairs, [
    [0, 0],
    [300, 700],
    [5800, 5700],
    [7600, 7600],
    [9800, 10000],
    [10400, 10800],
  ]);
});

test("headings stacked out of order (captions inside an animated section) and ones only one page has are left out", () => {
  const pairs = matchAnchors(
    [a("name", 416), a("judge", 342), a("chair", 271), a("says", 5131), a("only-desktop", 6000), a("topics", 5822)],
    [a("name", 760), a("judge", 689), a("chair", 659), a("says", 5199), a("topics", 5774)],
    10429,
    10836,
  );
  // The longest run that goes down both pages together.
  for (let i = 1; i < pairs.length; i++) {
    assert.ok(pairs[i][0] > pairs[i - 1][0] && pairs[i][1] > pairs[i - 1][1], `pair ${i} goes back up`);
  }
  assert.ok(pairs.some(([d, p]) => d === 5131 && p === 5199));
  assert.ok(pairs.some(([d, p]) => d === 5822 && p === 5774));
  assert.ok(!pairs.some(([d]) => d === 6000));
});

test("a heading below the last scroll position counts as the bottom", () => {
  const pairs = matchAnchors([a("last", 10696)], [a("last", 11149)], 10429, 10836);
  assert.deepEqual(pairs, [
    [0, 0],
    [10429, 10836],
  ]);
});

test("both screens reach every paired heading at the same moment", () => {
  const plan = syncPlan(
    [
      [0, 0],
      [5000, 5200],
      [8000, 7600],
      [10000, 10800],
    ],
    { speed: 200, cap: 120 },
  );
  for (const [i, u] of plan.at.entries()) {
    assert.equal(positionAt(plan.desktop, plan.at, u), plan.desktop[i]);
    assert.equal(positionAt(plan.phone, plan.at, u), plan.phone[i]);
  }
  // Each stretch takes as long as the screen with more to scroll needs at that speed.
  assert.ok(Math.abs(plan.seconds - (5200 + 3000 + 3200) / 200) < 0.01);
});

test("the scroll is smooth: it never goes back up and never jumps", () => {
  const plan = syncPlan(
    [
      [0, 0],
      [300, 2000],
      [5000, 2100],
      [10000, 10800],
    ],
    { speed: 200, cap: 120 },
  );
  let before = { d: 0, p: 0 };
  for (let u = 0; u <= 1.0001; u += 0.001) {
    const now = { d: positionAt(plan.desktop, plan.at, u), p: positionAt(plan.phone, plan.at, u) };
    assert.ok(now.d >= before.d - 0.001 && now.p >= before.p - 0.001, `goes back up at ${u.toFixed(3)}`);
    // No more than 2.5% of the page in a thousandth of the time.
    assert.ok(now.d - before.d < 250 && now.p - before.p < 270, `jumps at ${u.toFixed(3)}`);
    before = now;
  }
});

test("a set length stops both screens at the same paired place, part way down", () => {
  const plan = syncPlan(
    [
      [0, 0],
      [5000, 5200],
      [10000, 10800],
    ],
    { speed: 200, cap: 30 },
  );
  assert.equal(plan.seconds, 30);
  const end = { d: plan.desktop.at(-1)!, p: plan.phone.at(-1)! };
  // 30 s at 200 px/s on the phone (the longer page here) is 6000 px, which on the laptop is part of the second stretch.
  assert.ok(Math.abs(end.p - 6000) < 1);
  assert.ok(end.d > 5000 && end.d < 10000);
  assert.equal(plan.at.at(-1), 1);
});

test("a page that doesn't scroll still gets a moment on screen", () => {
  const plan = syncPlan([[0, 0]], { speed: 200, cap: 120 });
  assert.ok(plan.seconds >= 3);
  assert.equal(positionAt(plan.desktop, plan.at, 0.5), 0);
});
