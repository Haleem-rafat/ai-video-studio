import { listProjects, projectDir } from "../project.ts";
import { readUsage, type UsageEntry } from "../usage.ts";
import type { Project } from "../types.ts";
import { CURRENCIES, deleteInvoice, listInvoices, newInvoice, saveInvoice, type Currency, type Invoice, type InvoiceItem, type PieceKind } from "./invoices.ts";
import { clientDir, listPosts, loadClient, loadIdeas, localDate, postDir } from "./store.ts";
import type { Client, Post } from "./types.ts";

/**
 * Billing by the piece, on one invoice: every reel, carousel and single post
 * made for a client, every video made for it outside the posts and each day
 * of its ideas and research is a line that says exactly what was delivered,
 * on the client's one open invoice. It keeps up with the work by itself: new
 * pieces join it, lines follow their piece and the price list, a deleted
 * piece's line leaves. An invoice that was sent or has a payment is never
 * touched; the next piece starts a new open invoice.
 */

/**
 * A client's price per piece; unset prices bill 0 until set. `fromCost`: each
 * piece is billed at its recorded AI/API cost (in USD) plus `markup` percent,
 * instead of the fixed prices.
 */
export type Rates = { currency: Currency; fromCost?: boolean; markup?: number; planning?: number } & Record<Exclude<PieceKind, "planning">, number>;
export const PIECE_KINDS: PieceKind[] = ["reel", "carousel", "single", "video", "planning"];
export const DEFAULT_CURRENCY: Currency = "USD";

/** `cost`: the AI/API cost recorded for making it, in USD; unset when none was recorded. */
export type Piece = { kind: PieceKind; id: string; title: string; date: string; at: string; detail: string; cost?: number };

const LABEL: Record<PieceKind, string> = { reel: "Reel", carousel: "Carousel", single: "Post", video: "Video", planning: "Planning" };
const DIALECT: Record<string, string> = { egyptian: "Egyptian Arabic", gulf: "Gulf Arabic" };

const clock = (seconds: number) => {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const host = (url: string | undefined) => {
  try {
    return url ? new URL(url).host.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
};
const firstLine = (text: string) => text.split("\n").map((line) => line.trim()).find(Boolean)?.slice(0, 120) ?? "";

type ProjectLike = Pick<Project, "id" | "format" | "title" | "createdAt"> & { render?: { seconds: number }; marketing?: { brand: { name: string; url: string }; dialect?: string } };

/** Whether a video was made for this client: its brand is the client's, by name or website. */
const madeFor = (client: Pick<Client, "name" | "url">, project: ProjectLike) => {
  const brand = project.marketing?.brand;
  if (!brand) return false;
  return brand.name.trim().toLowerCase() === client.name.trim().toLowerCase() || (host(brand.url) !== "" && host(brand.url) === host(client.url));
};

/**
 * Everything made for a client, oldest first: its posts, and its rendered
 * videos that no post bills for already (a reel's video is billed through its post).
 * `titles`: each idea's hook, by idea id.
 */
export function piecesOf(client: Pick<Client, "name" | "url">, posts: Post[], projects: ProjectLike[], titles: Record<string, string>): Piece[] {
  const byId = new Map(projects.map((project) => [project.id, project]));
  const viaPosts = new Set(posts.map((post) => post.projectId).filter(Boolean));
  const pieces: Piece[] = posts.map((post) => {
    const video = post.projectId ? byId.get(post.projectId) : undefined;
    const dialect = DIALECT[post.dialect ?? video?.marketing?.dialect ?? ""];
    const what =
      post.kind === "reel"
        ? ["Instagram reel · 9:16", video?.render ? clock(video.render.seconds) : ""]
        : post.kind === "carousel"
          ? ["Instagram carousel", post.slides?.length ? `${post.slides.length} slides` : ""]
          : ["Instagram post · single image"];
    const date = post.createdAt.slice(0, 10);
    return {
      kind: post.kind,
      id: post.id,
      title: (post.ideaId && titles[post.ideaId]) || post.topic || firstLine(post.caption) || post.id,
      date,
      at: post.createdAt,
      detail: [...what, dialect, `made ${date}`].filter(Boolean).join(" · "),
    };
  });
  for (const project of projects) {
    if (!project.render || viaPosts.has(project.id) || !madeFor(client, project)) continue;
    const date = project.createdAt.slice(0, 10);
    const dialect = DIALECT[project.marketing?.dialect ?? ""];
    pieces.push({
      kind: "video",
      id: project.id,
      title: project.title,
      date,
      at: project.createdAt,
      detail: [project.format === "long" ? "YouTube video · 16:9" : "Video · 9:16", clock(project.render.seconds), dialect, `made ${date}`].filter(Boolean).join(" · "),
    });
  }
  return pieces.sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * The client's own AI work that no single piece carries (daily ideas, research,
 * knowledge, design previews), one piece per day at the cost recorded that day.
 */
export function planningPieces(entries: UsageEntry[]): Piece[] {
  const days = new Map<string, { cost: number; calls: number }>();
  for (const entry of entries) {
    const date = localDate(new Date(entry.at));
    const day = days.get(date) ?? { cost: 0, calls: 0 };
    day.cost += entry.cost;
    day.calls++;
    days.set(date, day);
  }
  return [...days.entries()]
    .filter(([, day]) => day.cost > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, day]) => ({ kind: "planning", id: date, title: `Ideas & research · ${date}`, date, at: `${date}T23:59:59`, detail: `${day.calls} AI calls: daily ideas, research and planning · ${date}`, cost: day.cost }));
}

