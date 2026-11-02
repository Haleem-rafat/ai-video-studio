import { readFileSync } from "node:fs";
import { join } from "node:path";

import { generateText, Output } from "ai";
import { z } from "zod";

import { ROOT } from "../config.ts";
import { MARKETING_BEATS, type Creativity, type FormatId, type MarketingBrief, type SiteBrand } from "../types.ts";

const PLANNER_MODEL = "anthropic/claude-sonnet-5.5";

/**
 * The story under a marketing video, planned before a word of it is written.
 * Every video used to come out as hook → feature → feature → cta whatever its
 * colours; a story shape, a scored hook and a job per beat make two videos
 * for the same brand tell different stories. Two options are planned so the
 * client picks one before anything is voiced or rendered.
 */
export const STORY_SHAPES = {
  mystery: { en: "Mystery", ar: "لغز", how: "Open on a question the viewer can't answer yet. Every beat is a clue; the beat before the cta answers it, in the words the question used." },
  "before-after": { en: "Before → after", ar: "قبل وبعد", how: "Show the customer's world before, in a concrete moment they recognise; one turn; the same moment after. The same object is shown in both states." },
  myth: { en: "Myth vs truth", ar: "خرافة وحقيقة", how: "State what this audience believes (and why it sounds right), break it with one true fact from the brief, then show what works instead." },
  detail: { en: "The detail nobody sees", ar: "التفصيلة اللي محدش واخد باله منها", how: "Zoom into one small moment of the customer's day that quietly costs them; show what it adds up to; then the fix for exactly that moment." },
  countdown: { en: "Countdown", ar: "عد تنازلي", how: "3 things in rising order of importance; the last and biggest is the result the brand delivers." },
  stakes: { en: "Stakes", ar: "التمن", how: "What ignoring the problem costs today, this week, this month (rising); then the way out, and how little it takes." },
  day: { en: "A day in the life", ar: "يوم في حياته", how: "One customer's day from morning to night: the problem shows up at a real moment, the product changes how the day ends." },
  dialogue: { en: "Conversation", ar: "محادثة", how: "The story told as an exchange between the customer and the business (messages, a call, a question and its answers), the turn happens inside the conversation." },
} as const;
export type StoryShape = keyof typeof STORY_SHAPES;
export const SHAPE_IDS = Object.keys(STORY_SHAPES) as [StoryShape, ...StoryShape[]];

/** What a beat does for the viewer; its scene follows from it. */
export const STORY_JOBS = {
  question: "opens a question the viewer wants closed",
  contrast: "puts two states side by side",
  cause: "shows why the problem happens",
  process: "shows how it works, step by step",
  scale: "makes a size, count or time felt",
  evidence: "shows real proof (the brand's own work, a real number)",
  reveal: "uncovers the answer or the product",
  consequence: "shows what follows, good or bad",
  invitation: "the one ask (the cta)",
} as const;
export type StoryJob = keyof typeof STORY_JOBS;
const JOB_IDS = Object.keys(STORY_JOBS) as [StoryJob, ...StoryJob[]];

/** The scenes that perform each job; the planner picks from these first. */
export const JOB_BEATS: Record<StoryJob, string[]> = {
  question: ["kinetic", "pain", "links"],
  contrast: ["split", "conflict"],
  cause: ["chaos", "pain", "conflict"],
  process: ["path", "booking", "traffic"],
  scale: ["stat", "dashboard"],
  evidence: ["showcase", "page", "stat"],
  reveal: ["sting", "orbit", "kinetic", "turn"],
  consequence: ["notify", "turn", "recap"],
  invitation: ["cta"],
};

export type StoryBeat = { job: StoryJob; beat: (typeof MARKETING_BEATS)[number]; takeaway: string; start: string; change: string; end: string };
export type ScoredHook = { text: string; formula: string; score: number };
export type StoryOption = { shape: StoryShape; idea: string; hook: string; hooks: ScoredHook[]; thread: string; payoff: string; beats: StoryBeat[] };

type Formula = { id: string; name: string; shape: string; example: string; fails_when: string };
const FORMULAS = JSON.parse(readFileSync(join(ROOT, "prompts", "hook-formulas.json"), "utf8")) as { rules: string[]; hooks: Formula[] };

