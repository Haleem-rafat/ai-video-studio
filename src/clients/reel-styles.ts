import type { Creativity, MarketingBeat } from "../types.ts";

/**
 * Reel styles: how a reel looks and moves, as a recipe for the marketing
 * writer: which scene types to build from, which ones make it this style,
 * how to open, and whether every word is captioned. Picked from current Reel
 * trends (kinetic text, screen tours, objection answers, transformations,
 * countdowns, notification stories, lo-fi captions). Classic is a reel as the
 * studio always made it.
 */

export const REEL_STYLE_IDS = ["classic", "kinetic", "tour", "objection", "reveal", "countdown", "stat", "dm", "myth", "lofi"] as const;
export type ReelStyleId = (typeof REEL_STYLE_IDS)[number];

type Text = { en: string; ar: string };
export type ReelStyle = {
  id: ReelStyleId;
  label: Text;
  description: Text;
  direction: string;
  /** Scene types the reel is mostly built from. */
  beats: MarketingBeat[];
  /** At least one of these must be in the reel. */
  key: MarketingBeat[];
  opening?: MarketingBeat[];
  /** Every word of the narration on screen. */
  captions?: boolean;
  creativity?: Creativity;
};

export const REEL_STYLES: Record<ReelStyleId, ReelStyle> = {
  classic: {
    id: "classic",
    label: { en: "Classic", ar: "كلاسيك" },
    description: { en: "The studio's reel: a mix the writer picks", ar: "ريل الاستوديو: مزيج يختاره الكاتب" },
    direction: "",
    beats: [],
    key: [],
  },
  kinetic: {
    id: "kinetic",
    label: { en: "Kinetic text", ar: "كلام متحرك" },
    description: { en: "The words are the picture, punched in to the beat", ar: "الكلام هو الصورة، بيظهر مع الإيقاع" },
    direction: "Kinetic typography: most scenes are kinetic, the key words punched in one by one as they are said, with a stat or sting for rhythm. Fast, punchy cuts; open on a bold kinetic hook; no product screens.",
    beats: ["kinetic", "stat", "sting", "turn", "cta"],
    key: ["kinetic"],
    opening: ["kinetic", "sting"],
    captions: false,
  },
  tour: {
    id: "tour",
    label: { en: "Website tour", ar: "جولة في الموقع" },
    description: { en: "The product shown working, screen by screen", ar: "المنتج وهو شغال، شاشة شاشة" },
    direction: "A product tour: show the product working, one real part per scene (the page, booking a slot, links bringing visitors, the dashboard), each with what it does for the customer. Open on the customer's problem in one scene, then tour; this style may show product screens in several scenes.",
    beats: ["pain", "page", "booking", "traffic", "dashboard", "recap", "cta"],
    key: ["page", "booking", "dashboard", "traffic"],
    creativity: "faithful",
  },
  objection: {
    id: "objection",
    label: { en: "Objection → answer", ar: "اعتراض ورد" },
    description: { en: "The doubt as a message, the brand answers", ar: "الشك في رسالة، والبراند بيرد" },
    direction:
      "The trending 'POV: the client says…' format: each doubt a real customer has (from the knowledge's objections) appears as their own message bubble (pain or links scenes, in their words), then the brand's calm honest answer (turn or kinetic). 2-3 doubts, then the call to action. The narrator voices the answers.",
    beats: ["pain", "links", "turn", "kinetic", "split", "cta"],
    key: ["pain", "links"],
    opening: ["pain", "links"],
  },
  reveal: {
    id: "reveal",
    label: { en: "Before → after reveal", ar: "قبل وبعد" },
    description: { en: "The mess, then the transformation", ar: "اللخبطة، وبعدين التحول" },
    direction: "A transformation reveal: open on the messy 'before' (chaos, conflict or pain), hold the tension, then the reveal: a split wipe from before to after, a calm turn sentence, and the result. Make the before relatable and the after satisfying.",
    beats: ["chaos", "conflict", "pain", "split", "turn", "recap", "cta"],
    key: ["split"],
    opening: ["chaos", "conflict", "pain"],
  },
  countdown: {
    id: "countdown",
    label: { en: "Countdown list", ar: "عد تنازلي" },
    description: { en: "“3 signs…”, counted down to number one", ar: "«٣ علامات…» لحد رقم واحد" },
    direction: "A countdown list: the hook promises a number ('3 signs you're losing bookings'). Each item is its own scene, counted down (3, 2, 1) in the headline or words, using kinetic, path or stat scenes; number one is the strongest. Then the call to action.",
    beats: ["kinetic", "path", "stat", "turn", "cta"],
    key: ["kinetic", "path"],
    opening: ["kinetic"],
  },
  stat: {
    id: "stat",
    label: { en: "Stat punch", ar: "أرقام" },
    description: { en: "Opens on a number that stops the scroll", ar: "بيبدأ برقم يوقف السكرول" },
    direction: "Stat punch: open on one surprising number in a stat scene, then 1-2 more stats or a dashboard, each followed by what it means for the customer. Numbers not in the client's facts are examples and are said as examples.",
    beats: ["stat", "dashboard", "kinetic", "turn", "cta"],
    key: ["stat"],
    opening: ["stat"],
  },
  dm: {
    id: "dm",
    label: { en: "DM / notification story", ar: "قصة على الموبايل" },
    description: { en: "The story told through a phone", ar: "الحكاية متحكية من الموبايل" },
    direction: "A phone story: the customer's day told through their phone. Messages piling up (links, pain), then the change, then notifications arriving (new booking, reminder sent). Keep it intimate and real, like watching someone's screen.",
    beats: ["journey", "links", "pain", "notify", "turn", "cta"],
    key: ["notify", "links"],
    opening: ["journey", "links", "pain"],
  },
  myth: {
    id: "myth",
    label: { en: "Myth buster", ar: "كسر خرافة" },
    description: { en: "“You think… actually…”, twice", ar: "«انت فاكر… الحقيقة…» مرتين" },
    direction: "Myth buster: state a belief the audience holds as a kinetic 'myth' scene in their words, then bust it with a split or turn scene and the real fact from the knowledge. Do it for 2 myths, then the call to action.",
    beats: ["kinetic", "split", "turn", "stat", "cta"],
    key: ["split", "turn"],
    opening: ["kinetic"],
  },
  lofi: {
    id: "lofi",
    label: { en: "Lo-fi caption", ar: "كابشن بسيط" },
    description: { en: "Calm, plain screens, every word captioned", ar: "هادي، شاشات بسيطة، وكل كلمة مكتوبة" },
    direction: "Lo-fi and personal: calm turn and kinetic scenes on plain screens, like someone talking honestly to camera; slow rhythm, short sentences, no flashy motion graphics. Every word is captioned.",
    beats: ["turn", "kinetic", "cta"],
    key: ["turn"],
    captions: true,
  },
};

