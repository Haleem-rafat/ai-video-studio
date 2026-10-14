import { FORMATS, type Channel } from "../config.ts";
import type { Project, Visual, Word } from "../types.ts";
import { captionChunks, parseCounter, placeScenes, totalSeconds, type TimedScene } from "./composition.ts";

/**
 * The explainer look: one device on a cream page for the whole video, its
 * screen changing scene by scene into an app that shows the scene's visual,
 * with a step header above and karaoke captions below. Everything is HTML and
 * one paused GSAP timeline, like composition.ts, so HyperFrames can seek it.
 *
 * Each channel's `device` picks the kit: a phone of app screens (balance,
 * stocks, reminders, messages) or a laptop of desktop windows (editor,
 * terminal, dashboard, chat). No AI pictures are used.
 */

type Device = "phone" | "laptop";

const INK = "#1c1917";
const FADED = "#cdc5ba";
const ACCENT: Record<Device, string> = { phone: "#16a34a", laptop: "#2563eb" };

type Layout = {
  device: { left: number; top: number; scale: number };
  header: { x: number; y: number; align: "center" | "left" };
  caption: { left: number; top: number; width: number; height: number; size: number; align: "center" | "left" };
  words: number;
};

/** Device sizes before scaling: the phone body, and the laptop's lid (its base hangs below). */
const PHONE = { w: 500, h: 1020 };
const LAPTOP = { w: 960, h: 600 };

function layoutFor(format: Project["format"], device: Device): Layout {
  if (format === "short") {
    // Shorts keep captions above YouTube's title overlay (bottom ~25%).
    return device === "phone"
      ? { device: { left: 270, top: 300, scale: 1.08 }, header: { x: 540, y: 90, align: "center" }, caption: { left: 70, top: 1440, width: 940, height: 210, size: 64, align: "center" }, words: 8 }
      : { device: { left: 40, top: 470, scale: 1.04 }, header: { x: 540, y: 170, align: "center" }, caption: { left: 70, top: 1230, width: 940, height: 260, size: 64, align: "center" }, words: 9 };
  }
  return device === "phone"
    ? { device: { left: 360, top: 142, scale: 0.78 }, header: { x: 1060, y: 250, align: "left" }, caption: { left: 1060, top: 420, width: 760, height: 360, size: 54, align: "left" }, words: 14 }
    : { device: { left: 90, top: 230, scale: 0.92 }, header: { x: 1150, y: 260, align: "left" }, caption: { left: 1150, top: 420, width: 680, height: 380, size: 50, align: "left" }, words: 12 };
}

const esc = (text: unknown) => String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const r = (n: number) => Math.round(n * 1000) / 1000;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Every bit of text a visual puts on screen; spoken words that match are highlighted. */
function visualText(v: Visual): string[] {
  switch (v.type) {
    case "stat":
      return [v.value, v.label];
    case "compare":
      return [v.left.label, v.left.value, v.right.label, v.right.value];
    case "chart":
      return [v.headline, ...v.bars.map((bar) => bar.label)];
    case "list":
      return [v.headline, ...v.items];
    case "quote":
      return [v.text, v.author ?? ""];
    case "code":
      return [v.headline];
    default:
      return [v.headline];
  }
}

/** The scene's headline, or its first sentence when the visual has none. */
function headlineOf(scene: { visual: Visual; narration: string }): string {
  const v = scene.visual;
  const text = v.type === "stat" ? v.label : v.type === "quote" ? (v.author ?? v.text) : v.type === "compare" ? `${v.left.label} vs ${v.right.label}` : v.headline;
  return String(text ?? "").trim() || scene.narration.split(/(?<=[.!?])\s/)[0];
}

/** A short name for a step, from its first scene. */
function stepName(scene: { visual: Visual; narration: string }): string {
  const text = headlineOf(scene);
  const words = String(text ?? "").replace(/[^\p{L}\p{N}$%£€ ]/gu, "").split(/\s+/).filter(Boolean);
  let out = "";
  for (const word of words) {
    if ((out + " " + word).trim().length > 18) break;
    out = (out + " " + word).trim();
  }
  return out || "Next";
}

type Step = { start: number; end: number; name: string };

/** Chapters when the video has them, otherwise the scenes split into 2-5 even steps. */
function stepsOf(scenes: TimedScene[], total: number): Step[] {
  let firsts = scenes.flatMap((scene, i) => (scene.visual.type === "chapter" ? [i] : []));
  if (firsts.length >= 2) {
    if (firsts[0] !== 0) firsts = [0, ...firsts];
  } else {
    const n = Math.min(5, Math.max(2, Math.round(scenes.length / 3)));
    firsts = [...new Set(Array.from({ length: n }, (_, k) => Math.round((k * scenes.length) / n)))];
  }
  return firsts.map((index, k) => ({
    start: scenes[index].start,
    end: k + 1 < firsts.length ? scenes[firsts[k + 1]].start : total,
    name: stepName(scenes[index]),
  }));
}

// ---------------------------------------------------------------- screens

