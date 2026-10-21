import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { OUTPUT_DIR } from "../config.ts";
import { hostOf } from "../clients/library.ts";
import { composePromo } from "./compose.ts";
import { SHAPES, type Shape } from "./layout.ts";
import { DEFAULT_OPTIONS, LENGTHS, recordSite, SPEEDS, type Look, type PromoOptions } from "./record.ts";

/** A website promo: the site scrolling on a laptop and a phone, in both video shapes. */
export type Promo = {
  id: string;
  url: string;
  host: string;
  /** The page's title, once recorded. */
  title: string;
  createdAt: string;
  status: "making" | "done" | "failed";
  /** How fast and how long it scrolls; promos from before the choice have none (they scrolled 16s). */
  options?: PromoOptions;
  error?: string;
  seconds?: number;
  look?: Look;
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
  await writeFile(join(promoDir(promo.id), "promo.json"), `${JSON.stringify(promo, null, 2)}\n`);
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
  return { speed, length };
}

/** Starts a promo's record so its page can show it while it is made. */
export async function startPromo(url: string, options: PromoOptions = DEFAULT_OPTIONS): Promise<Promo> {
  const site = siteUrl(url);
  let id = promoIdFor(site);
  for (let n = 2; existsSync(promoDir(id)); n++) id = `${promoIdFor(site)}-${n}`;
  const promo: Promo = { id, url: site, host: hostOf(site), title: hostOf(site), createdAt: new Date().toISOString(), status: "making", options };
  await savePromo(promo);
  return promo;
}

/** Records the site and makes both videos; the promo's record says how it went. */
export async function makePromo(id: string, log: (message: string) => void = console.log): Promise<Promo> {
  const promo = await loadPromo(id);
  const dir = promoDir(id);
  const work = join(dir, "work");
  try {
    const recording = await recordSite(promo.url, work, promo.options ?? DEFAULT_OPTIONS, log);
    const videos: Promo["videos"] = {};
    let seconds = 0;
    for (const shape of SHAPES) {
      log(`promo: composing the ${shape} video ...`);
      const file = `promo-${shape}.mp4`;
      ({ seconds } = await composePromo({ ...recording, dir: work, shape, out: join(dir, file) }));
      videos[shape] = file;
    }
    const done: Promo = { ...promo, title: recording.title || promo.host, status: "done", seconds, look: recording.look, videos };
    await savePromo(done);
    await rm(work, { recursive: true, force: true });
    log(`promo: done, ${seconds.toFixed(1)}s in ${SHAPES.join(" and ")}`);
    return done;
  } catch (error) {
    await savePromo({ ...promo, status: "failed", error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/** Promos left "making" when the studio stopped: their job is gone. */
export async function recoverPromos(): Promise<void> {
  for (const promo of await listPromos()) if (promo.status === "making") await savePromo({ ...promo, status: "failed", error: "The studio stopped while this was being made" });
}
