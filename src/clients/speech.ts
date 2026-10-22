import type { Project } from "../types.ts";
import { prepareSpeech } from "./arabic.ts";
import { hostOf } from "./library.ts";
import { listClients, loadClient, saveClient } from "./store.ts";
import type { Client } from "./types.ts";

/** Spellings worked out for a voice, kept on the client so they're reused and can be corrected in its Profile. */
export async function keepSpellings(clientId: string, learned: Record<string, string>): Promise<void> {
  if (!Object.keys(learned).length) return;
  const client = await loadClient(clientId);
  // The client's own spellings win; only new words are added.
  client.pronounce = { ...learned, ...(client.pronounce ?? {}) };
  await saveClient(client);
}

/**
 * Before an Arabic marketing video is voiced: the scenes whose narration
 * changed since their spoken text was written (an edit in the studio, an old
 * project) get it written again, with the website's client's spellings. A
 * scene is never voiced from raw text with Latin letters and digits.
 */
export async function prepareProjectSpeech(project: Project, log: (message: string) => void): Promise<void> {
  const marketing = project.marketing;
  if (marketing?.language !== "ar") return;
  if (project.scenes.every((scene) => scene.speech && scene.speech.for === scene.narration)) return;
  const host = hostOf(marketing.brand.url);
  const client: Client | undefined = host ? (await listClients()).find((entry) => hostOf(entry.url) === host) : undefined;
  const learned = await prepareSpeech(project.scenes, { language: "ar", pronounce: client?.pronounce ?? {} }, log, marketing.dialect === "gulf" ? "gulf" : "egyptian", { onlyStale: true });
  if (client) await keepSpellings(client.id, learned);
}