type Screen = { html: string; tweens: (at: (offset: number) => number) => string[] };

function counterTween(selector: string, value: string, at: number, seconds: number): string[] {
  const parsed = parseCounter(value);
  // A year counting up from zero reads as a glitch, so it just appears.
  if (!parsed || (!parsed.prefix && !parsed.suffix && !parsed.grouping && parsed.number >= 1000 && parsed.number <= 2100)) return [];
  return [
    `{ const c = { v: 0 }; tl.to(c, { v: ${parsed.number}, duration: ${r(seconds)}, ease: "power2.out", ` +
      `onUpdate: () => { document.getElementById("${selector}").textContent = ${JSON.stringify(parsed.prefix)} + fmt(c.v, ${parsed.decimals}, ${parsed.grouping}) + ${JSON.stringify(parsed.suffix)}; } }, ${r(at)}); }`,
  ];
}

/** Points for a line chart of the bar values, in a w×h box. */
function linePoints(values: number[], w: number, h: number): [number, number][] {
  const max = Math.max(...values, 1), min = Math.min(...values, 0);
  return values.map((v, i) => [values.length === 1 ? w / 2 : (i / (values.length - 1)) * w, h - ((v - min) / (max - min || 1)) * h * 0.85 - h * 0.05]);
}

function phoneScreen(id: string, v: Visual, channel: Channel, seconds: number, headline: string, variant: number): Screen {
  const status = `<div class="ps-status"><span>9:41</span><span class="ps-icons">●●● ▮</span></div>`;
  switch (v.type) {
    case "stat":
      return {
        html: `${status}<div class="pad"><div class="enter app-title">${esc(v.label)}</div><div class="enter big" id="${id}-v">${esc(v.value)}</div>
          <svg class="enter spark" viewBox="0 0 420 120"><path id="${id}-line" pathLength="1" d="M0 100 C 60 90, 90 40, 140 60 S 230 100, 280 50 S 370 10, 420 20" /></svg>
          ${[0, 1, 2].map(() => `<div class="enter skel"><i></i><b></b><s></s></div>`).join("")}</div>`,
        tweens: (at) => [
          ...counterTween(`${id}-v`, v.value, at(0.25), Math.min(1.4, seconds * 0.5)),
          `tl.fromTo("#${id}-line", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.2, ease: "power2.out" }, ${at(0.4)});`,
        ],
      };
    case "compare": {
      const left = parseCounter(v.left.value)?.number ?? 0, right = parseCounter(v.right.value)?.number ?? 0;
      const card = (side: "l" | "r", label: string, value: string, win: boolean) =>
        `<div class="enter acct ${win ? "best" : ""}" id="${id}-${side}"><div class="muted">${esc(label)}</div><div class="mid" id="${id}-${side}v">${esc(value)}</div></div>`;
      return {
        html: `${status}<div class="pad"><div class="enter app-title">Compare</div>${card("l", v.left.label, v.left.value, left > right)}<div class="enter vs">vs</div>${card("r", v.right.label, v.right.value, right >= left)}</div>`,
        tweens: (at) => [...counterTween(`${id}-lv`, v.left.value, at(0.2), 0.9), ...counterTween(`${id}-rv`, v.right.value, at(0.6), 0.9)],
      };
    }
    case "chart": {
      const bars = v.bars.length ? v.bars : [{ label: "", value: 0 }];
      const pts = linePoints(bars.map((b) => Number(b.value) || 0), 420, 300);
      const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${r(x)} ${r(y)}`).join(" ");
      const last = bars[bars.length - 1];
      return {
        html: `${status}<div class="pad"><div class="enter app-title">${esc(v.headline)}</div><div class="enter big" id="${id}-v">${esc(last.value)}</div>
          <div class="enter muted">${esc(last.label)}</div>
          <svg class="enter chart" viewBox="-10 -10 440 330"><path class="area" d="${d} L420 300 L0 300 Z"/><path class="line" id="${id}-line" pathLength="1" d="${d}"/>
          ${pts.map(([x, y], i) => `<circle id="${id}-p${i}" cx="${r(x)}" cy="${r(y)}" r="8"/>`).join("")}</svg>
          <div class="enter xlabels">${bars.map((b) => `<span>${esc(b.label)}</span>`).join("")}</div></div>`,
        tweens: (at) => [
          ...counterTween(`${id}-v`, String(last.value), at(0.3), 1.2),
          `tl.fromTo("#${id}-line", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: ${r(Math.min(1.8, seconds * 0.5))}, ease: "power2.inOut" }, ${at(0.3)});`,
          ...pts.map((_, i) => `tl.fromTo("#${id}-p${i}", { scale: 0, transformOrigin: "50% 50%" }, { scale: 1, duration: 0.25, ease: "back.out(3)" }, ${at(0.3 + (i / Math.max(1, pts.length - 1)) * Math.min(1.8, seconds * 0.5))});`),
        ],
      };
    }
    case "list": {
      const items = v.items.length ? v.items : [v.headline];
      return {
        html: `${status}<div class="pad"><div class="enter app-title accent">Reminders</div><div class="enter h2">${esc(v.headline)}</div>
          ${items.map((item, i) => `<div class="enter todo" id="${id}-t${i}"><span class="box"><i>✓</i></span><span>${esc(item)}</span></div>`).join("")}</div>`,
        tweens: (at) => items.map((_, i) => `tl.set("#${id}-t${i}", { attr: { class: "todo done" } }, ${at(0.7 + ((seconds - 1.2) * (i + 0.6)) / items.length)});`),
      };
    }
    case "quote":
      return {
        html: `${status}<div class="msg-head enter"><span class="avatar">${esc((v.author || channel.name).slice(0, 1))}</span><b>${esc(v.author || channel.name)}</b></div>
          <div class="pad msgs"><div class="bubble typing" id="${id}-dots"><i></i><i></i><i></i></div><div class="bubble" id="${id}-q">${esc(v.text)}</div></div>`,
        tweens: (at) => [
          `tl.fromTo("#${id}-dots", { opacity: 0 }, { opacity: 1, duration: 0.2 }, ${at(0.2)});`,
          `tl.set("#${id}-dots", { display: "none" }, ${at(1.0)});`,
          `tl.fromTo("#${id}-q", { opacity: 0, y: 20, scale: 0.9, transformOrigin: "0% 100%" }, { opacity: 1, y: 0, scale: 1, duration: 0.35, ease: "back.out(2)" }, ${at(1.0)});`,
        ],
      };
    case "code":
      return {
        html: `${status}<div class="pad"><div class="enter app-title accent">Notes</div><div class="enter h2">${esc(v.headline)}</div>
          <pre class="enter mono">${v.lines.map((line, i) => `<div id="${id}-l${i}">${esc(line) || " "}</div>`).join("")}</pre></div>`,
        tweens: (at) => v.lines.map((_, i) => `tl.fromTo("#${id}-l${i}", { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.35, ease: "none" }, ${at(0.4 + i * 0.3)});`),
      };
    case "chapter":
      return {
        html: `<div class="center"><div class="enter accent kicker">Part ${v.number}</div><div class="enter h1">${esc(v.headline)}</div></div>`,
        tweens: () => [],
      };
    default:
      // Headlines are the most common scene, so they rotate between three screens.
      if (variant % 3 === 1) {
        return {
          html: `${status}<div class="pad"><div class="enter app-title accent">News</div><div class="enter news-img"></div>
            <div class="enter h2">${esc(headline)}</div><div class="enter muted">${esc(channel.name)} · 2 min read</div>
            ${[0, 1].map(() => `<div class="enter skel"><b></b></div>`).join("")}</div>`,
          tweens: () => [],
        };
      }
      if (variant % 3 === 2) {
        return {
          html: `${status}<div class="pad"><div class="enter app-title" style="color:#d4a017">Notes</div><div class="enter note">${esc(headline)}</div></div>`,
          tweens: (at) => [`tl.fromTo("#${id} .note", { clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0% 0)", duration: 0.8, ease: "power2.out" }, ${at(0.2)});`],
        };
      }
      return {
        html: `<div class="lock"><div class="enter clock">9:41</div><div class="enter date">${esc(channel.name)}</div>
          <div class="notif" id="${id}-n"><span class="app-icon">$</span><div><div class="muted small">${esc(channel.name)} · now</div><div class="notif-text">${esc(headline)}</div></div></div></div>`,
        tweens: (at) => [`tl.fromTo("#${id}-n", { y: -80, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "back.out(1.6)" }, ${at(0.35)});`],
      };
  }
}

