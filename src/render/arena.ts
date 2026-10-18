import { brandPaths } from "../brand/brand.ts";
import { alignWords } from "./align.ts";
import { placeVersus, type VersusScene } from "./versus.ts";
import { FORMATS, type Channel } from "../config.ts";
import type { Photo, Project, VersusRow } from "../types.ts";

/**
 * An "arena" versus video: the comparison staged as a fighting-game match.
 * Real photos fill the frame behind every round and keep moving; health bars
 * at the top drain as a product loses rows; each round opens on a "ROUND n"
 * card after a glitch cut; numbers race as bars; captions light up word by
 * word as they are spoken; and the match ends on the result and a subscribe
 * click.
 */

const esc = (text: unknown) => String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const r = (n: number) => Math.round(n * 1000) / 1000;
/** "وmemory" draws the و beside a Latin word, where it reads like a "g"; a space keeps it legible. */
const unglue = (text: string) => text.replace(/(^|\s)([وب])(?=[A-Za-z0-9$])/g, "$1$2 ");

/** A number to race as a bar: "$2,599" -> 2599, "24h" -> 24 with unit "h". */
function measure(value: string): { number: number; unit: string } | null {
  const match = value.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*([A-Za-z%]*)/);
  if (!match) return null;
  return { number: Number(match[1]), unit: match[2].toLowerCase() };
}

/** Bar lengths (0-1) when both values are numbers of the same kind. */
export function barsOf(row: VersusRow): { a: number; b: number } | null {
  const [a, b] = [measure(row.a), measure(row.b)];
  if (!a || !b || a.unit !== b.unit || (!a.number && !b.number)) return null;
  // "$" sits before the number; both must agree on it too.
  if (row.a.includes("$") !== row.b.includes("$")) return null;
  const max = Math.max(a.number, b.number);
  return { a: Math.max(0.06, a.number / max), b: Math.max(0.06, b.number / max) };
}

const digitsOf = (text: string) => (text.match(/\d[\d,.]*/g) ?? []).map((n) => n.replace(/[,.]/g, "")).filter((n) => n.length > 0);

/**
 * When each row of a round lands, in seconds from the round's start: when the
 * narrator says one of its numbers (found through the word alignment), else
 * spread over the round. Rows keep their order and at least 1.2s apart.
 */
export function arenaRowTimes(scene: VersusScene): number[] {
  const rows = scene.visual.rows;
  if (!rows.length) return [];
  const words = scene.narration.split(/\s+/).filter(Boolean);
  const times = alignWords(words, scene.audio?.words ?? [], scene.seconds);
  const said = words.map((word) => digitsOf(word).join(" "));
  const result: number[] = [];
  let from = 0;
  rows.forEach((row, index) => {
    const wanted = new Set([...digitsOf(row.a), ...digitsOf(row.b)]);
    let at: number | null = null;
    for (let w = from; w < words.length && wanted.size; w++) {
      if (said[w] && said[w].split(" ").some((n) => wanted.has(n))) {
        at = times[w];
        from = w + 1;
        break;
      }
    }
    const spread = 0.6 + ((scene.seconds * 0.7) / rows.length) * index;
    const earliest = index ? result[index - 1] + 1.2 : 0.5;
    result.push(r(Math.min(Math.max(scene.seconds - 0.8, 0.5), Math.max(earliest, (at ?? spread) - 0.3))));
  });
  return result;
}

/** Arabic letters (not its punctuation, so "Ultra،" still counts as Latin). */
const ARABIC = /[\u0621-\u064A]/;

/**
 * Caption lines (up to `perLine` words, broken at punctuation) with every
 * word's time. A run of Latin words and numbers ("Surface Laptop Ultra",
 * "$2,599") is one piece, so a right-to-left line keeps it in reading order
 * and lights it up as one.
 */
function karaoke(scene: VersusScene, perLine: number): { words: string[]; at: number[] }[] {
  const spoken = scene.narration.split(/\s+/).filter(Boolean);
  const times = alignWords(spoken, scene.audio?.words ?? [], scene.seconds);
  // "وMediaTek" becomes "و" + "MediaTek"; both parts keep the word's time.
  const parts = spoken.flatMap((word, i) => unglue(word).split(" ").map((part) => ({ text: part, at: times[i] })));
  const words: { text: string; at: number }[] = [];
  for (const part of parts) {
    const last = words.at(-1);
    if (last && !ARABIC.test(part.text) && !ARABIC.test(last.text) && !/[.,،:؛؟?!…]$/.test(last.text)) last.text += ` ${part.text}`;
    else words.push({ ...part });
  }
  const lines: { words: string[]; at: number[] }[] = [];
  let current: { words: string[]; at: number[] } = { words: [], at: [] };
  words.forEach(({ text: word, at }) => {
    current.words.push(word);
    current.at.push(r(Math.max(0, at - 0.05)));
    const end = /[.,،:؛؟?!…]$/.test(word);
    if (current.words.length >= perLine || (end && current.words.length >= 3)) {
      lines.push(current);
      current = { words: [], at: [] };
    }
  });
  if (current.words.length) {
    // A one-word tail joins the line before it.
    const last = lines.at(-1);
    if (last && current.words.length < 3 && last.words.length + current.words.length <= perLine + 2) {
      last.words.push(...current.words);
      last.at.push(...current.at);
    } else lines.push(current);
  }
  return lines;
}

/** The pictures behind a round: its own gallery, else the products' photos taken in turn. */
function picturesOf(scene: VersusScene, k: number, pool: Photo[], count: number): Photo[] {
  const own = (scene.visual.gallery ?? []).filter((photo) => photo.path);
  if (own.length) return own;
  if (!pool.length) return [];
  return Array.from({ length: Math.min(count, pool.length) }, (_, i) => pool[(k * 2 + i) % pool.length]);
}

/** When the fighters meet in the intro, from the intro's length. */
export const meetAt = (introSeconds: number) => Math.max(2.2, Math.min(introSeconds * 0.55, introSeconds - 3));

