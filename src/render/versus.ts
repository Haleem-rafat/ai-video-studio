import { brandPaths } from "../brand/brand.ts";
import { alignWords } from "./align.ts";
import { FORMATS, type Channel } from "../config.ts";
import type { Pose, Project, Scene, VersusRow } from "../types.ts";

/**
 * A "versus" video: two products face each other, and every scene is one
 * round, a topic title and spec rows whose winner gets a check mark, a glow
 * on its product and a point on the scoreboard. Red wipes cut between rounds,
 * the channel's character reacts below, and a subscribe click closes it.
 */

/** Silence before the first line, while the products slam in. */
const INTRO = 1.4;
const GAP = 0.5;
/** Room after the last line for the subscribe click. */
const OUTRO = 3.2;

export type VersusScene = Scene & { start: number; seconds: number; visual: Extract<Scene["visual"], { type: "versus" }> };

const esc = (text: unknown) => String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const r = (n: number) => Math.round(n * 1000) / 1000;

function asVersus(scene: Scene): VersusScene["visual"] {
  return scene.visual.type === "versus" ? scene.visual : { type: "versus", title: "", rows: [] };
}

/**
 * An arena video's beats: the montage starts on frame 0, each round gets a
 * "ROUND n" card between voices, and the close has room for the K.O. and the
 * subscribe click.
 */
const ARENA = { intro: 0.4, gap: 1.2, outro: 5 };

/** A pros-and-cons video's beats: a chapter card between chapters, and room for the subscribe close. */
export const PROSCONS = { intro: 0.6, gap: 1.5, outro: 4.5 };

const timingOf = (project: Pick<Project, "versus">) => (project.versus?.look === "arena" ? ARENA : project.versus?.look === "proscons" ? PROSCONS : { intro: INTRO, gap: GAP, outro: OUTRO });

/** When each scene speaks, and when the closing subscribe beat starts. */
export function placeVersus(project: Project): { scenes: VersusScene[]; outro: number; total: number } {
  const timing = timingOf(project);
  let t = timing.intro;
  const scenes = project.scenes.map((scene) => {
    const seconds = scene.audio?.seconds ?? 3;
    const placed = { ...scene, start: r(t), seconds, visual: asVersus(scene) };
    t += seconds + timing.gap;
    return placed;
  });
  return { scenes, outro: r(t), total: r(t + timing.outro) };
}

/** When each row of a scene appears; the check mark lands 0.35s later. */
export function rowTimes(scene: VersusScene): number[] {
  const rows = scene.visual.rows;
  const step = Math.min(2.2, (scene.seconds * 0.75) / Math.max(1, rows.length));
  return rows.map((_, index) => r(scene.start + 0.3 + index * step));
}

/**
 * Caption lines from the script, timed by the voice's word times. Lines end
 * at punctuation; long phrases split evenly. The heard words differ from the
 * script (numbers and English names come out as several words), so the two
 * are aligned word by word rather than placed proportionally.
 */
export function captionLines(scene: Pick<Scene, "narration" | "audio"> & { seconds: number }, perLine: number): { text: string; at: number }[] {
  const words = scene.narration.split(/\s+/).filter(Boolean);
  const heard = scene.audio?.words ?? [];
  const phrases: string[][] = [];
  let current: string[] = [];
  for (const word of words) {
    current.push(word);
    if (/[.,،:؟?!…]$/.test(word)) {
      phrases.push(current);
      current = [];
    }
  }
  if (current.length) phrases.push(current);

  const lines: string[][] = [];
  for (const phrase of phrases) {
    const parts = Math.max(1, Math.ceil(phrase.length / perLine));
    const size = Math.ceil(phrase.length / parts);
    for (let i = 0; i < phrase.length; i += size) lines.push(phrase.slice(i, i + size));
  }
  const merged: string[][] = [];
  for (const line of lines) {
    const last = merged.at(-1);
    if (last && (line.length === 1 || last.length === 1) && last.length + line.length <= perLine + 1) merged[merged.length - 1] = [...last, ...line];
    else merged.push(line);
  }

  const times = alignWords(words, heard, scene.seconds);
  let index = 0;
  return merged.map((line) => {
    const position = times[index] ?? 0;
    index += line.length;
    // "وmemory" draws the و beside a Latin word, where it reads like a "g"; a space keeps it legible.
    return { text: line.join(" ").replace(/(^|\s)([وب])(?=[A-Za-z0-9])/g, "$1$2 "), at: r(Math.max(0, position - 0.05)) };
  });
}

