import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

import puppeteer from "puppeteer-core";

import { layoutFor, type Layout, type Rect, type Shape } from "./layout.ts";
import type { Look } from "./record.ts";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FPS = 30;

const run = promisify(execFile);

const box = (rect: Rect) => `left:${rect.x}px;top:${rect.y}px;width:${rect.w}px;height:${rect.h}px`;

/** The colors around the devices: the site's own background, lit by its accent color. */
export function backdrop(look: Look): { base: string; glow: string; frame: string; rim: string } {
  return {
    base: look.background,
    glow: look.accent,
    frame: look.dark ? "#2b2c30" : "#1d1d20",
    rim: look.dark ? "rgba(255,255,255,.22)" : "rgba(0,0,0,.35)",
  };
}

/** Behind the recordings: the background and the devices' shadows. */
function backHtml(layout: Layout, look: Look): string {
  const c = backdrop(look);
  const { laptop, phone } = layout;
  return `<html><body style="margin:0;width:${layout.width}px;height:${layout.height}px;overflow:hidden;position:relative;background:${c.base}">
<div style="position:absolute;inset:0;background:radial-gradient(60% 50% at 30% 30%, ${c.glow}55, transparent 70%),radial-gradient(50% 45% at 80% 85%, ${c.glow}33, transparent 70%)"></div>
<div style="position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 50%, transparent 55%, rgba(0,0,0,.35))"></div>
<div style="position:absolute;${box(laptop.body)};border-radius:22px 22px 6px 6px;box-shadow:0 40px 90px rgba(0,0,0,.5)"></div>
</body></html>`;
}

/**
 * In front of a recording: its device's bezel with the screen left clear (a border keeps the screen corners round).
 * The laptop's layer also casts the phone's shadow, since the phone stands in front of it.
 */
function frontHtml(layout: Layout, look: Look, device: "laptop" | "phone"): string {
  const c = backdrop(look);
  const { laptop, phone } = layout;
  const bezel = laptop.screen.x - laptop.body.x;
  const chin = laptop.body.y + laptop.body.h - (laptop.screen.y + laptop.screen.h);
  const phoneBezel = phone.screen.x - phone.body.x;
  const phoneRadius = Math.round(phone.body.w * 0.14);
  const island = { w: Math.round(phone.screen.w * 0.3), h: Math.round(phone.screen.w * 0.085) };
  const page = (body: string) => `<html><body style="margin:0;width:${layout.width}px;height:${layout.height}px;overflow:hidden;position:relative;background:transparent">${body}</body></html>`;
  if (device === "laptop")
    return page(`
<div style="position:absolute;${box(laptop.body)};box-sizing:border-box;border:solid ${c.frame};border-width:${bezel}px ${bezel}px ${chin}px;border-radius:22px 22px 6px 6px;box-shadow:0 0 0 1.5px ${c.rim}"></div>
<div style="position:absolute;left:${laptop.screen.x + laptop.screen.w / 2 - 3}px;top:${laptop.body.y + bezel / 2 - 3}px;width:6px;height:6px;border-radius:50%;background:#0a0a0b"></div>
<div style="position:absolute;${box(laptop.base)};border-radius:0 0 ${laptop.base.h}px ${laptop.base.h}px;background:linear-gradient(#d4d5d9,#8d8f95);box-shadow:0 1px 0 rgba(255,255,255,.4) inset"></div>
<div style="position:absolute;left:${laptop.base.x + laptop.base.w / 2 - 70}px;top:${laptop.base.y}px;width:140px;height:6px;border-radius:0 0 8px 8px;background:#7c7e84"></div>
<div style="position:absolute;${box(phone.body)};border-radius:${phoneRadius}px;background:#111113;box-shadow:0 30px 70px rgba(0,0,0,.55)"></div>`);
  const inner = phoneRadius - phoneBezel;
  const status = Math.round(phone.bar.h * 0.36);
  return page(`
<div style="position:absolute;${box(phone.bar)};border-radius:${inner}px ${inner}px 0 0;background:${look.background};color:${look.dark ? "#fff" : "#000"};font:600 ${status}px -apple-system,Helvetica,sans-serif;display:flex;align-items:center;justify-content:space-between;padding:0 ${Math.round(phone.bar.w * 0.09)}px;box-sizing:border-box">
  <span>9:41</span><span style="display:flex;gap:${Math.round(status * 0.3)}px;align-items:center"><span style="letter-spacing:-1px">●●●</span><span style="width:${status * 1.6}px;height:${status * 0.8}px;border:1.5px solid currentColor;border-radius:${status * 0.25}px;padding:1.5px;box-sizing:border-box;opacity:.9"><span style="display:block;width:80%;height:100%;background:currentColor;border-radius:1px"></span></span></span>
</div>
<div style="position:absolute;${box(phone.body)};box-sizing:border-box;border:${phoneBezel}px solid #111113;border-radius:${phoneRadius}px;box-shadow:0 0 0 2px ${c.rim}"></div>
<div style="position:absolute;left:${phone.screen.x + (phone.screen.w - island.w) / 2}px;top:${phone.bar.y + Math.round((phone.bar.h - island.h) / 2)}px;width:${island.w}px;height:${island.h}px;border-radius:${island.h}px;background:#000"></div>`);
}

