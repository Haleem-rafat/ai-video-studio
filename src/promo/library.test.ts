import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

process.env.PROMO_MUSIC_DIR = await mkdtemp(join(tmpdir(), "music-"));
const { addTrack, deleteTrack, listTracks, renameTrack, trackSlug } = await import("./music.ts");

const run = promisify(execFile);
/** A real 8-second mp3, as a person would upload. */
async function song(): Promise<Uint8Array> {
  const out = join(await mkdtemp(join(tmpdir(), "song-")), "s.mp3");
  await run("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=8", "-q:a", "5", out]);
  return new Uint8Array(await readFile(out));
}

test("a track name becomes a safe file name", () => {
  assert.equal(trackSlug("My Song (final).MP3"), "my-song-final.mp3");
  assert.equal(trackSlug("../../.env"), "env.mp3");
  assert.equal(trackSlug("أغنية هادية"), "track.mp3");
  assert.equal(trackSlug(""), "track.mp3");
});

test("a song is added, listed with its length, renamed and deleted", async () => {
  const added = await addTrack("Morning Light.mp3", await song());
  assert.equal(added.file, "morning-light.mp3");
  assert.ok(Math.abs(added.seconds - 8) < 0.5);
  assert.deepEqual((await listTracks()).map((track) => track.file), ["morning-light.mp3"]);

  // The same name again gets a number instead of replacing it.
  assert.equal((await addTrack("morning light", await song())).file, "morning-light-2.mp3");

  assert.equal(await renameTrack("morning-light.mp3", "Sunrise"), "sunrise.mp3");
  await assert.rejects(() => renameTrack("sunrise.mp3", "morning-light-2"), /already/);
  await assert.rejects(() => renameTrack("nope.mp3", "x"), /No track/);

  await deleteTrack("sunrise.mp3");
  await assert.rejects(() => deleteTrack("../promo/store.ts"), /No track/);
  assert.deepEqual((await listTracks()).map((track) => track.file), ["morning-light-2.mp3"]);
});

test("a file that isn't audio is refused", async () => {
  await assert.rejects(() => addTrack("notes.mp3", new TextEncoder().encode("hello")), /not a sound file/);
  assert.equal((await listTracks()).some((track) => track.file === "notes.mp3"), false);
});