type Layout = {
  phone: { top: number; width: number; height: number; imageHeight: number; side: number; name: number };
  vs: { top: number; size: number };
  hook: { top: number; size: number };
  title: { top: number; size: number };
  table: { top: number; left: number; right: number; row: number; font: number; head: number };
  caption: { top: number; left: number; right: number; height: number; size: number; words: number };
  mascot: { css: string; height: number };
  score: string;
  badge: string;
  sub: number;
};

function layoutFor(project: Project): Layout {
  if (project.format === "short") {
    // Shorts keep text out of YouTube's bottom overlay (~380px) and right-hand buttons.
    return {
      phone: { top: 150, width: 470, height: 660, imageHeight: 560, side: 40, name: 40 },
      vs: { top: 470, size: 170 },
      hook: { top: 840, size: 78 },
      title: { top: 840, size: 76 },
      table: { top: 960, left: 50, right: 50, row: 118, font: 36, head: 32 },
      caption: { top: 1330, left: 300, right: 40, height: 220, size: 52, words: 5 },
      mascot: { css: "left: 16px; bottom: 380px;", height: 300 },
      score: "top: 36px; left: 36px;",
      badge: "top: 36px; right: 36px;",
      sub: 1180,
    };
  }
  return {
    phone: { top: 175, width: 440, height: 640, imageHeight: 540, side: 70, name: 34 },
    vs: { top: 400, size: 190 },
    hook: { top: 640, size: 74 },
    title: { top: 92, size: 66 },
    table: { top: 240, left: 560, right: 560, row: 112, font: 32, head: 30 },
    caption: { top: 880, left: 460, right: 460, height: 150, size: 48, words: 8 },
    mascot: { css: "right: 150px; bottom: -8px;", height: 300 },
    score: "bottom: 34px; left: 40px;",
    badge: "top: 30px; right: 36px;",
    sub: 610,
  };
}

function cell(text: string, won: boolean): string {
  if (!text.trim() || text.trim() === "—") return `<div class="cell empty">—</div>`;
  return `<div class="cell${won ? " won" : ""}"><bdi>${esc(text)}</bdi>${won ? '<span class="win">✓</span>' : ""}</div>`;
}

