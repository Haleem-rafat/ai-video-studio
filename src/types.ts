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
/** "arena" only picks a look when a video is created: it is saved as a "versus" video with `versus.look` "arena". */
export type StyleId = "motion" | "whiteboard" | "explainer" | "mixed" | "versus" | "arena" | "proscons" | "deepdive" | "marketing";

export const STYLES = ["motion", "whiteboard", "explainer", "mixed", "versus", "arena", "proscons", "deepdive", "marketing"] as const;

/** The look of one scene. A "mixed" project gives every scene its own; "versus" and "deepdive" are whole-video formats. */
export type Look = Exclude<StyleId, "mixed" | "versus" | "arena" | "proscons" | "deepdive" | "marketing">;

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
  | {
      type: "versus";
      title: string;
      rows: VersusRow[];
      pose?: Pose;
      gallery?: Photo[];
      /** A pros-and-cons video's chapter: what it is, a term explained simply, each side's pros and cons, and who won it. */
      kind?: ProsConsKind;
      explain?: { term: string; meaning: string };
      pros?: { a: string[]; b: string[] };
      cons?: { a: string[]; b: string[] };
      verdict?: "a" | "b" | "tie";
      /** The verdict chapter: who should buy each. */
      buyers?: { a: string; b: string };
    }
  /**
   * One chapter of a deep-dive explainer. `layout` picks the picture: a real
   * photo with points beside it, a chip map whose blocks light up in turn,
   * numbered steps, one big number, a table (`heads`, then each item's
   * label | note, or its `cells` for 3-5 columns), or a grid of cards with
   * pictures (`columns` across; an item with an empty label leaves its cell
   * empty).
   */
  | { type: "deepdive"; title: string; layout: DeepLayout; items: DeepItem[]; heads?: string[]; columns?: number; photo?: Photo; gallery?: Photo[]; pose?: Pose }
  /**
   * One beat of a marketing video, animated in the brand's own colours and
   * fonts. `words` are the 1-3 short phrases that appear on screen as they
   * are said (never the whole narration); `items` feed the beat's animation
   * (the problems as bubbles, the days of a calendar, the traffic sources of
   * a dashboard); `shot` names one of the website's screenshots.
   */
  | { type: "marketing"; beat: MarketingBeat; headline: string; words: string[]; items: MarketingItem[]; shot?: string; backdrop?: Photo; object?: Photo };

/**
 * What a marketing scene animates. journey: a phone scrolls the brand's
 * content, a like, a comment, a tap on the profile, everything piling up.
 * pain: the problems as question bubbles. turn: one calm sentence, the
 * turning point. page: a blank page builds itself, then the real website on
 * a laptop and a phone. booking: a booking widget, a slot picked and
 * confirmed, two calendars syncing. traffic: three posts with their own
 * links sending visitors to the page. dashboard: where visitors come from
 * and what they read. recap: page, bookings and insights joined up. cta: the
 * call to action as a big button with an arrow to the link.
 *
 * The rest are pure motion graphics, drawn from the brand's colours and type
 * rather than its screenshots. kinetic: the words themselves are the picture,
 * punched, slid and highlighted as they are said. chaos: scattered pieces
 * (messages, links, forms) drift, then fly into one neat card. path: a dot
 * travels a drawn path through stations that light up. stat: one big number
 * counting up inside a ring. split: before and after, wiped across. notify:
 * a lock screen collecting notifications. orbit: the parts circle the logo,
 * then are pulled in. sting: the logo built from shapes, with a light sweep.
 * links: a customer asks, and you answer with link after link, each opening
 * a different preview, piling up. conflict: a week's calendar fills up and
 * two appointments collide, with a clear conflict mark.
 */
export type MarketingBeat = "journey" | "pain" | "turn" | "page" | "booking" | "traffic" | "dashboard" | "recap" | "cta" | "kinetic" | "chaos" | "path" | "stat" | "split" | "notify" | "orbit" | "sting" | "links" | "conflict";

export const MARKETING_BEATS = ["journey", "pain", "turn", "page", "booking", "traffic", "dashboard", "recap", "cta", "kinetic", "chaos", "path", "stat", "split", "notify", "orbit", "sting", "links", "conflict"] as const;

/**
 * How far a marketing video may go from its website. "faithful" shows the
 * real pages; "creative" designs its own motion graphics and shows the site
 * once at most; "bold" never shows it, only the brand's colours and type.
 */
export type Creativity = "faithful" | "creative" | "bold";

/** `value` is a number for a dashboard bar (a share in %), a time for a booking slot, or a link tag for a traffic post. */
export type MarketingItem = { label: string; value?: string };

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

/** `label` names what the row compares (Battery, Price); an arena video shows it above the values. */
/**
 * How a versus video looks. "classic": a spec table between the two products.
 * "arena": a fighting-game match, health bars that drain as rounds are lost,
 * real photos behind every round, numbers racing as bars, karaoke captions
 * and a K.O. for the winner.
 */
