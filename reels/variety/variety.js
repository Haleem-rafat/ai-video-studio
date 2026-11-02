// Variety captions reel: TV variety-show caption art on sun-yellow rays. Pieces pop 0 → 1.15 → 1 in about
// 8 frames with a slight turn and keep a small wiggle while they hold; each word of the line bounces in
// two frames after the one before. Stamps and big numbers sit in burst frames, with boings and dings.
import { clamp } from "../lib/story.js";
import { startLook } from "../lib/scenes.js";

const $ = (id) => document.getElementById(id);
/** 0 → 1.15 → 1 */
const pop = (v) => { v = clamp(v); return v < 0.6 ? 1.15 * (v / 0.6) ** 0.8 : 1.15 - 0.15 * ((v - 0.6) / 0.4); };
const wiggle = (since, seed) => Math.sin(since * 5 + seed) * 1.6;

startLook({
  T: 0.22,
  itemTime: 0.27,
  chunk: 4,
  icons: { choice: ["👍", "🤔"] },
  frame(t, frame, scene) {
    $("rays").style.transform = `rotate(${t * 6}deg)`;
    // The sparkles twinkle; the drop slides down when the scene is a mistake or a catch.
    $("d1").style.transform = `scale(${0.8 + 0.3 * Math.abs(Math.sin(t * 3))}) rotate(${t * 40}deg)`;
    $("d2").style.transform = `scale(${0.8 + 0.3 * Math.abs(Math.sin(t * 3 + 1.4))}) rotate(${-t * 30}deg)`;
    const since = scene ? t - scene.from : 0;
    $("d3").style.opacity = scene && ["point", "stamp", "chat"].includes(scene.kind) ? "1" : "0";
    $("d3").style.transform = `translateY(${(since % 1.6) * 30}px)`;
  },
  // A quick punch-in cut: the new scene snaps in big, the old one is flung away.
  scene(el, enter, leave, s, i) {
    const p = pop(enter);
    el.style.opacity = String(leave > 0 ? 1 - leave : clamp(enter * 3));
    el.style.transform = leave > 0 ? `translateX(${(i % 2 ? 1 : -1) * leave * 1200}px) rotate(${(i % 2 ? 1 : -1) * leave * 14}deg)` : `scale(${p})`;
  },
  item(el, p, since) {
    el.style.opacity = String(clamp(p * 4));
    el.style.transform = p <= 0 ? "scale(0)" : `scale(${pop(p)}) rotate(${(1 - clamp(p)) * -8 + (p >= 1 ? wiggle(since, el.textContent.length) : 0)}deg)`;
  },
  word(el, p, key, since) {
    el.style.opacity = String(clamp(p * 4));
    el.style.transform = `scale(${pop(p)}) translateY(${(1 - clamp(p)) * -40}px) rotate(${key && p >= 1 ? Math.sin(since * 6) * 3 : 0}deg)`;
  },
  stamp(el, since) {
    const p = since / 0.27;
    el.style.opacity = String(clamp(p * 3));
    el.style.transform = `scale(${p < 1 ? pop(p) * 1.05 : 1 + 0.03 * Math.sin(since * 9)}) rotate(${-6 + wiggle(since, 2)}deg)`;
  },
  grow: (v) => pop(v) / 1.0,
  events(s) {
    const out = [];
    if (s.kind === "point" || s.kind === "stamp") out.push({ t: s.from + 0.05, kind: "boing" });
    if (s.kind === "choice") out.push({ t: s.from + 0.3, kind: "ding" }, { t: s.from + 0.55, kind: "ding" });
    if (s.kind === "hook") out.push({ t: 0.1, kind: "boing" });
    (s.layers ?? []).forEach((_, j) => out.push({ t: s.from + 0.3 + j * 0.3, kind: "pop" }));
    return out;
  },
});
