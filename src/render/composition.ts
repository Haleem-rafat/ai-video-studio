import { FORMATS, type Channel } from "../config.ts";
import type { FormatId, Project, Scene, Visual, Word } from "../types.ts";
import { mascotSvg } from "./mascots.ts";

/** Seconds each scene stays on screen under the next one while it wipes in. */
const TRANSITION = 0.45;
/** Breathing room after each line so cuts never clip the last word. */
const SCENE_GAP = 0.3;
/** Most words a caption shows at once; Shorts read best in small bites. */
const CAPTION_WORDS = { short: 4, long: 8 };

export type TimedScene = Scene & { start: number; duration: number; audioSeconds: number; words: Word[] };

export function placeScenes(scenes: Scene[]): TimedScene[] {
  let cursor = 0;

  return scenes.map((scene) => {
    if (!scene.audio) throw new Error(`${scene.id} has no narration audio yet.`);

    const duration = r(scene.audio.seconds + SCENE_GAP);
    const placed = { ...scene, start: r(cursor), duration, audioSeconds: scene.audio.seconds, words: scene.audio.words };
    cursor += duration;
    return placed;
  });
}

export function totalSeconds(scenes: TimedScene[]): number {
  return r(scenes.reduce((sum, scene) => sum + scene.duration, 0));
}

/**
 * Builds the HyperFrames index.html. Every animation is one tween on a single
 * paused GSAP timeline, so each frame is seekable and the render deterministic.
 */
