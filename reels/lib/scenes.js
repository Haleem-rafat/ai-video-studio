// The scene engine of the newer story looks (aurora, variety, flat, sketch): it builds each scene's
// pieces once, then every frame asks the look how a scene enters and leaves, how a piece pops in and
// how a word of the line being said appears. The looks keep only their own picture and motion.
// Scene kinds: hook (the headline, a picture if any), photo, point (a big number or sign and one short
// sentence), chat (2-4 bubbles), layers (steps that light up in turn), quote, stamp, price, bars,
// specs, choice and follow.
import { baseEvents, clamp, counting, ease, esc, fontsReady, isKey, keysOf, lineAt, loaded, media, mixed, pieces, sceneAt, scenes, spoken, subs } from "./story.js";

const R = window.REEL;
const $ = (id) => document.getElementById(id);

const INDIC = "٠١٢٣٤٥٦٧٨٩";
/** Arabic text shows its numbers in Arabic digits (٣ not 3), so one screen never mixes both; Latin words like M6 keep theirs. */
const digits = (text) => (/[؀-ۿ]/.test(String(text ?? "")) ? String(text).replace(/(^|[^A-Za-z\d$€£₹])(\d+(?:[.,]\d+)?)(?![A-Za-z])/g, (_, before, n) => before + n.replace(/\d/g, (d) => INDIC[d])) : String(text ?? ""));
/** Screen text: Arabic digits, then Latin runs kept left to right. */
const show = (text) => mixed(digits(text));
/** A chat bubble without a "client:" / "coach:" prefix; the bubble's side already says who. */
const bubble = (text) => String(text).replace(/^\s*[^:：\s]{2,12}\s*[:：]\s*/, "");

/** A headline with its punch phrase wrapped in <em>. */
export function headlineHtml() {
  const raw = R.headline ?? { text: "", highlight: "" };
  const h = { text: digits(raw.text), highlight: digits(raw.highlight) };
  const at = h.highlight ? h.text.indexOf(h.highlight) : -1;
  return at < 0 ? show(h.text) : `${show(h.text.slice(0, at))} <em>${show(h.highlight)}</em> ${show(h.text.slice(at + h.highlight.length))}`;
}

/** The brand's mark for the follow card: its logo, else its first letter. */
const logoHtml = () => (R.logo ? `<img src="${media(R.logo)}">` : `<b>${esc((R.channel ?? R.handle ?? "?").replace("@", "").slice(0, 1).toUpperCase())}</b>`);

