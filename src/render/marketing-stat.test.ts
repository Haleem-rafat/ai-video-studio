import { test } from "node:test";
import assert from "node:assert/strict";

import { statCount } from "./marketing-motion.ts";

test("a stat counts up to its one number, and shows a range as written", () => {
  assert.equal(statCount("15"), 15);
  assert.equal(statCount("1,200"), 1200);
  assert.equal(statCount("2.5"), 2.5);
  // «من 10 لـ 15 دقيقة» became 1015 when every digit was kept.
  assert.equal(statCount("10-15"), 0);
  assert.equal(statCount("10 لـ 15"), 0);
  assert.equal(statCount("Wi-Fi"), 0);
});
