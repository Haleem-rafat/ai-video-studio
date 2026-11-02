// Motion reel: kinetic typography on black with UI mockups. The line being said types in word by
// word at the top (grey, important words white, ONE key word in an italic serif inside a
// Figma-style selection box); below it each scene shows a mockup (chat, DM, browser, phone,
// counter, grid) that slides up, then zooms out and blurs when the next scene starts.
const R = window.REEL;
const $ = (id) => document.getElementById(id);

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (v) => { v = clamp(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; }; // ease-in-out
const out3 = (v) => 1 - Math.pow(1 - clamp(v), 3);
const back = (v) => { v = clamp(v); const s = 1.7; return 1 + (s + 1) * Math.pow(v - 1, 3) + s * Math.pow(v - 1, 2); };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const ARABIC = /[؀-ۿ]/;
const bare = (word) => word.replace(/[.,!?؟،:؛"'«»…()]+/g, "").toLowerCase();
const media = (file) => `/job/${file}`;
const T = 0.35; // transitions

if (R.accent) document.documentElement.style.setProperty("--accent", R.accent);
$("handle").textContent = R.handle ?? "";

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

/** A piece as HTML: the key word in the selection box, numbers and Latin in white. */
function word(p, key) {
  const isKey = key.length && p.text.split(/\s+/).some((w) => key.includes(bare(w)));
  if (isKey) return `<span class="w"><span class="sel ${p.arabic ? "ar" : "lat"}"${p.arabic ? "" : ' dir="ltr"'}><i></i><i></i><i></i><i></i>${esc(p.text)}</span></span>`;
  const important = !p.arabic || /\d/.test(p.text);
  return `<span class="w${important ? " hi" : ""}${p.arabic ? "" : " lat"}"${p.arabic ? "" : ' dir="ltr"'}>${esc(p.text)}</span>`;
}

// ---- background: floating blurred cards ------------------------------------
const floats = Array.from({ length: 7 }, (_, i) => {
  const el = document.createElement("div");
  el.className = "float";
  $("floats").append(el);
  const r = (n) => ((Math.sin(i * 91.7 + n * 13.3) + 1) / 2);
  return { el, x: 60 + r(1) * 720, y: 120 + r(2) * 1600, s: 0.7 + r(3) * 0.8, speed: 6 + r(4) * 10, tilt: (r(5) - 0.5) * 30 };
});

// ---- lines and their chunks -------------------------------------------------
const subs = R.subs ?? [];
const lineAt = (t) => { let at = -1; subs.forEach((s, i) => { if (s.start <= t) at = i; }); return at; };
function spoken(sub, t) {
  if (t >= sub.end) return 1;
  const words = sub.words ?? [];
  if (!words.length) return clamp((t - sub.start) / Math.max(0.1, sub.end - sub.start));
  let n = 0;
  for (const w of words) n += w.end <= t ? 1 : w.start < t ? (t - w.start) / Math.max(0.05, w.end - w.start) : 0;
  return clamp(n / words.length);
}
const chunks = subs.map((sub) => {
  const all = pieces(sub.text ?? "");
  const out = [];
  for (let i = 0; i < all.length; i += 6) out.push(all.slice(i, i + 6));
  return out;
});
const keysOf = (sub) => String(sub.key ?? "").split(/\s+/).map(bare).filter(Boolean);

// ---- scenes -----------------------------------------------------------------
const scenes = R.scenes.map((s, i) => ({ ...s, from: i === 0 ? 0 : s.start, to: R.scenes[i + 1]?.start ?? R.duration }));

const ICONS = {
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  dollar: '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  bolt: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
};

const messagesHtml = (messages, cls = "") => (messages ?? []).map((m, i) => `<div class="msg ${i % 2 ? "reply" : "you"} ${cls}" data-i="${i}">${esc(m)}</div>`).join("");

function build(s) {
  const el = document.createElement("div");
  el.className = "scene";
  const button = s.button ? `<div class="btn">${esc(s.button)}</div>` : "";
  switch (s.kind) {
    case "chat":
      el.innerHTML = `<div class="card chat"><header><b></b>${esc(s.title ?? "AI")}</header><div class="msgs">${messagesHtml(s.messages)}<div class="typing"><i></i><i></i><i></i></div></div>${button}</div>`;
      break;
    case "dm":
    case "cta": {
      const initial = (R.handle ?? "?").replace("@", "").slice(0, 1).toUpperCase();
      const messages = s.kind === "cta" ? [R.keyword ?? ""] : s.messages;
      const link = s.kind === "cta" ? `<div class="link msg reply" data-i="1"><div></div><p>${esc(s.title ?? "اللينك 🔗")}</p></div>` : "";
      el.innerHTML = `<div class="card dm"><header><span class="avatar">${esc(initial)}</span><bdi dir="ltr">${esc(R.handle ?? "")}</bdi></header><div class="msgs">${messagesHtml(messages)}${link}<div class="typing"><i></i><i></i><i></i></div></div><footer>رسالة…</footer>${button}</div>`;
      break;
    }
    case "browser":
      el.innerHTML = `<div class="card browser"><div class="bar"><i></i><i></i><i></i><div class="url">${esc(s.url ?? "")}</div></div><div class="shot"><img src="${media(s.media)}"></div>${button}</div>`;
      break;
    case "phone":
      el.innerHTML = `<div class="card phone"><div class="shot fit"><img src="${media(s.media)}"></div>${button}</div>`;
      break;
    case "counter": {
      const value = s.counter?.value ?? "";
      const digits = [...value].map((c) => (/\d/.test(c) ? `<span class="col" data-d="${c}">${Array.from({ length: 20 }, (_, n) => `<span>${n % 10}</span>`).join("")}</span>` : `<span class="fix">${esc(c)}</span>`)).join("");
      el.innerHTML = `<div class="counter"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[s.counter?.icon] ?? ICONS.bolt}</svg><div class="digits">${digits}</div><p>${esc(s.counter?.label ?? "")}</p></div>`;
      break;
    }
    case "grid":
      el.innerHTML = `<div class="tiles">${(s.items ?? []).slice(0, 6).map((item) => `<div class="tile">${esc(item)}</div>`).join("")}</div>`;
      break;
    default: // hook, text: the words are the scene
      el.innerHTML = "";
  }
  // A button sits under the bubbles, not over them.
  if (s.button) el.firstElementChild?.classList.add("has-btn");
  $("stage").append(el);
  return {
    el,
    card: el.firstElementChild,
    img: el.querySelector("img"),
    shot: el.querySelector(".shot"),
    msgs: [...el.querySelectorAll(".msg")],
    typing: el.querySelector(".typing"),
    cols: [...el.querySelectorAll(".col")],
    tiles: [...el.querySelectorAll(".tile")],
    button: el.querySelector(".btn"),
  };
}
const nodes = scenes.map(build);
const wordsOnly = (s) => s.kind === "hook" || s.kind === "text";

/** When a scene's chat bubbles appear: spread over the scene, a beat apart. */
const bubbleTime = (s, i, n) => s.from + 0.55 + i * Math.min(1.3, Math.max(0.6, (s.to - s.from - 1.2) / Math.max(1, n)));
const CLICK = 1.5; // seconds into a scene the cursor clicks

let said = "";
async function render(frame) {
  const t = frame / R.fps;
  const waits = [];

  for (const f of floats) {
    const y = ((f.y - t * f.speed * 4) % 2100 + 2100) % 2100 - 150;
    f.el.style.transform = `translate(${f.x + Math.sin(t * 0.3 + f.tilt) * 30}px, ${y}px) scale(${f.s}) perspective(900px) rotateX(${f.tilt * 0.6}deg) rotateY(${f.tilt}deg)`;
  }

  // The scene on screen.
  let current = 0;
  scenes.forEach((s, i) => { if (t >= s.from) current = i; });

  scenes.forEach((s, i) => {
    const n = nodes[i];
    const visible = t >= s.from && t < s.to + T;
    n.el.style.display = visible ? "flex" : "none";
    if (!visible) return;
    const enter = i === 0 ? ease(t / T) : ease((t - s.from) / T), leave = i === scenes.length - 1 ? 0 : ease((t - s.to) / T);
    n.el.style.opacity = String(Math.min(enter, 1 - leave));
    n.el.style.filter = leave ? `blur(${leave * 16}px)` : "none";
    n.el.style.transform = `translateY(${(1 - enter) * 140}px) scale(${(0.93 + 0.07 * enter) * (1 - 0.16 * leave)})`;
    const since = t - s.from;

    if (n.img && n.shot) {
      const k = clamp(since / Math.max(1, s.to - s.from));
      const tall = n.img.naturalWidth && n.img.naturalHeight / n.img.naturalWidth > 1.1 && s.kind === "browser";
      n.shot.classList.toggle("fit", !tall);
      if (tall) n.img.style.transform = `translateY(${-Math.max(0, n.img.clientHeight - n.shot.clientHeight) * ease(k) * 0.8}px)`;
      else n.img.style.transform = `scale(${1.02 + 0.08 * k})`;
    }
    n.msgs.forEach((m) => {
      const at = bubbleTime(s, Number(m.dataset.i), n.msgs.length);
      const p = out3((t - at) / 0.3);
      m.style.display = t >= at ? "block" : "none";
      m.style.opacity = String(p);
      m.style.transform = `translateY(${(1 - p) * 30}px) scale(${0.92 + 0.08 * p})`;
    });
    if (n.typing) {
      // Dots before each reply.
      const replyAt = n.msgs.filter((m) => m.classList.contains("reply")).map((m) => bubbleTime(s, Number(m.dataset.i), n.msgs.length));
      const typing = replyAt.some((at) => t > at - 0.55 && t < at);
      n.typing.style.display = typing ? "flex" : "none";
      [...n.typing.children].forEach((dot, d) => (dot.style.opacity = String(0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 9 - d)))));
    }
    n.cols.forEach((col, j) => {
      const d = Number(col.dataset.d);
      const p = ease((since - 0.25 - j * 0.09) / 1.15);
      col.style.transform = `translateY(${-p * (10 + d) * 240}px)`;
    });
    n.tiles.forEach((tile, j) => {
      const p = back((since - 0.3 - j * 0.16) / 0.35);
      tile.style.opacity = String(clamp((since - 0.3 - j * 0.16) / 0.15));
      tile.style.transform = `scale(${0.8 + 0.2 * p})`;
    });
    if (n.button) n.button.style.transform = `translateX(-50%) scale(${since > CLICK && since < CLICK + 0.14 ? 0.93 : 1})`;
  });

  // Cursor: glides to the scene's button and clicks it.
  const s = scenes[current], n = nodes[current], cursor = $("cursor"), ripple = $("ripple");
  if (n?.button && t - s.from < CLICK + 0.9) {
    const since = t - s.from;
    const box = n.button.getBoundingClientRect();
    const tx = box.left + box.width * 0.55, ty = box.top + box.height * 0.55;
    const p = ease((since - 0.5) / 0.9);
    const x = 1000 + (tx - 1000) * p, y = 1780 + (ty - 1780) * p;
    cursor.style.display = "block";
    cursor.style.opacity = String(clamp((since - 0.4) / 0.2) * (1 - clamp((since - CLICK - 0.6) / 0.3)));
    cursor.style.transform = `translate(${x - 8}px, ${y - 6}px) scale(${since > CLICK && since < CLICK + 0.12 ? 0.86 : 1})`;
    const r = (since - CLICK) / 0.45;
    ripple.style.opacity = r > 0 && r < 1 ? String(1 - r) : "0";
    ripple.style.transform = `translate(${tx - 15}px, ${ty - 15}px) scale(${1 + r * 3})`;
  } else {
    cursor.style.display = "none";
    ripple.style.opacity = "0";
  }

  // The words: the chunk being said, word by word; the CTA scene shows the ask instead.
  const say = $("say");
  const i = lineAt(t), sub = subs[i];
  let html = "";
  if (s?.kind === "cta" && R.keyword) {
    html = `${word({ text: "اكتب", arabic: true }, [])} ${word({ text: R.keyword, arabic: ARABIC.test(R.keyword) }, [bare(R.keyword)])} ${pieces("في الكومنتات وهبعتلك اللينك 📩").map((p) => word(p, [])).join(" ")}`;
  } else if (sub && t < sub.end + 0.5) {
    const parts = chunks[i];
    const f = spoken(sub, t) * parts.length;
    const c = Math.min(parts.length - 1, Math.floor(f));
    const local = f - c;
    const key = keysOf(sub);
    html = parts[c].map((p, j) => word(p, key).replace('<span class="w', `<span data-j="${j}" data-n="${parts[c].length}" data-l="${local.toFixed(3)}" class="w`)).join(" ");
  }
  if (html.replace(/ data-l="[^"]*"/g, "") !== said.replace(/ data-l="[^"]*"/g, "")) say.innerHTML = html;
  said = html;
  say.classList.toggle("big", Boolean(s && wordsOnly(s)));
  // Each word rises in as it is reached.
  const local = Number(/data-l="([^"]*)"/.exec(html)?.[1] ?? 1);
  [...say.querySelectorAll(".w")].forEach((w) => {
    const j = Number(w.dataset.j ?? 0), count = Number(w.dataset.n ?? 1);
    const p = w.dataset.j === undefined ? out3((t - (sub?.start ?? 0)) / T) : out3((local * count - j + 0.6) / 0.6);
    w.style.opacity = String(p);
    w.style.transform = `translateY(${(1 - p) * 26}px)`;
  });

  for (const node of nodes) if (node.img && !node.img.complete) waits.push(loaded(node.img));
  await Promise.all(waits);
}

