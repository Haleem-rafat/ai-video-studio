// Diagram reel: a calm explainer on charcoal. A headline with a gold punch phrase opens it; each
// scene puts one picture in the middle (a floating press photo, an exploded stack of layers, a
// press quote, a stamp, a price tag, bars, spec chips, a choice, the follow card) and the word
// being said right now stands under it, alone and big, the key word in gold.
import { back, baseEvents, clamp, ease, esc, mixed, followCard, fontsReady, isKey, keysOf, lineAt, loaded, media, out3, pieces, sceneAt, scenes, spoken, subs, counting } from "../lib/story.js";

const R = window.REEL;
const $ = (id) => document.getElementById(id);
const T = 0.4; // scene transitions
const root = document.documentElement.style;
if (R.accent) root.setProperty("--accent", R.accent);
if (R.highlight) root.setProperty("--gold", R.highlight);
$("handle").innerHTML = `<b></b>${esc(R.handle ?? "")}`;

// ---- headline ---------------------------------------------------------------
const headline = (() => {
  const text = R.headline?.text ?? "", hl = R.headline?.highlight ?? "";
  const part = (s, cls = "") => pieces(s).map((p) => `<span class="${cls}${p.arabic ? "" : " lat"}"${p.arabic ? "" : ' dir="ltr"'}>${esc(p.text)}</span>`).join(" ");
  const at = hl ? text.indexOf(hl) : -1;
  return at < 0 ? part(text) + (hl ? `<br>${part(hl, "hl")}` : "") : `${part(text.slice(0, at))} ${part(hl, "hl")} ${part(text.slice(at + hl.length))}`;
})();
$("headline").innerHTML = headline;

// ---- scenes -----------------------------------------------------------------
function build(s) {
  const el = document.createElement("div");
  el.className = "scene";
  // The 3D reel draws its own picture scenes (reels/3d).
  switch (window.DEPTH?.owns(s.kind) ? "" : s.kind) {
    case "hook":
    case "photo":
      el.innerHTML = s.media
        ? `<div class="device"><img src="${media(s.media)}"><div class="scan"></div></div><i class="brk a"></i><i class="brk b"></i><i class="brk c"></i><i class="brk d"></i>${s.label && s.kind === "photo" ? `<div class="tag">${mixed(s.label)}</div>` : ""}`
        : "";
      break;
    case "layers": {
      const layers = (s.layers ?? []).slice(0, 6);
      el.innerHTML = `<div class="stack">${layers.map(() => `<div class="slab"></div>`).join("")}</div><div class="labels">${layers.map((name) => `<div class="tag">${mixed(name)}</div>`).join("")}</div>`;
      break;
    }
    case "quote": {
      const q = s.quote ?? { source: "", text: "", highlight: "" };
      const at = q.highlight ? q.text.indexOf(q.highlight) : -1;
      const body = at < 0 ? mixed(q.text) : `${mixed(q.text.slice(0, at))} <mark>${mixed(q.highlight)}</mark> ${mixed(q.text.slice(at + q.highlight.length))}`;
      el.innerHTML = `<div class="quote"><div class="src">${esc(q.source)}</div><p>${body}</p></div>`;
      break;
    }
    case "stamp":
      el.innerHTML = `<div class="stamp">${mixed(s.stamp ?? "")}</div>`;
      break;
    case "price":
      el.innerHTML = `<div class="price"><div class="v">${esc(s.price?.value ?? "")}</div><div class="l">${mixed(s.price?.label ?? "")}</div></div>`;
      break;
    case "bars": {
      const bars = (s.bars ?? []).slice(0, 3);
      el.innerHTML = `<div class="bars">${bars.map((b, i) => `<div class="bar${i === bars.length - 1 ? " last" : ""}"><div class="val">${esc(b.shown)}</div><div class="col"></div><div class="name">${mixed(b.label)}</div></div>`).join("")}${s.delta ? `<div class="delta">${esc(s.delta)}</div>` : ""}</div>`;
      break;
    }
    case "specs":
      el.innerHTML = `<div class="specs">${(s.specs ?? []).slice(0, 5).map((x) => `<div class="spec">${mixed(x)}</div>`).join("")}</div>`;
      break;
    case "choice": {
      const [a, b] = s.choice ?? ["", ""];
      el.innerHTML = `<div class="choice"><div class="opt a"><i>👍</i>${mixed(a)}</div><div class="opt b"><i>🤔</i>${mixed(b)}</div></div>`;
      break;
    }
    case "follow":
      el.innerHTML = followCard();
      break;
  }
  $("stage").append(el);
  return {
    el,
    device: el.querySelector(".device"),
    img: el.querySelector(".device img"),
    scan: el.querySelector(".scan"),
    tag: el.querySelector(":scope > .tag"),
    brk: [...el.querySelectorAll(".brk")],
    slabs: [...el.querySelectorAll(".slab")],
    labels: [...el.querySelectorAll(".labels .tag")],
    mark: el.querySelector("mark"),
    stamp: el.querySelector(".stamp"),
    price: el.querySelector(".price .v"),
    cols: [...el.querySelectorAll(".bar .col")],
    vals: [...el.querySelectorAll(".bar .val")],
    delta: el.querySelector(".delta"),
    specs: [...el.querySelectorAll(".spec")],
    opts: [...el.querySelectorAll(".opt")],
    follow: el.querySelector(".follow"),
    fbtn: el.querySelector(".fbtn"),
  };
}
const nodes = scenes.map(build);
const maxBar = (s) => Math.max(1, ...(s.bars ?? []).map((b) => b.value));

