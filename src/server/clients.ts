import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { exportIndex, postsToExport, type ExportKind } from "../clients/export.ts";
import { makeIdeas } from "../clients/ideas.ts";
import { syncInvoices } from "../clients/billing.ts";
import { claimIdea, compareVariant, deletePost, ideaFromProject, makePost, postIdFor, recoverInterrupted, rerenderPost } from "../clients/make.ts";
import { hostOf, loadLibrary } from "../clients/library.ts";
import { draftKnowledge, foldAnswer, type Knowledge } from "../clients/knowledge.ts";
import { drawPreviews, previewPath, previewsMade } from "../clients/previews.ts";
import { DESIGN_IDS, DESIGNS, type DesignChoice, type DesignId } from "../clients/designs.ts";
import { FORMAT_IDS, FORMATS, type FormatId } from "../clients/formats.ts";
import { REEL_STYLE_IDS, REEL_STYLES, type ReelStyleId } from "../clients/reel-styles.ts";
import { designPreviewPath, postDesignPath, PREVIEW_SLIDES, renderDesignPreviews, renderPostDesigns } from "../clients/design-previews.ts";
import { ART_STYLE_IDS, ART_STYLES, type ArtStyleChoice, type PictureAmount } from "../clients/styles.ts";
import { duplicateOf, flagRepeats, loadHistory } from "../clients/history.ts";
import { clientFromMarketingProject, clientFromUrl } from "../clients/onboard.ts";
import { isPostAt, startSchedule } from "../clients/schedule.ts";
import { dataUrl, previewHtml } from "../render/carousel.ts";
import { clientDir, listClients, listPosts, loadClient, loadIdeas, loadPost, localDate, postDir, saveClient, saveIdeas, savePost } from "../clients/store.ts";
import type { Client, Idea, Slide } from "../clients/types.ts";
import { loadProject, projectDir } from "../project.ts";
import { enqueue, recentJobs } from "./jobs.ts";
import { editedSlideProblems } from "../clients/slides.ts";
import { readDirection } from "../clients/direction.ts";
import { handleInvoices } from "./invoices.ts";
import { handlePrompted } from "./prompted.ts";

