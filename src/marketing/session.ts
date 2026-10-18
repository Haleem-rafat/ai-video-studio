import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { generateText, Output } from "ai";
import { z } from "zod";

import { OUTPUT_DIR, ROOT } from "../config.ts";
import type { Creativity, FormatId, MarketingBrief, SiteBrand } from "../types.ts";

const CHAT_MODEL = "anthropic/claude-sonnet-5.5";

export const SESSIONS_DIR = join(OUTPUT_DIR, ".marketing");

export type ChatMessage = { role: "assistant" | "user"; text: string; options?: string[] };

/**
 * One marketing video in the making: the website is read, then the chat
 * fills the brief one question at a time; once nothing is missing the video
 * can be written. Kept in output/.marketing/<id>/ with the screenshots.
 */
export type Session = {
  id: string;
  url: string;
  language: "en" | "ar";
  /** "both" makes a vertical and a horizontal video from the same brief. */
  format: FormatId | "both";
  creativity: Creativity;
  /** The script whose structure and direction the video follows: the default one, or the user's own. */
  script: string;
  status: "reading" | "chat" | "writing" | "done" | "failed";
  brand?: SiteBrand;
  brief: MarketingBrief;
  messages: ChatMessage[];
  missing: string[];
  projectId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export const EMPTY_BRIEF: MarketingBrief = {
  business: "",
  audience: "",
  problems: [],
  result: "",
  features: [],
  proof: "",
  data: "",
  cta: { label: "", url: "" },
  tone: "",
  voice: "",
  seconds: 0,
  platforms: [],
  captions: null,
  notes: "",
};

/** The default script and direction for a language: prompts/marketing-<language>.md. */
export async function defaultScript(language: "en" | "ar"): Promise<string> {
  return readFile(join(ROOT, "prompts", `marketing-${language}.md`), "utf8");
}

export function sessionDir(id: string): string {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`Bad session id "${id}".`);
  return join(SESSIONS_DIR, id);
}

export async function loadSession(id: string): Promise<Session> {
  return JSON.parse(await readFile(join(sessionDir(id), "session.json"), "utf8")) as Session;
}

export async function saveSession(session: Session): Promise<void> {
  const dir = sessionDir(session.id);
  await mkdir(dir, { recursive: true });
  session.updatedAt = new Date().toISOString();
  session.missing = missingOf(session.brief);
  await writeFile(join(dir, "session.json.tmp"), JSON.stringify(session, null, 2));
  await rename(join(dir, "session.json.tmp"), join(dir, "session.json"));
}

