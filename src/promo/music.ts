import { existsSync } from "node:fs";
import { mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { lengthOf } from "./compose.ts";

/** Promo music: every .mp3 here is a track (PROMO_MUSIC_DIR in tests). */
export const MUSIC_DIR = process.env.PROMO_MUSIC_DIR ?? join(import.meta.dirname, "../../assets/music");

export type Track = { file: string; seconds: number };

/** The tracks in assets/music with their lengths. */
export async function listTracks(): Promise<Track[]> {
  if (!existsSync(MUSIC_DIR)) return [];
  const files = (await readdir(MUSIC_DIR)).filter((file) => file.toLowerCase().endsWith(".mp3")).sort();
  return Promise.all(files.map(async (file) => ({ file, seconds: await lengthOf(join(MUSIC_DIR, file)) })));
}

/**
 * The track for a promo `need` seconds long: the one chosen by hand if it
 * exists, else one long enough to play once without looping, preferring
 * one the last promos didn't use (`recent` is newest first). When none is
 * long enough, the longest.
 */
export function pickMusic(tracks: Track[], need: number, recent: string[], chosen?: string): string {
  if (chosen && tracks.some((track) => track.file === chosen)) return chosen;
  const long = tracks.filter((track) => track.seconds >= need);
  if (!long.length) return [...tracks].sort((a, b) => b.seconds - a.seconds)[0]?.file ?? "";
  const unused = long.find((track) => !recent.includes(track.file));
  if (unused) return unused.file;
  // All used lately: the one used longest ago.
  return [...long].sort((a, b) => recent.indexOf(b.file) - recent.indexOf(a.file))[0].file;
}

/** Moods a new AI track can be made in. */
export const MOODS = ["calm", "upbeat", "corporate", "cinematic", "lofi"] as const;
export type Mood = (typeof MOODS)[number];

const ENDING = "Evolves smoothly with no sudden changes, no vocals, and ends with a gentle fade.";
export const MOOD_PROMPTS: Record<Mood, string> = {
  calm: `Calm, warm, modern instrumental background music for a website showcase video. Soft piano and gentle guitar over a light steady beat and warm pads. Positive and trustworthy. ${ENDING}`,
  upbeat: `Upbeat, bright, energetic instrumental pop for a product showcase video. Punchy drums, plucked synths, claps and a catchy hook. Confident and fun. ${ENDING}`,
  corporate: `Modern corporate instrumental music for a business website video. Clean piano, soft strings, light percussion and a steady pulse. Professional, optimistic and inspiring. ${ENDING}`,
  cinematic: `Cinematic, emotional instrumental score for a brand film. Slow building strings, piano, deep warm pads and soft percussion that rises gently. Hopeful and moving. ${ENDING}`,
  lofi: `Relaxed lo-fi hip hop instrumental for a website showcase video. Dusty drums, warm Rhodes chords, soft bass and vinyl texture. Cozy and modern. ${ENDING}`,
};

/** "ai-<mood>-<n>.mp3" with the first number not already in the library. */
export function trackFileFor(mood: Mood, existing: string[]): string {
  for (let n = 1; ; n++) if (!existing.includes(`ai-${mood}-${n}.mp3`)) return `ai-${mood}-${n}.mp3`;
}

/** Long enough for the longest promo (120 s of scrolling plus the still top and bottom) to play it once. */
const TRACK_MS = 130000;

/** Has ElevenLabs compose a new instrumental track in `mood` and adds it to the library; returns its file name. */
export async function composeTrack(mood: Mood, log: (message: string) => void): Promise<string> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("A new AI track needs ELEVENLABS_API_KEY in .env");
  log(`promo: composing a new ${mood} track (ElevenLabs Music, ~1 minute) ...`);
  const response = await fetch("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_192", {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({ prompt: MOOD_PROMPTS[mood], music_length_ms: TRACK_MS, model_id: "music_v1", force_instrumental: true }),
    signal: AbortSignal.timeout(300000),
  });
  if (!response.ok) throw new Error(`ElevenLabs Music: ${response.status} ${(await response.text()).slice(0, 200)}`);
  const file = trackFileFor(mood, existsSync(MUSIC_DIR) ? await readdir(MUSIC_DIR) : []);
  await mkdir(MUSIC_DIR, { recursive: true });
  await writeFile(join(MUSIC_DIR, file), new Uint8Array(await response.arrayBuffer()));
  log(`promo: new track ${file} added to the music library`);
  return file;
}

/** A name as a safe file name: "My Song (final).MP3" → "my-song-final.mp3". */
export function trackSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/\.mp3$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "track"}.mp3`;
}

const isTrack = (file: string) => /^[\w.-]+\.mp3$/i.test(file) && existsSync(join(MUSIC_DIR, file));

/** The slug, or the slug with the first free number. */
function freeName(name: string, taken: string[]): string {
  const slug = trackSlug(name);
  if (!taken.includes(slug)) return slug;
  for (let n = 2; ; n++) if (!taken.includes(slug.replace(/\.mp3$/, `-${n}.mp3`))) return slug.replace(/\.mp3$/, `-${n}.mp3`);
}

/** Adds an uploaded song to the library; refuses anything that isn't audio. */
export async function addTrack(name: string, bytes: Uint8Array): Promise<Track> {
  await mkdir(MUSIC_DIR, { recursive: true });
  const file = freeName(name, await readdir(MUSIC_DIR));
  const path = join(MUSIC_DIR, file);
  await writeFile(path, bytes);
  const seconds = await lengthOf(path).catch(() => NaN);
  if (!(seconds > 1)) {
    await rm(path, { force: true });
    throw new Error(`"${name}" is not a sound file`);
  }
  return { file, seconds };
}

/** Renames a track; returns its new file name. */
export async function renameTrack(file: string, name: string): Promise<string> {
  if (!isTrack(file)) throw new Error(`No track "${file}"`);
  const next = trackSlug(name);
  if (next === file) return file;
  if (existsSync(join(MUSIC_DIR, next))) throw new Error(`A track named "${next}" is already in the library`);
  await rename(join(MUSIC_DIR, file), join(MUSIC_DIR, next));
  return next;
}

/** Deletes a track; promos already made keep their sound. */
export async function deleteTrack(file: string): Promise<void> {
  if (!isTrack(file)) throw new Error(`No track "${file}"`);
  await rm(join(MUSIC_DIR, file));
}
