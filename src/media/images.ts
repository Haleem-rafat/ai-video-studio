import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { requireEnv, type Channel } from "../config.ts";
import type { FormatId, Scene } from "../types.ts";
import { inBatches } from "./voice.ts";

// FLUX schnell: ~5s and well under a cent per picture.
const MODEL_URL = "https://fal.run/fal-ai/flux/schnell";

export function imageIsCurrent(projectDir: string, scene: Scene): boolean {
  return !scene.imagePrompt || Boolean(scene.image && scene.image.prompt === scene.imagePrompt && existsSync(join(projectDir, scene.image.path)));
}

export async function drawScene(projectDir: string, scene: Scene, channel: Channel, format: FormatId): Promise<void> {
  const size = format === "short" ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
  const response = await fetch(MODEL_URL, {
    method: "POST",
    headers: { Authorization: `Key ${requireEnv("FAL_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: `${scene.imagePrompt}. ${channel.imageStyle}`,
      image_size: size,
      num_inference_steps: 4,
      num_images: 1,
      // Fixed per scene so redrawing an unchanged prompt gives the same picture.
      seed: Number.parseInt(scene.id.replace(/\D/g, ""), 10) + 1000,
      enable_safety_checker: true,
    }),
  });

  if (!response.ok) throw new Error(`fal ${response.status} on ${scene.id}: ${(await response.text()).slice(0, 300)}`);

  const data = (await response.json()) as { images?: { url: string }[] };
  const url = data.images?.[0]?.url;
  if (!url) throw new Error(`fal returned no picture for ${scene.id}`);

  const picture = await fetch(url);
  const path = `images/${scene.id}.jpg`;

  await mkdir(join(projectDir, "images"), { recursive: true });
  await writeFile(join(projectDir, path), Buffer.from(await picture.arrayBuffer()));

  scene.image = { path, prompt: scene.imagePrompt };
}

/** Draws every scene whose picture prompt changed; returns how many were drawn. */
export async function drawProject(projectDir: string, scenes: Scene[], channel: Channel, format: FormatId): Promise<number> {
  const stale = scenes.filter((scene) => !imageIsCurrent(projectDir, scene));

  await inBatches(stale, 4, (scene) => drawScene(projectDir, scene, channel, format));

  return stale.length;
}
