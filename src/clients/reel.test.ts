import { test } from "node:test";
import assert from "node:assert/strict";

import { voiceDirection } from "./reel.ts";

const brief = { tone: "دافئ ورومانسي وأنيق", audience: "العرسان والعرائس في مصر", voice: "female" as const };

test("a client's voice is told its own tone and audience, in Egyptian only", () => {
  const style = voiceDirection(brief, "egyptian");
  assert.match(style, /دافئ ورومانسي وأنيق/);
  assert.match(style, /العرسان والعرائس/);
  assert.match(style, /المصرية/);
  assert.match(style, /مش فصحى ولا خليجي/);
  // A woman's voice is spoken to as one.
  assert.match(style, /اتكلمي/);
  assert.doesNotMatch(style, /صاحب بيزنس/);
});

test("a male voice is spoken to as a man, and a Gulf reel stays Gulf", () => {
  assert.match(voiceDirection({ ...brief, voice: "male" as const }, "egyptian"), /اتكلم /);
  assert.match(voiceDirection(brief, "gulf"), /الخليجية/);
});
