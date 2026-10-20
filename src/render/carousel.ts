import { existsSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { extname, join } from "node:path";

import puppeteer from "puppeteer-core";

import { styleOf } from "../clients/styles.ts";
import type { Client, Slide } from "../clients/types.ts";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const WIDTH = 1080;
const HEIGHT = 1350;

export type SlideContext = { client: Pick<Client, "language" | "instagramHandle" | "brand">; index: number; total: number; logo?: string; art?: string; style?: string };

const WORDS = {
  ar: { myth: "خرافة", fact: "الحقيقة", before: "قبل", after: "بعد" },
  en: { myth: "Myth", fact: "Fact", before: "Before", after: "After" },
};

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The slide's own content; `data-fit` marks text that may shrink, with its smallest size. */
function body(slide: Slide, ctx: SlideContext): string {
  const w = WORDS[ctx.client.language];
  const art = ctx.art ? `<img class="art${slide.layout === "cover" ? " art-cover" : ""}" src="${ctx.art}" alt="">` : "";
  switch (slide.layout) {
    case "cover":
      return `${art}<h1 data-fit="44">${escape(slide.title)}</h1>${slide.subtitle ? `<p class="sub" data-fit="26">${escape(slide.subtitle)}</p>` : ""}`;
    case "stat":
      return `${art}<div class="stat">${escape(slide.value)}</div><h2 data-fit="32">${escape(slide.label)}</h2>${slide.note ? `<p class="sub" data-fit="24">${escape(slide.note)}</p>` : ""}`;
    case "list":
      return `${art}<h2 data-fit="36">${escape(slide.title)}</h2><ol class="list">${slide.items.map((item, i) => `<li><span class="num">${i + 1}</span><span data-fit="26">${escape(item)}</span></li>`).join("")}</ol>`;
    case "myth-fact":
      return `${art}<div class="card muted"><span class="tag">✕ ${w.myth}</span><p data-fit="28">${escape(slide.myth)}</p></div><div class="card hot"><span class="tag">✓ ${w.fact}</span><p data-fit="28">${escape(slide.fact)}</p></div>`;
    case "before-after":
      return `${art}<div class="cols"><div class="card muted"><span class="tag">${w.before}</span>${slide.before.map((l) => `<p data-fit="24">${escape(l)}</p>`).join("")}</div><div class="card hot"><span class="tag">${w.after}</span>${slide.after.map((l) => `<p data-fit="24">${escape(l)}</p>`).join("")}</div></div>`;
    case "steps":
      return `${art}<h2 data-fit="36">${escape(slide.title)}</h2><div class="steps">${slide.steps.map((step, i) => `<div class="step"><span class="num">${i + 1}</span><span data-fit="26">${escape(step)}</span></div>`).join("")}</div>`;
    case "quote":
      return `${art}<div class="mark">“</div><blockquote data-fit="34">${escape(slide.text)}</blockquote>${slide.by ? `<p class="sub">— ${escape(slide.by)}</p>` : ""}`;
    case "chart": {
      const max = Math.max(...slide.bars.map((bar) => bar.value), 1);
      // A short unit ("%", "x") sits beside each value; a long one ("% من الزوار (مثال)") once, under the title.
      const unit = slide.unit ?? "";
      const short = unit.length <= 3 ? unit : (unit.match(/^[%x×$€£]+/)?.[0] ?? "");
      const caption = unit.length > 3 ? `<p class="sub" data-fit="24">${escape(unit)}</p>` : "";
      return `${art}<h2 data-fit="36">${escape(slide.title)}</h2>${caption}<div class="bars">${slide.bars
        .map(
          (bar) =>
            `<div class="bar"><span class="bar-label" data-fit="22">${escape(bar.label)}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.round((bar.value / max) * 100)}%"></div></div><span class="bar-value">${bar.value}${escape(short)}</span></div>`,
        )
        .join("")}</div>`;
    }
    case "cta":
      return `${art}${ctx.logo ? `<img class="cta-logo" src="${ctx.logo}" alt="">` : ""}<h1 data-fit="44">${escape(slide.title)}</h1><div class="button">${escape(slide.button)}</div><p class="sub link">${escape(slide.url.replace(/^https?:\/\//, ""))}</p>`;
  }
}

/** One slide as a whole HTML page at 1080×1350, in the client's colours and fonts. */
export function slideHtml(slide: Slide, ctx: SlideContext): string {
  const { colors, fonts, googleFonts } = ctx.client.brand;
  const arabic = ctx.client.language === "ar";
  const fallback = arabic ? "'SF Arabic', 'Geeza Pro', sans-serif" : "'SF Pro Display', 'Helvetica Neue', sans-serif";
  const families = googleFonts.filter((family) => family === fonts.heading || family === fonts.body);
  const link = families.length
    ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${families.map((f) => `family=${f.replace(/ /g, "+")}:wght@400;600;700;800`).join("&")}&display=block">`
    : "";
  const handle = ctx.client.instagramHandle?.trim().replace(/^@/, "");
  return `<!doctype html><html lang="${ctx.client.language}" dir="${arabic ? "rtl" : "ltr"}"><head><meta charset="utf-8">${link}<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${WIDTH}px;height:${HEIGHT}px;overflow:hidden}
body{background:radial-gradient(circle at ${arabic ? "15%" : "85%"} 8%, ${colors.accent}33, transparent 55%),radial-gradient(circle at ${arabic ? "90%" : "10%"} 95%, ${colors.cta}1f, transparent 50%),${colors.background};
  color:${colors.text};font-family:'${fonts.body}',${fallback};line-height:${arabic ? 1.55 : 1.3};display:flex;flex-direction:column;padding:72px 84px}
h1,h2,.stat,.button,.tag,.num{font-family:'${fonts.heading}','${fonts.body}',${fallback};font-weight:800}
header{display:flex;align-items:center;height:64px}
header img{height:56px;width:auto;max-width:220px;object-fit:contain}
.content{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:36px;overflow:hidden}
footer{display:flex;justify-content:space-between;align-items:center;height:48px;font-size:26px;color:${colors.muted}}
h1{font-size:88px;line-height:1.15}
h2{font-size:60px;line-height:1.2}
.sub{font-size:36px;color:${colors.muted}}
.art{width:340px;height:340px;object-fit:cover;border-radius:36px;align-self:center;flex:none}
.art-cover{width:600px;height:600px}
.stat{font-size:220px;line-height:1;color:${colors.cta}}
.list,.steps{list-style:none;display:flex;flex-direction:column;gap:22px}
.list li,.step{display:flex;gap:24px;align-items:center;background:${colors.panel};border-radius:28px;padding:26px 30px;font-size:38px}
.num{flex:none;width:64px;height:64px;border-radius:50%;display:grid;place-items:center;background:${colors.cta};color:${colors.background};font-size:34px}
.card{background:${colors.panel};border-radius:32px;padding:34px 38px;display:flex;flex-direction:column;gap:16px;font-size:40px;flex:1}
.content>.card{flex:none}
.card.muted p{color:${colors.muted};text-decoration:line-through;text-decoration-color:${colors.muted}88}
.card.hot{outline:4px solid ${colors.cta}}
.tag{font-size:30px;color:${colors.accent}}
.card.hot .tag{color:${colors.cta}}
.cols{display:flex;gap:28px}
.cols .card{font-size:34px}
.mark{font-size:220px;line-height:.6;color:${colors.accent};height:110px}
blockquote{font-size:62px;line-height:1.35;font-weight:600}
.bars{display:flex;flex-direction:column;gap:30px}
.bar{display:grid;grid-template-columns:260px 1fr 140px;gap:20px;align-items:center;font-size:32px}
.bar-track{height:44px;border-radius:22px;background:${colors.panel};overflow:hidden}
.bar-fill{height:100%;border-radius:22px;background:linear-gradient(90deg,${colors.accent},${colors.cta})}
.bar-value{font-weight:700;color:${colors.cta}}
.cta-logo{height:120px;width:auto;max-width:360px;object-fit:contain;align-self:center}
.content:has(.button){text-align:center;align-items:center}
.button{background:${colors.cta};color:${colors.background};font-size:52px;padding:30px 64px;border-radius:999px}
.link{direction:ltr}
${styleOf(ctx.style).css(colors)}
</style></head><body>
<header>${ctx.logo && slide.layout !== "cta" ? `<img src="${ctx.logo}" alt="">` : ""}</header>
<main class="content">${body(slide, ctx)}</main>
<footer><span dir="ltr">${handle ? `@${escape(handle)}` : ""}</span><span dir="ltr">${ctx.index + 1} / ${ctx.total}</span></footer>
</body></html>`;
}

/** Shrinks every [data-fit] text in steps until the content fits, never below its floor. Runs in the page. */
function fitScript(): void {
  const box = document.querySelector(".content") as HTMLElement;
  const texts = [...document.querySelectorAll<HTMLElement>("[data-fit]")].map((el) => ({ el, base: parseFloat(getComputedStyle(el).fontSize), floor: Number(el.dataset.fit) }));
  for (let scale = 1; scale >= 0.3 && box.scrollHeight > box.clientHeight + 1; scale -= 0.05) {
    for (const t of texts) t.el.style.fontSize = `${Math.max(t.floor, t.base * scale)}px`;
  }
}

async function dataUrl(path: string): Promise<string | undefined> {
  if (!existsSync(path)) return undefined;
  const type = extname(path) === ".png" ? "image/png" : extname(path) === ".webp" ? "image/webp" : "image/jpeg";
  return `data:${type};base64,${(await readFile(path)).toString("base64")}`;
}

/**
 * Renders the slides to `dir`/slides/NN.png. Art files are read from `dir`
 * and the logo from `clientFolder` (the brand's paths are relative to it).
 */
export async function renderSlides(dir: string, client: Client, clientFolder: string, slides: Slide[], log: (message: string) => void = console.log, style?: string): Promise<string[]> {
  if (!existsSync(CHROME)) throw new Error("Google Chrome is needed to render slides");
  // Slides left from a longer earlier version would end up in the zip.
  await rm(join(dir, "slides"), { recursive: true, force: true });
  await mkdir(join(dir, "slides"), { recursive: true });
  const logo = client.brand.logo ? await dataUrl(join(clientFolder, client.brand.logo)) : undefined;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const files: string[] = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
    for (const [index, slide] of slides.entries()) {
      const art = slide.art?.file ? await dataUrl(join(dir, slide.art.file)) : undefined;
      await page.setContent(slideHtml(slide, { client, index, total: slides.length, logo, art, style }), { waitUntil: "load", timeout: 30000 });
      // Fonts load only once text asks for them, and display=block hides that text
      // until they arrive: load them by name before the screenshot.
      await page.evaluate(async (names: string[]) => {
        const sample = document.body.innerText || "a";
        await Promise.all(names.flatMap((name) => ["400", "800"].map((weight) => document.fonts.load(`${weight} 40px '${name}'`, sample).catch(() => []))));
        await document.fonts.ready;
      }, [client.brand.fonts.heading, client.brand.fonts.body]);
      await page.evaluate(fitScript);
      const file = `slides/${String(index + 1).padStart(2, "0")}.png`;
      // The viewport is the slide; a `clip` here makes this Chrome capture a blank frame.
      await page.screenshot({ path: join(dir, file) as `${string}.png` });
      files.push(file);
      log(`slides: ${index + 1}/${slides.length}`);
    }
  } finally {
    await browser.close();
  }
  return files;
}