// ---- the word being said ------------------------------------------------------
const linePieces = subs.map((sub) => pieces(sub.text ?? ""));
let shownWord = "";

async function render(frame) {
  const t = frame / R.fps;
  const current = sceneAt(t);
  $("count").textContent = scenes.length ? `${String(current + 1).padStart(2, "0")} / ${String(scenes.length).padStart(2, "0")}` : "";
  $("grain").style.transform = `translate(${(frame * 37) % 50 - 25}px, ${(frame * 53) % 50 - 25}px)`;

  // Headline: through the first scene, then it rises away.
  const first = scenes[1]?.from ?? R.duration;
  const hIn = out3(t / 0.5), hOut = ease((t - first + 0.2) / T);
  $("headline").style.opacity = String(Math.min(hIn, 1 - hOut));
  $("headline").style.transform = `translateY(${(1 - hIn) * 40 - hOut * 60}px)`;

  scenes.forEach((s, i) => {
    const n = nodes[i];
    const visible = t >= s.from - 0.01 && t < s.to + T;
    n.el.style.display = visible ? "flex" : "none";
    if (!visible) return;
    const enter = i === 0 ? out3(t / T) : ease((t - s.from) / T), leave = i === scenes.length - 1 ? 0 : ease((t - s.to) / T);
    const since = t - s.from, span = Math.max(1, s.to - s.from), k = clamp(since / span);
    n.el.style.opacity = String(Math.min(enter, 1 - leave));
    n.el.style.filter = enter < 1 || leave ? `blur(${(1 - enter) * 14 + leave * 18}px)` : "none";
    n.el.style.transform = `translateY(${(1 - enter) * 60}px) scale(${(0.9 + 0.1 * enter) * (1 + 0.12 * leave)})`;

    if (n.device) {
      const tall = n.img.naturalWidth && n.img.naturalHeight > n.img.naturalWidth * 1.05;
      n.device.classList.toggle("tall", Boolean(tall));
      n.device.style.transform = `rotateY(${-14 + 22 * ease(k)}deg) rotateX(${6 - 4 * k}deg)`;
      n.img.style.transform = `scale(${1.04 + 0.08 * k})`;
      n.scan.style.top = `${-140 + ((since * 260) % 900)}px`;
      n.scan.style.opacity = String(0.6 * (1 - clamp((since - 1.6) / 0.5)));
      const box = n.device.getBoundingClientRect(), stage = n.el.getBoundingClientRect();
      n.brk.forEach((b, j) => {
        const p = out3((since - 0.2) / 0.5);
        const x = j % 2 ? box.right - stage.left - 36 : box.left - stage.left - 24, y = j < 2 ? box.top - stage.top - 24 : box.bottom - stage.top - 36;
        b.style.left = `${x + (j % 2 ? 1 : -1) * (1 - p) * 40}px`; b.style.top = `${y + (j < 2 ? -1 : 1) * (1 - p) * 40}px`;
        b.style.right = "auto"; b.style.bottom = "auto"; b.style.opacity = String(p);
      });
      if (n.tag) {
        const p = back((since - 0.6) / 0.4);
        n.tag.style.left = `${box.right - stage.left - 300}px`; n.tag.style.top = `${box.top - stage.top - 70}px`;
        n.tag.style.opacity = String(clamp((since - 0.6) / 0.2)); n.tag.style.transform = `scale(${0.7 + 0.3 * p})`;
      }
    }

    if (n.slabs.length) {
      // The stack spreads apart, then each layer lights up in turn while it is talked about.
      const spread = ease((since - 0.2) / 1.2);
      const count = n.slabs.length;
      const on = Math.min(count - 1, Math.floor(clamp((since - 1.2) / Math.max(1, span - 1.6)) * count));
      const stageBox = n.el.getBoundingClientRect();
      n.slabs.forEach((slab, j) => {
        const z = (count - 1 - j) * (16 + 100 * spread) - (count - 1) * (8 + 50 * spread);
        slab.style.transform = `translateZ(${z}px)`;
        slab.classList.toggle("on", since > 1.2 && j === on);
        const label = n.labels[j], box = slab.getBoundingClientRect();
        const p = out3((since - 0.5 - j * 0.3) / 0.35);
        label.style.top = `${box.top + box.height / 2 - stageBox.top - 28}px`;
        label.style.opacity = String(p * (since > 1.2 && j !== on ? 0.55 : 1));
        label.style.transform = `translateX(${(1 - p) * 40}px)`;
        label.style.borderColor = since > 1.2 && j === on ? "var(--accent)" : "";
      });
    }

    if (n.mark) n.mark.style.setProperty("--u", `${ease((since - 0.6) / 0.7) * 100}%`);
    if (n.stamp) {
      const p = since / 0.28;
      const shake = since > 0.28 && since < 0.6 ? Math.sin(since * 90) * 10 * (1 - (since - 0.28) / 0.32) : 0;
      n.stamp.style.transform = `translateX(${shake}px) rotate(-7deg) scale(${p < 1 ? 2.6 - 1.6 * ease(p) : 1 + 0.012 * (since - 0.28)})`;
      n.stamp.style.opacity = String(clamp(p * 1.5));
    }
    if (n.price) n.price.textContent = counting(s.price?.value ?? "", ease((since - 0.15) / 1.05));
    n.cols.forEach((col, j) => {
      const p = ease((since - 0.3 - j * 0.35) / 0.8);
      col.style.height = `${12 + (s.bars[j].value / maxBar(s)) * 420 * p}px`;
      n.vals[j].style.opacity = String(clamp((since - 0.8 - j * 0.35) / 0.25));
    });
    if (n.delta) {
      const at = 0.6 + n.cols.length * 0.35 + 0.4;
      n.delta.style.opacity = String(clamp((since - at) / 0.1));
      n.delta.style.transform = `rotate(8deg) scale(${since < at ? 0 : 0.4 + 0.6 * back((since - at) / 0.35)})`;
    }
    n.specs.forEach((spec, j) => {
      const p = back((since - 0.35 - j * 0.22) / 0.4);
      spec.style.opacity = String(clamp((since - 0.35 - j * 0.22) / 0.15));
      spec.style.transform = `translateY(${(1 - p) * -50}px) scale(${0.9 + 0.1 * p})`;
    });
    n.opts.forEach((opt, j) => {
      const p = back((since - 0.3 - j * 0.25) / 0.45);
      opt.style.transform = `scale(${0.6 + 0.4 * p}) rotate(${(j ? 4 : -4) * (1 - clamp(since - 1.5))}deg)`;
      opt.style.opacity = String(clamp((since - 0.3 - j * 0.25) / 0.15));
    });
    if (n.fbtn) {
      const done = since > 1.4;
      n.fbtn.classList.toggle("done", done);
      n.fbtn.style.transform = `scale(${since > 1.4 && since < 1.55 ? 0.9 : 1})`;
      n.fbtn.querySelector(".a").style.opacity = done ? "0" : "1";
      n.fbtn.querySelector(".b").style.opacity = done ? "1" : "0";
    }
  });
  // A red glow behind the stamp, the price and the follow card.
  const s = scenes[current];
  $("tint").style.opacity = String(s && ["stamp", "price", "follow"].includes(s.kind) ? 0.9 * out3((t - s.from) / 0.5) : 0);

  // The label of the scene sits over the word.
  $("label").innerHTML = s?.kind === "photo" || !s?.label ? "" : mixed(s.label);
  $("label").style.opacity = String(out3((t - (s?.from ?? 0) - 0.3) / 0.4));

  // One word: the piece being said now.
  const i = lineAt(t), sub = subs[i], word = $("word");
  let html = "", cls = "word", local = 1;
  if (sub && t < sub.end + 0.35) {
    const parts = linePieces[i];
    const f = spoken(sub, t) * parts.length;
    const c = Math.min(parts.length - 1, Math.floor(f));
    local = f >= parts.length ? 1 : f - c;
    const p = parts[c];
    html = esc(p.text.replace(/^[.,!?؟،:؛"«»…]+|[.,!?؟،:؛"«»…]+$/g, "") || p.text);
    cls = `word${p.arabic ? "" : " lat"}${isKey(p, keysOf(sub)) ? " key" : ""}`;
    // A long piece shrinks to fit.
    word.style.fontSize = `${Math.min(150, Math.max(80, 1500 / Math.max(6, p.text.length)))}px`;
  }
  if (html + cls !== shownWord) { word.innerHTML = html; word.className = cls; shownWord = html + cls; }
  const p = out3(local / 0.35);
  word.style.opacity = String(html ? 0.25 + 0.75 * p : 0);
  word.style.transform = `scale(${1.12 - 0.12 * p})`;
  word.style.filter = p < 1 ? `blur(${(1 - p) * 8}px)` : "none";
  $("rule").style.width = `${clamp(t / R.duration) * 100}%`;

  window.DEPTH?.render(t, current);

  const waits = nodes.filter((n) => n.img && !n.img.complete).map((n) => loaded(n.img));
  await Promise.all(waits);
}

window.reel = {
  ready: Promise.all([fontsReady(), window.DEPTH?.ready]).then(() => render(0)),
  seek: render,
  events: () => baseEvents((s) => (s.kind === "touch" ? [{ t: s.from + 1.1, kind: "pop" }] : [])),
};
