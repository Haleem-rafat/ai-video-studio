import { existsSync } from "node:fs";
import { cp } from "node:fs/promises";
import { join } from "node:path";

import { MARKETING_OWNER, MARKETING_STYLE } from "../pipeline.ts";
import { writeMarketing } from "../marketing/write.ts";
import { newProjectId, projectDir, saveProject } from "../project.ts";
import type { MarketingBrief, Project } from "../types.ts";
import { prepareSpeech, proofread } from "./arabic.ts";
import { nextCreativity, nextVoice, reelProblems, type Made } from "./history.ts";
import { businessContext } from "./context.ts";
import { needsRewrite, reviewScript, rewriteNotes, scriptOf } from "./review.ts";
import { clientDir } from "./store.ts";
import type { Client, Idea, ScriptReview } from "./types.ts";

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
      "Narration is read by a voice: use short, common, easy-to-say words; avoid tongue-twisters and rare words (not «ميعادين يتداخلوا», say «ميعادين في نفس الوقت»).",
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

/** What the client's earlier videos did, so a new reel can stay clear of it. */
export function avoidNotes(history: Made[]): string {
  const videos = history.filter((made) => (made.kind === "reel" || made.kind === "video") && made.beats?.length).slice(0, 8);
  if (!videos.length) return "";
  return [
    "EARLIER VIDEOS OF THIS CLIENT (already paid for; this reel must look and sound different):",
    ...videos.map((video) => `- "${video.title}": opens «${video.lines[0]?.slice(0, 90) ?? ""}»; scenes ${video.beats!.join(" → ")}`),
    "Use a different opening scene type, a different scene order, and no sentence from these videos.",
  ].join("\n");
}

/** Everything the reel's writer is told about this client and this idea, on top of the brief. */
export function reelNotes(client: Client, idea: Idea, history: Made[] = []): string {
  const knowledge = businessContext(client, "reel");
  return [
    reelBrief(client, idea).notes,
    idea.persona ? `Speak to: ${idea.persona}, in their own words. Show this real step of how the product works: ${idea.step ?? "one concrete step"}.` : "",
    knowledge ? `${knowledge}\nWrite like someone who knows this product: show how it really works for this customer, in their words. No generic marketing lines; claim only what the knowledge says.` : "",
    avoidNotes(history),
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Writes a reel as an ordinary 9:16 marketing project (the same writer as Marketing mode) and returns its id. */
export async function createReel(client: Client, idea: Idea, log: (message: string) => void, history: Made[] = []): Promise<{ projectId: string; review?: ScriptReview }> {
  const subtitles = client.profile?.answers["creative.subtitles"]?.value as string | undefined;
  const brief = { ...reelBrief(client, idea), notes: reelNotes(client, idea, history) };
  // Reels take turns between creative and bold, and between the narrators of the brief's voice.
  const creativity = nextCreativity(history);
  const voice = nextVoice(history, brief.voice === "female" ? "female" : "male");
  const write = (notes: string) => writeMarketing({ brand: client.brand, brief: { ...brief, notes }, script: reelScript(idea), language: client.language, format: "short", creativity }, log);
  let draft = await write(brief.notes);
  const problems = reelProblems({ beats: draft.scenes.map((scene) => (scene.visual as { beat?: string }).beat ?? ""), lines: draft.scenes.map((scene) => scene.narration) }, history);
  if (problems.length) {
    log(`script: the reel repeats earlier videos (${problems.length}), writing it again ...`);
    draft = await write(`${brief.notes}\n\nYOUR FIRST DRAFT REPEATED EARLIER VIDEOS:\n${problems.map((p) => `- ${p}`).join("\n")}`);
    const still = reelProblems({ beats: draft.scenes.map((scene) => (scene.visual as { beat?: string }).beat ?? ""), lines: draft.scenes.map((scene) => scene.narration) }, history);
    if (still.length) log(`script: still close to earlier videos: ${still.join(" ")}`);
  }
  // Checked before any voice or picture is paid for; a weak script is written once more with the reviewer's notes.
  let review = await reviewScript(client, { kind: "reel", idea, script: scriptOf({ scenes: draft.scenes }) }, log);
  let rewritten = false;
  if (review && needsRewrite(review)) {
    log("script: rewriting with the reviewer's notes ...");
    draft = await write(`${brief.notes}${rewriteNotes(review)}`);
    review = (await reviewScript(client, { kind: "reel", idea, script: scriptOf({ scenes: draft.scenes }) }, log)) ?? review;
    rewritten = true;
  }
  // Spelling is checked before anything is voiced or drawn; then the voice gets its own spoken text.
  const text = { scenes: draft.scenes, caption: draft.caption, hashtags: draft.hashtags };
  await proofread(text, log);
  draft = { ...draft, caption: text.caption, hashtags: text.hashtags };
  await prepareSpeech(draft.scenes, client, log);
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
      creativity,
      language: client.language,
      narrator: { voice, style: MARKETING_STYLE[client.language] },
      // Prompted mode's subtitles answer, when given, decides; else the brief.
      captions: subtitles === undefined ? Boolean(brief.captions) : subtitles === "yes",
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
  return { projectId: project.id, ...(review ? { review: { ...review, rewritten } } : {}) };
}
