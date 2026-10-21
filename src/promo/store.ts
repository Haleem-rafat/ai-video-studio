import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { OUTPUT_DIR } from "../config.ts";
import { hostOf } from "../clients/library.ts";
import { composePromo, lengthOf } from "./compose.ts";
import { composeTrack, listTracks, MOODS, MUSIC_DIR, pickMusic, type Mood } from "./music.ts";
import { SHAPES, type Shape } from "./layout.ts";

const run = promisify(execFile);
import { DEFAULT_OPTIONS, LENGTHS, recordSite, SPEEDS, type Look, type PromoOptions } from "./record.ts";

/** A website promo: the site scrolling on a laptop and a phone, in both video shapes. */
export type Promo = {
  id: string;
  url: string;
  host: string;
  /** The page's title, once recorded. */
  title: string;
  createdAt: string;
  /** When its record last changed: new music or a new name. */
  updatedAt?: string;
  status: "making" | "done" | "failed";
  /** How fast and how long it scrolls; promos from before the choice have none (they scrolled 16s). */
  options?: PromoOptions;
  error?: string;
  seconds?: number;
  look?: Look;
  /** The track in assets/music it plays. */
  music?: string;
  /** Shape → file in the promo's folder. */
  videos?: Partial<Record<Shape, string>>;
};

/** output/.promos, or PROMOS_DIR in tests. */
export function promosDir(): string {
  return process.env.PROMOS_DIR ?? join(OUTPUT_DIR, ".promos");
}

export const promoDir = (id: string) => join(promosDir(), id);