type Layers = { back: string; laptop: string; phone: string };

async function drawLayers(layout: Layout, look: Look, dir: string, shape: Shape): Promise<Layers> {
  const back = join(dir, `back-${shape}.png`);
  const laptop = join(dir, `laptop-${shape}.png`);
  const phone = join(dir, `phone-${shape}.png`);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: layout.width, height: layout.height });
    await page.setContent(backHtml(layout, look), { waitUntil: "load" });
    await page.screenshot({ path: back as `${string}.png` });
    for (const [device, path] of [["laptop", laptop], ["phone", phone]] as const) {
      await page.setContent(frontHtml(layout, look, device), { waitUntil: "load" });
      await page.screenshot({ path: path as `${string}.png`, omitBackground: true });
    }
  } finally {
    await browser.close();
  }
  return { back, laptop, phone };
}

/** How long a recording plays, in seconds. */
export async function lengthOf(file: string): Promise<number> {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return Number(stdout.trim());
}

/**
 * The ffmpeg filter that builds a promo: the recordings scaled into the screens
 * between the back and front layers, a slow push-in, fades, and the music.
 */
export function promoFilter(layout: Layout, seconds: number): string {
  const { laptop, phone, width, height } = layout;
  const fadeOut = Math.max(0, seconds - 0.8).toFixed(2);
  const music = Math.max(0, seconds - 2).toFixed(2);
  const frames = Math.round(seconds * FPS);
  return [
    `[1:v]scale=${laptop.screen.w}:${laptop.screen.h}:flags=lanczos,setsar=1[desk]`,
    `[2:v]scale=${phone.screen.w}:${phone.screen.h}:flags=lanczos,setsar=1[phone]`,
    // Back to front: background, laptop recording, laptop bezel, phone recording, phone bezel.
    `[0:v][desk]overlay=${laptop.screen.x}:${laptop.screen.y}:shortest=1[a]`,
    `[a][3:v]overlay=0:0[b]`,
    `[b][phone]overlay=${phone.screen.x}:${phone.screen.y}:shortest=1[c0]`,
    `[c0][4:v]overlay=0:0[c]`,
    // A slow push-in (100% → 104%) keeps the frame alive while the pages scroll.
    `[c]scale=w='${width}*(1+0.04*n/${frames})':h=-2:eval=frame:flags=bicubic,crop=${width}:${height},setsar=1,fps=${FPS},format=yuv420p,fade=t=in:st=0:d=0.6,fade=t=out:st=${fadeOut}:d=0.8[v]`,
    `[5:a]atrim=0:${seconds.toFixed(2)},afade=t=in:st=0:d=1,afade=t=out:st=${music}:d=2,volume=0.8[m]`,
  ].join(";");
}

/** Makes one promo video from the two recordings, over `music` (a track shorter than the video loops). */
export async function composePromo(input: { desktop: string; phone: string; look: Look; dir: string; shape: Shape; out: string; music: string }): Promise<{ seconds: number }> {
  const layout = layoutFor(input.shape);
  const layers = await drawLayers(layout, input.look, input.dir, input.shape);
  const seconds = Math.min(await lengthOf(input.desktop), await lengthOf(input.phone));
  if (!existsSync(input.music)) throw new Error(`No music at ${input.music}`);
  await run(
    "ffmpeg",
    [
      ...["-v", "error", "-y"],
      ...["-loop", "1", "-framerate", String(FPS), "-i", layers.back],
      ...["-i", input.desktop, "-i", input.phone],
      ...[layers.laptop, layers.phone].flatMap((layer) => ["-loop", "1", "-framerate", String(FPS), "-i", layer]),
      ...["-stream_loop", "-1", "-i", input.music],
      ...["-filter_complex", promoFilter(layout, seconds), "-map", "[v]", "-map", "[m]"],
      ...["-t", seconds.toFixed(2), "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", input.out],
    ],
    { maxBuffer: 16 * 1024 * 1024 },
  );
  return { seconds };
}
