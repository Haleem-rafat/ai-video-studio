import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

import puppeteer from "puppeteer-core";

import { slideHtml } from "../render/carousel.ts";
import { DESIGN_IDS, type DesignId } from "./designs.ts";
import { clientDir, postDir } from "./store.ts";
import type { Client, Post, Slide } from "./types.ts";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/** Sample slides a design is previewed with, in the client's language (no AI, no cost). */
export function sampleSlides(language: "en" | "ar", url: string): Record<"cover" | "list" | "mythfact" | "stat" | "cta" | "checklist" | "versus" | "faq" | "fix" | "chat", Slide> {
  const ar = language === "ar";
  return {
    cover: { layout: "cover", title: ar ? "٥ أخطاء بتضيّع عليك عملاء كل يوم" : "5 mistakes that cost you clients every day", subtitle: ar ? "اعرفها قبل ما تنشر البوست الجاي" : "Fix them before your next post" },
    list: {
      layout: "list",
      title: ar ? "إزاي العميل يحجز لوحده" : "How clients book on their own",
      items: ar ? ["يفتح لينك البايو", "يختار يوم وميعاد فاضي", "يوصله تأكيد وتذكير"] : ["They open your bio link", "Pick a free day and time", "Get a confirmation and reminder"],
    },
    mythfact: { layout: "myth-fact", myth: ar ? "العميل هيحجز من الرسايل" : "Clients will book in your DMs", fact: ar ? "نص العملاء بيختفوا قبل ما ترد" : "Half of them leave before you reply" },
    stat: { layout: "stat", value: "3x", label: ar ? "حجوزات أكتر من نفس البوستات" : "more bookings from the same posts", note: ar ? "مثال" : "example" },
    cta: { layout: "cta", title: ar ? "احجز مكالمة مجانية ١٥ دقيقة" : "Book a free 15-minute call", button: ar ? "احجز دلوقتي" : "Book now", url },
    checklist: { layout: "checklist", title: ar ? "قبل ما تنشر لينك البايو" : "Before you post your bio link", items: ar ? ["اللينك بيفتح على الموبايل", "الحجز في خطوتين بس", "فيه آراء عملاء حقيقية"] : ["It opens fast on a phone", "Booking takes two taps", "Real client reviews are on it"] },
    versus: {
      layout: "versus",
      title: ar ? "الحجز في الرسايل ولا صفحة حجز؟" : "Booking in DMs or a booking page?",
      left: { label: ar ? "الرسايل" : "DMs", points: ar ? ["ترد بنفسك", "العميل يستنى"] : ["You reply by hand", "Clients wait"] },
      right: { label: ar ? "صفحة حجز" : "Booking page", points: ar ? ["يحجز لوحده", "٢٤ ساعة"] : ["They book alone", "Open 24/7"] },
    },
    faq: { layout: "faq", question: ar ? "هو أنا محتاج أعرف برمجة؟" : "Do I need to know how to code?", answer: ar ? "لأ. إحنا بنبني الصفحة وانت بتبعت اللينك بس." : "No. We build the page; you just share the link." },
    fix: { layout: "fix", problem: ar ? "لينك البايو فيه ٦ لينكات والعميل تايه" : "Six links in your bio and clients get lost", fix: ar ? "صفحة واحدة: مين انت، خدماتك، واحجز" : "One page: who you are, what you do, book" },
    chat: {
      layout: "chat",
      messages: ar
        ? [{ from: "them", text: "السلام عليكم، فيه ميعاد بكرة؟" }, { from: "us", text: "أهلاً! المواعيد الفاضية كلها في اللينك ده" }, { from: "them", text: "تمام حجزت، شكراً 🙏" }]
        : [{ from: "them", text: "Hi! Any slot tomorrow?" }, { from: "us", text: "Hi! All free slots are on this link" }, { from: "them", text: "Booked, thanks 🙏" }],
    },
  };
}

export const PREVIEW_SLIDES = ["cover", "list"] as const;

/** <client>/designs/<design>-<slide>.png: previews drawn in the client's brand. */
export const designPreviewPath = (clientId: string, design: DesignId, slide: string) => join(clientDir(clientId), "designs", `${design}-${slide}.png`);