/** When a duel's winner lands its hit, from when the row appears. */
export const hitDelay = (row: VersusRow) => (barsOf(row) ? 1.1 : 0.6);

/** When the result appears in the last round. */
export const resultAt = (scene: VersusScene) => scene.start + Math.min(2.5, scene.seconds * 0.2);

type Layout = {
  short: boolean;
  hud: { top: number; bar: number; name: number };
  product: { bottom: number; height: number; side: number; width: number };
  panel: { top: number; left: number; right: number; title: number; value: number; label: number };
  caption: { top: number; left: number; right: number; size: number; words: number };
  card: number;
  sub: number;
};

function layoutFor(project: Project): Layout {
  if (project.format === "short") {
    // Shorts keep words out of YouTube's bottom overlay (~380px) and right-hand buttons.
    return {
      short: true,
      hud: { top: 60, bar: 400, name: 30 },
      product: { bottom: 1390, height: 300, side: 20, width: 500 },
      panel: { top: 600, left: 50, right: 50, title: 72, value: 54, label: 30 },
      caption: { top: 1260, left: 60, right: 60, size: 54, words: 5 },
      card: 150,
      sub: 1150,
    };
  }
  return {
    short: false,
    hud: { top: 34, bar: 690, name: 34 },
    product: { bottom: 30, height: 400, side: 0, width: 560 },
    panel: { top: 180, left: 400, right: 400, title: 78, value: 64, label: 32 },
    caption: { top: 900, left: 540, right: 540, size: 42, words: 7 },
    card: 190,
    sub: 520,
  };
}

function duelHtml(row: VersusRow, k: number, j: number, arabic: boolean): string {
  const bars = barsOf(row);
  const value = (side: "a" | "b") =>
    `<div class="val v${side}${row.winner === side ? " won" : row.winner ? " lost" : ""}"><bdi>${esc(unglue(side === "a" ? row.a : row.b))}</bdi>${row.winner === side ? `<span class="stamp">${arabic ? "فاز" : "WIN"}</span>` : ""}</div>`;
  return `<div class="duel" id="d${k}_${j}">
    ${row.label ? `<div class="lbl"><bdi>${esc(row.label)}</bdi></div>` : ""}
    <div class="vals">${value("a")}<div class="mid">VS</div>${value("b")}</div>
    ${bars ? `<div class="bars"><div class="track ta"><i id="ba${k}_${j}" style="--w:${r(bars.a)}"></i></div><div class="track tb"><i id="bb${k}_${j}" style="--w:${r(bars.b)}"></i></div></div>` : ""}
    <div class="spark" id="sp${k}_${j}">${Array.from({ length: 12 }, () => "<b></b>").join("")}</div>
  </div>`;
}

