import { test } from "node:test";
import assert from "node:assert/strict";

import { emptyKnowledge, knowledgeText, mergeAnswer } from "./knowledge.ts";

const knowledge = {
  ...emptyKnowledge(),
  howItWorks: ["العميل يفتح لينك البايو", "يشوف خدماتك وآراء عملائك", "يختار ميعاد ويحجز"],
  different: ["الحجز والصفحة والأرقام في مكان واحد"],
  personas: [{ name: "المدربة المشغولة", who: "مدربة حياة بتشتغل أونلاين", words: ["مش ملاحقة على الرسايل"], worries: ["العميل يختفي"], wishes: ["جدول مليان من غير مجهود"] }],
  objections: [{ doubt: "غالي؟", answer: "مكالمة مجانية ١٥ دقيقة الأول" }],
  facts: ["تأكيد وتذكير تلقائي بالإيميل"],
  avoid: ["ما تقولش إنها بتزود المبيعات بنسبة معينة"],
};

test("the prompt section carries how it works, the customers in their words, and what to never claim", () => {
  const text = knowledgeText(knowledge);
  assert.match(text, /HOW IT WORKS/);
  assert.match(text, /1\. العميل يفتح لينك البايو/);
  assert.match(text, /المدربة المشغولة/);
  assert.match(text, /مش ملاحقة على الرسايل/);
  assert.match(text, /غالي؟ → مكالمة مجانية/);
  assert.match(text, /NEVER/);
});

test("no knowledge, or an empty one, adds nothing to a prompt", () => {
  assert.equal(knowledgeText(undefined), "");
  assert.equal(knowledgeText(emptyKnowledge()), "");
});

test("an answer is recorded on its question; answering again replaces it; others are untouched", () => {
  const base = { ...emptyKnowledge(), questions: [{ id: "q1", question: "مين بيحجز أكتر؟" }, { id: "q2", question: "نتيجة حقيقية؟" }] };
  const once = mergeAnswer(base, "q1", "مدربين حياة");
  const twice = mergeAnswer(once, "q1", "مدربين حياة ومستشارين");
  assert.equal(twice.questions[0].answer, "مدربين حياة ومستشارين");
  assert.equal(twice.questions[1].answer, undefined);
  assert.throws(() => mergeAnswer(base, "nope", "x"));
});
