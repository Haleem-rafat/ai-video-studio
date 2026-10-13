import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs, promisify } from "node:util";

import { buildComposition, placeScenes } from "./composition.ts";
import { ROOT, loadChannel, type FormatId } from "./config.ts";
import { assertLlmRunning } from "./llm.ts";
import { writeScript, type Script } from "./script-writer.ts";
import { narrate } from "./voice.ts";

const USAGE = `
Make a video from a topic, all on this Mac.

  npm run video -- --channel dev-pixel --format short --topic "Why senior devs get paid more"
  npm run video -- --from output/<folder>        re-voice and re-render an existing script.json

Options:
  --channel   dev-pixel | money-mechanics | kido-fun-zone
  --format    short (9:16, ~60s) | long (16:9, ~7 min)
  --topic     what the video is about
  --from      reuse a folder's script.json instead of asking the LLM
  --no-render stop after writing index.html (open it with: npx hyperframes preview)
  --quality   draft | standard | high (default standard)
`;

const run = promisify(execFile);

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      channel: { type: "string" },
      format: { type: "string", default: "short" },
      topic: { type: "string" },
      from: { type: "string" },
      "no-render": { type: "boolean", default: false },
      quality: { type: "string", default: "standard" },
      help: { type: "boolean", default: false },
    },
  });

  if (values.help) return void console.log(USAGE);

  let dir: string;
  let job: { channel: string; format: FormatId; topic: string };
  let script: Script;

  if (values.from) {
    dir = resolve(ROOT, values.from);
    job = JSON.parse(await readFile(join(dir, "job.json"), "utf8"));
    script = JSON.parse(await readFile(join(dir, "script.json"), "utf8"));
    console.log(`1/4 script  reusing ${dir}`);
  } else {
    if (!values.channel || !values.topic) throw new Error(`--channel and --topic are required.\n${USAGE}`);
    if (values.format !== "short" && values.format !== "long") throw new Error("--format is short or long.");

    job = { channel: values.channel, format: values.format, topic: values.topic };
    loadChannel(job.channel);
    await assertLlmRunning();

    dir = join(ROOT, "output", `${new Date().toISOString().slice(0, 10)}-${job.channel}-${job.format}-${slug(job.topic)}`);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "job.json"), JSON.stringify(job, null, 2));

    console.log(`1/4 script  Bonsai is writing "${job.topic}" ...`);
    script = await writeScript(loadChannel(job.channel), job.format, job.topic);
    await writeFile(join(dir, "script.json"), JSON.stringify(script, null, 2));
  }

  const channel = loadChannel(job.channel);

  console.log(`2/4 voice   ${script.scenes.length} scenes with "${channel.voice}"`);
  await mkdir(join(dir, "audio"), { recursive: true });
  const voiced = [];
  for (const [index, scene] of script.scenes.entries()) {
    const audio = `audio/scene-${String(index + 1).padStart(2, "0")}.wav`;
    const audioSeconds = await narrate(scene.narration, join(dir, audio), channel);
    voiced.push({ ...scene, audio, audioSeconds });
  }

  const scenes = placeScenes(voiced);
  const total = scenes.reduce((sum, scene) => sum + scene.duration, 0);

  console.log(`3/4 compose index.html, ${total.toFixed(1)}s`);
  await writeFile(join(dir, "index.html"), buildComposition(script, scenes, channel, job.format));
  await writeFile(
    join(dir, "youtube.txt"),
    `${script.title}\n\n${script.description}\n\n${script.tags.map((tag) => `#${tag.replace(/\s+/g, "")}`).join(" ")}\n`,
  );

  if (values["no-render"]) {
    console.log(`done. Preview: cd "${dir}" && npx hyperframes preview`);
    return;
  }

  console.log(`4/4 render  HyperFrames (${values.quality}) ...`);
  const started = Date.now();
  await run("npx", ["hyperframes", "render", "--output", "video.mp4", "--quality", values.quality], {
    cwd: dir,
    maxBuffer: 64 * 1024 * 1024,
  });
  console.log(`done in ${Math.round((Date.now() - started) / 1000)}s: ${join(dir, "video.mp4")}`);
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
