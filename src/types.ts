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
export type StyleId = "motion" | "whiteboard" | "explainer" | "mixed" | "versus" | "deepdive";

export const STYLES = ["motion", "whiteboard", "explainer", "mixed", "versus", "deepdive"] as const;

/** The look of one scene. A "mixed" project gives every scene its own; "versus" and "deepdive" are whole-video formats. */
export type Look = Exclude<StyleId, "mixed" | "versus" | "deepdive">;

export const LOOKS = ["motion", "whiteboard", "explainer"] as const;

export type Visual =
  | { type: "title"; headline: string }
  | { type: "chapter"; number: number; headline: string }
  | { type: "stat"; value: string; label: string }
  | { type: "list"; headline: string; items: string[] }
  | { type: "quote"; text: string; author?: string }
  | { type: "code"; headline: string; lines: string[] }
  | { type: "compare"; left: { label: string; value: string }; right: { label: string; value: string } }
  | { type: "chart"; headline: string; bars: { label: string; value: number }[] }
  /** One round of a versus video: a topic and its spec rows, product A's value first; `winner` gets the check mark. */
  | { type: "versus"; title: string; rows: VersusRow[]; pose?: Pose }
  /**
   * One chapter of a deep-dive explainer. `layout` picks the picture: a real
   * photo with points beside it, a chip map whose blocks light up in turn,
   * numbered steps, one big number, a table (`heads`, then each item's
   * label | note, or its `cells` for 3-5 columns), or a grid of cards with
   * pictures (`columns` across; an item with an empty label leaves its cell
   * empty).
   */
  | { type: "deepdive"; title: string; layout: DeepLayout; items: DeepItem[]; heads?: string[]; columns?: number; photo?: Photo; pose?: Pose };

export type DeepLayout = "photo" | "blocks" | "steps" | "stat" | "table" | "grid";

export const DEEP_LAYOUTS = ["photo", "blocks", "steps", "stat", "table", "grid"] as const;

/** `image` is project-relative (a grid card's picture); `cells` replaces label | note in a table of 3-5 columns. */
export type DeepItem = { label: string; note?: string; cells?: string[]; image?: string };

/**
 * A real photo for a scene or a thumbnail. `query` is what to look for on
 * Wikimedia Commons; `path` (project-relative) is set once one is found,
 * uploaded or drawn, with its credit line when the licence asks for one.
 */
export type Photo = { query: string; path?: string; credit?: string; url?: string; source?: "commons" | "upload" | "ai"; fit?: "cover" | "contain" };

export type VersusRow = { a: string; b: string; winner?: "a" | "b" };

/** Which of the channel's character poses a versus scene shows. */
export type Pose = "point" | "think" | "wave";

export const VISUAL_TYPES = ["title", "chapter", "stat", "list", "quote", "code", "compare", "chart", "versus", "deepdive"] as const;

/** A product in a versus video. `image` is project-relative: a cut-out photo or an AI picture. */
export type Product = { name: string; short: string; color: string; image?: string; imageSource?: "photo" | "ai" };

/** The text of a thumbnail: 2-3 huge words, the one in the accent colour, and a small sticker. */
export type Thumbnail = { headline: string; highlight?: string; tag?: string };

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
  /** In a "mixed" project, this scene's look; unset picks one from the visual (see looks.ts). */
  look?: Look;
  audio?: { path: string; text: string; voiceId: string; seconds: number; words: Word[] };
};

export type Project = {
  id: string;
  channel: string;
  format: FormatId;
  style?: StyleId;
  /** Background music and sound effects mixed into the render; on unless false. */
  soundtrack?: boolean;
  /** The two products of a "versus" video. */
  versus?: { a: Product; b: Product; hook?: string; thumbnail?: Thumbnail };
  /** The intro hook and thumbnail of a "deepdive" video; `cover` is the thumbnail's photo. */
  deepdive?: { hook?: string; thumbnail?: Thumbnail; cover?: Photo };
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
