import { brandPaths } from "../brand/brand.ts";
import { FORMATS, type Channel } from "../config.ts";
import type { DeepItem, Pose, Project, Scene } from "../types.ts";
import { captionLines, chapterList } from "./versus.ts";

/**
 * A "deepdive" video: a long explainer in the versus look (dark stage,
 * glows, the channel's character and badge, red wipes between chapters).
 * Every chapter shows one picture of the idea: a real photo with points
 * beside it, a chip whose blocks light up as they're named, numbered steps,
 * one big number, or a table. A progress bar runs along the bottom.
 */

/** Silence before the first line, while the intro photo flies in. */
const INTRO = 1.0;
const GAP = 0.6;
/** Room after the last line for the subscribe click. */
const OUTRO = 3.2;

type DeepVisual = Extract<Scene["visual"], { type: "deepdive" }>;
export type DeepScene = Scene & { start: number; seconds: number; visual: DeepVisual };

const esc = (text: unknown) => String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const r = (n: number) => Math.round(n * 1000) / 1000;

function asDeep(scene: Scene): DeepVisual {
  return scene.visual.type === "deepdive" ? scene.visual : { type: "deepdive", title: "", layout: "photo", items: [] };
}

/** When each scene speaks, and when the closing subscribe beat starts. */
export function placeDeep(project: Project): { scenes: DeepScene[]; outro: number; total: number } {
  let t = INTRO;
  const scenes = project.scenes.map((scene) => {
    const seconds = scene.audio?.seconds ?? 3;
    const placed = { ...scene, start: r(t), seconds, visual: asDeep(scene) };
    t += seconds + GAP;
    return placed;
  });
  return { scenes, outro: r(t), total: r(t + OUTRO) };
}

const simplify = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/**
 * How long a chapter opens on its real photo before its diagram builds:
 * only for diagram layouts that have a photo (a photo layout shows it the
 * whole time).
 */
export function photoBeat(scene: DeepScene): number {
  if (scene.visual.layout === "photo" || !scene.visual.photo?.path) return 0;
  return r(Math.min(3.2, Math.max(2, scene.seconds * 0.18)));
}

/**
 * When each item appears, relative to the scene: at the word where the
 * narrator first names it when that can be heard (the items follow the
 * narration's order), else spread evenly through the scene.
 */
export function itemTimes(scene: DeepScene): number[] {
  const items = scene.visual.items;
  if (!items.length) return [];
  const times = heardTimes(scene);
  // Nothing lands while the opening photo is on screen.
  const shift = Math.max(0, photoBeat(scene) + 0.3 - times[0]);
  return times.map((time) => r(Math.min(time + shift, scene.seconds - 0.3)));
}

function heardTimes(scene: DeepScene): number[] {
  const items = scene.visual.items;
  const step = Math.max(0.6, (scene.seconds * 0.85 - 0.4) / items.length);
  const even = items.map((_, index) => r(0.4 + index * step));
  const heard = (scene.audio?.words ?? []).map((word) => ({ key: simplify(word.text), start: word.start }));
  if (!heard.length) return even;

  let from = 0;
  return items.map((item, index) => {
    const keys = item.label.split(/[\s·/+,-]+/).map(simplify).filter((key) => key.length >= 2);
    const found = heard.findIndex((word, position) => position >= from && keys.some((key) => word.key.includes(key) || (word.key.length >= 3 && key.includes(word.key))));
    // A match far past the even slot of the next item is likely a later mention; keep the order sane.
    if (found >= 0 && heard[found].start < (even[index + 1] ?? scene.seconds) + 4) {
      from = found + 1;
      return r(Math.max(0.2, heard[found].start - 0.15));
    }
    return even[index];
  }).map((time, index, all) => (index && time < all[index - 1] + 0.5 ? r(all[index - 1] + 0.5) : time));
}

/** "19B" -> 0..19 then "B"; "3nm" -> 3 then "nm"; null when there's no number to count. */
function countable(value: string): { prefix: string; number: number; decimals: number; suffix: string } | null {
  const match = value.match(/^([^\d]*)(\d+(?:[.,]\d+)?)(.*)$/);
  if (!match) return null;
  const digits = match[2].replace(",", ".");
  return { prefix: match[1], number: Number(digits), decimals: digits.includes(".") ? digits.split(".")[1].length : 0, suffix: match[3] };
}

type Layout = {
  short: boolean;
  title: { top: number; size: number };
  box: { top: number; left: number; right: number; height: number };
  caption: { top: number; left: number; right: number; height: number; size: number; words: number };
  mascot: { css: string; height: number };
  badge: string;
  sub: number;
};

