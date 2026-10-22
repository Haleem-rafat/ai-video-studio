import { test } from "node:test";
import assert from "node:assert/strict";

import { acceptCorrections, acceptMarks, textsOf } from "./arabic.ts";

test("a proofread fix is kept when it is a small correction, refused when it rewrites the text", () => {
  const out = acceptCorrections(["#اصحاب_الخدمات", "صفحة واحدة تقدر تقولها عنك", "العميل يحجز بنفسه"], ["#أصحاب_الخدمات", "صفحة واحدة تقول كل حاجة عنك", "كلام مختلف تمامًا عن الأصل هنا"]);
  assert.deepEqual(out, ["#أصحاب_الخدمات", "صفحة واحدة تقول كل حاجة عنك", "العميل يحجز بنفسه"]);
});

test("a proofread answer of the wrong length changes nothing", () => {
  assert.deepEqual(acceptCorrections(["a", "b"], ["a"]), ["a", "b"]);
});

test("vowel marks are kept only when no letter changed", () => {
  assert.deepEqual(acceptMarks(["آراء عملائك", "ميعادين"], ["آراءْ عُملائك", "مواعيد"]), ["آراءْ عُملائك", "ميعادين"]);
});

test("textsOf reaches every text in slides and scenes, but not urls, art or ids", () => {
  const post = { slides: [{ layout: "list", title: "t", items: ["a", "b"], art: { prompt: "p", file: "art/01.png" } }, { layout: "cta", title: "c", button: "b", url: "https://x" }] };
  const texts = textsOf(post);
  assert.deepEqual(texts.map((t) => t.get()), ["t", "a", "b", "c", "b"]);
  texts[1].set("A");
  assert.equal((post.slides[0] as { items: string[] }).items[0], "A");
  const scene = { id: "s001", narration: "n", imagePrompt: "", visual: { type: "marketing", beat: "kinetic", headline: "h", words: ["w"], items: [{ label: "l", value: "message" }] } };
  assert.deepEqual(textsOf(scene).map((t) => t.get()), ["n", "h", "w", "l"]);
});

test("spellings worked out for the voice are kept only when they are Arabic letters for a word that was asked", async () => {
  const { usableSpellings } = await import("./arabic.ts");
  assert.deepEqual(
    usableSpellings([{ latin: "Calendly", arabic: "كاليندلي" }, { latin: "Notion", arabic: "Notion" }, { latin: "Other", arabic: "أذر" }, { latin: "Zapier", arabic: " زابير " }], ["Calendly", "Notion", "zapier"]),
    { Calendly: "كاليندلي", Zapier: "زابير" },
  );
});

test("only scenes whose narration changed get new spoken text", async () => {
  const { prepareSpeech } = await import("./arabic.ts");
  const scenes = [
    { id: "s1", narration: "kept", speech: { for: "kept", text: "KEPT" }, visual: { type: "title", headline: "" }, imagePrompt: "" },
    { id: "s2", narration: "edited", speech: { for: "old", text: "OLD" }, visual: { type: "title", headline: "" }, imagePrompt: "" },
  ] as never[] as { narration: string; speech?: { for: string; text: string } }[];
  await prepareSpeech(scenes as never, { language: "en" }, () => {}, "egyptian", { onlyStale: true });
  assert.deepEqual(scenes.map((scene) => scene.speech), [{ for: "kept", text: "KEPT" }, { for: "edited", text: "edited" }]);
});
