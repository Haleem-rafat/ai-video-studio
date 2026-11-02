// Editorial reel: cuts between a dark stage under a spotlight and light grid paper. The line being
// said types in at the top with its key word selected like text in an editor; under it each scene
// is a product photo in the light, a press article with the phrase highlighted, a red stamp, a big
// price, a bar chart with a price sticker, spec pills, a stack, a choice or the follow card.
import { back, baseEvents, clamp, ease, esc, mixed, followCard, fontsReady, isKey, keysOf, lineAt, loaded, media, out3, pieces, sceneAt, scenes, spoken, subs, counting } from "../lib/story.js";

const R = window.REEL;
const $ = (id) => document.getElementById(id);
const T = 0.35;
const root = document.documentElement.style;
if (R.accent) root.setProperty("--accent", R.accent);
if (R.select) root.setProperty("--sel", R.select);
$("handle").textContent = R.handle ?? "";

/** Paper for reading and comparing, the dark stage for the product and the big moments. */
const LIGHT = ["quote", "bars", "specs", "layers", "choice"];
const light = (s) => s && LIGHT.includes(s.kind);

function build(s) {
  const el = document.createElement("div");
  el.className = `scene${light(s) ? " light" : ""}`;
  switch (s.kind) {
    case "hook":
    case "photo":
      el.innerHTML = `${s.media ? `<div class="hero"><img src="${media(s.media)}"></div>` : ""}${s.label ? `<div class="chip">${mixed(s.label)}</div>` : ""}`;
      break;
    case "quote": {
      const q = s.quote ?? { source: "", text: "", highlight: "" };
      const at = q.highlight ? q.text.indexOf(q.highlight) : -1;
      const body = at < 0 ? mixed(q.text) : `${mixed(q.text.slice(0, at))} <mark>${mixed(q.highlight)}</mark> ${mixed(q.text.slice(at + q.highlight.length))}`;
      el.innerHTML = `<div class="article"><div class="src"><b>${esc((q.source || "?").slice(0, 1).toUpperCase())}</b>${esc(q.source)}</div><p>${body}</p></div>${q.highlight ? `<div class="pull">«${mixed(q.highlight)}»</div>` : ""}`;
      break;
    }
    case "stamp":
      el.innerHTML = `<div class="stamp">${mixed(s.stamp ?? "")}</div>${s.label ? `<div class="chip">${mixed(s.label)}</div>` : ""}`;
      break;
    case "price":
      el.innerHTML = `<div class="pricebox">${s.price?.label ? `<small>${mixed(s.price.label)}</small>` : ""}<span class="v">${esc(s.price?.value ?? "")}</span></div>`;
      break;
    case "bars": {
      const bars = (s.bars ?? []).slice(0, 3);
      el.innerHTML = `<div class="chart">${bars.map((b, i) => `<div class="bar${i === bars.length - 1 ? " last" : ""}"><div class="val">${esc(b.shown)}</div><div class="col"></div><div class="name">${mixed(b.label)}</div></div>`).join("")}${s.delta ? `<div class="sticker">${esc(s.delta)}</div>` : ""}</div>`;
      break;
    }
    case "specs":
      el.innerHTML = `<div class="pills">${(s.specs ?? []).slice(0, 6).map((x) => `<div class="pill">${mixed(x)}</div>`).join("")}</div>`;
      break;
    case "layers":
      el.innerHTML = `<div class="layers">${(s.layers ?? []).slice(0, 6).map((x, i) => `<div class="layer">${mixed(x)}<span>L${i + 1}</span></div>`).join("")}</div>`;
      break;
    case "choice": {
      const [a, b] = s.choice ?? ["", ""];
      el.innerHTML = `<div class="choice"><div class="opt a"><i>💻</i>${mixed(a)}</div><div class="opt b"><i>💸</i>${mixed(b)}</div></div><div class="ask">${mixed(s.label ?? "قولّي في الكومنتات 👇")}</div>`;
      break;
    }
    case "follow":
      el.innerHTML = `${followCard()}<svg class="pulse" viewBox="0 0 900 120"><path d="M0 60 H330 L360 20 L392 104 L424 8 L456 92 L480 60 H900"/></svg>`;
      break;
  }
  $("stage").append(el);
  return {
    el,
    img: el.querySelector(".hero img"),
    chip: el.querySelector(".chip"),
    article: el.querySelector(".article"),
    mark: el.querySelector("mark"),
    pull: el.querySelector(".pull"),
    stamp: el.querySelector(".stamp"),
    price: el.querySelector(".pricebox .v"),
    pricebox: el.querySelector(".pricebox"),
    cols: [...el.querySelectorAll(".bar .col")],
    vals: [...el.querySelectorAll(".bar .val")],
    sticker: el.querySelector(".sticker"),
    pills: [...el.querySelectorAll(".pill")],
    layers: [...el.querySelectorAll(".layer")],
    opts: [...el.querySelectorAll(".opt")],
    fbtn: el.querySelector(".fbtn"),
    pulse: el.querySelector(".pulse path"),
  };
}
const nodes = scenes.map(build);
const maxBar = (s) => Math.max(1, ...(s.bars ?? []).map((b) => b.value));
// A quote card on the dark stage when the scene before was light too, so two papers never sit back to back.
scenes.forEach((s, i) => { if (s.kind === "quote" && light(scenes[i - 1])) nodes[i].article?.classList.add("night"); });

