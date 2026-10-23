import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.CLIENTS_DIR = mkdtempSync(join(tmpdir(), "clients-"));
const store = await import("./store.ts");
type Idea = import("./types.ts").Idea;

const project = {
  id: "202610182235-marketing-short-risero-v2",
  marketing: {
    brand: { url: "https://diaaeziada.risero.io/", name: "Risero", language: "ar", logo: "shots/logo.png" },
    brief: { business: "Risero: صفحة شخصية", notes: "أرقام الداشبورد أمثلة", cta: { label: "احجز", url: "https://x" } },
  },
} as never;

test("clientFromProject copies brand and brief, and starts avoid from the notes", () => {
  const client = store.clientFromProject(project, "2026-10-20T08:00:00.000Z");
  assert.equal(client.id, "risero");
  assert.equal(client.name, "Risero");
  assert.equal(client.language, "ar");
  assert.equal(client.brand.logo, "shots/logo.png");
  assert.equal(client.avoid, "أرقام الداشبورد أمثلة");
  assert.equal(client.dailyIdeas, true);
});

test("a client round-trips through its folder", async () => {
  const client = store.clientFromProject(project, "2026-10-20T08:00:00.000Z");
  await store.saveClient(client);
  assert.equal((await store.loadClient("risero")).name, "Risero");
  assert.deepEqual((await store.listClients()).map((c) => c.id), ["risero"]);
});

test("ideas: a missing day is null, and recentIdeas reads the last days only", async () => {
  assert.equal(await store.loadIdeas("risero", "2026-10-20"), null);
  const idea = (id: string, hook: string): Idea => ({ id, format: "carousel", goal: "awareness", angle: "list", hook, outline: [], why: "", status: "new" });
  await store.saveIdeas("risero", { date: "2026-10-01", trends: [], ideas: [idea("2026-10-01-1", "old")] });
  await store.saveIdeas("risero", { date: "2026-10-15", trends: [], ideas: [idea("2026-10-15-1", "recent")] });
  const recent = await store.recentIdeas("risero", "2026-10-20", 14);
  assert.deepEqual(recent.map((i) => i.hook), ["recent"]);
});

test("localDate uses the local calendar day", () => {
  assert.equal(store.localDate(new Date(2026, 9, 20, 23, 30)), "2026-10-20");
});

test("bad ids are refused", () => {
  assert.throws(() => store.clientDir("../etc"));
});

test("two videos made in the same minute with the same Latin words get different folders", async () => {
  const { mkdirSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { OUTPUT_DIR } = await import("../config.ts");
  const { newProjectId } = await import("../project.ts");
  const first = newProjectId("test-channel", "short", "Phone A vs Phone B: السعر");
  mkdirSync(join(OUTPUT_DIR, first), { recursive: true });
  try {
    const second = newProjectId("test-channel", "short", "Phone A vs Phone B: الكاميرا");
    assert.notEqual(second, first);
    assert.equal(second, `${first}-2`);
  } finally {
    (await import("node:fs")).rmSync(join(OUTPUT_DIR, first), { recursive: true, force: true });
  }
});