export function buildArena(project: Project, channel: Channel): string {
  if (!project.versus) throw new Error("This project has no products to compare");
  const { a, b, hook } = project.versus;
  const { width, height } = FORMATS[project.format];
  const L = layoutFor(project);
  const c = channel.colors;
  const accent = c.accent;
  const arabic = channel.language === "ar";
  const font = arabic ? "Cairo, 'SF Arabic', sans-serif" : "Inter, -apple-system, sans-serif";
  const display = arabic ? "Cairo, sans-serif" : "Anton, Impact, sans-serif";
  const { scenes, outro, total } = placeVersus(project);
  const brand = brandPaths(channel);
  // Product A stands on the reading side: the right in Arabic.
  const startSide = arabic ? "right" : "left";
  const endSide = arabic ? "left" : "right";

  const pool: Photo[] = [];
  const pa = (a.photos ?? []).filter((photo) => photo.path);
  const pb = (b.photos ?? []).filter((photo) => photo.path);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) pool.push(...(pa[i] ? [pa[i]] : []), ...(pb[i] ? [pb[i]] : []));

  // Who takes how much damage: the side that lost more rows ends at zero.
  const winsA = scenes.flatMap((s) => s.visual.rows).filter((row) => row.winner === "a").length;
  const winsB = scenes.flatMap((s) => s.visual.rows).filter((row) => row.winner === "b").length;
  const hit = 100 / Math.max(1, winsA, winsB);
  const champion = winsA === winsB ? "" : winsA > winsB ? "a" : "b";

  const backgrounds: string[] = [];
  const blocks: string[] = [];
  const data = scenes.map((scene, k) => {
    const v = scene.visual;
    const intro = k === 0;
    // The intro is a fast montage of everything; a round changes picture every ~6s.
    const pictures = intro ? pool.slice(0, 10) : picturesOf(scene, k, pool, Math.max(1, Math.ceil(scene.seconds / 6)));
    const step = intro ? Math.max(0.7, Math.min(1.1, (scene.seconds + 0.4) / Math.max(1, pictures.length))) : scene.seconds / Math.max(1, pictures.length);
    const cuts = pictures.map((_, j) => r(j * step));
    pictures.forEach((photo, j) => backgrounds.push(`<div class="bgp${photo.fit === "contain" ? " fit" : ""}" id="bg${k}_${j}"><img src="${photo.path}" /></div>`));

    if (!intro) {
      blocks.push(`<div class="card" id="rc${k}"><div class="lines"></div><div class="rn">${arabic ? "الجولة" : "ROUND"} ${k}</div><div class="rtt"><bdi>${esc(v.title)}</bdi></div></div>`);
      const duels = v.rows.map((row, j) => duelHtml(row, k, j, arabic)).join("");
      blocks.push(`<div class="round${v.rows.length === 1 ? " one" : ""}" id="r${k}"><div class="rt"><span class="rk">${k}</span><bdi>${esc(v.title)}</bdi></div>${duels}</div>`);
    }
    const lines = karaoke(scene, L.caption.words);
    lines.forEach((line, j) => blocks.push(`<div class="cl" id="cl${k}_${j}"><div>${line.words.map((word) => `<span class="w"${ARABIC.test(word) ? "" : ' dir="ltr"'}>${esc(word)}</span>`).join(" ")}</div></div>`));
    return {
      start: scene.start,
      dur: r(scene.seconds),
      cuts,
      montage: intro,
      lines: lines.map((line) => line.at),
      rows: arenaRowTimes(scene),
      wins: v.rows.map((row) => row.winner ?? ""),
      bars: v.rows.map((row) => Boolean(barsOf(row))),
      hits: v.rows.map(hitDelay),
    };
  });

  const audio = scenes
    .map((scene, k) => `<audio id="a${k}" data-start="${scene.start}" data-duration="${r(scene.seconds)}" data-track-index="2" src="${scene.audio!.path}"></audio>`)
    .join("\n  ");
  const confetti = Array.from({ length: 60 }, (_, i) => `<i class="cf" id="cf${i}" style="background:${[accent, a.color, b.color, "#ffd23f", "#fff"][i % 5]}"></i>`).join("");
  const hookWords = String(hook ?? "").split(/\s+/).filter(Boolean);
  const P = L.product;
  const bolt = `<svg class="bolt" viewBox="0 0 120 400"><path d="M70 0 L20 170 L62 170 L30 400 L105 140 L60 140 L95 0 Z" /></svg>`;

  return `<!doctype html>
<html lang="${arabic ? "ar" : "en"}" dir="${arabic ? "rtl" : "ltr"}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${width}, height=${height}" />
<title>${esc(project.title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Cairo:wght@700;900&family=Inter:wght@700;900&display=block" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #050507; }
  #root { position: relative; width: ${width}px; height: ${height}px; overflow: hidden; font-family: ${font}; color: #fff; background: #050507; }
  #world { position: absolute; inset: 0; }
  /* Real photos, always moving, under a shade that keeps the words readable. */
  .bgp { position: absolute; inset: -4%; opacity: 0; }
  .bgp img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .bgp.fit { background: radial-gradient(circle at 50% 45%, #2a2a33, #050507 70%); }
  .bgp.fit img { object-fit: contain; padding: 8%; }
  #shade { position: absolute; inset: 0; background:
      radial-gradient(ellipse at 50% 42%, #05050755 0%, #050507cc 70%, #050507f2 100%),
      linear-gradient(to ${startSide}, ${b.color}00 55%, ${a.color}40),
      linear-gradient(to ${endSide}, ${a.color}00 55%, ${b.color}40); }
  #shade.lit { background: radial-gradient(ellipse at 50% 42%, #05050722 0%, #05050799 75%, #050507e0 100%); }
  #grain { position: absolute; inset: -50%; opacity: .07; mix-blend-mode: overlay; pointer-events: none; z-index: 80;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>"); }
  #scan { position: absolute; inset: 0; z-index: 79; pointer-events: none; opacity: .18;
    background: repeating-linear-gradient(0deg, #0000 0 3px, #00000055 3px 4px); }
  #leak { position: absolute; width: ${width * 0.9}px; height: ${width * 0.9}px; border-radius: 50%; z-index: 78; mix-blend-mode: screen; opacity: 0; pointer-events: none;
    background: radial-gradient(circle, #ff7a2f88, #ff2f6a44 35%, transparent 65%); filter: blur(40px); }

  /* The health bars. */
  .hud { position: absolute; top: ${L.hud.top}px; width: ${L.hud.bar}px; z-index: 50; opacity: 0; }
  #hA { ${startSide}: ${L.short ? 30 : 40}px; } #hB { ${endSide}: ${L.short ? 30 : 40}px; }
  .hud .nm { font: 900 ${L.hud.name}px Inter; direction: ltr; letter-spacing: -.3px; white-space: nowrap; margin-bottom: 8px; text-shadow: 0 3px 12px #000; }
  #hA .nm { text-align: ${startSide}; } #hB .nm { text-align: ${endSide}; }
  .bar { position: relative; height: ${L.short ? 30 : 36}px; background: #000000aa; border: 3px solid #fff; transform: skewX(${arabic ? 20 : -20}deg); overflow: hidden; box-shadow: 0 0 24px #0008; }
  #hB .bar { transform: skewX(${arabic ? -20 : 20}deg); }
  .bar i { position: absolute; top: 0; bottom: 0; width: 100%; transform-origin: ${startSide} center; }
  #hB .bar i { transform-origin: ${endSide} center; }
  .bar .ghost { background: #fff; }
  .bar .hp { background: linear-gradient(180deg, #fff6 0, #fff0 45%), linear-gradient(90deg, #ffd23f, #3ddc84); }
  #hA .bar .hp { background: linear-gradient(180deg, #fff6 0, #fff0 45%), ${a.color}; }
  #hB .bar .hp { background: linear-gradient(180deg, #fff6 0, #fff0 45%), ${b.color}; }
  .pips { display: flex; gap: 8px; margin-top: 10px; direction: ltr; }
  #hA .pips { justify-content: flex-${arabic ? "end" : "start"}; } #hB .pips { justify-content: flex-${arabic ? "start" : "end"}; }
  .pips span { font: 900 ${L.short ? 26 : 28}px Inter; padding: 2px 14px; border-radius: 8px; background: #000a; border: 2px solid #fff4; }
  #round { position: absolute; top: ${L.hud.top - 6}px; left: 50%; width: ${L.short ? 120 : 150}px; margin-left: -${L.short ? 60 : 75}px; text-align: center; z-index: 51; opacity: 0; }
  #round .n { font: 400 ${L.short ? 64 : 78}px/1 Anton, Impact, sans-serif; text-shadow: 0 0 20px ${accent}, 0 4px 0 #000; }
  #round .t { font: 900 18px Inter; letter-spacing: 4px; color: #ffd23f; }

  /* The fighters. */
  .fighter { position: absolute; bottom: ${P.bottom}px; width: ${P.width}px; height: ${P.height}px; z-index: 20; perspective: 1100px; opacity: 0; }
  #fA { ${startSide}: ${P.side}px; } #fB { ${endSide}: ${P.side}px; }
  .fighter .body { position: absolute; inset: 0; transform-style: preserve-3d; }
  #fA .body { transform: rotateY(${arabic ? -22 : 22}deg); } #fB .body { transform: rotateY(${arabic ? 22 : -22}deg); }
  .fighter img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 26px 30px #000c); }
  .fighter .sheen { position: absolute; inset: 0; -webkit-mask: var(--m) center / contain no-repeat; mask: var(--m) center / contain no-repeat;
    background: linear-gradient(105deg, transparent 35%, #ffffffaa 50%, transparent 65%); background-size: 300% 100%; background-position: 120% 0; mix-blend-mode: overlay; }
  .fighter .aura { position: absolute; left: 10%; right: 10%; bottom: -8%; height: 40%; border-radius: 50%; filter: blur(30px); opacity: .5; }
  #fA .aura { background: ${a.color}; } #fB .aura { background: ${b.color}; }
  .fighter .hurt { position: absolute; inset: 0; background: #ff1f3d; mix-blend-mode: color; opacity: 0;
    -webkit-mask: var(--m) center / contain no-repeat; mask: var(--m) center / contain no-repeat; }
  .crown { position: absolute; left: 50%; top: -40px; font-size: 90px; margin-left: -50px; opacity: 0; filter: drop-shadow(0 0 20px #ffd23f); }

  /* The hook and VS. */
  #hook { position: absolute; left: 60px; right: 60px; top: ${L.short ? 640 : 330}px; text-align: center; z-index: 60; font: 900 ${L.short ? 96 : 104}px/1.15 ${font}; }
  #hook .hw { display: inline-block; opacity: 0; text-shadow: 0 6px 0 #000, 0 0 40px #000; margin: 0 .12em; }
  #hook .hw.hot { color: #ffd23f; }
  #vs { position: absolute; left: 50%; top: ${L.short ? 420 : 430}px; z-index: 40; opacity: 0; transform: translateX(-50%); font: 400 ${L.short ? 220 : 260}px/1 Anton, Impact, sans-serif; font-style: italic;
    color: #fff; text-shadow: 0 0 40px ${accent}, 6px 6px 0 ${accent}, -4px -4px 0 #00e5ff; }
  .bolt { position: absolute; top: ${L.short ? 260 : 120}px; width: 120px; height: 520px; z-index: 39; opacity: 0; fill: #fff; filter: drop-shadow(0 0 18px #7fd4ff) drop-shadow(0 0 40px #2d7bff); }
  #bolt1 { left: ${width / 2 - 230}px; } #bolt2 { left: ${width / 2 + 110}px; transform: scaleX(-1); }
  #fight { position: absolute; left: 0; right: 0; top: ${L.short ? 820 : 420}px; text-align: center; z-index: 61; opacity: 0;
    font: 900 ${L.short ? 150 : 170}px/1 ${display}; font-style: italic; color: #ffd23f; text-shadow: 0 8px 0 #b3001b, 0 0 60px #ff2f2f; }

  /* A round's card, between voices. */
  .card { position: absolute; inset: 0; z-index: 65; display: flex; flex-direction: column; align-items: center; justify-content: center; opacity: 0; }
  .card .lines { position: absolute; inset: -40%; opacity: .5;
    background: repeating-conic-gradient(from 0deg at 50% 50%, #ffffff00 0deg 4deg, #ffffff22 4deg 5deg); }
  .card .rn { position: relative; font: 400 ${L.card}px/1 Anton, Impact, sans-serif; font-style: italic; letter-spacing: 4px; color: #fff; text-shadow: 8px 8px 0 ${accent}, 0 0 50px #000; }
  .card .rtt { position: relative; margin-top: 10px; font: 900 ${L.card * 0.42}px ${font}; color: #ffd23f; text-shadow: 0 5px 0 #000, 0 0 30px #000; padding: 0 40px; text-align: center; }
  #slices { position: absolute; inset: 0; z-index: 66; pointer-events: none; }
  #slices i { position: absolute; left: -110%; width: 100%; height: ${100 / 6}%; transform: skewX(-25deg); }

  /* A round's duels. */
  .round { position: absolute; top: ${L.panel.top}px; left: ${L.panel.left}px; right: ${L.panel.right}px; z-index: 30; opacity: 0; display: flex; flex-direction: column; gap: ${L.short ? 22 : 18}px; }
  .round .rt { display: flex; align-items: center; justify-content: center; gap: 18px; font: 900 ${L.panel.title}px/1.15 ${font}; text-shadow: 0 5px 0 #000, 0 0 30px #000; margin-bottom: 6px; text-align: center; }
  .round .rk { font: 400 ${L.panel.title * 0.8}px/1 Anton, Impact, sans-serif; padding: 4px 18px 0; border-radius: 12px; background: ${accent}; transform: skewX(-10deg); box-shadow: 0 0 30px ${accent}aa; }
  .duel { position: relative; padding: 10px 18px 12px; border-radius: 22px; background: linear-gradient(180deg, #14141cdd, #0b0b10ee); border: 2px solid #ffffff26; box-shadow: 0 20px 40px #0009; opacity: 0; }
  .round.one .duel { padding: 26px 22px; }
  .lbl { text-align: center; font: 900 ${L.panel.label}px ${font}; color: #ffd23f; letter-spacing: .5px; margin-bottom: 4px; }
  .vals { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 14px; }
  .val { position: relative; text-align: center; font: 900 ${L.panel.value}px/1.15 ${font}; unicode-bidi: plaintext; padding: 6px 10px; border-radius: 14px; transition: none; }
  .va { color: ${a.color}; } .vb { color: ${b.color}; }
  .val.won { background: radial-gradient(ellipse at center, #ffffff1f, transparent 70%); text-shadow: 0 0 26px currentColor; }
  .val.lost { opacity: .55; }
  .stamp { position: absolute; top: -18px; ${endSide}: -6px; font: 900 22px ${font}; color: #000; background: #ffd23f; padding: 2px 12px; border-radius: 8px; transform: rotate(${arabic ? -8 : 8}deg); box-shadow: 0 0 20px #ffd23f99; }
  .mid { font: 400 34px Anton, Impact, sans-serif; font-style: italic; color: #ffffff66; }
  .bars { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 10px; direction: ${arabic ? "rtl" : "ltr"}; }
  .track { height: 16px; border-radius: 8px; background: #ffffff14; overflow: hidden; display: flex; }
  .track.ta { justify-content: flex-end; } .track.tb { justify-content: flex-start; }
  .track i { display: block; height: 100%; width: calc(var(--w) * 100%); border-radius: 8px; transform: scaleX(0); }
  .ta i { background: linear-gradient(90deg, ${a.color}55, ${a.color}); transform-origin: ${arabic ? "left" : "right"} center; box-shadow: 0 0 16px ${a.color}; }
  .tb i { background: linear-gradient(90deg, ${b.color}, ${b.color}55); transform-origin: ${arabic ? "right" : "left"} center; box-shadow: 0 0 16px ${b.color}; }
  ${arabic ? `.ta i { background: linear-gradient(90deg, ${a.color}, ${a.color}55); } .tb i { background: linear-gradient(90deg, ${b.color}55, ${b.color}); }` : ""}
  .spark { position: absolute; inset: 0; pointer-events: none; }
  .spark b { position: absolute; left: 50%; top: 50%; width: 10px; height: 10px; margin: -5px; border-radius: 50%; background: #ffd23f; opacity: 0; box-shadow: 0 0 12px #ffd23f; }

  /* Karaoke captions: the word being said lights up. */
  .cl { position: absolute; top: ${L.caption.top}px; left: ${L.caption.left}px; right: ${L.caption.right}px; min-height: ${L.caption.size * 2.8}px; display: flex; align-items: center; justify-content: center; text-align: center; z-index: 45; opacity: 0; }
  .cl > div { font: 900 ${L.caption.size}px/1.35 ${font}; direction: ${arabic ? "rtl" : "ltr"}; text-shadow: 0 4px 0 #000, 0 0 24px #000; }
  .cl .w { display: inline-block; padding: 0 6px; border-radius: 10px; color: #ffffffcc; }

  #badge { position: absolute; ${L.short ? "top: 190px" : "bottom: 12px"}; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 10px; padding: 5px 18px 5px 5px; border-radius: 999px;
    background: #0009; border: 1px solid #ffffff26; font: 800 22px Inter; direction: ltr; z-index: 52; ${L.short ? "" : "opacity: .85;"} }
  #badge img { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; }
  #flash { position: absolute; inset: 0; background: #fff; opacity: 0; z-index: 90; pointer-events: none; }
  #redflash { position: absolute; inset: 0; z-index: 89; opacity: 0; pointer-events: none; box-shadow: inset 0 0 180px 40px #ff1f3d; }
  #result { position: absolute; left: 0; right: 0; top: ${L.short ? 560 : 250}px; text-align: center; z-index: 62; opacity: 0; }
  #result .big { font: 900 ${L.short ? 120 : 140}px/1.1 ${display}; font-style: italic; color: #ffd23f; text-shadow: 0 8px 0 #b3001b, 0 0 60px #ff7a2f; }
  #result .who { font: 900 ${L.short ? 64 : 64}px ${font}; margin-top: 8px; text-shadow: 0 5px 0 #000; direction: ltr; }
  #result .score { font: 400 ${L.short ? 110 : 120}px/1 Anton, Impact, sans-serif; margin-top: 10px; direction: ltr; text-shadow: 0 6px 0 #000; }
  .cf { position: absolute; left: 50%; top: 40%; width: 14px; height: 22px; opacity: 0; z-index: 63; border-radius: 3px; }
  #sub { position: absolute; left: 50%; top: ${L.sub + (L.short ? 0 : 330)}px; transform: translateX(-50%); z-index: 70; opacity: 0; display: flex; gap: 18px; align-items: center; white-space: nowrap; }
  #sub .btn { background: #ff0033; color: #fff; padding: 18px 46px; border-radius: 999px; font: 900 44px ${font}; box-shadow: 0 0 40px #ff003399; }
  #sub .btn.done { background: #3a3a40; box-shadow: none; }
  #sub .bell { font-size: 54px; }
  #cursor { position: absolute; left: 50%; top: ${L.sub + (L.short ? 0 : 330) + 70}px; width: 54px; z-index: 71; opacity: 0; }
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-width="${width}" data-height="${height}">
 <div id="world">
  ${backgrounds.join("\n  ")}
  <div id="shade"></div>
  ${bolt.replace('class="bolt"', 'class="bolt" id="bolt1"')}${bolt.replace('class="bolt"', 'class="bolt" id="bolt2"')}
  <div class="fighter" id="fA" style="--m:url('${a.image ?? ""}')"><div class="body"><div class="aura"></div>${a.image ? `<img src="${a.image}" />` : ""}<div class="sheen"></div><div class="hurt"></div></div><div class="crown">👑</div></div>
  <div class="fighter" id="fB" style="--m:url('${b.image ?? ""}')"><div class="body"><div class="aura"></div>${b.image ? `<img src="${b.image}" />` : ""}<div class="sheen"></div><div class="hurt"></div></div><div class="crown">👑</div></div>
  <div id="vs">VS</div>
  <div id="hook">${hookWords.map((word, i) => `<span class="hw${i === hookWords.length - 1 || /\d|\$/.test(word) ? " hot" : ""}">${esc(unglue(word))}</span>`).join(" ")}</div>
  <div id="fight">${arabic ? "يلا بينا!" : "FIGHT!"}</div>
  ${blocks.join("\n  ")}
  <div id="result"><div class="big">${champion ? (arabic ? "الفائز بالنقاط" : "WINNER ON POINTS") : arabic ? "تعادل!" : "DRAW!"}</div>${champion ? `<div class="who" style="color:${champion === "a" ? a.color : b.color}">${esc(champion === "a" ? a.name : b.name)}</div>` : ""}<div class="score"><span style="color:${a.color}">${winsA}</span> - <span style="color:${b.color}">${winsB}</span></div></div>
  ${confetti}
  <div id="sub"><span class="bell">🔔</span><span class="btn" id="subBtn">${arabic ? "اشترك" : "Subscribe"}</span></div>
  <svg id="cursor" viewBox="0 0 24 24"><path d="M4 2l16 10-7 1.5L9.5 21z" fill="#fff" stroke="#000" stroke-width="1.2"/></svg>
 </div>
 <div class="hud" id="hA"><div class="nm" style="color:${a.color}">${esc(a.short)}</div><div class="bar"><i class="ghost" id="gA"></i><i class="hp" id="hpA"></i></div><div class="pips"><span id="sA">0</span></div></div>
 <div class="hud" id="hB"><div class="nm" style="color:${b.color}">${esc(b.short)}</div><div class="bar"><i class="ghost" id="gB"></i><i class="hp" id="hpB"></i></div><div class="pips"><span id="sB">0</span></div></div>
 <div id="round"><div class="t">${arabic ? "جولة" : "ROUND"}</div><div class="n" id="rnum">0</div></div>
 <div id="badge">${brand.logo ? `<img src="${brand.logo}" />` : ""}<span>${esc(channel.brand?.handle ?? channel.name)}</span></div>
 <div id="slices">${Array.from({ length: 6 }, (_, i) => `<i style="top:${(100 / 6) * i}%;background:${[accent, "#ffd23f", a.color, b.color, "#fff", accent][i]}"></i>`).join("")}</div>
 <div id="leak"></div>
 <div id="scan"></div>
 <div id="grain"></div>
 <div id="redflash"></div>
 <div id="flash"></div>
 ${audio}
