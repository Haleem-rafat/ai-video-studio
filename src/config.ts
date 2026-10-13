import { existsSync, readFileSync } from "node:fs";
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

export type Channel = {
  id: string;
  name: string;
  audience: string;
  tone: string;
  /** ElevenLabs voice id. */
  voiceId: string;
  /** Art direction appended to every background picture prompt. */
  imageStyle: string;
  mascot: { kind: MascotKind; name: string };
  colors: { background: string; panel: string; text: string; accent: string; muted: string };
  font: string;
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