function events() {
  const out = [{ t: 0.02, kind: "whoosh" }];
  scenes.forEach((s, i) => {
    if (i > 0) out.push({ t: s.from - 0.06, kind: "whoosh" });
    if (s.button) out.push({ t: s.from + CLICK, kind: "click" });
    if (s.kind === "counter") for (let k = 0.3; k < 1.5; k += 0.07) out.push({ t: s.from + k, kind: "tick" });
    const n = nodes[i];
    n.msgs.forEach((m) => out.push({ t: bubbleTime(s, Number(m.dataset.i), n.msgs.length), kind: "pop" }));
    n.tiles.forEach((_, j) => out.push({ t: s.from + 0.3 + j * 0.16, kind: "tick" }));
  });
  return out;
}

/** Resolves once an image has loaded (decode() never settles in a background tab). */
function loaded(img) {
  if (img.complete && img.naturalWidth) return Promise.resolve();
  return new Promise((ok) => { img.addEventListener("load", ok, { once: true }); img.addEventListener("error", ok, { once: true }); });
}

window.reel = {
  ready: Promise.all([
    document.fonts.load('800 60px "Cairo"', "عربي"),
    document.fonts.load('italic 700 60px "Amiri"', "عربي"),
    document.fonts.load('italic 60px "Instrument Serif"', "Aa"),
    document.fonts.load('800 60px "Inter"', "Aa"),
    ...[...document.images].map(loaded),
  ]).then(() => render(0)),
  seek: render,
  events,
};
