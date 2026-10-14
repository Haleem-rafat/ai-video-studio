import { readFileSync } from "node:fs";
import { join } from "node:path";

import { FORMATS, ROOT } from "../config.ts";
import type { Project } from "../types.ts";
import { placeScenes, totalSeconds } from "./composition.ts";

/** Copied next to index.html by `compose`, so the render finds it. */
export const HAND_ASSET = join(ROOT, "assets", "hand.png");

/**
 * Builds the HyperFrames index.html for a whiteboard video: one canvas that
 * whiteboard-runtime.js draws on, plus each scene's narration as its own
 * audio clip, exactly as the motion composition places them.
 */
export function buildWhiteboard(project: Project): string {
  const { width, height } = FORMATS[project.format];
  const scenes = placeScenes(project.scenes);
  const total = totalSeconds(scenes);
  const data = {
    width,
    height,
    total,
    hand: "hand.png",
    scenes: scenes.map((scene) => ({
      id: scene.id,
      start: scene.start,
      duration: scene.duration,
      words: scene.words,
      image: scene.image?.path ?? null,
      visual: scene.visual,
    })),
  };
  // Closing tags inside the JSON would end the script early.
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  const runtime = readFileSync(join(ROOT, "src", "render", "whiteboard-runtime.js"), "utf8");

  const audio = scenes
    .map((scene) => `<audio id="${scene.id}-voice" data-start="${scene.start}" data-duration="${scene.audioSeconds}" data-track-index="2" src="${scene.audio!.path}"></audio>`)
    .join("\n      ");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${width}, height=${height}" />
    <title>${project.title.replace(/[&<>"']/g, " ")}</title>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Caveat:wght@700&display=block" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      body { margin: 0; background: #f4eddc; }
      #root { position: relative; width: ${width}px; height: ${height}px; overflow: hidden; }
      #wb { display: block; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-width="${width}" data-height="${height}">
      <canvas id="wb" width="${width}" height="${height}"></canvas>
      ${audio}
    </div>
    <script>window.WB = ${json};</script>
    <script>
${runtime}
    </script>
  </body>
</html>
`;
}
