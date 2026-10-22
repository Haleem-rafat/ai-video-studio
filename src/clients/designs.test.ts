import { test } from "node:test";
import assert from "node:assert/strict";

import { DESIGN_IDS, DESIGNS, designOf } from "./designs.ts";
import { slideHtml, type SlideContext } from "../render/carousel.ts";
import type { Slide } from "./types.ts";

const brand = {
  colors: { background: "#14112b", panel: "#221d45", text: "#f4f1ff", accent: "#a78bfa", cta: "#ff8a65", muted: "#b9b3d9" },
  fonts: { heading: "Cairo", body: "Cairo" },
  googleFonts: ["Cairo"],
};
const ctx = (extra: Partial<SlideContext> = {}): SlideContext => ({ client: { language: "ar", instagramHandle: "risero", brand } as never, index: 0, total: 5, ...extra });
const cover: Slide = { layout: "cover", title: "٥ أخطاء <بتضيّع> عليك عملاء", subtitle: "اعرفها قبل ما تنشر" };

test("twelve designs, Classic first, each with a name, a description and its own CSS marker", () => {
  assert.equal(DESIGN_IDS.length, 12);
  assert.equal(DESIGN_IDS[0], "classic");
  for (const id of DESIGN_IDS) {
    const design = DESIGNS[id];
    assert.equal(design.id, id);
    assert.ok(design.label.en && design.label.ar && design.description.en && design.description.ar, id);
    assert.match(design.css({ c: brand.colors, arabic: true, name: "Risero", handle: "risero", index: 0, total: 5 }), new RegExp(`/\\* design:${id} \\*/`));
  }
  assert.equal(designOf("nope").id, "classic");
  assert.equal(designOf(undefined).id, "classic");
});

test("Classic is today's slide exactly: no design, or Classic, gives the same page", () => {
  assert.equal(slideHtml(cover, ctx({ style: "clay", design: "classic" })), slideHtml(cover, ctx({ style: "clay" })));
});

test("a design restyles the slide; the art style then only draws the pictures", () => {
  const html = slideHtml(cover, ctx({ style: "clay", design: "neon" }));
  assert.match(html, /\/\* design:neon \*\//);
  assert.doesNotMatch(html, /\/\* style:clay \*\//);
  // Classic keeps the art style's slide look, as before.
  assert.match(slideHtml(cover, ctx({ style: "clay" })), /\/\* style:clay \*\//);
});

test("every design keeps text escaped, right to left in Arabic, and the client's name in its own CSS safely quoted", () => {
  for (const id of DESIGN_IDS) {
    const html = slideHtml(cover, ctx({ design: id, client: { language: "ar", instagramHandle: 'ri"sero', brand } as never }));
    assert.match(html, /dir="rtl"/, id);
    assert.match(html, /&lt;بتضيّع&gt;/, id);
    assert.doesNotMatch(html, /<بتضيّع>/, id);
    assert.doesNotMatch(html, /content:\s*"[^"]*ri"sero/, `${id}: a quote in the handle must not break the CSS`);
  }
});
