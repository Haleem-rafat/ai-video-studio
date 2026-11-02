// Breaking tech news reel: fixed header, then one scene per key point (media card with a slow
// Ken Burns, a word-by-word headline, stat cards that pop and count up, a source line).
// Everything on screen comes from the job JSON's `scenes`.
const R = window.REEL;
const $ = (id) => document.getElementById(id);

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
const back = (v) => { v = clamp(v); const s = 1.9; return 1 + (s + 1) * Math.pow(v - 1, 3) + s * Math.pow(v - 1, 2); };
const ARABIC = /[\u0600-\u06FF]/;
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
/** Text as HTML with its Latin runs isolated left to right ("25%" stays "25%"). */
const mixed = (text) => pieces(text).map((p) => (p.arabic ? esc(p.text) : `<bdi dir="ltr">${esc(p.text)}</bdi>`)).join(" ");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const FADE = 0.42; // scene change
const media = (file) => `/job/${file}`;

// ---- brand -----------------------------------------------------------------
// The channel's colours replace the navy defaults: background with a subtle lift, an accent-tinted
// glow, cards in the panel colour, small text muted, accent for the badge, punchline and dots.
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const mix = (hex, to, k) => `rgb(${rgb(hex).map((c, i) => Math.round(c + (to[i] - c) * k)).join(",")})`;
const ACCENT = R.brand?.accent && /^#[0-9a-f]{6}$/i.test(R.brand.accent) ? rgb(R.brand.accent) : [255, 77, 77];
if (R.brand) {
  const b = R.brand, root = document.documentElement.style;
  root.setProperty("--bg1", mix(b.background, [255, 255, 255], 0.05));
  root.setProperty("--bg2", b.background);
  root.setProperty("--glow", `rgba(${ACCENT.join(",")}, 0.13)`);
  root.setProperty("--card", b.panel);
  root.setProperty("--line", mix(b.panel, [255, 255, 255], 0.12));
  root.setProperty("--gray", b.muted);
  root.setProperty("--red", b.accent);
  root.setProperty("--green", b.accent);
  root.setProperty("--logo-bg", b.panel);
  root.setProperty("--text", b.text);
  root.setProperty("--handle", mix(b.text, rgb(b.muted), 0.35));
  // The channel font for the small text; the bold Arabic stays Cairo.
  if (b.font) root.setProperty("--small", b.font);
}

// ---- header -----------------------------------------------------------------
$("initial").textContent = R.initial ?? (R.handle ?? "?").replace("@", "").slice(0, 1).toUpperCase();
$("handle").textContent = R.handle ?? "";
// The company's logo, a glyph, or else its name in the badge.
$("company").innerHTML = R.company?.logo ? `<img src="${media(R.company.logo)}">` : R.company?.glyph ? esc(R.company.glyph) : `<span class="name">${esc(R.company?.name ?? "")}</span>`;
if (!R.company?.logo && !R.company?.glyph) $("company").classList.add("named");

// ---- scenes ---------------------------------------------------------------
// The first scene is on screen from frame 0; each next one takes over when its line starts.
const scenes = R.scenes.map((s, i) => ({ ...s, from: i === 0 ? 0 : s.start, to: R.scenes[i + 1]?.start ?? R.duration }));

/** A stat value split around its first number, so the number can count up and keep its format. */
function counter(value, allowed) {
  const m = /(^|[^A-Za-z])(\d[\d,]*(?:\.\d+)?)/.exec(value);
  if (!m || allowed === false) return null;
  const digits = m[2], number = Number(digits.replace(/,/g, ""));
  const at = m.index + m[1].length;
  return { before: value.slice(0, at), after: value.slice(at + digits.length), number, decimals: (digits.split(".")[1] ?? "").length, commas: digits.includes(",") };
}

const nodes = scenes.map((s) => {
  const el = document.createElement("div");
  el.className = "scene";
  // Headline: plain words, then the highlighted phrase in red, each word its own span.
  const words = [...pieces(s.headline ?? "").map((p) => ({ ...p, hot: false })), ...pieces(s.highlight ?? "").map((p) => ({ ...p, hot: true }))];
  el.innerHTML = `
    <div class="media"><img src="${media(s.clip ? `${s.clip.dir}/0001.jpg` : s.media)}">
      <div class="credit">${mixed(s.credit ?? R.credit ?? "")}</div></div>
    <div class="headline">${words.map(({ text, arabic, hot }) => `<span class="${hot ? "hot" : ""}"${arabic ? "" : ' dir="ltr"'}>${esc(text)}</span>`).join(" ")}</div>
    <div class="stats">${(s.stats ?? []).map((st) => `<div class="stat"><small>${mixed(st.label)}</small><b>${mixed(st.value)}</b><em>${mixed(st.sub ?? "")}</em></div>`).join("")}</div>
    <div class="source">${mixed(s.source ?? R.source ?? "")}<i></i>${mixed(s.date ?? R.date ?? "")}</div>`;
  $("scenes").append(el);
  return {
    el,
    picture: el.querySelector(".media img"),
    words: [...el.querySelectorAll(".headline span")],
    cards: [...el.querySelectorAll(".stat")].map((card, i) => ({ card, value: card.querySelector("b"), count: counter(s.stats[i].value, s.stats[i].count), text: s.stats[i].value })),
  };
});

