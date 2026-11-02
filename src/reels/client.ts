import { generateText, Output } from "ai";
import { readFileSync } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { z } from "zod";

import { loadChannel, type Channel } from "../config.ts";
import { dialectLanguage, dialectProblems, directionNotes, maySell, modeOf, pitchProblems, type Dialect } from "../clients/direction.ts";
import { loadHistory, nextVoice, similarity, type Made } from "../clients/history.ts";
import { knowledgeText } from "../clients/knowledge.ts";
import { voiceDirection } from "../clients/reel.ts";
import { clientDir } from "../clients/store.ts";
import type { Client } from "../clients/types.ts";
import { reelDir, type Reel, type StoryReel } from "./store.ts";

/**
 * Story reels for a marketing client (Reel.client): the client's brand stands where a channel's
 * would (colours, logo, name, narrator), and the writer works from its brief, knowledge and
 * content direction instead of researching tech news.
 */

const WRITER_MODEL = "anthropic/claude-sonnet-5.5";
type Log = (message: string) => void;

export function loadClientNow(id: string): Client {
  return JSON.parse(readFileSync(join(clientDir(id), "client.json"), "utf8")) as Client;
}

/** The client dressed as a channel, so the reel's voice, job and follow card read it like one. */
export function clientChannel(client: Client, voice = "Charon", dialect: Dialect = "egyptian"): Channel {
  const c = client.brand.colors;
  const colors = { background: c.background, panel: c.panel, text: c.text, accent: c.accent, muted: c.muted, cta: c.cta };
  return {
    id: `client-${client.id}`,
    name: client.name,
    language: client.language,
    dialect: client.language === "ar" ? dialectLanguage(dialect) : undefined,
    narrator: {
      provider: "gemini",
      voice,
      style: voiceDirection(client.brief, dialect),
      ...(client.pronounce && Object.keys(client.pronounce).length ? { names: Object.values(client.pronounce) } : {}),
    },
    brand: { handle: client.instagramHandle ? `@${client.instagramHandle}` : "" } as Channel["brand"],
    audience: client.brief.audience,
    tone: client.brief.tone,
    voiceId: "",
    imageStyle: "",
    mascot: { kind: "none", name: "" } as unknown as Channel["mascot"],
    colors,
    font: client.brand.fonts?.heading ?? "Cairo",
  };
}

/** Who a reel speaks for: its client when it has one, else its channel. */
export function ownerOf(reel: Reel): Channel {
  const voice = reel.options?.voice;
  const dialect = reel.options?.dialect;
  const customStyle = reel.options?.voiceStyle?.trim();
  if (!reel.client) {
    const ch = loadChannel(reel.channel);
    if (!voice && !dialect && !customStyle) return ch;
    return {
      ...ch,
      narrator: {
        provider: ch.narrator?.provider ?? "gemini",
        voice: voice || ch.narrator?.voice || "Charon",
        style: customStyle || (dialect ? voiceDirection({ tone: ch.tone, audience: ch.audience, voice: "male" }, dialect) : ch.narrator?.style),
        ...(ch.narrator?.names ? { names: ch.narrator.names } : {}),
      },
    };
  }
  const ch = clientChannel(loadClientNow(reel.client.id), voice || reel.client.voice, dialect || reel.client.dialect);
  if (customStyle && ch.narrator) ch.narrator.style = customStyle;
  return ch;
}

const LINES = z.array(z.string()).min(8).max(12).describe(
  "What the narrator says, one short spoken sentence per line, 8-12 lines, 35-45 seconds in all. Line 1 is the hook in one breath, no greeting. " +
    "Every line in the dialect given, said the way people really talk. Numbers in digits. Never a URL, @handle or price.",
);

const SCENES = z.array(z.object({
  from: z.number().int().describe("First line (0-based); scene 1 starts at 0, each next scene starts later"),
  to: z.number().int(),
  kind: z.enum(["hook", "point", "chat", "layers", "specs", "stamp", "choice", "follow"]).describe(
    "hook: the opening headline (always scene 1). point: ONE big number or sign (٣، ٢، ١، ✗، ✓، ؟) with one short sentence: a tip, or a mistake in a countdown. " +
      "chat: 2-4 short message bubbles between a client and a coach, the client first: the situation as it really happens in DMs (invented, typical, never a real person). " +
      "layers: 3-5 short steps that light up one by one. specs: 3-5 short checklist items. stamp: ONE punch word or two. choice: two answers viewers pick in the comments. " +
      "follow: the brand's card, ALWAYS the last scene, on the last line only.",
  ),
  label: z.string().nullable().describe("An optional short chip (2-6 words) under point / chat / stamp; choice: the question; null otherwise"),
  point: z.object({ mark: z.string().describe("1-3 characters: a digit in Arabic-Indic (٣) or a sign"), text: z.string().describe("4-9 words") }).nullable(),
  title: z.string().nullable().describe("chat: who the chat is with, 1-3 words, e.g. «عميل جديد»; null otherwise"),
  messages: z.array(z.string()).max(4).nullable().describe("chat: 2-4 bubbles of 1-8 words each, just the message (no «عميل:» or «مدرب:» before it; the bubble side shows who)"),
  layers: z.array(z.string()).max(5).nullable().describe("layers: 3-5 steps of 2-6 words"),
  specs: z.array(z.string()).max(5).nullable().describe("specs: 3-5 items of 2-6 words"),
  stamp: z.string().nullable(),
  choice: z.array(z.string()).max(2).nullable().describe("choice: exactly 2 answers of 1-3 words"),
})).min(5).max(9);