export function reelStyleOf(id: string | undefined): ReelStyle | undefined {
  return id && (REEL_STYLE_IDS as readonly string[]).includes(id) ? REEL_STYLES[id as ReelStyleId] : undefined;
}

/** The style's part of the writer's notes; nothing for Classic. */
export function reelStyleNotes(id: string | undefined): string {
  const style = reelStyleOf(id);
  if (!style || style.id === "classic") return "";
  return [
    `REEL STYLE: ${style.label.en}`,
    style.direction,
    `Build it mostly from these scene types: ${style.beats.join(", ")}.`,
    style.opening ? `Open with one of: ${style.opening.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** What a draft misses to be its style, as sentences for the writer. */
export function reelStyleProblems(beats: string[], id: string | undefined): string[] {
  const style = reelStyleOf(id);
  if (!style || !style.key.length) return [];
  return beats.some((beat) => (style.key as string[]).includes(beat)) ? [] : [`This is a "${style.label.en}" reel: use at least one of these scene types: ${style.key.join(", ")}.`];
}

/** "Auto": a style neither of the last two reels used, preferring one not used lately (history newest first). */
export function autoReelStyle(history: { kind: string; reelStyle?: string }[]): ReelStyleId {
  const recent = history.filter((made) => made.kind === "reel" || made.kind === "video").map((made) => made.reelStyle).filter(Boolean) as string[];
  const candidates = REEL_STYLE_IDS.filter((id) => id !== "classic" && !recent.slice(0, 2).includes(id));
  return candidates.find((id) => !recent.includes(id)) ?? [...candidates].sort((a, b) => recent.indexOf(b) - recent.indexOf(a))[0];
}
