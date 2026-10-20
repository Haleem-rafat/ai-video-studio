import { test } from "node:test";
import assert from "node:assert/strict";

import { buildLibrary, hostOf, ideasCostByDate } from "./library.ts";
import type { UsageEntry } from "../usage.ts";
import type { Project } from "../types.ts";
import type { Client, Post } from "./types.ts";

const entry = (job: string, at: string, cost: number) => ({ job, at, cost, step: "x", kind: "text", model: "m" }) as UsageEntry;

test("hostOf ignores www, case and paths, and gives '' for anything unparsable", () => {
  assert.equal(hostOf("https://www.Risero.io/x"), "risero.io");
  assert.equal(hostOf("diaaeziada.risero.io"), "diaaeziada.risero.io");
  assert.equal(hostOf("not a url"), "");
  assert.equal(hostOf(""), "");
});

test("ideas costs are grouped by local day; other jobs are left out", () => {
  const byDate = ideasCostByDate([
    entry("Ideas: Risero", new Date(2026, 9, 20, 9).toISOString(), 0.03),
    entry("Ideas: Risero", new Date(2026, 9, 20, 15).toISOString(), 0.02),
    entry("Ideas: Risero", new Date(2026, 9, 21, 9).toISOString(), 0.04),
    entry("New client from a marketing project", new Date(2026, 9, 20, 9).toISOString(), 0.01),
  ]);
  assert.deepEqual(Object.keys(byDate), ["2026-10-20", "2026-10-21"]);
  assert.ok(Math.abs(byDate["2026-10-20"] - 0.05) < 1e-9);
});

const client = { id: "risero", name: "Risero", url: "https://diaaeziada.risero.io/" } as Client;
const now = new Date(2026, 9, 20, 18);
const post = (id: string, kind: Post["kind"], createdAt: string, projectId?: string) =>
  ({ id, clientId: "risero", kind, caption: "c", hashtags: [], status: "done", createdAt, updatedAt: createdAt, ...(projectId ? { projectId } : {}), ...(kind !== "reel" ? { slides: [{ layout: "cover", title: `T ${id}` }] } : {}) }) as Post;
const project = (id: string, url: string, createdAt: string, rendered = true) =>
  ({ id, title: `Video ${id}`, format: "short", createdAt, updatedAt: createdAt, marketing: { brand: { url } }, ...(rendered ? { render: { path: "video.mp4", seconds: 40, renderedAt: createdAt } } : {}) }) as unknown as Project;

test("the library holds the client's posts, its reels and its earlier marketing videos, each with its cost", () => {
  const library = buildLibrary({
    client,
    posts: [post("c1", "carousel", "2026-10-20T10:00:00Z"), post("r1", "reel", "2026-10-20T11:00:00Z", "P1")],
    postCosts: { c1: 0.17 },
    projects: [project("P1", "https://diaaeziada.risero.io/", "2026-10-20T11:00:00Z"), project("P2", "https://www.diaaeziada.risero.io", "2026-09-18T10:00:00Z"), project("P3", "https://other.com", "2026-10-19T10:00:00Z")],
    projectCosts: { P1: 0.9, P2: 1.6, P3: 5 },
    clientEntries: [entry("Ideas: Risero", "2026-10-20T08:30:00Z", 0.05), entry("New client from a marketing project", "2026-10-20T08:00:00Z", 0.01)],
    now,
  });
  assert.deepEqual(library.items.map((i) => [i.id, i.kind, i.cost]), [
    ["r1", "reel", 0.9],
    ["c1", "carousel", 0.17],
    ["P2", "video", 1.6],
  ]);
  assert.equal(library.items[1].cover, "posts/c1/slides/01.png");
  assert.equal(library.items[0].projectId, "P1");
  const t = library.totals;
  assert.ok(Math.abs(t.posts - 0.17) < 1e-9);
  assert.ok(Math.abs(t.videos - 2.5) < 1e-9);
  assert.ok(Math.abs(t.ideas - 0.05) < 1e-9);
  assert.ok(Math.abs(t.all - (0.17 + 2.5 + 0.05 + 0.01)) < 1e-9);
  // P2 was made in September: not this month.
  assert.ok(Math.abs(t.month - (0.17 + 0.9 + 0.05 + 0.01)) < 1e-9);
});

test("a client matching no projects, and posts without a cost file, still add up", () => {
  const library = buildLibrary({ client, posts: [post("c1", "single", "2026-10-20T10:00:00Z")], postCosts: {}, projects: [], projectCosts: {}, clientEntries: [], now });
  assert.deepEqual(library.items.map((i) => [i.kind, i.cost]), [["single", 0]]);
  assert.equal(library.totals.all, 0);
});

test("website promos of the client's site join its library at no cost; other sites' promos and unfinished ones don't", () => {
  const promo = (id: string, url: string, status: "making" | "done" | "failed", createdAt: string) => ({ id, url, host: hostOf(url), title: `Promo ${id}`, createdAt, status });
  const library = buildLibrary({
    client,
    posts: [post("c1", "carousel", "2026-10-20T10:00:00Z")],
    postCosts: { c1: 0.17 },
    projects: [],
    projectCosts: {},
    clientEntries: [],
    promos: [
      promo("p1", "https://diaaeziada.risero.io/", "done", "2026-10-20T12:00:00Z"),
      promo("p2", "https://other.risero.io/", "done", "2026-10-20T12:00:00Z"),
      promo("p3", "https://www.diaaeziada.risero.io/", "failed", "2026-10-20T13:00:00Z"),
    ],
    now,
  });
  assert.deepEqual(
    library.items.map((item) => [item.kind, item.id, item.cost]),
    [
      ["promo", "p1", 0],
      ["carousel", "c1", 0.17],
    ],
  );
  assert.equal(library.items[0].promoId, "p1");
  assert.ok(Math.abs(library.totals.all - 0.17) < 1e-9);
});