function laptopScreen(id: string, v: Visual, channel: Channel, seconds: number, headline: string, variant: number): Screen {
  const menu = (app: string) => `<div class="menubar"><b>${esc(app)}</b><span>File</span><span>Edit</span><span>View</span><em>9:41</em></div>`;
  const win = (title: string, body: string, cls = "") =>
    `<div class="win enter ${cls}"><div class="titlebar"><i></i><i></i><i></i><span>${esc(title)}</span></div><div class="win-body">${body}</div></div>`;
  switch (v.type) {
    case "code":
      return {
        html: `${menu("Code")}${win(
          "index.ts",
          `<div class="tab">${esc(v.headline)}</div><pre class="editor">${v.lines
            .map((line, i) => `<div><span class="ln">${i + 1}</span><span id="${id}-l${i}">${esc(line) || " "}</span></div>`)
            .join("")}</pre>`,
          "wide",
        )}`,
        tweens: (at) => v.lines.map((_, i) => `tl.fromTo("#${id}-l${i}", { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.4, ease: "none" }, ${at(0.4 + i * Math.min(0.5, (seconds - 1) / Math.max(1, v.lines.length)))});`),
      };
    case "list": {
      const items = v.items.length ? v.items : [v.headline];
      return {
        html: `${menu("Terminal")}${win(
          "zsh",
          `<pre class="term"><div class="dim"># ${esc(v.headline)}</div>${items.map((item, i) => `<div id="${id}-t${i}"><span class="ok">✓</span> ${esc(item)}</div>`).join("")}<div class="prompt">$ <span class="cursor"></span></div></pre>`,
          "wide dark",
        )}`,
        tweens: (at) => items.map((_, i) => `tl.fromTo("#${id}-t${i}", { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.2 }, ${at(0.6 + ((seconds - 1.2) * i) / items.length)});`),
      };
    }
    case "stat":
      return {
        html: `${menu("Safari")}${win(
          "dashboard",
          `<div class="dash"><div class="muted">${esc(v.label)}</div><div class="big" id="${id}-v">${esc(v.value)}</div>
          <div class="minibars">${[40, 55, 48, 70, 62, 85, 100].map((h, i) => `<i id="${id}-b${i}" style="height:${h}%"></i>`).join("")}</div></div>`,
          "wide",
        )}`,
        tweens: (at) => [
          ...counterTween(`${id}-v`, v.value, at(0.3), Math.min(1.4, seconds * 0.5)),
          `tl.fromTo("#${id} .minibars i", { scaleY: 0, transformOrigin: "50% 100%" }, { scaleY: 1, duration: 0.5, stagger: 0.06, ease: "power3.out" }, ${at(0.4)});`,
        ],
      };
    case "compare": {
      const left = parseCounter(v.left.value)?.number ?? 0, right = parseCounter(v.right.value)?.number ?? 0;
      const card = (side: "l" | "r", label: string, value: string, win: boolean) =>
        `<div class="cmp ${win ? "best" : ""}"><div class="muted">${esc(label)}</div><div class="mid" id="${id}-${side}v">${esc(value)}</div></div>`;
      return {
        html: `${menu("Safari")}${win("compare", `<div class="cmp-row">${card("l", v.left.label, v.left.value, left > right)}<div class="vs">vs</div>${card("r", v.right.label, v.right.value, right >= left)}</div>`, "wide")}`,
        tweens: (at) => [...counterTween(`${id}-lv`, v.left.value, at(0.3), 0.9), ...counterTween(`${id}-rv`, v.right.value, at(0.7), 0.9)],
      };
    }
    case "chart": {
      const bars = v.bars.length ? v.bars : [{ label: "", value: 0 }];
      const max = Math.max(...bars.map((b) => Number(b.value) || 0), 1);
      return {
        html: `${menu("Numbers")}${win(
          v.headline,
          `<div class="vbars">${bars
            .map((b, i) => `<div class="vbar"><em>${esc(b.value)}</em><i id="${id}-b${i}" style="height:${Math.max(4, ((Number(b.value) || 0) / max) * 100)}%"></i><span>${esc(b.label)}</span></div>`)
            .join("")}</div>`,
          "wide",
        )}`,
        tweens: (at) => [`tl.fromTo("#${id} .vbar i", { scaleY: 0, transformOrigin: "50% 100%" }, { scaleY: 1, duration: 0.6, stagger: 0.15, ease: "power3.out" }, ${at(0.4)});`],
      };
    }
    case "quote":
      return {
        html: `${menu("Chat")}${win(
          "# general",
          `<div class="chat"><aside><b>${esc(channel.name)}</b><span># general</span><span># jobs</span><span># random</span></aside>
          <div class="chat-main"><div class="chat-msg" id="${id}-m"><span class="avatar">${esc((v.author || "D").slice(0, 1))}</span><div><b>${esc(v.author || "Dev")}</b> <small>now</small><p>${esc(v.text)}</p></div></div></div></div>`,
          "wide",
        )}`,
        tweens: (at) => [`tl.fromTo("#${id}-m", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" }, ${at(0.5)});`],
      };
    case "chapter":
      return { html: `${menu("Finder")}<div class="center"><div class="card enter"><div class="accent kicker">Part ${v.number}</div><div class="h1">${esc(v.headline)}</div></div></div>`, tweens: () => [] };
    default:
      if (variant % 2 === 1) {
        return {
          html: `${menu("Safari")}${win("blog", `<div class="article"><div class="accent kicker">${esc(channel.name)}</div><div class="h2">${esc(headline)}</div>${[0, 1, 2].map(() => `<div class="skel"><b></b></div>`).join("")}</div>`, "wide")}`,
          tweens: () => [],
        };
      }
      return {
        html: `${menu("Finder")}<div class="banner" id="${id}-n"><span class="app-icon">▶</span><div><div class="muted small">${esc(channel.name)} · now</div><div class="notif-text">${esc(headline)}</div></div></div>
          <div class="center"><div class="h1 enter on-wall">${esc(headline)}</div></div>`,
        tweens: (at) => [`tl.fromTo("#${id}-n", { x: 120, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, ease: "power3.out" }, ${at(0.3)});`],
      };
  }
}

