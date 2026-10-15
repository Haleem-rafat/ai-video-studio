import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

import { generateImage, generateText, Output } from "ai";
import { z } from "zod";

import { brandDir, loadChannel, saveChannel, type Brand, type Channel } from "../config.ts";
import { youtubeApi } from "../publish/youtube.ts";

// Reads pictures, so it must be a vision model.
const STYLE_MODEL = "google/gemini-3.5-flash";
// Keeps a character's face and outfit across poses, with transparent backgrounds.
const CHARACTER_MODEL = "openai/gpt-image-1.5";

export type AssetKind = "logo" | "banner" | "mascot" | "reference" | "photo";

/** The fonts a channel can pick: system fonts, so every render has them. */
export const FONTS = {
  "Avenir Next": "'Avenir Next', Helvetica, sans-serif",
  "SF Mono": "'SF Mono', Menlo, monospace",
  "Chalkboard": "'Chalkboard SE', 'Comic Sans MS', sans-serif",
  "Arabic (SF Arabic)": "'SF Arabic', 'Geeza Pro', 'Avenir Next', sans-serif",
  "Arabic rounded (Baghdad)": "'Baghdad', 'Geeza Pro', sans-serif",
} as const;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const STYLE_SCHEMA = z.object({
  language: z.enum(["en", "ar"]),
  audience: z.string().describe("Who watches, in one sentence"),
  tone: z.string().describe("How the narration should sound, in one sentence"),
  imageStyle: z.string().describe("Art direction for background pictures: medium, palette, lighting, mood. End with: no text, no letters"),
  colors: z.object({ background: hex, panel: hex, text: hex, accent: hex, muted: hex }),
  font: z.enum(Object.keys(FONTS) as [keyof typeof FONTS, ...(keyof typeof FONTS)[]]),
  device: z.enum(["phone", "laptop"]).describe("The device explainer scenes show: laptop for tech/dev channels, phone otherwise"),
});

const EXTENSIONS: Record<string, string> = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" };

/** Saves picture bytes into the channel's brand folder and returns the file name. */
async function store(id: string, name: string, bytes: Uint8Array): Promise<string> {
  await mkdir(brandDir(id), { recursive: true });
  await writeFile(join(brandDir(id), name), bytes);
  return name;
}

