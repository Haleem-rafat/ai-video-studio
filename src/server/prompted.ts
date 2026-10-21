import { clientPrompt, extractBlock, readClientAnswers } from "../clients/client-prompt.ts";
import { businessContext } from "../clients/context.ts";
import { draftKnowledge } from "../clients/knowledge.ts";
import { applyAnswers, profileView } from "../clients/profile.ts";
import { parseQuestionnaireDocx, parseQuestionnaireJson, questionnaireDocx, questionnaireJson, questionnairePdf, type Imported, type Lang } from "../clients/questionnaire-files.ts";
import { PURPOSES, type Purpose } from "../clients/questionnaire.ts";
import { clientDir, loadClient, saveClient } from "../clients/store.ts";
import { rawBody } from "./body.ts";
import type { Ctx } from "./clients.ts";
import { enqueue } from "./jobs.ts";

/** Largest questionnaire file that can be imported. */
const MAX_IMPORT = 10 * 1024 * 1024;

const fileName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "client";

/**
 * Prompted mode: /api/clients/:id/profile… Every route reads and writes only
 * the client named in its path; false when the path is not one of them.
 */
export async function handlePrompted(ctx: Ctx): Promise<boolean> {
  const { path, method, url, request, response, json, body, fail } = ctx;
  const match = path.match(/^\/api\/clients\/([a-z0-9-]+)\/profile(?:\/(export|import|context|prompt|chat|chat\/save))?$/);
  if (!match) return false;
  const [, id, action] = match;
  const client = await loadClient(id).catch(() => {
    throw fail(404, `No client "${id}"`);
  });

  if (!action && method === "GET") {
    json(response, 200, profileView(client));
    return true;
  }

  if (!action && method === "PUT") {
    const input = await body<{ answers?: unknown; confirmed?: unknown }>(request);
    const confirmed = Array.isArray(input.confirmed) ? input.confirmed.filter((item): item is string => typeof item === "string") : [];
    const { client: next, errors } = applyAnswers(client, input.answers, { source: "app", confirmed });
    await saveClient(next);
    json(response, 200, { ...profileView(next), errors });
    return true;
  }

  if (action === "export" && method === "GET") {
    const lang: Lang = url.searchParams.get("lang") === "en" ? "en" : "ar";
    const format = url.searchParams.get("format");
    const answers = client.profile?.answers ?? {};
    const base = `${fileName(client.name)}-questionnaire-${lang}`;
    const send = (bytes: Uint8Array | string, type: string, ext: string) => {
      response.writeHead(200, { "Content-Type": type, "Content-Disposition": `attachment; filename="${base}.${ext}"`, "Cache-Control": "no-store" });
      response.end(bytes);
    };
    if (format === "docx") send(await questionnaireDocx(client, lang, answers), "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx");
    else if (format === "pdf") send(await questionnairePdf(client, lang, answers), "application/pdf", "pdf");
    else if (format === "json") send(`${JSON.stringify(questionnaireJson(client, lang, answers), null, 2)}\n`, "application/json; charset=utf-8", "json");
    else throw fail(400, "Pick a format: docx, pdf or json");
    return true;
  }

  if (action === "import" && method === "POST") {
    const format = url.searchParams.get("format");
    const dryRun = url.searchParams.get("dryRun") === "1";
    const force = url.searchParams.get("force") === "1";
    const bytes = await rawBody(request, MAX_IMPORT).catch((error: Error) => {
      throw fail(413, error.message);
    });
    let imported: Imported;
    try {
      if (format === "docx") imported = await parseQuestionnaireDocx(bytes);
      else if (format === "json") imported = parseQuestionnaireJson(new TextDecoder().decode(bytes), id, force);
      else throw new Error("Pick a format: docx or json");
    } catch (error) {
      throw fail(/another client/.test((error as Error).message) ? 409 : 400, (error as Error).message);
    }
    // A Word file carries the id of the client it was made for.
    if (format === "docx" && imported.clientId && imported.clientId !== id && !force) throw fail(409, "This file was made for another client");
    // New or changed answers only: a returned file still holds the answers it was sent with.
    const saved = client.profile?.answers ?? {};
    const count = Object.entries(imported.answers).filter(([qid, value]) => (Array.isArray(value) ? value.length : value.trim()) && JSON.stringify(value) !== JSON.stringify(saved[qid]?.value) && !(qid === "output.language" && value === client.language)).length;
    if (dryRun) {
      json(response, 200, { count, answers: imported.answers, errors: imported.errors });
      return true;
    }
    const { client: next, errors } = applyAnswers(client, imported.answers, { source: format === "docx" ? "docx" : "json", keepEmpty: true });
    await saveClient(next);
    json(response, 200, { ...profileView(next), imported: count, errors: [...imported.errors, ...errors] });
    return true;
  }

  // ---- answered in the client's own AI (ChatGPT, Claude, Gemini)
  if (action === "prompt" && method === "GET") {
    const lang: Lang = url.searchParams.get("lang") === "en" ? "en" : "ar";
    const text = clientPrompt(client, lang);
    if (url.searchParams.get("download") === "1") {
      response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${fileName(client.name)}-ai-prompt-${lang}.txt"`, "Cache-Control": "no-store" });
      response.end(text);
    } else json(response, 200, { lang, text });
    return true;
  }

  if (action === "chat" && method === "POST") {
    const { text } = await body<{ text?: string }>(request);
    if (!text?.trim()) throw fail(400, "Paste what the client sent back.");
    if (text.length > 200000) throw fail(413, "That text is too long; paste only the client's answers.");
    // The exact block is read at once, for free; anything else is read by the AI as a job, its cost on the client.
    if (extractBlock(text)) {
      json(response, 200, { preview: await readClientAnswers(client, text, () => {}) });
      return true;
    }
    const job = Object.assign(
      enqueue(`Read client answers: ${client.name}`, (log) => readClientAnswers(client, text, log), undefined, () => clientDir(id)),
      { link: `/marketing/clients/${id}` },
    );
    json(response, 202, { job });
    return true;
  }

  if (action === "chat/save" && method === "POST") {
    const input = await body<{ answers?: unknown; redraftKnowledge?: boolean }>(request);
    const { client: next, errors } = applyAnswers(client, input.answers, { source: "chat", keepEmpty: true });
    await saveClient(next);
    // Knowledge drafted again reads these answers first.
    const job = input.redraftKnowledge
      ? Object.assign(
          enqueue(
            `Knowledge: ${next.name}`,
            async (log) => {
              const fresh = await loadClient(id);
              fresh.knowledge = await draftKnowledge(fresh, log);
              await saveClient(fresh);
              return id;
            },
            undefined,
            () => clientDir(id),
          ),
          { link: `/marketing/clients/${id}` },
        )
      : undefined;
    json(response, 200, { ...profileView(next), errors, ...(job ? { job } : {}) });
    return true;
  }

  if (action === "context" && method === "GET") {
    const purpose = url.searchParams.get("purpose") as Purpose;
    if (!PURPOSES.includes(purpose)) throw fail(400, `Pick a purpose: ${PURPOSES.join(", ")}`);
    json(response, 200, { purpose, text: businessContext(client, purpose) });
    return true;
  }

  return false;
}
