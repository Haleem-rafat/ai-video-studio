import { readFileSync } from "node:fs";
import { join } from "node:path";

export const ROOT = join(import.meta.dirname, "..");
export const LLM_URL = process.env.LLM_URL ?? "http://127.0.0.1:8080";

export type Channel = {
  id: string;
  name: string;
  audience: string;
  tone: string;
  voice: string;
  rate: number;
  colors: { background: string; panel: string; text: string; accent: string; muted: string };
  font: string;
};

export type FormatId = "short" | "long";

export type Format = {
  label: string;
  width: number;
  height: number;
  sceneCount: string;
  minWords: number;
  maxWords: number;
};

// Shorts stay under 60s of speech at ~170 wpm; long videos aim for 6-8 minutes.
export const FORMATS: Record<FormatId, Format> = {
  short: { label: "a vertical YouTube Short", width: 1080, height: 1920, sceneCount: "10-14", minWords: 140, maxWords: 190 },
  long: { label: "a horizontal YouTube video", width: 1920, height: 1080, sceneCount: "40-60", minWords: 1000, maxWords: 1300 },
};

export function loadChannel(id: string): Channel {
  const all = JSON.parse(readFileSync(join(ROOT, "config", "channels.json"), "utf8")) as Record<string, Omit<Channel, "id">>;
  const channel = all[id];

  if (!channel) throw new Error(`Unknown channel "${id}". Known: ${Object.keys(all).join(", ")}`);

  return { id, ...channel };
}

export function loadPrompt(name: string, values: Record<string, string | number>): string {
  const template = readFileSync(join(ROOT, "prompts", `${name}.md`), "utf8");

  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    if (!(key in values)) throw new Error(`Prompt ${name} needs {{${key}}}`);
    return String(values[key]);
  });
}
