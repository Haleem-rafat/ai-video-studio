import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { generateImage, generateText, Output } from "ai";
import { z } from "zod";

import type { FormatId, Photo, Project } from "../types.ts";

/**
 * Real photos for a deep-dive video. Each photo query is searched on
 * Wikimedia Commons, where every file has a free licence; a vision model
 * picks the candidate that really shows the thing, and its credit line goes
 * into the description. When nothing fits, an AI picture stands in, and the
 * studio can replace any of them with an uploaded photo.
 */

const COMMONS = "https://commons.wikimedia.org/w/api.php";
// Wikimedia asks every API client to name itself.
const AGENT = "AI-Video-Studio/1.0 (local video tool)";
const PICK_MODEL = "google/gemini-3.5-flash";
// Licences that allow reuse in a monetised video with a credit line.
const FREE = /^(cc[ -]by(-sa)?( \d\.\d)?|cc0|public domain|pd\b)/i;
const NOT_A_PHOTO = /logo|icon|diagram|chart|map|flag|symbol|schematic|block|graph|plot|\.svg/i;

type Candidate = { title: string; preview: string; full: string; page: string; credit: string };

const stripHtml = (html: string) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

/** Wikimedia answers 429 when asked too fast; wait and try again (10s, 30s, 60s). */
async function politeFetch(url: string): Promise<Response> {
  for (const wait of [0, 10, 30, 60]) {
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait * 1000));
    const response = await fetch(url, { headers: { "User-Agent": AGENT } });
    if (response.status !== 429) return response;
  }
  throw new Error(`Wikimedia is rate-limiting (429): ${url}`);
}

async function commons(params: Record<string, string>): Promise<any> {
  const response = await politeFetch(`${COMMONS}?${new URLSearchParams({ format: "json", ...params })}`);
  if (!response.ok) throw new Error(`Wikimedia Commons ${response.status}`);
  return response.json();
}

async function download(url: string): Promise<Uint8Array> {
  const response = await politeFetch(url);
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** Freely licensed photos (not logos or diagrams) at least 1000px wide, best search matches first. */
async function candidates(query: string, skip: Set<string>): Promise<Candidate[]> {
  const data = await commons({
    action: "query",
    generator: "search",
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: "6",
    gsrlimit: "20",
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: "640",
  });
  const pages = Object.values<any>(data.query?.pages ?? {}).sort((a, b) => a.index - b.index);
  return pages
    .map((page) => ({ page, info: page.imageinfo?.[0] }))
    .filter(({ page, info }) => info && !skip.has(page.title) && !NOT_A_PHOTO.test(page.title))
    .filter(({ info }) => /jpeg|png|webp/.test(info.mime) && info.width >= 1000)
    .filter(({ info }) => FREE.test(info.extmetadata?.LicenseShortName?.value ?? ""))
    .slice(0, 8)
    .map(({ page, info }) => {
      const meta = info.extmetadata;
      const artist = stripHtml(meta.Artist?.value ?? "") || "Unknown author";
      const licence = meta.LicenseShortName.value;
      return {
        title: page.title,
        preview: info.thumburl,
        // The 1920px rendition when the original is bigger; small originals are used as they are.
        full: info.width > 1920 ? info.thumburl.replace(/\/\d+px-/, "/1920px-") : info.url,
        page: info.descriptionurl,
        credit: `${page.title.replace(/^File:/, "").replace(/\.\w+$/, "")}: ${artist}, ${licence}, Wikimedia Commons`,
      };
    });
}

/** Asks a vision model which candidate truly shows the query, sharp and uncluttered; -1 when none does. */
async function pick(query: string, topic: string, options: Candidate[]): Promise<number> {
  const previews = await Promise.all(options.map((option) => download(option.preview).catch(() => null)));
  const usable = options.map((option, index) => ({ option, image: previews[index], index })).filter((entry) => entry.image);
  if (!usable.length) return -1;
  const { output } = await generateText({
    model: PICK_MODEL,
    output: Output.object({ schema: z.object({ best: z.number().int(), reason: z.string() }) }),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              `A video about "${topic}" needs a real photo of: ${query}.\n` +
              `Here are ${usable.length} candidates, numbered 0 to ${usable.length - 1} in order. Pick the one that clearly shows exactly that, ` +
              "sharp, well lit and uncluttered, that would look good full screen. Reject screenshots, diagrams, text-heavy pictures, staged film or costume shots, anything violent or medical-gory, and unrelated things. " +
              "Answer -1 if none fits.",
          },
          ...usable.map((entry) => ({ type: "file" as const, mediaType: "image", data: entry.image! })),
        ],
      },
    ],
  });
  return output.best >= 0 && output.best < usable.length ? usable[output.best].index : -1;
}

