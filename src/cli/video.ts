import { basename } from "node:path";
import { parseArgs } from "node:util";

import { build, createProject } from "../pipeline.ts";
import type { StyleId } from "../types.ts";

const USAGE = `
Make a video, start to finish:
  npm run video -- --channel dev-pixel --format short --topic "Why switching jobs pays more"

Rebuild an existing project after editing its project.json (only changed scenes are re-voiced or redrawn):
  npm run video -- --project <id or output/<id>>

Options:
  --channel    dev-pixel | money-mechanics | kido-fun-zone
  --format     short (9:16, ~70s) | long (16:9, ~8 min)
  --topic      what the video is about
  --style      motion (default) | whiteboard (a hand draws doodles on paper) | explainer (a phone or laptop showing app screens) | mixed (each scene its own look)
  --project    rebuild this project instead of writing a new script
  --no-images  skip AI background pictures
  --no-render  stop after index.html (preview with: cd output/<id> && npx hyperframes preview)
  --quality    draft | standard | high (default standard)
`;

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      channel: { type: "string" },
      format: { type: "string", default: "short" },
      topic: { type: "string" },
      style: { type: "string", default: "motion" },
      project: { type: "string" },
      "no-images": { type: "boolean", default: false },
      "no-render": { type: "boolean", default: false },
      quality: { type: "string", default: "standard" },
      help: { type: "boolean", default: false },
    },
  });

  if (values.help) return void console.log(USAGE);

  const quality = values.quality as "draft" | "standard" | "high";
  if (!["draft", "standard", "high"].includes(quality)) throw new Error("--quality is draft, standard or high.");

  let id = values.project ? basename(values.project.replace(/\/+$/, "")) : "";

  if (!id) {
    if (!values.channel || !values.topic) throw new Error(`--channel and --topic are required.\n${USAGE}`);
    if (values.format !== "short" && values.format !== "long") throw new Error("--format is short or long.");
    if (!["motion", "whiteboard", "explainer", "mixed"].includes(values.style!)) throw new Error("--style is motion, whiteboard, explainer or mixed.");
    id = (await createProject(values.channel, values.format, values.topic, values.style as StyleId)).id;
  }

  const started = Date.now();
  const project = await build(id, { images: !values["no-images"], render: !values["no-render"], quality });

  console.log(`\ndone in ${Math.round((Date.now() - started) / 1000)}s: output/${project.id}/${project.render && !values["no-render"] ? "video.mp4" : "index.html"}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