/** How many scenes a video of this length has. */
export function sceneRange(seconds: number): [number, number] {
  return seconds <= 35 ? [4, 5] : seconds <= 70 ? [6, 7] : seconds <= 110 ? [7, 9] : seconds <= 170 ? [10, 13] : [12, 16];
}

type HookScores = { specific: number; curiosity: number; stakes: number; you: number; quick: number };

/** 0-100: 60% the mean, 40% the weakest property, so a hook that is dead on one count can't hide behind the rest (as yt-script's hookscore). */
export function hookScore(scores: HookScores, text: string): number {
  const values = [scores.specific, scores.curiosity, scores.stakes, scores.you, scores.quick].map((value) => Math.max(0, Math.min(10, value)) * 10);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  // A hook is heard in the first 2-3 seconds: past 14 words it is a sentence, not a hook.
  const long = Math.max(0, text.split(/\s+/).filter(Boolean).length - 14) * 5;
  return Math.max(0, Math.round(0.6 * mean + 0.4 * Math.min(...values) - long));
}

/** The option with the strongest opening line: daily reels have nobody to pick, so the hook decides. */
export function bestStory(options: StoryOption[]): StoryOption {
  return options.reduce((best, option) => ((option.hooks[0]?.score ?? 0) > (best.hooks[0]?.score ?? 0) ? option : best));
}

/** A check of the scene types against the creativity level (write.ts's missesDirection, bound to its level). */
export type DirectionCheck = (beats: string[]) => string | null;

/** Why a planned option can't be shown to the client, or nothing. */
export function storyProblems(option: Pick<StoryOption, "shape" | "hook" | "thread" | "payoff" | "beats">, seconds: number, direction: DirectionCheck = () => null, avoid: StoryShape[] = []): string[] {
  const problems: string[] = [];
  const [min, max] = sceneRange(seconds);
  const { beats } = option;
  if (beats.length < min || beats.length > max) problems.push(`${beats.length} beats; a ${seconds}s video has ${min}-${max}`);
  if (avoid.includes(option.shape)) problems.push(`the ${option.shape} shape was used for this brand's last videos; use another`);
  if (beats.at(-1)?.job !== "invitation" || beats.at(-1)?.beat !== "cta") problems.push("the last beat must be the invitation, as the cta scene");
  if (beats.slice(0, -1).some((beat) => beat.job === "invitation" || beat.beat === "cta")) problems.push("only the last beat is the invitation");
  if (beats.some((beat, i) => i >= 2 && beat.job === beats[i - 1].job && beat.job === beats[i - 2].job)) problems.push("three beats in a row do the same job");
  if (beats.some((beat, i) => i && beat.beat === beats[i - 1].beat)) problems.push("two beats in a row use the same scene");
  if (new Set(beats.map((beat) => beat.job)).size < Math.min(4, beats.length - 1)) problems.push("too few different jobs; the beats repeat one idea");
  if (!option.thread.trim()) problems.push("no thread carried from the first scene to the last");
  if (!option.payoff.trim()) problems.push("no payoff: say how the end answers the hook");
  if (option.hook.split(/\s+/).filter(Boolean).length > 16) problems.push("the hook is longer than 16 words");
  // The client's creativity level still holds (motion share, how often the site shows).
  const miss = direction(beats.map((beat) => beat.beat));
  return miss ? [...problems, miss] : problems;
}

/** The two options must tell two different stories. */
export function optionsProblems(options: Pick<StoryOption, "shape" | "hook" | "beats">[]): string[] {
  const problems: string[] = [];
  if (options.length === 2 && options[0].shape === options[1].shape) problems.push("both options use the same story shape");
  if (options.length === 2 && options[0].hook.trim() === options[1].hook.trim()) problems.push("both options open with the same hook");
  // The first seconds are what the client compares: two kinetic openings look like one video.
  if (options.length === 2 && options[0].beats[0]?.beat === options[1].beats[0]?.beat) problems.push(`both options open on a ${options[0].beats[0]?.beat} scene; open the second differently`);
  return problems;
}