async function download(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`download ${response.status}: ${url.slice(0, 80)}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** Stores an uploaded data: URL picture as the channel's logo, banner, photo, a mascot pose or a reference. */
export async function addAsset(id: string, kind: AssetKind, dataUrl: string): Promise<Channel> {
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
  if (!match) throw new Error("Upload a PNG, JPEG or WebP picture");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > 15 * 1024 * 1024) throw new Error("Pictures must be under 15 MB");

  const channel = loadChannel(id);
  const brand: Brand = { ...channel.brand };
  const name = await store(id, `${kind}-${Date.now().toString(36)}${EXTENSIONS[match[1]]}`, bytes);
  if (kind === "mascot") brand.mascots = [...(brand.mascots ?? []), name];
  else if (kind === "reference") brand.references = [...(brand.references ?? []), name];
  else brand[kind] = name;
  return keep({ ...channel, brand });
}

export async function removeAsset(id: string, file: string): Promise<Channel> {
  const channel = loadChannel(id);
  const name = basename(file);
  const brand: Brand = { ...channel.brand };
  brand.mascots = brand.mascots?.filter((entry) => entry !== name);
  brand.references = brand.references?.filter((entry) => entry !== name);
  for (const key of ["logo", "banner", "photo"] as const) if (brand[key] === name) delete brand[key];
  await rm(join(brandDir(id), name), { force: true });
  return keep({ ...channel, brand });
}

function keep(channel: Channel): Channel {
  saveChannel(channel);
  return channel;
}

type YouTubeChannel = {
  id: string;
  snippet: { title: string; description: string; customUrl?: string; thumbnails: Record<string, { url: string }> };
  brandingSettings?: { image?: { bannerExternalUrl?: string } };
  contentDetails: { relatedPlaylists: { uploads: string } };
};
type PlaylistItem = { snippet: { title: string; thumbnails: Record<string, { url: string }> } };

const best = (thumbnails: Record<string, { url: string }>) => (thumbnails.maxres ?? thumbnails.standard ?? thumbnails.high ?? thumbnails.medium ?? thumbnails.default)?.url;

/**
 * Reads the signed-in YouTube channel: its picture becomes the logo, its
 * banner and latest thumbnails are kept as references, and a vision model
 * reads all of them, plus the titles, into colors, picture style and tone.
 */
export async function importFromYouTube(id: string, log: (message: string) => void = console.log): Promise<Channel> {
  const found = await youtubeApi<{ items?: YouTubeChannel[] }>(id, "channels?part=snippet,brandingSettings,contentDetails&mine=true");
  const yt = found.items?.[0];
  if (!yt) throw new Error("This Google account has no YouTube channel");
  log(`youtube: ${yt.snippet.title} (${yt.snippet.customUrl ?? yt.id})`);

  const channel = loadChannel(id);
  const brand: Brand = { ...channel.brand, handle: yt.snippet.customUrl ?? channel.brand?.handle };
  const avatar = best(yt.snippet.thumbnails);
  if (avatar) brand.logo = await store(id, "logo-youtube.jpg", await download(avatar.replace(/=s\d+-/, "=s800-")));
  const banner = yt.brandingSettings?.image?.bannerExternalUrl;
  if (banner) brand.banner = await store(id, "banner-youtube.jpg", await download(`${banner}=w2120-fcrop64=1,00005a57ffffa5a8-k-c0xffffffff-no-nd-rj`));

  const uploads = await youtubeApi<{ items?: PlaylistItem[] }>(id, `playlistItems?part=snippet&maxResults=8&playlistId=${yt.contentDetails.relatedPlaylists.uploads}`);
  const videos = uploads.items ?? [];
  const references: string[] = [];
  for (const [index, video] of videos.entries()) {
    const url = best(video.snippet.thumbnails);
    if (url) references.push(await store(id, `ref-youtube-${index + 1}.jpg`, await download(url)));
  }
  brand.references = [...new Set([...(brand.references ?? []).filter((name) => !name.startsWith("ref-youtube-")), ...references])];
  brand.youtube = { id: yt.id, title: yt.snippet.title, importedAt: new Date().toISOString() };
  log(`youtube: logo${banner ? ", banner" : ""} and ${references.length} thumbnail(s) saved`);

  const updated = keep({ ...channel, brand });
  return readStyle(updated, { titles: videos.map((video) => video.snippet.title), description: yt.snippet.description }, log);
}

/** Asks a vision model what the channel looks and sounds like, from its pictures and titles. */
export async function readStyle(channel: Channel, extra: { titles?: string[]; description?: string } = {}, log: (message: string) => void = console.log): Promise<Channel> {
  const dir = brandDir(channel.id);
  const pictures = [channel.brand?.logo, channel.brand?.banner, ...(channel.brand?.references ?? []).slice(0, 8), ...(channel.brand?.mascots ?? []).slice(0, 1)]
    .filter((name): name is string => Boolean(name && existsSync(join(dir, name))));
  if (pictures.length === 0) throw new Error("Add a logo, thumbnails or other pictures first, or import them from YouTube");

  log(`style: reading ${pictures.length} picture(s) ...`);
  const { output } = await generateText({
    model: STYLE_MODEL,
    output: Output.object({ schema: STYLE_SCHEMA }),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              `These are the logo, banner and recent thumbnails of the YouTube channel "${channel.name}".` +
              (extra.description ? `\nChannel description: ${extra.description.slice(0, 800)}` : "") +
              (extra.titles?.length ? `\nRecent video titles:\n- ${extra.titles.join("\n- ")}` : "") +
              "\n\nDescribe the channel's visual identity so new videos match it: the five colors as hex " +
              "(background, panel = slightly lighter/darker card colour, text, accent = the brand's signature colour, muted = secondary text), " +
              "the picture style for AI-generated backgrounds, the audience, the narration tone, the language of the titles, the closest font and the device.",
          },
          ...(await Promise.all(pictures.map(async (name) => ({ type: "image" as const, image: await readFile(join(dir, name)) })))),
        ],
      },
    ],
  });

  const updated = keep({
    ...channel,
    language: output.language,
    audience: output.audience,
    tone: output.tone,
    imageStyle: output.imageStyle,
    colors: output.colors,
    font: FONTS[output.font],
    device: output.device,
  });
  log(`style: accent ${output.colors.accent}, ${output.font}, ${output.language === "ar" ? "Arabic" : "English"}`);
  return updated;
}

const POSES = {
  point: "pointing up with both index fingers, excited open smile",
  think: "one finger on the chin thinking, other hand on the hip, curious smile",
  wave: "waving hello with one hand, big smile, other hand giving a thumbs up",
} as const;

/**
 * Makes the channel's character in three poses with transparent backgrounds.
 * From a photo it keeps the person's likeness as a 3D cartoon; otherwise it
 * draws one from the description. Every pose after the first is drawn from
 * the first, so the face and outfit stay the same.
 */
export async function makeCharacter(id: string, description: string, log: (message: string) => void = console.log): Promise<Channel> {
  const channel = loadChannel(id);
  const dir = brandDir(id);
  const photo = channel.brand?.photo && existsSync(join(dir, channel.brand.photo)) ? await readFile(join(dir, channel.brand.photo)) : null;
  const look = description.trim() || `a friendly mascot for the channel "${channel.name}", wearing clothes in ${channel.colors.accent}`;
  const options = { size: "1024x1536" as const, providerOptions: { openai: { background: "transparent", quality: "medium", outputFormat: "png" } } };
  const stamp = Date.now().toString(36);

  log(`character: drawing the main pose${photo ? " from your photo" : ""} ...`);
  const firstText =
    (photo
      ? "Turn the person in this photo into a cute 3D cartoon character (Pixar-like render) that is clearly recognisable as them: same face shape, hair, skin tone, glasses and beard if any. "
      : "An original cute 3D cartoon mascot character, Pixar-like render. ") +
    `${look}. Full body, standing, ${POSES.point}. Isolated on a transparent background, no text.`;
  const first = await generateImage({ model: CHARACTER_MODEL, prompt: photo ? { images: [photo], text: firstText } : firstText, ...options });
  const names = [await store(id, `mascot-${stamp}-point.png`, first.image.uint8Array)];

  for (const pose of ["think", "wave"] as const) {
    log(`character: ${pose} pose ...`);
    const next = await generateImage({
      model: CHARACTER_MODEL,
      prompt: { images: [first.image.uint8Array], text: `Same exact character, same face, hair, clothes and shoes. New pose: ${POSES[pose]}. Full body, transparent background, no text.` },
      ...options,
    });
    names.push(await store(id, `mascot-${stamp}-${pose}.png`, next.image.uint8Array));
  }

  log("character: 3 poses saved");
  return keep({ ...channel, brand: { ...channel.brand, mascots: names } });
}

/**
 * Copies the files a render shows (logo, mascot poses) into the project, so
 * the composition finds them next to index.html. Returns their paths there.
 */
export async function copyBrand(channel: Channel, projectDir: string): Promise<{ logo?: string; mascots: string[] }> {
  const dir = brandDir(channel.id);
  const wanted = [channel.brand?.logo, ...(channel.brand?.mascots ?? [])].filter((name): name is string => Boolean(name && existsSync(join(dir, name))));
  if (wanted.length === 0) return { mascots: [] };
  await mkdir(join(projectDir, "brand"), { recursive: true });
  for (const name of wanted) await copyFile(join(dir, name), join(projectDir, "brand", name));
  const logo = channel.brand?.logo && wanted.includes(channel.brand.logo) ? `brand/${channel.brand.logo}` : undefined;
  return { logo, mascots: (channel.brand?.mascots ?? []).filter((name) => wanted.includes(name)).map((name) => `brand/${name}`) };
}

export function isPicture(name: string): boolean {
  return [".png", ".jpg", ".jpeg", ".webp"].includes(extname(name).toLowerCase());
}

/** Where copyBrand puts the channel's logo and mascot poses inside a project. */
export function brandPaths(channel: Channel): { logo?: string; mascots: string[] } {
  return {
    logo: channel.brand?.logo ? `brand/${channel.brand.logo}` : undefined,
    mascots: (channel.brand?.mascots ?? []).map((name) => `brand/${name}`),
  };
}

/**
 * Makes an ElevenLabs instant voice clone from a recording of the channel
 * owner and sets it as the channel's narrator. ElevenLabs asks for 1-3
 * minutes of clean speech, no music.
 */
export async function cloneVoice(id: string, dataUrl: string, log: (message: string) => void = console.log): Promise<Channel> {
  const match = dataUrl.match(/^data:(audio\/[\w.+-]+|video\/mp4);base64,(.+)$/);
  if (!match) throw new Error("Upload an audio recording (MP3, M4A or WAV)");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > 25 * 1024 * 1024) throw new Error("Recordings must be under 25 MB");

  const channel = loadChannel(id);
  const ext = match[1].includes("wav") ? "wav" : match[1].includes("mpeg") ? "mp3" : "m4a";
  await store(id, `voice-sample.${ext}`, bytes);

  log("voice: sending the recording to ElevenLabs ...");
  const form = new FormData();
  form.append("name", `${channel.name} (studio)`);
  form.append("description", `Narrator for ${channel.name}, cloned from the owner's own recording.`);
  form.append("remove_background_noise", "true");
  form.append("files", new Blob([bytes], { type: match[1] }), `sample.${ext}`);
  const response = await fetch("https://api.elevenlabs.io/v1/voices/add", {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "" },
    body: form,
  });
  const result = (await response.json().catch(() => ({}))) as { voice_id?: string; detail?: unknown };
  if (!response.ok || !result.voice_id) throw new Error(`ElevenLabs ${response.status}: ${JSON.stringify(result.detail ?? result).slice(0, 300)}`);

  log(`voice: cloned as ${result.voice_id}; new narration uses it`);
  return keep({ ...channel, voiceId: result.voice_id });
}
