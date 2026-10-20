import type { SiteBrand } from "../types.ts";
import type { Slide } from "./types.ts";

export const ART_STYLE_IDS = ["flat", "clay", "cartoon", "isometric", "anime", "doodle", "papercut", "riso", "glass", "line", "collage", "photo"] as const;
export type ArtStyleId = (typeof ART_STYLE_IDS)[number];
export type PictureAmount = "light" | "rich";

type Colors = SiteBrand["colors"];

export type ArtStyle = {
  id: ArtStyleId;
  label: string;
  /** How the AI pictures are drawn; the brand's colours are added to it. */
  picture: string;
  /** Slide CSS laid over the base look (cards, list rows, numbers, pictures, headings). */
  css: (colors: Colors) => string;
};

/** Cards, list rows and steps: what most styles restyle together. */
const CARDS = ".card,.list li,.step";
/** A tiny SVG noise texture, for print-like styles. */
const GRAIN = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='.18'/></svg>")`;

export const ART_STYLES: Record<ArtStyleId, ArtStyle> = {
  flat: {
    id: "flat",
    label: "Flat editorial",
    picture: "Flat editorial vector illustration, soft grain, rounded shapes, generous empty space",
    css: () => "/* style:flat */",
  },
  clay: {
    id: "clay",
    label: "3D clay",
    picture: "Cute 3D clay render, soft plasticine materials, Pixar-like, soft studio lighting, rounded chunky shapes, subtle shadows",
    css: (c) => `/* style:clay */
${CARDS}{border-radius:48px;box-shadow:0 22px 44px #0007,inset 0 3px 0 #ffffff22,inset 0 -6px 0 #0003}
.num{box-shadow:0 8px 16px #0006,inset 0 -4px 0 #0003}
.art{border-radius:56px;box-shadow:0 28px 60px #0008}
.button{box-shadow:0 14px 30px ${c.cta}66,inset 0 -6px 0 #0002}`,
  },
  cartoon: {
    id: "cartoon",
    label: "Cartoon",
    picture: "Bold cartoon illustration, thick black outlines, flat bright colours, playful expressive characters, comic energy",
    css: (c) => `/* style:cartoon */
${CARDS}{border:5px solid ${c.text};border-radius:26px;box-shadow:10px 10px 0 ${c.text}}
.card.hot{outline:none;border-color:${c.cta};box-shadow:10px 10px 0 ${c.cta}}
.num{border:4px solid ${c.text}}
.art{border:6px solid ${c.text};border-radius:30px;box-shadow:14px 14px 0 ${c.text}}
.button{border:5px solid ${c.text};box-shadow:8px 8px 0 ${c.text}}
h1,h2{letter-spacing:.5px}`,
  },
  isometric: {
    id: "isometric",
    label: "Isometric 3D",
    picture: "Isometric 3D illustration, clean geometric scene, 30-degree angle, soft gradients, tidy tiny details",
    css: (c) => `/* style:isometric */
${CARDS}{border-radius:14px;background:linear-gradient(135deg,${c.panel},${c.background});border:2px solid ${c.accent}33;box-shadow:12px 12px 0 ${c.accent}22}
.num{border-radius:14px}
.art{border-radius:16px}`,
  },
  anime: {
    id: "anime",
    label: "Anime",
    picture: "Anime illustration, cel shading, expressive characters, clean line art, vibrant sky-lit colours",
    css: (c) => `/* style:anime */
${CARDS}{border-radius:30px;box-shadow:0 0 0 3px ${c.accent}55,0 0 40px ${c.accent}33}
h1,h2{text-shadow:0 0 24px ${c.accent}66}
.art{border-radius:34px;box-shadow:0 0 0 4px ${c.accent}88,0 0 60px ${c.accent}55}`,
  },
  doodle: {
    id: "doodle",
    label: "Doodle",
    picture: "Hand-drawn marker doodle, sketchbook style, wobbly lines, simple shapes, playful scribbles and arrows",
    css: (c) => `/* style:doodle */
${CARDS}{background:transparent;border:4px dashed ${c.muted};border-radius:28px 10px 32px 12px}
.card.hot{outline:none;border:4px dashed ${c.cta}}
.num{border-radius:46% 54% 50% 50%}
.art{border-radius:26px 8px 30px 10px;border:4px solid ${c.muted}}`,
  },
  papercut: {
    id: "papercut",
    label: "Paper cut",
    picture: "Layered paper-cut craft illustration, stacked paper layers with soft depth shadows, handmade texture",
    css: (c) => `/* style:papercut */
${CARDS}{border-radius:22px;box-shadow:0 6px 0 ${c.accent}55,0 12px 0 ${c.accent}33,0 18px 0 ${c.accent}1a,0 26px 40px #0006}
.art{border-radius:24px;box-shadow:0 8px 0 ${c.accent}55,0 16px 0 ${c.accent}33,0 30px 50px #0006}`,
  },
  riso: {
    id: "riso",
    label: "Risograph",
    picture: "Retro risograph print illustration, grainy texture, halftone dots, two or three overprinted inks, slight misregistration",
    css: (c) => `/* style:riso */
body::after{content:"";position:fixed;inset:0;background:${GRAIN};mix-blend-mode:overlay;pointer-events:none}
${CARDS}{border-radius:8px;background:${c.panel};box-shadow:6px 6px 0 ${c.cta}88}
.art{border-radius:8px;filter:contrast(1.08) saturate(1.1)}
h1,h2{text-shadow:3px 3px 0 ${c.cta}66}`,
  },
  glass: {
    id: "glass",
    label: "Glass neon",
    picture: "Glassmorphism 3D illustration, translucent frosted glass objects, neon glow, futuristic, dark backdrop",
    css: (c) => `/* style:glass */
${CARDS}{background:#ffffff0f;border:1.5px solid #ffffff2e;border-radius:32px;backdrop-filter:blur(18px);box-shadow:0 0 40px ${c.accent}26}
.card.hot{outline:none;border-color:${c.cta};box-shadow:0 0 50px ${c.cta}55}
h1,h2{text-shadow:0 0 30px ${c.accent}aa}
.num{box-shadow:0 0 24px ${c.cta}}
.button{box-shadow:0 0 50px ${c.cta}aa}`,
  },
  line: {
    id: "line",
    label: "Line art",
    picture: "Minimal single continuous line drawing, monoline, elegant, lots of empty space, one accent colour",
    css: (c) => `/* style:line */
${CARDS}{background:transparent;border:2px solid ${c.accent};border-radius:22px}
.card.hot{outline:none;border:2px solid ${c.cta}}
.num{background:transparent;border:2px solid ${c.cta};color:${c.cta}}
.art{border-radius:22px;border:2px solid ${c.accent}}`,
  },
  collage: {
    id: "collage",
    label: "Collage",
    picture: "Mixed-media collage illustration, cut-out paper shapes, torn edges, stickers and tape, editorial magazine feel",
    css: (c) => `/* style:collage */
${CARDS}{border-radius:6px;transform:rotate(-1deg);box-shadow:0 14px 30px #0006;position:relative}
.list li:nth-child(even),.step:nth-child(even),.card:nth-child(even){transform:rotate(1.2deg)}
.card::before,.list li::before,.step::before{content:"";position:absolute;top:-14px;left:44%;width:110px;height:30px;background:${c.accent}88;transform:rotate(-4deg)}
.art{border-radius:4px;transform:rotate(-2deg);border:12px solid ${c.text};box-shadow:0 20px 40px #0007}`,
  },
  photo: {
    id: "photo",
    label: "Photo",
    picture: "Realistic editorial photograph, natural light, shallow depth of field, authentic everyday scene, no text",
    css: () => `/* style:photo */
${CARDS}{border-radius:20px;box-shadow:0 18px 40px #0006}
.art{width:420px;height:420px;border-radius:26px}
.art-cover{width:860px;height:600px;border-radius:32px}`,
  },
};

