import { generateText, Output } from "ai";
import { z } from "zod";

import type { Client } from "./types.ts";

const MODEL = "anthropic/claude-sonnet-5.5";

export type Persona = { name: string; who: string; words: string[]; worries: string[]; wishes: string[] };

/** What a writer must know about a client to write like someone who understands the product and its customers. */
export type Knowledge = {
  /** 3-6 steps, from the customer's side. */
  howItWorks: string[];
  different: string[];
  personas: Persona[];
  objections: { doubt: string; answer: string }[];
  /** Real results and examples the client confirmed. */
  proof: string[];
  /** True claims a script may make. */
  facts: string[];
  use: string[];
  avoid: string[];
  /** The interview: what the website doesn't say. */
  questions: { id: string; question: string; answer?: string }[];
  updatedAt: string;
};

export function emptyKnowledge(): Knowledge {
  return { howItWorks: [], different: [], personas: [], objections: [], proof: [], facts: [], use: [], avoid: [], questions: [], updatedAt: new Date(0).toISOString() };
}

const lines = (title: string, list: string[]) => (list.length ? `${title}\n${list.map((item) => `- ${item}`).join("\n")}` : "");

/** The knowledge as a prompt section; "" when there is none, so writers behave as before. */
export function knowledgeText(knowledge: Knowledge | undefined): string {
  if (!knowledge) return "";
  const answered = knowledge.questions.filter((q) => q.answer?.trim());
  const sections = [
    knowledge.howItWorks.length ? `HOW IT WORKS (the customer's side)\n${knowledge.howItWorks.map((step, i) => `${i + 1}. ${step}`).join("\n")}` : "",
    lines("WHAT MAKES IT DIFFERENT", knowledge.different),
    knowledge.personas.length
      ? `THE CUSTOMERS (write to one of them, in their own words)\n${knowledge.personas
          .map((p) => `- ${p.name}: ${p.who}\n  says: ${p.words.map((w) => `«${w}»`).join(" ")}\n  worries: ${p.worries.join(" | ")}\n  wishes: ${p.wishes.join(" | ")}`)
          .join("\n")}`
      : "",
    knowledge.objections.length ? `WHAT THEY DOUBT → THE ANSWER\n${knowledge.objections.map((o) => `- ${o.doubt} → ${o.answer}`).join("\n")}` : "",
    lines("PROOF (real, confirmed)", knowledge.proof),
    lines("TRUE FACTS a script may state", knowledge.facts),
    answered.length ? `FROM THE CLIENT\n${answered.map((q) => `- ${q.question} ${q.answer}`).join("\n")}` : "",
    lines("WORDS TO USE", knowledge.use),
    lines("NEVER say or claim", knowledge.avoid),
  ].filter(Boolean);
  return sections.length ? `CLIENT KNOWLEDGE (the source of truth about the product and its customers)\n\n${sections.join("\n\n")}` : "";
}

/** Records an answer on its question (a newer answer replaces the old one). */
export function mergeAnswer(knowledge: Knowledge, questionId: string, answer: string): Knowledge {
  if (!knowledge.questions.some((q) => q.id === questionId)) throw new Error(`No question ${questionId}`);
  return { ...knowledge, questions: knowledge.questions.map((q) => (q.id === questionId ? { ...q, answer: answer.trim() } : q)), updatedAt: new Date().toISOString() };
}

const PERSONA = z.object({ name: z.string(), who: z.string(), words: z.array(z.string()), worries: z.array(z.string()), wishes: z.array(z.string()) });
const DRAFT = z.object({
  howItWorks: z.array(z.string()).describe("3-6 concrete steps the customer goes through, from first seeing it to the result"),
  different: z.array(z.string()).describe("2-4 things that make it different from what customers do today"),
  personas: z.array(PERSONA).describe("2-3 real customer types; `words` are 3-5 short phrases they would really say"),
  objections: z.array(z.object({ doubt: z.string(), answer: z.string() })).describe("3-5 doubts before buying, each with the honest answer"),
  proof: z.array(z.string()).describe("Only results/examples stated on the site; empty if none"),
  facts: z.array(z.string()).describe("Claims the site supports, short"),
  use: z.array(z.string()).describe("Words and phrases that fit the brand and its customers"),
  avoid: z.array(z.string()).describe("Claims or words to avoid (unconfirmed features, invented numbers, hype)"),
  questions: z.array(z.string()).describe("5-7 questions to ask the business owner about what the site does not say: how a customer starts, who buys most, what they doubt, a real result, what to never claim"),
});

function sourceOf(client: Client): string {
  return `Business: ${client.name} (${client.url})
Offer: ${client.brand.summary}
Services: ${client.brand.services.join(" | ")}
Brief: ${client.brief.business}
Audience: ${client.brief.audience}
Problems: ${client.brief.problems.join(" | ")}
Result: ${client.brief.result}
Features: ${client.brief.features.join(" | ")}
Call to action: ${client.brief.cta.label} → ${client.brief.cta.url}
Notes: ${client.brief.notes || client.avoid || "none"}

WEBSITE TEXT
${client.brand.text}`;
}

/** Drafts the knowledge from the website and brief, with questions about what they don't say. */
export async function draftKnowledge(client: Client, log: (message: string) => void = console.log): Promise<Knowledge> {
  log(`knowledge: reading ${client.brand.text.length} characters of ${client.name}'s website and brief ...`);
  const { output } = await generateText({
    telemetry: { functionId: "knowledge" },
    model: MODEL,
    output: Output.object({ schema: DRAFT }),
    prompt: `You are a senior product marketer learning a client's product before writing its Instagram content. From the material below, write what a copywriter must know. Be concrete and specific to THIS product (real steps, real features, real customer situations), never generic marketing. Only state what the material supports; put guesses into questions instead.
Language: ${client.language === "ar" ? "Egyptian colloquial Arabic for customer words, worries, wishes and questions; other fields in clear Arabic" : "English"}.

${sourceOf(client)}`,
  });
  const keep = client.knowledge?.questions.filter((q) => q.answer?.trim()) ?? [];
  return {
    ...output,
    questions: [...keep, ...output.questions.map((question, i) => ({ id: `q${Date.now().toString(36)}${i}`, question }))],
    updatedAt: new Date().toISOString(),
  };
}

const UPDATE = DRAFT.omit({ questions: true });

/** Folds an interview answer into the knowledge (facts, proof, personas…), keeping everything else. */
export async function foldAnswer(client: Client, knowledge: Knowledge, questionId: string, answer: string, log: (message: string) => void = console.log): Promise<Knowledge> {
  const next = mergeAnswer(knowledge, questionId, answer);
  const question = next.questions.find((q) => q.id === questionId)!;
  log("knowledge: adding the answer ...");
  const { questions, updatedAt, ...current } = next;
  const { output } = await generateText({
    telemetry: { functionId: "knowledge" },
    model: MODEL,
    output: Output.object({ schema: UPDATE }),
    prompt: `Update this client knowledge with the owner's answer. Change only what the answer adds or corrects; keep everything else exactly. Same language as the knowledge.

QUESTION: ${question.question}
ANSWER: ${answer}

KNOWLEDGE (JSON):
${JSON.stringify(current)}`,
  });
  return { ...output, questions, updatedAt };
}
