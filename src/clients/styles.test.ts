import { test } from "node:test";
import assert from "node:assert/strict";

import { ART_STYLE_IDS, ART_STYLES, styleOf, withPictures } from "./styles.ts";
import type { Slide } from "./types.ts";

const colors = { background: "#0e1130", panel: "#161a42", text: "#f2f1fb", accent: "#b8b3ff", cta: "#ff7a59", muted: "#a9abd0" };

test("all 12 styles exist, each with a picture direction and its own slide CSS", () => {
  assert.deepEqual(ART_STYLE_IDS, ["flat", "clay", "cartoon", "isometric", "anime", "doodle", "papercut", "riso", "glass", "line", "collage", "photo"]);
  for (const id of ART_STYLE_IDS) {
    const style = ART_STYLES[id];
    assert.equal(style.id, id);
    assert.ok(style.label && style.picture.length > 20, id);
    assert.match(style.css(colors), new RegExp(`/\\* style:${id} \\*/`), id);
  }
});

test("an unknown or missing style is the flat one", () => {
  assert.equal(styleOf(undefined).id, "flat");
  assert.equal(styleOf("nope").id, "flat");
  assert.equal(styleOf("clay").id, "clay");
});

const slide = (title: string, art?: string): Slide => ({ layout: "list", title, items: ["a", "b"], ...(art ? { art: { prompt: art } } : {}) });
const seven = (prompts: number): Slide[] => [
  { layout: "cover", title: "cover", ...(prompts > 0 ? { art: { prompt: "p0" } } : {}) },
  ...Array.from({ length: 5 }, (_, i) => slide(`s${i + 1}`, i + 1 < prompts ? `p${i + 1}` : undefined)),
  { layout: "cta", title: "go", button: "b", url: "u" },
];

test("light keeps at most 3 pictures, the cover's first", () => {
  const out = withPictures(seven(5), "light", () => "x");
  assert.equal(out.filter((s) => s.art).length, 3);
  assert.equal(out[0].art?.prompt, "p0");
});

test("rich gives every slide a picture, filling missing prompts from the slide", () => {
  const out = withPictures(seven(2), "rich", (s) => `about ${"title" in s ? s.title : ""}`);
  assert.equal(out.filter((s) => s.art).length, 7);
  assert.equal(out[1].art?.prompt, "p1");
  assert.equal(out[3].art?.prompt, "about s3");
});
