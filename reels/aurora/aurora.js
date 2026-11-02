// Aurora glass reel: four or five blurred colour lights drift slowly on deep indigo, frosted glass cards
// float over them. Everything breathes on sine curves; pieces only fade in and rise 8 px, so the look
// stays slow and expensive. The brand accent leads the lights.
import { clamp } from "../lib/story.js";
import { startLook } from "../lib/scenes.js";

const $ = (id) => document.getElementById(id);
const sine = (v) => 0.5 - Math.cos(Math.PI * clamp(v)) / 2;

// Each light loops on its own slow path (period in seconds, centre, reach).
const LIGHTS = [
  { period: 26, x: 120, y: 260, rx: 260, ry: 200, phase: 0 },
  { period: 34, x: 520, y: 1180, rx: 300, ry: 260, phase: 1.7 },
  { period: 30, x: -80, y: 1500, rx: 220, ry: 240, phase: 3.1 },
  { period: 38, x: 560, y: 380, rx: 240, ry: 300, phase: 4.4 },
  { period: 22, x: 300, y: 820, rx: 340, ry: 180, phase: 2.2 },
];

startLook({
  T: 0.7,
  itemTime: 0.7,
  chunk: 5,
  icons: { choice: ["✦", "◎"] },
  frame(t, frame) {
    LIGHTS.forEach((l, i) => {
      const a = (t / l.period) * Math.PI * 2 + l.phase;
      $(`b${i}`).style.transform = `translate(${l.x + Math.cos(a) * l.rx}px, ${l.y + Math.sin(a * 1.3) * l.ry}px) scale(${1 + 0.08 * Math.sin(a * 0.7)})`;
    });
    $("noise").style.transform = `translate(${(frame * 37) % 60 - 30}px, ${(frame * 53) % 60 - 30}px)`;
  },
  // Cards drift up out of the blur and sink back into it.
  scene(el, enter, leave) {
    const p = sine(enter), q = sine(leave);
    el.style.opacity = String(Math.min(p, 1 - q));
    el.style.filter = p < 1 || q > 0 ? `blur(${(1 - p) * 18 + q * 18}px)` : "none";
    el.style.transform = `translateY(${(1 - p) * 60 - q * 40}px) scale(${0.97 + 0.03 * p + 0.02 * q}) rotateX(${(1 - p) * 8}deg)`;
  },
  item(el, p, since) {
    const s = sine(p);
    el.style.opacity = String(s);
    // A slow float once in, so a held card is never still.
    el.style.transform = `translateY(${(1 - s) * 8 + Math.sin(since * 1.1) * 4}px)`;
  },
  word(el, p, key) {
    const s = sine(p);
    el.style.opacity = String(s);
    el.style.transform = `translateY(${(1 - s) * 8}px)`;
    el.style.filter = s < 1 ? `blur(${(1 - s) * 6}px)` : "none";
  },
  stamp(el, since) {
    const s = sine(since / 0.8);
    el.style.opacity = String(s);
    el.style.transform = `scale(${0.92 + 0.08 * s + 0.01 * Math.sin(since * 2)})`;
  },
  grow: (v) => sine(v),
});
