import { alignWords } from "./align.ts";
import { FORMATS } from "../config.ts";
import type { MarketingSetup, Project, Scene, SiteBrand } from "../types.ts";

/** What every marketing beat shares: timing, layout boxes, icons and small text helpers. */

export const INTRO = 0.25;
export const GAP = 0.6;
/** The call to action holds after the last word. */
export const OUTRO = 3;

export type MarketingScene = Scene & { start: number; seconds: number; visual: Extract<Scene["visual"], { type: "marketing" }> };

export const esc = (text: unknown) => String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const r = (n: number) => Math.round(n * 1000) / 1000;
export const unglue = (text: string) => text.replace(/(^|\s)([وب])(?=[A-Za-z0-9$])/g, "$1$2 ");
export const bdi = (text: string) => `<bdi>${esc(unglue(text))}</bdi>`;

export function asMarketing(scene: Scene): MarketingScene["visual"] {
  return scene.visual.type === "marketing" ? scene.visual : { type: "marketing", beat: "turn", headline: "", words: [], items: [] };
}

/** When each scene speaks, and when the closing hold starts. */
export function placeMarketing(project: Pick<Project, "scenes">): { scenes: MarketingScene[]; outro: number; total: number } {
  let t = INTRO;
  const scenes = project.scenes.map((scene) => {
    const seconds = scene.audio?.seconds ?? Math.max(3, scene.narration.split(/\s+/).length / 2.4);
    const placed = { ...scene, start: r(t), seconds, visual: asMarketing(scene) };
    t += seconds + GAP;
    return placed;
  });
  const outro = r(t - GAP);
  return { scenes, outro, total: r(outro + OUTRO) };
}

export const clean = (word: string) => word.replace(/[^\p{L}\p{N}]/gu, "").replace(/[ً-ْ]/g, "");

/** When a phrase from the narration is said (seconds from the scene's start), or null. */
export function saidAt(scene: MarketingScene, phrase: string, times: number[], words: string[], from = 0): number | null {
  const target = phrase.split(/\s+/).map(clean).filter(Boolean);
  if (!target.length) return null;
  for (let w = from; w < words.length; w++) {
    const word = clean(words[w]);
    if (word && (word === target[0] || (target[0].length >= 3 && word.includes(target[0])))) return times[w];
  }
  return null;
}

/** When each on-screen phrase pops: as it is said, else spread through the scene. */
export function phraseTimes(scene: MarketingScene): number[] {
  const words = scene.narration.split(/\s+/).filter(Boolean);
  const times = alignWords(words, scene.audio?.words ?? [], scene.seconds);
  const phrases = scene.visual.words;
  return phrases.map((phrase, i) => {
    const at = saidAt(scene, phrase, times, words);
    const spread = scene.seconds * (0.25 + (0.55 * i) / Math.max(1, phrases.length));
    return r(Math.min(scene.seconds - 0.6, Math.max(0.4, (at ?? spread) - 0.15)));
  });
}

/** When each item of a beat lands, from `from` to `to` of the scene, in order. */
export function itemTimes(scene: MarketingScene, from = 0.15, to = 0.75): number[] {
  const n = scene.visual.items.length;
  const words = scene.narration.split(/\s+/).filter(Boolean);
  const times = alignWords(words, scene.audio?.words ?? [], scene.seconds);
  const result: number[] = [];
  scene.visual.items.forEach((item, i) => {
    const spread = scene.seconds * (from + ((to - from) * i) / Math.max(1, n - 1 || 1));
    const at = saidAt(scene, item.label, times, words);
    const earliest = i ? result[i - 1] + 0.45 : scene.seconds * from * 0.6;
    result.push(r(Math.min(scene.seconds * 0.92, Math.max(earliest, at !== null && Math.abs(at - spread) < scene.seconds * 0.3 ? at - 0.1 : spread))));
  });
  return result;
}

export type Box = { W: number; H: number; short: boolean; headTop: number; stageTop: number; stageH: number; chipsTop: number; capTop: number; dir: 1 | -1 };

export function boxFor(project: Project, captions: boolean, arabic: boolean): Box {
  const { width: W, height: H } = FORMATS[project.format];
  const dir = arabic ? -1 : 1;
  if (project.format === "short") {
    // Shorts and Reels cover the bottom ~380px with buttons and the caption.
    return { W, H, short: true, headTop: 190, stageTop: 300, stageH: 960, chipsTop: captions ? 1285 : 1330, capTop: 1410, dir };
  }
  return { W, H, short: false, headTop: 64, stageTop: 150, stageH: 730, chipsTop: captions ? 892 : 925, capTop: 975, dir };
}

