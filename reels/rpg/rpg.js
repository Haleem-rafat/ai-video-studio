// Retro 16-bit RPG reel: HUD, quest log, scrolling code, a talking pixel portrait with Arabic
// dialogue, and a voice visualizer, on a starfield with CRT scanlines.
// One draw function per panel; every text, quest and the character come from the job JSON.
import { drawCharacter } from "./character.js";
import { draw as drawRTL, layout } from "../lib/rtl.js";

const R = window.REEL;
const canvas = document.getElementById("reel");
const ctx = canvas.getContext("2d");
const W = 1080, H = 1920, M = 48;

const C = {
  navy: "#070b1f", panel: "rgba(12, 18, 48, 0.86)", teal: "#2dd4bf", mint: "#7cffb2", purple: "#7c5cff",
  purpleDeep: "#4b33b5", gold: "#ffd34d", yellow: "#ffe94d", white: "#f4f1ff", dim: "#8a8fb8", ink: "#0b1530",
};
const PIXEL = '"Press Start 2P"', SILK = "Silkscreen", ARABIC = "Cairo", MONO = '"JetBrains Mono"';

// ---- timeline -------------------------------------------------------------

const subs = R.subs ?? [];
const quests = R.quests ?? [];
// A quest is checked as the line that covers it finishes.
const questDone = quests.map((_, q) => {
  const sub = subs.find((s) => s.questIndex === q);
  return sub ? sub.end - 0.1 : Infinity;
});
const allDone = Math.max(...questDone.filter(Number.isFinite), -Infinity);

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
const back = (v) => { v = clamp(v); const s = 2.2; return 1 + (s + 1) * Math.pow(v - 1, 3) + s * Math.pow(v - 1, 2); };

/** The line on screen at t: the last one that has started. */
const lineAt = (t) => { let at = -1; subs.forEach((s, i) => { if (s.start <= t) at = i; }); return at; };

/** How many characters of a line are typed by t, following the voice's word times when known. */
function typed(sub, t) {
  const length = sub.text.length;
  if (t >= sub.end) return length;
  const words = sub.words ?? [];
  let fraction;
  if (words.length) {
    let spoken = 0;
    for (const w of words) spoken += w.end <= t ? 1 : w.start < t ? (t - w.start) / Math.max(0.05, w.end - w.start) : 0;
    fraction = spoken / words.length;
  } else fraction = (t - sub.start) / ((sub.end - sub.start) * 0.92);
  return Math.floor(length * clamp(fraction));
}

// ---- helpers ------------------------------------------------------------

function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }

function font(size, family = PIXEL, weight = 400) { ctx.font = `${weight} ${size}px ${family}`; }

function text(str, x, y, size, color, family = PIXEL, align = "left", weight = 400) {
  font(size, family, weight);
  ctx.textAlign = align; ctx.textBaseline = "alphabetic"; ctx.fillStyle = color;
  ctx.fillText(str, x, y);
  ctx.textAlign = "left";
}

/** A dark panel with a dashed teal border, pixel corners and its debug tag. */
function panel(x, y, w, h, tag) {
  ctx.fillStyle = C.panel; ctx.fillRect(x, y, w, h);
  ctx.save();
  ctx.setLineDash([14, 8]); ctx.lineDashOffset = 0; ctx.lineWidth = 4; ctx.strokeStyle = C.teal;
  ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
  ctx.restore();
  ctx.fillStyle = C.teal;
  for (const [cx, cy] of [[x, y], [x + w - 12, y], [x, y + h - 12], [x + w - 12, y + h - 12]]) ctx.fillRect(cx, cy, 12, 12);
  if (tag) debugTag(x + w, y, tag);
}

function debugTag(right, top, label) {
  font(19, MONO, 700);
  const w = ctx.measureText(label).width + 20;
  ctx.fillStyle = C.mint; ctx.fillRect(right - w - 16, top - 15, w, 30);
  ctx.fillStyle = C.ink; ctx.fillRect(right - w - 16, top + 15, w, 3);
  text(label, right - w - 6, top + 7, 19, C.ink, MONO, "left", 700);
}