/** The style by id; anything unknown or missing is the flat one. */
export function styleOf(id?: string): ArtStyle {
  return ART_STYLES[(ART_STYLE_IDS as readonly string[]).includes(id ?? "") ? (id as ArtStyleId) : "flat"];
}

/**
 * Light: at most 3 pictures, the cover's first. Rich: every slide has one;
 * slides the writer left without a prompt get one from their own text.
 */
export function withPictures(slides: Slide[], amount: PictureAmount, fallbackPrompt: (slide: Slide) => string): Slide[] {
  if (amount === "rich") return slides.map((slide) => (slide.art ? slide : { ...slide, art: { prompt: fallbackPrompt(slide) } }));
  let pictures = 0;
  return slides.map((slide) => {
    if (!slide.art) return slide;
    if (pictures++ < 3) return slide;
    const { art: _dropped, ...rest } = slide;
    return rest as Slide;
  });
}

/** What a post can ask for: a style, or "rotate" to take one the client hasn't used lately. */
export type ArtStyleChoice = ArtStyleId | "rotate";

/** The style the client's recent posts have used least recently (never used first). */
export function pickRotation(history: { artStyle?: string }[]): ArtStyleId {
  const recent = history.map((made) => made.artStyle).filter(Boolean) as string[];
  const unused = ART_STYLE_IDS.find((id) => !recent.includes(id));
  if (unused) return unused;
  return [...ART_STYLE_IDS].sort((a, b) => recent.indexOf(b) - recent.indexOf(a))[0];
}
