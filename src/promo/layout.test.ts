import { test } from "node:test";
import assert from "node:assert/strict";

import { concatList, scrollAt, VIEWPORTS } from "./record.ts";
import { layoutFor, SHAPES, type Rect } from "./layout.ts";

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

test("the scroll eases from the top to exactly the bottom, never past either", () => {
  assert.equal(scrollAt(-1, 5000), 0);
  assert.equal(scrollAt(0, 5000), 0);
  assert.equal(scrollAt(0.5, 5000), 2500);
  assert.equal(scrollAt(1, 5000), 5000);
  assert.equal(scrollAt(2, 5000), 5000);
  assert.ok(scrollAt(0.05, 5000) < 50, "the start is gentle");
  for (let t = 0; t < 1; t += 0.01) assert.ok(scrollAt(t + 0.01, 5000) >= scrollAt(t, 5000), "it never scrolls back");
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