/** Pixel "staircase" rectangle: square corners cut by one step. */
function block(x, y, w, h, color, step = 6) {
  ctx.fillStyle = color;
  ctx.fillRect(x + step, y, w - 2 * step, h);
  ctx.fillRect(x, y + step, w, h - 2 * step);
}

function sparkle(x, y, size, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x - size / 2, y - size * 1.5, size, size * 3);
  ctx.fillRect(x - size * 1.5, y - size / 2, size * 3, size);
}

// ---- background -----------------------------------------------------------

const stars = (() => { const r = rng(42); return Array.from({ length: 190 }, () => ({ x: r() * W, y: r() * H, s: r() < 0.15 ? 6 : r() < 0.5 ? 4 : 2, p: r() * 6.28, v: 0.6 + r() * 1.6 })); })();
const scanlines = (() => {
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(0,0,0,0.16)";
  for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 2);
  const v = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
  v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.45)");
  g.fillStyle = v; g.fillRect(0, 0, W, H);
  return c;
})();

function drawBackground(t) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#0a1030"); g.addColorStop(1, C.navy);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (const s of stars) {
    const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.v + s.p));
    ctx.globalAlpha = a;
    ctx.fillStyle = s.s === 6 ? "#bfe9ff" : "#ffffff";
    const y = (s.y + t * 6 * s.v) % H; // slow drift
    if (s.s === 6) sparkle(Math.round(s.x), Math.round(y), 2, ctx.fillStyle);
    else ctx.fillRect(Math.round(s.x), Math.round(y), s.s, s.s);
  }
  ctx.globalAlpha = 1;
}

function drawCRT() { ctx.drawImage(scanlines, 0, 0); }

// ---- panels -------------------------------------------------------------

function drawHUD(t) {
  const x = M, y = 56, w = W - 2 * M, h = 100;
  panel(x, y, w, h, "drawHUD()");
  const levelled = t >= allDone;
  const flash = levelled && t - allDone < 1.2 && Math.floor((t - allDone) * 8) % 2 === 0;
  block(x + 22, y + 22, 150, 56, flash ? C.gold : C.purple);
  text(`LV ${(R.level ?? 1) + (levelled ? 1 : 0)}`, x + 97, y + 62, 24, flash ? C.ink : C.white, PIXEL, "center");

  // XP: creeps up with the video, and jumps 50 at a time as quests are checked.
  const checked = questDone.reduce((n, at) => n + ease((t - at) / 0.45), 0);
  const fill = clamp(0.45 * (t / R.duration) + 0.55 * (quests.length ? checked / quests.length : 0));
  const segments = 16, bx = x + 196, bw = 440, gap = 6, sw = (bw - gap * (segments - 1)) / segments;
  for (let i = 0; i < segments; i++) {
    const on = (i + 1) / segments <= fill + 1e-6;
    const part = !on && i / segments < fill;
    ctx.fillStyle = on ? (i % 2 ? C.teal : C.mint) : part ? C.purpleDeep : "#1d2454";
    ctx.fillRect(bx + i * (sw + gap), y + 34, sw, 32);
  }
  text("XP", bx + bw + 18, y + 64, 22, C.gold);
  text(R.channel ?? "", x + w - 24, y + 64, 22, C.white, SILK, "right", 700);
}

