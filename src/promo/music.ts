import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { lengthOf } from "./compose.ts";

/** Promo music: every .mp3 here is a track. */
export const MUSIC_DIR = join(import.meta.dirname, "../../assets/music");

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