// ---- the line being said: up to 6 pieces at a time ------------------------------
const chunks = subs.map((sub) => {
  const all = pieces(sub.text ?? "");
  const out = [];
  for (let i = 0; i < all.length; i += 6) out.push(all.slice(i, i + 6));
  return out;
});
function word(p, key, j, n) {
  const attrs = ` data-j="${j}" data-n="${n}"${p.arabic ? "" : ' dir="ltr"'}`;
  if (isKey(p, key)) return `<span class="w"${attrs}><span class="sel"><i></i><i></i>${esc(p.text)}</span></span>`;
  const important = !p.arabic || /\d/.test(p.text);
  return `<span class="w${important ? " hi" : ""}${p.arabic ? "" : " lat"}"${attrs}>${esc(p.text)}</span>`;
}
let said = "";
let pulseLength = 0;

async function render(frame) {
  const t = frame / R.fps;
  const current = sceneAt(t);
  $("grain").style.transform = `translate(${(frame * 37) % 50 - 25}px, ${(frame * 53) % 50 - 25}px)`;

  // Paper or stage, cross-faded at the cut, with a quick white flash.
  const s = scenes[current], prev = scenes[current - 1];
  const cut = s ? ease((t - s.from) / T) : 1;
  const was = prev && light(prev) ? 1 : 0, now = light(s) ? 1 : 0;
  const paper = current === 0 ? now : was + (now - was) * cut;
  $("paper").style.opacity = String(paper);
  root.setProperty("--ink", paper > 0.5 ? "#0b0b0d" : "#fff");
  root.setProperty("--dim", paper > 0.5 ? "#8b8b90" : "#7d7d86");
  $("flash").style.opacity = current > 0 && was !== now ? String(0.35 * (1 - clamp((t - s.from) / 0.18))) : "0";
  $("cone").style.transform = `translateX(-50%) rotate(${Math.sin(t * 0.6) * 4}deg)`;

  scenes.forEach((sc, i) => {
    const n = nodes[i];
    const visible = t >= sc.from - 0.01 && t < sc.to + T;
    n.el.style.display = visible ? "flex" : "none";
    if (!visible) return;
    const enter = i === 0 ? out3(t / T) : ease((t - sc.from) / T), leave = i === scenes.length - 1 ? 0 : ease((t - sc.to) / T);
    const since = t - sc.from, k = clamp(since / Math.max(1, sc.to - sc.from));
    n.el.style.opacity = String(Math.min(enter, 1 - leave));
    n.el.style.filter = enter < 1 || leave ? `blur(${(1 - enter) * 10 + leave * 14}px)` : "none";
    n.el.style.transform = `translateY(${(1 - enter) * 120 - leave * 80}px) scale(${0.94 + 0.06 * enter})`;

    if (n.img) n.img.style.transform = `scale(${1 + 0.07 * k}) translateY(${Math.sin(t * 1.2) * 6}px)`;
    if (n.chip) { const p = back((since - 0.5) / 0.35); n.chip.style.opacity = String(clamp((since - 0.5) / 0.15)); n.chip.style.transform = `scale(${0.7 + 0.3 * p})`; }
    if (n.mark) n.mark.style.setProperty("--u", `${ease((since - 0.5) / 0.6) * 100}%`);
    if (n.pull) { const p = back((since - 1.1) / 0.4); n.pull.style.opacity = String(clamp((since - 1.1) / 0.15)); n.pull.style.transform = `rotate(-3deg) scale(${0.5 + 0.5 * p})`; }
    if (n.stamp) {
      const p = since / 0.26;
      const shake = since > 0.26 && since < 0.56 ? Math.sin(since * 95) * 12 * (1 - (since - 0.26) / 0.3) : 0;
      n.stamp.style.transform = `translate(${shake}px, ${shake * 0.4}px) rotate(-8deg) scale(${p < 1 ? 2.8 - 1.8 * ease(p) : 1 + 0.012 * (since - 0.26)})`;
      n.stamp.style.opacity = String(clamp(p * 1.6));
    }
    if (n.price) {
      n.price.textContent = counting(sc.price?.value ?? "", ease((since - 0.15) / 1.05));
      const p = back((since) / 0.45);
      n.pricebox.style.transform = `scale(${0.7 + 0.3 * p}) rotate(${(1 - clamp(since / 0.45)) * -4}deg)`;
    }
    n.cols.forEach((col, j) => {
      const p = ease((since - 0.3 - j * 0.35) / 0.8);
      col.style.height = `${12 + (sc.bars[j].value / maxBar(sc)) * 470 * p}px`;
      n.vals[j].style.opacity = String(clamp((since - 0.8 - j * 0.35) / 0.25));
    });
    if (n.sticker) {
      const at = 0.6 + n.cols.length * 0.35 + 0.4;
      n.sticker.style.opacity = String(clamp((since - at) / 0.1));
      n.sticker.style.transform = `rotate(10deg) scale(${since < at ? 0 : 0.4 + 0.6 * back((since - at) / 0.35)})`;
    }
    n.pills.forEach((pill, j) => {
      const p = back((since - 0.35 - j * 0.22) / 0.4);
      pill.style.opacity = String(clamp((since - 0.35 - j * 0.22) / 0.15));
      pill.style.transform = `translateY(${(1 - p) * 60}px) scale(${0.85 + 0.15 * p})`;
    });
    if (n.layers.length) {
      const on = Math.min(n.layers.length - 1, Math.floor(clamp((since - 1.2) / Math.max(1, sc.to - sc.from - 1.6)) * n.layers.length));
      n.layers.forEach((layer, j) => {
        const p = out3((since - 0.5 - j * 0.3) / 0.35);
        layer.style.opacity = String(p);
        layer.style.transform = `translateX(${(1 - p) * -80}px)`;
        layer.classList.toggle("on", since > 1.2 && j === on);
      });
    }
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
    if (n.pulse) {
      pulseLength ||= n.pulse.getTotalLength();
      n.pulse.style.strokeDasharray = `${pulseLength}`;
      n.pulse.style.strokeDashoffset = `${pulseLength * (1 - ease((since - 0.3) / 1.2))}`;
    }
  });

  // The words at the top.
  const say = $("say");
  const i = lineAt(t), sub = subs[i];
  let html = "", local = 1, count = 1;
  if (sub && t < sub.end + 0.4) {
    const parts = chunks[i];
    const f = spoken(sub, t) * parts.length;
    const c = Math.min(parts.length - 1, Math.floor(f));
    local = f - c;
    count = parts[c].length;
    html = parts[c].map((p, j) => word(p, keysOf(sub), j, count)).join(" ");
  }
  if (html !== said) { say.innerHTML = html; said = html; }
  [...say.querySelectorAll(".w")].forEach((w) => {
    const j = Number(w.dataset.j);
    const p = out3((Math.min(1, local) * count - j + 0.6) / 0.6);
    w.style.opacity = String(p);
    w.style.transform = `translateY(${(1 - p) * 24}px)`;
  });

  const waits = nodes.filter((n) => n.img && !n.img.complete).map((n) => loaded(n.img));
  await Promise.all(waits);
}

window.reel = {
  ready: fontsReady().then(() => render(0)),
  seek: render,
  events: () => baseEvents(),
};
