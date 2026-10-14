import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";

import { loadChannel } from "../config.ts";
import { loadProject, projectDir, saveProject } from "../project.ts";
import { signIn, uploadVideo, type Privacy } from "../publish/youtube.ts";

const USAGE = `
Upload rendered videos to YouTube (private unless you say otherwise):
  npm run upload -- <id or output/<id>> [<id> ...]

Options:
  --privacy  private (default) | unlisted | public
  --force    upload again even if project.json says it was already uploaded
  --sign-in  <channel>  sign in (again) for a studio channel, e.g. money-mechanics

The first upload for each studio channel opens the browser to pick its YouTube channel.
`;

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      privacy: { type: "string", default: "private" },
      force: { type: "boolean", default: false },
      "sign-in": { type: "string" },
      help: { type: "boolean", default: false },
    },
  });

  if (values.help) return void console.log(USAGE);
  if (values["sign-in"]) return void (await signIn(loadChannel(values["sign-in"]).id));
  if (!positionals.length) throw new Error(`Name at least one project.\n${USAGE}`);

  const privacy = values.privacy as Privacy;
  if (!["private", "unlisted", "public"].includes(privacy)) throw new Error("--privacy is private, unlisted or public.");

  for (const arg of positionals) {
    const project = await loadProject(basename(arg.replace(/\/+$/, "")));
    const videoPath = join(projectDir(project.id), "video.mp4");

    if (!existsSync(videoPath)) throw new Error(`${project.id} has no video.mp4. Render it first.`);
    if (project.youtube && !values.force) {
      console.log(`${project.id} was already uploaded: ${project.youtube.url} (use --force to upload again)`);
      continue;
    }

    const madeForKids = loadChannel(project.channel).madeForKids ?? false;
    project.youtube = await uploadVideo(project, videoPath, { privacy, madeForKids });
    await saveProject(project);
    console.log(`uploaded ${project.id}: ${project.youtube.url} (${project.youtube.privacy})\n`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