/** The approved story as the writer is told it. */
export function storyNotes(story: StoryOption): string {
  const shape = STORY_SHAPES[story.shape];
  return [
    `THE APPROVED STORY (the client chose it; it decides the structure, the order and the scene of every beat):`,
    `Shape: ${shape.en} — ${shape.how}`,
    `Idea: ${story.idea}`,
    `Opening line (scene 1's narration starts with it, word for word): «${story.hook}»`,
    `Thread carried from the first scene to the last: ${story.thread}`,
    `Payoff (how the end answers the hook): ${story.payoff}`,
    `Scenes, one per beat, in this order, each with this beat type:`,
    ...story.beats.map((beat, i) => `${i + 1}. [${beat.job} → ${beat.beat}] the viewer takes away: ${beat.takeaway}. On screen: ${beat.start} → ${beat.change} → ${beat.end}`),
  ].join("\n");
}

const words = (text: string) => text.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);

/** Where a written draft left the approved story, or nothing. */
export function draftMisses(scenes: { beat: string; narration: string }[], story: StoryOption): string[] {
  const problems: string[] = [];
  if (Math.abs(scenes.length - story.beats.length) > 1) problems.push(`${scenes.length} scenes; the story has ${story.beats.length} beats, one scene each`);
  const opening = words(scenes[0]?.narration ?? "").join(" ");
  const hook = words(story.hook);
  if (hook.filter((word) => opening.includes(word)).length / Math.max(1, hook.length) < 0.8) problems.push(`scene 1 doesn't open with the approved hook «${story.hook}»`);
  const moved = story.beats.filter((beat, i) => scenes[i] && scenes[i].beat !== beat.beat).length;
  if (moved > story.beats.length / 2) problems.push(`${moved} of ${story.beats.length} scenes changed the planned beat type`);
  return problems;
}

const PLAN = z.object({
  options: z
    .array(
      z.object({
        shape: z.enum(SHAPE_IDS),
        idea: z.string().describe("The story in one sentence, in the video's language, as you'd pitch it to the client"),
        hooks: z
          .array(
            z.object({
              text: z.string().describe("The opening line as spoken, in the video's language, at most 14 words"),
              formula: z.string().describe("The id of the hook formula it uses"),
              specific: z.number().describe("0-10: concrete (a number, a name, a real moment), not vague or hyped"),
              curiosity: z.number().describe("0-10: opens a question the viewer can't close without watching"),
              stakes: z.number().describe("0-10: something to lose or gain for this audience"),
              you: z.number().describe("0-10: speaks to the viewer and their own situation"),
              quick: z.number().describe("0-10: understood instantly when heard once, in 2-3 seconds"),
            }),
          )
          .length(5)
          .describe("Five different hooks, each from a different formula; score them honestly, harshly"),
        thread: z.string().describe("The one object, question or person the first scene introduces and the last scene resolves"),
        payoff: z.string().describe("How the last scenes deliver what the hook promised"),
        beats: z
          .array(
            z.object({
              job: z.enum(JOB_IDS),
              beat: z.enum(MARKETING_BEATS).describe("The scene that performs the job"),
              takeaway: z.string().describe("The ONE thing the viewer understands after this beat"),
              start: z.string().describe("What is on screen when the beat starts"),
              change: z.string().describe("What moves or changes"),
              end: z.string().describe("The readable final state"),
            }),
          )
          .describe("The beats in order, one scene each; the last is the invitation (cta)"),
      }),
    )
    .length(2),
});

/**
 * Plans two stories for a brief: different shapes, five scored hooks each
 * (the best one kept), and every beat's job and visual action. Plans that
 * break a rule are planned once more with the problems.
 */