</div>
<script>
window.__timelines = window.__timelines || {};
const D = ${JSON.stringify(data)};
const TOTAL = ${total}, OUTRO = ${outro}, HIT = ${r(hit)}, W = ${width}, H = ${height}, SHORT = ${L.short};
const SUBSCRIBED = ${JSON.stringify(arabic ? "تم الاشتراك ✓" : "Subscribed ✓")};
const ACCENT = '${accent}', DIR = ${arabic ? -1 : 1};
const tl = gsap.timeline({ paused: true });
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// Film grain that crawls, and the fighters breathing.
tl.to('#grain', { x: 60, y: -40, duration: TOTAL, ease: 'steps(' + Math.round(TOTAL * 12) + ')' }, 0);
['#fA .body', '#fB .body'].forEach((f, i) => tl.to(f, { y: -14, duration: 2 + i * .35, yoyo: true, repeat: Math.ceil(TOTAL / 2), ease: 'sine.inOut' }, 0));
['#fA .sheen', '#fB .sheen'].forEach((f, i) => { for (let t = 3 + i * 1.5; t < TOTAL; t += 7) tl.fromTo(f, { backgroundPosition: '120% 0' }, { backgroundPosition: '-20% 0', duration: 1.2, ease: 'power2.inOut', immediateRender: false }, t); });

