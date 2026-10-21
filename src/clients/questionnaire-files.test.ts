import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { parseQuestionnaireDocx, parseQuestionnaireJson, questionnaireDocx, questionnaireHtml, questionnaireJson } from "./questionnaire-files.ts";
import { QUESTIONS, type Answers } from "./questionnaire.ts";
import type { Client } from "./types.ts";

const run = promisify(execFile);
const client = { id: "risero", name: "Risero", url: "https://diaaeziada.risero.io/", language: "ar" } as unknown as Client;
const saved: Answers = { "overview.what": { value: "صفحات حجز للكوتشز", source: "app", updatedAt: "" } };

/** A file's document.xml, as Word would save it. */
async function documentXml(docx: Uint8Array): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "docx-"));
  await writeFile(join(dir, "q.docx"), docx);
  return (await run("unzip", ["-p", join(dir, "q.docx"), "word/document.xml"], { maxBuffer: 1 << 24 })).stdout;
}

/** Rebuilds a docx after a client edited its document.xml. */
async function withXml(docx: Uint8Array, xml: string): Promise<Uint8Array> {
  const dir = await mkdtemp(join(tmpdir(), "docx-edit-"));
  await writeFile(join(dir, "q.docx"), docx);
  await run("unzip", ["-q", join(dir, "q.docx"), "-d", join(dir, "x")]);
  await writeFile(join(dir, "x", "word", "document.xml"), xml);
  await run("zip", ["-q", "-r", "-X", join(dir, "out.docx"), "."], { cwd: join(dir, "x") });
  return new Uint8Array(await readFile(join(dir, "out.docx")));
}

test("the Word file holds every question in its language, the client's name, and a box per answer", async () => {
  const docx = await questionnaireDocx(client, "en", saved);
  const xml = await documentXml(docx);
  for (const q of QUESTIONS.filter((each) => !each.showIf)) assert.ok(xml.includes(q.label.en.replace(/&/g, "&amp;").replace(/'/g, "&apos;")), q.id);
  assert.match(xml, /Risero/);
  assert.match(xml, /صفحات حجز للكوتشز/, "saved answers come pre-filled");
  assert.doesNotMatch(xml, /ELEVENLABS|api[_-]?key|system prompt|<client>/i);
});

test("the Arabic Word file runs right to left", async () => {
  const xml = await documentXml(await questionnaireDocx(client, "ar", {}));
  assert.match(xml, /<w:bidi\/>/);
  assert.match(xml, /<w:rtl\/>/);
  assert.ok(xml.includes(QUESTIONS[0].label.ar));
});

test("a Word file the client filled in comes back as answers, choices matched to their options", async () => {
  const docx = await questionnaireDocx(client, "en", {});
  let xml = await documentXml(docx);
  // The client types into the empty answer boxes.
  const fill = (id: string, text: string) => {
    const at = xml.indexOf(`Ref: ${id}<`);
    assert.ok(at > 0, `no marker for ${id}`);
    const box = xml.indexOf("<w:tbl>", at);
    const empty = xml.indexOf("<w:p>", box);
    xml = `${xml.slice(0, empty)}<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>${xml.slice(empty)}`;
  };
  fill("overview.what", "We build booking pages");
  fill("voice.tone", "Friendly, Premium, like an older brother");
  fill("goals.primary", "مبيعات وحجوزات");
  const { answers, errors, clientId } = await parseQuestionnaireDocx(await withXml(docx, xml));
  assert.equal(clientId, "risero");
  assert.equal(answers["overview.what"], "We build booking pages");
  assert.deepEqual(answers["voice.tone"], ["friendly", "premium", "other:like an older brother"]);
  assert.equal(answers["goals.primary"], "sales");
  assert.equal(errors.length, 0);
});

test("a file that isn't a Word document is refused", async () => {
  await assert.rejects(() => parseQuestionnaireDocx(new TextEncoder().encode("not a zip")), /Word/);
});

test("the JSON file round-trips, and is refused for another client unless asked", () => {
  const text = JSON.stringify(questionnaireJson(client, "ar", saved));
  const back = parseQuestionnaireJson(text, "risero");
  assert.equal(back.answers["overview.what"], "صفحات حجز للكوتشز");
  assert.throws(() => parseQuestionnaireJson(text, "bakery"), /another client/);
  assert.equal(parseQuestionnaireJson(text, "bakery", true).answers["overview.what"], "صفحات حجز للكوتشز");
  assert.throws(() => parseQuestionnaireJson("{nope", "risero"), /JSON/);
  assert.throws(() => parseQuestionnaireJson(JSON.stringify({ hello: 1 }), "risero"), /questionnaire/);
});

test("the JSON template lists every question with its options, for filling in outside the studio", () => {
  const file = questionnaireJson(client, "en", {});
  assert.equal(file.questions.length, QUESTIONS.length);
  assert.ok(file.questions.find((q) => q.id === "voice.tone")!.options!.includes("friendly"));
});

test("the print page has every section and question, right to left in Arabic", () => {
  const html = questionnaireHtml(client, "ar", saved);
  assert.match(html, /dir="rtl"/);
  assert.ok(html.includes(QUESTIONS[0].label.ar));
  assert.match(html, /صفحات حجز للكوتشز/);
  assert.match(questionnaireHtml(client, "en", {}), /dir="ltr"/);
  // Client text is escaped, never markup.
  assert.doesNotMatch(questionnaireHtml(client, "en", { "more.notes": { value: "<script>x</script>", source: "app", updatedAt: "" } }), /<script>x/);
});

test("words that match no option are dropped, not reported, when a question takes no free words", async () => {
  const { choiceFromText } = await import("./questionnaire-files.ts");
  const formats = QUESTIONS.find((q) => q.id === "content.formats")!;
  assert.deepEqual(choiceFromText(formats, "عايزين ريلز, Carousels"), ["carousel"]);
  const tone = QUESTIONS.find((q) => q.id === "voice.tone")!;
  assert.deepEqual(choiceFromText(tone, "Friendly, like a friend"), ["friendly", "other:like a friend"]);
});
