import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import puppeteer from "puppeteer-core";

import { answerText, QUESTIONNAIRE_VERSION, QUESTIONS, questionById, SECTIONS, validateAnswers, type AnswerError, type Answers, type Question, type Value } from "./questionnaire.ts";
import type { Client } from "./types.ts";

/**
 * The questionnaire as files a client can fill in without the studio: Word
 * (.docx), a print page (PDF) and JSON; and reading the Word and JSON files
 * back. Only questions, the client's name and their own answers go out:
 * never prompts, keys or other clients' data.
 */

const run = promisify(execFile);
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export type Lang = "en" | "ar";

const WORDS = {
  title: { en: "Business questionnaire", ar: "استبيان النشاط التجاري" },
  for: { en: "Prepared for", ar: "مُعَد لـ" },
  company: { en: "Your company name", ar: "اسم شركتك" },
  intro: {
    en: "These questions help us write social media posts and videos that sound like your business. Answer in the boxes, in Arabic or English, in your own words. Skip anything that doesn't apply; questions marked * matter most.",
    ar: "الأسئلة دي بتساعدنا نكتب بوستات وفيديوهات شبه نشاطك بالظبط. اكتب إجابتك في المربعات، بالعربي أو الإنجليزي، بكلامك انت. سيب أي سؤال مش مناسب؛ الأسئلة اللي عليها * هي الأهم.",
  },
  keep: { en: "Please keep the small reference codes (Ref: …): they let us read your answers back.", ar: "من فضلك سيب الأكواد الصغيرة (Ref: …) زي ما هي: بيها بنقرا إجاباتك." },
  example: { en: "Example", ar: "مثال" },
  options: { en: "Options (write the ones that fit, or your own words)", ar: "اختيارات (اكتب اللي يناسبك، أو بكلامك)" },
  oneOption: { en: "Options (write one, or your own words)", ar: "اختيارات (اكتب واحد، أو بكلامك)" },
  required: { en: "important", ar: "مهم" },
  ifYes: { en: "Answer only if you answered yes above.", ar: "جاوب بس لو إجابتك فوق كانت أيوه." },
} satisfies Record<string, Record<Lang, string>>;

const xml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const html = xml;
const unxml = (text: string) => text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, "&");

const optionList = (q: Question, lang: Lang) => q.options?.map((option) => option.label[lang]).join(" · ") ?? "";
const saved = (answers: Answers, q: Question, lang: Lang) => (answers[q.id] ? answerText(q, answers[q.id].value, lang) : "");

// ---------------------------------------------------------------- Word

type Run = { text: string; bold?: boolean; italic?: boolean; size?: number; color?: string };

function paragraph(runs: Run[], rtl: boolean, after = 80): string {
  const body = runs
    .map((run) => {
      const props = `${run.bold ? "<w:b/><w:bCs/>" : ""}${run.italic ? "<w:i/><w:iCs/>" : ""}${run.color ? `<w:color w:val="${run.color}"/>` : ""}<w:sz w:val="${run.size ?? 22}"/><w:szCs w:val="${run.size ?? 22}"/>${rtl ? "<w:rtl/>" : ""}`;
      return run.text
        .split("\n")
        .map((line, i) => `<w:r><w:rPr>${props}</w:rPr>${i ? "<w:br/>" : ""}<w:t xml:space="preserve">${xml(line)}</w:t></w:r>`)
        .join("");
    })
    .join("");
  return `<w:p><w:pPr>${rtl ? "<w:bidi/>" : ""}<w:spacing w:after="${after}"/></w:pPr>${body}</w:p>`;
}

/** A bordered box to write in; pre-filled with the saved answer, if any. */
function answerBox(text: string, rtl: boolean): string {
  const border = (side: string) => `<w:${side} w:val="single" w:sz="8" w:space="0" w:color="9CA3AF"/>`;
  const inside = text ? paragraph([{ text }], rtl, 0) : `<w:p><w:pPr>${rtl ? "<w:bidi/>" : ""}</w:pPr></w:p>`;
  return `<w:tbl><w:tblPr>${rtl ? "<w:bidiVisual/>" : ""}<w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${["top", "left", "bottom", "right"].map(border).join("")}</w:tblBorders><w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="9360"/></w:tblGrid><w:tr><w:trPr><w:trHeight w:val="900" w:hRule="atLeast"/></w:trPr><w:tc><w:tcPr><w:tcW w:w="5000" w:type="pct"/></w:tcPr>${inside}</w:tc></w:tr></w:tbl>`;
}

