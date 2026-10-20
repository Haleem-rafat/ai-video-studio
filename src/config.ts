import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { FormatId } from "./types.ts";

export const ROOT = join(import.meta.dirname, "..");
export const OUTPUT_DIR = join(ROOT, "output");

if (existsSync(join(ROOT, ".env"))) process.loadEnvFile(join(ROOT, ".env"));

export const LLM_URL = process.env.LLM_URL ?? "http://127.0.0.1:8080";

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Add it to ${join(ROOT, ".env")}`);
  return value;
}

export type MascotKind = "robot" | "coin" | "bear";

/**
 * A channel's own look, kept in config/brand/<channel>/: the logo and @handle
 * every video carries, mascot poses that replace the drawn mascot, and the
 * reference pictures (recent thumbnails) its style was read from.
 */
export type Brand = {
  handle?: string;
  logo?: string;
  banner?: string;
  /** Transparent PNG poses of the channel's character; the first is the main one. */
  mascots?: string[];
  references?: string[];
  /** The photo a character was made from. */
  photo?: string;
  youtube?: { id: string; title: string; importedAt: string };
};

export type Channel = {
  id: string;
  name: string;
  /** Narration and on-screen language. Arabic lays text out right to left. */
  language?: "en" | "ar";
  /** How the narration is written and spoken, e.g. "Egyptian colloquial Arabic". */
  dialect?: string;
  /**
   * Narrates with Gemini instead of ElevenLabs (voiceId) when set: `voice` is
   * a Gemini voice name, `style` the reading direction. A cloned ElevenLabs
   * voice replaces it by clearing this and setting voiceId.
   */
  narrator?: { provider: "gemini"; voice: string; style?: string; speed?: number };
  brand?: Brand;
  audience: string;
  tone: string;
  /** ElevenLabs voice id. */
  voiceId: string;
  /** Art direction appended to every background picture prompt. */
  imageStyle: string;
  mascot: { kind: MascotKind; name: string };
  colors: { background: string; panel: string; text: string; accent: string; muted: string };
  font: string;
  /** The device the explainer look shows: a phone with app screens, or a laptop with desktop windows. */
  device?: "phone" | "laptop";
  /** Marks uploads "made for kids" (COPPA): no comments, no personalised ads. */
  madeForKids?: boolean;
};

export type Format = {
  label: string;
  width: number;
  height: number;
  minWords: number;
  maxWords: number;
};

// ElevenLabs speaks about 150 words a minute: a Short lands at 60-75s, a long
// video at 7-9 minutes.
export const FORMATS: Record<FormatId, Format> = {
  short: { label: "a vertical YouTube Short", width: 1080, height: 1920, minWords: 160, maxWords: 200 },
  long: { label: "a horizontal YouTube video", width: 1920, height: 1080, minWords: 1050, maxWords: 1350 },
};

export function loadChannels(): Channel[] {
  const all = JSON.parse(readFileSync(join(ROOT, "config", "channels.json"), "utf8")) as Record<string, Omit<Channel, "id">>;
  return Object.entries(all).map(([id, channel]) => ({ id, ...channel }));
}

export const BRAND_DIR = join(ROOT, "config", "brand");

export function brandDir(id: string): string {
  return join(BRAND_DIR, id);
}

/** Writes one channel back to channels.json, keeping the others and their order. */
export function saveChannel(channel: Channel): void {
  const path = join(ROOT, "config", "channels.json");
  const all = JSON.parse(readFileSync(path, "utf8")) as Record<string, Omit<Channel, "id">>;
  const { id, ...rest } = channel;
  all[id] = rest;
  writeFileSync(path, `${JSON.stringify(all, null, 2)}\n`);
}

export function loadChannel(id: string): Channel {
  const channels = loadChannels();
  const channel = channels.find((candidate) => candidate.id === id);

  if (!channel) throw new Error(`Unknown channel "${id}". Known: ${channels.map((c) => c.id).join(", ")}`);

  return channel;
}

export function loadPrompt(name: string, values: Record<string, string | number>): string {
  const template = readFileSync(join(ROOT, "prompts", `${name}.md`), "utf8");

  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    if (!(key in values)) throw new Error(`Prompt ${name} needs {{${key}}}`);
    return String(values[key]);
  });
}
