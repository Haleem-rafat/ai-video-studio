import type { ContentDirection, Dialect } from "./direction.ts";
import type { MarketingBrief, SiteBrand } from "../types.ts";
import type { Knowledge } from "./knowledge.ts";
import type { BusinessProfile } from "./questionnaire.ts";
import type { ArtStyleChoice, ArtStyleId, PictureAmount } from "./styles.ts";
import type { DesignChoice, DesignId } from "./designs.ts";
import type { FormatId } from "./formats.ts";
import type { ReelStyleId } from "./reel-styles.ts";

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
  /** What writers must know about the product and its customers; built from the website and an interview. */
  knowledge?: Knowledge;
  /** Prompted mode: the client's own answers about the business; they win over the website and Knowledge. */
  profile?: BusinessProfile;
  /** How the voice says names written in Latin letters, e.g. { "Risero": "رايزرو" }. */
  pronounce?: Record<string, string>;
  dailyIdeas: boolean;
  /** Default art style ("rotate" takes one not used lately) and picture amount for new posts; unset means flat and light. */
  artStyle?: ArtStyleChoice;
  pictures?: PictureAmount;
  /** Default carousel design, or "rotate"; unset means Classic. */
  design?: DesignChoice;
  /** What the content is for (promo, value or a mix), the owner's brief, topics and dialects; unset means promo. */
  direction?: ContentDirection;
  createdAt: string;
  updatedAt: string;
};

export const IDEA_FORMATS = ["carousel", "single", "reel"] as const;
export const IDEA_GOALS = ["awareness", "details", "offer"] as const;
export const IDEA_ANGLES = ["myth", "mistakes", "list", "before-after", "trend", "how-to", "story", "stat", "question", "announcement", "spotlight", "quote", "behind"] as const;

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
  /** The one thing it teaches or says, in a few words; no two pieces share one. */
  topic?: string;
  outline: string[];
  why: string;
  /** Which customer type it speaks to, and which "how it works" step it shows. */
  persona?: string;
  step?: string;
  trend?: string;
  status: "new" | "making" | "made" | "skipped";
  /** When it was written (ideas from before this was kept have only their day, in the id). */
  createdAt?: string;
  /** When its post should go out, local "YYYY-MM-DDTHH:mm"; suggested when written, changeable. */
  postAt?: string;
  postId?: string;
  /** Posts made from it to compare (one per format or reel style); `postId` is the first. */
  variants?: string[];
  /** The marketing video it was taken from, in Marketing mode. */
  fromProject?: string;
  /** Sent to the app, not saved: what this idea repeats from what was already made. */
  repeats?: { title: string; createdAt: string; score: number };
};

export type ScriptReview = { understand: number; feel: number; truthful: number; notes: string[]; rewritten: boolean };

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
  | { layout: "cta"; title: string; button: string; url: string; art?: SlideArt }
  | { layout: "checklist"; title: string; items: string[]; art?: SlideArt }
  | { layout: "versus"; title?: string; left: { label: string; points: string[] }; right: { label: string; points: string[] }; art?: SlideArt }
  | { layout: "faq"; question: string; answer: string; art?: SlideArt }
  | { layout: "fix"; problem: string; fix: string; art?: SlideArt }
  | { layout: "chat"; messages: { from: "them" | "us"; text: string }[]; art?: SlideArt };

export type SlideLayout = Slide["layout"];

export type Post = {
  id: string;
  clientId: string;
  ideaId?: string;
  kind: "carousel" | "single" | "reel";
  /** When it should go out, local "YYYY-MM-DDTHH:mm" (from its idea; changeable). */
  postAt?: string;
  /** Its idea's topic, the dialect it was written in, and whether it sells (false: value content). */
  topic?: string;
  dialect?: Dialect;
  promo?: boolean;
  slides?: Slide[];
  /** A reel: the marketing project that renders it. */
  projectId?: string;
  caption: string;
  /** Without "#". */
  hashtags: string[];
  /** The art style and picture amount it was made with; unset means flat and light. */
  artStyle?: ArtStyleId;
  pictures?: PictureAmount;
  /** The carousel design it was rendered in; unset means Classic. */
  design?: DesignId;
  /** The post format it was written in (list, versus, faq…); unset when the writer chose freely. */
  postFormat?: FormatId;
  /** A reel's style (kinetic, tour…); unset for Classic. */
  reelStyle?: ReelStyleId;
  /** The quality check of its script (1-5 each) and what the reviewer noted. */
  review?: ScriptReview;
  status: "writing" | "drawing" | "rendering" | "done" | "failed";
  error?: string;
  createdAt: string;
  updatedAt: string;
};
