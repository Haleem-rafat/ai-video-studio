import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import puppeteer, { type Browser, type Page } from "puppeteer-core";

import { openParts } from "./parts.ts";
import { watchNetwork, whenOnline } from "./settle.ts";
import { anchorsOf, matchAnchors, positionAt, syncPlan } from "./sync.ts";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export type Device = "desktop" | "phone";

export const VIEWPORTS: Record<Device, { width: number; height: number; deviceScaleFactor: number; isMobile: boolean; hasTouch: boolean }> = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  phone: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

/** Seconds the page stays still before the scroll starts and after it ends. */
export const TIMING = { hold: 1.6, end: 1.8 };

/** Scroll speeds in CSS pixels a second on the desktop: slow lets a viewer read every section. */
export const SPEEDS = { slow: 140, normal: 260, fast: 480 } as const;
export type Speed = keyof typeof SPEEDS;

/** Seconds of scrolling, or "page" for as long as the whole page takes at the speed. */
export type Length = 15 | 30 | 45 | 60 | "page";
export const LENGTHS: Length[] = [15, 30, 45, 60, "page"];

/** `music` is a file in assets/music chosen by hand; without it each promo gets a different track. */
export type PromoOptions = { speed: Speed; length: Length; music?: string };
export const DEFAULT_OPTIONS: PromoOptions = { speed: "slow", length: 45 };

/** "Whole page" stops here, so a huge page can't make an endless video. */
const MAX_SECONDS = 120;
/** Seconds to speed up at the start and slow down at the end. */
const RAMP_SECONDS = 1.2;

/** How many seconds a promo of this length may scroll for. */
export const capFor = (length: Length) => (length === "page" ? MAX_SECONDS : length);

/** The part of the scroll spent speeding up (and again slowing down). */
export const rampFor = (seconds: number) => Math.min(0.25, RAMP_SECONDS / seconds);

const run = promisify(execFile);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * How far through the scroll it is (0 to 1) when `t` of the time has passed:
 * it speeds up over the first `ramp` of the time, moves steadily, and slows
 * down over the last. Self-contained: the recorder runs it inside the page.
 */
export function easeAt(t: number, ramp: number): number {
  const x = Math.min(1, Math.max(0, t));
  if (ramp <= 0) return x;
  const v = 1 / (1 - ramp);
  return x < ramp ? (v * x * x) / (2 * ramp) : x <= 1 - ramp ? v * (x - ramp / 2) : 1 - (v * (1 - x) * (1 - x)) / (2 * ramp);
}

export type Look = { background: string; accent: string; dark: boolean };

