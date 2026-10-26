import { test } from "node:test";
import assert from "node:assert/strict";

import { applyScreenText, screenTextPrompt, staleScreenText } from "./screen-text.ts";

const scene = (id: string, narration: string, textFor?: string) =>
  ({ id, narration, visual: { type: "marketing", beat: "turn", headline: "أسبوعك في ورقة واحدة. وأي حاجة برّاها، متعملهاش بعد الشغل.", words: ["ورقة واحدة"], items: [], ...(textFor !== undefined ? { textFor } : {}) } }) as never;

test("a scene's screen text is out of date when its voice text changed since it was written, or was never marked", () => {
  const scenes = [scene("s001", "نفس الكلام", "نفس الكلام"), scene("s002", "كلام جديد", "كلام قديم"), scene("s003", "لسه ما اتعلمش")];
  assert.deepEqual(staleScreenText(scenes).map((s: { id: string }) => s.id), ["s002", "s003"]);
});

test("the rewrite is told the new voice text, the old screen text and to keep the same shape", () => {
  const prompt = screenTextPrompt([scene("s006", "ونصيحة أخيرة: اكتب أسبوعك في ورقة واحدة. وأي حاجة مش فيها، متعملهاش في وقت الشغل.", "قديم")], "Egyptian colloquial Arabic");
  assert.match(prompt, /مش فيها، متعملهاش في وقت الشغل/);
  assert.match(prompt, /برّاها/);
  assert.match(prompt, /same number/i);
  assert.match(prompt, /Egyptian/);
});

test("the rewritten text replaces the scene's screen text, keeps the item count, and marks it as matching", () => {
  const s = scene("s006", "النص الجديد", "قديم") as { visual: Record<string, unknown>; narration: string };
  (s.visual as { items: unknown[] }).items = [{ label: "a", value: "b" }];
  applyScreenText(s as never, { headline: " عنوان جديد ", words: ["كلمة", ""], items: [{ label: "x", value: "" }, { label: "extra", value: "y" }] });
  assert.equal(s.visual.headline, "عنوان جديد");
  assert.deepEqual(s.visual.words, ["كلمة"]);
  assert.deepEqual(s.visual.items, [{ label: "x" }], "never more items than the beat had");
  assert.equal(s.visual.textFor, "النص الجديد");
});