// Every picture drifts (Ken Burns); the intro cuts hard with a flash and a zoom punch.
D.forEach((s, k) => s.cuts.forEach((c, j) => {
  const id = '#bg' + k + '_' + j;
  const t = s.montage && j === 0 ? 0 : s.start + c;
  const next = j + 1 < s.cuts.length ? s.start + s.cuts[j + 1] : (k + 1 < D.length ? D[k + 1].start - .6 : OUTRO + 5);
  const len = Math.max(.5, next - t + .8);
  const from = j % 2 ? { scale: 1.18, xPercent: 2 * DIR } : { scale: 1.04, xPercent: -2 * DIR };
  const to = j % 2 ? { scale: 1.04, xPercent: -1 * DIR } : { scale: 1.18, xPercent: 2 * DIR };
  if (s.montage) {
    tl.fromTo(id, { opacity: 1, scale: 1.35, rotation: j % 2 ? 1.5 : -1.5 }, { scale: 1.08, rotation: 0, duration: .45, ease: 'power3.out', immediateRender: false }, t);
    tl.to(id, { scale: 1.02, duration: Math.max(.3, next - t - .45), ease: 'none' }, t + .45);
    tl.fromTo('#flash', { opacity: .55 }, { opacity: 0, duration: .25, immediateRender: false }, t);
    tl.set(id, { opacity: 0 }, next + .02);
  } else {
    tl.fromTo(id, { opacity: 0 }, { opacity: 1, duration: j === 0 ? .25 : .8, immediateRender: false }, t - (j === 0 ? .3 : .4));
    tl.fromTo(id, from, Object.assign({ duration: len, ease: 'none', immediateRender: false }, to), t - .4);
    tl.to(id, { opacity: 0, duration: .5 }, next + .3);
  }
}));

