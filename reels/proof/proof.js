// Viral proof reel: the top half shows the proof (real screenshots in a Mac browser window, big
// stat cards), the bottom half the channel's character at a desk, with Egyptian captions in a
// dark box, an English hook card first and a "comment the keyword" ask at the end.
const R = window.REEL;
const $ = (id) => document.getElementById(id);

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
const back = (v) => { v = clamp(v); const s = 1.9; return 1 + (s + 1) * Math.pow(v - 1, 3) + s * Math.pow(v - 1, 2); };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const ARABIC = /[؀-ۿ]/;
const bare = (word) => word.replace(/[.,!?؟،:؛"'«»…()]+/g, "").toLowerCase();

/** Splits a و/ب/ل glued to a Latin word or number ("وQwen" → "و" + "Qwen"), so each part keeps its direction. */
const unglue = (word) => {
  const m = /^([وبلف]ـ?)([A-Za-z0-9$].*)$/.exec(word);
  return m ? [m[1], m[2]] : [word];
};
/** Words grouped so a run of Latin words/numbers stays one left-to-right piece inside Arabic. */
function pieces(text) {
  const out = [];
  for (const word of String(text).split(/\s+/).filter(Boolean).flatMap(unglue)) {
    const arabic = ARABIC.test(word), last = out[out.length - 1];
    if (!arabic && last && !last.arabic) last.text += " " + word;
    else out.push({ text: word, arabic });
  }
  return out;
}

const FADE = 0.4;
const HOOK = 2.2; // the hook card's seconds on screen
const media = (file) => `/job/${file}`;

if (R.accent) document.documentElement.style.setProperty("--accent", R.accent);
$("handle").textContent = R.handle ?? "";

// ---- top: the proof -------------------------------------------------------
const scenes = R.scenes.map((s, i) => ({ ...s, from: i === 0 ? 0 : s.start, to: R.scenes[i + 1]?.start ?? R.duration }));

/** A stat's number split from its text, so it counts up and keeps "16K", "8.2M", "1,200". */
function counter(value) {
  const m = /(\d[\d,]*(?:\.\d+)?)/.exec(value);
  if (!m) return null;
  return { before: value.slice(0, m.index), after: value.slice(m.index + m[1].length), number: Number(m[1].replace(/,/g, "")), decimals: (m[1].split(".")[1] ?? "").length, commas: m[1].includes(",") };
}
const format = (c, v) => {
  let n = v.toFixed(c.decimals);
  if (c.commas) n = Number(n).toLocaleString("en-US", { minimumFractionDigits: c.decimals, maximumFractionDigits: c.decimals });
  return c.before + n + c.after;
};

const nodes = scenes.map((s) => {
  const el = document.createElement("div");
  el.className = "scene";
  el.innerHTML = `
    <div class="window">
      <div class="bar"><i></i><i></i><i></i><div class="url">${esc(s.url ?? "")}</div></div>
      <div class="page"><img src="${media(s.media)}"></div>
    </div>
    ${s.stat ? `<div class="stat"><b>${esc(s.stat.value)}</b><span>${esc(s.stat.label)}</span></div>` : ""}`;
  $("top").append(el);
  const img = el.querySelector("img");
  return { el, img, page: el.querySelector(".page"), window: el.querySelector(".window"), stat: el.querySelector(".stat"), value: el.querySelector(".stat b"), count: s.stat ? counter(s.stat.value) : null };
});

// The hook card sits over the first scene.
const hook = document.createElement("div");
hook.className = "hook";
hook.innerHTML = `<div>${esc(R.hook?.title ?? "")}</div>${R.hook?.highlight ? `<div><mark>${esc(R.hook.highlight)}</mark></div>` : ""}`;
$("top").append(hook);

// ---- bottom: the character ------------------------------------------------
const POSES = ["point", "think", "wave"];
const poseImgs = Object.fromEntries(POSES.filter((p) => R.avatar?.[p]).map((pose) => {
  const img = document.createElement("img");
  img.src = media(R.avatar[pose]);
  $("avatar").append(img);
  return [pose, img];
}));
const subs = R.subs ?? [];
const lineAt = (t) => { let at = -1; subs.forEach((s, i) => { if (s.start <= t) at = i; }); return at; };
const poseOf = (i) => (poseImgs[subs[i]?.pose] ? subs[i].pose : Object.keys(poseImgs)[i % Math.max(1, Object.keys(poseImgs).length)]);

/** How much of a line is spoken by t (0–1), by its word times when known. */
function spoken(sub, t) {
  if (t >= sub.end) return 1;
  const words = sub.words ?? [];
  if (!words.length) return clamp((t - sub.start) / Math.max(0.1, sub.end - sub.start));
  let n = 0;
  for (const w of words) n += w.end <= t ? 1 : w.start < t ? (t - w.start) / Math.max(0.05, w.end - w.start) : 0;
  return clamp(n / words.length);
}

/** A line's caption chunks: at most 6 words each, Latin runs kept whole. */
const chunks = subs.map((sub) => {
  const all = pieces(sub.text ?? "");
  const out = [];
  for (let i = 0; i < all.length; i += 6) out.push(all.slice(i, i + 6));
  return out;
});
const keysOf = (sub) => (sub.keys ?? []).flatMap((k) => k.split(/\s+/)).map(bare).filter(Boolean);
const lastLine = subs.length - 1;

$("cta").innerHTML = `اكتب <b dir="ltr">${esc(R.keyword ?? "")}</b> في الكومنتات وهبعتلك اللينك 📩`;

let shownCaption = "";
async function render(frame) {
  const t = frame / R.fps;
  const waits = [];

  // Scenes: in from the right, out to the left.
  scenes.forEach((s, i) => {
    const n = nodes[i];
    const enter = i === 0 ? 1 : ease((t - s.from) / FADE), leave = i === scenes.length - 1 ? 0 : ease((t - s.to) / FADE);
    const visible = t >= s.from && t < s.to + FADE;
    n.el.style.display = visible ? "block" : "none";
    if (!visible) return;
    n.el.style.opacity = String(Math.min(enter, 1 - leave));
    n.el.style.transform = `translateX(${(1 - enter) * 120 - leave * 120}px)`;
    const k = clamp((t - s.from) / Math.max(1, s.to - s.from + FADE));
    // Tall screenshots scroll down the page; wide ones zoom slowly.
    const tall = n.img.naturalWidth && n.img.naturalHeight / n.img.naturalWidth > 1.1;
    n.page.classList.toggle("fit", !tall);
    if (tall) {
      const travel = Math.max(0, n.img.clientHeight - n.page.clientHeight);
      n.img.style.transform = `translateY(${-travel * ease(k * 1.1) * 0.85}px)`;
    } else n.img.style.transform = `scale(${1.03 + 0.1 * k})`;
    if (n.stat) {
      const since = t - s.from - 0.6;
      n.stat.style.opacity = String(clamp(since / 0.15));
      n.stat.style.transform = `translate(-50%, -50%) scale(${since <= 0 ? 0.5 : 0.5 + 0.5 * back(since / 0.45)})`;
      n.window.style.filter = `brightness(${1 - 0.55 * clamp(since / 0.3)})`;
      if (n.count) n.value.textContent = format(n.count, n.count.number * ease(since / 0.9));
    }
  });

  // Hook card for the first seconds.
  const hookIn = back(t / 0.35), hookOut = ease((t - HOOK) / 0.3);
  hook.style.opacity = String(1 - hookOut);
  hook.style.transform = `scale(${0.7 + 0.3 * hookIn}) translateY(${-hookOut * 80}px)`;

  // Character: the line's pose, a bounce with the voice, breathing when quiet.
  const i = lineAt(t), pose = poseOf(Math.max(0, i));
  const since = i >= 0 ? t - subs[i].start : 1;
  for (const [name, img] of Object.entries(poseImgs)) img.style.opacity = name === pose ? String(clamp(since / 0.15)) : name === poseOf(Math.max(0, i - 1)) && since < 0.15 ? String(1 - since / 0.15) : "0";
  const level = R.sound.level[frame] ?? 0;
  const breath = Math.sin(t * 2.2) * 0.006;
  $("avatar").style.transform = `translateX(-50%) scale(${1 + breath - level * 0.01}, ${1 + breath + level * 0.03}) rotate(${Math.sin(t * 7) * level * 1.6}deg)`;

  // Caption: the chunk of the line being said.
  const caption = $("caption");
  const sub = subs[i];
  let html = "";
  if (sub && t < sub.end + 0.4) {
    const parts = chunks[i];
    const at = Math.min(parts.length - 1, Math.floor(spoken(sub, t) * parts.length));
    const keys = keysOf(sub);
    html = parts[at].map((p) => `<span${p.arabic ? "" : ' dir="ltr"'} class="${p.text.split(/\s+/).some((w) => keys.includes(bare(w))) ? "key" : ""}">${esc(p.text)}</span>`).join(" ");
  }
  if (html !== shownCaption) { caption.innerHTML = html; shownCaption = html; }
  // The ask replaces the caption on the last line.
  const asking = R.keyword && lastLine >= 0 && t >= subs[lastLine].start;
  caption.style.display = html && !asking ? "block" : "none";

  // The ask, on the last line.
  const cta = $("cta");
  const ctaSince = lastLine >= 0 ? t - subs[lastLine].start : -1;
  cta.style.display = R.keyword && ctaSince > 0 ? "block" : "none";
  cta.style.transform = `scale(${0.6 + 0.4 * back(ctaSince / 0.4)})`;
  cta.style.opacity = String(clamp(ctaSince / 0.15));

  for (const n of nodes) if (!n.img.complete) waits.push(loaded(n.img));
  await Promise.all(waits);
}

function events() {
  const out = [{ t: 0.02, kind: "sting" }];
  scenes.forEach((s, i) => {
    if (i > 0) out.push({ t: s.from - 0.08, kind: "whoosh" });
    if (s.stat) out.push({ t: s.from + 0.6, kind: "pop" });
  });
  if (R.keyword && lastLine >= 0) out.push({ t: subs[lastLine].start, kind: "chime" });
  return out;
}

/** Resolves once an image has loaded (decode() never settles in a background tab). */
function loaded(img) {
  if (img.complete && img.naturalWidth) return Promise.resolve();
  return new Promise((ok) => { img.addEventListener("load", ok, { once: true }); img.addEventListener("error", ok, { once: true }); });
}

window.reel = {
  ready: Promise.all([document.fonts.load('800 60px "Cairo"', "عربي"), ...[...document.images].map(loaded)]).then(() => render(0)),
  seek: render,
  events,
};