const SCHEMA = z.object({
  title: z.string().describe("A short title for the reel, in the dialect"),
  caption: z.string().describe("The Instagram caption: 2-4 short lines in the dialect, ending with the question from the reel; no hashtags here"),
  hashtags: z.array(z.string()).max(8).describe("5-8 hashtags without #, Arabic and English"),
  lines: LINES,
  headline: z.object({
    text: z.string().describe("The opening headline on screen, 5-10 words in the dialect, the hook as a question or a bold claim"),
    highlight: z.string().describe("The punch phrase, copied exactly from the headline, 2-4 words"),
  }),
  scenes: SCENES,
  subs: z.array(z.object({ line: z.number().int(), key: z.string().describe("The ONE word of the line to stress, copied exactly from it") })),
});

type Draft = z.infer<typeof SCHEMA>;

const LOOKS: Record<string, string> = {
  aurora: "Aurora glass: slow, calm and premium; frosted glass cards over drifting colour light. Fewer, bigger ideas; let lines breathe.",
  variety: "Variety captions: playful TV-show energy; punchy short lines, a surprise or a funny moment of recognition, big reactions.",
  flat: "Flat vector explainer: clear and friendly, one idea per scene, simple steps and checklists.",
  sketch: "Sketch notebook explainer: a coach's notebook; each phrase adds one thing (a note, a circled number, a highlighted word); practical and honest.",
};

/** What a draft gets wrong, as instructions to fix it. */
function problemsOf(draft: Draft, client: Client, sell: boolean, dialect: Dialect | undefined, history: Made[]): string[] {
  const problems = [...dialectProblems(draft.lines, dialect), ...(sell ? [] : pitchProblems(draft.lines, client))];
  if (draft.lines.some((line) => !line.trim())) problems.push("Every line must have spoken words; never leave a line empty.");
  const kinds = draft.scenes.map((scene) => scene.kind);
  if (kinds[0] !== "hook") problems.push("Scene 1 must be the hook.");
  if (kinds.at(-1) !== "follow") problems.push("The last scene must be follow.");
  if (kinds.some((kind, i) => i > 0 && kind === kinds[i - 1])) problems.push("Never the same scene kind twice in a row.");
  const earlier = history.flatMap((made) => [made.title, ...made.lines]);
  const repeat = draft.lines.find((line) => earlier.some((old) => similarity(line, old) >= 0.6));
  if (repeat) problems.push(`«${repeat}» was already said in an earlier post; say something new.`);
  return problems;
}

/** The client's logo in the reel's media/, for the follow card. */
async function copyLogo(reel: Reel, client: Client): Promise<string | undefined> {
  if (!client.brand.logo) return undefined;
  const name = `client-logo${extname(client.brand.logo)}`;
  await mkdir(join(reelDir(reel.id), "media"), { recursive: true });
  try {
    await copyFile(join(clientDir(client.id), client.brand.logo), join(reelDir(reel.id), "media", name));
    return `media/${name}`;
  } catch {
    return undefined;
  }
}

/** The narrator and dialect a new client reel gets: the brief's voice gender, taking turns after the last reel. */
export async function clientVoice(client: Client): Promise<{ voice: string; dialect?: Dialect }> {
  const history = await loadHistory(client.id).catch(() => [] as Made[]);
  const dialect = client.language === "ar" ? (client.direction?.dialects?.[0] ?? "egyptian") : undefined;
  if (client.id === "risero") return { voice: "Ojb0nFbyzZn95u0i5a5p", dialect };
  return { voice: nextVoice(history, client.brief.voice === "female" ? "female" : "male"), dialect };
}

