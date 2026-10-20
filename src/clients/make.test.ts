import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Client, Idea } from "./types.ts";

process.env.CLIENTS_DIR = mkdtempSync(join(tmpdir(), "clients-"));
const { reelBrief, reelScript } = await import("./reel.ts");
const { claimIdea, postIdFor } = await import("./make.ts");
const store = await import("./store.ts");

const client = {
  id: "risero",
  name: "Risero",
  language: "ar",
  brief: {
    business: "b", audience: "a", problems: ["p"], result: "r", features: ["f"], proof: "", data: "example",
    cta: { label: "احجز", url: "https://x" }, tone: "t", voice: "male", seconds: 45, platforms: ["TikTok"], captions: false, notes: "old notes",
  },
  avoid: "لا أسعار",
} as unknown as Client;
const idea: Idea = { id: "2026-10-20-1", format: "reel", goal: "details", angle: "how-to", hook: "إزاي العميل يحجز لوحده", outline: ["العميل يفتح الصفحة", "يختار ميعاد", "يوصله تأكيد"], why: "", status: "new" };

test("a reel's brief is the client's, sized for Instagram Reels, with the idea in the notes", () => {
  const brief = reelBrief(client, idea);
  assert.equal(brief.seconds, 45);
  assert.deepEqual(brief.platforms, ["Instagram Reels"]);
  assert.match(brief.notes, /details/);
  assert.match(brief.notes, /إزاي العميل يحجز لوحده/);
  assert.match(brief.notes, /لا أسعار/);
  assert.equal(brief.cta.url, "https://x");
});

test("a reel's script opens on the hook and lists the outline", () => {
  const script = reelScript(idea);
  assert.ok(script.startsWith("Hook (first 2 seconds): إزاي العميل يحجز لوحده"));
  assert.match(script, /2\. يختار ميعاد/);
});

test("post ids are the idea id and its format, so one idea has one post folder", () => {
  assert.equal(postIdFor(idea), "2026-10-20-1-reel");
});

test("an idea can be claimed once: a second make is refused", async () => {
  await store.saveIdeas("risero", { date: "2026-10-20", trends: [], ideas: [{ ...idea }] });
  const claimed = await claimIdea("risero", "2026-10-20", idea.id);
  assert.equal(claimed.status, "making");
  await assert.rejects(claimIdea("risero", "2026-10-20", idea.id), /already being made/);
});
