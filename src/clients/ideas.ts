import { generateText, Output } from "ai";
import { z } from "zod";

import { extractJson } from "../llm.ts";
import { ideaProblems } from "./rules.ts";
import { loadClient, loadIdeas, localDate, recentIdeas, saveIdeas } from "./store.ts";
import { IDEA_ANGLES, IDEA_FORMATS, IDEA_GOALS, type Client, type Idea, type IdeaDay, type Trend } from "./types.ts";

const WRITER_MODEL = "anthropic/claude-sonnet-5.5";
// Searches the web as it answers, and cites what it found.
const SEARCH_MODEL = "perplexity/sonar";
const HISTORY_DAYS = 14;

const TRENDS = z.object({ trends: z.array(z.object({ title: z.string(), summary: z.string(), url: z.string() })) });

const IDEA = z.object({
  format: z.enum(IDEA_FORMATS).describe("carousel: 5-8 swipeable infographic slides. single: one strong image. reel: a 30-60s vertical video"),
  goal: z.enum(IDEA_GOALS).describe("awareness: reach new people who don't know the brand. details: explain one feature or how it works. offer: sell, ending on the call to action"),
  angle: z.enum(IDEA_ANGLES),
  hook: z.string().describe("The first line the viewer reads or hears, in the client's language, under 120 characters"),
  outline: z.array(z.string()).describe("3-7 beats: the slides of a carousel or the scenes of a reel, one short line each"),
  why: z.string().describe("One sentence: why this reaches the niche and can travel (saves, shares, comments)"),
  trend: z.string().describe("The url of the trend it rides, or empty"),
});
const IDEAS = z.object({ ideas: z.array(IDEA) });

export type IdeaDraft = z.infer<typeof IDEA>;

/** The trends in a search reply; none when the reply has no usable JSON. */
export function parseTrends(reply: string): Trend[] {
  try {
    const parsed = TRENDS.safeParse(extractJson(reply));
    if (!parsed.success) return [];
    return parsed.data.trends
      .filter((t) => t.title.trim() && /^https?:\/\//.test(t.url.trim()))
      .slice(0, 8)
      .map((t) => ({ title: t.title.trim(), summary: t.summary.trim(), url: t.url.trim() }));
  } catch {
    return [];
  }
}

/** Drafts as stored ideas, numbered after the `existing` ideas of that day. */
export function numberIdeas(date: string, existing: number, drafts: IdeaDraft[]): Idea[] {
  return drafts.map((draft, index) => ({
    id: `${date}-${existing + index + 1}`,
    format: draft.format,
    goal: draft.goal,
    angle: draft.angle,
    hook: draft.hook.trim(),
    outline: draft.outline.map((line) => line.trim()).filter(Boolean),
    why: draft.why.trim(),
    ...(draft.trend.trim() ? { trend: draft.trend.trim() } : {}),
    status: "new" as const,
  }));
}

/** This week's news, debates and formats in the client's niche. A failed search gives no trends rather than no ideas. */
export async function findTrends(client: Client, log: (message: string) => void): Promise<Trend[]> {
  log(`trends: searching what's new for ${client.niche || client.brief.business} ...`);
  try {
    const { text } = await generateText({
      telemetry: { functionId: "trends" },
      model: SEARCH_MODEL,
      prompt: `Find the 5-8 freshest news items, debates and trending Instagram post formats of the last 7 days for this niche: ${client.niche || client.brief.business}.
The audience: ${client.brief.audience}. Market: ${client.language === "ar" ? "Egypt and the Arab world" : "global, English-speaking"}.
Answer ONLY with JSON: {"trends":[{"title":"...","summary":"one sentence","url":"the source"}]}`,
    });
    const trends = parseTrends(text);
    log(`trends: ${trends.length} found`);
    return trends;
  } catch (error) {
    log(`trends: search failed, writing ideas without trends (${error instanceof Error ? error.message : error})`);
    return [];
  }
}

/** 5 ideas that follow the rules; one retry with what broke them. */
export async function writeIdeas(client: Client, trends: Trend[], pastHooks: string[], log: (message: string) => void): Promise<IdeaDraft[]> {
  const arabic = client.language === "ar";
  const prompt = `You are the Instagram content strategist of ${client.name} (${client.url}). Suggest today's 5 post ideas: niche, reach and shareable, never generic.

THE CLIENT
Niche: ${client.niche || client.brief.business}
Offer: ${client.brand.summary}
Business: ${client.brief.business}
Audience: ${client.brief.audience}
Their problems: ${client.brief.problems.join(" | ")}
Result they want: ${client.brief.result}
Features: ${client.brief.features.join(" | ")}
Call to action: "${client.brief.cta.label}" → ${client.brief.cta.url}
Tone: ${client.brief.tone}
Never: ${client.avoid || "nothing extra"}; never invent prices, testimonials, client counts or guarantees.

THIS WEEK'S TRENDS (ride one where it fits; cite its url in "trend")
${trends.length ? trends.map((t) => `- ${t.title}: ${t.summary} (${t.url})`).join("\n") : "none found today: use evergreen angles"}

HOOKS ALREADY USED IN THE LAST ${HISTORY_DAYS} DAYS (do not repeat or paraphrase)
${pastHooks.length ? pastHooks.map((h) => `- ${h}`).join("\n") : "none"}

RULES
- Exactly 5 ideas: at least 1 reel and at least 2 carousels; the goals awareness, details and offer each at least once; every idea a different angle.
- Language of hook and outline: ${arabic ? "Egyptian colloquial Arabic, natural, like talking to a business owner. Brand and platform names in Latin script" : "simple, natural English"}.
- Hooks stop the scroll: a pain the audience recognises, a surprising number, a bold claim or a direct question. Under 120 characters.
- Carousels are infographic: each outline line is one slide (cover first, call to action last). Reels: each line is a scene; the hook is said in the first 2 seconds.`;

  const write = (extra = "") => generateText({ telemetry: { functionId: "ideas" }, model: WRITER_MODEL, output: Output.object({ schema: IDEAS }), prompt: prompt + extra });
  log(`ideas: writing 5 ideas for ${client.name} ...`);
  let { output } = await write();
  const problems = ideaProblems(output.ideas, pastHooks);
  if (problems.length) {
    log(`ideas: fixing ${problems.length} problem(s) ...`);
    ({ output } = await write(`\n\nYOUR FIRST ANSWER BROKE THESE RULES:\n${problems.map((p) => `- ${p}`).join("\n")}\nWrite the 5 ideas again so none are broken.`));
    const still = ideaProblems(output.ideas, pastHooks);
    if (still.length) log(`ideas: still ${still.join(" ")}`);
  }
  return output.ideas.slice(0, 5);
}

/** Today's ideas for a client: trends, 5 ideas, appended to the day's file. */
export async function makeIdeas(clientId: string, log: (message: string) => void = console.log, date = localDate()): Promise<IdeaDay> {
  const client = await loadClient(clientId);
  const day = (await loadIdeas(clientId, date)) ?? { date, trends: [], ideas: [] };
  const trends = await findTrends(client, log);
  const pastHooks = (await recentIdeas(clientId, date, HISTORY_DAYS)).map((idea) => idea.hook);
  const drafts = await writeIdeas(client, trends, pastHooks, log);
  day.trends = [...day.trends, ...trends.filter((t) => !day.trends.some((old) => old.url === t.url))];
  day.ideas = [...day.ideas, ...numberIdeas(date, day.ideas.length, drafts)];
  await saveIdeas(clientId, day);
  log(`ideas: ${drafts.length} ideas saved for ${date}`);
  return day;
}
