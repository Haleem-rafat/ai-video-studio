import { test } from "node:test";
import assert from "node:assert/strict";

import { MARKETING_BEATS } from "../types.ts";
import { autoReelStyle, REEL_STYLE_IDS, REEL_STYLES, reelStyleNotes, reelStyleProblems } from "./reel-styles.ts";

test("ten reel styles, Classic first; every style is built from scene types the renderer draws", () => {
  assert.equal(REEL_STYLE_IDS.length, 10);
  assert.equal(REEL_STYLE_IDS[0], "classic");
  for (const id of REEL_STYLE_IDS) {
    const style = REEL_STYLES[id];
    assert.ok(style.label.en && style.label.ar && style.description.en && style.description.ar, id);
    for (const beat of [...style.beats, ...style.key, ...(style.opening ?? [])]) assert.ok((MARKETING_BEATS as readonly string[]).includes(beat), `${id}: ${beat}`);
    if (id !== "classic") assert.ok(style.direction.length > 60 && style.key.length, id);
  }
});

test("Classic adds nothing to the writer's notes; other styles add their direction and scene types", () => {
  assert.equal(reelStyleNotes("classic"), "");
  assert.equal(reelStyleNotes(undefined), "");
  const notes = reelStyleNotes("objection");
  assert.match(notes, /REEL STYLE: Objection → answer/);
  assert.ok(notes.includes(REEL_STYLES.objection.direction));
  assert.match(notes, /pain/);
});

test("a draft that doesn't use its style's key scenes is sent back; one that does passes", () => {
  assert.match(reelStyleProblems(["kinetic", "turn", "cta"], "tour").join(" "), /Website tour/);
  assert.deepEqual(reelStyleProblems(["kinetic", "page", "booking", "dashboard", "cta"], "tour"), []);
  assert.deepEqual(reelStyleProblems(["kinetic", "turn", "cta"], "classic"), []);
});

test("Auto never repeats the style of either of the last two reels, and prefers one not used lately", () => {
  const history = (styles: string[]) => styles.map((reelStyle) => ({ kind: "reel", reelStyle }));
  const first = autoReelStyle(history([]));
  assert.notEqual(first, "classic");
  const picked = autoReelStyle(history(["kinetic", "tour"]));
  assert.ok(!["kinetic", "tour", "classic"].includes(picked), picked);
  const all = REEL_STYLE_IDS.filter((id) => id !== "classic" && id !== "myth");
  assert.equal(autoReelStyle(history(all)), "myth");
  // Carousels don't count.
  assert.equal(autoReelStyle([{ kind: "carousel", reelStyle: first }]), first);
});
