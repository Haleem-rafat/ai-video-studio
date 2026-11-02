// Sketch explainer reel (after bang-motion's sketchbook explainer): a notebook page where every phrase
// adds one more thing to the scene instead of replacing it. Paper notes slide in and get taped down, a
// marker circles the big number or word and draws an arrow to it, the highlighter passes over the key
// word, and everything boils a little (a new hand-drawn wobble every 4 frames) so it never looks frozen.
import { clamp, ease } from "../lib/story.js";
import { startLook } from "../lib/scenes.js";

const $ = (id) => document.getElementById(id);
const out = (v) => 1 - Math.pow(1 - clamp(v), 3);
let boil = 0;
/** A small fixed wobble for this element on the current boil step. */
const wobble = (seed, size = 1) => {
  const r = Math.sin((boil + 1) * 12.9898 + seed * 78.233) * 43758.5453;
  return (r - Math.floor(r) - 0.5) * size;
};
// From the element's place in the page, so every render tab gives it the same wobble.
const seedOf = (el) => (el.dataset.seed ??= String([...document.querySelectorAll("*")].indexOf(el) % 97));

// A marker loop around a box (x, y, w, h), a little open, like a quick hand circle.
const loop = (x, y, w, h) => {
  const cx = x + w / 2, cy = y + h / 2, rx = w / 2 + 40, ry = h / 2 + 30;
  let d = "";
  for (let a = 0; a <= 380; a += 12) {
    const r = (a * Math.PI) / 180, k = 1 + 0.04 * Math.sin(a / 25);
    d += `${a ? "L" : "M"}${(cx + Math.cos(r) * rx * k).toFixed(1)} ${(cy + Math.sin(r) * ry * k).toFixed(1)} `;
  }
  return d;
};
let marked = null;

startLook({
  T: 0.5,
  itemTime: 0.5,
  chunk: 4,
  icons: { choice: ["☝️", "✌️"] },
  frame(t, frame, scene, current) {
    boil = Math.floor(frame / 4);
    $("d1").style.transform = `rotate(${wobble(1, 3)}deg)`;
    $("d2").style.transform = `rotate(${wobble(2, 6) + t * 3}deg)`;
    // The marker circles the scene's big thing (a number, a stamp, the price, the last choice).
    const m = $("m");
    const target = document.querySelector(`.scene:nth-child(${current + 1}) :is(.point .mark, .stamp, .price, .opt.b, .sticker)`);
    const since = scene ? t - scene.from : 0;
    if (target && since > 0.5) {
      if (marked !== target) {
        const box = target.getBoundingClientRect();
        m.setAttribute("d", loop(box.left, box.top, box.width, box.height));
        marked = target;
      }
      const length = m.getTotalLength();
      m.style.strokeDasharray = `${length}`;
      m.style.strokeDashoffset = `${length * (1 - ease((since - 0.5) / 0.6))}`;
      m.style.opacity = String(1 - clamp((since - (scene.to - scene.from) + 0.3) / 0.3));
      m.style.transform = `translate(${wobble(3, 3)}px, ${wobble(4, 3)}px)`;
    } else {
      m.style.opacity = "0";
    }
  },
  // A page turn: the old page slides off to the left, the new things are added on the clean page.
  scene(el, enter, leave) {
    el.style.opacity = String(1 - clamp(leave * 1.4));
    el.style.transform = `translateX(${-ease(leave) * 1100}px) rotate(${-ease(leave) * 6}deg)`;
  },
  item(el, p) {
    const s = out(p), seed = Number(seedOf(el));
    el.style.opacity = p > 0 ? String(clamp(p * 3)) : "0";
    // Slides in from below like a note put down, then sits with the boil wobble.
    el.style.translate = `${wobble(seed, 4)}px ${(1 - s) * 90 + wobble(seed + 5, 4)}px`;
    el.style.rotate = `${(1 - s) * (seed % 2 ? 6 : -6) + wobble(seed + 9, 1.2)}deg`;
  },
  word(el, p, key, since) {
    const s = out(p), seed = (el.dataset.j ?? 0) * 7;
    el.style.opacity = String(clamp(p * 2));
    el.style.transform = `translateY(${(1 - s) * 14 + wobble(seed, 3)}px) rotate(${wobble(seed + 3, 1.5)}deg)`;
    if (key) el.style.setProperty("--hlw", `${ease((since - 0.15) / 0.45) * 100}%`);
  },
  stamp(el, since) {
    const s = out(since / 0.4);
    el.style.opacity = String(clamp(since / 0.15));
    el.style.transform = `scale(${1.25 - 0.25 * s}) rotate(${-5 + wobble(7, 2)}deg)`;
  },
  grow: (v) => out(v),
  events(s) {
    const out = [];
    if (["point", "stamp", "price", "choice"].includes(s.kind)) out.push({ t: s.from + 0.5, kind: "scribble" });
    (s.layers ?? []).forEach((_, j) => out.push({ t: s.from + 0.3 + j * 0.3, kind: "scribble" }));
    (s.specs ?? []).forEach((_, j) => out.push({ t: s.from + 0.35 + j * 0.22, kind: "scribble" }));
    return out;
  },
});
