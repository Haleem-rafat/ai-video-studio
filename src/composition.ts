import { FORMATS, type Channel, type FormatId } from "./config.ts";
import type { Scene, Script, Visual } from "./script-writer.ts";

/** A scene placed on the timeline, with the narration file that drives its length. */
export type TimedScene = Scene & { audio: string; audioSeconds: number; start: number; duration: number };

// Breathing room after each line so cuts never clip the last word.
const SCENE_GAP = 0.35;

export function placeScenes(scenes: (Scene & { audio: string; audioSeconds: number })[]): TimedScene[] {
  let cursor = 0;

  return scenes.map((scene) => {
    const duration = round(scene.audioSeconds + SCENE_GAP);
    const placed = { ...scene, start: round(cursor), duration };
    cursor += duration;
    return placed;
  });
}

/**
 * Builds the HyperFrames index.html: one timed <section> and one <audio> per
 * scene, all animation on a single paused GSAP timeline so every frame is
 * seekable and the render is deterministic.
 */
export function buildComposition(script: Script, scenes: TimedScene[], channel: Channel, formatId: FormatId): string {
  const { width, height } = FORMATS[formatId];
  const unit = Math.min(width, height) / 1080;
  const total = round(scenes.reduce((sum, scene) => sum + scene.duration, 0));
  const tweens: string[] = [`tl.fromTo("#progress", { scaleX: 0 }, { scaleX: 1, duration: ${total}, ease: "none" }, 0);`];

  const sections = scenes.map((scene, index) => {
    const id = `s${index + 1}`;
    tweens.push(...sceneTweens(id, scene));

    return `
      <section id="${id}" class="clip scene" data-start="${scene.start}" data-duration="${scene.duration}" data-track-index="1">
        <div id="${id}-stage" class="stage">${visualHtml(id, scene.visual)}</div>
        <p id="${id}-caption" class="caption">${scene.narration
          .split(/\s+/)
          .filter(Boolean)
          .map((word, wordIndex) => `<span id="${id}-w${wordIndex}" class="word">${escapeHtml(word)}</span>`)
          .join(" ")}</p>
      </section>
      <audio id="${id}-voice" data-start="${scene.start}" data-duration="${round(scene.audioSeconds)}" data-track-index="2" src="${scene.audio}"></audio>`;
  });

  const c = channel.colors;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${width}, height=${height}" />
    <title>${escapeHtml(script.title)}</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      body { margin: 0; background: ${c.background}; }
      #root {
        position: relative; width: ${width}px; height: ${height}px; overflow: hidden;
        background: radial-gradient(circle at 50% 35%, ${c.panel} 0%, ${c.background} 70%);
        color: ${c.text}; font-family: ${channel.font};
      }
      #progress {
        position: absolute; top: 0; left: 0; width: 100%; height: ${8 * unit}px;
        background: ${c.accent}; transform-origin: left center; z-index: 5;
      }
      #brand {
        position: absolute; top: ${36 * unit}px; left: 0; right: 0; text-align: center; z-index: 5;
        font-size: ${30 * unit}px; letter-spacing: 0.2em; text-transform: uppercase; color: ${c.muted};
      }
      .scene { position: absolute; inset: 0; display: flex; flex-direction: column; }
      .stage {
        flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
        padding: 0 ${80 * unit}px; text-align: center; gap: ${36 * unit}px;
      }
      .headline { font-size: ${92 * unit}px; font-weight: 800; line-height: 1.1; margin: 0; }
      .value { font-size: ${200 * unit}px; font-weight: 900; color: ${c.accent}; line-height: 1; }
      .label { font-size: ${52 * unit}px; color: ${c.muted}; max-width: 90%; }
      .items { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: ${24 * unit}px; }
      .item {
        font-size: ${56 * unit}px; background: ${c.panel}; border-left: ${10 * unit}px solid ${c.accent};
        padding: ${20 * unit}px ${36 * unit}px; border-radius: ${12 * unit}px; text-align: left;
      }
      .quote { font-size: ${76 * unit}px; font-style: italic; line-height: 1.2; }
      .quote::before { content: "\\201C"; color: ${c.accent}; }
      .quote::after { content: "\\201D"; color: ${c.accent}; }
      .author { font-size: ${44 * unit}px; color: ${c.muted}; }
      .code {
        font-family: 'SF Mono', Menlo, monospace; font-size: ${36 * unit}px; text-align: left;
        white-space: pre-wrap; overflow-wrap: anywhere;
        background: ${c.panel}; padding: ${36 * unit}px; border-radius: ${16 * unit}px; margin: 0;
        border: ${2 * unit}px solid ${c.accent}33; max-width: 100%; overflow: hidden;
      }
      .caption {
        margin: 0 ${70 * unit}px ${(formatId === "short" ? 260 : 70) * unit}px; text-align: center;
        font-size: ${(formatId === "short" ? 58 : 44) * unit}px; font-weight: 700; line-height: 1.3;
      }
      .word { opacity: 0.3; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-width="${width}" data-height="${height}">
      <div id="progress"></div>
      <div id="brand">${escapeHtml(channel.name)}</div>${sections.join("")}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      const fmt = (n, d) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
      ${tweens.join("\n      ")}
      window.__timelines.main = tl;
    </script>
  </body>
</html>
`;
}

function visualHtml(id: string, visual: Visual): string {
  switch (visual.type) {
    case "stat":
      return `<div id="${id}-value" class="value">${escapeHtml(visual.value)}</div><div id="${id}-label" class="label">${escapeHtml(visual.label)}</div>`;
    case "list":
      return `<h1 id="${id}-headline" class="headline">${escapeHtml(visual.headline)}</h1><ul class="items">${(visual.items ?? [])
        .map((item, index) => `<li id="${id}-i${index}" class="item">${escapeHtml(item)}</li>`)
        .join("")}</ul>`;
    case "quote":
      return `<div id="${id}-quote" class="quote">${escapeHtml(visual.text)}</div>${visual.author ? `<div id="${id}-author" class="author">— ${escapeHtml(visual.author)}</div>` : ""}`;
    case "code":
      return `<h1 id="${id}-headline" class="headline">${escapeHtml(visual.headline)}</h1><pre id="${id}-code" class="code">${escapeHtml((visual.lines ?? []).join("\n"))}</pre>`;
    default:
      return `<h1 id="${id}-headline" class="headline">${escapeHtml(visual.headline)}</h1>`;
  }
}

function sceneTweens(id: string, scene: TimedScene): string[] {
  const t = scene.start;
  const visual = scene.visual;
  const at = (offset: number) => round(t + offset);
  const tweens = [
    // Slow push-in for the whole scene, so nothing on screen is ever static.
    `tl.fromTo("#${id}-stage", { scale: 0.96 }, { scale: 1.04, duration: ${scene.duration}, ease: "none" }, ${at(0)});`,
  ];

  if (visual.type === "stat") {
    tweens.push(`tl.fromTo("#${id}-value", { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: "back.out(2)" }, ${at(0.05)});`);
    tweens.push(`tl.fromTo("#${id}-label", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 }, ${at(0.35)});`);

    const counter = parseCounter(visual.value);
    if (counter) {
      tweens.push(
        `{ const c = { v: 0 }; tl.to(c, { v: ${counter.number}, duration: ${round(Math.min(1.4, scene.audioSeconds * 0.6))}, ease: "power2.out", ` +
          `onUpdate: () => { document.getElementById("${id}-value").textContent = ${JSON.stringify(counter.prefix)} + fmt(c.v, ${counter.decimals}) + ${JSON.stringify(counter.suffix)}; } }, ${at(0.05)}); }`,
      );
    }
  } else if (visual.type === "list") {
    tweens.push(`tl.fromTo("#${id}-headline", { y: -40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 }, ${at(0.05)});`);
    const items = visual.items ?? [];
    const spacing = Math.min(0.6, (scene.audioSeconds * 0.7) / Math.max(items.length, 1));
    items.forEach((_item, index) => {
      tweens.push(`tl.fromTo("#${id}-i${index}", { x: -80, opacity: 0 }, { x: 0, opacity: 1, duration: 0.35, ease: "power2.out" }, ${at(0.3 + index * spacing)});`);
    });
  } else if (visual.type === "quote") {
    tweens.push(`tl.fromTo("#${id}-quote", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.6 }, ${at(0.05)});`);
    if (visual.author) tweens.push(`tl.fromTo("#${id}-author", { opacity: 0 }, { opacity: 1, duration: 0.4 }, ${at(0.6)});`);
  } else if (visual.type === "code") {
    tweens.push(`tl.fromTo("#${id}-headline", { opacity: 0, y: -30 }, { opacity: 1, y: 0, duration: 0.4 }, ${at(0.05)});`);
    tweens.push(`tl.fromTo("#${id}-code", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5 }, ${at(0.25)});`);
  } else {
    tweens.push(`tl.fromTo("#${id}-headline", { opacity: 0, y: 60, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: "power3.out" }, ${at(0.05)});`);
  }

  // Karaoke captions: each word lights up across the length of its narration.
  const words = scene.narration.split(/\s+/).filter(Boolean);
  words.forEach((_word, index) => {
    tweens.push(`tl.to("#${id}-w${index}", { opacity: 1, duration: 0.12 }, ${at((index / words.length) * scene.audioSeconds)});`);
  });

  return tweens;
}

/** "$47,000" -> { prefix "$", number 47000, suffix "" } so the value can count up. */
function parseCounter(value: string): { prefix: string; number: number; suffix: string; decimals: number } | null {
  const match = value.match(/^([^\d-]*)(-?[\d,]*\.?\d+)(.*)$/);
  if (!match) return null;

  const digits = match[2].replace(/,/g, "");
  const number = Number.parseFloat(digits);
  if (!Number.isFinite(number)) return null;

  return { prefix: match[1], number, suffix: match[3], decimals: digits.split(".")[1]?.length ?? 0 };
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

function round(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}
