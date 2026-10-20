import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { generateImage } from "ai";

import { recordImage } from "../usage.ts";
import { clientsDir } from "./store.ts";
import { ART_STYLE_IDS, ART_STYLES, type ArtStyleId } from "./styles.ts";

const ART_MODEL = "bfl/flux-3-image";
const SUBJECT = "a smartphone showing a calendar, with chat bubbles floating around it";

/** output/.clients/.styles: one sample picture per art style, shared by every client. */
export function previewsDir(): string {
  return join(clientsDir(), ".styles");
}

export function previewPath(id: ArtStyleId): string {
  return join(previewsDir(), `${id}.png`);
}

/** Which styles already have a sample picture. */
export function previewsMade(): ArtStyleId[] {
  return ART_STYLE_IDS.filter((id) => existsSync(previewPath(id)));
}

/** Draws the sample picture of every style that has none yet (~$0.024 each). */
export async function drawPreviews(log: (message: string) => void = console.log): Promise<number> {
  await mkdir(previewsDir(), { recursive: true });
  const missing = ART_STYLE_IDS.filter((id) => !existsSync(previewPath(id)));
  for (const [index, id] of missing.entries()) {
    log(`previews: ${ART_STYLES[id].label} (${index + 1}/${missing.length}) ...`);
    const result = await generateImage({ model: ART_MODEL, prompt: `${ART_STYLES[id].picture}, soft lavender and coral on deep navy, no text, no letters. Subject: ${SUBJECT}`, aspectRatio: "1:1" });
    recordImage(ART_MODEL, result, "pictures");
    await writeFile(previewPath(id), result.image.uint8Array);
  }
  return missing.length;
}
