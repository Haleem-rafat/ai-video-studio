import { test } from "node:test";
import assert from "node:assert/strict";

import { MOOD_PROMPTS, MOODS, pickMusic, trackFileFor, type Track } from "./music.ts";

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

test("every mood has a prompt for an instrumental track without vocals", () => {
  for (const mood of MOODS) {
    assert.ok(MOOD_PROMPTS[mood].length > 60, mood);
    assert.match(MOOD_PROMPTS[mood], /instrumental/i);
  }
});

test("a new track gets a file name of its mood and a number that isn't taken", () => {
  assert.equal(trackFileFor("calm", ["calm-piano.mp3", "lofi-1.mp3"]), "ai-calm-1.mp3");
  assert.equal(trackFileFor("calm", ["ai-calm-1.mp3", "ai-calm-2.mp3"]), "ai-calm-3.mp3");
});
