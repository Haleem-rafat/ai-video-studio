import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import type { Clip, Photo, Product } from "../types.ts";
import { cutout } from "./products.ts";

const run = promisify(execFile);

/**
 * A product's official press media, for review videos: the maker's press
 * photos (Apple Newsroom) and the short silent loops on its product page.
 * Real pictures and footage instead of AI drawings. Apple products only for
 * now; anything else gets nothing and keeps its uploaded or AI pictures.
 */

const APPLE = "https://www.apple.com";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const MAX_CLIPS = 8;
const MAX_PHOTOS = 10;

/** apple.com's address for an Apple product: "iPhone 18 Pro" → "iphone-18-pro"; null for other makers. */
export function appleSlug(name: string): string | null {
  const clean = name.replace(/^apple\s+(?=iphone|ipad|mac|airpods|vision)/i, "").trim();
  if (!/^(iphone|ipad|mac|macbook|imac|airpods|apple watch|apple vision|homepod)/i.test(clean)) return null;
  return clean.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** The folders of a product page's silent loops (each holds large.mp4, medium.mp4…), in page order. */
export function clipFolders(html: string): string[] {
  return [...new Set([...html.matchAll(/data-inline-media-basepath="([^"]+)"/g)].map((match) => match[1]))];
}

/** Newsroom articles about the product, from the newsroom feed. */
export function newsroomArticles(rss: string, slug: string): string[] {
  return [...new Set([...rss.matchAll(/href="(https:\/\/www\.apple\.com\/newsroom\/\d{4}\/\d{2}\/[^"]+\/)"/g)].map((match) => match[1]))].filter((url) => url.includes(slug));
}

/** An article's photos, each once, at the largest size published. */
export function articleImages(html: string): string[] {
  const names = new Set<string>();
  const out: string[] = [];
  for (const match of html.matchAll(/(\/newsroom\/images\/[^"'\s]+\/article\/([^"'\s/]+?)\.jpg)\.(?:jpg|large_2x\.jpg|medium_2x\.jpg|small_2x\.jpg)/g)) {
    if (names.has(match[2])) continue;
    names.add(match[2]);
    out.push(`${match[1]}.large_2x.jpg`);
  }
  return out;
}

/** Product-page clips that end on the product itself, best first (their folder names). */
const PRODUCT_CLIPS = ["highlights-colors", "colors", "hero-display", "highlights-display", "design", "highlights-design", "lineup"];
export const productClipRank = (name: string | undefined) => {
  const rank = PRODUCT_CLIPS.indexOf(name ?? "");
  return rank === -1 ? PRODUCT_CLIPS.length : rank;
};

/** A photo that shows the product itself, for its cut-out: the lineup, colours, open and closed… */
const PRODUCT_SHOT = /(hero|lineup|colou?rs?|closed-and-open|back|front|design|finish)/i;

async function get(url: string): Promise<Response> {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response;
}

async function seconds(path: string): Promise<number> {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]);
  return Number(stdout.trim()) || 0;
}

/**
 * Downloads a product's press photos and clips into the project folder.
 * Never throws: a product with nothing found keeps what it had.
 */
export async function fetchPressMedia(dir: string, product: Product, side: "a" | "b", log: (message: string) => void): Promise<{ photos: Photo[]; clips: Clip[]; image?: string }> {
  const slug = appleSlug(product.name);
  if (!slug) return { photos: [], clips: [] };
  const photos: Photo[] = [];
  const clips: Clip[] = [];
  let image: string | undefined;
  await mkdir(join(dir, "press"), { recursive: true });

  try {
    const page = await (await get(`${APPLE}/${slug}/`)).text();
    for (const [n, folder] of clipFolders(page).slice(0, MAX_CLIPS * 2).entries()) {
      if (clips.length >= MAX_CLIPS) break;
      const path = `press/${side}-clip-${n + 1}.mp4`;
      try {
        await writeFile(join(dir, path), Buffer.from(await (await get(`${APPLE}${folder}large.mp4`)).arrayBuffer()));
        const length = await seconds(join(dir, path));
        if (length >= 1.5) clips.push({ path, seconds: Math.round(length * 100) / 100, credit: "Apple", url: `${APPLE}/${slug}/`, name: folder.split("/").filter(Boolean).at(-1) });
      } catch {
        // Some folders hold image sequences, not a clip.
      }
    }
  } catch (error) {
    log(`press: no product page for ${product.name} (${error instanceof Error ? error.message : error})`);
  }

  try {
    const rss = await (await get(`${APPLE}/newsroom/rss-feed.rss`)).text();
    const urls = (await Promise.all(newsroomArticles(rss, slug).slice(0, 2).map(async (article) => articleImages(await (await get(article)).text()).map((src) => ({ src, article }))))).flat();
    for (const [n, { src, article }] of urls.slice(0, MAX_PHOTOS).entries()) {
      const path = `press/${side}-photo-${n + 1}.jpg`;
      try {
        await writeFile(join(dir, path), Buffer.from(await (await get(`${APPLE}${src}`)).arrayBuffer()));
        photos.push({ query: product.name, path, credit: "Apple Newsroom", url: article, source: "press", fit: "cover" });
      } catch {
        // A missing size is skipped.
      }
    }
  } catch (error) {
    log(`press: no newsroom photos for ${product.name} (${error instanceof Error ? error.message : error})`);
  }

  // The product itself, cut out where it rests at the end of the clip that shows it best, else from a press photo.
  const candidates: { clip?: Clip; photo?: Photo }[] = [
    ...[...clips].filter((clip) => productClipRank(clip.name) < PRODUCT_CLIPS.length).sort((x, y) => productClipRank(x.name) - productClipRank(y.name)).map((clip) => ({ clip })),
    ...photos.filter((photo) => PRODUCT_SHOT.test(photo.path!)).map((photo) => ({ photo })),
  ];
  for (const [n, candidate] of candidates.slice(0, 4).entries()) {
    const cut = `press/${side}-product.png`;
    try {
      let source = candidate.photo?.path;
      if (candidate.clip) {
        source = `press/${side}-frame-${n + 1}.png`;
        await run("ffmpeg", ["-v", "error", "-y", "-sseof", "-0.3", "-i", join(dir, candidate.clip.path), "-frames:v", "1", join(dir, source)]);
      }
      await cutout(join(dir, source!), join(dir, cut));
      image = cut;
      break;
    } catch {
      // No clear subject in this one; the next is tried.
    }
  }

  log(`press: ${product.name}: ${photos.length} photo(s), ${clips.length} clip(s)${image ? ", a real product picture" : ""}`);
  return { photos, clips, ...(image ? { image } : {}) };
}
