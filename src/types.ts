/**
 * The project file is the single source of truth for one video. The CLI and
 * the studio app both read and write it; every step fills in more of it.
 */

export type FormatId = "short" | "long";

/**
 * How the video looks. "motion" is the original full-frame picture with motion
 * graphics and captions; "whiteboard" is a hand drawing doodles and writing on
 * paper; "explainer" is a phone or laptop on cream, its screen showing each
 * scene as an app, with karaoke captions and no AI pictures at all. A project
 * without a style is "motion", so older projects keep theirs.
 */
export type StyleId = "motion" | "whiteboard" | "explainer";

export const STYLES = ["motion", "whiteboard", "explainer"] as const;

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
  /** `style` is what the picture was drawn for; a whiteboard needs line art, not a background. */
  image?: { path: string; prompt: string; seed?: number; style?: StyleId };
  audio?: { path: string; text: string; voiceId: string; seconds: number; words: Word[] };
};

export type Project = {
  id: string;
  channel: string;
  format: FormatId;
  style?: StyleId;
  topic: string;
  title: string;
  description: string;
  tags: string[];
  scenes: Scene[];
  createdAt: string;
  updatedAt: string;
  render?: { path: string; seconds: number; renderedAt: string };
  /** Set once uploaded; `scheduledFor` means it is private until YouTube publishes it then. */
  youtube?: { videoId: string; url: string; privacy: "private" | "unlisted" | "public"; youtubeChannel: string; uploadedAt: string; scheduledFor?: string };
};