async function dataUrl(path: string): Promise<string | undefined> {
  if (!existsSync(path)) return undefined;
  const type = extname(path) === ".png" ? "image/png" : extname(path) === ".webp" ? "image/webp" : "image/jpeg";
  return `data:${type};base64,${(await readFile(path)).toString("base64")}`;
}

/**
 * Draws sample slides of each design in the client's brand, with Chrome only.
 * `slides` picks which samples (the cover and a list by default); `out` maps a
 * design and sample to a file (the client's designs folder by default).
 */
export async function renderDesignPreviews(
  client: Client,
  log: (message: string) => void = console.log,
  options: { designs?: readonly DesignId[]; slides?: readonly (keyof ReturnType<typeof sampleSlides>)[]; out?: (design: DesignId, slide: string) => string; scale?: number } = {},
): Promise<number> {
  const designs = options.designs ?? DESIGN_IDS;
  const slides = options.slides ?? PREVIEW_SLIDES;
  const out = options.out ?? ((design, slide) => designPreviewPath(client.id, design, slide));
  const samples = sampleSlides(client.language, client.brief.cta.url || client.url);
  const logo = client.brand.logo ? await dataUrl(join(clientDir(client.id), client.brand.logo)) : undefined;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  let drawn = 0;
  try {
    const page = await browser.newPage();
    // Previews are small in the app: drawn at half size.
    const scale = options.scale ?? 0.5;
    await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: scale });
    for (const [n, design] of designs.entries()) {
      log(`designs: ${design} (${n + 1}/${designs.length}) ...`);
      for (const [index, name] of slides.entries()) {
        await page.setContent(slideHtml(samples[name], { client, index, total: 5, logo, design }), { waitUntil: "load", timeout: 30000 });
        await page.evaluate(async (names: string[]) => {
          await Promise.all(names.flatMap((family) => ["400", "800"].map((weight) => document.fonts.load(`${weight} 40px '${family}'`, document.body.innerText || "a").catch(() => []))));
          await document.fonts.ready;
        }, [client.brand.fonts.heading, client.brand.fonts.body]);
        const file = out(design, name);
        await mkdir(join(file, ".."), { recursive: true });
        await page.screenshot({ path: file as `${string}.png` });
        drawn++;
      }
    }
  } finally {
    await browser.close();
  }
  return drawn;
}

/** <post>/designs/<design>-<n>.png: a post's own slide n drawn in another design. */
export const postDesignPath = (clientId: string, postId: string, design: DesignId, n: number) => join(postDir(clientId, postId), "designs", `${design}-${n}.png`);

/**
 * Draws a post's first two slides, with its own text and pictures, in each
 * design, so the designs can be compared on the real post. Chrome only: free.
 */
export async function renderPostDesigns(client: Client, post: Post, log: (message: string) => void = console.log, designs: readonly DesignId[] = DESIGN_IDS): Promise<number> {
  const slides = (post.slides ?? []).slice(0, 2);
  if (!slides.length) return 0;
  const dir = postDir(client.id, post.id);
  const logo = client.brand.logo ? await dataUrl(join(clientDir(client.id), client.brand.logo)) : undefined;
  const arts = await Promise.all(slides.map((slide) => (slide.art?.file ? dataUrl(join(dir, slide.art.file)) : Promise.resolve(undefined))));
  await mkdir(join(dir, "designs"), { recursive: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  let drawn = 0;
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1350, deviceScaleFactor: 0.4 });
    for (const [n, design] of designs.entries()) {
      log(`designs: ${design} (${n + 1}/${designs.length}) ...`);
      for (const [index, slide] of slides.entries()) {
        await page.setContent(slideHtml(slide, { client, index, total: post.slides!.length, logo, art: arts[index], style: post.artStyle, design }), { waitUntil: "load", timeout: 30000 });
        await page.evaluate(async (names: string[]) => {
          await Promise.all(names.flatMap((family) => ["400", "800"].map((weight) => document.fonts.load(`${weight} 40px '${family}'`, document.body.innerText || "a").catch(() => []))));
          await document.fonts.ready;
        }, [client.brand.fonts.heading, client.brand.fonts.body]);
        await page.screenshot({ path: postDesignPath(client.id, post.id, design, index + 1) as `${string}.png` });
        drawn++;
      }
    }
  } finally {
    await browser.close();
  }
  return drawn;
}