function build(s, look) {
  const el = document.createElement("div");
  el.className = `scene k-${s.kind}`;
  const icons = look.icons ?? {};
  switch (s.kind) {
    case "hook":
      el.innerHTML = `${s.media ? `<div class="pic"><img src="${media(s.media)}"></div>` : ""}<div class="title">${headlineHtml()}</div>${s.label ? `<div class="chip">${show(s.label)}</div>` : ""}`;
      break;
    case "photo":
      el.innerHTML = `<div class="pic"><img src="${media(s.media)}"></div>${s.label ? `<div class="chip">${show(s.label)}</div>` : ""}`;
      break;
    case "point":
      el.innerHTML = `<div class="point"><div class="mark">${show(s.point?.mark ?? "")}</div><div class="text">${show(s.point?.text ?? "")}</div></div>${s.label ? `<div class="chip">${show(s.label)}</div>` : ""}`;
      break;
    case "chat":
      el.innerHTML = `<div class="chat">${s.title ? `<div class="head"><i></i>${show(s.title)}</div>` : ""}${(s.messages ?? []).slice(0, 4).map((m, i) => `<div class="bubble ${i % 2 ? "them" : "you"}">${show(bubble(m))}</div>`).join("")}</div>${s.label ? `<div class="chip">${show(s.label)}</div>` : ""}`;
      break;
    case "layers":
      el.innerHTML = `<div class="steps">${(s.layers ?? []).slice(0, 6).map((x, i) => `<div class="step"><span class="n">${esc(digits(`ع ${i + 1}`).slice(2))}</span><span class="t">${show(x)}</span></div>`).join("")}</div>`;
      break;
    case "quote": {
      const q = s.quote ?? { source: "", text: "", highlight: "" };
      const at = q.highlight ? q.text.indexOf(q.highlight) : -1;
      const body = at < 0 ? show(q.text) : `${show(q.text.slice(0, at))} <mark>${show(q.highlight)}</mark> ${show(q.text.slice(at + q.highlight.length))}`;
      el.innerHTML = `<div class="quote"><div class="src">${esc(q.source)}</div><p>${body}</p></div>`;
      break;
    }
    case "stamp":
      el.innerHTML = `<div class="stamp">${show(s.stamp ?? "")}</div>${s.label ? `<div class="chip">${show(s.label)}</div>` : ""}`;
      break;
    case "price":
      el.innerHTML = `<div class="price">${s.price?.label ? `<small>${show(s.price.label)}</small>` : ""}<span class="v">${esc(s.price?.value ?? "")}</span></div>`;
      break;
    case "bars": {
      const bars = (s.bars ?? []).slice(0, 3);
      el.innerHTML = `<div class="bars">${bars.map((b, i) => `<div class="bar${i === bars.length - 1 ? " last" : ""}"><div class="val">${esc(b.shown)}</div><div class="col"></div><div class="name">${show(b.label)}</div></div>`).join("")}${s.delta ? `<div class="sticker">${esc(s.delta)}</div>` : ""}</div>`;
      break;
    }
    case "specs":
      el.innerHTML = `<div class="specs">${(s.specs ?? []).slice(0, 6).map((x) => `<div class="spec">${show(x)}</div>`).join("")}</div>`;
      break;
    case "choice": {
      const [a, b] = s.choice ?? ["", ""];
      const [ia, ib] = icons.choice ?? ["A", "B"];
      el.innerHTML = `<div class="choice"><div class="opt a"><i>${ia}</i>${show(a)}</div><div class="opt b"><i>${ib}</i>${show(b)}</div></div><div class="chip ask">${show(s.label ?? "قولّي في الكومنتات 👇")}</div>`;
      break;
    }
    case "follow":
      el.innerHTML = `<div class="follow"><div class="logo">${logoHtml()}</div><strong>${esc(R.channel ?? "")}</strong>${R.handle ? `<bdi dir="ltr">${esc(R.handle)}</bdi>` : ""}<div class="fbtn"><span class="a">Follow</span><span class="b">Following ✓</span></div></div>`;
      break;
  }
  $("stage").append(el);
  const all = (q) => [...el.querySelectorAll(q)];
  // Pieces that pop in one after another, with the second they start at.
  const length = Math.max(1.5, s.to - s.from);
  const items = [];
  const add = (q, at, step = 0) => all(q).forEach((node, j) => items.push({ el: node, at: at + j * step }));
  add(".pic", 0.05);
  add(".title", 0.1);
  add(".point .mark", 0.05);
  add(".point .text", 0.4);
  add(".chat .head", 0.1);
  add(".bubble", 0.35, Math.min(1.1, (length * 0.75) / Math.max(1, all(".bubble").length)));
  add(".step", 0.3, 0.3);
  add(".quote", 0.1);
  add(".price", 0.05);
  add(".spec", 0.35, 0.22);
  add(".opt", 0.3, 0.25);
  add(".follow", 0.1);
  add(".chip", s.kind === "choice" ? 1.0 : 0.55);
  return {
    el,
    items,
    img: el.querySelector(".pic img"),
    stamp: el.querySelector(".stamp"),
    price: el.querySelector(".price .v"),
    mark: el.querySelector("mark"),
    em: el.querySelector(".title em"),
    cols: all(".bar .col"),
    vals: all(".bar .val"),
    sticker: el.querySelector(".sticker"),
    steps: all(".step"),
    fbtn: el.querySelector(".fbtn"),
  };
}

/**
 * Starts the reel with a look:
 *   T            seconds a cut takes
 *   chunk        words of the line on screen at a time
 *   scene(el, enter, leave, s, i)   how a scene comes in (enter 0→1) and goes (leave 0→1)
 *   item(el, p, since)              how a piece pops in (p 0→1 over `itemTime`), since = seconds after it started
 *   word(el, p, key, since)         how a word of the line appears
 *   stamp(el, since)                the stamp's hit
 *   frame(t, frame, scene)          the look's own background motion
 *   events(s, i)                    extra sound cues for a scene
 */