export function buildVersus(project: Project, channel: Channel): string {
  if (!project.versus) throw new Error("This project has no products to compare");
  const { a, b, hook } = project.versus;
  const { width, height } = FORMATS[project.format];
  const L = layoutFor(project);
  const c = channel.colors;
  const accent = c.accent;
  const arabic = channel.language === "ar";
  const font = arabic ? "Cairo, 'SF Arabic', sans-serif" : "Inter, -apple-system, sans-serif";
  const { scenes, outro, total } = placeVersus(project);
  const brand = brandPaths(channel);
  const poses: Record<Pose, string | undefined> = { point: brand.mascots[0], think: brand.mascots[1] ?? brand.mascots[0], wave: brand.mascots[2] ?? brand.mascots[0] };
  const hasMascot = Boolean(brand.mascots[0]);

  const blocks: string[] = [];
  const data = scenes.map((scene, k) => {
    const v = scene.visual;
    if (v.rows.length) {
      const rows = v.rows.map((row: VersusRow) => `<div class="row">${cell(row.a, row.winner === "a")}${cell(row.b, row.winner === "b")}</div>`).join("");
      blocks.push(
        `<div class="sec" id="sec${k}"><div class="table"><div class="thead"><div style="color:${a.color}">${esc(a.short)}</div><div style="color:${b.color}">${esc(b.short)}</div></div><div id="tb${k}">${rows}</div></div></div>`,
      );
    }
    if (v.title) blocks.push(`<div class="title" id="tt${k}"><span>${esc(v.title)}</span><i></i></div>`);
    const caps = captionLines(scene, L.caption.words);
    caps.forEach((cap, j) => blocks.push(`<div class="cap" id="cap${k}_${j}"><span>${esc(cap.text)}</span></div>`));
    return { start: scene.start, dur: r(scene.seconds), pose: v.pose ?? (k === scenes.length - 1 ? "wave" : k % 2 ? "think" : "point"), title: Boolean(v.title), caps: caps.map((cap) => cap.at), rows: rowTimes(scene), wins: v.rows.map((row) => row.winner ?? "") };
  });

  const audio = scenes
    .map((scene, k) => `<audio id="a${k}" data-start="${scene.start}" data-duration="${r(scene.seconds)}" data-track-index="2" src="${scene.audio!.path}"></audio>`)
    .join("\n  ");
  const particles = Array.from({ length: 36 }, (_, i) => `<i class="pt" id="pt${i}"></i>`).join("");
  const mascots = hasMascot ? (["point", "think", "wave"] as const).map((pose) => `<img class="mascot" id="m_${pose}" src="${poses[pose]}" />`).join("") : "";
  const P = L.phone;

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
  #root { position: relative; width: ${width}px; height: ${height}px; overflow: hidden; font-family: ${font}; color: ${c.text}; background: ${c.background}; }
  #stage { position: absolute; inset: 0; }
  .glow { position: absolute; border-radius: 50%; filter: blur(60px); opacity: .55; }
  #g1 { width: 900px; height: 900px; right: -250px; top: -200px; background: radial-gradient(${a.color}66, transparent 65%); }
  #g2 { width: 900px; height: 900px; left: -250px; bottom: -300px; background: radial-gradient(${b.color}77, transparent 65%); }
  #g3 { width: 700px; height: 500px; left: ${width / 2 - 350}px; top: ${height / 2 - 250}px; background: radial-gradient(${accent}33, transparent 70%); }
  #grid { position: absolute; inset: 0; background-image: linear-gradient(#ffffff08 1px, transparent 1px), linear-gradient(90deg, #ffffff08 1px, transparent 1px); background-size: 80px 80px;
    mask-image: radial-gradient(ellipse at center, #000 30%, transparent 80%); }
  .pt { position: absolute; width: 4px; height: 4px; border-radius: 50%; background: #fff; opacity: 0; }
  #badge { position: absolute; ${L.badge} display: flex; align-items: center; gap: 12px; padding: 6px 20px 6px 6px; border-radius: 999px;
    background: #ffffff12; border: 1px solid #ffffff22; font: 800 26px Inter; direction: ltr; z-index: 50; }
  #badge img { width: 50px; height: 50px; border-radius: 50%; object-fit: cover; }
  .phone { position: absolute; top: ${P.top}px; width: ${P.width}px; height: ${P.height}px; text-align: center; z-index: 5; }
  .phone .nm { font: 900 ${P.name}px Inter; direction: ltr; letter-spacing: -.5px; white-space: nowrap; }
  .phone img { display: block; height: ${P.imageHeight}px; max-width: ${P.width + 40}px; object-fit: contain; margin: 22px auto 0; filter: drop-shadow(0 30px 40px #000a) drop-shadow(0 0 28px #ffffff2e); }
  .phone::before { content: ""; position: absolute; left: 50%; top: 55%; width: 560px; height: 560px; margin: -280px 0 0 -280px; border-radius: 50%; z-index: -2;
    background: radial-gradient(var(--tone), transparent 62%); opacity: .55; }
  #pA { ${arabic ? "right" : "left"}: ${P.side}px; } #pB { ${arabic ? "left" : "right"}: ${P.side}px; }
  .halo { position: absolute; left: 50%; top: 55%; width: 520px; height: 520px; margin: -260px 0 0 -260px; border-radius: 50%; opacity: 0;
    background: radial-gradient(${accent}88, transparent 65%); filter: blur(10px); z-index: -1; }
  #vs { position: absolute; left: 50%; top: ${L.vs.top}px; width: ${L.vs.size}px; height: ${L.vs.size}px; margin: -${L.vs.size / 2}px 0 0 -${L.vs.size / 2}px; border-radius: 50%; display: grid; place-items: center;
    font: 900 ${L.vs.size * 0.48}px Inter; font-style: italic; color: #fff; background: linear-gradient(145deg, #ff6a3d, ${accent} 55%, #a3001a); border: 8px solid #fff; z-index: 20;
    box-shadow: 0 0 0 10px #ffffff18, 0 0 80px ${accent}aa; }
  #hook { position: absolute; left: 40px; right: 40px; top: ${L.hook.top}px; text-align: center; font: 900 ${L.hook.size}px/1.2 ${font}; z-index: 21; opacity: 0; }
  .title { position: absolute; top: ${L.title.top}px; left: 0; right: 0; text-align: center; z-index: 30; opacity: 0; }
  .title span { font: 900 ${L.title.size}px ${font}; }
  .title i { display: block; width: 180px; height: 8px; margin: 2px auto 0; background: ${accent}; border-radius: 4px; }
  .sec { position: absolute; left: ${L.table.left}px; right: ${L.table.right}px; top: ${L.table.top}px; opacity: 0; z-index: 10; }
  .table { border-radius: 28px; overflow: hidden; background: #ffffff0d; border: 1px solid #ffffff22; }
  .thead, .row { display: grid; grid-template-columns: 1fr 1fr; }
  .thead div { text-align: center; padding: 16px; font: 900 ${L.table.head}px Inter; direction: ltr; background: #ffffff0a; }
  .row { border-top: 1px solid #ffffff1c; min-height: ${L.table.row}px; opacity: 0; }
  .cell { display: flex; align-items: center; justify-content: center; gap: 14px; padding: 14px 18px; text-align: center; font: 800 ${L.table.font}px/1.25 ${font}; unicode-bidi: plaintext; color: ${c.text}; }
  .cell + .cell { border-${arabic ? "right" : "left"}: 1px solid #ffffff1c; }
  .cell.empty { color: #ffffff40; }
  .cell.won { background: linear-gradient(90deg, ${accent}00, ${accent}26, ${accent}00); }
  .win { flex: none; width: 42px; height: 42px; border-radius: 50%; background: #20c45a; color: #fff; font: 900 26px Inter; display: grid; place-items: center; box-shadow: 0 0 24px #20c45a99; }
  .cap { position: absolute; top: ${L.caption.top}px; left: ${L.caption.left}px; right: ${L.caption.right}px; height: ${L.caption.height}px; display: flex; align-items: center; justify-content: center; text-align: center;
    font: 800 ${L.caption.size}px/1.3 ${font}; opacity: 0; z-index: 40; text-shadow: 0 4px 18px #000; }
  .cap span { unicode-bidi: plaintext; background: #000000a0; padding: 6px 26px; border-radius: 18px; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
  .mascot { position: absolute; ${L.mascot.css} height: ${L.mascot.height}px; opacity: 0; transform-origin: 50% 100%; z-index: 45; filter: drop-shadow(0 10px 20px #000c); }
  #score { position: absolute; ${L.score} display: flex; gap: 10px; align-items: center; z-index: 45; direction: ltr; opacity: 0;
    padding: 10px 18px; border-radius: 18px; background: #ffffff10; border: 1px solid #ffffff22; font: 900 30px Inter; }
  #score .n { display: inline-block; min-width: 34px; text-align: center; font-size: 40px; color: #fff; }
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
  <div class="glow" id="g1"></div><div class="glow" id="g2"></div><div class="glow" id="g3"></div>
  <div id="grid"></div>
  ${particles}
  <div class="phone" id="pA" style="--tone:${a.color}"><div class="halo"></div><div class="nm" style="color:${a.color}">${esc(a.name)}</div>${a.image ? `<img src="${a.image}" />` : ""}</div>
  <div class="phone" id="pB" style="--tone:${b.color}"><div class="halo"></div><div class="nm" style="color:${b.color}">${esc(b.name)}</div>${b.image ? `<img src="${b.image}" />` : ""}</div>
  <div id="vs">VS</div>
  <div id="hook">${esc(hook ?? "")}</div>
  ${blocks.join("\n  ")}
  ${mascots}
  <div id="score"><span style="color:${a.color}">${esc(a.short)}</span><span class="n" id="sA">0</span><span style="opacity:.4">:</span><span class="n" id="sB">0</span><span style="color:${b.color}">${esc(b.short)}</span></div>
  <div id="sub"><span class="bell">🔔</span><span class="btn" id="subBtn">${arabic ? "اشترك" : "Subscribe"}</span></div>
  <svg id="cursor" viewBox="0 0 24 24"><path d="M4 2l16 10-7 1.5L9.5 21z" fill="#fff" stroke="#000" stroke-width="1.2"/></svg>
 </div>
 <div id="badge">${brand.logo ? `<img src="${brand.logo}" />` : ""}<span>${esc(channel.brand?.handle ?? channel.name)}</span></div>
 <div id="wipe"></div>
 <div id="flash"></div>
 ${audio}
</div>
<script>
window.__timelines = window.__timelines || {};
const D = ${JSON.stringify(data)};
const TOTAL = ${total}, OUTRO = ${outro}, SPREAD = ${project.format === "short" ? 120 : 420};
const SUBSCRIBED = ${JSON.stringify(arabic ? "تم الاشتراك ✓" : "Subscribed ✓")};
const tl = gsap.timeline({ paused: true });
tl.to('#g1', { x: -120, y: 80, duration: TOTAL, ease: 'sine.inOut' }, 0);
tl.to('#g2', { x: 140, y: -60, duration: TOTAL, ease: 'sine.inOut' }, 0);
tl.to('#g3', { scale: 1.25, opacity: .8, duration: 3, yoyo: true, repeat: Math.floor(TOTAL / 3), ease: 'sine.inOut' }, 0);
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
for (let i = 0; i < 36; i++) {
  const x = rnd() * ${width}, y = ${height * 0.3} + rnd() * ${height * 0.8}, d = 8 + rnd() * 10;
  gsap.set('#pt' + i, { x, y, scale: .5 + rnd() * 1.5 });
  for (let c = 0; c * d < TOTAL; c++) {
    tl.fromTo('#pt' + i, { y }, { y: y - 420, duration: d, ease: 'none', immediateRender: false }, c * d);
    tl.fromTo('#pt' + i, { opacity: 0 }, { opacity: .45, duration: d / 2, yoyo: true, repeat: 1, ease: 'sine.inOut', immediateRender: false }, c * d);
  }
}
// The intro: a flash, both products slam into the middle, VS hits with a shake.
const dir = ${arabic ? 1 : -1};
tl.fromTo('#flash', { opacity: .9 }, { opacity: 0, duration: .6 }, 0);
tl.fromTo('#pA', { x: dir * 700, rotation: 12, opacity: 0 }, { x: -dir * SPREAD, rotation: -6, opacity: 1, duration: .8, ease: 'power4.out' }, .1);
tl.fromTo('#pB', { x: -dir * 700, rotation: -12, opacity: 0 }, { x: dir * SPREAD, rotation: 6, opacity: 1, duration: .8, ease: 'power4.out' }, .2);
tl.fromTo('#vs', { scale: 4, opacity: 0 }, { scale: 1, opacity: 1, duration: .45, ease: 'power4.in' }, .75);
tl.fromTo('#stage', { x: -14 }, { x: 0, duration: .5, ease: 'elastic.out(1.2,0.2)' }, 1.2);
tl.to('#vs', { rotation: 360, duration: 1.2, ease: 'power2.inOut' }, D[0].start + 3);
tl.fromTo('#hook', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: .5, ease: 'back.out(2)' }, D[0].start + Math.min(4.2, D[0].dur * .45));
const first = D.length > 1 ? D[1].start : OUTRO;
tl.to('#hook', { opacity: 0, y: -30, duration: .3 }, first - .7);
tl.to(['#pA', '#pB'], { x: 0, rotation: 0, duration: .7, ease: 'power3.inOut' }, first - .6);
tl.to('#vs', { scale: 0, opacity: 0, duration: .5, ease: 'back.in(2)' }, first - .6);
tl.fromTo('#score', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: .4 }, first);
tl.fromTo('.phone .nm', { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: .4, stagger: .1 }, first - .1);
['#pA img', '#pB img'].forEach((p, i) => tl.to(p, { y: -16, rotation: i ? 1.5 : -1.5, duration: 2.2 + i * .3, yoyo: true, repeat: Math.floor(TOTAL / 2.2), ease: 'sine.inOut' }, 1.5));
let pose = null, sa = 0, sb = 0;
D.forEach((s, k) => {
  const end = s.start + s.dur;
  if (k > 0) tl.fromTo('#wipe', { left: '-80%' }, { left: '120%', duration: .55, ease: 'power2.inOut', immediateRender: false }, s.start - .55);
  if (s.title) {
    tl.fromTo('#tt' + k, { opacity: 0, scale: 1.3 }, { opacity: 1, scale: 1, duration: .35, ease: 'back.out(2)' }, s.start - .25);
    tl.from('#tt' + k + ' i', { scaleX: 0, duration: .45, ease: 'power3.out' }, s.start);
    if (k < D.length - 1) tl.to('#tt' + k, { opacity: 0, duration: .2 }, end + .2);
  }
  if (s.rows.length) {
    tl.fromTo('#sec' + k, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: .35, ease: 'power2.out' }, s.start - .1);
    s.rows.forEach((at, r) => {
      const row = '#tb' + k + ' .row:nth-child(' + (r + 1) + ')';
      tl.fromTo(row, { opacity: 0, x: 60 * dir }, { opacity: 1, x: 0, duration: .3, ease: 'power2.out' }, at);
      const w = s.wins[r];
      if (!w) return;
      const mark = document.querySelector(row + ' .win');
      if (mark) tl.from(mark, { scale: 0, rotation: -90, duration: .4, ease: 'back.out(3)' }, at + .35);
      const ph = w === 'a' ? '#pA' : '#pB';
      tl.fromTo(ph + ' .halo', { opacity: 0, scale: .6 }, { opacity: 1, scale: 1.1, duration: .35, yoyo: true, repeat: 1, ease: 'power2.out', immediateRender: false }, at + .35);
      tl.fromTo(ph + ' img', { scale: 1 }, { scale: 1.06, duration: .2, yoyo: true, repeat: 1, immediateRender: false }, at + .35);
      const id = w === 'a' ? '#sA' : '#sB';
      tl.set(id, { textContent: w === 'a' ? ++sa : ++sb }, at + .45);
      tl.fromTo(id, { scale: 1.9, color: '${accent}' }, { scale: 1, color: '#fff', duration: .45, ease: 'back.out(3)', immediateRender: false }, at + .45);
    });
    if (k < D.length - 1) tl.to('#sec' + k, { opacity: 0, y: -30, duration: .25 }, end + .2);
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
// The close: the last table makes room and a cursor clicks subscribe.
tl.to('#sec' + (D.length - 1), { opacity: 0, duration: .3 }, OUTRO - .2);
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
export function chapters(project: Project, introLabel: string): string {
  const { scenes } = placeVersus(project);
  return chapterList(scenes.map((scene) => ({ start: scene.start, title: scene.visual.title })), timingOf(project).gap, introLabel);
}

/** Chapter lines from placed scenes: the first at 0:00, the others just before their scene starts. */
export function chapterList(scenes: { start: number; title: string }[], gap: number, introLabel: string): string {
  const stamp = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  return scenes.map((scene, index) => `${stamp(index === 0 ? 0 : scene.start - gap)} ${scene.title || introLabel}`).join("\n");
}
