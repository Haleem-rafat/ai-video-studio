import { test } from "node:test";
import assert from "node:assert/strict";

import { FORMAT_IDS, FORMATS, formatForIdea, formatProblems } from "./formats.ts";
import { IDEA_ANGLES, type Slide } from "./types.ts";

test("sixteen post formats, each with names in both languages, a structure for the writer and the layouts it uses", () => {
  assert.equal(FORMAT_IDS.length, 16);
  for (const id of FORMAT_IDS) {
    const format = FORMATS[id];
    assert.equal(format.id, id);
    assert.ok(format.label.en && format.label.ar && format.description.en && format.description.ar, id);
    assert.ok(format.structure.length > 60, `${id} needs a real structure`);
    assert.ok(format.layouts.includes("cover") && format.layouts.includes("cta"), `${id} opens on a cover and closes on a cta`);
    assert.ok(format.key, `${id} has the layout that makes it this format`);
    assert.ok(format.layouts.includes(format.key), id);
  }
});

test("Auto follows the idea's angle; an angle with no format of its own leaves the writer free", () => {
  assert.equal(formatForIdea({ angle: "myth" }), "myth");
  assert.equal(formatForIdea({ angle: "how-to" }), "steps");
  assert.equal(formatForIdea({ angle: "question" }), "faq");
  assert.equal(formatForIdea({ angle: "trend" }), undefined);
  assert.equal(formatForIdea({ angle: "announcement" }), "announcement");
  assert.equal(formatForIdea({ angle: "behind" }), "milestone");
  for (const angle of IDEA_ANGLES) formatForIdea({ angle });
});

test("a carousel missing its format's key layout is sent back to the writer", () => {
  const cover: Slide = { layout: "cover", title: "X vs Y" };
  const cta: Slide = { layout: "cta", title: "Book", button: "Book", url: "https://x" };
  const versus: Slide = { layout: "versus", left: { label: "DMs", points: ["Slow"] }, right: { label: "Booking page", points: ["Instant"] } };
  assert.match(formatProblems([cover, cta], "versus").join(" "), /versus/);
  assert.deepEqual(formatProblems([cover, versus, cta], "versus"), []);
  assert.deepEqual(formatProblems([cover, cta], undefined), []);
});

test("the comment-to-get format never lets the post promise a file the client doesn't have", () => {
  assert.match(FORMATS.comment.structure, /never promise/i);
});

test("the ideas writer is told the last carousels' formats, newest first", async () => {
  const { recentFormats } = await import("./ideas.ts");
  const made = [
    { id: "1", kind: "carousel" as const, title: "", lines: [], format: "list", createdAt: "" },
    { id: "2", kind: "reel" as const, title: "", lines: [], createdAt: "" },
    { id: "3", kind: "carousel" as const, title: "", lines: [], format: "faq", createdAt: "" },
  ];
  assert.match(recentFormats(made), /list, faq/);
  assert.equal(recentFormats([]), "");
});

test("announcements and milestones only use what the client really has: no invented offers, dates or results", () => {
  assert.match(FORMATS.announcement.structure, /never invent/i);
  assert.match(FORMATS.milestone.structure, /only real/i);
});
