import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { renderSlides, slideHtml } from "./carousel.ts";
import type { Client, Slide } from "../clients/types.ts";

const brand = {
  url: "https://diaaeziada.risero.io/",
  name: "Risero",
  summary: "",
  services: [],
  language: "ar",
  photos: [],
  shots: [],
  text: "",
  colors: { background: "#0e1130", panel: "#161a42", text: "#f2f1fb", accent: "#b8b3ff", cta: "#ff7a59", muted: "#a9abd0" },
  fonts: { heading: "El Messiri", body: "Readex Pro" },
  googleFonts: ["El Messiri", "Readex Pro"],
} as Client["brand"];
const client = { language: "ar", brand } as Client;

test("Arabic slides are right-to-left and escape their text", () => {
  const html = slideHtml({ layout: "cover", title: "<b>صفحة</b> واحدة" }, { client, index: 0, total: 5 });
  assert.match(html, /dir="rtl"/);
  assert.match(html, /&lt;b&gt;صفحة/);
  assert.match(html, /1 \/ 5/);
});

test("no handle and no logo: no '@undefined' and no empty image", () => {
  const html = slideHtml({ layout: "list", title: "t", items: ["a", "b"] }, { client, index: 1, total: 5 });
  assert.doesNotMatch(html, /@undefined|@<|src=""/);
});

test("the handle and counter stay left-to-right on Arabic slides (not 'risero@' or '3 / 2')", () => {
  const html = slideHtml({ layout: "list", title: "t", items: ["a", "b"] }, { client: { ...client, instagramHandle: "risero" }, index: 1, total: 3 });
  assert.match(html, /<span dir="ltr">@risero<\/span>/);
  assert.match(html, /<span dir="ltr">2 \/ 3<\/span>/);
});

test("the chart scales bars to the largest value", () => {
  const html = slideHtml({ layout: "chart", title: "t", bars: [{ label: "a", value: 50 }, { label: "b", value: 100 }], unit: "%" }, { client, index: 2, total: 5 });
  assert.match(html, /width:50%/);
  assert.match(html, /width:100%/);
});

test("a long chart unit is shown once under the title, not beside every bar", () => {
  const html = slideHtml({ layout: "chart", title: "t", bars: [{ label: "مصر", value: 60 }, { label: "السعودية", value: 25 }], unit: "% من الزوار (مثال)" }, { client, index: 2, total: 5 });
  assert.equal(html.split("من الزوار").length - 1, 1);
  assert.match(html, /<span class="bar-value">60%?<\/span>/);
});

test("myth-fact cards keep their own height instead of filling the slide", () => {
  const html = slideHtml({ layout: "myth-fact", myth: "m", fact: "f" }, { client, index: 1, total: 5 });
  assert.match(html, /\.content>\.card\{flex:none\}/);
});

const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

test("renders 1080×1350 PNGs, even with very long Arabic text", { skip: !existsSync(chrome) && "needs Google Chrome", timeout: 90_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "carousel-"));
  if (process.env.SHOW_SLIDES) console.log(dir);
  const slides: Slide[] = [
    { layout: "cover", title: "صفحة واحدة تخلي العميل يحجز", subtitle: "من غير رسايل كتير" },
    { layout: "list", title: "ليه العميل بيختفي؟ ".repeat(4), items: ["رد متأخر على الرسايل ".repeat(3), "لينك بايو مفيهوش تجربة", "مواعيد بتتداخل"] },
    { layout: "cta", title: "احجز مكالمة مجانية", button: "احجز دلوقتي", url: "https://diaaeziada.risero.io/#booking-link" },
  ];
  const files = await renderSlides(dir, { ...client, instagramHandle: "risero" } as Client, dir, slides, () => {});
  assert.deepEqual(files, ["slides/01.png", "slides/02.png", "slides/03.png"]);
  for (const file of files) {
    const png = readFileSync(join(dir, file));
    assert.equal(png.readUInt32BE(16), 1080);
    assert.equal(png.readUInt32BE(20), 1350);
    // An empty background compresses to ~8 KB; a slide with text is far bigger.
    assert.ok(png.length > 40_000, `${file} looks blank (${png.length} bytes)`);
  }
});

test("a slide carries its art style's CSS, and flat when none is given", () => {
  assert.match(slideHtml({ layout: "cover", title: "t" }, { client, index: 0, total: 5, style: "cartoon" }), /\/\* style:cartoon \*\//);
  assert.match(slideHtml({ layout: "cover", title: "t" }, { client, index: 0, total: 5 }), /\/\* style:flat \*\//);
});