export async function planStories(
  input: { brand: SiteBrand; brief: MarketingBrief; language: "en" | "ar"; format: FormatId; creativity: Creativity; direction: string; check?: DirectionCheck; avoid?: StoryShape[]; showcases: boolean; context?: string },
  log: (message: string) => void = console.log,
): Promise<StoryOption[]> {
  const { brand, brief, language, format, creativity, check, avoid = [], showcases } = input;
  const [min, max] = sceneRange(brief.seconds);
  log(`story: planning two stories for ${brand.name} ...`);
  const prompt = `You are the story director of a ${brief.seconds}-second ${format === "short" ? "vertical 9:16" : "horizontal 16:9"} marketing video for ${brand.name}. Before anyone writes it, plan TWO different stories for it; the client picks one.

THE BRAND: ${brand.name} (${brand.url}) — ${brand.summary}
Services: ${brand.services.join(" | ")}
THE BRIEF:
Business: ${brief.business}
Audience: ${brief.audience}
Their problems: ${brief.problems.join(" | ")}
Result to sell: ${brief.result}
Features: ${brief.features.join(" | ")}
Proof: ${brief.proof || "none — no testimonials, client counts or results"}
Call to action: "${brief.cta.label}" → ${brief.cta.url}
Tone: ${brief.tone}
Notes: ${brief.notes || "none"}
${input.context ? `\n${input.context}\n` : ""}Language of every line: ${language === "ar" ? "Egyptian colloquial Arabic (never فصحى), numbers in digits, brand names as the brand writes them" : "simple spoken English"}

CREATIVE DIRECTION (${creativity}): ${input.direction}

STORY SHAPES (each option uses a different one${avoid.length ? `; NOT ${avoid.join(", ")}, used for this brand's last videos` : ""}):
${Object.entries(STORY_SHAPES).map(([id, shape]) => `- ${id}: ${shape.how}`).join("\n")}
Pick the two shapes that fit THIS brand and audience best, not the first two.

HOOK FORMULAS (write 5 hooks per option, each from a different formula):
${FORMULAS.hooks.map((hook) => `- ${hook.id}: ${hook.shape} Fails when: ${hook.fails_when}`).join("\n")}
Hook rules: ${FORMULAS.rules.join(" ")} The hook is the first line heard, 2-3 seconds. It speaks to ${brief.audience}. Never a number, result or claim that isn't in the brief.

BEAT JOBS (each beat does one; its scene follows from the job):
${JOB_IDS.map((job) => `- ${job}: ${STORY_JOBS[job]} → usually ${JOB_BEATS[job].join(" / ")}`).join("\n")}
Scenes: journey (a phone scrolls the brand's content), pain (problems as message bubbles), turn (one calm sentence), page (the page as an infographic), booking, traffic, dashboard, recap (3 parts joined), cta, kinetic (words as the picture), chaos (scattered pieces fly into one card), path (a dot through 3-5 stations), stat (one real number in a ring), split (before/after wipe), notify (lock-screen notifications), orbit (parts circle the logo), sting (logo reveal), links (a question answered with links), conflict (calendar clash)${showcases ? ", showcase (the brand's own real work; use it for 1-2 evidence beats)" : ""}.

Rules for each option:
- ${min}-${max} beats; the last is the invitation as the cta scene, and only the last.
- The first beat carries the hook. The story's thread starts there and the payoff resolves it before the cta.
- Never three beats in a row with the same job, never the same scene twice in a row; at least 4 different jobs.
- Every beat's visual is a state change (start → change → end) from ${brand.name}'s own world, not a generic software ad.
- Use a scene only if it really happens in this business (no booking without bookings, no dashboard without analytics).`;

  const ask = (extra = "") => generateText({ telemetry: { functionId: "story" }, model: PLANNER_MODEL, output: Output.object({ schema: PLAN }), prompt: prompt + extra });
  const shape = (output: z.infer<typeof PLAN>): StoryOption[] =>
    output.options.map((option) => {
      const hooks = option.hooks
        .map((hook) => ({ text: hook.text.trim(), formula: hook.formula, score: hookScore(hook, hook.text) }))
        .sort((a, b) => b.score - a.score);
      return { shape: option.shape, idea: option.idea.trim(), hook: hooks[0].text, hooks, thread: option.thread.trim(), payoff: option.payoff.trim(), beats: option.beats };
    });
  const problemsOf = (options: StoryOption[]) => [
    ...optionsProblems(options),
    ...options.flatMap((option, i) => storyProblems(option, brief.seconds, check, avoid).map((problem) => `option ${i + 1}: ${problem}`)),
  ];

  let options = shape((await ask()).output);
  const problems = problemsOf(options);
  if (problems.length) {
    log(`story: ${problems.length} problem(s), planning again ...`);
    options = shape((await ask(`\n\nYOUR FIRST PLAN HAD THESE PROBLEMS:\n${problems.map((problem) => `- ${problem}`).join("\n")}\nPlan both options again without them.`)).output);
    const still = problemsOf(options);
    if (still.length) log(`story: still: ${still.join("; ")}`);
  }
  log(`story: ${options.map((option) => `${STORY_SHAPES[option.shape].en} (hook ${option.hooks[0].score})`).join(" / ")}`);
  return options;
}
