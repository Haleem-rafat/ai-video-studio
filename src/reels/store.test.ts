import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Channel } from "../config.ts";

process.env.REELS_DIR = await mkdtemp(join(tmpdir(), "reels-"));
const { checkReel, linesKey, listReels, loadReel, newReel, reelIdFor, saveReel, styleJob, voiceIsCurrent } = await import("./store.ts");

const channel = { id: "haleemrafat", name: "Haleem Rafat - حليم رأفت", brand: { handle: "@haleemrafat" }, colors: { background: "#000000", panel: "#111111", text: "#ffffff", accent: "#ff0000", muted: "#888888" }, font: "Cairo" } as Channel;

test("a reel id carries the time and the topic", () => {
  assert.equal(reelIdFor("Apple's new MacBook Pro with M6!", new Date(2026, 9, 27, 19, 5)), "202610271905-apple-s-new-macbook-pro-with-m6");
  assert.equal(reelIdFor("ماك بوك", new Date(2026, 9, 27, 19, 5)), "202610271905-reel");
});

test("reels are saved, loaded and listed; two of one topic never collide", async () => {
  const a = await newReel("haleemrafat", "rpg", "MacBook Pro M6");
  const b = await newReel("haleemrafat", "news", "MacBook Pro M6");
  assert.notEqual(a.id, b.id);
  assert.equal((await loadReel(a.id)).status, "writing");
  assert.deepEqual((await listReels()).map((reel) => reel.id).sort(), [a.id, b.id].sort());
  await assert.rejects(loadReel("../etc"), /No reel/);
});

test("the voice is out of date once a line changes", async () => {
  const reel = await saveReel({ ...(await newReel("haleemrafat", "rpg", "voice")), lines: ["one", "two"] });
  assert.equal(voiceIsCurrent(reel), false);
  assert.equal(linesKey(["one", "two"]), linesKey(["one", "two"]));
  assert.notEqual(linesKey(["one", "two"]), linesKey(["one", "two!"]));
});

test("an RPG job has a sub for every line, and drops quests that don't exist", async () => {
  const reel = {
    ...(await newReel("haleemrafat", "rpg", "rpg job")),
    lines: ["a", "b", "c"],
    rpg: { level: 1, character: { preset: "girl" as const, name: "@haleemrafat" }, quests: [{ text: "Q1", xp: 50 }], subs: [{ line: 1, expression: "smile" as const, key: "b", questIndex: 0 }, { line: 2, expression: "talk" as const, key: "", questIndex: 4 }] },
  };
  const job = styleJob(reel, channel) as { channel: string; subs: { line: number; expression: string; questIndex?: number }[] };
  assert.equal(job.channel, "HALEEM RAFAT");
  assert.deepEqual(job.subs.map((sub) => sub.line), [0, 1, 2]);
  assert.equal(job.subs[0].expression, "talk");
  assert.equal(job.subs[1].questIndex, 0);
  assert.equal(job.subs[2].questIndex, undefined);
});

test("news scenes keep their lines inside the reel, and must move forward", async () => {
  const base = await newReel("haleemrafat", "news", "news job");
  const scene = (lines: [number, number], media = "media/a.jpg") => ({ lines, media, headline: "h", highlight: "x", stats: [] });
  const reel = { ...base, lines: ["a", "b", "c"], news: { company: { name: "Apple" }, credit: "", source: "", date: "", scenes: [scene([0, 1]), scene([2, 9])] } };
  const job = styleJob(reel, channel) as { handle: string; initial: string; company: unknown; scenes: { lines: number[] }[] };
  assert.equal(job.handle, "@haleemrafat");
  assert.equal(job.initial, "H");
  assert.deepEqual(job.company, { name: "Apple" });
  assert.deepEqual(job.scenes[1].lines, [2, 2]);
  assert.equal(checkReel(reel), null);
  assert.match(checkReel({ ...reel, news: { ...reel.news, scenes: [scene([1, 1]), scene([0, 2])] } }) ?? "", /later line/);
  assert.match(checkReel({ ...reel, news: { ...reel.news, scenes: [scene([0, 2], "")] } }) ?? "", /picture/);
});

const branded = { ...channel, colors: { background: "#0f0f10", panel: "#1c1c1e", text: "#ffffff", accent: "#ff3b30", muted: "#8e8e93" }, font: "'SF Arabic'" } as Channel;

test("a news job carries the channel's colours, with the reel's own accent over them", async () => {
  const base = await newReel("haleemrafat", "news", "brand");
  const reel = { ...base, lines: ["a"], news: { company: { name: "Apple" }, credit: "", source: "", date: "", scenes: [{ lines: [0, 0] as [number, number], media: "media/a.jpg", headline: "", highlight: "", stats: [] }] } };
  assert.deepEqual((styleJob(reel, branded) as { brand: unknown }).brand, { ...branded.colors, font: "'SF Arabic'" });
  const own = styleJob({ ...reel, options: { accent: "#00aa55", music: false } }, branded) as { brand: { accent: string }; music?: string };
  assert.equal(own.brand.accent, "#00aa55");
  assert.equal(own.music, undefined);
});