/** A typed address as a web address ("site.com" → "https://site.com/"); throws when it isn't one. */
export function siteUrl(input: string): string {
  const text = input.trim();
  const url = URL.parse(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`);
  if (!url || !/^https?:$/.test(url.protocol) || !hostOf(url.href)) throw new Error(`"${input}" is not a website address`);
  return url.href;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The time it was made, then the site: "202610202305-hythamsalah-risero-io". */
export function promoIdFor(url: string, at = new Date()): string {
  const stamp = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}${pad(at.getHours())}${pad(at.getMinutes())}`;
  return `${stamp}-${hostOf(siteUrl(url)).replace(/[^a-z0-9]+/g, "-")}`;
}

export async function savePromo(promo: Promo): Promise<void> {
  await mkdir(promoDir(promo.id), { recursive: true });
  await writeFile(join(promoDir(promo.id), "promo.json"), `${JSON.stringify({ ...promo, updatedAt: new Date().toISOString() }, null, 2)}\n`);
}

export async function loadPromo(id: string): Promise<Promo> {
  return JSON.parse(await readFile(join(promoDir(id), "promo.json"), "utf8")) as Promo;
}

/** Newest first. */
export async function listPromos(): Promise<Promo[]> {
  if (!existsSync(promosDir())) return [];
  const entries = await readdir(promosDir(), { withFileTypes: true });
  const promos = await Promise.all(entries.filter((entry) => entry.isDirectory() && existsSync(join(promoDir(entry.name), "promo.json"))).map((entry) => loadPromo(entry.name)));
  return promos.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Speed and length as the app sent them; anything unknown is the default. */
export function promoOptions(input: Partial<Record<keyof PromoOptions, unknown>> | undefined): PromoOptions {
  const speed = typeof input?.speed === "string" && input.speed in SPEEDS ? (input.speed as PromoOptions["speed"]) : DEFAULT_OPTIONS.speed;
  const length = LENGTHS.find((option) => option === input?.length) ?? DEFAULT_OPTIONS.length;
  const music =
    typeof input?.music === "string" && (/^[\w.-]+\.mp3$/i.test(input.music) || input.music === "none" || MOODS.some((mood) => input.music === `new:${mood}`)) ? input.music : undefined;
  return { speed, length, ...(music ? { music } : {}) };
}

/** Starts a promo's record so its page can show it while it is made. */
export async function startPromo(url: string, options: PromoOptions = DEFAULT_OPTIONS): Promise<Promo> {
  const site = siteUrl(url);
  // A second click while it records would only queue the same video again.
  const same = (await listPromos()).find((promo) => promo.status === "making" && promo.url === site && promo.options?.speed === options.speed && promo.options?.length === options.length && promo.options?.music === options.music);
  if (same) throw new Error(`This promo of ${hostOf(site)} is already being made (${same.id})`);
  let id = promoIdFor(site);
  for (let n = 2; existsSync(promoDir(id)); n++) id = `${promoIdFor(site)}-${n}`;
  const promo: Promo = { id, url: site, host: hostOf(site), title: hostOf(site), createdAt: new Date().toISOString(), status: "making", options };
  await savePromo(promo);
  return promo;
}

/** The screen recordings, kept so the music can change without recording again. */
const recordingsOf = (id: string) => ({ desktop: join(promoDir(id), "rec", "desktop.mp4"), phone: join(promoDir(id), "rec", "phone.mp4") });

/** The track for `wanted` (Auto, a library file, "none" or "new:<mood>"), for a promo `need` seconds long. */
async function chooseMusic(wanted: string | undefined, need: number, log: (message: string) => void): Promise<string | undefined> {
  if (wanted === "none") return undefined;
  if (wanted?.startsWith("new:")) return composeTrack(wanted.slice(4) as Mood, log);
  // A track long enough to play once, and not the one the last promos used.
  const recent = (await listPromos()).map((other) => other.music).filter((file): file is string => Boolean(file));
  const music = pickMusic(await listTracks(), need, recent, wanted);
  if (!music) throw new Error(`No music in ${MUSIC_DIR}`);
  return music;
}

/** Composes both shapes from the recordings over `music` (none is silent); old muted copies are dropped. */
async function composeShapes(id: string, look: Look, music: string | undefined, log: (message: string) => void): Promise<{ videos: Promo["videos"]; seconds: number }> {
  const dir = promoDir(id);
  const rec = recordingsOf(id);
  log(music ? `promo: music ${music}` : "promo: no music");
  const videos: Promo["videos"] = {};
  let seconds = 0;
  for (const shape of SHAPES) {
    log(`promo: composing the ${shape} video ...`);
    const file = `promo-${shape}.mp4`;
    const next = join(dir, `next-${file}`);
    ({ seconds } = await composePromo({ ...rec, look, dir: join(dir, "rec"), shape, out: next, music: music ? join(MUSIC_DIR, music) : undefined }));
    // The finished file replaces the old one in one step, so a download never gets half a video.
    await rename(next, join(dir, file));
    await rm(join(dir, mutedName(shape)), { force: true });
    videos[shape] = file;
  }
  for (const layer of await readdir(join(dir, "rec"))) if (layer.endsWith(".png")) await rm(join(dir, "rec", layer));
  return { videos, seconds };
}

/** Records the site and makes both videos; the promo's record says how it went. */
export async function makePromo(id: string, log: (message: string) => void = console.log): Promise<Promo> {
  const promo = await loadPromo(id);
  try {
    const recording = await recordSite(promo.url, join(promoDir(id), "rec"), promo.options ?? DEFAULT_OPTIONS, log);
    const need = Math.min(await lengthOf(recording.desktop), await lengthOf(recording.phone));
    const music = await chooseMusic(promo.options?.music, need, log);
    const { videos, seconds } = await composeShapes(id, recording.look, music, log);
    const done: Promo = { ...promo, title: recording.title || promo.host, status: "done", seconds, look: recording.look, ...(music ? { music } : {}), videos };
    await savePromo(done);
    log(`promo: done, ${seconds.toFixed(1)}s in ${SHAPES.join(" and ")}`);
    return done;
  } catch (error) {
    await savePromo({ ...promo, status: "failed", error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/** Whether the promo's screen recordings are kept (promos from before 2026-10-21 deleted them). */
export const canChangeMusic = (id: string) => Object.values(recordingsOf(id)).every((path) => existsSync(path));

/** Puts other music under a finished promo (Auto, a library file, "none" or "new:<mood>"), without recording again. */
export async function changeMusic(id: string, wanted: string, log: (message: string) => void = console.log): Promise<Promo> {
  const promo = await loadPromo(id);
  if (promo.status !== "done") throw new Error("Only a finished promo can change its music");
  if (!canChangeMusic(id) || !promo.look) throw new Error("This promo was made before recordings were kept. Record again to change its music.");
  const rec = recordingsOf(id);
  const need = Math.min(await lengthOf(rec.desktop), await lengthOf(rec.phone));
  const music = await chooseMusic(wanted || undefined, need, log);
  const { videos, seconds } = await composeShapes(id, promo.look, music, log);
  const { music: _old, ...rest } = promo;
  const next: Promo = { ...rest, ...(music ? { music } : {}), seconds, videos, options: { ...(promo.options ?? DEFAULT_OPTIONS), ...(wanted ? { music: wanted } : {}) } };
  if (!wanted && next.options) delete next.options.music;
  await savePromo(next);
  return next;
}

/** Renames a promo. */
export async function renamePromo(id: string, title: string): Promise<Promo> {
  const name = title.trim();
  if (!name) throw new Error("A promo needs a name");
  const next = { ...(await loadPromo(id)), title: name };
  await savePromo(next);
  return next;
}

const mutedName = (shape: Shape) => `promo-${shape}-muted.mp4`;

/** The promo's video in `shape` without sound (made once, then kept until the video changes). */
export async function mutedFile(id: string, shape: Shape): Promise<string> {
  const promo = await loadPromo(id);
  const file = promo.videos?.[shape];
  if (!file || !existsSync(join(promoDir(id), file))) throw new Error(`No ${shape} video in this promo`);
  const muted = join(promoDir(id), mutedName(shape));
  if (!existsSync(muted)) await run("ffmpeg", ["-v", "error", "-y", "-i", join(promoDir(id), file), "-an", "-c:v", "copy", "-movflags", "+faststart", muted]);
  return muted;
}

/** Promos left "making" when the studio stopped: their job is gone. */
export async function recoverPromos(): Promise<void> {
  for (const promo of await listPromos()) if (promo.status === "making") await savePromo({ ...promo, status: "failed", error: "The studio stopped while this was being made" });
}

/** Deletes a promo's folder and videos; one still being made is kept, since its job would write it back. */
export async function deletePromo(id: string): Promise<void> {
  if (!/^[a-z0-9-]+$/.test(id) || !existsSync(join(promoDir(id), "promo.json"))) throw new Error(`No promo "${id}"`);
  if ((await loadPromo(id)).status === "making") throw new Error("This promo is being made; delete it once it is done or failed");
  await rm(promoDir(id), { recursive: true, force: true });
}

/** Deletes every failed promo; returns their ids. */
export async function deleteFailedPromos(): Promise<string[]> {
  const failed = (await listPromos()).filter((promo) => promo.status === "failed").map((promo) => promo.id);
  for (const id of failed) await deletePromo(id);
  return failed;
}
