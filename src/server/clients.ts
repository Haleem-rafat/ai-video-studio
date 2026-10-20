import { spawn } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";

import { makeIdeas } from "../clients/ideas.ts";
import { claimIdea, makePost, recoverInterrupted, rerenderPost } from "../clients/make.ts";
import { loadLibrary } from "../clients/library.ts";
import { drawPreviews, previewPath, previewsMade } from "../clients/previews.ts";
import { ART_STYLE_IDS, ART_STYLES, type ArtStyleChoice, type PictureAmount } from "../clients/styles.ts";
import { duplicateOf, loadHistory } from "../clients/history.ts";
import { clientFromMarketingProject, clientFromUrl } from "../clients/onboard.ts";
import { startSchedule } from "../clients/schedule.ts";
import { clientDir, listClients, listPosts, loadClient, loadIdeas, loadPost, localDate, postDir, saveClient, saveIdeas } from "../clients/store.ts";
import type { Client, Slide } from "../clients/types.ts";
import { projectDir } from "../project.ts";
import { enqueue, recentJobs } from "./jobs.ts";

type Ctx = {
  path: string;
  method: string;
  url: URL;
  request: IncomingMessage;
  response: ServerResponse;
  json: (response: ServerResponse, status: number, data: unknown) => void;
  body: <T>(request: IncomingMessage) => Promise<T>;
  sendFile: (request: IncomingMessage, response: ServerResponse, path: string) => Promise<void>;
  inside: (base: string, relative: string) => string;
  fail: (status: number, message: string) => Error;
};

const ideasLabel = (client: Pick<Client, "name">) => `Ideas: ${client.name}`;

/** Queues a client's ideas job: by the morning schedule or "Get 5 more". */
function queueIdeas(client: Pick<Client, "id" | "name">) {
  return enqueue(ideasLabel(client), async (log) => (await makeIdeas(client.id, log)).date, undefined, () => clientDir(client.id));
}

/** Whether a client's ideas job is already waiting or running. */
function ideasBusy(client: Pick<Client, "name">): boolean {
  return recentJobs().some((job) => job.label === ideasLabel(client) && (job.status === "queued" || job.status === "running"));
}

/** What making a client cost is written to its own folder. */
const clientTarget = (result: unknown) => (typeof result === "string" && /^[a-z0-9-]+$/.test(result) ? clientDir(result) : null);

export function startClientSchedule(): void {
  // Jobs from before a restart are gone: free their ideas before anything is queued.
  void listClients()
    .then((clients) => Promise.all(clients.map((client) => recoverInterrupted(client.id))))
    .catch((error: unknown) => console.error(`clients: ${error instanceof Error ? error.message : error}`));
  startSchedule(queueIdeas, ideasBusy);
}

const isStyle = (id: unknown): id is ArtStyleChoice => id === "rotate" || (typeof id === "string" && (ART_STYLE_IDS as readonly string[]).includes(id));
const isAmount = (amount: unknown): amount is PictureAmount => amount === "light" || amount === "rich";

