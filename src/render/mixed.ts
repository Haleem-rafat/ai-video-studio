import { FORMATS, type Channel } from "../config.ts";
import type { Look, Project } from "../types.ts";
import { buildComposition, placeScenes, totalSeconds } from "./composition.ts";
import { buildExplainer } from "./explainer.ts";
import { runsOf } from "./looks.ts";
import { buildWhiteboard } from "./whiteboard.ts";

/**
 * A mixed video is a row of segments, one per run of scenes that share a
 * look. Each segment is an ordinary composition of its own (run-N.html),
 * rendered on its own, and the mp4s are joined end to end — the three looks
 * use different runtimes and stylesheets, and keeping them in separate pages
 * is what lets each stay exactly as it is.
 */
export type Segment = { file: string; look: Look; start: number; duration: number; html: string };

/** One segment's composition: the run's scenes as a project of their own. */
function segmentHtml(project: Project, channel: Channel, look: Look, scenes: Project["scenes"], last: boolean): string {
  const part: Project = { ...project, style: look, scenes };
  if (look === "whiteboard") return buildWhiteboard(part, { captions: true, channel });
  if (look === "explainer") return buildExplainer(part, channel, { cta: last, header: false });
  return buildComposition(part, channel);
}

export function buildSegments(project: Project, channel: Channel): Segment[] {
  const runs = runsOf(project, project.scenes);
  let cursor = 0;
  return runs.map((run, index) => {
    const duration = totalSeconds(placeScenes(run.scenes));
    const segment = { file: `run-${index + 1}.html`, look: run.look, start: cursor, duration, html: segmentHtml(project, channel, run.look, run.scenes, index === runs.length - 1) };
    cursor += duration;
    return segment;
  });
}

/**
 * index.html for the studio's live preview only: every segment in an iframe,
 * shown while it is on, and told where to seek on each tick. The narration
 * plays from this page, so the segments stay silent. Renders never use it.
 */
export function buildMixedPreview(project: Project, segments: Segment[]): string {
  const { width, height } = FORMATS[project.format];
  const scenes = placeScenes(project.scenes);
  const total = totalSeconds(scenes);
  const r = (n: number) => Math.round(n * 1000) / 1000;
  const frames = segments
    .map(
      (segment, i) =>
        `<iframe id="seg-${i}" class="clip" data-start="${r(segment.start)}" data-duration="${r(segment.duration)}" src="${segment.file}?preview" width="${width}" height="${height}" style="position:absolute;inset:0;border:0;"></iframe>`,
    )
    .join("\n      ");
  const audio = scenes
    .map((scene) => `<audio data-start="${scene.start}" data-duration="${r(scene.audioSeconds)}" src="${scene.audio!.path}"></audio>`)
    .join("\n      ");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>${project.title.replace(/[&<>"']/g, " ")}</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>body { margin: 0; background: #000; } #root { position: relative; width: ${width}px; height: ${height}px; overflow: hidden; }</style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-width="${width}" data-height="${height}">
      ${frames}
      ${audio}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      const segments = ${JSON.stringify(segments.map((segment) => ({ start: r(segment.start), duration: r(segment.duration) })))};
      const tl = gsap.timeline({ paused: true });
      const clock = { t: 0 };
      tl.to(clock, {
        t: ${total},
        duration: ${total},
        ease: "none",
        onUpdate: () => {
          segments.forEach((segment, i) => {
            if (clock.t < segment.start || clock.t >= segment.start + segment.duration) return;
            document.getElementById("seg-" + i).contentWindow?.postMessage({ type: "seek", time: clock.t - segment.start }, "*");
          });
        },
      }, 0);
      window.__timelines.main = tl;
    </script>
  </body>
</html>
`;
}