export type Ctx = {
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
/** The client's page in the studio: where its jobs' work shows up. */
const clientPage = (clientId: string) => `/marketing/clients/${clientId}`;

/** Queues a client's ideas job: by the morning schedule or "Get 5 more". */
function queueIdeas(client: Pick<Client, "id" | "name">) {
  return Object.assign(enqueue(ideasLabel(client), async (log) => (await makeIdeas(client.id, log)).date, undefined, () => clientDir(client.id)), { link: clientPage(client.id) });
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
const isDesign = (id: unknown): id is DesignId => typeof id === "string" && (DESIGN_IDS as readonly string[]).includes(id);
const isDesignChoice = (id: unknown): id is DesignChoice => id === "rotate" || isDesign(id);
const isFormat = (id: unknown): id is FormatId | "auto" => id === "auto" || (typeof id === "string" && (FORMAT_IDS as readonly string[]).includes(id));
const isReelStyle = (id: unknown): id is ReelStyleId | "auto" => id === "auto" || (typeof id === "string" && (REEL_STYLE_IDS as readonly string[]).includes(id));
const isAmount = (amount: unknown): amount is PictureAmount => amount === "none" || amount === "light" || amount === "rich";

/** Starts making a claimed idea into a post, as a job whose cost lands on the post (or the reel's project). */
function queueMake(client: Client, idea: Idea, options: { artStyle?: string; pictures?: string; design?: string; format?: string; reelStyle?: string }) {
  const clientId = client.id;
  const ideaId = idea.id;
  const job = enqueue(
    `Make ${idea.format}: ${client.name}: ${idea.hook.slice(0, 40)}`,
    async (log) => {
      const post = await makePost(clientId, ideaId, log, {
        ...(isStyle(options.artStyle) ? { artStyle: options.artStyle } : {}),
        ...(isAmount(options.pictures) ? { pictures: options.pictures } : {}),
        ...(isDesignChoice(options.design) ? { design: options.design } : {}),
        ...(isFormat(options.format) ? { format: options.format } : {}),
        ...(isReelStyle(options.reelStyle) ? { reelStyle: options.reelStyle } : {}),
      });
      // The new piece gets its invoice at once.
      await syncInvoices(clientId).catch((error) => log(`invoices: not updated (${error instanceof Error ? error.message : error})`));
      return post.projectId ?? post.id;
    },
    undefined,
    // A reel returns its project id (costs go to the project), a carousel its post id.
    (result) => (typeof result !== "string" ? null : /^\d{12}-/.test(result) ? projectDir(result) : postDir(clientId, result)),
  );
  job.link = clientPage(clientId);
  return job;
}

/** Handles /api/clients…, /client-files/… and /client-styles/…; false when the path is not one of them. */
export async function handleClients(ctx: Ctx): Promise<boolean> {
  const { path, method, url, request, response, json, body, fail } = ctx;
  let match: RegExpMatchArray | null;
  // Prompted mode: /api/clients/:id/profile…
  if (await handlePrompted(ctx)) return true;
  // Invoices: /api/clients/:id/invoices…
  if (await handleInvoices(ctx)) return true;
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

  // Carousel designs: the catalog, with which previews this client has; previews are drawn by Chrome, at no cost.
  if (path === "/api/clients/designs" && method === "GET") {
    const clientId = url.searchParams.get("client");
    json(
      response,
      200,
      DESIGN_IDS.map((id) => ({ id, label: DESIGNS[id].label, description: DESIGNS[id].description, previews: clientId && /^[a-z0-9-]+$/.test(clientId) ? PREVIEW_SLIDES.filter((slide) => existsSync(designPreviewPath(clientId, id, slide))) : [] })),
    );
    return true;
  }

  if (path === "/api/clients/reel-styles" && method === "GET") {
    json(response, 200, REEL_STYLE_IDS.map((id) => ({ id, label: REEL_STYLES[id].label, description: REEL_STYLES[id].description })));
    return true;
  }

  if (path === "/api/clients/formats" && method === "GET") {
    json(response, 200, FORMAT_IDS.map((id) => ({ id, label: FORMATS[id].label, description: FORMATS[id].description })));
    return true;
  }

  if ((match = path.match(/^\/api\/clients\/([a-z0-9-]+)\/designs\/previews$/)) && method === "POST") {
    const client = await find(match[1]);
    const job = enqueue(
      `Design previews: ${client.name}`,
      async (log) => {
        await renderDesignPreviews(await loadClient(client.id), log);
        return client.id;
      },
      undefined,
      () => null,
    );
    job.link = clientPage(client.id);
    json(response, 202, job);
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
      json(response, 202, Object.assign(enqueue("New client from a marketing project", async () => (await clientFromMarketingProject(from)).id, undefined, clientTarget), { link: `/projects/${from}` }));
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
      const edits = await body<Partial<Pick<Client, "name" | "instagramHandle" | "language" | "niche" | "avoid" | "dailyIdeas" | "brief" | "artStyle" | "pictures" | "pronounce" | "knowledge" | "design">> & { direction?: unknown }>(request);
      if (edits.knowledge && typeof edits.knowledge === "object" && Array.isArray(edits.knowledge.howItWorks)) client.knowledge = { ...edits.knowledge, updatedAt: new Date().toISOString() } as Knowledge;
      if (edits.pronounce && typeof edits.pronounce === "object")
        client.pronounce = Object.fromEntries(Object.entries(edits.pronounce).filter(([word, said]) => typeof said === "string" && word.trim() && said.trim()).map(([word, said]) => [word.trim(), String(said).trim()]));
      if (isStyle(edits.artStyle)) client.artStyle = edits.artStyle;
      if (isAmount(edits.pictures)) client.pictures = edits.pictures;
      if (isDesignChoice(edits.design)) client.design = edits.design;
      if (edits.direction !== undefined) {
        const direction = readDirection(edits.direction);
        if (!direction) throw fail(400, "A content direction needs a mode: promo, value or mix.");
        client.direction = direction;
      }
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
      const day = (await loadIdeas(client.id, date)) ?? { date, trends: [], ideas: [] };
      // Each idea still to make shows what it repeats, before anything is spent on it.
      const [history, posts] = await Promise.all([loadHistory(client.id), listPosts(client.id)]);
      const reelOf = Object.fromEntries(posts.filter((post) => post.projectId).map((post) => [post.id, post.projectId!]));
      json(response, 200, { ...day, ideas: flagRepeats(day.ideas, history, reelOf) });
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
    type MakeBody = { artStyle?: string; pictures?: string; design?: string; format?: string; reelStyle?: string; force?: boolean };
    const options = await body<MakeBody>(request).catch(() => ({}) as MakeBody);
    // Nothing is spent on an idea that repeats something already made, unless asked to.
    if (!options.force) {
      const idea = (await loadIdeas(clientId, date))?.ideas.find((i) => i.id === ideaId);
      // An idea taken from a marketing video re-uses that video's message on purpose: only that video is left out.
      const twin = idea && duplicateOf([idea.hook, ...idea.outline].join(" "), (await loadHistory(clientId)).filter((made) => made.id !== idea.fromProject));
      if (twin) throw fail(409, `Too close to: “${twin.made.title}” (made ${twin.made.createdAt.slice(0, 10)}). Make anyway to spend on it.`);
    }
    const idea = await claimIdea(clientId, date, ideaId).catch((error: Error) => {
      throw fail(409, error.message);
    });
    const job = queueMake(await find(clientId), idea, options);
    json(response, 202, job);
    return true;
  }

  // Marketing mode: a marketing video's message made into an Instagram post for the website's client (found by its address, or made from the video).
  if ((match = path.match(/^\/api\/clients\/([a-z0-9-]+)\/ideas\/(\d{4}-\d{2}-\d{2}-\d+)$/)) && method === "PATCH") {
    const [, clientId, ideaId] = match;
    const raw = await body<{ postAt?: unknown }>(request);
    if (!isPostAt(raw.postAt)) throw fail(400, "Send postAt as YYYY-MM-DDTHH:mm.");
    const day = await loadIdeas(clientId, ideaId.slice(0, 10));
    const idea = day?.ideas.find((entry) => entry.id === ideaId);
    if (!day || !idea) throw fail(404, `No idea ${ideaId}`);
    idea.postAt = raw.postAt;
    await saveIdeas(clientId, day);
    // Its posts go out then too.
    for (const id of new Set([idea.postId, ...(idea.variants ?? [])].filter(Boolean) as string[])) {
      const post = await loadPost(clientId, id).catch(() => null);
      if (post) await savePost({ ...post, postAt: raw.postAt });
    }
    json(response, 200, idea);
    return true;
  }

  if ((match = path.match(/^\/api\/clients\/from-project\/([a-z0-9-]+)\/make$/)) && method === "POST") {
    const projectId = match[1];
    const project = await loadProject(projectId).catch(() => {
      throw fail(404, `No project "${projectId}"`);
    });
    const host = project.marketing ? hostOf(project.marketing.brand.url) : "";
    if (!host) throw fail(400, "Only a marketing video with a website can be made into posts.");
    const input = await body<{ format?: string; artStyle?: string; pictures?: string; design?: string; postFormat?: string; reelStyle?: string; force?: boolean }>(request);
    const format = input.format === "carousel" || input.format === "single" || input.format === "reel" ? input.format : null;
    if (!format) throw fail(400, "Pick carousel, single or reel.");
    const client = (await listClients()).find((each) => hostOf(each.url) === host) ?? (await clientFromMarketingProject(projectId));
    const date = localDate();
    const day = (await loadIdeas(client.id, date)) ?? { date, trends: [], ideas: [] };
    const idea = ideaFromProject(project, format, date, day.ideas);
    // Re-using this video's message is the point; anything else already made still counts as a repeat.
    if (!input.force) {
      const twin = duplicateOf([idea.hook, ...idea.outline].join(" "), (await loadHistory(client.id)).filter((made) => made.id !== projectId));
      if (twin) throw fail(409, `Too close to: “${twin.made.title}” (made ${twin.made.createdAt.slice(0, 10)}). Make anyway to spend on it.`);
    }
    await saveIdeas(client.id, { ...day, ideas: [...day.ideas, { ...idea, status: "making" }] });
    const job = queueMake(client, idea, { ...input, format: input.postFormat });
    json(response, 202, { job, clientId: client.id, ideaId: idea.id });
    return true;
  }

  // Make again: a fresh version of a finished post's idea beside it, with the same settings and today's rules, to compare.
  if ((match = path.match(/^\/api\/clients\/([a-z0-9-]+)\/posts\/([a-z0-9-]+)\/again$/)) && method === "POST") {
    const [, clientId, postId] = match;
    const client = await find(clientId);
    const post = await loadPost(clientId, postId).catch(() => {
      throw fail(404, `No post ${postId}`);
    });
    if (post.status !== "done") throw fail(409, "Make it again once it's finished.");
    if (!post.ideaId) throw fail(400, "This post has no idea to make again.");
    const date = post.ideaId.slice(0, 10);
    const day = await loadIdeas(clientId, date);
    const idea = day?.ideas.find((i) => i.id === post.ideaId);
    if (!day || !idea) throw fail(404, `No idea ${post.ideaId}`);
    if (idea.status === "making") throw fail(409, "This idea is being made.");
    const taken = new Set([idea.postId, ...(idea.variants ?? [])]);
    let n = 2;
    while (taken.has(postIdFor(idea, `again${n}`))) n++;
    idea.status = "making";
    await saveIdeas(clientId, day);
    const options = {
      ...(post.artStyle ? { artStyle: post.artStyle } : {}),
      ...(post.pictures ? { pictures: post.pictures } : {}),
      ...(post.design ? { design: post.design } : {}),
      ...(post.postFormat ? { format: post.postFormat } : {}),
      ...(post.reelStyle ? { reelStyle: post.reelStyle } : {}),
      variant: `again${n}`,
    };
    const job = Object.assign(
      enqueue(
        `Make again (${n}): ${client.name}: ${idea.hook.slice(0, 40)}`,
        async (log) => {
          const made = await compareVariant(clientId, idea.id, options, true, log);
          await syncInvoices(clientId).catch((error) => log(`invoices: not updated (${error instanceof Error ? error.message : error})`));
          return made?.projectId ?? made?.id;
        },
        undefined,
        (result) => (typeof result !== "string" ? null : /^\d{12}-/.test(result) ? projectDir(result) : postDir(clientId, result)),
      ),
      { link: clientPage(clientId) },
    );
    json(response, 202, job);
    return true;
  }

  // Compare: one idea made 2-4 ways (formats for a carousel, reel styles for a reel), one job each so each post carries its own cost.
  if ((match = path.match(/^\/api\/clients\/([a-z0-9-]+)\/ideas\/(\d{4}-\d{2}-\d{2}-\d+)\/compare$/)) && method === "POST") {
    const [, clientId, ideaId] = match;
    const date = ideaId.slice(0, 10);
    const client = await find(clientId);
    const input = await body<{ variants?: unknown; artStyle?: string; pictures?: string; design?: string }>(request);
    const found = (await loadIdeas(clientId, date))?.ideas.find((i) => i.id === ideaId);
    if (!found) throw fail(404, `No idea ${ideaId}`);
    const allowed: readonly string[] = found.format === "reel" ? REEL_STYLE_IDS : found.format === "carousel" ? FORMAT_IDS : [];
    if (!allowed.length) throw fail(400, "Compare formats on carousels and reel styles on reels; compare a single image's designs on its post for free.");
    const variants = [...new Set(Array.isArray(input.variants) ? input.variants : [])].filter((v): v is string => typeof v === "string" && allowed.includes(v));
    if (variants.length < 2 || variants.length > 4) throw fail(400, "Pick 2 to 4 to compare.");
    const idea = await claimIdea(clientId, date, ideaId).catch((error: Error) => {
      throw fail(409, error.message);
    });
    const base = {
      ...(isStyle(input.artStyle) ? { artStyle: input.artStyle } : {}),
      ...(isAmount(input.pictures) ? { pictures: input.pictures } : {}),
      ...(isDesignChoice(input.design) ? { design: input.design } : {}),
    };
    const jobs = variants.map((variant, i) =>
      Object.assign(
        enqueue(
          `Compare ${i + 1}/${variants.length} (${variant}): ${client.name}: ${idea.hook.slice(0, 30)}`,
          async (log) => {
            const post = await compareVariant(clientId, ideaId, { ...base, ...(idea.format === "reel" ? { reelStyle: variant as ReelStyleId } : { format: variant as FormatId }), variant }, i === variants.length - 1, log);
            return post?.projectId ?? post?.id;
          },
          undefined,
          (result) => (typeof result !== "string" ? null : /^\d{12}-/.test(result) ? projectDir(result) : postDir(clientId, result)),
        ),
        { link: clientPage(clientId) },
      ),
    );
    json(response, 202, jobs);
    return true;
  }

  if ((match = path.match(/^\/api\/clients\/([a-z0-9-]+)\/knowledge\/(draft|answer)$/)) && method === "POST") {
    const [, clientId, action] = match;
    const client = await find(clientId);
    const input = await body<{ questionId?: string; answer?: string }>(request);
    if (action === "answer" && (!input.questionId || !input.answer?.trim())) throw fail(400, "Write an answer.");
    if (action === "answer" && !client.knowledge) throw fail(409, "Draft the knowledge first.");
    const job = enqueue(
      action === "draft" ? `Knowledge: ${client.name}` : `Knowledge answer: ${client.name}`,
      async (log) => {
        const fresh = await loadClient(clientId);
        fresh.knowledge = action === "draft" ? await draftKnowledge(fresh, log) : await foldAnswer(fresh, fresh.knowledge!, input.questionId!, input.answer!, log);
        await saveClient(fresh);
        return clientId;
      },
      undefined,
      clientTarget,
    );
    job.link = clientPage(clientId);
    json(response, 202, job);
    return true;
  }

  if ((match = path.match(/^\/api\/clients\/([a-z0-9-]+)\/library$/)) && method === "GET") {
    await find(match[1]);
    json(response, 200, await loadLibrary(match[1]));
    return true;
  }

  // Everything at once: a folder per finished post of a kind (slides, caption, art, data) and an index.csv, in one zip.
  if ((match = path.match(/^\/api\/clients\/([a-z0-9-]+)\/posts\/zip$/)) && method === "GET") {
    const clientId = match[1];
    const client = await find(clientId);
    const asked = url.searchParams.get("kind") ?? "all";
    const kind: ExportKind = asked === "carousel" || asked === "single" || asked === "reel" ? asked : "all";
    const posts = postsToExport(await listPosts(clientId), kind);
    if (!posts.length) throw fail(404, `No finished ${kind === "all" ? "posts" : `${kind}s`} to export.`);
    const titles: Record<string, string> = {};
    for (const day of new Set(posts.map((post) => post.ideaId?.slice(0, 10)).filter((day): day is string => Boolean(day)))) for (const idea of (await loadIdeas(clientId, day))?.ideas ?? []) titles[idea.id] = idea.hook;
    const work = await mkdtemp(join(tmpdir(), "export-"));
    try {
      await writeFile(join(work, "index.csv"), exportIndex(posts, titles));
      const out = join(work, "export.zip");
      const zip = (args: string[], cwd: string) =>
        new Promise<void>((resolve, reject) => {
          const child = spawn("zip", args, { cwd });
          child.on("error", reject);
          child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`zip stopped (${code})`))));
        });
      await zip(["-q", "-r", out, ...posts.map((post) => post.id), "-x", "*/usage.json"], join(clientDir(clientId), "posts"));
      await zip(["-q", "-j", out, join(work, "index.csv")], work);
      const name = `${client.id}-${kind === "all" ? "posts" : `${kind}s`}-${localDate()}.zip`;
      response.writeHead(200, { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${name}"` });
      response.end(await readFile(out));
    } finally {
      await rm(work, { recursive: true, force: true });
    }
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
    // When it goes out: saved as is, nothing is redrawn.
    if (method === "PATCH") {
      const raw = await body<{ postAt?: unknown }>(request);
      if (!isPostAt(raw.postAt)) throw fail(400, "Send postAt as YYYY-MM-DDTHH:mm.");
      const post = await loadPost(clientId, postId);
      post.postAt = raw.postAt;
      post.updatedAt = new Date().toISOString();
      await savePost(post);
      json(response, 200, post);
      return true;
    }
    if (method === "DELETE") {
      await deletePost(clientId, postId).catch((error: Error) => {
        throw fail(/still being made/.test(error.message) ? 409 : 404, error.message);
      });
      json(response, 200, { ok: true });
      return true;
    }
    if (method === "PUT") {
      const raw = await body<{ slides?: Slide[]; caption?: string; hashtags?: string[]; design?: string }>(request);
      const problems = raw.slides === undefined ? [] : editedSlideProblems(raw.slides);
      if (problems.length) throw fail(400, problems.join(" "));
      const edits = { slides: raw.slides, caption: raw.caption, hashtags: raw.hashtags, ...(isDesign(raw.design) ? { design: raw.design } : {}) };
      json(response, 202, Object.assign(enqueue(`Re-render post: ${postId}`, async (log) => (await rerenderPost(clientId, postId, edits, log)).id, undefined, () => postDir(clientId, postId)), { link: clientPage(clientId) }));
      return true;
    }
  }

  // Compare designs on the real post: its first slides drawn in every design (Chrome only, $0); GET lists the ones drawn.
  if ((match = path.match(/^\/api\/clients\/([a-z0-9-]+)\/posts\/([a-z0-9-]+)\/designs$/))) {
    const [, clientId, postId] = match;
    const post = await loadPost(clientId, postId).catch(() => {
      throw fail(404, `No post ${postId}`);
    });
    if (method === "GET") {
      json(response, 200, DESIGN_IDS.filter((id) => existsSync(postDesignPath(clientId, postId, id, 1))));
      return true;
    }
    if (method === "POST") {
      if (post.kind === "reel" || !post.slides?.length) throw fail(400, "Only carousels and images have designs.");
      const client = await find(clientId);
      const job = Object.assign(
        enqueue(
          `Design compare: ${client.name}: ${postId}`,
          async (log) => {
            await renderPostDesigns(await loadClient(clientId), await loadPost(clientId, postId), log);
            return postId;
          },
          undefined,
          () => null,
        ),
        { link: clientPage(clientId) },
      );
      json(response, 202, job);
      return true;
    }
  }

  // The carousel editor's live preview of one slide: HTML only, no Chrome, no AI, $0.
  if ((match = path.match(/^\/api\/clients\/([a-z0-9-]+)\/posts\/([a-z0-9-]+)\/preview$/)) && method === "POST") {
    const [, clientId, postId] = match;
    const raw = await body<{ slide?: Slide; index?: number; total?: number; design?: string }>(request);
    if (!raw.slide || typeof raw.slide !== "object" || typeof raw.slide.layout !== "string") throw fail(400, "Send the slide to preview.");
    const client = await loadClient(clientId);
    const post = await loadPost(clientId, postId);
    const logo = client.brand.logo ? await dataUrl(join(clientDir(clientId), client.brand.logo)) : undefined;
    const file = raw.slide.art?.file;
    const art = file && /^art\/[\w.-]+$/.test(file) ? `/client-files/${clientId}/posts/${postId}/${file}` : undefined;
    const design = isDesign(raw.design) ? raw.design : post.design;
    const html = previewHtml(raw.slide, { client, index: Number(raw.index) || 0, total: Number(raw.total) || 1, logo, art, style: post.artStyle, design });
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    response.end(html);
    return true;
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
