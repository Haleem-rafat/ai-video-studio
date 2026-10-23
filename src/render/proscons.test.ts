import { test } from "node:test";
import assert from "node:assert/strict";

import type { Project, Scene } from "../types.ts";
import { buildProsCons, chapterTimes, pointsOf, tallyOf } from "./proscons.ts";
import { prosConsScenes } from "../script/proscons.ts";
import { loadChannels } from "../config.ts";

const camera = {
  type: "versus" as const,
  title: "الكاميرا",
  kind: "chapter" as const,
  rows: [{ label: "عدسات", a: "2", b: "3", winner: "b" as const }],
  explain: { term: "Telephoto", meaning: "عدسة بتقرب من غير ما الصورة تبوظ" },
  pros: { a: ["شاشة كبيرة للمعاينة"], b: ["زوم 5x", "ProRes"] },
  cons: { a: ["مفيش Telephoto"], b: [] },
  verdict: "b" as const,
};

test("a chapter's points are stamped pros first, alternating sides, then cons", () => {
  assert.deepEqual(
    pointsOf(camera).map((p) => `${p.good ? "+" : "-"}${p.side} ${p.text}`),
    ["+a شاشة كبيرة للمعاينة", "+b زوم 5x", "+b ProRes", "-a مفيش Telephoto"],
  );
});

test("a chapter's parts land in order inside its time: rows, the term, the points, then the winner", () => {
  const t = chapterTimes({ seconds: 30, visual: camera });
  assert.ok(t.rows[0] < t.explain && t.explain < t.points[0]);
  assert.ok(t.points.every((at, i) => i === 0 || at > t.points[i - 1]));
  assert.ok(t.verdict > t.points.at(-1)! && t.verdict < 30);
});

test("the tally counts chapters won and every pro and con per side; ties count for no one", () => {
  const tally = tallyOf([{ visual: camera }, { visual: { ...camera, verdict: "tie" } }, { visual: { ...camera, verdict: "a", pros: undefined, cons: { a: [], b: ["بطارية أقل"] } } }]);
  assert.deepEqual(tally, { wins: { a: 1, b: 1 }, pros: { a: 2, b: 4 }, cons: { a: 2, b: 1 } });
});

test("the writer's sections become scenes with only what each shows", () => {
  const empty = { a: [], b: [] };
  const scenes = prosConsScenes([
    { kind: "chapter", title: "", pose: "point", rows: [], explain: { term: "", meaning: "" }, pros: empty, cons: empty, verdict: "tie", buyers: { a: "", b: "" }, narration: " أغلى بـ $800 " },
    { kind: "chapter", title: "الكاميرا", pose: "think", rows: [{ label: "عدسات", a: "2", b: "3", winner: "b" }], explain: { term: "Telephoto", meaning: "بتقرب" }, pros: { a: [" "], b: ["زوم 5x"] }, cons: empty, verdict: "b", buyers: { a: "x", b: "y" }, narration: "n" },
    { kind: "verdict", title: "مين يشتري إيه؟", pose: "wave", rows: [], explain: { term: "", meaning: "" }, pros: empty, cons: empty, verdict: "tie", buyers: { a: "لو بتقرا كتير", b: "لو بتصور" }, narration: "n" },
  ]);
  assert.equal(scenes[0].visual.type === "versus" && scenes[0].visual.kind, "intro");
  assert.equal(scenes[0].narration, "أغلى بـ $800");
  const chapter = scenes[1].visual as Extract<Scene["visual"], { type: "versus" }>;
  assert.deepEqual([chapter.pros, chapter.cons, chapter.verdict, chapter.buyers], [{ a: [], b: ["زوم 5x"] }, undefined, "b", undefined]);
  assert.deepEqual((scenes[2].visual as typeof chapter).buyers, { a: "لو بتقرا كتير", b: "لو بتصور" });
});

test("the page draws every chapter, the ledger, the score and the verdict, for a long video and a Short", () => {
  const channel = loadChannels().find((c) => c.language === "ar") ?? loadChannels()[0];
  const audio = (seconds: number) => ({ path: "audio/x.mp3", text: "", voiceId: "v", seconds, words: [] });
  const scenes: Scene[] = [
    { id: "s001", narration: "أغلى بـ $800.. بس أحسن؟", visual: { type: "versus", title: "", rows: [], kind: "intro" }, imagePrompt: "", audio: audio(5) },
    { id: "s002", narration: "الكاميرا.", visual: camera, imagePrompt: "", audio: audio(20) },
    { id: "s003", narration: "مشاكل.", visual: { ...camera, title: "مشاكل محدش بيقولها", kind: "problems", pros: undefined }, imagePrompt: "", audio: audio(15) },
    { id: "s004", narration: "النتيجة.", visual: { type: "versus", title: "النتيجة", rows: [], kind: "score" }, imagePrompt: "", audio: audio(8) },
    { id: "s005", narration: "مين يشتري.", visual: { type: "versus", title: "مين يشتري إيه؟", rows: [], kind: "verdict", buyers: { a: "لو بتقرا", b: "لو بتصور" } }, imagePrompt: "", audio: audio(10) },
  ];
  for (const format of ["long", "short"] as const) {
    const project = { id: "p", channel: channel.id, format, style: "versus", topic: "iPhone Duo vs iPhone 18 Pro", title: "t", description: "", tags: [], scenes, createdAt: "", updatedAt: "",
      versus: { look: "proscons", hook: "أغلى بـ $800", a: { name: "iPhone Duo", short: "Duo", color: "#c9b8ff" }, b: { name: "iPhone 18 Pro", short: "18 Pro", color: "#ff9f43" } } } as Project;
    const html = buildProsCons(project, channel);
    for (const id of ['id="cc1"', 'id="cb1"', 'id="nt1"', 'id="pt1_0"', 'id="wn1"', 'class="card warn"', 'id="sc3"', 'id="bya4"', 'id="ledger"', 'id="sub"']) assert.ok(html.includes(id), `${format}: ${id}`);
    assert.ok(!html.includes("undefined"), `${format}: no undefined on the page`);
  }
});
