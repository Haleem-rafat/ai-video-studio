// Shared by the story reels (diagram, editorial): easing, the line being said, Arabic/Latin word
// pieces, scene windows and the scene pictures each look draws (layers, bars, quote, follow card…).
const R = window.REEL;

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const ease = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
export const out3 = (v) => 1 - Math.pow(1 - clamp(v), 3);
export const back = (v) => { v = clamp(v); const s = 1.7; return 1 + (s + 1) * Math.pow(v - 1, 3) + s * Math.pow(v - 1, 2); };
export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
export const media = (file) => `/job/${file}`;
export const ARABIC = /[؀-ۿ]/;
export const bare = (word) => String(word).replace(/[.,!?؟،:؛"'«»…()]+/g, "").toLowerCase();

/** Splits a و/ب/ل/ف glued to a Latin word or number ("وM6" → "و" + "M6"), so each part keeps its direction. */
const unglue = (word) => {
  const m = /^([وبلف]ـ?)([A-Za-z0-9$₹€£].*)$/.exec(word);
  return m ? [m[1], m[2]] : [word];
};

/** Words grouped so a run of Latin words/numbers stays one left-to-right piece inside Arabic. */
export function pieces(text) {
  const out = [];
  for (const word of String(text).split(/\s+/).filter(Boolean).flatMap(unglue)) {
    const arabic = ARABIC.test(word), last = out[out.length - 1];
    if (!arabic && last && !last.arabic) last.text += " " + word;
    else out.push({ text: word, arabic });
  }
  return out;
}

/** Text with each Latin/number run isolated left to right, so "iPad Air بـ $749" keeps its order. */
export const mixed = (text) => pieces(text ?? "").map((p) => (p.arabic ? esc(p.text) : `<bdi dir="ltr">${esc(p.text)}</bdi>`)).join(" ");

export const subs = R.subs ?? [];
export const lineAt = (t) => { let at = -1; subs.forEach((s, i) => { if (s.start <= t) at = i; }); return at; };
export const keysOf = (sub) => String(sub?.key ?? "").split(/\s+/).map(bare).filter(Boolean);
export const isKey = (piece, key) => key.length > 0 && piece.text.split(/\s+/).some((w) => key.includes(bare(w)));

/** How much of a line has been said (0–1), from Whisper's word times when there are any. */
export function spoken(sub, t) {
  if (t >= sub.end) return 1;
  const words = sub.words ?? [];
  if (!words.length) return clamp((t - sub.start) / Math.max(0.1, sub.end - sub.start));
  let n = 0;
  for (const w of words) n += w.end <= t ? 1 : w.start < t ? (t - w.start) / Math.max(0.05, w.end - w.start) : 0;
  return clamp(n / words.length);
}

/** Scenes with the window they own: from their first line to the next scene's start. */
export const scenes = (R.scenes ?? []).map((s, i, all) => ({ ...s, from: i === 0 ? 0 : s.start, to: all[i + 1]?.start ?? R.duration }));
export const sceneAt = (t) => { let at = 0; scenes.forEach((s, i) => { if (t >= s.from) at = i; }); return at; };

/** A number inside a value ("$2,899" → 2899) and the value with that number at `p` of the way (counting up). */
export function counting(value, p) {
  const m = /[\d][\d,]*(\.\d+)?/.exec(String(value));
  if (!m) return String(value);
  const n = Number(m[0].replace(/,/g, ""));
  const decimals = m[1] ? m[1].length - 1 : 0;
  const now = n * p;
  const shown = decimals ? now.toFixed(decimals) : Math.round(now).toLocaleString("en-US").replace(/,/g, m[0].includes(",") ? "," : "");
  return String(value).replace(m[0], shown);
}

/** The channel's follow card: its picture (a cartoon avatar is cropped to the head), name, handle and a Follow button that turns to Following. */
export function followCard(cls = "") {
  const face = /avatar|mascot/.test(R.logo ?? "");
  const logo = R.logo ? `<img src="${media(R.logo)}">` : `<b>${esc((R.handle ?? "?").replace("@", "").slice(0, 1).toUpperCase())}</b>`;
  return `<div class="follow ${cls}"><div class="logo${face ? " face" : ""}">${logo}</div><div class="who"><strong>${esc(R.channel ?? "")}</strong><bdi dir="ltr">${esc(R.handle ?? "")}</bdi></div><div class="fbtn"><span class="a">Follow</span><span class="b">Following ✓</span></div></div>`;
}

/** Resolves once an image has loaded (decode() never settles in a background tab). */
export function loaded(img) {
  if (img.complete && img.naturalWidth) return Promise.resolve();
  return new Promise((ok) => { img.addEventListener("load", ok, { once: true }); img.addEventListener("error", ok, { once: true }); });
}

export const fontsReady = () => Promise.all([
  document.fonts.load('900 60px "Cairo"', "عربي"),
  document.fonts.load('800 60px "Inter"', "Aa"),
  document.fonts.load('500 30px "JetBrains Mono"', "Aa"),
  ...[...document.images].map(loaded),
]);

/** Sound cues every story reel shares: a whoosh per scene, pops for pieces, a sting on stamps. */
export function baseEvents(extra = () => []) {
  const out = [{ t: 0.02, kind: "whoosh" }];
  scenes.forEach((s, i) => {
    if (i > 0) out.push({ t: s.from - 0.06, kind: "whoosh" });
    if (s.kind === "stamp") out.push({ t: s.from + 0.25, kind: "sting" });
    if (s.kind === "price") for (let k = 0.2; k < 1.2; k += 0.08) out.push({ t: s.from + k, kind: "tick" });
    if (s.kind === "follow") out.push({ t: s.from + 1.4, kind: "click" });
    (s.specs ?? []).forEach((_, j) => out.push({ t: s.from + 0.35 + j * 0.22, kind: "pop" }));
    (s.layers ?? []).forEach((_, j) => out.push({ t: s.from + 0.5 + j * 0.3, kind: "tick" }));
    out.push(...extra(s, i));
  });
  return out;
}