/** The page's own colors, read without AI: its most common background and its strongest button color. */
async function lookOf(page: Page): Promise<Look> {
  return page.evaluate(() => {
    const parse = (value: string) => {
      const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (!match || (match[4] !== undefined && Number(match[4]) < 0.6)) return null;
      return [Number(match[1]), Number(match[2]), Number(match[3])] as const;
    };
    const hex = (rgb: readonly number[]) => `#${rgb.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
    const area = new Map<string, number>();
    for (const element of document.querySelectorAll<HTMLElement>("body, body *")) {
      const rgb = parse(getComputedStyle(element).backgroundColor);
      if (!rgb) continue;
      const box = element.getBoundingClientRect();
      area.set(hex(rgb), (area.get(hex(rgb)) ?? 0) + box.width * box.height);
    }
    const background = [...area].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "#ffffff";
    const vivid = (rgb: readonly number[]) => Math.max(...rgb) - Math.min(...rgb);
    const buttons = [...document.querySelectorAll<HTMLElement>("a, button")].map((element) => parse(getComputedStyle(element).backgroundColor)).filter((rgb): rgb is readonly [number, number, number] => Boolean(rgb));
    const strongest = buttons.sort((a, b) => vivid(b) - vivid(a))[0];
    const theme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content ?? "";
    const accent = strongest && vivid(strongest) > 60 ? hex(strongest) : /^#[0-9a-f]{6}$/i.test(theme) ? theme : "#6d5dfc";
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(background.slice(i, i + 2), 16));
    return { background, accent, dark: 0.299 * r + 0.587 * g + 0.114 * b < 128 };
  });
}

/** Hides what covers a page on a first visit: cookie and consent banners, chat bubbles, pop-ups. */
async function tidy(page: Page): Promise<void> {
  await page.evaluate(() => {
    const noise = /cookie|consent|gdpr|chat|intercom|crisp|tawk|drift|hubspot|popup|modal|newsletter/i;
    for (const element of document.querySelectorAll<HTMLElement>("body *")) {
      const style = getComputedStyle(element);
      if (style.position !== "fixed" && style.position !== "sticky") continue;
      const label = `${element.id} ${element.className} ${element.getAttribute("aria-label") ?? ""}`;
      const box = element.getBoundingClientRect();
      const coversMuch = box.width * box.height > window.innerWidth * window.innerHeight * 0.4;
      if (noise.test(label) || (style.position === "fixed" && coversMuch && box.top > 0)) element.style.setProperty("display", "none", "important");
    }
    document.documentElement.style.scrollBehavior = "auto";
    document.documentElement.style.overflowX = "hidden";
    // A recording has no scrollbar to show.
    const style = document.createElement("style");
    style.textContent = "::-webkit-scrollbar{display:none} html{scrollbar-width:none}";
    document.head.append(style);
  });
}

/** Scrolls to the bottom and back so reveal-on-scroll animations and lazy pictures are ready. */
async function wakeUp(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const step = Math.max(300, window.innerHeight * 0.7);
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 160));
    }
    window.scrollTo(0, 0);
  });
  await wait(1500);
}

/**
 * Chrome's frame stream, at the device's real sharpness.
 * Each frame is kept with the time it was painted, so ffmpeg plays it back at the speed it happened.
 */
async function capture(page: Page, out: string): Promise<{ stop: () => Promise<void> }> {
  const frames = `${out}.frames`;
  await rm(frames, { recursive: true, force: true });
  await mkdir(frames, { recursive: true });
  const session = await page.createCDPSession();
  const shot: { file: string; at: number }[] = [];
  const writes: Promise<void>[] = [];
  session.on("Page.screencastFrame", (frame) => {
    const file = join(frames, `${String(shot.length).padStart(5, "0")}.jpg`);
    shot.push({ file, at: frame.metadata.timestamp ?? Date.now() / 1000 });
    writes.push(writeFile(file, Buffer.from(frame.data, "base64")));
    void session.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {});
  });
  const { width, height, deviceScaleFactor = 1 } = page.viewport()!;
  await session.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: width * deviceScaleFactor, maxHeight: height * deviceScaleFactor, everyNthFrame: 1 });
  return {
    stop: async () => {
      const stopped = Date.now() / 1000;
      await session.send("Page.stopScreencast");
      await session.detach();
      await Promise.all(writes);
      await writeFile(join(frames, "list.txt"), concatList(shot, stopped));
      await run("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", join(frames, "list.txt"), "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-crf", "16", "-preset", "fast", out]);
      await rm(frames, { recursive: true, force: true });
    },
  };
}

/** An ffmpeg concat list holding each frame for as long as it was on screen. */
export function concatList(frames: { file: string; at: number }[], end: number): string {
  const lines = frames.flatMap((frame, i) => [`file '${frame.file}'`, `duration ${Math.max(0.001, (frames[i + 1]?.at ?? end) - frame.at).toFixed(4)}`]);
  // The concat demuxer ignores the last duration unless the last file is listed again.
  if (frames.length) lines.push(`file '${frames.at(-1)!.file}'`);
  return `${lines.join("\n")}\n`;
}

/**
 * Opens the page on a device and gets it ready to record: everything
 * downloaded, lazy parts woken, closed parts opened, banners hidden.
 */
async function prepare(page: Page, url: string, device: Device, log: (message: string) => void): Promise<void> {
  await page.setViewport(VIEWPORTS[device]);
  log(`promo: opening ${url} on a ${device} ...`);
  const network = await watchNetwork(page);
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
  // Sites that stream a big video behind a loading ring look "loaded" long before it arrives.
  await network.settled(log);
  await tidy(page);
  await wakeUp(page);
  // Waking the page up can start lazy pictures and videos further down.
  await network.settled(log, 30000);
  // FAQ answers, accordions, press-and-hold lines and embedded calendars: shown open, not closed or loading.
  await openParts(page, log);
  await network.stop();
  await tidy(page);
}

/**
 * Records a prepared page scrolling through `ys` (its positions at the shared
 * places `at`), so both devices pass every paired heading at the same moment.
 * The scroll runs in the page on animation frames, so it is smooth whatever the length.
 */
async function recordScroll(page: Page, out: string, plan: { ys: number[]; at: number[]; seconds: number }): Promise<void> {
  const stream = await capture(page, out);
  await page.evaluate(
    async ({ ys, at, hold, scroll, end, ramp, ease, position }) => {
      const easeAt = new Function(`return ${ease}`)() as (t: number, ramp: number) => number;
      const positionAt = new Function(`return ${position}`)() as (ys: number[], at: number[], u: number) => number;
      await new Promise((resolve) => setTimeout(resolve, hold * 1000));
      const start = performance.now();
      await new Promise<void>((resolve) => {
        const step = (now: number) => {
          const t = (now - start) / (scroll * 1000);
          window.scrollTo(0, Math.round(positionAt(ys, at, easeAt(t, ramp))));
          if (t < 1) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
      await new Promise((resolve) => setTimeout(resolve, end * 1000));
    },
    // The page runs the same functions the tests check.
    { ys: plan.ys, at: plan.at, ...TIMING, scroll: plan.seconds, ramp: rampFor(plan.seconds), ease: easeAt.toString(), position: positionAt.toString() },
  );
  await stream.stop();
}

/** A browser drawing at the device's pixel density: Chrome's frame stream ignores the page's own setting. */
async function openDevice(device: Device): Promise<{ browser: Browser; page: Page }> {
  const scale = VIEWPORTS[device].deviceScaleFactor;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--hide-scrollbars", `--force-device-scale-factor=${scale}`] });
  return { browser, page: await browser.newPage() };
}

export type Recording = { desktop: string; phone: string; look: Look; title: string };

/**
 * Records the page on a desktop and a phone into `dir`, and reads its colors.
 * Both pages are prepared first and their headings paired, so the laptop and
 * the phone reach every shared heading at the same moment of the video.
 */
export async function recordSite(url: string, dir: string, options: PromoOptions = DEFAULT_OPTIONS, log: (message: string) => void = console.log): Promise<Recording> {
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  if (!existsSync(CHROME)) throw new Error("Google Chrome is needed to record a website");
  await mkdir(dir, { recursive: true });
  const desktopFile = join(dir, "desktop.mp4");
  const phoneFile = join(dir, "phone.mp4");
  // A dropped connection starts the recording again once the internet is back.
  return whenOnline(async () => {
    const desktop = await openDevice("desktop");
    const phone = await openDevice("phone");
    try {
      await prepare(desktop.page, url, "desktop", log);
      await prepare(phone.page, url, "phone", log);
      const [d, p] = await Promise.all([anchorsOf(desktop.page), anchorsOf(phone.page)]);
      const pairs = matchAnchors(d.anchors, p.anchors, d.max, p.max);
      const plan = syncPlan(pairs, { speed: SPEEDS[options.speed], cap: capFor(options.length) });
      const whole = plan.desktop.at(-1)! >= d.max && plan.phone.at(-1)! >= p.max;
      log(`promo: laptop and phone matched at ${Math.max(0, pairs.length - 2)} headings; ${whole ? "the whole page" : "the first part"} in ${plan.seconds.toFixed(0)}s`);
      log("promo: recording the desktop scroll ...");
      await recordScroll(desktop.page, desktopFile, { ys: plan.desktop, at: plan.at, seconds: plan.seconds });
      const look = await lookOf(desktop.page);
      const title = await desktop.page.title();
      log("promo: recording the phone scroll ...");
      await recordScroll(phone.page, phoneFile, { ys: plan.phone, at: plan.at, seconds: plan.seconds });
      return { desktop: desktopFile, phone: phoneFile, look, title };
    } finally {
      await Promise.all([desktop.browser.close(), phone.browser.close()]);
    }
  }, log);
}