function layoutFor(project: Project): Layout {
  if (project.format === "short") {
    // Shorts keep text out of YouTube's bottom overlay (~380px) and right-hand buttons.
    return {
      short: true,
      title: { top: 170, size: 64 },
      box: { top: 300, left: 50, right: 50, height: 980 },
      caption: { top: 1330, left: 300, right: 40, height: 220, size: 52, words: 5 },
      mascot: { css: "left: 16px; bottom: 380px;", height: 300 },
      badge: "top: 36px; right: 36px;",
      sub: 1180,
    };
  }
  return {
    short: false,
    title: { top: 56, size: 62 },
    box: { top: 190, left: 110, right: 110, height: 650 },
    caption: { top: 872, left: 380, right: 380, height: 150, size: 46, words: 8 },
    mascot: { css: "left: 40px; bottom: -8px;", height: 290 },
    badge: "top: 30px; right: 36px;",
    sub: 610,
  };
}

/** A photo's credit, shortened to "author · licence" for the corner of the frame. */
function shortCredit(credit?: string): string {
  if (!credit) return "";
  const [, rest = credit] = credit.split(/: (.*)/s);
  return rest.replace(/, Wikimedia Commons$/, "").trim();
}

function photoHtml(scene: DeepScene, big: boolean): string {
  const photo = scene.visual.photo;
  if (!photo?.path) return `<div class="ph${big ? " big" : ""} empty"></div>`;
  const credit = photo.source === "ai" ? "AI" : photo.source === "commons" ? shortCredit(photo.credit) : "";
  return `<div class="ph${big ? " big" : ""}${photo.fit === "contain" ? " fit" : ""}"><img src="${photo.path}" />${credit ? `<span class="credit">📷 ${esc(credit)}</span>` : ""}</div>`;
}

function itemCard(item: DeepItem, index: number, k: number): string {
  return `<div class="pt-card" id="it${k}_${index}"><b>${index + 1}</b><div><div class="lb"><bdi>${esc(item.label)}</bdi></div>${item.note ? `<div class="nt"><bdi>${esc(item.note)}</bdi></div>` : ""}</div></div>`;
}

/** The markup of one chapter's picture, with its opening photo on top for diagram layouts. */
function sceneHtml(scene: DeepScene, k: number, hook: string, L: Layout): string {
  const beat = photoBeat(scene) ? `<div class="beat" id="pb${k}">${photoHtml(scene, true)}</div>` : "";
  return diagramHtml(scene, k, hook, L) + beat;
}

function diagramHtml(scene: DeepScene, k: number, hook: string, L: Layout): string {
  const v = scene.visual;
  const items = v.items;
  switch (v.layout) {
    case "blocks": {
      const cols = items.length <= 4 ? 2 : 3;
      const tiles = items.map((item, i) => `<div class="tile" id="it${k}_${i}"><bdi>${esc(item.label)}</bdi></div>`).join("");
      const infos = items
        .map((item, i) => `<div class="info" id="in${k}_${i}"><div class="kick">${String(i + 1).padStart(2, "0")}</div><div class="big"><bdi>${esc(item.label)}</bdi></div>${item.note ? `<div class="nt"><bdi>${esc(item.note)}</bdi></div>` : ""}</div>`)
        .join("");
      return `<div class="blocks"><div class="chip"><div class="die" style="grid-template-columns:repeat(${cols},1fr)">${tiles}</div></div><div class="infos">${infos}</div></div>`;
    }
    case "steps": {
      const steps = items.map((item, i) => `<div class="step" id="it${k}_${i}"><div class="dot">${i + 1}</div><div class="lb"><bdi>${esc(item.label)}</bdi></div></div>`).join("");
      const notes = items.map((item, i) => (item.note ? `<div class="snote" id="in${k}_${i}"><bdi>${esc(item.note)}</bdi></div>` : `<div class="snote" id="in${k}_${i}"></div>`)).join("");
      return `<div class="steps${L.short ? " vertical" : ""}"><div class="rail"><i id="rl${k}"></i></div><div class="row">${steps}</div></div><div class="snotes">${notes}</div>`;
    }
    case "stat": {
      const item = items[0] ?? { label: "" };
      return `${v.photo?.path ? `<div class="backdrop"><img src="${v.photo.path}" /></div>` : ""}<div class="stat"><div class="num" id="num${k}" dir="auto">${esc(item.label)}</div>${item.note ? `<div class="nt" id="it${k}_0"><bdi>${esc(item.note)}</bdi></div>` : ""}</div>`;
    }
    case "table": {
      const cells = (item: DeepItem) => (item.cells?.length ? item.cells : [item.label, item.note ?? ""]);
      const columns = Math.max(v.heads?.length ?? 0, ...items.map((item) => cells(item).length));
      // Rows share the frame's height, so a short table isn't squeezed and a 9-row one still fits.
      const rowCount = items.length + (v.heads?.some(Boolean) ? 1 : 0);
      const rowHeight = Math.min(L.short ? 130 : 108, Math.floor((L.box.height - 10) / Math.max(1, rowCount)));
      const fontSize = columns > 2 ? (rowHeight >= 80 ? 30 : 27) : L.short ? 36 : 34;
      const template = `grid-template-columns:${columns > 2 ? "1.3fr " : ""}repeat(${columns > 2 ? columns - 1 : columns},1fr);min-height:${rowHeight}px;font-size:${fontSize}px`;
      const row = (values: string[]) => Array.from({ length: columns }, (_, c) => `<div><bdi>${esc(values[c] ?? "")}</bdi></div>`).join("");
      const rows = items.map((item, i) => `<div class="trow" id="it${k}_${i}" style="${template}">${row(cells(item))}</div>`).join("");
      const head = v.heads?.some(Boolean) ? `<div class="thead" style="${template}">${row(v.heads)}</div>` : "";
      return `<div class="table${columns > 2 ? " wide" : ""}">${head}${rows}</div>`;
    }
    case "grid": {
      // A vertical frame fits 2-3 cards across, whatever the script asked for.
      const columns = L.short ? (items.length <= 4 ? 2 : 3) : (v.columns ?? Math.min(6, Math.ceil(Math.sqrt(items.length * 2.4))));
      const cards = items
        .map((item, i) =>
          item.label
            ? `<div class="card" id="it${k}_${i}">${item.image ? `<img src="${item.image}" />` : ""}<div class="lb"><bdi>${esc(item.label)}</bdi></div>${item.note ? `<div class="nt"><bdi>${esc(item.note)}</bdi></div>` : ""}</div>`
            : `<div class="card none" id="it${k}_${i}"></div>`,
        )
        .join("");
      return `<div class="grid" style="grid-template-columns:repeat(${columns},1fr)">${cards}</div>`;
    }
    default: {
      const intro = k === 0;
      if (intro || !items.length) return `${photoHtml(scene, true)}${intro && hook ? `<div class="hook" id="hook"><span>${esc(hook)}</span></div>` : ""}`;
      return `<div class="photo-row">${photoHtml(scene, false)}<div class="points">${items.slice(0, 3).map((item, i) => itemCard(item, i, k)).join("")}</div></div>`;
    }
  }
}