/** Handles /api/clients…, /client-files/… and /client-styles/…; false when the path is not one of them. */
export async function handleClients(ctx: Ctx): Promise<boolean> {
  const { path, method, url, request, response, json, body, fail } = ctx;
  let match: RegExpMatchArray | null;
  const find = (id: string) =>
    loadClient(id).catch(() => {
      throw fail(404, `No client "${id}"`);
    });

  if (path === "/api/clients/styles" && method === "GET") {
    const made = previewsMade();
    json(response, 200, ART_STYLE_IDS.map((id) => ({ id, label: ART_STYLES[id].label, preview: made.includes(id) })));
    return true;
  }

  if (path === "/api/clients/styles/previews" && method === "POST") {
    json(response, 202, enqueue("Art style previews", (log) => drawPreviews(log), undefined, () => null));
    return true;
  }

  if ((match = path.match(/^\/client-styles\/([a-z]+)\.png$/))) {
    if (!isStyle(match[1]) || match[1] === "rotate") throw fail(404, "No such style");
    await ctx.sendFile(request, response, previewPath(match[1]));
    return true;
  }

  if (path === "/api/clients" && method === "GET") {
    json(response, 200, await listClients());
    return true;
  }

  if (path === "/api/clients" && method === "POST") {
    const input = await body<{ fromProject?: string; url?: string }>(request);
    const from = input.fromProject;
    if (from) {
      json(response, 202, enqueue("New client from a marketing project", async () => (await clientFromMarketingProject(from)).id, undefined, clientTarget));
      return true;
    }
    const site = String(input.url ?? "").trim();
    if (!/^(https?:\/\/)?[\w-]+(\.[\w-]+)+/i.test(site)) throw fail(400, "Add the client's website, e.g. https://example.com");
    json(response, 202, enqueue(`New client: ${site.replace(/^https?:\/\//, "")}`, async (log) => (await clientFromUrl(site, log)).id, undefined, clientTarget));
    return true;
  }

  if ((match = path.match(/^\/api\/clients\/([a-z0-9-]+)$/))) {
    const client = await find(match[1]);
    if (method === "GET") {
      json(response, 200, client);
      return true;
    }
    if (method === "PUT") {
      const edits = await body<Partial<Pick<Client, "name" | "instagramHandle" | "language" | "niche" | "avoid" | "dailyIdeas" | "brief" | "artStyle" | "pictures" | "pronounce">>>(request);
      if (edits.pronounce && typeof edits.pronounce === "object")
        client.pronounce = Object.fromEntries(Object.entries(edits.pronounce).filter(([word, said]) => typeof said === "string" && word.trim() && said.trim()).map(([word, said]) => [word.trim(), String(said).trim()]));
      if (isStyle(edits.artStyle)) client.artStyle = edits.artStyle;
      if (isAmount(edits.pictures)) client.pictures = edits.pictures;
      if (typeof edits.name === "string" && edits.name.trim()) client.name = edits.name.trim();
      if (typeof edits.instagramHandle === "string") client.instagramHandle = edits.instagramHandle.trim().replace(/^@/, "") || undefined;
      if (edits.language === "ar" || edits.language === "en") client.language = edits.language;
      if (typeof edits.niche === "string") client.niche = edits.niche.trim();
      if (typeof edits.avoid === "string") client.avoid = edits.avoid.trim();
      if (typeof edits.dailyIdeas === "boolean") client.dailyIdeas = edits.dailyIdeas;
      if (edits.brief) client.brief = { ...client.brief, ...edits.brief, cta: { ...client.brief.cta, ...(edits.brief.cta ?? {}) } };
      await saveClient(client);
      json(response, 200, client);
      return true;
    }
  }

  if ((match = path.match(/^\/api\/clients\/([a-z0-9-]+)\/ideas$/))) {
    const client = await find(match[1]);
    if (method === "GET") {
      const date = url.searchParams.get("date") ?? localDate();
      json(response, 200, (await loadIdeas(client.id, date)) ?? { date, trends: [], ideas: [] });
      return true;
    }
    if (method === "POST") {
      if (ideasBusy(client)) throw fail(409, "Ideas for this client are already being written.");
      json(response, 202, queueIdeas(client));
      return true;
    }
  }

  if ((match = path.match(/^\/api\/clients\/([a-z0-9-]+)\/ideas\/(\d{4}-\d{2}-\d{2}-\d+)\/(skip|make)$/)) && method === "POST") {
    const [, clientId, ideaId, action] = match;
    const date = ideaId.slice(0, 10);
    if (action === "skip") {
      const day = await loadIdeas(clientId, date);
      const idea = day?.ideas.find((i) => i.id === ideaId);
      if (!day || !idea) throw fail(404, "No such idea");
      if (idea.status === "making") throw fail(409, "This idea is being made.");
      idea.status = "skipped";
      await saveIdeas(clientId, day);
      json(response, 200, day);
      return true;
    }
    const options = await body<{ artStyle?: string; pictures?: string; force?: boolean }>(request).catch(() => ({}) as { artStyle?: string; pictures?: string; force?: boolean });
    // Nothing is spent on an idea that repeats something already made, unless asked to.
    if (!options.force) {
      const idea = (await loadIdeas(clientId, date))?.ideas.find((i) => i.id === ideaId);
      const twin = idea && duplicateOf([idea.hook, ...idea.outline].join(" "), await loadHistory(clientId));
      if (twin) throw fail(409, `Too close to: “${twin.made.title}” (made ${twin.made.createdAt.slice(0, 10)}). Make anyway to spend on it.`);
    }
    const idea = await claimIdea(clientId, date, ideaId).catch((error: Error) => {
      throw fail(409, error.message);
    });
    const client = await find(clientId);
    const job = enqueue(
      `Make ${idea.format}: ${client.name}: ${idea.hook.slice(0, 40)}`,
      async (log) => {
        const post = await makePost(clientId, ideaId, log, { ...(isStyle(options.artStyle) ? { artStyle: options.artStyle } : {}), ...(isAmount(options.pictures) ? { pictures: options.pictures } : {}) });
        return post.projectId ?? post.id;
      },
      undefined,
      // A reel returns its project id (costs go to the project), a carousel its post id.
      (result) => (typeof result !== "string" ? null : /^\d{12}-/.test(result) ? projectDir(result) : postDir(clientId, result)),
    );
    json(response, 202, job);
    return true;
  }

  if ((match = path.match(/^\/api\/clients\/([a-z0-9-]+)\/library$/)) && method === "GET") {
    await find(match[1]);
    json(response, 200, await loadLibrary(match[1]));
    return true;
  }

  if ((match = path.match(/^\/api\/clients\/([a-z0-9-]+)\/posts$/)) && method === "GET") {
    json(response, 200, await listPosts(match[1]));
    return true;
  }

  if ((match = path.match(/^\/api\/clients\/([a-z0-9-]+)\/posts\/([a-z0-9-]+)$/))) {
    const [, clientId, postId] = match;
    if (method === "GET") {
      json(response, 200, await loadPost(clientId, postId));
      return true;
    }
    if (method === "PUT") {
      const edits = await body<{ slides?: Slide[]; caption?: string; hashtags?: string[] }>(request);
      json(response, 202, enqueue(`Re-render post: ${postId}`, async (log) => (await rerenderPost(clientId, postId, edits, log)).id, undefined, () => postDir(clientId, postId)));
      return true;
    }
  }

  if ((match = path.match(/^\/api\/clients\/([a-z0-9-]+)\/posts\/([a-z0-9-]+)\/zip$/)) && method === "GET") {
    const dir = postDir(match[1], match[2]);
    await loadPost(match[1], match[2]);
    response.writeHead(200, { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${match[2]}.zip"` });
    const zip = spawn("zip", ["-q", "-r", "-", "slides", "caption.txt"], { cwd: dir });
    zip.stdout.pipe(response);
    zip.on("error", () => response.end());
    return true;
  }

  if ((match = path.match(/^\/client-files\/([a-z0-9-]+)\/(.+)$/))) {
    await ctx.sendFile(request, response, ctx.inside(clientDir(match[1]), match[2]));
    return true;
  }

  return false;
}
