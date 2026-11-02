// Renders a reel style frame by frame in Chrome and encodes it with ffmpeg.
//
//   node reels/render.mjs <job>/rpg.json            → <job>/rpg.mp4
//   node reels/render.mjs <job>/news.json --stills 2,9,20   → PNGs only, for a quick look
//   flags: --keep-frames (leave the PNGs), --workers 4
//
// The job JSON names its style ("rpg" | "news") and its voice file. Anything with
// `line: n` (or `lines: [a, b]`) gets start/end from timing.json, written by voice.mjs.
import puppeteer from "puppeteer-core";
import { execFile } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { basename, dirname, extname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { analyse, beat, decode, effects, pad, RATE, writeWav } from "./audio.mjs";

const here = dirname(new URL(import.meta.url).pathname);
const run = promisify(execFile);
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
// three.js for the 3D reel, served from the studio's node_modules.
const THREE_DIR = join(here, "..", "node_modules", "three");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".ttf": "font/ttf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".mp4": "video/mp4", ".json": "application/json" };

/**
 * Renders <job>/<name>.json. With `stills` (seconds) it only writes those frames as PNGs to
 * <job>/stills-<name>/ and returns their paths; otherwise it writes the video and returns its path.
 * `onProgress(done, total)` follows the frames.
 */
export async function renderReel(jobFile, { stills, workers = 4, keepFrames = false, log = console.log, onProgress } = {}) {
  jobFile = resolve(jobFile);
  const job = dirname(jobFile);
  const config = JSON.parse(readFileSync(jobFile, "utf8"));
  const style = config.style;
  const name = basename(jobFile, ".json");
  const fps = config.fps ?? 30;

  // ---- timing -----------------------------------------------------------
  const timingFile = join(job, config.timing ?? "timing.json");
  const timing = existsSync(timingFile) ? JSON.parse(readFileSync(timingFile, "utf8")) : [];
  const timed = (item) => {
    const span = item.lines ?? (item.line !== undefined ? [item.line, item.line] : undefined);
    if (!span || item.start !== undefined) return item;
    const [a, b] = span.map((n) => timing[n]);
    if (!a || !b) throw new Error(`timing.json has no line ${span.join("-")}: voice the reel again`);
    const words = timing.slice(span[0], span[1] + 1).flatMap((l) => l.words);
    return { text: a.text, ...item, start: a.start, end: b.end, words };
  };
  for (const key of ["subs", "scenes"]) if (config[key]) config[key] = config[key].map(timed);

  // Video clips become numbered stills, so every tab shows exactly the right frame without seeking a <video>.
  for (const scene of config.scenes ?? []) {
    if (!/\.(mp4|mov|webm)$/i.test(scene.media ?? "")) continue;
    const dir = join(".cache", basename(scene.media).replace(/\.\w+$/, "") + `-${fps}`);
    if (!existsSync(join(job, dir, "0001.jpg"))) {
      mkdirSync(join(job, dir), { recursive: true });
      await run("ffmpeg", ["-v", "error", "-y", "-i", join(job, scene.media), "-vf", `fps=${fps},scale=1280:-2`, "-q:v", "3", join(job, dir, "%04d.jpg")]);
    }
    scene.clip = { dir, frames: readdirSync(join(job, dir)).filter((f) => f.endsWith(".jpg")).length };
  }

  // ---- audio ------------------------------------------------------------
  const voiceFile = join(job, config.voice ?? "voice.mp3");
  if (!existsSync(voiceFile)) throw new Error("No voice yet: voice the reel first");
  const voice = decode(voiceFile);
  const duration = voice.length / RATE + (config.tail ?? 1.4);
  const frames = Math.ceil(duration * fps);
  log(`render: ${name} (${style}), ${duration.toFixed(1)}s, ${frames} frames`);
  const sound = analyse(voice, fps, frames);

  // ---- page server -------------------------------------------------------
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = path.startsWith("/job/") ? join(job, path.slice(5)) : path.startsWith("/three/") ? join(THREE_DIR, path.slice(7)) : join(here, path);
    if (!file.startsWith(job) && !file.startsWith(here) && !file.startsWith(THREE_DIR)) return res.writeHead(403).end();
    if (!existsSync(file) || statSync(file).isDirectory()) return res.writeHead(404).end();
    const size = statSync(file).size, range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? "");
    const type = TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
    if (range) {
      const from = +range[1], to = range[2] ? +range[2] : size - 1;
      res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${from}-${to}/${size}`, "Accept-Ranges": "bytes", "Content-Length": to - from + 1 });
      return createReadStream(file, { start: from, end: to }).pipe(res);
    }
    res.writeHead(200, { "Content-Type": type, "Content-Length": size, "Accept-Ranges": "bytes" });
    createReadStream(file).pipe(res);
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const origin = `http://127.0.0.1:${server.address().port}`;

  const data = { ...config, fps, frames, duration, sound, codeText: config.code ? readFileSync(join(here, config.code), "utf8") : undefined };
  // One Chrome per worker: tabs sharing a browser are background tabs, and Chrome slows those down.
  const browsers = [];
  const errors = [];
  const open = async () => {
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, protocolTimeout: 120000, args: ["--hide-scrollbars", "--use-angle=metal", "--enable-gpu-rasterization", "--ignore-gpu-blocklist"] });
    browsers.push(browser);
    const [page] = await browser.pages();
    await page.setViewport({ width: config.width ?? 1080, height: config.height ?? 1920, deviceScaleFactor: 1 });
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(m.text()));
    page.on("response", (r) => r.status() >= 400 && !r.url().endsWith("/favicon.ico") && errors.push(`${r.status()} ${new URL(r.url()).pathname}`));
    await page.evaluateOnNewDocument((d) => { window.REEL = d; }, data);
    await page.goto(`${origin}/${style}/index.html`);
    // A page that failed to load has no window.reel: report its own error instead.
    // Pages may set window.reel after a dynamic import (the 3D reel), so wait for it.
    await page.waitForFunction(() => window.reel, { timeout: 60000 }).catch(() => { throw new Error(`page did not load: ${errors.join(" | ") || "no error message"}`); });
    await page.evaluate(() => window.reel.ready);
    return page;
  };

  try {
    if (stills) {
      const out = join(job, `stills-${name}`);
      rmSync(out, { recursive: true, force: true });
      mkdirSync(out, { recursive: true });
      const page = await open();
      const files = [];
      for (const t of stills) {
        const file = join(out, `t${String(Math.round(t * 10)).padStart(4, "0")}.png`);
        await page.evaluate((f) => window.reel.seek(f), Math.min(frames - 1, Math.round(t * fps)));
        await page.screenshot({ path: file });
        files.push(file);
      }
      if (errors.length) throw new Error(`page error: ${errors[0]}`);
      return files;
    }

    const out = join(job, `frames-${name}`);
    rmSync(out, { recursive: true, force: true });
    mkdirSync(out, { recursive: true });
    const pages = await Promise.all(Array.from({ length: workers }, open));
    let done = 0;
    const started = Date.now();
    await Promise.all(pages.map(async (page, w) => {
      for (let f = w; f < frames; f += workers) {
        await page.evaluate((f) => window.reel.seek(f), f);
        await page.screenshot({ path: join(out, `${String(f).padStart(5, "0")}.png`) });
        onProgress?.(++done, frames);
        if (done % 300 === 0) log(`render: ${done}/${frames} frames (${((Date.now() - started) / 1000).toFixed(0)}s)`);
      }
    }));
    if (errors.length) throw new Error(`page error: ${errors[0]}`);

    // Sound: voice + the style's effects (+ beat), mixed and brought to -14 LUFS.
    const events = await pages[0].evaluate(() => window.reel.events());
    const fx = effects(events, duration);
    // Effects under a full voice need a lift to be heard (the newer looks set fxGain).
    if (config.fxGain) for (let i = 0; i < fx.length; i++) fx[i] *= config.fxGain;
    if (config.music === "beat" || config.music === "pad") {
      const music = config.music === "pad" ? pad(duration) : beat(duration, config.bpm);
      for (let i = 0; i < fx.length; i++) fx[i] += music[i] * (config.musicGain ?? 0.55);
    }
    const fxFile = join(out, "fx.wav");
    writeWav(fxFile, fx);
    const video = join(job, config.out ?? `${name}.mp4`);
    log("render: encoding");
    await run("ffmpeg", ["-v", "error", "-y", "-framerate", String(fps), "-i", join(out, "%05d.png"), "-i", voiceFile, "-i", fxFile,
      "-filter_complex", `[1:a]apad[v];[v][2:a]amix=inputs=2:duration=longest:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a]`,
      "-map", "0:v", "-map", "[a]", "-t", duration.toFixed(3), "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", video]);
    if (!keepFrames) rmSync(out, { recursive: true, force: true });
    log(`render: ${basename(video)} in ${((Date.now() - started) / 1000).toFixed(0)}s`);
    return video;
  } finally {
    await Promise.all(browsers.map((browser) => browser.close()));
    server.close();
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const args = process.argv.slice(2);
  const flag = (name) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1] ?? true; };
  const jobFile = args.find((a) => a.endsWith(".json"));
  if (!jobFile || !existsSync(jobFile)) throw new Error("usage: node reels/render.mjs <job>/<style>.json [--stills 1,5] [--keep-frames]");
  const stills = flag("--stills");
  const result = await renderReel(jobFile, { stills: stills ? String(stills).split(",").map(Number) : undefined, workers: Number(flag("--workers") ?? 4), keepFrames: args.includes("--keep-frames") });
  console.log(Array.isArray(result) ? `stills → ${dirname(result[0])}` : `→ ${result}`);
}
