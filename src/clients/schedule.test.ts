import { test } from "node:test";
import assert from "node:assert/strict";

import { dueClients } from "./schedule.ts";
import type { Client } from "./types.ts";

const client = (id: string, dailyIdeas = true) => ({ id, dailyIdeas }) as Client;

test("nobody is due before 08:00", () => {
  assert.deepEqual(dueClients([client("a")], new Date(2026, 9, 20, 7, 59), () => false), []);
});

test("after 08:00 a client is due once: when today's file exists, it is not", () => {
  const now = new Date(2026, 9, 20, 9, 0);
  assert.deepEqual(dueClients([client("a"), client("b")], now, (id) => id === "b").map((c) => c.id), ["a"]);
});

test("clients with daily ideas off are never due", () => {
  assert.deepEqual(dueClients([client("a", false)], new Date(2026, 9, 20, 9, 0), () => false), []);
});

test("each idea of a day gets its own evening to go out, starting the next day", async () => {
  const { isPostAt, suggestPostAt } = await import("./schedule.ts");
  assert.equal(suggestPostAt("2026-10-22-1"), "2026-10-23T19:00");
  assert.equal(suggestPostAt("2026-10-22-3"), "2026-10-25T19:00");
  assert.equal(suggestPostAt("2026-10-31-2"), "2026-11-02T19:00");
  assert.ok(isPostAt("2026-10-23T19:00"));
  assert.ok(!isPostAt("2026-10-23 19:00") && !isPostAt(5));
});