function drawQuestLog(t) {
  const x = M, y = 196, w = W - 2 * M, h = 520;
  panel(x, y, w, h, "drawQuestLog()");
  const done = questDone.filter((at) => t >= at).length;
  text("QUEST LOG", x + 36, y + 72, 34, C.gold);
  text(`${done}/${quests.length}`, x + w - 36, y + 72, 30, C.white, PIXEL, "right");
  ctx.fillStyle = "#2a3170"; ctx.fillRect(x + 36, y + 96, w - 72, 4);

  const current = questDone.findIndex((at) => t < at);
  quests.forEach((quest, i) => {
    const ry = y + 124 + i * 94, since = t - questDone[i], checked = since >= 0;
    if (i === current) {
      ctx.fillStyle = "rgba(124, 92, 255, 0.38)"; ctx.fillRect(x + 20, ry - 8, w - 40, 80);
      ctx.fillStyle = C.purple; ctx.fillRect(x + 20, ry - 8, 6, 80);
      if (Math.floor(t * 2.5) % 2 === 0) text("▶", x + 34, ry + 46, 26, C.yellow);
    }
    // Checkbox, popping when it gets checked.
    const pop = checked ? back(since / 0.35) : 1;
    const bs = 44 * (checked && since < 0.35 ? pop : 1), bx = x + 92 + (44 - bs) / 2, by = ry + 6 + (44 - bs) / 2;
    ctx.fillStyle = checked ? C.teal : "#1d2454"; ctx.fillRect(bx, by, bs, bs);
    ctx.strokeStyle = checked ? C.mint : C.dim; ctx.lineWidth = 4; ctx.strokeRect(bx + 2, by + 2, bs - 4, bs - 4);
    if (checked) { // pixel tick
      ctx.fillStyle = C.ink;
      const px = bx + bs / 2 - 14, py = by + bs / 2 - 4;
      for (const [dx, dy] of [[0, 4], [4, 8], [8, 12], [12, 8], [16, 4], [20, 0], [24, -4]]) ctx.fillRect(px + dx, py + dy, 6, 6);
    }
    if (checked && since < 0.7) { // sparkles flying out
      const k = since / 0.7;
      for (let s = 0; s < 6; s++) {
        const a = (s / 6) * 6.28 + 0.4, d = 20 + 50 * ease(k);
        ctx.globalAlpha = 1 - k; sparkle(bx + 22 + Math.cos(a) * d, by + 22 + Math.sin(a) * d, 4, s % 2 ? C.gold : C.mint);
      }
      ctx.globalAlpha = 1;
    }
    text(quest.text, x + 162, ry + 42, 22, checked ? C.dim : C.white);
    if (checked) { ctx.fillStyle = C.dim; ctx.fillRect(x + 162, ry + 32, ctx.measureText(quest.text).width, 4); }
    text(`+${quest.xp ?? 50} XP`, x + w - 36, ry + 42, 20, checked ? C.mint : C.gold, PIXEL, "right");
    if (checked && since < 1) { // "+50 XP" floating up
      ctx.globalAlpha = 1 - since;
      text(`+${quest.xp ?? 50} XP`, x + w - 36, ry + 20 - 60 * ease(since), 22, C.yellow, PIXEL, "right");
      ctx.globalAlpha = 1;
    }
  });

  if (t >= allDone && t - allDone < 1.8) { // level-up banner
    const k = t - allDone, s = back(k / 0.4);
    ctx.save(); ctx.translate(W / 2, y + h / 2); ctx.scale(s, s);
    ctx.globalAlpha = k > 1.4 ? 1 - (k - 1.4) / 0.4 : 1;
    block(-300, -60, 600, 120, C.gold, 10);
    text("LEVEL UP!", 0, 22, 48, C.ink, PIXEL, "center");
    ctx.restore(); ctx.globalAlpha = 1;
  }
}