async function drawPhoto(query: string, topic: string, format: FormatId): Promise<Uint8Array> {
  const { image } = await generateImage({
    model: "bfl/flux-3-image",
    prompt: `Realistic editorial photograph of ${query}, for a video about ${topic}. Natural light, sharp detail, shallow depth of field, no text, no logos.`,
    aspectRatio: format === "short" ? "9:16" : "16:9",
  });
  return image.uint8Array;
}

/** Finds (or draws) one photo and saves it as images/<name>.jpg. */
async function findPhoto(dir: string, name: string, photo: Photo, topic: string, format: FormatId, used: Set<string>, log: (message: string) => void): Promise<Photo> {
  const path = `images/${name}.jpg`;
  await mkdir(join(dir, "images"), { recursive: true });
  // A narrow query often finds nothing; the same words minus the last one usually do ("EUV lithography machine" -> "EUV lithography").
  const words = photo.query.split(/\s+/);
  const queries = [photo.query, ...(words.length > 2 ? [words.slice(0, -1).join(" ")] : [])];
  for (const query of queries) {
    try {
      const options = await candidates(query, used);
      const best = options.length ? await pick(photo.query, topic, options) : -1;
      if (best < 0) continue;
      const chosen = options[best];
      await writeFile(join(dir, path), await download(chosen.full));
      used.add(chosen.title);
      return { query: photo.query, path, credit: chosen.credit, url: chosen.page, source: "commons" };
    } catch (error) {
      log(`photos: Commons search failed for "${query}" (${error instanceof Error ? error.message : error})`);
    }
  }
  log(`photos: no free photo of "${photo.query}", drawing one`);
  await writeFile(join(dir, path), await drawPhoto(photo.query, topic, format));
  return { query: photo.query, path, source: "ai" };
}

/** Gives every scene photo and the cover a picture; keeps the ones already there. Returns how many were found. */
export async function preparePhotos(dir: string, project: Project, log: (message: string) => void = console.log): Promise<number> {
  const used = new Set<string>();
  const missing = (photo?: Photo) => photo?.query && !(photo.path && existsSync(join(dir, photo.path)));
  let found = 0;
  for (const scene of project.scenes) {
    if (scene.visual.type !== "deepdive" || !missing(scene.visual.photo)) continue;
    scene.visual.photo = await findPhoto(dir, `photo-${scene.id}-${Date.now().toString(36)}`, scene.visual.photo!, project.topic, project.format, used, log);
    found++;
  }
  const cover = project.deepdive?.cover;
  if (project.deepdive && missing(cover)) {
    // The thumbnail is always landscape.
    project.deepdive.cover = await findPhoto(dir, `cover-${Date.now().toString(36)}`, cover!, project.topic, "long", used, log);
    found++;
  }
  return found;
}

/** Stores an uploaded photo for a scene (or "cover" for the thumbnail), replacing the found one. */
export async function addScenePhoto(dir: string, project: Project, target: string, dataUrl: string): Promise<Project> {
  const match = dataUrl.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
  if (!match) throw new Error("Upload a PNG, JPEG or WebP photo");
  const path = `images/upload-${target}-${Date.now().toString(36)}.${match[1] === "jpeg" ? "jpg" : match[1]}`;
  await mkdir(join(dir, "images"), { recursive: true });
  await writeFile(join(dir, path), Buffer.from(match[2], "base64"));

  if (target === "cover") {
    if (!project.deepdive) throw new Error("Only deep-dive videos have a cover photo");
    project.deepdive.cover = { query: project.deepdive.cover?.query ?? "", path, source: "upload" };
    return project;
  }
  const scene = project.scenes.find((candidate) => candidate.id === target);
  if (!scene || scene.visual.type !== "deepdive") throw new Error(`No deep-dive scene "${target}"`);
  scene.visual.photo = { query: scene.visual.photo?.query ?? "", path, source: "upload" };
  return project;
}

/** "Photos:" lines for the description, one per Commons photo used. */
export function photoCredits(project: Project, arabic: boolean): string {
  const photos = [
    ...project.scenes.flatMap((scene) => (scene.visual.type === "deepdive" ? [scene.visual.photo, ...(scene.visual.gallery ?? [])] : scene.visual.type === "versus" ? (scene.visual.gallery ?? []) : [])),
    project.deepdive?.cover,
    ...(project.versus?.a.photos ?? []),
    ...(project.versus?.b.photos ?? []),
  ];
  // Commons licences ask for a credit; press photos (uploads) carry one when their maker is named.
  const credits = [...new Set(photos.filter((photo) => photo?.source !== "ai" && photo?.credit).map((photo) => `- ${photo!.credit}`))];
  return credits.length ? `${arabic ? "الصور" : "Photos"}:\n${credits.join("\n")}` : "";
}
