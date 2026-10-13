import { execFile } from "node:child_process";
import { rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

import type { Channel } from "./config.ts";

const run = promisify(execFile);

export async function audioSeconds(path: string): Promise<number> {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]);
  return Number.parseFloat(stdout.trim());
}

/**
 * Speaks one scene with macOS's built-in voice and returns its length.
 * Free and offline; swap this function for Kokoro or ElevenLabs later
 * without touching the rest of the pipeline.
 */
export async function narrate(text: string, wavPath: string, channel: Channel): Promise<number> {
  const textPath = `${wavPath}.txt`;
  const aiffPath = `${wavPath}.aiff`;

  // Text goes through a file so narration starting with "-" is never read as a flag.
  await writeFile(textPath, text);
  await run("say", ["-v", channel.voice, "-r", String(channel.rate), "-f", textPath, "-o", aiffPath]);
  await run("ffmpeg", ["-y", "-v", "error", "-i", aiffPath, "-ar", "44100", "-ac", "1", wavPath]);
  await Promise.all([rm(textPath), rm(aiffPath)]);

  return audioSeconds(wavPath);
}
