import { existsSync } from "node:fs";
import { cp } from "node:fs/promises";
import { join } from "node:path";

import { MARKETING_OWNER, MARKETING_STYLE, MARKETING_VOICES } from "../pipeline.ts";
import { writeMarketing } from "../marketing/write.ts";
import { newProjectId, projectDir, saveProject } from "../project.ts";
import type { MarketingBrief, Project } from "../types.ts";
import { clientDir } from "./store.ts";
import type { Client, Idea } from "./types.ts";

const GOAL_DIRECTION: Record<Idea["goal"], string> = {
  awareness: "reach people who don't know the brand yet; lead with their pain, mention the brand late",
  details: "show how one feature works, step by step",
  offer: "sell: the result, then a clear call to action",
};

/** The client's brief, sized and aimed for one Instagram Reel. */
export function reelBrief(client: Client, idea: Idea): MarketingBrief {
  return {
    ...client.brief,
    seconds: 45,
    platforms: ["Instagram Reels"],
    notes: [
      `Goal of this reel: ${idea.goal} (${GOAL_DIRECTION[idea.goal]}).`,
      `Say the hook in the first 2 seconds: ${idea.hook}`,
      `Beats: ${idea.outline.join(" → ")}`,
      client.avoid ? `Never: ${client.avoid}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

/** The idea as the script the marketing writer follows. */
export function reelScript(idea: Idea): string {
  return [`Hook (first 2 seconds): ${idea.hook}`, ...idea.outline.map((line, i) => `${i + 1}. ${line}`)].join("\n");
}

/** Writes a reel as an ordinary 9:16 marketing project (the same writer as Marketing mode) and returns its id. */
export async function createReel(client: Client, idea: Idea, log: (message: string) => void): Promise<string> {
  const brief = reelBrief(client, idea);
  const draft = await writeMarketing({ brand: client.brand, brief, script: reelScript(idea), language: client.language, format: "short", creativity: "creative" }, log);
  const now = new Date().toISOString();
  const project: Project = {
    id: newProjectId(MARKETING_OWNER, "short", `${client.name} reel ${idea.goal}`),
    channel: MARKETING_OWNER,
    format: "short",
    style: "marketing",
    topic: `Instagram reel for ${client.name}: ${idea.hook}`,
    title: draft.title,
    description: `${draft.caption}\n\n${draft.hashtags.map((tag) => `#${tag}`).join(" ")}`.trim(),
    tags: draft.hashtags,
    marketing: {
      brand: client.brand,
      brief,
      creativity: "creative",
      language: client.language,
      narrator: { voice: MARKETING_VOICES[brief.voice || "male"], style: MARKETING_STYLE[client.language] },
      captions: Boolean(brief.captions),
      post: { caption: draft.caption, hashtags: draft.hashtags },
    },
    scenes: draft.scenes,
    createdAt: now,
    updatedAt: now,
  };
  // The renderer finds the logo and screenshots next to index.html, as for any marketing video.
  if (existsSync(join(clientDir(client.id), "shots"))) await cp(join(clientDir(client.id), "shots"), join(projectDir(project.id), "shots"), { recursive: true });
  await saveProject(project);
  log(`script: reel saved as ${project.id}`);
  return project.id;
}
