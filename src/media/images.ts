import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { generateImage } from "ai";

import { requireEnv, type Channel } from "../config.ts";
import type { FormatId, Scene, StyleId } from "../types.ts";
import { inBatches } from "./voice.ts";
import { recordImage } from "../usage.ts";
import { reportProgress } from "../progress.ts";

// FLUX schnell: ~5s and well under a cent per picture.
const MODEL_URL = "https://fal.run/fal-ai/flux/schnell";
// FLUX dev for whiteboard doodles: schnell's line art is too rough to redraw
// stroke by stroke. About $0.025 a picture.
const WHITEBOARD_MODEL_URL = "https://fal.run/fal-ai/flux/dev";

// Through the Vercel AI Gateway when AI_GATEWAY_API_KEY is set, so pictures
// bill to the same account as Framecast. FLUX.2 klein draws the square
// whiteboard doodles in ~4s; FLUX 3 takes an aspect ratio for full-frame
// pictures (~$0.024 each).
const GATEWAY_WHITEBOARD_MODEL = "bfl/flux-2-klein-9b";
const GATEWAY_MODEL = "bfl/flux-3-image";

/**
 * Whiteboard art direction, used instead of the channel's. The hand redraws
 * the picture line by line, so it needs thin dark outlines, few flat fills and
 * a plain white background that disappears into the paper.
 */
const WHITEBOARD_STYLE =
  "Simple hand-drawn doodle cartoon in black ink, whiteboard animation style, thin clean black outlines, " +
  "very few flat color fills only in muted dark green and warm beige, pure plain white background, " +
  "no text, no letters, no words, no shading, no shadows, single isolated subject centered with white space around. Subject: ";

export function imageIsCurrent(projectDir: string, scene: Scene, style: StyleId = "motion"): boolean {
  return (
    // The explainer draws its screens in code; it never shows a picture.
    style === "explainer" ||
    !scene.imagePrompt ||
    Boolean(
      scene.image &&
        scene.image.prompt === scene.imagePrompt &&
        (scene.image.seed ?? 0) === (scene.imageSeed ?? 0) &&
        (scene.image.style ?? "motion") === style &&
        existsSync(join(projectDir, scene.image.path)),
    )
  );
}

/** Stable per scene id, so an unchanged prompt redraws the same picture. */
function seedFor(scene: Scene): number {
  let hash = 0;
  for (const char of scene.id) hash = (hash * 31 + char.charCodeAt(0)) % 1_000_000;
  return hash + (scene.imageSeed ?? 0) * 7919;
}

function promptFor(scene: Scene, channel: Channel, whiteboard: boolean): string {
  return whiteboard ? `${WHITEBOARD_STYLE}${scene.imagePrompt}` : `${scene.imagePrompt}. ${channel.imageStyle}`;
}

/** The picture's bytes and file extension, from the AI Gateway. */
async function drawWithGateway(scene: Scene, channel: Channel, format: FormatId, whiteboard: boolean): Promise<{ bytes: Uint8Array; ext: string }> {
  const model = whiteboard ? GATEWAY_WHITEBOARD_MODEL : GATEWAY_MODEL;
  const result = await generateImage({
    model,
    prompt: promptFor(scene, channel, whiteboard),
    ...(whiteboard ? { seed: seedFor(scene) } : { aspectRatio: format === "short" ? "9:16" : "16:9" }),
  });
  recordImage(model, result, "pictures");
  const { image } = result;
  return { bytes: image.uint8Array, ext: image.mediaType === "image/png" ? "png" : "jpg" };
}

/** The picture's bytes and file extension, from fal. */
async function drawWithFal(scene: Scene, channel: Channel, format: FormatId, whiteboard: boolean): Promise<{ bytes: Uint8Array; ext: string }> {
  const size = whiteboard ? { width: 1024, height: 1024 } : format === "short" ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
  const response = await fetch(whiteboard ? WHITEBOARD_MODEL_URL : MODEL_URL, {
    method: "POST",
    headers: { Authorization: `Key ${requireEnv("FAL_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: promptFor(scene, channel, whiteboard),
      image_size: size,
      num_inference_steps: whiteboard ? 28 : 4,
      num_images: 1,
      seed: seedFor(scene),
      enable_safety_checker: true,
      // PNG keeps the white background pure; JPEG noise would show on the paper.
      ...(whiteboard ? { output_format: "png" } : {}),
    }),
  });

  if (!response.ok) throw new Error(`fal ${response.status} on ${scene.id}: ${(await response.text()).slice(0, 300)}`);

  const data = (await response.json()) as { images?: { url: string }[] };
  const url = data.images?.[0]?.url;
  if (!url) throw new Error(`fal returned no picture for ${scene.id}`);

  const picture = await fetch(url);
  return { bytes: new Uint8Array(await picture.arrayBuffer()), ext: whiteboard ? "png" : "jpg" };
}

export async function drawScene(projectDir: string, scene: Scene, channel: Channel, format: FormatId, style: StyleId = "motion"): Promise<void> {
  const whiteboard = style === "whiteboard";
  const { bytes, ext } = process.env.AI_GATEWAY_API_KEY
    ? await drawWithGateway(scene, channel, format, whiteboard)
    : await drawWithFal(scene, channel, format, whiteboard);

  // The seed is in the name so the studio never shows a cached old picture.
  const path = `images/${scene.id}-${scene.imageSeed ?? 0}${whiteboard ? "-wb" : ""}.${ext}`;

  await mkdir(join(projectDir, "images"), { recursive: true });
  await writeFile(join(projectDir, path), bytes);

  scene.image = { path, prompt: scene.imagePrompt, seed: scene.imageSeed ?? 0, style };
}

/** Draws every scene whose picture prompt or look changed; returns how many were drawn. */
export async function drawProject(projectDir: string, scenes: Scene[], channel: Channel, format: FormatId, lookFor: (scene: Scene) => StyleId): Promise<number> {
  const stale = scenes.filter((scene) => !imageIsCurrent(projectDir, scene, lookFor(scene)));

  let done = 0;
  if (stale.length) reportProgress("pictures", 0, stale.length);
  await inBatches(stale, 4, async (scene) => {
    await drawScene(projectDir, scene, channel, format, lookFor(scene));
    reportProgress("pictures", ++done, stale.length);
  });

  return stale.length;
}