// The intro: the hook word by word over the montage, then the fighters slam in under lightning.
const I = D[0];
const hookWords = document.querySelectorAll('#hook .hw');
hookWords.forEach((w, i) => tl.fromTo(w, { opacity: 0, scale: 2.4, rotation: i % 2 ? 8 : -8, y: 20 }, { opacity: 1, scale: 1, rotation: 0, y: 0, duration: .32, ease: 'back.out(2.2)', immediateRender: false }, .15 + i * .2));
const meet = ${r(meetAt(scenes[0]?.seconds ?? 6))};
tl.to('#hook', { y: SHORT ? 60 : -170, scale: SHORT ? .7 : .55, duration: .5, ease: 'power3.inOut' }, meet - .5);
tl.fromTo('#fA', { opacity: 0, x: -900 * DIR, rotation: -10 * DIR }, { opacity: 1, x: 0, rotation: 0, duration: .55, ease: 'power4.out', immediateRender: false }, meet);
tl.fromTo('#fB', { opacity: 0, x: 900 * DIR, rotation: 10 * DIR }, { opacity: 1, x: 0, rotation: 0, duration: .55, ease: 'power4.out', immediateRender: false }, meet + .12);
tl.fromTo('#vs', { opacity: 0, scale: 5 }, { opacity: 1, scale: 1, duration: .35, ease: 'power4.in', immediateRender: false }, meet + .5);
tl.fromTo('#flash', { opacity: .9 }, { opacity: 0, duration: .5, immediateRender: false }, meet + .85);
tl.fromTo('#world', { x: -22 }, { x: 0, duration: .6, ease: 'elastic.out(1.4,0.2)', immediateRender: false }, meet + .85);
['#bolt1', '#bolt2'].forEach((b, i) => { for (let f = 0; f < 4; f++) tl.fromTo(b, { opacity: 1 }, { opacity: 0, duration: .09, immediateRender: false }, meet + .85 + i * .05 + f * .32); });
tl.fromTo(['#hA', '#hB', '#round'], { opacity: 0, y: -40 }, { opacity: 1, y: 0, duration: .4, stagger: .08, ease: 'back.out(2)', immediateRender: false }, meet + .9);
tl.fromTo(['#hpA', '#hpB', '#gA', '#gB'], { scaleX: 0 }, { scaleX: 1, duration: .9, ease: 'power2.out', immediateRender: false }, meet + 1);
const firstRound = D.length > 1 ? D[1].start : OUTRO;
tl.to('#hook', { opacity: 0, duration: .25 }, firstRound - 1.6);
tl.to('#vs', { opacity: 0, scale: .4, duration: .3 }, firstRound - 1.6);
tl.fromTo('#fight', { opacity: 0, scale: 3 }, { opacity: 1, scale: 1, duration: .3, ease: 'power4.in', immediateRender: false }, firstRound - 1.5);
tl.to('#fight', { opacity: 0, scale: 1.3, duration: .25 }, firstRound - .95);

