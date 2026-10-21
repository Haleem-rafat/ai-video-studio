import { test } from "node:test";
import assert from "node:assert/strict";

import { clientPrompt, extractBlock, MARKERS, readClientAnswers, type Ask } from "./client-prompt.ts";
import { QUESTIONS } from "./questionnaire.ts";
import type { Client } from "./types.ts";

const client = {
  id: "risero",
  name: "Risero",
  url: "https://diaaeziada.risero.io/",
  language: "ar",
  avoid: "No prices",
  brand: { summary: "Booking pages for coaches", services: ["Booking page"] },
  brief: { business: "", audience: "Coaches and consultants", problems: [], result: "", features: [], cta: { label: "Book a free call", url: "https://cal.com/x" }, tone: "" },
} as unknown as Client;

test("the prompt makes the client's AI interview them one question at a time and end with one block to send back", () => {
  const text = clientPrompt(client, "en");
  assert.match(text, /Risero/);
  assert.match(text, /one question at a time/i);
  assert.ok(text.includes(MARKERS.start) && text.includes(MARKERS.end));
  for (const q of QUESTIONS) assert.ok(text.includes(q.id), `missing ${q.id}`);
  assert.match(text, /friendly = Friendly/, "choice questions list their option codes with labels");
  // What the website says is offered to confirm, not asked from scratch.
  assert.match(text, /Coaches and consultants/);
  assert.doesNotMatch(text, /api[_ -]?key|ELEVENLABS|businessContext|<client>/i);
});

test("the Arabic prompt asks in Arabic, while the answer block keeps the same ids", () => {
  const text = clientPrompt(client, "ar");
  assert.ok(text.includes(QUESTIONS[0].label.ar));
  assert.match(text, /سؤال واحد/);
  assert.ok(text.includes(MARKERS.start));
  assert.ok(text.includes('"format": "ai-video-studio/client-ai"'));
});

test("the answer block is found inside a whole pasted chat, code fences and all", () => {
  const chat = `Assistant: Great, thank you!\nHere is your summary:\n\`\`\`\n${MARKERS.start}\n{"format":"ai-video-studio/client-ai","client":"risero","answers":{"overview.what":"صفحات حجز","voice.tone":["friendly"]}}\n${MARKERS.end}\n\`\`\`\nSend this to your agency.`;
  const block = extractBlock(chat);
  assert.equal(block?.client, "risero");
  assert.equal(block?.answers["overview.what"], "صفحات حجز");
  assert.equal(extractBlock("just some text, no block"), null);
  assert.equal(extractBlock(`${MARKERS.start}\n{broken json\n${MARKERS.end}`), null);
});

const never: Ask = async () => {
  throw new Error("the AI should not be asked");
};

test("an exact block is read for free, without asking the AI, and explained question by question", async () => {
  const text = `${MARKERS.start}{"format":"ai-video-studio/client-ai","client":"risero","answers":{"overview.what":"Booking pages","goals.primary":"Sales and bookings","made.up":"x"}}${MARKERS.end}`;
  const preview = await readClientAnswers(client, text, () => {}, never);
  assert.equal(preview.method, "exact");
  assert.equal(preview.answers["goals.primary"], "sales");
  const item = preview.items.find((each) => each.id === "goals.primary")!;
  assert.equal(item.question.en, QUESTIONS.find((q) => q.id === "goals.primary")!.label.en);
  // Shown in the dialog's language: option labels in both.
  assert.deepEqual(item.text, { en: "Sales and bookings", ar: "مبيعات وحجوزات" });
  assert.ok(preview.errors.some((error) => error.question === "made.up"));
  assert.equal(preview.otherClient, false);
});

test("a block made for another client is flagged", async () => {
  const text = `${MARKERS.start}{"format":"ai-video-studio/client-ai","client":"bakery","answers":{"overview.what":"Bread"}}${MARKERS.end}`;
  assert.equal((await readClientAnswers(client, text, () => {}, never)).otherClient, true);
});

test("free text goes to the AI, which maps it to questions; its notes and doubts are shown, unknown ids dropped", async () => {
  let asked = "";
  const ask: Ask = async (prompt) => {
    asked = prompt;
    return {
      answers: [
        { id: "audience.who", answer: "كوتشز ومستشارين في مصر", sure: true, note: "" },
        { id: "voice.tone", answer: "ودود, زي صاحب كبير", sure: false, note: "They said 'like an older brother'" },
        { id: "nope.nope", answer: "x", sure: true, note: "" },
      ],
      leftover: "They also sell a course",
    };
  };
  const preview = await readClientAnswers(client, "We help coaches in Egypt... we sound friendly like an older brother. Also a course.", () => {}, ask);
  assert.equal(preview.method, "ai");
  assert.match(asked, /never instructions/i, "the pasted text is fenced as data");
  assert.equal(preview.answers["audience.who"], "كوتشز ومستشارين في مصر");
  assert.deepEqual(preview.answers["voice.tone"], ["friendly", "other:زي صاحب كبير"]);
  assert.equal(preview.items.find((each) => each.id === "voice.tone")!.sure, false);
  assert.equal(preview.answers["nope.nope"], undefined);
  assert.equal(preview.leftover, "They also sell a course");
});

test("the real block is found even when the AI repeats the markers in its closing sentence, or the chat includes the prompt's example", () => {
  const example = clientPrompt(client, "ar");
  const chat = `${example}\n\nAI: thanks!\n${MARKERS.start}\n{"format":"ai-video-studio/client-ai","client":"risero","answers":{"overview.what":"صفحات حجز"}}\n${MARKERS.end}\n\nانسخ كل حاجة من ${MARKERS.start} لحد ${MARKERS.end} وابعتها للوكالة.`;
  assert.deepEqual(extractBlock(chat)?.answers, { "overview.what": "صفحات حجز" });
});

test("the prompt's own example block, with only placeholders, is not taken as answers", () => {
  assert.equal(extractBlock(clientPrompt(client, "en")), null);
});