/** The small code that ties the box below it to its question. */
const ref = (id: string, rtl: boolean) => paragraph([{ text: `Ref: ${id}`, size: 14, color: "9CA3AF" }], rtl, 20);

function documentXml(client: Client, lang: Lang, answers: Answers): string {
  const rtl = lang === "ar";
  const parts: string[] = [
    paragraph([{ text: WORDS.title[lang], bold: true, size: 40 }], rtl, 120),
    paragraph([{ text: `${WORDS.for[lang]}: ${client.name} (${client.url})`, size: 22, color: "4B5563" }], rtl, 160),
    paragraph([{ text: WORDS.intro[lang] }], rtl, 80),
    paragraph([{ text: WORDS.keep[lang], italic: true, size: 18, color: "6B7280" }], rtl, 200),
    ref(`client:${client.id}`, rtl),
    paragraph([{ text: WORDS.company[lang], bold: true }], rtl, 60),
    ref("company", rtl),
    answerBox(client.name, rtl),
  ];
  for (const section of SECTIONS) {
    parts.push(paragraph([{ text: section.title[lang], bold: true, size: 30, color: "1F2937" }], rtl, 60), paragraph([{ text: section.intro[lang], color: "6B7280" }], rtl, 160));
    for (const q of QUESTIONS.filter((each) => each.section === section.id)) {
      parts.push(paragraph([{ text: q.label[lang], bold: true }, ...(q.required ? [{ text: ` * (${WORDS.required[lang]})`, color: "B45309", size: 18 }] : [])], rtl, 40));
      if (q.showIf) parts.push(paragraph([{ text: WORDS.ifYes[lang], italic: true, size: 18, color: "6B7280" }], rtl, 40));
      if (q.help) parts.push(paragraph([{ text: q.help[lang], size: 20, color: "4B5563" }], rtl, 40));
      if (q.options) parts.push(paragraph([{ text: `${q.kind === "single" ? WORDS.oneOption[lang] : WORDS.options[lang]}: `, size: 20, color: "4B5563" }, { text: optionList(q, lang), size: 20, bold: true, color: "374151" }], rtl, 40));
      if (q.example) parts.push(paragraph([{ text: `${WORDS.example[lang]}: `, italic: true, size: 20, color: "6B7280" }, { text: q.example[lang], italic: true, size: 20, color: "6B7280" }], rtl, 40));
      parts.push(ref(q.id, rtl), answerBox(saved(answers, q, lang), rtl), paragraph([{ text: "" }], rtl, 120));
    }
  }
  const page = `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/>${rtl ? "<w:bidi/>" : ""}</w:sectPr>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${parts.join("")}${page}</w:body></w:document>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;
const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Arial"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>`;

/** The questionnaire as a Word file, in `lang`, with the saved answers already in their boxes. */
export async function questionnaireDocx(client: Client, lang: Lang, answers: Answers): Promise<Uint8Array> {
  const dir = await mkdtemp(join(tmpdir(), "questionnaire-"));
  try {
    await mkdir(join(dir, "_rels"));
    await mkdir(join(dir, "word", "_rels"), { recursive: true });
    await writeFile(join(dir, "[Content_Types].xml"), CONTENT_TYPES);
    await writeFile(join(dir, "_rels", ".rels"), RELS);
    await writeFile(join(dir, "word", "_rels", "document.xml.rels"), DOC_RELS);
    await writeFile(join(dir, "word", "styles.xml"), STYLES);
    await writeFile(join(dir, "word", "document.xml"), documentXml(client, lang, answers));
    await run("zip", ["-q", "-X", "-r", "questionnaire.docx", "[Content_Types].xml", "_rels", "word"], { cwd: dir });
    return new Uint8Array(await readFile(join(dir, "questionnaire.docx")));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Text of a paragraph or table in document.xml, a line per paragraph. */
function textOf(part: string): string {
  return (part.match(/<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g) ?? [part])
    .map((p) => (p.match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>|<w:br\/>|<w:tab\/>/g) ?? []).map((bit) => (bit === "<w:br/>" ? "\n" : bit === "<w:tab/>" ? " " : unxml(bit.replace(/<[^>]+>/g, "")))).join(""))
    .join("\n")
    .trim();
}

const norm = (text: string) => text.toLowerCase().replace(/[ً-ْ]/g, "").replace(/\s+/g, " ").trim();

/** A choice written in words ("Friendly, Premium, like a friend") as option ids, the rest as the client's own words. */
export function choiceFromText(q: Question, text: string): Value {
  const tokens = text.split(/[,،;\n]+|\s+[·•]\s+/).map((token) => token.trim()).filter(Boolean);
  const picked: string[] = [];
  const own: string[] = [];
  for (const token of tokens) {
    const match = q.options!.find((option) => [option.id, option.label.en, option.label.ar].some((label) => norm(label) === norm(token)));
    if (match) picked.push(match.id);
    else own.push(token);
  }
  const values = [...new Set(picked), ...(own.length ? [`other:${own.join(", ")}`] : [])];
  return q.kind === "single" ? (values[0] ?? "") : values;
}

/** A value from a file as the questionnaire's form: choice text matched to options. */
function fromFile(id: string, value: unknown): unknown {
  const q = questionById(id);
  if (!q || (q.kind !== "single" && q.kind !== "multi")) return value;
  const list = Array.isArray(value) ? value : [value];
  if (list.every((item) => typeof item === "string" && (q.options!.some((option) => option.id === item) || item.startsWith("other:")))) return value;
  return choiceFromText(q, list.filter((item) => typeof item === "string").join(", "));
}

export type Imported = { answers: Record<string, Value>; errors: AnswerError[]; clientId?: string };

/** Reads the answers out of a Word file made by `questionnaireDocx` and filled in by the client. */
export async function parseQuestionnaireDocx(bytes: Uint8Array): Promise<Imported> {
  const dir = await mkdtemp(join(tmpdir(), "questionnaire-in-"));
  let doc: string;
  try {
    await writeFile(join(dir, "in.docx"), bytes);
    doc = (await run("unzip", ["-p", join(dir, "in.docx"), "word/document.xml"], { maxBuffer: 1 << 25 })).stdout;
  } catch {
    throw new Error("This is not a Word (.docx) file");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  if (!doc.includes("<w:body")) throw new Error("This is not a Word (.docx) file");

  const raw: Record<string, unknown> = {};
  let clientId: string | undefined;
  let current: string | null = null;
  for (const [part] of doc.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g)) {
    if (part.startsWith("<w:tbl>")) {
      if (current && current !== "company") {
        const text = textOf(part);
        if (text) raw[current] = fromFile(current, text);
      }
      current = null;
      continue;
    }
    const marker = textOf(part).match(/^Ref:\s*(\S+)$/);
    if (!marker) continue;
    if (marker[1].startsWith("client:")) clientId = marker[1].slice(7);
    else current = marker[1];
  }
  if (!clientId && !Object.keys(raw).length && !doc.includes("Ref: ")) throw new Error("This Word file is not the studio's questionnaire (its reference codes are missing)");
  const { answers, errors } = validateAnswers(raw);
  return { answers, errors, clientId };
}

// ---------------------------------------------------------------- JSON

export const JSON_FORMAT = "ai-video-studio/questionnaire";

export type QuestionnaireFile = {
  format: typeof JSON_FORMAT;
  version: number;
  language: Lang;
  client: { id: string; name: string; url: string };
  instructions: string;
  questions: { id: string; section: string; question: string; kind: Question["kind"]; required: boolean; help?: string; example?: string; options?: string[]; optionLabels?: Record<string, string> }[];
  /** Question id → text, an option id, or a list of option ids ("other:…" for the client's own words). */
  answers: Record<string, Value>;
};

/** The questionnaire as structured JSON: every question, its options, and the saved answers. */
export function questionnaireJson(client: Client, lang: Lang, answers: Answers): QuestionnaireFile {
  return {
    format: JSON_FORMAT,
    version: QUESTIONNAIRE_VERSION,
    language: lang,
    client: { id: client.id, name: client.name, url: client.url },
    instructions: `${WORDS.intro[lang]} Fill "answers" with question id → answer; choices take option ids, or "other:<your words>".`,
    questions: QUESTIONS.map((q) => ({
      id: q.id,
      section: SECTIONS.find((s) => s.id === q.section)!.title[lang],
      question: q.label[lang],
      kind: q.kind,
      required: Boolean(q.required),
      ...(q.help ? { help: q.help[lang] } : {}),
      ...(q.example ? { example: q.example[lang] } : {}),
      ...(q.options ? { options: q.options.map((option) => option.id), optionLabels: Object.fromEntries(q.options.map((option) => [option.id, option.label[lang]])) } : {}),
    })),
    answers: Object.fromEntries(Object.entries(answers).map(([id, entry]) => [id, entry.value])),
  };
}

/** Reads a JSON questionnaire; refuses one made for another client unless `force`. */
export function parseQuestionnaireJson(text: string, clientId: string, force = false): Imported {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON");
  }
  const file = data as Partial<QuestionnaireFile>;
  if (!file || typeof file !== "object" || file.format !== JSON_FORMAT || !file.answers || typeof file.answers !== "object") throw new Error("This JSON file is not the studio's questionnaire");
  if (file.client?.id && file.client.id !== clientId && !force) throw new Error(`This file was made for another client (${file.client.name ?? file.client.id})`);
  const raw = Object.fromEntries(Object.entries(file.answers).map(([id, value]) => [id, fromFile(id, value)]));
  const { answers, errors } = validateAnswers(raw);
  return { answers, errors, clientId: file.client?.id };
}

// ---------------------------------------------------------------- print page / PDF

/** The questionnaire as a print page (the PDF is made from it). */
export function questionnaireHtml(client: Client, lang: Lang, answers: Answers): string {
  const dir = lang === "ar" ? "rtl" : "ltr";
  const sections = SECTIONS.map((section) => {
    const questions = QUESTIONS.filter((q) => q.section === section.id)
      .map(
        (q) => `<div class="q">
  <p class="label">${html(q.label[lang])}${q.required ? ` <span class="req">* ${html(WORDS.required[lang])}</span>` : ""}</p>
  ${q.showIf ? `<p class="note">${html(WORDS.ifYes[lang])}</p>` : ""}
  ${q.help ? `<p class="help">${html(q.help[lang])}</p>` : ""}
  ${q.options ? `<p class="help">${html(q.kind === "single" ? WORDS.oneOption[lang] : WORDS.options[lang])}: <b>${html(optionList(q, lang))}</b></p>` : ""}
  ${q.example ? `<p class="example">${html(WORDS.example[lang])}: ${html(q.example[lang])}</p>` : ""}
  <div class="box">${html(saved(answers, q, lang)).replace(/\n/g, "<br>")}</div>
</div>`,
      )
      .join("\n");
    return `<section><h2>${html(section.title[lang])}</h2><p class="intro">${html(section.intro[lang])}</p>${questions}</section>`;
  }).join("\n");
  return `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><title>${html(WORDS.title[lang])} · ${html(client.name)}</title>
<style>
@page { size: A4; margin: 18mm 16mm; }
body { font-family: ${lang === "ar" ? '"Geeza Pro", "Noto Naskh Arabic", Arial' : '-apple-system, "Helvetica Neue", Arial'}, sans-serif; color: #111827; font-size: 11pt; line-height: 1.5; }
h1 { font-size: 22pt; margin: 0 0 4pt; }
h2 { font-size: 15pt; margin: 18pt 0 2pt; border-bottom: 1px solid #e5e7eb; padding-bottom: 4pt; }
.for { color: #4b5563; margin: 0 0 10pt; }
.intro, .help, .note { color: #4b5563; margin: 0 0 4pt; }
.note { font-style: italic; }
.q { break-inside: avoid; margin: 10pt 0 12pt; }
.label { font-weight: 600; margin: 0 0 3pt; }
.req { color: #b45309; font-size: 9pt; font-weight: 500; }
.example { color: #6b7280; font-style: italic; font-size: 10pt; margin: 0 0 4pt; }
.box { border: 1px solid #9ca3af; border-radius: 4pt; min-height: 46pt; padding: 6pt 8pt; white-space: pre-wrap; }
.company .box { min-height: 18pt; }
</style></head><body>
<h1>${html(WORDS.title[lang])}</h1>
<p class="for">${html(WORDS.for[lang])}: ${html(client.name)} (${html(client.url)})</p>
<p class="intro">${html(WORDS.intro[lang])}</p>
<div class="q company"><p class="label">${html(WORDS.company[lang])}</p><div class="box">${html(client.name)}</div></div>
${sections}
</body></html>`;
}

/** The print page as a PDF, drawn by Chrome. */
export async function questionnairePdf(client: Client, lang: Lang, answers: Answers): Promise<Uint8Array> {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(questionnaireHtml(client, lang, answers), { waitUntil: "load" });
    return await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  } finally {
    await browser.close();
  }
}