// Rounds: a glitch cut, the card, then each duel when the narrator gets to it.
const R0 = ${r(resultAt(scenes[scenes.length - 1]))};
let hpA = 100, hpB = 100, sa = 0, sb = 0;
const glitch = (t) => {
  tl.fromTo('#slices i', { x: 0 }, { x: W * 2.2, duration: .4, ease: 'power3.inOut', stagger: .025, immediateRender: false }, t);
  tl.fromTo('#world', { filter: 'drop-shadow(10px 0 0 #ff00e1) drop-shadow(-10px 0 0 #00f0ff)' }, { filter: 'drop-shadow(0px 0 0 #ff00e1) drop-shadow(0px 0 0 #00f0ff)', duration: .35, immediateRender: false }, t + .3);
  tl.fromTo('#world', { skewX: 6 }, { skewX: 0, duration: .3, ease: 'power2.out', immediateRender: false }, t + .3);
};
D.forEach((s, k) => {
  if (k === 0) return;
  const end = s.start + s.dur;
  glitch(s.start - 1.15);
  const card = '#rc' + k;
  tl.fromTo(card, { opacity: 0, scale: 2.2, filter: 'blur(14px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: .32, ease: 'power3.out', immediateRender: false }, s.start - .85);
  tl.fromTo(card + ' .lines', { rotation: 0 }, { rotation: 25, duration: 1.4, ease: 'none', immediateRender: false }, s.start - .85);
  tl.to(card, { opacity: 0, scale: .8, duration: .25, ease: 'power2.in' }, s.start + .35);
  tl.fromTo('#leak', { opacity: 0, x: -W * .6, y: -H * .3 }, { opacity: .9, x: W * .4, y: H * .1, duration: 1.4, ease: 'power1.inOut', immediateRender: false }, s.start - .9);
  tl.to('#leak', { opacity: 0, duration: .5 }, s.start + .3);
  tl.set('#rnum', { textContent: k }, s.start - .6);
  tl.fromTo('#round .n', { scale: 1.8, color: '#ffd23f' }, { scale: 1, color: '#fff', duration: .4, ease: 'back.out(3)', immediateRender: false }, s.start - .6);
  const round = '#r' + k;
  // The last round's panel waits until the result has been shown.
  const shown = k === D.length - 1 ? R0 + 3.5 : s.start + .3;
  tl.fromTo(round, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: .35, ease: 'power2.out', immediateRender: false }, shown);
  tl.from(round + ' .rk', { scale: 0, rotation: -30, duration: .4, ease: 'back.out(3)' }, shown + .05);
  s.rows.forEach((at, j) => {
    const d = '#d' + k + '_' + j, t = Math.max(s.start + at, shown + .2);
    tl.fromTo(d, { opacity: 0, x: 80 * DIR, scale: .92 }, { opacity: 1, x: 0, scale: 1, duration: .35, ease: 'power3.out', immediateRender: false }, t);
    tl.from(d + ' .va', { x: -60 * DIR, opacity: 0, duration: .3, ease: 'power2.out' }, t + .1);
    tl.from(d + ' .vb', { x: 60 * DIR, opacity: 0, duration: .3, ease: 'power2.out' }, t + .1);
    if (s.bars[j]) {
      tl.to('#ba' + k + '_' + j, { scaleX: 1, duration: .9, ease: 'power2.out' }, t + .3);
      tl.to('#bb' + k + '_' + j, { scaleX: 1, duration: .9, ease: 'power2.out' }, t + .3);
    }
    const w = s.wins[j];
    if (!w) return;
    const hitAt = t + s.hits[j];
    tl.from(d + ' .stamp', { scale: 3, opacity: 0, rotation: -40, duration: .3, ease: 'back.out(2.5)' }, hitAt);
    tl.fromTo(d + ' .val.won', { scale: 1 }, { scale: 1.14, duration: .15, yoyo: true, repeat: 1, immediateRender: false }, hitAt);
    tl.fromTo(d + ' .val.lost', { opacity: 1 }, { opacity: .55, duration: .3, immediateRender: false }, hitAt);
    // Sparks fly from the winning value.
    document.querySelectorAll('#sp' + k + '_' + j + ' b').forEach((b, n) => {
      const angle = (n / 12) * Math.PI * 2, dist = 120 + rnd() * 120, x0 = (w === 'a' ? -1 : 1) * DIR * (SHORT ? 230 : 200);
      tl.fromTo(b, { x: x0, y: 0, opacity: 1, scale: 1.4 }, { x: x0 + Math.cos(angle) * dist, y: Math.sin(angle) * dist * .6, opacity: 0, scale: .3, duration: .6, ease: 'power2.out', immediateRender: false }, hitAt);
    });
    // The loser takes the hit: health drains (the white ghost follows), it flashes red, the screen shakes.
    const loser = w === 'a' ? 'B' : 'A';
    if (loser === 'A') hpA = Math.max(0, hpA - HIT); else hpB = Math.max(0, hpB - HIT);
    const left = (loser === 'A' ? hpA : hpB) / 100;
    tl.to('#hp' + loser, { scaleX: left, duration: .25, ease: 'power3.out' }, hitAt + .05);
    tl.to('#g' + loser, { scaleX: left, duration: .6, ease: 'power2.inOut' }, hitAt + .45);
    tl.fromTo('#f' + loser + ' .hurt', { opacity: .75 }, { opacity: 0, duration: .45, immediateRender: false }, hitAt + .05);
    tl.fromTo('#f' + loser, { x: 0 }, { x: 18, duration: .05, yoyo: true, repeat: 5, ease: 'none', immediateRender: false }, hitAt + .05);
    tl.fromTo('#f' + (loser === 'A' ? 'B' : 'A') + ' .body', { scale: 1 }, { scale: 1.08, duration: .18, yoyo: true, repeat: 1, immediateRender: false }, hitAt);
    tl.fromTo('#redflash', { opacity: .7 }, { opacity: 0, duration: .4, immediateRender: false }, hitAt + .05);
    tl.fromTo('#world', { y: 0 }, { y: 10, duration: .04, yoyo: true, repeat: 5, ease: 'none', immediateRender: false }, hitAt + .05);
    const id = w === 'a' ? '#sA' : '#sB';
    tl.set(id, { textContent: w === 'a' ? ++sa : ++sb }, hitAt + .1);
    tl.fromTo(id, { scale: 2, backgroundColor: ACCENT }, { scale: 1, backgroundColor: '#000000aa', duration: .5, ease: 'back.out(3)', immediateRender: false }, hitAt + .1);
  });
  if (k < D.length - 1) tl.to(round, { opacity: 0, y: -20, duration: .25 }, end + .15);
});

// Karaoke captions.
D.forEach((s, k) => s.lines.forEach((at, j) => {
  const line = '#cl' + k + '_' + j;
  const t0 = s.start + at[0];
  const next = j + 1 < s.lines.length ? s.start + s.lines[j + 1][0] : s.start + s.dur + .2;
  tl.fromTo(line, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: .14, immediateRender: false }, t0 - .08);
  tl.to(line, { opacity: 0, duration: .08 }, next - .08);
  const words = document.querySelectorAll(line + ' .w');
  at.forEach((wt, n) => {
    const wEnd = n + 1 < at.length ? s.start + at[n + 1] : next - .1;
    tl.fromTo(words[n], { color: '#ffffffcc', backgroundColor: 'rgba(0,0,0,0)', scale: 1 }, { color: '#000', backgroundColor: '#ffd23f', scale: 1.08, duration: .08, immediateRender: false }, s.start + wt);
    tl.to(words[n], { color: '#fff', backgroundColor: 'rgba(0,0,0,0)', scale: 1, duration: .1 }, Math.max(s.start + wt + .1, wEnd));
  });
}));