export function buildDeepDive(project: Project, channel: Channel): string {
  const { width, height } = FORMATS[project.format];
  const L = layoutFor(project);
  const c = channel.colors;
  const accent = c.accent;
  const second = "#2f7bff";
  const arabic = channel.language === "ar";
  const font = arabic ? "Cairo, 'SF Arabic', sans-serif" : "Inter, -apple-system, sans-serif";
  const { scenes, outro, total } = placeDeep(project);
  const brand = brandPaths(channel);
  const poses: Record<Pose, string | undefined> = { point: brand.mascots[0], think: brand.mascots[1] ?? brand.mascots[0], wave: brand.mascots[2] ?? brand.mascots[0] };
  const hasMascot = Boolean(brand.mascots[0]);
  const hook = project.deepdive?.hook ?? "";
  const B = L.box;

  const blocks: string[] = [];
  let chapter = 0;
  const data = scenes.map((scene, k) => {
    const v = scene.visual;
    blocks.push(`<div class="sc" id="sc${k}">${sceneHtml(scene, k, hook, L)}</div>`);
    if (v.title) {
      chapter++;
      blocks.push(`<div class="title" id="tt${k}"><em>${String(chapter).padStart(2, "0")}</em><span>${esc(v.title)}</span><i></i></div>`);
    }
    const caps = captionLines(scene, L.caption.words);
    caps.forEach((cap, j) => blocks.push(`<div class="cap" id="cap${k}_${j}"><span>${esc(cap.text)}</span></div>`));
    const stat = v.layout === "stat" ? countable(v.items[0]?.label ?? "") : null;
    return {
      start: scene.start,
      dur: r(scene.seconds),
      layout: v.layout,
      pose: v.pose ?? (k === scenes.length - 1 ? "wave" : k % 2 ? "think" : "point"),
      title: Boolean(v.title),
      caps: caps.map((cap) => cap.at),
      items: itemTimes(scene),
      beat: photoBeat(scene),
      stat,
    };
  });

  const audio = scenes
    .map((scene, k) => `<audio id="a${k}" data-start="${scene.start}" data-duration="${r(scene.seconds)}" data-track-index="2" src="${scene.audio!.path}"></audio>`)
    .join("\n  ");
  const particles = Array.from({ length: 30 }, (_, i) => `<i class="pt" id="pt${i}"></i>`).join("");
  const mascots = hasMascot ? (["point", "think", "wave"] as const).map((pose) => `<img class="mascot" id="m_${pose}" src="${poses[pose]}" />`).join("") : "";
  const start = arabic ? "right" : "left";

  return `<!doctype html>
<html lang="${arabic ? "ar" : "en"}" dir="${arabic ? "rtl" : "ltr"}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${width}, height=${height}" />
<title>${esc(project.title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@600;800;900&family=Inter:wght@700;900&display=block" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: ${c.background}; }
  bdi { unicode-bidi: plaintext; }
  #root { position: relative; width: ${width}px; height: ${height}px; overflow: hidden; font-family: ${font}; color: ${c.text}; background: ${c.background}; }
  #stage { position: absolute; inset: 0; }
  .glow { position: absolute; border-radius: 50%; filter: blur(60px); opacity: .5; }
  #g1 { width: 900px; height: 900px; right: -250px; top: -250px; background: radial-gradient(${accent}55, transparent 65%); }
  #g2 { width: 900px; height: 900px; left: -250px; bottom: -300px; background: radial-gradient(${second}66, transparent 65%); }
  #grid { position: absolute; inset: 0; background-image: linear-gradient(#ffffff08 1px, transparent 1px), linear-gradient(90deg, #ffffff08 1px, transparent 1px); background-size: 80px 80px;
    mask-image: radial-gradient(ellipse at center, #000 30%, transparent 80%); }
  .pt { position: absolute; width: 4px; height: 4px; border-radius: 50%; background: #fff; opacity: 0; }
  #badge { position: absolute; ${L.badge} display: flex; align-items: center; gap: 12px; padding: 6px 20px 6px 6px; border-radius: 999px;
    background: #ffffff12; border: 1px solid #ffffff22; font: 800 26px Inter; direction: ltr; z-index: 50; }
  #badge img { width: 50px; height: 50px; border-radius: 50%; object-fit: cover; }
  #bar { position: absolute; left: 0; right: 0; bottom: 0; height: 7px; background: #ffffff14; z-index: 50; }
  #bar i { position: absolute; inset: 0; background: linear-gradient(90deg, ${second}, ${accent}); transform-origin: ${start} center; transform: scaleX(0); }

  .title { position: absolute; top: ${L.title.top}px; left: 200px; right: 200px; text-align: center; z-index: 30; opacity: 0; }
  .title em { display: inline-block; font: 900 26px Inter; font-style: normal; color: #fff; background: ${accent}; padding: 2px 14px; border-radius: 10px; margin-${arabic ? "left" : "right"}: 16px; vertical-align: middle; }
  .title span { font: 900 ${L.title.size}px ${font}; vertical-align: middle; }
  .title i { display: block; width: 180px; height: 8px; margin: 4px auto 0; background: ${accent}; border-radius: 4px; }

  .sc { position: absolute; top: ${B.top}px; left: ${B.left}px; right: ${B.right}px; height: ${B.height}px; opacity: 0; z-index: 10; }
  .ph { position: relative; overflow: hidden; border-radius: 30px; border: 1px solid #ffffff2a; background: #000; box-shadow: 0 30px 80px #000c, 0 0 0 8px #ffffff08; }
  .ph img { width: 100%; height: 100%; object-fit: cover; display: block; transform-origin: 50% 50%; }
  .ph.empty { background: linear-gradient(135deg, #ffffff10, #ffffff04); }
  .ph .credit { position: absolute; ${arabic ? "left" : "right"}: 14px; bottom: 12px; font: 600 15px Inter; direction: ltr; color: #fffc; background: #0009; padding: 3px 10px; border-radius: 8px; max-width: 70%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ph.big { position: absolute; inset: 0; }
  .ph.fit { background: radial-gradient(circle at 50% 45%, #ffffff1c, #050507 70%); }
  .ph.fit img { object-fit: contain; padding: 30px; }
  .grid { position: absolute; inset: 0; display: grid; gap: ${L.short ? 18 : 16}px; grid-auto-rows: 1fr; direction: ltr; }
  .card { display: grid; grid-template-rows: minmax(0, 1fr) auto auto; justify-items: center; align-items: center; gap: 4px; padding: 8px; border-radius: 20px; background: #ffffff0b; border: 1px solid #ffffff20; opacity: 0; min-height: 0; overflow: hidden; }
  .card img { width: 100%; height: 100%; min-height: 0; object-fit: contain; filter: drop-shadow(0 8px 18px #000a); }
  .card .lb { font: 900 ${L.short ? 28 : 25}px/1.1 Inter; white-space: nowrap; }
  .card .nt { font: 700 ${L.short ? 20 : 17}px/1.2 ${font}; color: ${c.muted}; text-align: center; }
  .card.none { background: transparent; border: 2px dashed #ffffff14; }
  .beat { position: absolute; inset: 0; z-index: 5; }
  .ph.big::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, transparent 45%, #000b); }
  .hook { position: absolute; left: 0; right: 0; bottom: ${L.short ? 60 : 50}px; text-align: center; z-index: 3; opacity: 0; }
  .hook span { font: 900 ${L.short ? 76 : 84}px/1.2 ${font}; color: #fff; text-shadow: 0 6px 30px #000; unicode-bidi: plaintext; }

  .photo-row { position: absolute; inset: 0; display: flex; gap: 44px; ${L.short ? "flex-direction: column;" : ""} }
  .photo-row .ph { flex: ${L.short ? "0 0 560px" : "0 0 1040px"}; height: ${L.short ? "560px" : "100%"}; }
  .points { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 22px; }
  .pt-card { display: flex; gap: 20px; align-items: center; padding: 22px 26px; border-radius: 24px; background: #ffffff0e; border: 1px solid #ffffff22; opacity: 0; }
  .pt-card b { flex: none; width: 56px; height: 56px; border-radius: 50%; display: grid; place-items: center; font: 900 28px Inter; color: #fff; background: ${accent}; box-shadow: 0 0 24px ${accent}88; }
  .pt-card .lb { font: 900 ${L.short ? 40 : 38}px/1.25 ${font}; }
  .pt-card .nt { font: 700 ${L.short ? 30 : 27}px/1.35 ${font}; color: ${c.muted}; margin-top: 4px; }

  .blocks { position: absolute; inset: 0; display: flex; gap: 60px; align-items: center; ${L.short ? "flex-direction: column; gap: 40px;" : ""} }
  .chip { flex: none; width: ${L.short ? 640 : 640}px; height: ${L.short ? 640 : 640}px; padding: 34px; border-radius: 36px; position: relative;
    background: linear-gradient(145deg, #1d1d22, #0c0c0f); border: 3px solid #ffffff2a; box-shadow: 0 40px 90px #000d, inset 0 0 60px #ffffff08; }
  .chip::before { content: ""; position: absolute; inset: -22px; border-radius: 44px; z-index: -1;
    background: repeating-linear-gradient(90deg, #c9a24a 0 6px, transparent 6px 22px), repeating-linear-gradient(0deg, #c9a24a 0 6px, transparent 6px 22px);
    mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0); padding: 14px; opacity: .55; }
  .die { display: grid; gap: 16px; height: 100%; }
  .tile { display: grid; place-items: center; text-align: center; padding: 10px; border-radius: 16px; background: #ffffff08; border: 2px solid #ffffff1c; font: 900 ${L.short ? 34 : 32}px/1.15 ${font}; color: #ffffff70; }
  .infos { position: relative; flex: 1; align-self: stretch; ${L.short ? "width: 100%;" : ""} }
  .info { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; opacity: 0; ${L.short ? "text-align: center;" : ""} }
  .info .kick { font: 900 30px Inter; color: ${accent}; letter-spacing: 2px; }
  .info .big { font: 900 ${L.short ? 76 : 84}px/1.1 ${font}; margin: 6px 0 14px; }
  .info .nt { font: 700 ${L.short ? 40 : 42}px/1.35 ${font}; color: ${c.muted}; }

  .steps { position: absolute; left: 0; right: 0; top: ${L.short ? 0 : 60}px; }
  .steps .row { position: relative; display: flex; justify-content: space-between; z-index: 2; }
  .step { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 18px; opacity: .25; }
  .step .dot { width: 120px; height: 120px; border-radius: 50%; display: grid; place-items: center; font: 900 56px Inter; color: #fff; background: #26262c; border: 4px solid #ffffff30; }
  .step .lb { font: 900 32px/1.25 ${font}; text-align: center; padding: 0 10px; }
  .rail { position: absolute; top: 58px; left: 8%; right: 8%; height: 6px; background: #ffffff18; border-radius: 3px; z-index: 1; }
  .rail i { position: absolute; inset: 0; background: ${accent}; border-radius: 3px; transform-origin: ${start} center; transform: scaleX(0); box-shadow: 0 0 20px ${accent}; }
  .steps.vertical .row { flex-direction: column; gap: 26px; }
  .steps.vertical .step { flex-direction: row; gap: 26px; }
  .steps.vertical .step .dot { flex: none; width: 96px; height: 96px; font-size: 44px; }
  .steps.vertical .step .lb { text-align: start; font-size: 40px; }
  .steps.vertical .rail { top: 20px; bottom: 20px; left: auto; right: auto; ${start}: 45px; width: 6px; height: auto; }
  .steps.vertical .rail i { transform-origin: center top; transform: scaleY(0); }
  .snotes { position: absolute; left: ${L.short ? 0 : 140}px; right: ${L.short ? 0 : 140}px; bottom: ${L.short ? 0 : 20}px; height: ${L.short ? 260 : 230}px; }
  .snote { position: absolute; inset: 0; display: grid; place-items: center; text-align: center; padding: 20px 40px; border-radius: 28px; background: #ffffff0e; border: 1px solid #ffffff22;
    font: 800 ${L.short ? 42 : 44}px/1.35 ${font}; opacity: 0; }
  .snote:empty { display: none; }

  .backdrop { position: absolute; inset: 0; border-radius: 30px; overflow: hidden; opacity: .35; }
  .backdrop img { width: 100%; height: 100%; object-fit: cover; filter: blur(6px) saturate(1.2); }
  .stat { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
  .stat .num { font: 900 ${L.short ? 210 : 250}px/1.15 Inter, ${font}; unicode-bidi: plaintext; letter-spacing: -2px;
    background: linear-gradient(180deg, #fff, ${accent}); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 10px 40px ${accent}66); }
  .stat .nt { font: 800 ${L.short ? 50 : 54}px/1.3 ${font}; margin-top: 20px; max-width: 1300px; opacity: 0; }

  .table { position: absolute; left: ${L.short ? 0 : 160}px; right: ${L.short ? 0 : 160}px; top: ${L.short ? 40 : 20}px; border-radius: 28px; overflow: hidden; background: #ffffff0d; border: 1px solid #ffffff22; }
  .thead, .trow { display: grid; grid-template-columns: 1fr 1fr; }
  .table.wide { left: 0; right: 0; top: 0; max-height: 100%; display: flex; flex-direction: column; }
  /* Rows shrink together when there are many, so a 9-row table still fits the frame. */
  .table.wide .trow { flex: 0 1 auto; min-height: 0; overflow: hidden; }
  .table.wide .trow div, .table.wide .thead div { font-size: inherit; line-height: 1.2; padding: 6px 10px; }
  .table.wide .trow div:first-child, .table.wide .thead div:first-child { color: ${c.muted}; }
  .thead div { text-align: center; padding: 18px; font: 900 34px ${font}; color: ${accent}; background: #ffffff0a; }
  .trow { border-top: 1px solid #ffffff1c; min-height: ${L.short ? 130 : 108}px; opacity: 0; }
  .trow div { display: grid; place-items: center; text-align: center; padding: 14px 20px; font-weight: 800; font-size: inherit; line-height: 1.3; font-family: ${font}; }
  .trow div + div { border-${arabic ? "right" : "left"}: 1px solid #ffffff1c; }

  .cap { position: absolute; top: ${L.caption.top}px; left: ${L.caption.left}px; right: ${L.caption.right}px; height: ${L.caption.height}px; display: flex; align-items: center; justify-content: center; text-align: center;
    font: 800 ${L.caption.size}px/1.3 ${font}; opacity: 0; z-index: 40; text-shadow: 0 4px 18px #000; }
  .cap span { unicode-bidi: plaintext; background: #000000a0; padding: 6px 26px; border-radius: 18px; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
  .mascot { position: absolute; ${L.mascot.css} height: ${L.mascot.height}px; opacity: 0; transform-origin: 50% 100%; z-index: 45; filter: drop-shadow(0 10px 20px #000c); }
  #wipe { position: absolute; top: -10%; bottom: -10%; width: 70%; left: -80%; transform: skewX(-18deg); z-index: 60;
    background: linear-gradient(90deg, transparent, ${accent} 18%, ${accent} 82%, transparent); box-shadow: 0 0 120px ${accent}; }
  #flash { position: absolute; inset: 0; background: #fff; opacity: 0; z-index: 70; }
  #sub { position: absolute; left: 50%; top: ${L.sub}px; transform: translateX(-50%); z-index: 55; opacity: 0; display: flex; gap: 18px; align-items: center; white-space: nowrap; }
  #sub .btn { background: #ff0033; color: #fff; padding: 18px 46px; border-radius: 999px; font: 900 44px ${font}; box-shadow: 0 0 40px #ff003399; }
  #sub .btn.done { background: #3a3a40; box-shadow: none; }
  #sub .bell { font-size: 54px; }
  #cursor { position: absolute; left: 50%; top: ${L.sub + 70}px; width: 54px; z-index: 56; opacity: 0; }
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-width="${width}" data-height="${height}">
 <div id="stage">
  <div class="glow" id="g1"></div><div class="glow" id="g2"></div>
  <div id="grid"></div>
  ${particles}
  ${blocks.join("\n  ")}
  ${mascots}
  <div id="sub"><span class="bell">🔔</span><span class="btn" id="subBtn">${arabic ? "اشترك" : "Subscribe"}</span></div>
  <svg id="cursor" viewBox="0 0 24 24"><path d="M4 2l16 10-7 1.5L9.5 21z" fill="#fff" stroke="#000" stroke-width="1.2"/></svg>
 </div>
 <div id="badge">${brand.logo ? `<img src="${brand.logo}" />` : ""}<span>${esc(channel.brand?.handle ?? channel.name)}</span></div>
 <div id="bar"><i></i></div>
 <div id="wipe"></div>
 <div id="flash"></div>
 ${audio}
</div>
<script>
window.__timelines = window.__timelines || {};
const D = ${JSON.stringify(data)};
const TOTAL = ${total}, OUTRO = ${outro}, VERTICAL = ${L.short};
const SUBSCRIBED = ${JSON.stringify(arabic ? "تم الاشتراك ✓" : "Subscribed ✓")};
const tl = gsap.timeline({ paused: true });
tl.to('#g1', { x: -160, y: 120, duration: TOTAL, ease: 'sine.inOut' }, 0);
tl.to('#g2', { x: 160, y: -80, duration: TOTAL, ease: 'sine.inOut' }, 0);
tl.to('#bar i', { scaleX: 1, duration: TOTAL, ease: 'none' }, 0);
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (let i = 0; i < 30; i++) {
  const x = rnd() * ${width}, y = ${height * 0.3} + rnd() * ${height * 0.8}, d = 9 + rnd() * 10;
  gsap.set('#pt' + i, { x, y, scale: .5 + rnd() * 1.5 });
  for (let c = 0; c * d < TOTAL; c++) {
    tl.fromTo('#pt' + i, { y }, { y: y - 420, duration: d, ease: 'none', immediateRender: false }, c * d);
    tl.fromTo('#pt' + i, { opacity: 0 }, { opacity: .4, duration: d / 2, yoyo: true, repeat: 1, ease: 'sine.inOut', immediateRender: false }, c * d);
  }
}
const dir = ${arabic ? 1 : -1};
tl.fromTo('#flash', { opacity: .9 }, { opacity: 0, duration: .6 }, 0);
let pose = null;
D.forEach((s, k) => {
  const end = s.start + s.dur, sc = '#sc' + k, last = k === D.length - 1;
  const leave = last ? OUTRO - .2 : end + .25;
  if (k > 0) tl.fromTo('#wipe', { left: '-80%' }, { left: '120%', duration: .55, ease: 'power2.inOut', immediateRender: false }, s.start - .55);
  tl.fromTo(sc, { opacity: 0, y: k ? 40 : 0, scale: k ? 1 : 1.15 }, { opacity: 1, y: 0, scale: 1, duration: k ? .35 : .9, ease: 'power3.out' }, k ? s.start - .2 : .05);
  tl.to(sc, { opacity: 0, duration: .25 }, leave);
  const img = document.querySelector(sc + ' .ph img');
  if (img) tl.fromTo(img, { scale: 1.02 }, { scale: 1.12, x: dir * 20, duration: (s.beat || s.dur) + 1, ease: 'none' }, s.start - .2);
  // The opening photo flies off to reveal the diagram.
  if (s.beat) tl.to('#pb' + k, { opacity: 0, scale: .85, y: -40, duration: .45, ease: 'power2.in' }, s.start + s.beat - .3);
  const b0 = s.start + s.beat;
  if (k === 0 && document.querySelector('#hook')) tl.fromTo('#hook', { y: 40, opacity: 0, scale: .9 }, { y: 0, opacity: 1, scale: 1, duration: .5, ease: 'back.out(2)' }, s.start + Math.min(2.5, s.dur * .3));
  if (s.title) {
    tl.fromTo('#tt' + k, { opacity: 0, scale: 1.3 }, { opacity: 1, scale: 1, duration: .35, ease: 'back.out(2)' }, s.start - .25);
    tl.from('#tt' + k + ' i', { scaleX: 0, duration: .45, ease: 'power3.out' }, s.start);
    tl.to('#tt' + k, { opacity: 0, duration: .2 }, leave);
  }
  const at = (i) => s.start + s.items[i];
  if (s.layout === 'photo') s.items.forEach((_, i) => tl.fromTo('#it' + k + '_' + i, { opacity: 0, x: 50 * dir }, { opacity: 1, x: 0, duration: .35, ease: 'power2.out' }, at(i)));
  if (s.layout === 'grid') document.querySelectorAll(sc + ' .card').forEach((card, i) => tl.fromTo(card, { opacity: 0, scale: .6, y: 30 }, { opacity: 1, scale: 1, y: 0, duration: .35, ease: 'back.out(2)' }, b0 + .2 + i * Math.min(.18, (s.dur * .5) / Math.max(1, s.items.length))));
  if (s.layout === 'table') s.items.forEach((_, i) => tl.fromTo('#it' + k + '_' + i, { opacity: 0, x: 50 * dir }, { opacity: 1, x: 0, duration: .3, ease: 'power2.out' }, at(i)));
  if (s.layout === 'blocks') {
    tl.from(sc + ' .chip', { rotationY: dir * 25, scale: .85, duration: .7, ease: 'power3.out' }, b0 - .2);
    s.items.forEach((_, i) => {
      const tile = '#it' + k + '_' + i, info = '#in' + k + '_' + i;
      tl.to(tile, { backgroundColor: '${accent}40', borderColor: '${accent}', color: '#ffffff', boxShadow: '0 0 40px ${accent}aa', scale: 1.05, duration: .25 }, at(i));
      if (i + 1 < s.items.length) tl.to(tile, { backgroundColor: '${accent}1c', boxShadow: '0 0 0px ${accent}00', scale: 1, duration: .3 }, at(i + 1));
      tl.fromTo(info, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: .3 }, at(i));
      if (i + 1 < s.items.length) tl.to(info, { opacity: 0, y: -20, duration: .2 }, at(i + 1) - .15);
    });
  }
  if (s.layout === 'steps') {
    const n = s.items.length;
    s.items.forEach((_, i) => {
      const step = '#it' + k + '_' + i;
      tl.to(step, { opacity: 1, duration: .25 }, at(i));
      tl.fromTo(step + ' .dot', { scale: .6 }, { scale: 1, backgroundColor: '${accent}', borderColor: '#fff', boxShadow: '0 0 36px ${accent}', duration: .4, ease: 'back.out(3)', immediateRender: false }, at(i));
      if (n > 1) tl.to('#rl' + k, VERTICAL ? { scaleY: i / (n - 1), duration: .4 } : { scaleX: i / (n - 1), duration: .4 }, at(i) - .2);
      tl.fromTo('#in' + k + '_' + i, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: .3 }, at(i) + .1);
      if (i + 1 < n) tl.to('#in' + k + '_' + i, { opacity: 0, duration: .2 }, at(i + 1) - .1);
    });
  }
  if (s.layout === 'stat') {
    const num = document.querySelector('#num' + k);
    tl.fromTo(num, { scale: .4, opacity: 0 }, { scale: 1, opacity: 1, duration: .6, ease: 'back.out(2)' }, b0 + .1);
    if (s.stat) {
      const counter = { v: 0 }, st = s.stat;
      tl.to(counter, { v: st.number, duration: 1.4, ease: 'power2.out', onUpdate: () => { num.textContent = st.prefix + counter.v.toFixed(st.decimals) + st.suffix; } }, b0 + .1);
    }
    if (s.items.length) tl.fromTo('#it' + k + '_0', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: .4 }, b0 + 1.2);
  }
  s.caps.forEach((c, j) => {
    const next = j + 1 < s.caps.length ? s.start + s.caps[j + 1] : end + .25;
    tl.fromTo('#cap' + k + '_' + j, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: .16 }, s.start + c);
    tl.to('#cap' + k + '_' + j, { opacity: 0, duration: .1 }, next - .05);
  });
  if (!document.querySelector('#m_' + s.pose)) return;
  if (s.pose !== pose) {
    if (pose) tl.to('#m_' + pose, { opacity: 0, y: 40, duration: .18 }, s.start - .2);
    tl.fromTo('#m_' + s.pose, { opacity: 0, y: 120 }, { opacity: 1, y: 0, duration: .45, ease: 'back.out(1.8)' }, s.start - .1);
    pose = s.pose;
  } else {
    tl.to('#m_' + pose, { y: -30, duration: .15, yoyo: true, repeat: 1, ease: 'power2.out' }, s.start);
  }
});
document.querySelectorAll('.mascot').forEach((m, i) => tl.to(m, { rotation: 2, duration: 1 + i * .15, yoyo: true, repeat: Math.floor(TOTAL), ease: 'sine.inOut' }, 0));
tl.fromTo('#sub', { opacity: 0, scale: .6 }, { opacity: 1, scale: 1, duration: .45, ease: 'back.out(2)' }, OUTRO - .1);
tl.fromTo('#cursor', { opacity: 0, x: 200, y: 140 }, { opacity: 1, x: 60, y: 0, duration: .7, ease: 'power2.out' }, OUTRO + .4);
tl.to('#subBtn', { scale: .92, duration: .08, yoyo: true, repeat: 1 }, OUTRO + 1.15);
tl.set('#subBtn', { textContent: SUBSCRIBED, className: 'btn done' }, OUTRO + 1.25);
tl.fromTo('.bell', { rotation: -25 }, { rotation: 25, duration: .12, yoyo: true, repeat: 5, immediateRender: false }, OUTRO + 1.4);
tl.to({}, { duration: .01 }, TOTAL - .01);
window.__timelines.main = tl;
</script>
</body>
</html>
`;
}

/** "0:00 Intro" lines for the description, one per titled scene. */
export function deepChapters(project: Project, introLabel: string): string {
  const { scenes } = placeDeep(project);
  return chapterList(scenes.map((scene) => ({ start: scene.start, title: scene.visual.title })), GAP, introLabel);
}