// ---------------------------------------------------------------- page

export function buildExplainer(project: Project, channel: Channel): string {
  const device: Device = channel.device ?? "phone";
  const accent = ACCENT[device];
  const { width, height } = FORMATS[project.format];
  const layout = layoutFor(project.format, device);
  const scenes = placeScenes(project.scenes);
  const total = totalSeconds(scenes);
  const steps = stepsOf(scenes, total);
  const t: string[] = [];

  // Screens: one clip per scene inside the device, so the device itself never cuts.
  let titles = 0;
  const screens = scenes.map((scene) => {
    const id = `sc-${scene.id}`;
    const variant = scene.visual.type === "title" ? titles++ : 0;
    const screen = (device === "phone" ? phoneScreen : laptopScreen)(id, scene.visual, channel, scene.duration, headlineOf(scene), variant);
    const at = (offset: number) => r(scene.start + offset);
    t.push(`tl.fromTo("#${id} .enter", { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, stagger: 0.08, ease: "power3.out" }, ${at(0.02)});`);
    t.push(...screen.tweens(at));
    return `<div class="clip screen" id="${id}" data-start="${scene.start}" data-duration="${scene.duration}" data-track-index="1">${screen.html}</div>`;
  });

  // Header: "1/4 · Name" with a filling bar, and a chip per step that turns green when done.
  const labels = steps.map((step, i) => {
    t.push(`tl.fromTo("#lb-${i}", { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.3 }, ${r(step.start)});`);
    if (i + 1 < steps.length) t.push(`tl.set("#lb-${i}", { opacity: 0 }, ${r(step.end)});`);
    t.push(`tl.fromTo("#lb-${i} i", { scaleX: 0 }, { scaleX: 1, duration: ${r(step.end - step.start)}, ease: "none" }, ${r(step.start)});`);
    t.push(`tl.set("#ch-${i}", { attr: { class: "chip current" } }, ${r(step.start)});`);
    t.push(`tl.set("#ch-${i}", { attr: { class: "chip done" } }, ${r(step.end - 0.05)});`);
    t.push(`tl.fromTo("#ch-${i}", { scale: 1 }, { scale: 1.15, duration: 0.12, yoyo: true, repeat: 1 }, ${r(step.end - 0.05)});`);
    return `<div class="label" id="lb-${i}"><b>${i + 1}/${steps.length}</b> · ${esc(step.name)}<i></i></div>`;
  });
  const chips = steps.map((_, i) => `<span class="chip" id="ch-${i}"><em>${i + 1}</em><strong>✓</strong></span>`).join("");

  // Karaoke captions: faded until spoken; words that are on screen light up in the accent.
  const captions = scenes.map((scene) => {
    const keys = new Set(visualText(scene.visual).flatMap((text) => String(text).split(/\s+/)).map(norm).filter((w) => w.length >= 4 || /^\d+$/.test(w)));
    const chunks = captionChunks(scene.words as Word[], layout.words);
    return chunks
      .map((chunk, ci) => {
        const show = r(scene.start + chunk[0].start);
        const next = chunks[ci + 1];
        const hide = r(next ? scene.start + next[0].start : scene.start + scene.duration);
        t.push(`tl.fromTo("#cp-${scene.id}-${ci}", { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.18 }, ${show});`);
        t.push(`tl.set("#cp-${scene.id}-${ci}", { opacity: 0 }, ${hide});`);
        const spans = chunk.map((word, wi) => {
          const key = keys.has(norm(word.text));
          t.push(`tl.set("#cp-${scene.id}-${ci}-${wi}", ${key ? "{ opacity: 1 }" : `{ color: "${INK}" }`}, ${r(scene.start + word.start)});`);
          return `<span id="cp-${scene.id}-${ci}-${wi}" class="${key ? "kw" : ""}">${esc(word.text)}</span>`;
        });
        return `<p class="cap" id="cp-${scene.id}-${ci}">${spans.join(" ")}</p>`;
      })
      .join("");
  });

  // The ending: a Subscribe button the cursor clicks.
  const cta = Math.max(0, total - 2.6);
  t.push(`tl.fromTo("#cta", { opacity: 0, y: 20, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.35, ease: "back.out(2)" }, ${r(cta)});`);
  t.push(`tl.fromTo("#cursor", { opacity: 0, x: 160, y: 120 }, { opacity: 1, x: 0, y: 0, duration: 0.6, ease: "power2.out" }, ${r(cta + 0.3)});`);
  t.push(`tl.to("#cta", { scale: 0.94, duration: 0.08, yoyo: true, repeat: 1 }, ${r(cta + 0.95)});`);
  t.push(`tl.set("#cta", { attr: { class: "cta done" } }, ${r(cta + 1.0)});`);

  const audio = scenes
    .map((scene) => `<audio id="${scene.id}-voice" data-start="${scene.start}" data-duration="${r(scene.audioSeconds)}" data-track-index="2" src="${scene.audio!.path}"></audio>`)
    .join("\n      ");

  const d = layout.device, h = layout.header, c = layout.caption;
  const deviceBox = device === "phone" ? PHONE : LAPTOP;
  const headerAlign = h.align === "center" ? `left:${h.x}px; transform:translateX(-50%); align-items:center;` : `left:${h.x}px; align-items:flex-start;`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${width}, height=${height}" />
    <title>${esc(project.title)}</title>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700;800&family=JetBrains+Mono:wght@500&display=block" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #fbf4ea; }
      #root { position: relative; width: ${width}px; height: ${height}px; overflow: hidden; font-family: Inter, -apple-system, sans-serif; color: ${INK};
        background: radial-gradient(ellipse at 50% 35%, #fffaf3 0%, #fbf4ea 55%, #f5ecdf 100%); }
      .accent { color: ${accent}; }
      .muted { color: #8a8178; } .small { font-size: 20px; }
      .mono, pre { font-family: "JetBrains Mono", ui-monospace, monospace; }

      #header { position: absolute; top: ${h.y}px; ${headerAlign} display: flex; flex-direction: column; gap: 22px; z-index: 5; }
      .labels { position: relative; height: 74px; min-width: 300px; }
      .label { position: absolute; ${h.align === "center" ? "left: 50%; transform: translateX(-50%);" : "left: 0;"} top: 0; white-space: nowrap; opacity: 0;
        background: #fff; border-radius: 999px; padding: 14px 30px 18px; font-size: 36px; font-weight: 700; box-shadow: 0 6px 20px #0000000f; }
      .label b { color: ${accent}; }
      .label i { position: absolute; left: 22px; right: 22px; bottom: -10px; height: 5px; border-radius: 3px; background: ${accent}; transform-origin: left center; }
      .chips { display: flex; gap: 12px; align-items: center; }
      .series { background: ${INK}; color: #fff; border-radius: 16px; padding: 16px 22px; font-size: 26px; font-weight: 700; white-space: nowrap; }
      .chip { width: 66px; height: 66px; border-radius: 16px; border: 2px dashed #d9cfc2; display: grid; place-items: center; font-size: 26px; font-weight: 700; color: #b3a99c; background: #fffaf3; }
      .chip strong { display: none; }
      .chip.current { border-color: ${accent}; color: ${accent}; }
      .chip.done { border: 0; background: ${accent}; color: #fff; box-shadow: 0 6px 16px ${accent}55; }
      .chip.done em { display: none; } .chip.done strong { display: block; }

      #device { position: absolute; left: ${d.left}px; top: ${d.top}px; width: ${deviceBox.w}px; height: ${deviceBox.h}px; transform: scale(${d.scale}); transform-origin: top left; }
      .phone { width: 500px; height: 1020px; border-radius: 76px; background: #1c1c1e; padding: 12px; box-shadow: 0 40px 80px #3b2a1a2e, inset 0 0 0 2px #3a3a3c; }
      .phone .glass { position: relative; width: 100%; height: 100%; border-radius: 64px; overflow: hidden; background: #fff; }
      .island { position: absolute; top: 16px; left: 50%; transform: translateX(-50%); width: 140px; height: 40px; border-radius: 22px; background: #000; z-index: 4; }
      .lid { width: 960px; height: 600px; border-radius: 26px; background: #1c1c1e; padding: 14px; box-shadow: 0 40px 80px #3b2a1a2e; }
      .lid .glass { position: relative; width: 100%; height: 100%; border-radius: 12px; overflow: hidden; background: linear-gradient(135deg, #f8c8a8 0%, #f293b8 50%, #b9a6f5 100%); }
      .base { width: 1100px; height: 28px; margin-left: -70px; border-radius: 0 0 26px 26px; background: linear-gradient(#e7e2db, #cfc8bf); box-shadow: 0 20px 40px #3b2a1a22; }

      .screen { position: absolute; inset: 0; }
      .pad { padding: 30px 34px; display: flex; flex-direction: column; gap: 20px; }
      .ps-status { display: flex; justify-content: space-between; padding: 22px 44px 0; font-size: 22px; font-weight: 700; height: 70px; }
      .ps-icons { letter-spacing: 2px; font-size: 14px; }
      .app-title { font-size: 30px; font-weight: 700; color: #8a8178; text-transform: none; }
      .big { font-size: 110px; font-weight: 800; letter-spacing: -2px; font-variant-numeric: tabular-nums; }
      .mid { font-size: 60px; font-weight: 800; letter-spacing: -1px; font-variant-numeric: tabular-nums; }
      .h1 { font-size: 56px; font-weight: 800; line-height: 1.1; letter-spacing: -1px; text-align: center; }
      .h2 { font-size: 50px; font-weight: 800; line-height: 1.15; }
      .kicker { font-size: 28px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
      .center { position: absolute; inset: 60px 30px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; }
      .spark { width: 100%; height: 130px; }
      .spark path, .chart .line { fill: none; stroke: ${accent}; stroke-width: 6; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 1; }
      .chart { width: 100%; height: 300px; overflow: visible; } .chart .area { fill: ${accent}14; } .chart circle { fill: #fff; stroke: ${accent}; stroke-width: 5; }
      .xlabels { display: flex; justify-content: space-between; font-size: 20px; color: #8a8178; font-weight: 600; }
      .skel { display: flex; align-items: center; gap: 16px; padding: 18px 0; border-top: 1px solid #f0ebe4; }
      .skel i { width: 52px; height: 52px; border-radius: 14px; background: #f3eee7; } .skel b { flex: 1; height: 18px; border-radius: 9px; background: #f3eee7; } .skel s { width: 80px; height: 18px; border-radius: 9px; background: #f3eee7; }
      .acct { border: 2px solid #eee7de; border-radius: 28px; padding: 28px; display: grid; gap: 6px; font-size: 24px; }
      .acct.best, .cmp.best { border-color: ${accent}; box-shadow: 0 10px 30px ${accent}26; } .acct.best .mid, .cmp.best .mid { color: ${accent}; }
      .vs { align-self: center; font-weight: 800; color: #b3a99c; font-size: 24px; }
      .todo { display: flex; gap: 18px; align-items: center; font-size: 36px; font-weight: 600; padding: 14px 0; border-bottom: 1px solid #f0ebe4; }
      .todo .box { width: 40px; height: 40px; border-radius: 50%; border: 3px solid #d6cdc2; display: grid; place-items: center; flex: none; }
      .todo .box i { font-style: normal; color: #fff; font-size: 22px; display: none; }
      .todo.done .box { background: ${accent}; border-color: ${accent}; } .todo.done .box i { display: block; } .todo.done span:last-child { color: #8a8178; }
      .msg-head { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 6px 0 18px; border-bottom: 1px solid #f0ebe4; font-size: 22px; }
      .avatar { width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(#cfc6ba, #a99f92); color: #fff; display: grid; place-items: center; font-weight: 800; font-size: 28px; flex: none; }
      .msgs { padding-top: 40px; }
      .bubble { align-self: flex-start; max-width: 85%; background: #ece7e0; border-radius: 30px 30px 30px 8px; padding: 22px 28px; font-size: 32px; font-weight: 600; line-height: 1.25; opacity: 0; }
      .bubble.typing { display: flex; gap: 8px; padding: 26px 28px; } .typing i { width: 14px; height: 14px; border-radius: 50%; background: #a99f92; }
      .lock { position: absolute; inset: 0; background: linear-gradient(160deg, #f8c8a8 0%, #f293b8 55%, #b9a6f5 100%); color: #fff; display: flex; flex-direction: column; align-items: center; padding-top: 150px; }
      .clock { font-size: 130px; font-weight: 700; letter-spacing: -3px; } .date { font-size: 26px; font-weight: 600; margin-top: -6px; }
      .notif { margin-top: 70px; width: 430px; background: #ffffffe6; color: ${INK}; border-radius: 30px; padding: 22px; display: flex; gap: 16px; box-shadow: 0 20px 40px #0000001a; }
      .notif-text { font-size: 32px; font-weight: 700; line-height: 1.2; margin-top: 4px; }
      .app-icon { width: 58px; height: 58px; border-radius: 15px; background: ${accent}; color: #fff; display: grid; place-items: center; font-weight: 800; font-size: 28px; flex: none; }

      .menubar { height: 32px; background: #ffffffb3; display: flex; align-items: center; gap: 22px; padding: 0 18px; font-size: 15px; }
      .menubar em { margin-left: auto; font-style: normal; font-weight: 600; }
      .win { position: absolute; left: 50%; top: 62px; transform: translateX(-50%); width: 560px; background: #fff; border-radius: 14px; box-shadow: 0 24px 50px #0000002e; overflow: hidden; }
      .win.wide { width: 820px; }
      .titlebar { height: 38px; display: flex; align-items: center; gap: 8px; padding: 0 14px; background: #f6f3ef; border-bottom: 1px solid #ebe6df; font-size: 17px; color: #8a8178; }
      .titlebar i { width: 12px; height: 12px; border-radius: 50%; background: #ff5f57; } .titlebar i:nth-child(2) { background: #febc2e; } .titlebar i:nth-child(3) { background: #28c840; }
      .titlebar span { margin-left: 12px; font-weight: 600; }
      .win-body { min-height: 380px; }
      .dark .titlebar { background: #2b2b2b; border-color: #333; color: #aaa; } .dark .win-body { background: #1e1e1e; }
      .tab { padding: 10px 18px; font-size: 20px; font-weight: 600; color: #8a8178; border-bottom: 1px solid #eee; }
      .editor { margin: 0; padding: 18px 0; font-size: 27px; line-height: 1.6; }
      .editor > div { display: flex; white-space: pre-wrap; padding-right: 24px; }
      .editor .ln { flex: none; display: inline-block; width: 56px; text-align: right; padding-right: 18px; color: #c9c1b6; }
      .term { margin: 0; padding: 22px 26px; font-size: 27px; line-height: 1.7; color: #e7e2db; }
      .term .dim { color: #8f8a83; } .term .ok { color: #4ade80; } .term .prompt { color: #8f8a83; }
      .cursor { display: inline-block; width: 12px; height: 24px; background: #e7e2db; vertical-align: middle; }
      .dash { padding: 34px 40px; display: grid; gap: 10px; font-size: 26px; }
      .minibars { display: flex; align-items: flex-end; gap: 14px; height: 140px; margin-top: 18px; } .minibars i { flex: 1; border-radius: 8px 8px 0 0; background: ${accent}; opacity: 0.85; }
      .cmp-row { display: flex; align-items: center; gap: 24px; padding: 50px 40px; }
      .cmp { flex: 1; border: 2px solid #eee7de; border-radius: 22px; padding: 28px; display: grid; gap: 8px; font-size: 26px; }
      .vbars { display: flex; align-items: flex-end; gap: 30px; height: 380px; padding: 30px 50px 20px; }
      .vbar { flex: 1; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 10px; font-size: 22px; font-weight: 700; }
      .vbar i { width: 100%; border-radius: 10px 10px 0 0; background: ${accent}; } .vbar em { font-style: normal; } .vbar span { color: #8a8178; }
      .chat { display: flex; min-height: 380px; } .chat aside { width: 190px; background: #3f0e40; color: #e9dfe9; padding: 18px; display: flex; flex-direction: column; gap: 10px; font-size: 16px; }
      .chat-main { flex: 1; padding: 30px; } .chat-msg { display: flex; gap: 16px; font-size: 18px; } .chat-msg p { margin: 6px 0 0; font-size: 30px; font-weight: 600; line-height: 1.35; }
      .chat-msg .avatar { width: 52px; height: 52px; border-radius: 12px; font-size: 22px; }
      .banner { position: absolute; top: 46px; right: 18px; width: 380px; background: #ffffffeb; border-radius: 18px; padding: 14px; display: flex; gap: 12px; box-shadow: 0 16px 30px #0000001f; z-index: 3; }
      .banner .app-icon { width: 46px; height: 46px; border-radius: 12px; font-size: 20px; } .banner .notif-text { font-size: 22px; }
      .card { background: #fff; border-radius: 26px; padding: 40px 50px; display: grid; gap: 14px; justify-items: center; box-shadow: 0 24px 50px #0000002e; max-width: 760px; }
      .news-img { height: 300px; border-radius: 24px; background: linear-gradient(135deg, #fde68a, #f9a8d4 60%, #c4b5fd); }
      .note { font-size: 54px; font-weight: 800; line-height: 1.15; letter-spacing: -1px; }
      .article { padding: 34px 44px; display: grid; gap: 16px; }
      .on-wall { color: #fff; text-shadow: 0 6px 30px #00000033; font-size: 64px; max-width: 760px; }

      #captions { position: absolute; left: ${c.left}px; top: ${c.top}px; width: ${c.width}px; height: ${c.height}px; z-index: 5; }
      .cap { position: absolute; inset: 0; margin: 0; display: flex; flex-wrap: wrap; align-content: ${c.align === "center" ? "center" : "flex-start"}; justify-content: ${c.align === "center" ? "center" : "flex-start"};
        column-gap: 0.28em; font-size: ${c.size}px; font-weight: 700; line-height: 1.22; letter-spacing: -0.5px; color: ${FADED}; opacity: 0; text-align: ${c.align}; }
      .cap .kw { color: ${accent}; opacity: 0.45; }

      .cta { position: absolute; left: ${h.align === "center" ? width / 2 : c.left}px; top: ${c.top + c.height + 20}px; ${h.align === "center" ? "transform: translateX(-50%);" : ""}
        background: #ff0033; color: #fff; border-radius: 999px; padding: 18px 40px; font-size: 32px; font-weight: 800; opacity: 0; z-index: 6; white-space: nowrap; }
      .cta .after { display: none; } .cta.done { background: #e9e3da; color: ${INK}; } .cta.done .before { display: none; } .cta.done .after { display: inline; }
      #cursor { position: absolute; right: -26px; bottom: -34px; width: 44px; opacity: 0; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-width="${width}" data-height="${height}">
      <div id="header">
        <div class="labels">${labels.join("")}</div>
        <div class="chips"><span class="series">${esc(channel.name)}</span>${chips}</div>
      </div>
      <div id="device">
        ${
          device === "phone"
            ? `<div class="phone"><div class="glass"><div class="island"></div>${screens.join("")}</div></div>`
            : `<div class="lid"><div class="glass">${screens.join("")}</div></div><div class="base"></div>`
        }
      </div>
      <div id="captions">${captions.join("")}</div>
      <div class="cta" id="cta"><span class="before">Subscribe</span><span class="after">Subscribed ✓</span>
        <svg id="cursor" viewBox="0 0 24 24"><path d="M4 2 L4 20 L9 15 L12 22 L15 21 L12 14 L19 14 Z" fill="#111" stroke="#fff" stroke-width="1.5"/></svg></div>
      ${audio}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      const fmt = (n, d, g) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: g });
      ${t.join("\n      ")}
      window.__timelines.main = tl;
    </script>
  </body>
</html>
`;
}