/** Writes a client's story reel from its brief, knowledge and direction: lines, headline and scenes. */
export async function writeClientReel(reel: Reel, client: Client, log: Log = console.log): Promise<Reel> {
  const history = await loadHistory(client.id).catch(() => [] as Made[]);
  const sell = maySell(client, history);
  const dialect = reel.client?.dialect;
  const language = dialect ? dialectLanguage(dialect) : client.language === "ar" ? "Arabic" : "English";
  const done = history.slice(0, 30).map((made) => `- ${made.topic ?? made.title}`).join("\n");
  const prompt = `You write a 35-45 second vertical Instagram reel for the brand "${client.name}".
What the brand does: ${client.brief.business}
Audience: ${client.brief.audience}
Tone: ${client.brief.tone}
Language: ${language}. Every line, headline, bubble and label in it.
ARABIC ON SCREEN AND IN THE VOICE:
- Natural spoken Egyptian a coach would say to a friend; read every sentence aloud in your head. No word-for-word translations from English, no fusha phrasing, no awkward phrases (write «بساعد الناس يبنوا عادات» not «بخدم تدريب عادات»).
- No English words or abbreviations (CTA, DM, follow up, booking) except the brand's own name; say «زرار حجز», «رسالة»، «متابعة».
- Correct spelling with hamzas and taa marbuta (إمتى، مساءً، رسالة). One number style everywhere: write numbers as digits.
- Headline, bubbles, labels and steps say the same thing as the lines spoken over them, in the same words where possible.
Look: ${LOOKS[reel.style] ?? ""}

${directionNotes(client, "reel", history, sell)}
${sell ? "" : `This reel ${modeOf(client) === "mix" ? "is a value piece" : "is value content"}: teach ONE practical idea the viewer can use today without the product. Never name ${client.name} or walk through its features; the brand appears only on the last (follow) scene. End on a question that makes people comment or save.`}

WHAT THE BRAND KNOWS (facts only from here; never invent results, prices or numbers about the brand):
${knowledgeText(client.knowledge)}
Never: ${client.avoid}

ALREADY MADE (never repeat a topic, hook or angle):
${done || "(nothing yet)"}

THE REEL TO WRITE: ${reel.topic}

Scenes: start with the hook, 5-9 scenes, at least 4 different kinds, never the same kind twice in a row, the follow scene alone on the last line. Each scene covers the lines that talk about it.`;
  const write = async (extra = "") => {
    for (const model of [WRITER_MODEL, "openai/gpt-5", "google/gemini-2.5-flash"]) {
      try {
        const { output } = await generateText({ telemetry: { functionId: "script" }, model, output: Output.object({ schema: SCHEMA }), prompt: prompt + extra });
        return output;
      } catch (error) {
        if (!(error instanceof Error && /Free tier users do not have access/i.test(error.message)) || model === "google/gemini-2.5-flash") throw error;
      }
    }
    throw new Error("No writer model available");
  };
  log(`script: writing the ${reel.style} reel for ${client.name} ...`);
  let draft = await write();
  const problems = problemsOf(draft, client, sell, dialect, history);
  if (problems.length) {
    log(`script: fixing ${problems.length} problem(s): ${problems.join(" ")}`);
    draft = await write(`\n\nYOUR FIRST DRAFT HAD THESE PROBLEMS, fix every one:\n${problems.map((p) => `- ${p}`).join("\n")}`);
  }
  const logo = await copyLogo(reel, client);
  const story: StoryReel = {
    headline: draft.headline,
    ...(logo ? { logo } : {}),
    scenes: draft.scenes.map((scene) => ({
      lines: [scene.from, scene.to] as [number, number],
      kind: scene.kind,
      ...(scene.label ? { label: scene.label } : {}),
      ...(scene.kind === "point" && scene.point ? { point: scene.point } : {}),
      ...(scene.kind === "chat" && scene.messages?.length ? { messages: scene.messages, ...(scene.title ? { title: scene.title } : {}) } : {}),
      ...(scene.kind === "layers" && scene.layers?.length ? { layers: scene.layers } : {}),
      ...(scene.kind === "specs" && scene.specs?.length ? { specs: scene.specs } : {}),
      ...(scene.kind === "stamp" && scene.stamp ? { stamp: scene.stamp } : {}),
      ...(scene.kind === "choice" && scene.choice?.length === 2 ? { choice: [scene.choice[0], scene.choice[1]] as [string, string] } : {}),
    })),
    subs: draft.subs,
  };
  return {
    ...reel,
    title: draft.title,
    lines: draft.lines.map((line) => line.trim() || client.name),
    story,
    instagram: { caption: draft.caption, hashtags: draft.hashtags },
    youtube: { title: draft.title, description: `${draft.caption}\n\n${draft.hashtags.map((tag) => `#${tag}`).join(" ")}`, tags: draft.hashtags },
  };
}
