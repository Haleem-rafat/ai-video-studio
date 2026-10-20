import type { MarketingBrief, SiteBrand } from "../types.ts";

/**
 * A business whose Instagram the studio makes posts for. Its brand and brief
 * come from a marketing project or from reading its website once.
 */
export type Client = {
  id: string;
  name: string;
  url: string;
  /** Shown on slides, without "@". */
  instagramHandle?: string;
  language: "en" | "ar";
  /** Paths in it (logo, shots) are relative to the client's folder. */
  brand: SiteBrand;
  brief: MarketingBrief;
  /** The niche ideas are researched in, e.g. "booking pages for coaches". */
  niche: string;
  /** Claims or topics never to use. */
  avoid: string;
  dailyIdeas: boolean;
  createdAt: string;
  updatedAt: string;
};

export const IDEA_FORMATS = ["carousel", "single", "reel"] as const;
export const IDEA_GOALS = ["awareness", "details", "offer"] as const;
export const IDEA_ANGLES = ["myth", "mistakes", "list", "before-after", "trend", "how-to", "story", "stat", "question"] as const;

export type IdeaFormat = (typeof IDEA_FORMATS)[number];
export type IdeaGoal = (typeof IDEA_GOALS)[number];
export type IdeaAngle = (typeof IDEA_ANGLES)[number];

export type Trend = { title: string; summary: string; url: string };

export type Idea = {
  /** "<date>-<n>", n counting from 1 across the day's batches. */
  id: string;
  format: IdeaFormat;
  goal: IdeaGoal;
  angle: IdeaAngle;
  hook: string;
  outline: string[];
  why: string;
  trend?: string;
  status: "new" | "making" | "made" | "skipped";
  postId?: string;
};

export type IdeaDay = { date: string; trends: Trend[]; ideas: Idea[] };

/** A picture on a slide: the prompt it was drawn from and, once drawn, its file in the post folder. */
export type SlideArt = { prompt: string; file?: string };

export type Slide =
  | { layout: "cover"; title: string; subtitle?: string; art?: SlideArt }
  | { layout: "stat"; value: string; label: string; note?: string; art?: SlideArt }
  | { layout: "list"; title: string; items: string[]; art?: SlideArt }
  | { layout: "myth-fact"; myth: string; fact: string; art?: SlideArt }
  | { layout: "before-after"; before: string[]; after: string[]; art?: SlideArt }
  | { layout: "steps"; title: string; steps: string[]; art?: SlideArt }
  | { layout: "quote"; text: string; by?: string; art?: SlideArt }
  | { layout: "chart"; title: string; bars: { label: string; value: number }[]; unit?: string; art?: SlideArt }
  | { layout: "cta"; title: string; button: string; url: string; art?: SlideArt };

export type SlideLayout = Slide["layout"];

export type Post = {
  id: string;
  clientId: string;
  ideaId?: string;
  kind: "carousel" | "single" | "reel";
  slides?: Slide[];
  /** A reel: the marketing project that renders it. */
  projectId?: string;
  caption: string;
  /** Without "#". */
  hashtags: string[];
  status: "writing" | "drawing" | "rendering" | "done" | "failed";
  error?: string;
  createdAt: string;
  updatedAt: string;
};
