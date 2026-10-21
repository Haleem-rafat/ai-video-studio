import { test } from "node:test";
import assert from "node:assert/strict";

import { concatList, scrollAt, scrollPlan, SPEEDS, VIEWPORTS } from "./record.ts";
import { layoutFor, SHAPES, type Rect } from "./layout.ts";
import { promoFilter } from "./compose.ts";

const inside = (rect: Rect, width: number, height: number) => rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= width && rect.y + rect.h <= height;
const ratio = (rect: Rect) => rect.w / rect.h;

for (const shape of SHAPES) {
  test(`${shape}: both devices sit fully on the canvas, screens keep the recordings' shape`, () => {
    const layout = layoutFor(shape);
    assert.equal(layout.width % 2, 0);
    assert.equal(layout.height % 2, 0);
    for (const device of ["laptop", "phone"] as const) {
      assert.ok(inside(layout[device].body, layout.width, layout.height), `${device} body is off the canvas`);
      const screen = layout[device].screen;
      const view = VIEWPORTS[device === "laptop" ? "desktop" : "phone"];
      assert.ok(Math.abs(ratio(screen) - view.width / view.height) < 0.01, `${device} screen is stretched`);
      // ffmpeg's yuv420p needs even sizes.
      assert.equal(screen.w % 2, 0);
      assert.equal(screen.h % 2, 0);
      const body = layout[device].body;
      assert.ok(body.x < screen.x && body.y < screen.y && body.x + body.w > screen.x + screen.w, `${device} bezel doesn't wrap the screen`);
    }
  });

  test(`${shape}: the phone's status bar sits right above its screen, inside the phone`, () => {
    const { phone } = layoutFor(shape);
    assert.equal(phone.bar.y + phone.bar.h, phone.screen.y);
    assert.equal(phone.bar.x, phone.screen.x);
    assert.ok(phone.bar.y > phone.body.y && phone.bar.h > 20);
  });

  test(`${shape}: the phone overlaps the laptop a little, like a showcase, but leaves most of its screen visible`, () => {
    const { laptop, phone } = layoutFor(shape);
    const overlapW = Math.max(0, Math.min(laptop.screen.x + laptop.screen.w, phone.body.x + phone.body.w) - Math.max(laptop.screen.x, phone.body.x));
    const overlapH = Math.max(0, Math.min(laptop.screen.y + laptop.screen.h, phone.body.y + phone.body.h) - Math.max(laptop.screen.y, phone.body.y));
    const covered = (overlapW * overlapH) / (laptop.screen.w * laptop.screen.h);
    assert.ok(covered > 0, "the devices don't touch");
    assert.ok(covered < 0.25, `the phone hides ${Math.round(covered * 100)}% of the laptop screen`);
  });
}

test("the scroll starts and stops softly, moves at a steady speed between, and never passes either end", () => {
  const ramp = 0.1;
  assert.equal(scrollAt(-1, 5000, ramp), 0);
  assert.equal(scrollAt(0, 5000, ramp), 0);
  assert.equal(scrollAt(0.5, 5000, ramp), 2500);
  assert.equal(scrollAt(1, 5000, ramp), 5000);
  assert.equal(scrollAt(2, 5000, ramp), 5000);
  assert.ok(scrollAt(0.02, 5000, ramp) < 30, "the start is gentle");
  // Steady in the middle: equal time, equal distance.
  const step = (t: number) => scrollAt(t + 0.1, 5000, ramp) - scrollAt(t, 5000, ramp);
  assert.ok(Math.abs(step(0.3) - step(0.6)) <= 1);
  for (let t = 0; t < 1; t += 0.01) assert.ok(scrollAt(t + 0.01, 5000, ramp) >= scrollAt(t, 5000, ramp), "it never scrolls back");
});

test("slow, normal and fast are real reading speeds, slow the slowest", () => {
  assert.ok(SPEEDS.slow < SPEEDS.normal && SPEEDS.normal < SPEEDS.fast);
  assert.ok(SPEEDS.slow <= 160, "slow lets a viewer read");
});

test("the whole page takes as long as its speed needs; a set length shows the part of the page that fits", () => {
  const whole = scrollPlan(10000, { speed: "slow", length: "page" });
  assert.equal(whole.share, 1);
  assert.ok(Math.abs(whole.seconds - 10000 / SPEEDS.slow) < 1.5);

  const short = scrollPlan(10000, { speed: "slow", length: 30 });
  assert.ok(short.seconds <= 30);
  assert.ok(short.share < 1 && short.share > 0.3);

  // A short page at a set length ends when the page does, not padded to the length.
  const tiny = scrollPlan(900, { speed: "normal", length: 60 });
  assert.equal(tiny.share, 1);
  assert.ok(tiny.seconds < 10);

  // A page that doesn't scroll still gets a moment on screen; a huge one is capped.
  assert.ok(scrollPlan(0, { speed: "fast", length: "page" }).seconds >= 3);
  assert.ok(scrollPlan(200000, { speed: "slow", length: "page" }).seconds <= 120);
});

test("each frame plays for as long as it was on screen, and the last one is not dropped", () => {
  const list = concatList(
    [
      { file: "/a/00000.jpg", at: 10 },
      { file: "/a/00001.jpg", at: 10.5 },
    ],
    11.25,
  );
  assert.equal(list, "file '/a/00000.jpg'\nduration 0.5000\nfile '/a/00001.jpg'\nduration 0.7500\nfile '/a/00001.jpg'\n");
});

test("a promo without music still has a (silent) sound track, so every app plays it", () => {
  const layout = layoutFor("16x9");
  assert.match(promoFilter(layout, 30, false), /anullsrc/);
  assert.doesNotMatch(promoFilter(layout, 30, true), /anullsrc/);
  assert.match(promoFilter(layout, 30, true), /\[5:a\]/);
});