export async function listSessions(): Promise<Session[]> {
  if (!existsSync(SESSIONS_DIR)) return [];
  const entries = await readdir(SESSIONS_DIR, { withFileTypes: true });
  const sessions = await Promise.all(entries.filter((entry) => entry.isDirectory()).map((entry) => loadSession(entry.name).catch(() => null)));
  return sessions.filter((session): session is Session => session !== null).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function newSession(input: { url: string; language: "en" | "ar"; format: FormatId | "both"; creativity: Creativity; script: string }): Session {
  const host = input.url.replace(/^https?:\/\//i, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 30);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const now = new Date().toISOString();
  return { id: `${stamp}-${host || "site"}`, ...input, status: "reading", brief: structuredClone(EMPTY_BRIEF), messages: [], missing: missingOf(EMPTY_BRIEF), createdAt: now, updatedAt: now };
}

/** What the brief still needs before the video can be written (the optional proof and notes never count). */
export function missingOf(brief: MarketingBrief): string[] {
  const missing: string[] = [];
  if (!brief.business.trim()) missing.push("business");
  if (!brief.audience.trim()) missing.push("audience");
  if (!brief.problems.length) missing.push("problems");
  if (!brief.result.trim()) missing.push("result");
  if (!brief.features.length) missing.push("features");
  if (!brief.data) missing.push("data");
  if (!brief.cta.label.trim() || !brief.cta.url.trim()) missing.push("cta");
  if (!brief.tone.trim()) missing.push("tone");
  if (!brief.voice) missing.push("voice");
  if (!brief.seconds) missing.push("seconds");
  if (!brief.platforms.length) missing.push("platforms");
  if (brief.captions === null) missing.push("captions");
  return missing;
}

const BRIEF = z.object({
  business: z.string().describe("Brand name and what it sells, one line"),
  audience: z.string().describe("Who the video speaks to"),
  problems: z.array(z.string()).describe("The customer's problems the video shows, short phrases"),
  result: z.string().describe("The result the video sells (not a feature list)"),
  features: z.array(z.string()).describe("Features shown in the video; only ones the product really has"),
  proof: z.string().describe("Real proof: testimonials, client counts, results. Empty if none was given"),
  data: z.enum(["real", "example", ""]).describe("Numbers on a dashboard: the client's real ones (they gave them), or examples labelled as such"),
  cta: z.object({ label: z.string(), url: z.string() }),
  tone: z.string(),
  voice: z.enum(["male", "female", ""]),
  seconds: z.number().int().describe("Video length in seconds, 0 if unknown"),
  platforms: z.array(z.string()).describe("Where it will be posted: Instagram Reels, TikTok, YouTube Shorts, YouTube, Facebook, LinkedIn, Snapchat"),
  captions: z.boolean().nullable().describe("Burn subtitles of the whole narration into the video (null = not asked yet)"),
  notes: z.string().describe("Anything else the user asked for: words to avoid, an offer, a deadline"),
});

const TURN = z.object({
  reply: z.string().describe("Your next chat message: short, friendly, ONE question at most"),
  options: z.array(z.string()).max(5).describe("2-5 one-tap answers for that question, in the chat's language; empty if it is open-ended"),
  brief: BRIEF.describe("The whole brief so far, updated with everything the user just said"),
});

const LABELS: Record<string, string> = {
  business: "the business in one line",
  audience: "who the video speaks to",
  problems: "the customer's problems",
  result: "the result to sell",
  features: "which features to show",
  data: "whether dashboard numbers are real or examples",
  cta: "the call to action and its link",
  tone: "the tone",
  voice: "a male or female voice",
  seconds: "the length",
  platforms: "where it will be posted",
  captions: "subtitles on or off",
};

/**
 * The producer's next chat turn: folds the user's last answer into the
 * brief and asks the next question, or, when nothing is missing, sums the
 * plan up and says the video can be made.
 */
export async function assistantTurn(session: Session): Promise<void> {
  const brand = session.brand!;
  const arabic = session.language === "ar";
  const missing = missingOf(session.brief);
  const first = session.messages.length === 0;
  const { output } = await generateText({
    telemetry: { functionId: "chat" },
    model: CHAT_MODEL,
    output: Output.object({ schema: TURN }),
    system: `You are a video producer inside a studio app, preparing a short marketing video for a business's social media. You chat with the person making it, in ${arabic ? "Egyptian colloquial Arabic (simple, warm, like a colleague)" : "simple English"}.
Your job: fill the brief, then hand over to the writer. Rules:
- Ask ONE question per message, and offer 2-5 one-tap answers (options) when the answer can be picked.
- Pre-fill everything the website already tells you (business, audience, problems, features, call to action) and ask the user to confirm it in one go rather than asking each part.
- Never invent features, numbers, testimonials or prices. Proof is optional: ask once if they have real testimonials or results; if not, leave it empty.
- Dashboard numbers: ask whether they have real numbers; otherwise they are examples and the video labels them so.
- The length depends on the platforms: Reels/TikTok/Shorts usually 30-60 seconds (up to 90), a YouTube or website video 90-180 seconds. Suggest one.
- Keep replies short (1-3 sentences + the question). No markdown headings.
- When the brief is complete, reply with a 3-5 line summary of the plan (beats of the video, length, call to action) and tell them to press "${arabic ? "اعمل الفيديو" : "Create video"}" — unless they want changes.`,
    prompt: `Video format: ${session.format === "both" ? "two versions, vertical 9:16 and horizontal 16:9" : session.format === "short" ? "vertical 9:16" : "horizontal 16:9"}.
Website: ${brand.url}
Brand name: ${brand.name}
What the site says it offers: ${brand.summary}
Services on the site: ${brand.services.join(" | ")}
Call to action on the site: ${brand.cta ? `${brand.cta.label} → ${brand.cta.url}` : "none found"}
Page text (excerpt):
${brand.text.slice(0, 5000)}

The script the video should follow (structure, tone, animation direction):
${session.script.slice(0, 7000)}

Brief so far (JSON): ${JSON.stringify(session.brief)}
Still missing: ${missing.length ? missing.map((key) => LABELS[key]).join(", ") : "nothing"}

Chat so far:
${first ? "(nothing yet — open the chat: say in one sentence what you found on the website, show the pre-filled brief briefly, and ask the first question)" : session.messages.map((message) => `${message.role === "user" ? "USER" : "YOU"}: ${message.text}`).join("\n")}`,
  });
  // The brief never loses an answer because the model left it out.
  const next = output.brief;
  const brief = session.brief;
  session.brief = {
    business: next.business || brief.business,
    audience: next.audience || brief.audience,
    problems: next.problems.length ? next.problems : brief.problems,
    result: next.result || brief.result,
    features: next.features.length ? next.features : brief.features,
    proof: next.proof || brief.proof,
    data: next.data || brief.data,
    cta: { label: next.cta.label || brief.cta.label, url: next.cta.url || brief.cta.url },
    tone: next.tone || brief.tone,
    voice: next.voice || brief.voice,
    seconds: next.seconds || brief.seconds,
    platforms: next.platforms.length ? next.platforms : brief.platforms,
    captions: next.captions ?? brief.captions,
    notes: next.notes || brief.notes,
  };
  session.messages.push({ role: "assistant", text: output.reply.trim(), ...(output.options.length ? { options: output.options } : {}) });
}
