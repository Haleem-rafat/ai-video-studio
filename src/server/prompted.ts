import { businessContext } from "../clients/context.ts";
import { applyAnswers, profileView } from "../clients/profile.ts";
import { parseQuestionnaireDocx, parseQuestionnaireJson, questionnaireDocx, questionnaireJson, questionnairePdf, type Imported, type Lang } from "../clients/questionnaire-files.ts";
import { PURPOSES, type Purpose } from "../clients/questionnaire.ts";
import { loadClient, saveClient } from "../clients/store.ts";
import { rawBody } from "./body.ts";
import type { Ctx } from "./clients.ts";

/** Largest questionnaire file that can be imported. */
const MAX_IMPORT = 10 * 1024 * 1024;

const fileName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "client";

/**
 * Prompted mode: /api/clients/:id/profile… Every route reads and writes only
 * the client named in its path; false when the path is not one of them.
 */
export async function handlePrompted(ctx: Ctx): Promise<boolean> {
  const { path, method, url, request, response, json, body, fail } = ctx;
  const match = path.match(/^\/api\/clients\/([a-z0-9-]+)\/profile(?:\/(export|import|context))?$/);
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
    const count = Object.values(imported.answers).filter((value) => (Array.isArray(value) ? value.length : value.trim())).length;
    if (dryRun) {
      json(response, 200, { count, answers: imported.answers, errors: imported.errors });
      return true;
    }
    const { client: next, errors } = applyAnswers(client, imported.answers, { source: format === "docx" ? "docx" : "json", keepEmpty: true });
    await saveClient(next);
    json(response, 200, { ...profileView(next), imported: count, errors: [...imported.errors, ...errors] });
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
