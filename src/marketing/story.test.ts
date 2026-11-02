import { test } from "node:test";
import assert from "node:assert/strict";

import { bestStory, draftMisses, hookScore, optionsProblems, sceneRange, storyNotes, storyProblems, type StoryBeat, type StoryOption } from "./story.ts";
import { missesDirection } from "./write.ts";

const beat = (job: StoryBeat["job"], scene: StoryBeat["beat"]): StoryBeat => ({ job, beat: scene, takeaway: "t", start: "a", change: "b", end: "c" });

const option = (beats: StoryBeat[], extra: Partial<StoryOption> = {}): StoryOption => ({
  shape: "mystery",
  idea: "فكرة",
  hook: "ليه عميلك بيسألك السعر كام وبيختفي؟",
  hooks: [],
  thread: "سؤال السعر",
  payoff: "الإجابة قبل ما يسأل",
  beats,
  ...extra,
});

const good = [beat("question", "kinetic"), beat("cause", "chaos"), beat("contrast", "split"), beat("reveal", "sting"), beat("invitation", "cta")];

test("a well-built 30s story has no problems", () => {
  assert.deepEqual(storyProblems(option(good), 30), []);
});

test("the story ends on the cta, and only there", () => {
  const early = [beat("question", "kinetic"), beat("invitation", "cta"), beat("contrast", "split"), beat("reveal", "sting"), beat("scale", "stat")];
  const problems = storyProblems(option(early), 30);
  assert.ok(problems.some((problem) => problem.includes("last beat must be the invitation")));
  assert.ok(problems.some((problem) => problem.includes("only the last beat")));
});

test("repeated jobs and repeated scenes are caught", () => {
  const same = [beat("question", "kinetic"), beat("cause", "chaos"), beat("cause", "pain"), beat("cause", "conflict"), beat("invitation", "cta")];
  assert.ok(storyProblems(option(same), 30).some((problem) => problem.includes("three beats in a row")));
  const twice = [beat("question", "kinetic"), beat("cause", "kinetic"), beat("contrast", "split"), beat("reveal", "sting"), beat("invitation", "cta")];
  assert.ok(storyProblems(option(twice), 30).some((problem) => problem.includes("same scene")));
});

test("the beat count follows the length", () => {
  assert.deepEqual(sceneRange(30), [4, 5]);
  assert.deepEqual(sceneRange(60), [6, 7]);
  assert.ok(storyProblems(option(good), 60).some((problem) => problem.includes("has 6-7")));
});

test("a shape used for the brand's last videos is refused, and the creativity level still applies", () => {
  assert.ok(storyProblems(option(good), 30, () => null, ["mystery"]).some((problem) => problem.includes("mystery")));
  const site = [beat("question", "pain"), beat("process", "booking"), beat("evidence", "page"), beat("scale", "dashboard"), beat("invitation", "cta")];
  assert.ok(storyProblems(option(site), 30, (beats) => missesDirection(beats, "bold")).some((problem) => problem.includes("bold")));
});

test("the two options must differ", () => {
  const other = [beat("contrast", "split"), ...good.slice(1)];
  assert.deepEqual(optionsProblems([option(good), option(other, { shape: "myth", hook: "آخر" })]), []);
  assert.equal(optionsProblems([option(good), option(good)]).length, 3);
});

test("a hook's score is dragged down by its weakest property and by length", () => {
  const strong = { specific: 8, curiosity: 8, stakes: 8, you: 8, quick: 8 };
  const oneDead = { ...strong, curiosity: 1 };
  assert.equal(hookScore(strong, "قصير"), 80);
  assert.ok(hookScore(oneDead, "قصير") < 60);
  assert.ok(hookScore(strong, Array(20).fill("كلمة").join(" ")) < 80);
  // The planner's hooks carry their text and formula next to the scores.
  assert.equal(hookScore({ ...strong, text: "قصير", formula: "the-question" } as never, "قصير"), 80);
});

test("the writer is told the hook, the thread and each beat in order", () => {
  const notes = storyNotes(option(good));
  assert.match(notes, /ليه عميلك بيسألك السعر كام وبيختفي؟/);
  assert.match(notes, /1\. \[question → kinetic\]/);
  assert.match(notes, /5\. \[invitation → cta\]/);
});

test("a draft that drops the hook or reorders the scenes is caught", () => {
  const story = option(good);
  const follows = good.map((b, i) => ({ beat: b.beat, narration: i ? "كلام" : "ليه عميلك بيسألك السعر كام وبيختفي؟ خلينا نشوف." }));
  assert.deepEqual(draftMisses(follows, story), []);
  const noHook = follows.map((scene, i) => (i ? scene : { ...scene, narration: "أهلا بيكم" }));
  assert.ok(draftMisses(noHook, story).some((problem) => problem.includes("hook")));
  const shuffled = follows.map((scene, i) => ({ ...scene, beat: ["stat", "notify", "orbit", "path", "cta"][i] }));
  assert.ok(draftMisses(shuffled, story).some((problem) => problem.includes("changed the planned beat")));
});

test("with nobody to pick, the option with the stronger hook is kept", () => {
  const weak = option(good, { shape: "myth", hooks: [{ text: "a", formula: "the-list", score: 55 }] });
  const strong = option(good, { shape: "stakes", hooks: [{ text: "b", formula: "the-question", score: 78 }] });
  assert.equal(bestStory([weak, strong]).shape, "stakes");
});
