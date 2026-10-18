import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { generateText, Output } from "ai";
import puppeteer, { type Page } from "puppeteer-core";
import { z } from "zod";

import type { SiteBrand } from "../types.ts";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
// Reads the screenshots, so it must be a vision model.
const BRAND_MODEL = "google/gemini-3.5-flash";
/** Whole-page screenshots stop here; a video never scrolls further. */
const MAX_PAGE = 9000;
const MAX_SECTIONS = 8;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const run = promisify(execFile);

/**
 * The whole page as a visitor scrolls it: one screenful at a time, joined
 * top to bottom. A single tall screenshot resizes the window instead, and
 * pages sized to the window (100vh heroes) then stretch out of shape. Fixed
 * and sticky bars at the top edge show only in the first screenful. Returns the height in
 * CSS pixels.
 */
async function scrollShot(page: Page, out: string, scale: number): Promise<number> {
  const { innerHeight: screen, total } = await page.evaluate(() => ({ innerHeight: window.innerHeight, total: document.documentElement.scrollHeight }));
  const height = Math.min(total, MAX_PAGE);
  const slices: string[] = [];
  let cut = 0;
  for (let y = 0; y < height; y += screen) {
    const at = await page.evaluate(async (y) => {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 450));
      return window.scrollY;
    }, y);
    if (y > 0)
      await page.evaluate(() => {
        for (const element of document.querySelectorAll<HTMLElement>("body *")) {
          // Only the bars pinned to the top edge (menus, announcement strips); sticky story sections stay.
          const position = getComputedStyle(element).position;
          const box = element.getBoundingClientRect();
          if ((position === "fixed" || position === "sticky") && box.top < 140 && box.height < 220) element.style.visibility = "hidden";
        }
      });
    const path = `${out}.part${slices.length}.png`;
    await page.screenshot({ path: path as `${string}.png` });
    slices.push(path);
    // The last screenful can't scroll a full step: its top repeats the one before.
    cut = y - at;
    if (y + screen >= height) break;
  }
  await page.evaluate(() => {
    for (const element of document.querySelectorAll<HTMLElement>("body *")) element.style.visibility = "";
    window.scrollTo(0, 0);
  });
  const last = slices.length - 1;
  const filters = slices.map((_, i) => (i === last && cut > 0 ? `[${i}:v]crop=iw:ih-${Math.round(cut * scale)}:0:${Math.round(cut * scale)}[p${i}]` : `[${i}:v]null[p${i}]`));
  const joined = slices.length > 1 ? `${filters.join(";")};${slices.map((_, i) => `[p${i}]`).join("")}vstack=inputs=${slices.length},crop=iw:min(ih\\,${height * scale}):0:0[v]` : `[0:v]null[v]`;
  await run("ffmpeg", ["-v", "error", "-y", ...slices.flatMap((slice) => ["-i", slice]), "-filter_complex", joined, "-map", "[v]", "-q:v", "3", out]);
  await Promise.all(slices.map((slice) => rm(slice, { force: true })));
  return Math.min(height, screen * slices.length - cut);
}

/** Scrolls to the bottom and back so reveal-on-scroll animations and lazy pictures have run. */
async function wakeUp(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const step = Math.max(300, window.innerHeight * 0.7);
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 140));
    }
    window.scrollTo(0, 0);
  });
  await wait(1200);
}

/** Everything the page says about its look, measured in the browser. */
type Measured = {
  title: string;
  description: string;
  themeColor: string;
  lang: string;
  text: string;
  googleFonts: string[];
  fonts: { heading: string; body: string };
  backgrounds: [string, number][];
  colors: [string, number][];
  buttons: { label: string; href: string; background: string; color: string; area: number }[];
  sections: { label: string; top: number; height: number }[];
  photos: string[];
  icons: string[];
  ogImage: string;
};