export function buildComposition(project: Project, channel: Channel): string {
  const format = project.format;
  const { width, height } = FORMATS[format];
  const u = Math.min(width, height) / 1080;
  const scenes = placeScenes(project.scenes);
  const total = totalSeconds(scenes);
  const isShort = format === "short";
  const c = channel.colors;
  const t: string[] = [];

  // Persistent layer: progress bar and the mascot's idle life.
  t.push(`tl.fromTo("#progress", { scaleX: 0 }, { scaleX: 1, duration: ${total}, ease: "none" }, 0);`);
  t.push(`tl.fromTo("#mascot", { y: ${300 * u}, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: "back.out(1.6)" }, 0.1);`);
  t.push(`tl.to("#m-body", { y: ${-10 * u}, duration: 0.9, ease: "sine.inOut", yoyo: true, repeat: ${Math.max(1, Math.floor(total / 0.9) - 1)} }, 0.7);`);
  for (let blink = 2.3; blink < total - 0.2; blink += 3.7) {
    t.push(`tl.to("#m-eyes", { scaleY: 0.1, duration: 0.07, yoyo: true, repeat: 1 }, ${r(blink)});`);
  }

  const sections = scenes.map((scene, index) => {
    const isLast = index === scenes.length - 1;
    t.push(...sceneTweens(scene, index, u));
    t.push(...mouthTweens(scene));
    if (["stat", "compare", "chart", "chapter"].includes(scene.visual.type)) {
      t.push(`tl.to("#mascot", { y: ${-50 * u}, duration: 0.18, yoyo: true, repeat: 1, ease: "power2.out" }, ${r(scene.start + 0.15)});`);
    }

    const chunks = captionChunks(scene.words, CAPTION_WORDS[format]);
    chunks.forEach((chunk, chunkIndex) => {
      const show = r(scene.start + chunk[0].start);
      const next = chunks[chunkIndex + 1];
      const hide = r(next ? scene.start + next[0].start : scene.start + scene.duration);
      t.push(`tl.fromTo("#${scene.id}-c${chunkIndex}", { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.12, ease: "back.out(2)" }, ${show});`);
      t.push(`tl.set("#${scene.id}-c${chunkIndex}", { opacity: 0 }, ${hide});`);
      chunk.forEach((word, wordIndex) => {
        t.push(`tl.set("#${scene.id}-c${chunkIndex}w${wordIndex}", { color: "${c.accent}" }, ${r(scene.start + word.start)});`);
        t.push(`tl.set("#${scene.id}-c${chunkIndex}w${wordIndex}", { color: "${c.text}" }, ${r(scene.start + word.end + 0.02)});`);
      });
    });

    const background = scene.image
      ? `<div id="${scene.id}-bg" class="bg" style="background-image:url('${scene.image.path}')"></div><div class="shade"></div>`
      : `<div class="bg plain"></div>`;

    return `
      <section id="${scene.id}" class="clip scene" style="z-index:${index + 1}" data-start="${scene.start}" data-duration="${isLast ? scene.duration : r(scene.duration + TRANSITION)}" data-track-index="1">
        ${background}
        <div id="${scene.id}-stage" class="stage">${visualHtml(scene.id, scene.visual)}</div>
        <div class="caption">${chunks
          .map((chunk, chunkIndex) => `<div id="${scene.id}-c${chunkIndex}" class="chunk"><p>${chunk
            .map((word, wordIndex) => `<span id="${scene.id}-c${chunkIndex}w${wordIndex}">${escapeHtml(word.text)}</span>`)
            .join(" ")}</p></div>`)
          .join("")}</div>
      </section>
      <audio id="${scene.id}-voice" data-start="${scene.start}" data-duration="${r(scene.audioSeconds)}" data-track-index="2" src="${scene.audio!.path}"></audio>`;
  });

  // Shorts keep everything clear of YouTube's own buttons (right edge) and
  // title overlay (bottom ~400px).
  const layout = isShort
    ? { stageTop: 170, stageBottom: 820, captionLeft: 300, captionRight: 150, captionBottom: 470, mascotLeft: 40, mascotBottom: 430, mascotWidth: 250 }
    : { stageTop: 90, stageBottom: 250, captionLeft: 260, captionRight: 160, captionBottom: 50, mascotLeft: 40, mascotBottom: 30, mascotWidth: 190 };

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${width}, height=${height}" />
    <title>${escapeHtml(project.title)}</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      body { margin: 0; background: ${c.background}; }
      #root { position: relative; width: ${width}px; height: ${height}px; overflow: hidden; background: ${c.background}; color: ${c.text}; font-family: ${channel.font}; }
      #progress { position: absolute; top: 0; left: 0; width: 100%; height: ${8 * u}px; background: ${c.accent}; transform-origin: left center; z-index: 1000; }
      #brand { position: absolute; top: ${30 * u}px; left: 0; right: 0; text-align: center; z-index: 1000; font-size: ${28 * u}px; letter-spacing: 0.25em; text-transform: uppercase; color: ${c.text}; opacity: 0.75; text-shadow: 0 2px 8px #000a; }
      #mascot { position: absolute; left: ${layout.mascotLeft * u}px; bottom: ${layout.mascotBottom * u}px; width: ${layout.mascotWidth * u}px; height: ${layout.mascotWidth * 1.2 * u}px; z-index: 1000; filter: drop-shadow(0 ${10 * u}px ${18 * u}px #0008); }
      .scene { position: absolute; inset: 0; overflow: hidden; background: ${c.background}; }
      .bg { position: absolute; inset: -4%; background-size: cover; background-position: center; }
      .bg.plain { background: radial-gradient(circle at 50% 35%, ${c.panel} 0%, ${c.background} 75%); }
      .shade { position: absolute; inset: 0; background: linear-gradient(to bottom, ${c.background}99 0%, ${c.background}c0 45%, ${c.background}ee 100%); }
      .stage { position: absolute; left: ${70 * u}px; right: ${70 * u}px; top: ${layout.stageTop * u}px; bottom: ${layout.stageBottom * u}px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: ${30 * u}px; text-shadow: 0 ${3 * u}px ${14 * u}px ${c.background}; }
      .headline { font-size: ${(isShort ? 96 : 84) * u}px; font-weight: 800; line-height: 1.08; margin: 0; }
      .kicker { font-size: ${40 * u}px; letter-spacing: 0.3em; text-transform: uppercase; color: ${c.accent}; font-weight: 700; }
      .rule { width: ${260 * u}px; height: ${8 * u}px; background: ${c.accent}; border-radius: ${4 * u}px; transform-origin: left center; }
      .value { font-size: ${(isShort ? 210 : 180) * u}px; font-weight: 900; color: ${c.accent}; line-height: 1; }
      .label { font-size: ${52 * u}px; max-width: 92%; font-weight: 600; }
      .items { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: ${22 * u}px; width: 100%; max-width: ${900 * u}px; }
      .item { font-size: ${54 * u}px; font-weight: 600; background: ${c.panel}e6; border-left: ${12 * u}px solid ${c.accent}; padding: ${20 * u}px ${34 * u}px; border-radius: ${14 * u}px; text-align: left; text-shadow: none; }
      .quote { font-size: ${74 * u}px; font-style: italic; font-weight: 700; line-height: 1.2; }
      .quote::before { content: "\\201C"; color: ${c.accent}; }
      .quote::after { content: "\\201D"; color: ${c.accent}; }
      .author { font-size: ${44 * u}px; color: ${c.accent}; }
      .code { font-family: 'SF Mono', Menlo, monospace; font-size: ${36 * u}px; text-align: left; white-space: pre-wrap; overflow-wrap: anywhere; background: ${c.panel}f0; padding: ${34 * u}px; border-radius: ${16 * u}px; margin: 0; border: ${3 * u}px solid ${c.accent}; max-width: 100%; text-shadow: none; }
      .compare { display: flex; align-items: center; gap: ${30 * u}px; width: 100%; justify-content: center; }
      .side { flex: 1; max-width: ${420 * u}px; background: ${c.panel}e6; border-radius: ${24 * u}px; padding: ${40 * u}px ${20 * u}px; text-shadow: none; }
      .side .v { font-size: ${110 * u}px; font-weight: 900; line-height: 1; }
      .side .l { font-size: ${44 * u}px; margin-top: ${16 * u}px; font-weight: 600; }
      .side.win { border: ${5 * u}px solid ${c.accent}; } .side.win .v { color: ${c.accent}; }
      .side.lose .v { color: ${c.muted}; }
      .vs { font-size: ${48 * u}px; font-weight: 900; color: ${c.background}; background: ${c.accent}; border-radius: 50%; width: ${110 * u}px; height: ${110 * u}px; display: grid; place-items: center; flex: none; text-shadow: none; }
      .bars { width: 100%; max-width: ${900 * u}px; display: flex; flex-direction: column; gap: ${22 * u}px; }
      .bar-row { display: grid; grid-template-columns: ${200 * u}px 1fr; align-items: center; gap: ${20 * u}px; font-size: ${42 * u}px; font-weight: 700; text-align: right; }
      .bar { height: ${80 * u}px; background: ${c.accent}; border-radius: ${10 * u}px; transform-origin: left center; display: flex; align-items: center; justify-content: flex-end; padding-right: ${18 * u}px; color: ${c.background}; text-shadow: none; box-sizing: border-box; }
      .caption { position: absolute; left: ${layout.captionLeft * u}px; right: ${layout.captionRight * u}px; bottom: ${layout.captionBottom * u}px; height: ${(isShort ? 260 : 150) * u}px; }
      .chunk { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; text-align: center; opacity: 0; background: ${c.panel}f2; border-radius: ${28 * u}px; padding: 0 ${30 * u}px; font-size: ${(isShort ? 66 : 50) * u}px; font-weight: 800; line-height: 1.15; color: ${c.text}; box-shadow: 0 ${10 * u}px ${30 * u}px #0007; }
      .chunk p { margin: 0; }
      .chunk::before { content: ""; position: absolute; left: ${-26 * u}px; bottom: ${40 * u}px; border: ${16 * u}px solid transparent; border-right: ${28 * u}px solid ${c.panel}f2; border-left: 0; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-width="${width}" data-height="${height}">
      <div id="progress"></div>
      <div id="brand">${escapeHtml(channel.name)}</div>
      <div id="mascot">${mascotSvg(channel)}</div>${sections.join("")}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      gsap.set(["#m-eyes", "#m-mouth"], { transformOrigin: "50% 50%" });
      gsap.set("#m-mouth", { scaleY: 0.45 });
      const tl = gsap.timeline({ paused: true });
      const fmt = (n, d, g) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: g });
      ${t.join("\n      ")}
      window.__timelines.main = tl;
    </script>
  </body>
</html>
`;
}

/** Splits timed words into caption bites, breaking early at sentence ends. */
export function captionChunks(words: Word[], maxWords: number): Word[][] {
  const chunks: Word[][] = [];
  let current: Word[] = [];

  for (const word of words) {
    current.push(word);
    if (current.length >= maxWords || /[.!?]$/.test(word.text)) {
      chunks.push(current);
      current = [];
    }
  }

  if (current.length) chunks.push(current);

  return chunks;
}

function mouthTweens(scene: TimedScene): string[] {
  return scene.words.flatMap((word) => {
    const open = r(scene.start + word.start);
    const close = r(Math.max(open + 0.07, scene.start + word.end - 0.05));
    return [
      `tl.to("#m-mouth", { scaleY: 1.5, duration: 0.06 }, ${open});`,
      `tl.to("#m-mouth", { scaleY: 0.45, duration: 0.06 }, ${close});`,
    ];
  });
}

const ENTRANCES = [
  (sel: string) => `tl.fromTo("${sel}", { clipPath: "circle(0% at 50% 50%)" }, { clipPath: "circle(75% at 50% 50%)", duration: ${TRANSITION}, ease: "power2.inOut" }, AT);`,
  (sel: string) => `tl.fromTo("${sel}", { xPercent: 100 }, { xPercent: 0, duration: ${TRANSITION}, ease: "power3.out" }, AT);`,
  (sel: string) => `tl.fromTo("${sel}", { opacity: 0, scale: 1.08 }, { opacity: 1, scale: 1, duration: ${TRANSITION}, ease: "power2.out" }, AT);`,
  (sel: string) => `tl.fromTo("${sel}", { clipPath: "inset(0% 0% 100% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: ${TRANSITION}, ease: "power2.inOut" }, AT);`,
];

function sceneTweens(scene: TimedScene, index: number, u: number): string[] {
  const id = scene.id;
  const at = (offset: number) => r(scene.start + offset);
  const v = scene.visual;
  const t: string[] = [];

  if (index > 0) t.push(ENTRANCES[index % ENTRANCES.length](`#${id}`).replace("AT", String(at(0))));

  // Ken Burns: slow zoom with a drift that alternates direction scene to scene.
  if (scene.image) {
    const drift = (index % 2 === 0 ? 1 : -1) * 2.5;
    t.push(`tl.fromTo("#${id}-bg", { scale: 1.0, xPercent: ${-drift} }, { scale: 1.12, xPercent: ${drift}, duration: ${r(scene.duration + TRANSITION)}, ease: "none" }, ${at(0)});`);
  }

  t.push(`tl.fromTo("#${id}-stage", { scale: 0.97 }, { scale: 1.03, duration: ${scene.duration}, ease: "none" }, ${at(0)});`);

  const counter = (selector: string, value: string, offset: number, seconds: number) => {
    const parsed = parseCounter(value);
    // A year counting up from zero reads as a glitch, so it just appears.
    if (!parsed || (!parsed.prefix && !parsed.suffix && !parsed.grouping && parsed.number >= 1000 && parsed.number <= 2100)) return;
    t.push(
      `{ const c = { v: 0 }; tl.to(c, { v: ${parsed.number}, duration: ${r(seconds)}, ease: "power2.out", ` +
        `onUpdate: () => { document.getElementById("${selector}").textContent = ${JSON.stringify(parsed.prefix)} + fmt(c.v, ${parsed.decimals}, ${parsed.grouping}) + ${JSON.stringify(parsed.suffix)}; } }, ${at(offset)}); }`,
    );
  };

  switch (v.type) {
    case "stat":
      t.push(`tl.fromTo("#${id}-value", { scale: 0.3, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: "back.out(2)" }, ${at(0.1)});`);
      t.push(`tl.fromTo("#${id}-label", { y: ${40 * u}, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 }, ${at(0.45)});`);
      counter(`${id}-value`, v.value, 0.1, Math.min(1.4, scene.audioSeconds * 0.6));
      break;
    case "compare":
      t.push(`tl.fromTo("#${id}-left", { x: ${-500 * u}, opacity: 0 }, { x: 0, opacity: 1, duration: 0.45, ease: "power3.out" }, ${at(0.1)});`);
      t.push(`tl.fromTo("#${id}-vs", { scale: 0, rotation: -180 }, { scale: 1, rotation: 0, duration: 0.4, ease: "back.out(2)" }, ${at(0.35)});`);
      t.push(`tl.fromTo("#${id}-right", { x: ${500 * u}, opacity: 0 }, { x: 0, opacity: 1, duration: 0.45, ease: "power3.out" }, ${at(0.55)});`);
      t.push(`tl.fromTo("#${id}-right", { scale: 1 }, { scale: 1.06, duration: 0.25, yoyo: true, repeat: 1 }, ${at(1.1)});`);
      counter(`${id}-lv`, v.left.value, 0.1, 0.9);
      counter(`${id}-rv`, v.right.value, 0.55, 0.9);
      break;
    case "chart": {
      t.push(`tl.fromTo("#${id}-headline", { y: ${-40 * u}, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 }, ${at(0.05)});`);
      (v.bars ?? []).forEach((_bar, barIndex) => {
        t.push(`tl.fromTo("#${id}-b${barIndex}", { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: "power3.out" }, ${at(0.35 + barIndex * 0.25)});`);
      });
      break;
    }
    case "list": {
      t.push(`tl.fromTo("#${id}-headline", { y: ${-40 * u}, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 }, ${at(0.05)});`);
      const items = v.items ?? [];
      const spacing = Math.min(0.7, (scene.audioSeconds * 0.75) / Math.max(items.length, 1));
      items.forEach((_item, itemIndex) => {
        t.push(`tl.fromTo("#${id}-i${itemIndex}", { x: ${-120 * u}, opacity: 0 }, { x: 0, opacity: 1, duration: 0.35, ease: "power2.out" }, ${at(0.3 + itemIndex * spacing)});`);
      });
      break;
    }
    case "quote":
      t.push(`tl.fromTo("#${id}-quote", { opacity: 0, y: ${30 * u} }, { opacity: 1, y: 0, duration: 0.6 }, ${at(0.1)});`);
      if (v.author) t.push(`tl.fromTo("#${id}-author", { opacity: 0 }, { opacity: 1, duration: 0.4 }, ${at(0.7)});`);
      break;
    case "code":
      t.push(`tl.fromTo("#${id}-headline", { opacity: 0, y: ${-30 * u} }, { opacity: 1, y: 0, duration: 0.4 }, ${at(0.05)});`);
      (v.lines ?? []).forEach((_line, lineIndex) => {
        t.push(`tl.fromTo("#${id}-l${lineIndex}", { opacity: 0, x: ${-30 * u} }, { opacity: 1, x: 0, duration: 0.25 }, ${at(0.3 + lineIndex * 0.2)});`);
      });
      break;
    case "chapter":
      t.push(`tl.fromTo("#${id}-kicker", { opacity: 0, letterSpacing: "0.8em" }, { opacity: 1, letterSpacing: "0.3em", duration: 0.6 }, ${at(0.1)});`);
      t.push(`tl.fromTo("#${id}-rule", { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: "power3.out" }, ${at(0.3)});`);
      t.push(`tl.fromTo("#${id}-headline", { opacity: 0, y: ${50 * u} }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, ${at(0.4)});`);
      break;
    default:
      t.push(`tl.fromTo("#${id}-headline", { opacity: 0, y: ${60 * u}, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: "power3.out" }, ${at(0.1)});`);
  }

  return t;
}

function visualHtml(id: string, v: Visual): string {
  switch (v.type) {
    case "stat":
      return `<div id="${id}-value" class="value">${escapeHtml(v.value)}</div><div id="${id}-label" class="label">${escapeHtml(v.label)}</div>`;
    case "compare": {
      const left = parseCounter(v.left.value)?.number ?? 0;
      const right = parseCounter(v.right.value)?.number ?? 0;
      const [leftClass, rightClass] = right >= left ? ["lose", "win"] : ["win", "lose"];
      return `<div class="compare">
          <div id="${id}-left" class="side ${leftClass}"><div id="${id}-lv" class="v">${escapeHtml(v.left.value)}</div><div class="l">${escapeHtml(v.left.label)}</div></div>
          <div id="${id}-vs" class="vs">VS</div>
          <div id="${id}-right" class="side ${rightClass}"><div id="${id}-rv" class="v">${escapeHtml(v.right.value)}</div><div class="l">${escapeHtml(v.right.label)}</div></div>
        </div>`;
    }
    case "chart": {
      const bars = v.bars ?? [];
      const max = Math.max(...bars.map((bar) => Number(bar.value) || 0), 1);
      return `<h1 id="${id}-headline" class="headline">${escapeHtml(v.headline)}</h1><div class="bars">${bars
        .map((bar, index) => `<div class="bar-row"><span>${escapeHtml(String(bar.label))}</span><div id="${id}-b${index}" class="bar" style="width:${Math.max(12, ((Number(bar.value) || 0) / max) * 100)}%">${escapeHtml(String(bar.value))}</div></div>`)
        .join("")}</div>`;
    }
    case "list":
      return `<h1 id="${id}-headline" class="headline">${escapeHtml(v.headline)}</h1><ul class="items">${(v.items ?? [])
        .map((item, index) => `<li id="${id}-i${index}" class="item">${escapeHtml(item)}</li>`)
        .join("")}</ul>`;
    case "quote":
      return `<div id="${id}-quote" class="quote">${escapeHtml(v.text)}</div>${v.author ? `<div id="${id}-author" class="author">— ${escapeHtml(v.author)}</div>` : ""}`;
    case "code":
      return `<h1 id="${id}-headline" class="headline">${escapeHtml(v.headline)}</h1><pre class="code">${(v.lines ?? [])
        .map((line, index) => `<div id="${id}-l${index}">${escapeHtml(line) || " "}</div>`)
        .join("")}</pre>`;
    case "chapter":
      return `<div id="${id}-kicker" class="kicker">Chapter ${v.number}</div><div id="${id}-rule" class="rule"></div><h1 id="${id}-headline" class="headline">${escapeHtml(v.headline)}</h1>`;
    default:
      return `<h1 id="${id}-headline" class="headline">${escapeHtml(v.headline)}</h1>`;
  }
}

/** "$47,000" -> { prefix "$", number 47000, suffix "" } so the value can count up. */
export function parseCounter(value: string): { prefix: string; number: number; suffix: string; decimals: number; grouping: boolean } | null {
  const match = String(value).match(/^([^\d-]*)(-?[\d,]*\.?\d+)(.*)$/);
  if (!match) return null;

  const digits = match[2].replace(/,/g, "");
  const number = Number.parseFloat(digits);
  if (!Number.isFinite(number)) return null;

  return { prefix: match[1], number, suffix: match[3], decimals: digits.split(".")[1]?.length ?? 0, grouping: match[2].includes(",") || number >= 10000 };
}

function escapeHtml(text: string): string {
  return String(text).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

function r(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}
