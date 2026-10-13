/**
 * The project file is the single source of truth for one video. The CLI and
 * the studio app both read and write it; every step fills in more of it.
 */

export type FormatId = "short" | "long";

export type Visual =
  | { type: "title"; headline: string }
  | { type: "chapter"; number: number; headline: string }
  | { type: "stat"; value: string; label: string }
  | { type: "list"; headline: string; items: string[] }
  | { type: "quote"; text: string; author?: string }
  | { type: "code"; headline: string; lines: string[] }
  | { type: "compare"; left: { label: string; value: string }; right: { label: string; value: string } }
  | { type: "chart"; headline: string; bars: { label: string; value: number }[] };

export const VISUAL_TYPES = ["title", "chapter", "stat", "list", "quote", "code", "compare", "chart"] as const;

export type Word = { text: string; start: number; end: number };

export type Scene = {
  id: string;
  narration: string;
  visual: Visual;
  /** What the AI background picture shows; empty means no picture. */
  imagePrompt: string;
  /** Bumped by "redraw" to get a different picture for the same prompt. */
  imageSeed?: number;
  image?: { path: string; prompt: string; seed?: number };
  audio?: { path: string; text: string; voiceId: string; seconds: number; words: Word[] };
};

export type Project = {
  id: string;
  channel: string;
  format: FormatId;
  topic: string;
  title: string;
  description: string;
  tags: string[];
  scenes: Scene[];
  createdAt: string;
  updatedAt: string;
  render?: { path: string; seconds: number; renderedAt: string };
};