async function measure(page: Page): Promise<Measured> {
  return page.evaluate(() => {
    const hex = (value: string) => {
      const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (!match || (match[4] !== undefined && Number(match[4]) < 0.6)) return "";
      return `#${[match[1], match[2], match[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
    };
    const tally = (prop: "backgroundColor" | "color") => {
      const counts = new Map<string, number>();
      for (const element of document.querySelectorAll("body, body *")) {
        const value = hex(getComputedStyle(element)[prop]);
        if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
      }
      return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 12);
    };
    const family = (element: Element | null) => (element ? getComputedStyle(element).fontFamily.split(",")[0].replace(/["']/g, "").trim() : "");
    const meta = (name: string) => document.querySelector<HTMLMetaElement>(`meta[name="${name}"], meta[property="${name}"]`)?.content ?? "";
    // Pages that animate text often hold each line twice; keep one of each.
    const seen = new Set<string>();
    const lines = document.body.innerText.split("\n").map((line) => line.trim()).filter((line) => line && !seen.has(line) && seen.add(line));

    const buttons = [...document.querySelectorAll<HTMLElement>("a, button")]
      .map((element) => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return {
          label: element.innerText.trim().replace(/\s+/g, " ").slice(0, 60),
          href: element instanceof HTMLAnchorElement ? element.href : "",
          background: hex(style.backgroundColor),
          color: hex(style.color),
          area: Math.round(box.width * box.height),
        };
      })
      .filter((button) => button.label && button.background && button.area > 1500);

    const sections = [...document.querySelectorAll("h2")]
      .map((heading) => {
        let block: HTMLElement | null = heading.closest("section") ?? heading.parentElement;
        while (block && block.parentElement && block.getBoundingClientRect().height < 320) block = block.parentElement;
        const box = block!.getBoundingClientRect();
        return { label: (heading as HTMLElement).innerText.trim().replace(/\s+/g, " ").slice(0, 60), top: Math.round(box.top + window.scrollY), height: Math.round(box.height) };
      })
      .filter((section) => section.label && section.height > 200 && section.height < 2600);

    const photos = [...document.images].filter((image) => image.naturalWidth >= 500 && image.naturalHeight >= 400).map((image) => image.currentSrc || image.src);
    const icons = [...document.querySelectorAll<HTMLLinkElement>("link[rel~='icon'], link[rel='apple-touch-icon']")].map((link) => link.href);

    return {
      title: document.title,
      description: meta("description") || meta("og:description"),
      themeColor: meta("theme-color"),
      lang: document.documentElement.lang,
      text: lines.join("\n").slice(0, 12000),
      googleFonts: [...document.querySelectorAll<HTMLLinkElement>("link[href*='fonts.googleapis.com']")].flatMap((link) =>
        [...link.href.matchAll(/family=([^:&;]+)/g)].map((match) => decodeURIComponent(match[1].replace(/\+/g, " "))),
      ),
      fonts: { heading: family(document.querySelector("h1, h2")), body: family(document.querySelector("p")) || family(document.body) },
      backgrounds: tally("backgroundColor"),
      colors: tally("color"),
      buttons,
      sections,
      photos: [...new Set(photos)].slice(0, 6),
      icons,
      ogImage: meta("og:image"),
    };
  });
}

/** The brand mark: the first picture in the header's home link, or anything named "logo". */
async function shootLogo(page: Page, path: string): Promise<boolean> {
  const handle = await page.evaluateHandle(() => {
    const home = [...document.querySelectorAll("header a, nav a, a")].find((link) => {
      const href = (link as HTMLAnchorElement).getAttribute("href") ?? "";
      return (href === "/" || href === "./" || href === location.origin || href === `${location.origin}/` || href === "#" || href === "#top") && link.querySelector("img, svg, [class*='logo' i]");
    });
    const candidates = [
      home?.querySelector("img, svg, [class*='logo' i]"),
      document.querySelector("[class*='logo' i] img, [class*='logo' i] svg, img[alt*='logo' i], [class*='logo' i]"),
      document.querySelector("header img, header svg"),
    ];
    return candidates.find((element) => element && element.getBoundingClientRect().width >= 16) ?? null;
  });
  const element = handle.asElement();
  if (!element) return false;
  await element.screenshot({ path: path as `${string}.png`, omitBackground: true }).catch(() => null);
  return existsSync(path);
}

async function download(url: string, path: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    if (!response.ok) return false;
    await writeFile(path, new Uint8Array(await response.arrayBuffer()));
    return true;
  } catch {
    return false;
  }
}

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const BRAND = z.object({
  name: z.string().describe("The brand or product name as it should appear on screen (e.g. Risero)"),
  summary: z.string().describe("What the business offers and to whom, 1-2 sentences, in the page's language"),
  services: z.array(z.string()).max(8).describe("What a customer gets, as short phrases, only what the page really says"),
  language: z.enum(["en", "ar"]),
  colors: z.object({
    background: hex.describe("The main dark or light background of the page"),
    panel: hex.describe("Cards and panels on that background"),
    text: hex.describe("Main text colour, readable on the background"),
    accent: hex.describe("The highlight colour used on key words"),
    cta: hex.describe("The call-to-action button colour"),
    muted: hex.describe("Secondary text"),
  }),
  cta: z.object({ label: z.string(), url: z.string() }).describe("The page's main call to action and where it leads (absolute URL; the page URL with an anchor is fine)"),
});

/**
 * Opens a website in Chrome and reads its brand: real screenshots (the top
 * of the page and the whole page on a desktop and a phone, and every
 * section), the logo, the page's colours, fonts, call to action and text.
 * A vision model turns the measurements into a palette and a summary.
 * Pictures are saved in `dir` under shots/; paths in the result are
 * relative to it.
 */
export async function readSite(url: string, dir: string, log: (message: string) => void = console.log): Promise<SiteBrand> {
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  if (!existsSync(CHROME)) throw new Error("Google Chrome is needed to read a website");
  await mkdir(join(dir, "shots"), { recursive: true });
  const shots: SiteBrand["shots"] = [];
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  let measured: Measured;
  let logo: string | undefined;
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    log(`site: opening ${url} ...`);
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    await wait(1500);
    await wakeUp(page);
    measured = await measure(page);

    await page.screenshot({ path: join(dir, "shots/hero-desktop.jpg"), type: "jpeg", quality: 85 });
    shots.push({ id: "hero-desktop", path: "shots/hero-desktop.jpg", label: "Top of the page (desktop)", device: "desktop", height: 900 });
    const pageHeight = await scrollShot(page, join(dir, "shots/page-desktop.jpg"), 1);
    shots.push({ id: "page-desktop", path: "shots/page-desktop.jpg", label: "The whole page (desktop)", device: "desktop", height: pageHeight });

    // Each section is cut out of the whole page, where it sits as the visitor sees it.
    for (const [index, section] of measured.sections.slice(0, MAX_SECTIONS).entries()) {
      if (section.top + section.height > pageHeight) continue;
      const path = `shots/section-${index + 1}.jpg`;
      await run("ffmpeg", ["-v", "error", "-y", "-i", join(dir, "shots/page-desktop.jpg"), "-vf", `crop=1440:${section.height}:0:${section.top}`, "-q:v", "3", join(dir, path)]);
      shots.push({ id: `section-${index + 1}`, path, label: section.label, device: "desktop", height: section.height });
    }

    // A logo is a few dozen pixels on the page: shot at 4x so it stays sharp on screen.
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 4 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await wait(500);
    if (await shootLogo(page, join(dir, "shots/logo.png"))) logo = "shots/logo.png";
    else if (measured.icons[0] && (await download(measured.icons.at(-1)!, join(dir, "shots/logo.png")))) logo = "shots/logo.png";

    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.reload({ waitUntil: "networkidle2", timeout: 60000 });
    await wait(1500);
    await wakeUp(page);
    await page.screenshot({ path: join(dir, "shots/hero-phone.jpg"), type: "jpeg", quality: 85 });
    shots.push({ id: "hero-phone", path: "shots/hero-phone.jpg", label: "Top of the page (phone)", device: "phone", height: 844 });
    const phoneHeight = await scrollShot(page, join(dir, "shots/page-phone.jpg"), 2);
    shots.push({ id: "page-phone", path: "shots/page-phone.jpg", label: "The whole page (phone)", device: "phone", height: phoneHeight });
  } finally {
    await browser.close();
  }
  log(`site: ${shots.length} screenshots, ${measured.sections.length} sections${logo ? ", logo" : ""}`);

  // Real photos from the page (the owner, their work) for the journey scene.
  const photos: string[] = [];
  for (const [index, source] of [...measured.photos, ...(measured.ogImage ? [measured.ogImage] : [])].slice(0, 6).entries()) {
    const path = `shots/photo-${index + 1}${/\.png(\?|$)/i.test(source) ? ".png" : ".jpg"}`;
    if (await download(source, join(dir, path))) photos.push(path);
  }

  log("site: reading the brand ...");
  const picture = async (path: string) => ({ type: "file" as const, data: await readFile(join(dir, path)), mediaType: "image/jpeg" });
  const { output } = await generateText({
    telemetry: { functionId: "website" },
    model: BRAND_MODEL,
    output: Output.object({ schema: BRAND }),
    messages: [
      {
        role: "user",
        content: [
          await picture("shots/hero-desktop.jpg"),
          await picture("shots/hero-phone.jpg"),
          ...(await Promise.all(shots.filter((shot) => shot.id.startsWith("section-")).slice(0, 3).map((shot) => picture(shot.path)))),
          {
            type: "text",
            text: `These are screenshots of ${url}. Read its brand for a marketing video in its exact look.
Page title: ${measured.title}
Description: ${measured.description}
theme-color: ${measured.themeColor || "none"}
Background colours by use: ${measured.backgrounds.map(([color, n]) => `${color} ×${n}`).join(", ")}
Text colours by use: ${measured.colors.map(([color, n]) => `${color} ×${n}`).join(", ")}
Buttons (label, background, text colour, size): ${measured.buttons.slice(0, 12).map((b) => `"${b.label}" ${b.background}/${b.color} ${b.area}px² → ${b.href}`).join(" | ")}
Pick colours only from what the page really uses. The page text:
${measured.text.slice(0, 6000)}`,
          },
        ],
      },
    ],
  });

  const known = (font: string) => measured.googleFonts.find((name) => name.toLowerCase() === font.toLowerCase());
  return {
    url,
    name: output.name.trim(),
    summary: output.summary.trim(),
    services: output.services.map((service) => service.trim()).filter(Boolean),
    language: output.language,
    ...(logo ? { logo } : {}),
    colors: output.colors,
    fonts: { heading: known(measured.fonts.heading) ?? measured.fonts.heading, body: known(measured.fonts.body) ?? measured.fonts.body },
    googleFonts: measured.googleFonts,
    shots,
    photos,
    cta: output.cta.label ? output.cta : undefined,
    text: measured.text,
  };
}
