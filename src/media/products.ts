import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { generateImage } from "ai";

import { ROOT } from "../config.ts";
import type { Product, Project } from "../types.ts";

const run = promisify(execFile);

const CUTOUT_SOURCE = join(ROOT, "src", "media", "cutout.swift");
// Built on first use; the binary is machine-specific, so it is not committed.
const CUTOUT_BIN = join(ROOT, "bin", "cutout");

async function cutoutTool(): Promise<string> {
  const [source, built] = await Promise.all([stat(CUTOUT_SOURCE), stat(CUTOUT_BIN).catch(() => null)]);
  if (!built || built.mtimeMs < source.mtimeMs) await run("swiftc", ["-O", CUTOUT_SOURCE, "-o", CUTOUT_BIN]);
  return CUTOUT_BIN;
}

/** Removes the background of a photo; keeps every subject (a lineup of phones stays together). */
export async function cutout(input: string, output: string): Promise<void> {
  await run(await cutoutTool(), [input, output]);
}

/** Stores an uploaded product photo for side a or b, cut out of its background. */
export async function addProductPhoto(projectDir: string, project: Project, side: "a" | "b", dataUrl: string): Promise<Project> {
  if (!project.versus) throw new Error("Only versus videos have products");
  const match = dataUrl.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
  if (!match) throw new Error("Upload a PNG, JPEG or WebP photo");

  const stamp = Date.now().toString(36);
  const original = join(projectDir, "images", `product-${side}-${stamp}-original.${match[1] === "jpeg" ? "jpg" : match[1]}`);
  const path = `images/product-${side}-${stamp}.png`;
  await mkdir(join(projectDir, "images"), { recursive: true });
  await writeFile(original, Buffer.from(match[2], "base64"));
  // A graphic on plain black (a chip render) has no subject to cut out: use it as it is.
  await cutout(original, join(projectDir, path)).catch(() => run("sips", ["-s", "format", "png", original, "--out", join(projectDir, path)]));

  project.versus[side] = { ...project.versus[side], image: path, imageSource: "photo" };
  return project;
}

/** A clean studio picture of the product when no photo was uploaded. */
async function drawProduct(projectDir: string, product: Product, side: "a" | "b"): Promise<string> {
  const { image } = await generateImage({
    model: "openai/gpt-image-1.5",
    prompt:
      `Photorealistic studio product render of the ${product.name}, as it really looks, in its launch colour close to ${product.color}, ` +
      "three-quarter back view showing the camera or main design detail, no logos, no text, isolated on a transparent background, soft shadow.",
    size: "1024x1536",
    providerOptions: { openai: { background: "transparent", quality: "high", outputFormat: "png" } },
  });
  const path = `images/product-${side}-ai.png`;
  await mkdir(join(projectDir, "images"), { recursive: true });
  await writeFile(join(projectDir, path), image.uint8Array);
  return path;
}

/** Gives each product a picture: the uploaded photo if there is one, else an AI render. Returns how many were drawn. */
export async function prepareProducts(projectDir: string, project: Project): Promise<number> {
  if (!project.versus) return 0;
  let drawn = 0;
  for (const side of ["a", "b"] as const) {
    const product = project.versus[side];
    if (product.image && existsSync(join(projectDir, product.image))) continue;
    project.versus[side] = { ...product, image: await drawProduct(projectDir, product, side), imageSource: "ai" };
    drawn++;
  }
  return drawn;
}
