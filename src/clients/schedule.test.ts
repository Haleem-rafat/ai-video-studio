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