export type VersusLook = "classic" | "arena" | "proscons";

/** The parts of a pros-and-cons video: the hook, a chapter per topic, the problems reviews found, the score, and who should buy which. */
export type ProsConsKind = "intro" | "chapter" | "problems" | "score" | "verdict";

export type VersusRow = { label?: string; a: string; b: string; winner?: "a" | "b" };

/** Which of the channel's character poses a versus scene shows. */
export type Pose = "point" | "think" | "wave";

export const VISUAL_TYPES = ["title", "chapter", "stat", "list", "quote", "code", "compare", "chart", "versus", "deepdive", "marketing"] as const;

/** A product in a versus video. `image` is project-relative: a cut-out photo or an AI picture. */
export type Product = { name: string; short: string; color: string; image?: string; imageSource?: "photo" | "ai"; photos?: Photo[] };

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
  /**
   * What the voice reads instead of the narration (brand names as said, numbers
   * as words, vowel marks on words that get misread); used only while `for`
   * still equals the narration, so editing the narration drops it.
   */
  speech?: { for: string; text: string };
};

export type Project = {
  id: string;
  channel: string;
  format: FormatId;
  style?: StyleId;
  /** Background music and sound effects mixed into the render; on unless false. */
  soundtrack?: boolean;
  /** The two products of a "versus" video. */
  versus?: { a: Product; b: Product; hook?: string; thumbnail?: Thumbnail; look?: VersusLook };
  /** The intro hook and thumbnail of a "deepdive" video; `cover` is the thumbnail's photo. */
  deepdive?: { hook?: string; thumbnail?: Thumbnail; cover?: Photo };
  /** A marketing video's brand (read from its website), its brief from the chat, and how it is voiced. */
  marketing?: MarketingSetup;
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

/** A brand as read from its website. Pictures are project-relative (or session-relative before a project exists). */
export type SiteBrand = {
  url: string;
  name: string;
  /** What the business offers, in one or two sentences. */
  summary: string;
  services: string[];
  language: "en" | "ar";
  logo?: string;
  colors: { background: string; panel: string; text: string; accent: string; cta: string; muted: string };
  /** Font families; the renderer loads them from Google Fonts when the site does (`googleFonts`). */
  fonts: { heading: string; body: string };
  googleFonts: string[];
  /** Real photos from the page (the owner, their work). */
  photos: string[];
  /** Real screenshots: `hero-desktop`, `hero-phone`, `page-desktop` (the whole page), `page-phone`, and one per section. */
  shots: { id: string; path: string; label: string; device: "desktop" | "phone"; height: number }[];
  /** The main call to action found on the page. */
  cta?: { label: string; url: string };
  /** The page's own text, for the writer to quote from. */
  text: string;
};

/** What the chat collects before a marketing video is written. Empty strings are still unknown. */
export type MarketingBrief = {
  business: string;
  audience: string;
  problems: string[];
  result: string;
  features: string[];
  proof: string;
  /** Dashboard numbers: the client's real ones, or examples that the video labels as such. */
  data: "real" | "example" | "";
  cta: { label: string; url: string };
  tone: string;
  voice: "male" | "female" | "";
  seconds: number;
  platforms: string[];
  captions: boolean | null;
  notes: string;
};

export type MarketingSetup = {
  brand: SiteBrand;
  /** Unset on older projects, which were all "faithful". */
  creativity?: Creativity;
  brief: MarketingBrief;
  language: "en" | "ar";
  /** Gemini voice and how it reads; `speed` speeds the take up (1.15 = 15% faster) without changing the voice's pitch. */
  narrator: { voice: string; style: string; speed?: number };
  captions: boolean;
  /** The social post text written with the script. */
  post?: { caption: string; hashtags: string[] };
  /**
   * The video's own pictures, made for it rather than taken from the website:
   * one art style for the whole video, and the pictures shown as social posts
   * and link previews. Each scene's backdrop and floating object live on its visual.
   */
  /** The video's own pictures: one art style, the post pictures, and the plain subjects planned (for not repeating them later). */
  art?: { style: string; cards: Photo[]; subjects?: string[] };
  /** The reel style it was written in (kinetic, tour…); unset for Classic. */
  reelStyle?: string;
  /** Value content: teaches, never sells; no link, no brand corner, the brand only on the last scene. */
  value?: boolean;
  /** The Arabic dialect it's written and voiced in; unset means Egyptian. */
  dialect?: "egyptian" | "gulf";
  /** Pictures and art styles of the client's earlier videos, for the art director to stay clear of. */
  artAvoid?: { styles: string[]; pictures: string[] };
  /** A style asked for by the producer (e.g. to make a new version look different); the art director follows it. */
  artDirection?: string;
};
