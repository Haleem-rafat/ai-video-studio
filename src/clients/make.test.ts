import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Client, Idea } from "./types.ts";

process.env.CLIENTS_DIR = mkdtempSync(join(tmpdir(), "clients-"));
const { reelBrief, reelNotes, reelScript } = await import("./reel.ts");
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

test("after a restart, ideas left 'making' can be made again and their unfinished posts are marked failed", async () => {
  const { recoverInterrupted } = await import("./make.ts");
  const stuck: Idea = { ...idea, id: "2026-10-21-1", status: "making" };
  await store.saveIdeas("restart", { date: "2026-10-21", trends: [], ideas: [stuck] });
  await store.savePost({ id: "2026-10-21-1-reel", clientId: "restart", ideaId: stuck.id, kind: "reel", caption: "", hashtags: [], status: "rendering", createdAt: "x", updatedAt: "x" });
  assert.equal(await recoverInterrupted("restart"), 1);
  assert.equal((await store.loadIdeas("restart", "2026-10-21"))!.ideas[0].status, "new");
  assert.equal((await store.loadPost("restart", "2026-10-21-1-reel")).status, "failed");
});

test("a reel's writer gets the client's Prompted mode answers and restrictions", () => {
  const entry = (value: string | string[]) => ({ value, source: "app" as const, updatedAt: "" });
  const answered = { ...client, profile: { version: 1, updatedAt: "", answers: { "creative.video": entry(["voice", "screens"]), "rules.never": entry("لا أسعار") } } } as Client;
  const notes = reelNotes(answered, idea);
  assert.match(notes, /Voice-over, Real website screens/);
  assert.match(notes, /ALWAYS FOLLOW[\s\S]*لا أسعار/);
  assert.match(notes, /Hook → Problem or opportunity/);
  // Without answers the notes are what they were.
  assert.doesNotMatch(reelNotes(client, idea), /<client>/);
});

test("changing a carousel's design redraws its slides in the new look, with no AI and nothing else changed", async () => {
  const { rerenderPost } = await import("./make.ts");
  const { readFile } = await import("node:fs/promises");
  const brand = { url: "https://x", name: "Risero", colors: { background: "#14112b", panel: "#221d45", text: "#f4f1ff", accent: "#a78bfa", cta: "#ff8a65", muted: "#b9b3d9" }, fonts: { heading: "Helvetica", body: "Helvetica" }, googleFonts: [] };
  await store.saveClient({ ...client, id: "design-test", brand } as unknown as Client);
  const post = { id: "2026-10-22-1-carousel", clientId: "design-test", kind: "carousel" as const, caption: "Caption", hashtags: ["a"], slides: [{ layout: "cover" as const, title: "Five mistakes" }, { layout: "list" as const, title: "Steps", items: ["One", "Two"] }], status: "done" as const, createdAt: "", updatedAt: "" };
  await store.savePost(post);
  const before = await rerenderPost("design-test", post.id, { slides: post.slides }, () => {});
  assert.equal(before.design, undefined);
  const first = await readFile(join(store.postDir("design-test", post.id), "slides", "01.png"));
  const after = await rerenderPost("design-test", post.id, { design: "neon" }, () => {});
  assert.equal(after.design, "neon");
  assert.equal(after.caption, "Caption");
  assert.deepEqual(after.slides, post.slides);
  const second = await readFile(join(store.postDir("design-test", post.id), "slides", "01.png"));
  assert.notDeepEqual(first, second, "the slide looks different");
  assert.equal((await store.loadPost("design-test", post.id)).design, "neon");
});

test("a reel style's direction reaches the reel's writer; Classic or none adds nothing", () => {
  assert.match(reelNotes(client, idea, [], "dm"), /REEL STYLE: DM \/ notification story/);
  assert.doesNotMatch(reelNotes(client, idea, [], "classic"), /REEL STYLE/);
  assert.doesNotMatch(reelNotes(client, idea), /REEL STYLE/);
});