// Words come in over the first line of the scene; cards follow.
const wordTime = (s, i, n) => s.from + 0.12 + i * Math.min(0.17, ((s.end - s.from) * 0.45) / Math.max(1, n));
const cardTime = (s, i, words) => wordTime(s, words, words) + 0.25 + i * 0.38;

function format(c, v) {
  let n = v.toFixed(c.decimals);
  if (c.commas) n = Number(n).toLocaleString("en-US", { minimumFractionDigits: c.decimals, maximumFractionDigits: c.decimals });
  return c.before + n + c.after;
}

async function render(frame) {
  const t = frame / R.fps;
  // Siren badge pulses.
  const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 3);
  $("breaking").style.boxShadow = `0 0 ${12 + 26 * pulse}px rgba(${ACCENT.join(",")}, ${0.35 + 0.5 * pulse})`;
  $("breaking").style.filter = `brightness(${1 + 0.18 * pulse})`;
  $("breaking").querySelector("svg").style.opacity = Math.floor(t * 4) % 2 ? 0.55 : 1;

  const waits = [];
  scenes.forEach((s, i) => {
    const n = nodes[i];
    const enter = i === 0 ? 1 : ease((t - s.from) / FADE), leave = i === scenes.length - 1 ? 0 : ease((t - s.to) / FADE);
    const visible = t >= s.from && t < s.to + FADE;
    n.el.style.display = visible ? "block" : "none";
    if (!visible) return;
    // In from the right, out to the left (reading direction).
    n.el.style.opacity = String(Math.min(enter, 1 - leave));
    n.el.style.transform = `translateX(${(1 - enter) * 140 - leave * 140}px)`;

    // Ken Burns over the scene.
    const k = clamp((t - s.from) / Math.max(1, s.to - s.from + FADE));
    const pan = s.pan ?? (i % 2 ? -1 : 1);
    n.picture.style.transform = `scale(${1.04 + 0.1 * k}) translate(${pan * (k - 0.5) * 24}px, ${(0.5 - k) * 12}px)`;
    if (s.clip) { // a clip plays (and loops) as its numbered stills
      const src = media(`${s.clip.dir}/${String((Math.floor((t - s.from) * R.fps) % s.clip.frames) + 1).padStart(4, "0")}.jpg`);
      if (!n.picture.src.endsWith(src)) { n.picture.src = src; waits.push(loaded(n.picture)); }
    }

    n.words.forEach((w, j) => {
      const p = ease((t - wordTime(s, j, n.words.length)) / 0.35);
      w.style.opacity = String(p);
      w.style.transform = `translateY(${(1 - p) * 34}px)`;
    });
    n.cards.forEach((c, j) => {
      const since = t - cardTime(s, j, n.words.length);
      c.card.style.opacity = String(clamp(since / 0.15));
      c.card.style.transform = `scale(${since <= 0 ? 0.6 : 0.6 + 0.4 * back(since / 0.45)})`;
      c.value.innerHTML = mixed(c.count ? format(c.count, c.count.number * ease(since / 0.9)) : c.text);
    });
  });
  await Promise.all(waits);
}

function events() {
  const out = [{ t: 0.02, kind: "sting" }];
  scenes.forEach((s, i) => {
    if (i > 0) out.push({ t: s.from - 0.08, kind: "whoosh" });
    nodes[i].cards.forEach((_, j) => out.push({ t: cardTime(s, j, nodes[i].words.length), kind: "pop" }));
  });
  return out;
}

/** Resolves once an image has loaded (decode() never settles in a background tab). */
function loaded(img) {
  if (img.complete && img.naturalWidth) return Promise.resolve();
  return new Promise((ok) => { img.addEventListener("load", ok, { once: true }); img.addEventListener("error", ok, { once: true }); });
}

window.reel = {
  ready: Promise.all([document.fonts.load('900 60px "Cairo"', "عاجل"), document.fonts.load('600 30px "Cairo"', "abc"), ...[...document.images].map(loaded)]).then(() => render(0)),
  seek: render,
  events,
};
