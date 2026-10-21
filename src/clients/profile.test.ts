import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.CLIENTS_DIR = await mkdtemp(join(tmpdir(), "profile-"));
const { applyAnswers, profileView } = await import("./profile.ts");
const { loadClient, saveClient } = await import("./store.ts");
import type { Client } from "./types.ts";

const base = () =>
  ({
    id: "risero",
    name: "Risero",
    url: "https://diaaeziada.risero.io/",
    language: "ar",
    avoid: "",
    brand: { summary: "Booking pages", services: [] },
    brief: { business: "", audience: "Coaches", problems: [], result: "", features: [], cta: { label: "Book", url: "x" }, tone: "" },
    niche: "",
    dailyIdeas: false,
    createdAt: "",
    updatedAt: "",
  }) as unknown as Client;

test("answers are saved with their source; the output language is the client's language, not a second copy", () => {
  const { client, errors } = applyAnswers(base(), { "overview.what": "Booking pages", "output.language": "en", "voice.tone": ["friendly"] }, { source: "app" });
  assert.equal(errors.length, 0);
  assert.equal(client.language, "en");
  assert.equal(client.profile!.answers["output.language"], undefined);
  assert.equal(client.profile!.answers["overview.what"].source, "app");
  assert.equal(profileView(client).values["output.language"], "en");
});

test("confirming what the website says records it as from the website", () => {
  const { client } = applyAnswers(base(), { "audience.who": "Coaches" }, { source: "app", confirmed: ["audience.who"] });
  assert.equal(client.profile!.answers["audience.who"].source, "website");
});

test("an import adds and replaces answers but never clears the ones its file left empty", () => {
  const first = applyAnswers(base(), { "overview.what": "Booking pages", "audience.who": "Coaches" }, { source: "app" }).client;
  const { client } = applyAnswers(first, { "overview.what": "Booking pages for coaches", "audience.who": "" }, { source: "docx", keepEmpty: true });
  assert.equal(client.profile!.answers["overview.what"].value, "Booking pages for coaches");
  assert.equal(client.profile!.answers["overview.what"].source, "docx");
  assert.equal(client.profile!.answers["audience.who"].value, "Coaches");
});

test("in the app, clearing a field clears it; other answers stay", () => {
  const first = applyAnswers(base(), { "overview.what": "Booking pages", "audience.who": "Coaches" }, { source: "app" }).client;
  const { client } = applyAnswers(first, { "overview.what": "" }, { source: "app" });
  assert.equal(client.profile!.answers["overview.what"], undefined);
  assert.equal(client.profile!.answers["audience.who"].value, "Coaches");
});

test("the view shows progress, what the website knows, and every question to render", () => {
  const view = profileView(applyAnswers(base(), { "overview.what": "Booking pages" }, { source: "app" }).client);
  assert.ok(view.questions.length > 30);
  assert.equal(view.sections.length, 9);
  assert.equal(view.completion.answered >= 1, true);
  assert.match(view.known["audience.who"], /Coaches/);
});

test("answers are kept in the client's own file and come back after loading", async () => {
  const { client } = applyAnswers(base(), { "overview.what": "Booking pages" }, { source: "app" });
  await saveClient(client);
  const loaded = await loadClient("risero");
  assert.equal(loaded.profile!.answers["overview.what"].value, "Booking pages");
});

test("re-importing a file with an unchanged answer keeps where that answer came from", () => {
  const first = applyAnswers(base(), { "audience.who": "Coaches" }, { source: "app", confirmed: ["audience.who"] }).client;
  const { client } = applyAnswers(first, { "audience.who": "Coaches", "overview.what": "Booking pages" }, { source: "docx", keepEmpty: true });
  assert.equal(client.profile!.answers["audience.who"].source, "website");
  assert.equal(client.profile!.answers["overview.what"].source, "docx");
});
