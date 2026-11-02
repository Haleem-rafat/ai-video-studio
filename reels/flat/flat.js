// Flat vector reel: each scene sits on its own flat colour field, and a circle of the next colour grows
// from where the last piece landed to carry the cut (a shape wipe). Pieces land with the classic
// three-phase bounce: a small anticipation, a stretched rise, a squash on landing, then an overshoot that
// settles. Geometric shapes keep moving around the edges, one at a time.
import { clamp } from "../lib/story.js";
import { startLook } from "../lib/scenes.js";

const R = window.REEL;
const $ = (id) => document.getElementById(id);
const css = getComputedStyle(document.documentElement);
const color = (name) => css.getPropertyValue(name).trim();
const accent = R.accent ?? color("--accent"), coral = R.accent2 ?? color("--accent2");
// Field and text colour per scene, turning through the palette; light fields take ink text.
const light = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55;
};
const on = (field) => [field, light(field) ? color("--ink") : "#fff"];
const FIELDS = [on(color("--cream")), on(accent), on(color("--sun")), [color("--ink"), color("--cream")], on(coral), on(color("--mint"))];
const fieldOf = (i) => FIELDS[i % FIELDS.length];
const overshoot = (v) => { v = clamp(v); const s = 1.56; return 1 + (s + 1) * Math.pow(v - 1, 3) + s * Math.pow(v - 1, 2); };

/** Anticipation → stretch → squash → overshoot → settle, as y offset and x/y scale for 0..1. */
function bounce(p) {
  if (p <= 0) return { y: 0, sx: 0, sy: 0 };
  if (p < 0.15) { const k = p / 0.15; return { y: 10 * k, sx: 1.06 * k, sy: 0.88 * k }; }
  if (p < 0.5) { const k = (p - 0.15) / 0.35; return { y: 10 - 70 * Math.sin(Math.PI * k), sx: 0.92, sy: 1.1 }; }
  if (p < 0.65) { const k = (p - 0.5) / 0.15; return { y: 0, sx: 1.1 - 0.06 * k, sy: 0.88 + 0.08 * k }; }
  const k = (p - 0.65) / 0.35;
  return { y: 0, sx: 1.04 - 0.04 * overshoot(k), sy: 0.96 + 0.04 * overshoot(k) };
}
const place = (el, b, extra = "") => { el.style.transform = `translateY(${b.y}px) scale(${b.sx}, ${b.sy})${extra}`; };

let shown = -1;
startLook({
  T: 0.45,
  itemTime: 0.5,
  chunk: 4,
  icons: { choice: ["✓", "?"] },
  frame(t, frame, scene, current) {
    // The cut: the old field stays behind, the new colour grows as a circle from the lower right.
    const s = scene, since = s ? t - s.from : 1;
    const [field, text] = fieldOf(current), [before] = fieldOf(Math.max(0, current - 1));
    const grow = current === 0 ? 1 : clamp(since / 0.45);
    document.body.style.background = before;
    const wipe = $("wipe");
    wipe.style.background = field;
    wipe.style.transform = `translate(${780 - 5}px, ${1300 - 5}px) scale(${Math.pow(grow, 1.6) * 470})`;
    if (shown !== current) { document.documentElement.style.setProperty("--text", text); document.documentElement.style.setProperty("--field", field); shown = current; }
    // One shape moves at a time, each on its own beat.
    for (let i = 0; i < 5; i++) {
      const beat = (t * 0.8 + i * 0.6) % 3;
      const k = clamp(beat / 0.6);
      const hop = Math.sin(Math.PI * k) * 26;
      $(`s${i}`).style.transform = `translateY(${-hop}px) rotate(${i === 3 ? t * 20 : i === 4 ? 0 : hop * 0.6}deg) scale(${1 + (beat < 0.6 ? 0.06 * Math.sin(Math.PI * k) : 0)})`;
    }
  },
  // The scene is already in place under the wipe; it only leaves with a quick drop.
  scene(el, enter, leave) {
    el.style.opacity = String(leave > 0 ? 1 - leave : clamp(enter * 4));
    el.style.transform = `translateY(${leave * 140}px)`;
  },
  item(el, p) {
    const b = bounce(p);
    el.style.opacity = p > 0 ? "1" : "0";
    place(el, b);
  },
  word(el, p) {
    const b = bounce(p);
    el.style.opacity = p > 0 ? "1" : "0";
    place(el, { ...b, y: b.y * 0.5 });
  },
  stamp(el, since) {
    const b = bounce(since / 0.5);
    el.style.opacity = since > 0 ? "1" : "0";
    place(el, b, ` rotate(${-4 * clamp(since / 0.5)}deg)`);
  },
  grow: (v) => overshoot(v),
  events(s, i) {
    const out = i > 0 ? [{ t: s.from + 0.05, kind: "boing" }] : [];
    (s.layers ?? []).forEach((_, j) => out.push({ t: s.from + 0.35 + j * 0.3, kind: "pop" }));
    if (s.kind === "point" || s.kind === "hook") out.push({ t: s.from + 0.3, kind: "pop" });
    return out;
  },
});