// The end of the match: the result, a crown and confetti for the winner, then subscribe.
tl.fromTo('#result', { opacity: 0, scale: 2.5 }, { opacity: 1, scale: 1, duration: .4, ease: 'power4.in', immediateRender: false }, R0);
tl.fromTo('#flash', { opacity: .8 }, { opacity: 0, duration: .5, immediateRender: false }, R0 + .4);
tl.to('#result', { opacity: 0, y: -40, duration: .35 }, R0 + 3.2);
${champion ? `tl.fromTo('#f${champion.toUpperCase()} .crown', { opacity: 0, y: -120, scale: .4 }, { opacity: 1, y: 0, scale: 1, duration: .6, ease: 'bounce.out', immediateRender: false }, R0 + .5);
tl.to('#f${champion.toUpperCase()} .body', { scale: 1.12, duration: .5, ease: 'back.out(2)' }, R0 + .5);` : ""}
document.querySelectorAll('.cf').forEach((p, i) => {
  const x = (rnd() - .5) * W * 1.1, up = -H * (.25 + rnd() * .35);
  tl.fromTo(p, { x: 0, y: 0, opacity: 1, rotation: 0 }, { x, y: up, rotation: rnd() * 720, duration: .7, ease: 'power3.out', immediateRender: false }, R0 + .45);
  tl.to(p, { y: H * .7, rotation: '+=' + (rnd() * 540), duration: 2.4 + rnd(), ease: 'power1.in' }, R0 + 1.15);
  tl.set(p, { opacity: 0 }, R0 + 4.6);
});
tl.to('#r' + (D.length - 1), { opacity: 0, duration: .3 }, OUTRO - .2);
tl.fromTo('#sub', { opacity: 0, scale: .6 }, { opacity: 1, scale: 1, duration: .45, ease: 'back.out(2)', immediateRender: false }, OUTRO);
tl.fromTo('#cursor', { opacity: 0, x: 200, y: 140 }, { opacity: 1, x: 60, y: 0, duration: .7, ease: 'power2.out', immediateRender: false }, OUTRO + .5);
tl.to('#subBtn', { scale: .92, duration: .08, yoyo: true, repeat: 1 }, OUTRO + 1.25);
tl.set('#subBtn', { textContent: SUBSCRIBED, className: 'btn done' }, OUTRO + 1.35);
tl.fromTo('.bell', { rotation: -25 }, { rotation: 25, duration: .12, yoyo: true, repeat: 5, immediateRender: false }, OUTRO + 1.5);
tl.to({}, { duration: .01 }, TOTAL - .01);
window.__timelines.main = tl;
</script>
</body>
</html>
`;
}
