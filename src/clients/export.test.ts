import { test } from "node:test";
import assert from "node:assert/strict";

import { exportIndex, postsToExport } from "./export.ts";

const posts = [
  { id: "2026-10-26-2-carousel", kind: "carousel", status: "done", createdAt: "2026-10-26T15:54:00Z", dialect: "egyptian", postAt: "2026-10-27T19:00", slides: [{}, {}, {}], caption: "نفس الخبرة، بس واحد بيتحجز\nوالتاني لأ", ideaId: "2026-10-26-2" },
  { id: "2026-10-26-1-reel", kind: "reel", status: "done", createdAt: "2026-10-26T15:47:00Z", caption: "x" },
  { id: "2026-10-26-9-carousel", kind: "carousel", status: "failed", createdAt: "2026-10-26T16:00:00Z", caption: "" },
] as never[];

test("only finished posts of the kind asked for are exported, oldest first", () => {
  assert.deepEqual(postsToExport(posts, "carousel").map((p) => p.id), ["2026-10-26-2-carousel"]);
  assert.deepEqual(postsToExport(posts, "all").map((p) => p.id), ["2026-10-26-1-reel", "2026-10-26-2-carousel"]);
});

test("the index lists each post with its folder, title, dialect, slides and when to post; Excel reads its Arabic", () => {
  const csv = exportIndex(postsToExport(posts, "carousel"), { "2026-10-26-2": "نفس الخبرة.. بس واحد بيتحجز" });
  assert.ok(csv.startsWith("﻿"), "a byte-order mark, so Excel opens it as UTF-8");
  const [head, row] = csv.slice(1).trim().split("\r\n");
  assert.equal(head, "folder,kind,made,post at,dialect,slides,title,caption");
  assert.equal(row, '2026-10-26-2-carousel,carousel,2026-10-26,2026-10-27 19:00,Egyptian,3,نفس الخبرة.. بس واحد بيتحجز,"نفس الخبرة، بس واحد بيتحجز\nوالتاني لأ"');
});