/** The invoice line for a piece, priced from the client's price list. */
export function itemFor(piece: Piece, rates: Rates | undefined): InvoiceItem {
  const cents = (n: number) => Math.round(n * 100) / 100;
  const byCost = Boolean(rates?.fromCost);
  const price = byCost ? cents((piece.cost ?? 0) * (1 + (rates?.markup ?? 0) / 100)) : (rates?.[piece.kind] ?? 0);
  // The cost is shown only when it is the price; a fixed price never shows the client what the work cost.
  const detail = byCost ? `${piece.detail} · ${piece.cost === undefined ? "API cost not recorded" : `API cost $${cents(piece.cost).toFixed(2)}`}` : piece.detail;
  return { description: `${LABEL[piece.kind]}: ${piece.title}`, detail, quantity: 1, price, source: { kind: piece.kind, id: piece.id }, rated: true };
}

const keyOf = (source: { kind: string; id: string }) => `${source.kind}:${source.id}`;

/**
 * All the client's work on one invoice: the open one (a draft with no
 * payments) holds a line for every piece no sent or paid invoice bills yet.
 * Older one-piece drafts merge into it, lines follow the price list (a typed
 * price stays), a deleted piece's line leaves, and lines typed by hand stay.
 * `wanted`: every piece's line, oldest first. `fresh`: a new draft, used only
 * when there is no open invoice. Returns the invoices to save and the ids of
 * the drafts merged away.
 */
export function collect(invoices: Invoice[], wanted: InvoiceItem[], currency: Currency, fresh: () => Invoice): { save: Invoice[]; remove: string[] } {
  const editable = (invoice: Invoice) => invoice.status === "draft" && !invoice.payments.length;
  const billed = new Set(invoices.filter((invoice) => !editable(invoice) && invoice.status !== "cancelled").flatMap((invoice) => invoice.items.filter((item) => item.source).map((item) => keyOf(item.source!))));
  const ours = invoices.filter((invoice) => editable(invoice) && (invoice.collects || invoice.source)).sort((a, b) => Number(Boolean(b.collects)) - Number(Boolean(a.collects)) || a.issueDate.localeCompare(b.issueDate) || a.number.localeCompare(b.number));
  const lines = new Map(ours.flatMap((invoice) => invoice.items.filter((item) => item.source).map((item) => [keyOf(item.source!), item] as const)));
  const items = wanted
    .filter((item) => !billed.has(keyOf(item.source!)))
    .map((item) => {
      const line = lines.get(keyOf(item.source!));
      return line ? { ...line, description: item.description, detail: item.detail, ...(line.rated ? { price: item.price } : {}) } : item;
    });
  const base = ours[0];
  const remove = ours.slice(1).map((invoice) => invoice.id);
  const typed = base?.items.filter((item) => !item.source) ?? [];
  if (!items.length && !typed.length) return { save: [], remove: base ? [...remove, base.id] : remove };
  const { source: _piece, ...open } = base ?? fresh();
  const next: Invoice = { ...open, collects: true, items: [...typed, ...items], currency: [...typed, ...items].every((item) => item.rated) ? currency : open.currency };
  return { save: base && JSON.stringify(next) === JSON.stringify(base) ? [] : [next], remove };
}

