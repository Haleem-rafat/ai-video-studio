import { test } from "node:test";
import assert from "node:assert/strict";

import { pickMusic, type Track } from "./music.ts";

const tracks: Track[] = [
  { file: "lofi-1.mp3", seconds: 30 },
  { file: "calm-piano.mp3", seconds: 130 },
  { file: "upbeat.mp3", seconds: 130 },
  { file: "cinematic.mp3", seconds: 130 },
];

test("a promo gets a track long enough to play once, never looped", () => {
  assert.notEqual(pickMusic(tracks, 78, []), "lofi-1.mp3");
  assert.ok(["calm-piano.mp3", "upbeat.mp3", "cinematic.mp3"].includes(pickMusic(tracks, 78, [])));
});

test("each new promo gets a different track from the last ones made", () => {
  assert.equal(pickMusic(tracks, 78, ["calm-piano.mp3", "upbeat.mp3"]), "cinematic.mp3");
  // All long tracks used: the one used longest ago comes back first.
  assert.equal(pickMusic(tracks, 78, ["cinematic.mp3", "upbeat.mp3", "calm-piano.mp3"]), "calm-piano.mp3");
});

test("a short promo can use a short track too", () => {
  assert.equal(pickMusic(tracks, 20, ["calm-piano.mp3", "upbeat.mp3", "cinematic.mp3"]), "lofi-1.mp3");
});

test("when no track is long enough, the longest is used", () => {
  assert.equal(pickMusic([{ file: "a.mp3", seconds: 30 }, { file: "b.mp3", seconds: 60 }], 90, []), "b.mp3");
});

test("a track chosen by hand wins, if it exists", () => {
  assert.equal(pickMusic(tracks, 78, [], "lofi-1.mp3"), "lofi-1.mp3");
  assert.notEqual(pickMusic(tracks, 78, [], "gone.mp3"), "gone.mp3");
});
