export type Track = { file: string; seconds: number };

export const MOODS = ["calm", "upbeat", "corporate", "cinematic", "lofi"] as const;
export const MOOD_LABEL: Record<(typeof MOODS)[number], string> = { calm: "Calm", upbeat: "Upbeat", corporate: "Corporate", cinematic: "Cinematic", lofi: "Lo-fi" };

/** "calm-piano.mp3" → "Calm piano"; "none" → "No music"; "new:upbeat" → "New upbeat track". */
export function trackName(file: string): string {
  if (file === "none") return "No music";
  if (file.startsWith("new:")) return `New ${(MOOD_LABEL[file.slice(4) as (typeof MOODS)[number]] ?? file.slice(4)).toLowerCase()} track`;
  return file
    .replace(/\.mp3$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}