const KEYWORDS = /^(const|let|var|function|return|if|else|for|of|in|new|import|export|from|await|async|true|false|null|undefined|while)$/;
const sourceLines = (R.codeText ?? "// no code").split("\n").map((line) => {
  const parts = [];
  const re = /(\/\/.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)(?=\s*\()|([A-Za-z_$][\w$]*)|(\s+)|(.)/g;
  for (const m of line.matchAll(re)) {
    const [s] = m;
    const color = m[1] ? "#637799" : m[2] ? "#c3e88d" : m[3] ? "#f78c6c" : m[4] ? "#82aaff" : m[5] && KEYWORDS.test(s) ? "#c792ea" : m[5] ? "#d6deeb" : m[6] ? null : "#89ddff";
    parts.push({ s, color });
  }
  return parts;
});

function drawCodePanel(t, frame) {
  const x = M, y = 776, w = W - 2 * M, h = 400;
  // The file tab sits on the panel's top edge.
  block(x + 28, y - 34, 190, 40, C.purpleDeep, 4);
  text("REEL.JS", x + 123, y - 6, 18, C.white, PIXEL, "center");
  panel(x, y, w, h, "drawCodePanel()");

  const top = y + 24, lineH = 30, rows = 10, codeH = rows * lineH;
  const scroll = t * 0.85; // lines per second
  const first = Math.floor(scroll), shift = Math.round(((scroll - first) * lineH) / 2) * 2;
  ctx.save();
  ctx.beginPath(); ctx.rect(x + 8, top, w - 32, codeH); ctx.clip();
  font(21, MONO, 500);
  for (let r = 0; r <= rows; r++) {
    const n = (first + r) % sourceLines.length, ly = top + r * lineH - shift + 22;
    if (r === 5) { ctx.fillStyle = "rgba(124, 92, 255, 0.18)"; ctx.fillRect(x + 8, ly - 22, w - 16, lineH); }
    ctx.fillStyle = "#4a5290"; ctx.textAlign = "right"; ctx.fillText(String(n + 1), x + 76, ly); ctx.textAlign = "left";
    let cx = x + 96;
    for (const part of sourceLines[n]) {
      if (part.color) { ctx.fillStyle = part.color; ctx.fillText(part.s, cx, ly); }
      cx += ctx.measureText(part.s).width;
      if (cx > x + w - 20) break;
    }
  }
  ctx.restore();
  ctx.fillStyle = "#2a3170"; ctx.fillRect(x + 88, top, 3, codeH);

  // Live frame counter.
  const digits = Math.max(4, String(R.frames).length);
  const by = top + codeH + 14;
  block(x + 24, by, 470, 54, "#151b45", 4);
  ctx.fillStyle = C.teal; ctx.fillRect(x + 24, by + 50, 470, 4);
  text(`FRAME ${String(frame).padStart(digits, "0")}/${String(R.frames).padStart(digits, "0")}`, x + 44, by + 39, 22, C.mint);
  if (Math.floor(t * 2) % 2 === 0) { ctx.fillStyle = "#ff5d7a"; ctx.fillRect(x + w - 54, by + 18, 18, 18); }
  text("REC", x + w - 66, by + 37, 18, C.dim, PIXEL, "right");
}

function drawDialogue(t, frame) {
  const x = M, y = 1236, w = W - 2 * M, h = 400;
  const index = lineAt(t), sub = subs[index];
  const face = faceAt(t, frame, sub);
  panel(x, y, w, h, `drawPortrait('${face.expression}')`);

  // Portrait in its own frame, bobbing a pixel while talking.
  const px = x + 30, py = y + 74;
  block(px, py, 272, 296, "#241a52", 6);
  ctx.strokeStyle = C.purple; ctx.lineWidth = 4; ctx.strokeRect(px + 4, py + 4, 264, 288);
  ctx.save(); ctx.beginPath(); ctx.rect(px + 8, py + 8, 256, 280); ctx.clip();
  const bob = face.open > 0.1 && Math.floor(t * 6) % 2 ? 7 : 0;
  drawCharacter(ctx, px + 8, py - 8 + bob, 8, R.character ?? {}, face);
  ctx.restore();
  // Name tag above it.
  const name = R.character?.name ?? R.channel ?? "";
  font(18, PIXEL);
  const nw = ctx.measureText(name).width + 36;
  block(px, y + 22, nw, 42, C.purple, 4);
  text(name, px + 18, y + 52, 18, C.white);

  if (!sub) return;
  // Arabic line, typed out, right to left.
  const right = x + w - 40, width = w - 340 - 40;
  let size = 46;
  let placed;
  for (; size >= 32; size -= 2) {
    font(size, ARABIC, 800);
    placed = layout(ctx, sub.text, width);
    if (placed[placed.length - 1].line < 4) break;
  }
  const lineH = Math.round(size * 1.62);
  const lines = placed[placed.length - 1].line + 1;
  const top = y + 64 + (h - 64 - lines * lineH) / 2 + size;
  const shown = typed(sub, t);
  const key = (sub.key ?? "").split(/\s+/).filter(Boolean).map(bare);
  ctx.fillStyle = C.white;
  drawRTL(ctx, placed, right, top, lineH, shown, (p, left, baseline, whole) => {
    if (whole && p.text.split(/\s+/).some((word) => key.includes(bare(word)))) {
      ctx.fillStyle = C.teal; ctx.fillRect(left, baseline + 12, p.w, 6);
      ctx.fillStyle = C.white;
    }
  });
  // "Next" arrow once the line is fully typed.
  if (shown >= sub.text.length && Math.floor(t * 3) % 2 === 0) text("▼", x + 340, y + h - 26, 22, C.yellow);
}

const bare = (word) => word.replace(/[.,!?؟،:؛"'«»…]+/g, "");

/** The portrait's face: the line's expression, a mouth that follows the voice, and blinks. */
function faceAt(t, frame, sub) {
  const speaking = sub && t < sub.end + 0.05;
  const level = R.sound.level;
  const open = speaking ? Math.max(level[frame] ?? 0, (level[frame - 1] ?? 0) * 0.6) : 0;
  const expression = sub ? (speaking ? sub.expression ?? "talk" : sub.after ?? "smile") : "smile";
  const blink = (t + 0.7) % 3.3 < 0.12;
  return { expression, open, blink };
}

function drawVisualizer(t, frame) {
  const x = M, y = 1676, w = W - 2 * M, h = 188;
  panel(x, y, w, h, "drawVisualizer()");
  const bars = R.sound.bars[frame] ?? [];
  const n = bars.length || 52, inner = w - 64, bw = 10, gap = (inner - n * bw) / (n - 1);
  const from = [139, 92, 246], to = [45, 212, 191];
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    const rgb = from.map((c, j) => Math.round(c + (to[j] - c) * k));
    const v = bars[i] ?? 0;
    const bh = Math.max(8, Math.round((v * (h - 56)) / 8) * 8); // in 8 px steps
    ctx.fillStyle = `rgb(${rgb})`;
    ctx.fillRect(Math.round(x + 32 + i * (bw + gap)), y + h - 28 - bh, bw, bh);
  }
  ctx.fillStyle = "#2a3170"; ctx.fillRect(x + 28, y + h - 24, w - 56, 4);
}

// ---- frame --------------------------------------------------------------

function render(frame) {
  const t = frame / R.fps;
  ctx.imageSmoothingEnabled = false;
  drawBackground(t);
  drawHUD(t);
  drawQuestLog(t);
  drawCodePanel(t, frame);
  drawDialogue(t, frame);
  drawVisualizer(t, frame);
  drawCRT();
}

/** Sound effects the renderer mixes in: a blip every other typed letter, a chime per quest, a fanfare at the end. */
function events() {
  const out = [];
  subs.forEach((sub) => {
    let last = 0;
    for (let f = Math.floor(sub.start * R.fps); f <= Math.ceil(sub.end * R.fps); f++) {
      const n = typed(sub, f / R.fps);
      const letters = sub.text.slice(0, n).replace(/\s/g, "").length;
      if (letters - last >= 2) { out.push({ t: f / R.fps, kind: "blip", pitch: (letters * 0.37) % 1 }); last = letters; }
    }
  });
  questDone.forEach((at) => Number.isFinite(at) && out.push({ t: at, kind: at === allDone ? "levelup" : "chime" }));
  return out;
}

const fonts = [`24px ${PIXEL}`, `20px ${SILK}`, `700 20px ${SILK}`, `800 40px ${ARABIC}`, `500 20px ${MONO}`, `700 19px ${MONO}`];
window.reel = {
  ready: Promise.all(fonts.map((f) => document.fonts.load(f, f.includes(ARABIC) ? "عربي" : "A"))).then(() => render(0)),
  seek: (frame) => render(frame),
  events,
};