export const ICONS = {
  page: `<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 8h18M7 12h6M7 16h10"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4M8 14h3"/></svg>`,
  chart: `<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>`,
  video: `<svg viewBox="0 0 24 24"><rect x="3" y="5" width="14" height="14" rx="3"/><path d="M17 10l4-3v10l-4-3"/></svg>`,
  post: `<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="M21 16l-5-5-9 9"/></svg>`,
  comment: `<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/></svg>`,
  star: `<svg viewBox="0 0 24 24"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>`,
  check: `<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`,
  sync: `<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3M18 3v4h-4M6 21v-4h4"/></svg>`,
  arrow: `<svg viewBox="0 0 24 24"><path d="M12 4v15M5 12l7 7 7-7"/></svg>`,
  message: `<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/></svg>`,
  link: `<svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>`,
  form: `<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>`,
  note: `<svg viewBox="0 0 24 24"><path d="M5 3h10l4 4v14H5z"/><path d="M15 3v4h4M8 12h8M8 16h6"/></svg>`,
  question: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6M12 17h.01"/></svg>`,
  eye: `<svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`,
  heart: `<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z"/></svg>`,
  user: `<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>`,
  bell: `<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/></svg>`,
  x: `<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
};

/** Which icon a journey item gets, from its words. */
export function iconFor(label: string): string {
  if (/فيديو|video|reel|ريل/i.test(label)) return ICONS.video;
  if (/كومنت|تعليق|comment|رأي|آراء|review/i.test(label)) return ICONS.comment;
  if (/تقييم|نجوم|rating|star/i.test(label)) return ICONS.star;
  return ICONS.post;
}

export const PLATFORMS: Record<string, { color: string; glyph: string }> = {
  instagram: { color: "linear-gradient(45deg,#f9ce34,#ee2a7b,#6228d7)", glyph: "◎" },
  facebook: { color: "#1877f2", glyph: "f" },
  tiktok: { color: "#111", glyph: "♪" },
  youtube: { color: "#ff0000", glyph: "▶" },
  linkedin: { color: "#0a66c2", glyph: "in" },
  snapchat: { color: "#fffc00", glyph: "👻" },
  x: { color: "#000", glyph: "𝕏" },
};
/** A platform's badge: its glyph, in the brand's colours rather than the platform's own. */
export const platformOf = (label: string) => {
  const glyph = PLATFORMS[Object.keys(PLATFORMS).find((key) => label.toLowerCase().replace(/\s/g, "").includes(key)) ?? ""]?.glyph ?? label.trim()[0] ?? "•";
  return { color: "linear-gradient(135deg, var(--accent), var(--cta))", glyph };
};

/** The next five weekdays after `from`, for the booking widget. */
export function nextDays(from: Date, locale: string): { day: string; date: string }[] {
  const days: { day: string; date: string }[] = [];
  const d = new Date(from);
  while (days.length < 5) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 5) continue;
    days.push({ day: new Intl.DateTimeFormat(locale, { weekday: "long" }).format(d), date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(d) });
  }
  return days;
}

/** Everything a beat needs to draw itself. */
export type Ctx = { s: MarketingScene; k: number; B: Box; brand: SiteBrand; m: MarketingSetup; arabic: boolean; locale: string; next: number | null; example: boolean };
export type Beat = { html: string; js: string };

export const shotOf = (brand: SiteBrand, id: string) => brand.shots.find((shot) => shot.id === id);

/** An icon by a word the writer chose (message, link, calendar…), else a dot. */
export function iconByWord(word: string | undefined): string {
  const key = (word ?? "").toLowerCase().trim() as keyof typeof ICONS;
  return ICONS[key] ?? `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/></svg>`;
}

/** A repeatable random sequence, so a scene looks the same on every render. */
export function seeded(seed: number): () => number {
  let state = (seed * 16807 + 11) % 2147483647 || 7;
  return () => (state = (state * 16807) % 2147483647) / 2147483647;
}

/**
 * Abstract artwork in the brand's colours: soft shapes on its panel colour,
 * each different. Stands in for a post or preview picture until the video's
 * own art is drawn, so no website picture is ever reused.
 */
export function brandArt(m: MarketingSetup, count = 6): string[] {
  const c = m.brand.colors;
  const rnd = seeded(97);
  return Array.from({ length: count }, (_, i) => {
    const shapes = Array.from({ length: 4 }, (_, j) => {
      const color = [c.accent, c.cta, c.muted, c.text][(i + j) % 4];
      const x = Math.round(rnd() * 400), y = Math.round(rnd() * 300), size = Math.round(60 + rnd() * 160);
      return j % 2
        ? `<circle cx='${x}' cy='${y}' r='${size / 2}' fill='${color}' opacity='${(0.35 + rnd() * 0.4).toFixed(2)}'/>`
        : `<rect x='${x - size / 2}' y='${y - size / 2}' width='${size}' height='${size}' rx='${Math.round(size / 4)}' fill='${color}' opacity='${(0.3 + rnd() * 0.4).toFixed(2)}' transform='rotate(${Math.round(rnd() * 60 - 30)} ${x} ${y})'/>`;
    }).join("");
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${c.panel}'/><stop offset='1' stop-color='${c.background}'/></linearGradient><filter id='b'><feGaussianBlur stdDeviation='12'/></filter></defs><rect width='400' height='300' fill='url(#g)'/><g filter='url(#b)'>${shapes}</g></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg).replace(/'/g, "%27")}`;
  });
}

/** The pictures shown as social posts and link previews: the video's own art, else brand artwork — never the website's. */
export function postPictures(m: MarketingSetup): string[] {
  const own = (m.art?.cards ?? []).map((card) => card.path).filter((path): path is string => Boolean(path));
  return own.length ? own : brandArt(m);
}
