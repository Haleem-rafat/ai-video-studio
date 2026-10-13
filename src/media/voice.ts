import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { requireEnv } from "../config.ts";
import type { Scene, Word } from "../types.ts";

const run = promisify(execFile);
const MODEL_ID = "eleven_multilingual_v2";

type Alignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

export async function audioSeconds(path: string): Promise<number> {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]);
  return Number.parseFloat(stdout.trim());
}

/** Groups ElevenLabs' per-character timings into spoken words. */
export function wordsFromAlignment(alignment: Alignment): Word[] {
  const words: Word[] = [];
  let current: Word | null = null;

  alignment.characters.forEach((char, index) => {
    if (/\s/.test(char)) {
      if (current) words.push(current);
      current = null;
      return;
    }

    const start = alignment.character_start_times_seconds[index];
    const end = alignment.character_end_times_seconds[index];

    if (current) {
      current.text += char;
      current.end = end;
    } else {
      current = { text: char, start, end };
    }
  });

  if (current) words.push(current);

  return words;
}

/** True when the scene's audio still matches its narration and voice. */
export function voiceIsCurrent(projectDir: string, scene: Scene, voiceId: string): boolean {
  return Boolean(scene.audio && scene.audio.text === scene.narration && scene.audio.voiceId === voiceId && existsSync(join(projectDir, scene.audio.path)));
}

/** Speaks one scene with ElevenLabs and stores the mp3 and word timings on it. */
export async function voiceScene(projectDir: string, scene: Scene, voiceId: string, previousText?: string, nextText?: string): Promise<void> {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": requireEnv("ELEVENLABS_API_KEY"), "Content-Type": "application/json" },
    body: JSON.stringify({
      text: scene.narration,
      model_id: MODEL_ID,
      // Neighbouring lines keep intonation flowing across scene cuts.
      previous_text: previousText,
      next_text: nextText,
      voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true },
    }),
  });

  if (!response.ok) throw new Error(`ElevenLabs ${response.status} on ${scene.id}: ${(await response.text()).slice(0, 300)}`);

  const data = (await response.json()) as { audio_base64: string; alignment: Alignment };
  // Named by content so the studio never plays a cached old take.
  const take = createHash("sha1").update(`${voiceId}:${scene.narration}`).digest("hex").slice(0, 8);
  const path = `audio/${scene.id}-${take}.mp3`;

  await mkdir(join(projectDir, "audio"), { recursive: true });
  await writeFile(join(projectDir, path), Buffer.from(data.audio_base64, "base64"));

  scene.audio = {
    path,
    text: scene.narration,
    voiceId,
    seconds: await audioSeconds(join(projectDir, path)),
    words: wordsFromAlignment(data.alignment),
  };
}

/** Voices every scene whose narration changed; returns how many were spoken. */
export async function voiceProject(projectDir: string, scenes: Scene[], voiceId: string): Promise<number> {
  const stale = scenes.map((scene, index) => ({ scene, index })).filter(({ scene }) => !voiceIsCurrent(projectDir, scene, voiceId));

  await inBatches(stale, 3, ({ scene, index }) => voiceScene(projectDir, scene, voiceId, scenes[index - 1]?.narration, scenes[index + 1]?.narration));

  return stale.length;
}

export async function inBatches<T>(items: T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
  for (let start = 0; start < items.length; start += size) {
    await Promise.all(items.slice(start, start + size).map(work));
  }
}