export function startLook(look) {
  const T = look.T ?? 0.4;
  const itemTime = look.itemTime ?? 0.45;
  const nodes = scenes.map((s) => build(s, look));
  const maxBar = (s) => Math.max(1, ...(s.bars ?? []).map((b) => b.value));
  const chunk = look.chunk ?? 5;
  // Even chunks (7 words → 4 + 3, never 6 + 1), so no word is left alone on screen.
  const chunks = subs.map((sub) => {
    const all = pieces(digits(sub.text ?? ""));
    const count = Math.max(1, Math.ceil(all.length / chunk));
    const size = Math.ceil(all.length / count);
    const out = [];
    for (let i = 0; i < all.length; i += size) out.push(all.slice(i, i + size));
    return out.length ? out : [[]];
  });
  if (R.accent) document.documentElement.style.setProperty("--accent", R.accent);
  if (R.accent2) document.documentElement.style.setProperty("--accent2", R.accent2);
  if ($("brand")) $("brand").textContent = R.channel ?? R.handle ?? "";
  let said = "";

  async function render(frame) {
    const t = frame / R.fps;
    const current = sceneAt(t);

    scenes.forEach((sc, i) => {
      const n = nodes[i];
      const visible = t >= sc.from - 0.01 && t < sc.to + T;
      n.el.style.display = visible ? "" : "none";
      if (!visible) return;
      const enter = i === 0 ? clamp(t / T + 0.6) : clamp((t - sc.from) / T), leave = i === scenes.length - 1 ? 0 : clamp((t - sc.to) / T);
      look.scene(n.el, enter, leave, sc, i);
      const since = t - sc.from;
      for (const item of n.items) look.item(item.el, clamp((since - item.at) / itemTime), since - item.at);
      if (n.img) n.img.style.transform = `scale(${1.02 + 0.06 * clamp(since / Math.max(1, sc.to - sc.from))})`;
      if (n.em) n.em.style.setProperty("--u", `${ease((since - 0.6) / 0.6) * 100}%`);
      if (n.mark) n.mark.style.setProperty("--u", `${ease((since - 0.6) / 0.6) * 100}%`);
      if (n.stamp) look.stamp(n.stamp, since);
      if (n.price) n.price.textContent = counting(sc.price?.value ?? "", ease((since - 0.15) / 1.05));
      n.cols.forEach((col, j) => {
        const p = look.grow ? look.grow((since - 0.3 - j * 0.35) / 0.8) : ease((since - 0.3 - j * 0.35) / 0.8);
        col.style.height = `${14 + (sc.bars[j].value / maxBar(sc)) * 470 * p}px`;
        n.vals[j].style.opacity = String(clamp((since - 0.8 - j * 0.35) / 0.25));
      });
      if (n.sticker) {
        const at = 0.6 + n.cols.length * 0.35 + 0.4;
        look.item(n.sticker, clamp((since - at) / itemTime), since - at);
      }
      if (n.steps.length) {
        const on = Math.min(n.steps.length - 1, Math.floor(clamp((since - 1.0) / Math.max(1, sc.to - sc.from - 1.4)) * n.steps.length));
        n.steps.forEach((step, j) => step.classList.toggle("on", since > 1.0 && j === on));
      }
      if (n.fbtn) {
        const done = since > 1.4;
        n.fbtn.classList.toggle("done", done);
        n.fbtn.style.transform = `scale(${since > 1.4 && since < 1.55 ? 0.9 : 1})`;
      }
    });

    // After the scenes are placed, so a look can measure what is on screen.
    look.frame?.(t, frame, scenes[current], current);

    // The line being said, a few words at a time.
    const say = $("say");
    const i = lineAt(t), sub = subs[i];
    let html = "", local = 1, count = 1;
    if (sub && t < sub.end + 0.35) {
      const parts = chunks[i];
      const f = spoken(sub, t) * parts.length;
      const c = Math.min(parts.length - 1, Math.floor(f));
      local = f - c;
      count = parts[c].length;
      const key = keysOf({ key: digits(sub.key ?? "") });
      html = `<span class="line" data-i="${i}-${c}">${parts[c].map((p, j) => `<span class="w${isKey(p, key) ? " key" : ""}${p.arabic ? "" : " lat"}" data-j="${j}"${p.arabic ? "" : ' dir="ltr"'}>${esc(p.text)}</span>`).join(" ")}</span>`;
    }
    if (html !== said) { say.innerHTML = html; said = html; }
    [...say.querySelectorAll(".w")].forEach((w) => {
      const j = Number(w.dataset.j);
      const since = (Math.min(1, local) * count - j) * 0.25;
      look.word(w, clamp((Math.min(1, local) * count - j + 0.6) / 0.6), w.classList.contains("key"), since);
    });

    await Promise.all(nodes.filter((n) => n.img && !n.img.complete).map((n) => loaded(n.img)));
  }

  window.reel = {
    ready: Promise.all([fontsReady(), ...(look.fonts ?? []).map((f) => document.fonts.load(f, "عربي Aa"))]).then(() => render(0)),
    seek: render,
    events: () => baseEvents((s, i) => [
      ...(s.kind === "chat" ? (s.messages ?? []).slice(0, 4).map((_, j) => ({ t: s.from + 0.35 + j * Math.min(1.1, ((s.to - s.from) * 0.75) / Math.max(1, (s.messages ?? []).length)), kind: "pop" })) : []),
      ...(look.events?.(s, i) ?? []),
    ]),
  };
}