/**
 * Brings a client's open invoice in line with its work (see collect): issued
 * today whenever its lines change. Returns what it did.
 */
async function sync(clientId: string): Promise<{ created: number; updated: number; merged: number }> {
  const client = await loadClient(clientId);
  const posts = await listPosts(client.id);
  const ideaDays = [...new Set(posts.map((post) => post.ideaId?.slice(0, 10)).filter((day): day is string => Boolean(day)))];
  const titles: Record<string, string> = {};
  for (const day of ideaDays) for (const idea of (await loadIdeas(client.id, day))?.ideas ?? []) titles[idea.id] = idea.hook;
  const pieces = piecesOf(client, posts, (await listProjects()) as ProjectLike[], titles);
  // What each piece cost to make: a post's own usage, plus its reel's video project's.
  for (const piece of pieces) {
    const post = posts.find((entry) => entry.id === piece.id);
    const dirs = piece.kind === "video" ? [projectDir(piece.id)] : [postDir(client.id, piece.id), ...(post?.projectId ? [projectDir(post.projectId)] : [])];
    const entries = (await Promise.all(dirs.map((dir) => readUsage(dir)))).flat();
    if (entries.length) piece.cost = entries.reduce((sum, entry) => sum + entry.cost, 0);
  }
  // The client's own AI work (ideas, research) is billed by the day, at its cost.
  pieces.push(...planningPieces(await readUsage(clientDir(client.id))));
  pieces.sort((a, b) => a.at.localeCompare(b.at));
  const rates = client.rates;
  // API costs are in USD, so a price list billing them is too.
  const currency = rates?.fromCost ? "USD" : (rates?.currency ?? DEFAULT_CURRENCY);

  const invoices = await listInvoices(client.id);
  const draft = await newInvoice(client);
  let created = 0;
  const { save, remove } = collect(invoices, pieces.map((piece) => itemFor(piece, rates)), currency, () => (created++, draft));
  for (const id of remove) await deleteInvoice(client.id, id);
  for (const invoice of save) await saveInvoice({ ...invoice, issueDate: draft.issueDate, dueDate: draft.dueDate });
  return { created, updated: save.length - created, merged: remove.length };
}

// One sync per client at a time, so two at once never bill a piece twice.
const running = new Map<string, Promise<unknown>>();
export function syncInvoices(clientId: string): Promise<{ created: number; updated: number; merged: number }> {
  const next = (running.get(clientId) ?? Promise.resolve()).catch(() => undefined).then(() => sync(clientId));
  running.set(clientId, next);
  return next;
}

/** A price list from the Invoices tab, or the reasons it can't be used. */
export function readRates(raw: Record<string, unknown>): { rates?: Rates; errors: string[] } {
  const errors: string[] = [];
  const currency = raw.currency as Currency;
  if (!(CURRENCIES as readonly unknown[]).includes(currency)) errors.push("Pick a currency.");
  const prices = Object.fromEntries(
    PIECE_KINDS.map((kind) => {
      const value = typeof raw[kind] === "number" ? (raw[kind] as number) : Number(raw[kind] ?? 0);
      if (!(Number.isFinite(value) && value >= 0)) errors.push(`The ${kind} price must be 0 or more.`);
      return [kind, Math.round(value * 100) / 100];
    }),
  ) as Record<Exclude<PieceKind, "planning">, number> & { planning: number };
  const fromCost = raw.fromCost === true;
  const markup = Number(raw.markup ?? 0);
  if (!(Number.isFinite(markup) && markup >= 0 && markup <= 1000)) errors.push("The markup must be between 0 and 1000%.");
  return errors.length ? { errors } : { rates: { currency: fromCost ? "USD" : currency, ...prices, fromCost, markup: Math.round(markup * 100) / 100 }, errors };
}