test("a proof job gives every line a pose, and needs pictures and the character", async () => {
  const base = await newReel("haleemrafat", "proof", "proof job");
  const avatar = { point: "media/avatar-point.png", think: "media/avatar-think.png", wave: "media/avatar-wave.png" };
  const reel = { ...base, lines: ["a", "b", "c"], proof: { hook: { title: "Run AI", highlight: "Free" }, keyword: "AI", avatar, scenes: [{ lines: [0, 1] as [number, number], media: "media/shot-1.png", url: "github.com/x" }], subs: [{ line: 2, pose: "wave" as const, keys: ["c"] }] } };
  const job = styleJob(reel, branded) as { accent: string; subs: { pose: string }[]; keyword: string };
  assert.equal(job.accent, "#ff3b30");
  assert.equal(job.keyword, "AI");
  assert.deepEqual(job.subs.map((sub) => sub.pose), ["point", "think", "wave"]);
  assert.equal(checkReel(reel), null);
  assert.match(checkReel({ ...reel, proof: { ...reel.proof, avatar: { ...avatar, point: "" } } }) ?? "", /character/);
});

test("a motion job uses the channel accent unless Figma blue is on, and its picture scenes need a picture", async () => {
  const base = await newReel("haleemrafat", "kinetic", "motion job");
  const reel = { ...base, lines: ["a", "b"], kinetic: { keyword: "AI", scenes: [{ lines: [0, 0] as [number, number], kind: "hook" as const }, { lines: [1, 1] as [number, number], kind: "browser" as const, media: "media/shot-1.png" }], subs: [{ line: 1, key: "b" }] } };
  assert.equal((styleJob(reel, branded) as { accent: string }).accent, "#ff3b30");
  assert.equal((styleJob({ ...reel, options: { figmaBlue: true } }, branded) as { accent: string }).accent, "#3b82f6");
  assert.equal(checkReel(reel), null);
  assert.match(checkReel({ ...reel, kinetic: { ...reel.kinetic, scenes: [reel.kinetic.scenes[0], { lines: [1, 1], kind: "phone" }] } }) ?? "", /needs a picture/);
  assert.match(checkReel({ ...reel, lines: ["a", " "] }) ?? "", /Line 2 is empty/);
});

test("moving, inserting and removing lines keeps every reference on its text", async () => {
  const { insertLine, moveLine, removeLine } = await import("./lines.ts");
  const base = await newReel("haleemrafat", "rpg", "lines");
  const reel = {
    ...base,
    lines: ["a", "b", "c"],
    rpg: { level: 1, character: { preset: "girl" as const, name: "" }, quests: [{ text: "Q", xp: 50 }], subs: [{ line: 0, expression: "smile" as const, key: "a" }, { line: 2, expression: "wink" as const, key: "c", questIndex: 0 }] },
  };
  const moved = moveLine(reel, 2, 0);
  assert.deepEqual(moved.lines, ["c", "a", "b"]);
  assert.deepEqual(moved.rpg!.subs.map((sub) => [sub.line, sub.key]), [[0, "c"], [1, "a"]]);
  const inserted = insertLine(reel, 0, "new");
  assert.deepEqual(inserted.lines, ["a", "new", "b", "c"]);
  assert.deepEqual(inserted.rpg!.subs.map((sub) => sub.line), [0, 3]);
  const removed = removeLine(reel, 0);
  assert.deepEqual(removed.lines, ["b", "c"]);
  assert.deepEqual(removed.rpg!.subs.map((sub) => [sub.line, sub.key]), [[1, "c"]]);

  const news = { ...base, style: "news" as const, lines: ["a", "b", "c"], news: { company: { name: "" }, credit: "", source: "", date: "", scenes: [{ lines: [0, 0] as [number, number], media: "m", headline: "", highlight: "", stats: [] }, { lines: [1, 2] as [number, number], media: "m", headline: "", highlight: "", stats: [] }] } };
  assert.deepEqual(insertLine(news, 1).news!.scenes.map((scene) => scene.lines), [[0, 0], [1, 3]]);
  assert.deepEqual(removeLine(news, 1).news!.scenes.map((scene) => scene.lines), [[0, 0], [1, 1]]);
});

test("the voice speed is part of the voice's fingerprint", () => {
  assert.equal(linesKey(["a"]), linesKey(["a"], 1));
  assert.notEqual(linesKey(["a"]), linesKey(["a"], 1.1));
});

test("point and chat scenes are drawn only by the newer looks, which get their own beat, louder effects and second colour", async () => {
  const story = {
    headline: { text: "٣ غلطات", highlight: "غلطات" },
    scenes: [{ lines: [0, 0] as [number, number], kind: "hook" as const }, { lines: [1, 1] as [number, number], kind: "point" as const, point: { mark: "٣", text: "السعر بس" } }, { lines: [2, 2] as [number, number], kind: "follow" as const }],
    subs: [],
  };
  const diagram = { ...(await newReel("haleemrafat", "diagram", "looks")), lines: ["a", "b", "c"], story };
  assert.match(checkReel(diagram) ?? "", /aurora, variety, flat and sketch/);
  const branded = { ...channel, colors: { ...channel.colors, cta: "#ff7a59" } } as Channel;
  const aurora = { ...diagram, style: "aurora" as const };
  assert.equal(checkReel(aurora), null);
  const job = styleJob(aurora, branded);
  assert.equal(job.music, "beat");
  assert.equal(job.fxGain, 1.2);
  assert.equal(job.accent2, "#ff7a59");
  assert.equal(styleJob({ ...diagram, style: "variety" as const }, branded).bpm, 128);
  assert.equal(styleJob({ ...aurora, options: { music: false } }, branded).music, undefined);
});
