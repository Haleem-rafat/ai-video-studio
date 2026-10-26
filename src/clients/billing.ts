import { listProjects } from "../project.ts";
import type { Project } from "../types.ts";
import { CURRENCIES, listInvoices, newInvoice, saveInvoice, type Currency, type Invoice, type InvoiceItem, type PieceKind } from "./invoices.ts";
import { listPosts, loadClient, loadIdeas } from "./store.ts";
import type { Client, Post } from "./types.ts";

/**
 * Billing by the piece: every reel, carousel and single post made for a
 * client, and every video made for it outside the posts, gets its own invoice
 * with a line that says exactly what was delivered. The invoices keep up with
 * the work by themselves: a new piece gets its draft, a draft follows its
 * piece's title and the client's price list, a deleted piece's draft is
 * cancelled. An invoice that was sent or has a payment is never touched.
 */

/** A client's price per piece; unset prices bill 0 until set. */
export type Rates = { currency: Currency } & Record<PieceKind, number>;
export const PIECE_KINDS: PieceKind[] = ["reel", "carousel", "single", "video"];
export const DEFAULT_CURRENCY: Currency = "USD";

export type Piece = { kind: PieceKind; id: string; title: string; date: string; at: string; detail: string };

const LABEL: Record<PieceKind, string> = { reel: "Reel", carousel: "Carousel", single: "Post", video: "Video" };
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

/** The invoice line for a piece, priced from the client's price list. */
export function itemFor(piece: Piece, rates: Rates | undefined): InvoiceItem {
  return { description: `${LABEL[piece.kind]}: ${piece.title}`, detail: piece.detail, quantity: 1, price: rates?.[piece.kind] ?? 0, source: { kind: piece.kind, id: piece.id }, rated: true };
}

/** A draft brought up to date with its piece and the price list, or null when it must stay as it is (sent, paid, cancelled, or nothing changed). */
export function refreshed(invoice: Invoice, item: InvoiceItem, currency: Currency): Invoice | null {
  if (invoice.status !== "draft" || invoice.payments.length) return null;
  const items = invoice.items.map((line) =>
    line.source?.kind === item.source!.kind && line.source.id === item.source!.id ? { ...line, description: item.description, detail: item.detail, ...(line.rated ? { price: item.price } : {}) } : line,
  );
  const allRated = items.every((line) => line.rated);
  const next = { ...invoice, items, currency: allRated ? currency : invoice.currency };
  return JSON.stringify(next) === JSON.stringify(invoice) ? null : next;
}

const keyOf = (source: { kind: string; id: string }) => `${source.kind}:${source.id}`;

/**
 * Brings a client's invoices in line with its work: a draft invoice for each
 * new piece (issued the day it was made), drafts refreshed, drafts of deleted
 * pieces cancelled. Returns what it did.
 */
async function sync(clientId: string): Promise<{ created: number; updated: number; cancelled: number }> {
  const client = await loadClient(clientId);
  const posts = await listPosts(client.id);
  const ideaDays = [...new Set(posts.map((post) => post.ideaId?.slice(0, 10)).filter((day): day is string => Boolean(day)))];
  const titles: Record<string, string> = {};
  for (const day of ideaDays) for (const idea of (await loadIdeas(client.id, day))?.ideas ?? []) titles[idea.id] = idea.hook;
  const pieces = piecesOf(client, posts, (await listProjects()) as ProjectLike[], titles);
  const rates = client.rates;
  const currency = rates?.currency ?? DEFAULT_CURRENCY;

  const invoices = await listInvoices(client.id);
  const bySource = new Map(invoices.filter((invoice) => invoice.source).map((invoice) => [keyOf(invoice.source!), invoice]));
  const done = { created: 0, updated: 0, cancelled: 0 };
  for (const piece of pieces) {
    const item = itemFor(piece, rates);
    const invoice = bySource.get(keyOf(item.source!));
    if (!invoice) {
      const draft = await newInvoice(client, piece.date);
      await saveInvoice({ ...draft, currency, items: [item], source: item.source });
      done.created++;
      continue;
    }
    const next = refreshed(invoice, item, currency);
    if (next) {
      await saveInvoice(next);
      done.updated++;
    }
  }
  const live = new Set(pieces.map((piece) => `${piece.kind}:${piece.id}`));
  for (const invoice of invoices) {
    if (!invoice.source || live.has(keyOf(invoice.source)) || invoice.status !== "draft" || invoice.payments.length) continue;
    await saveInvoice({ ...invoice, status: "cancelled", notes: [invoice.notes, "Cancelled automatically: the piece it billed for was deleted."].filter(Boolean).join("\n") });
    done.cancelled++;
  }
  return done;
}

// One sync per client at a time, so two at once never bill a piece twice.
const running = new Map<string, Promise<unknown>>();
export function syncInvoices(clientId: string): Promise<{ created: number; updated: number; cancelled: number }> {
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
  ) as Record<PieceKind, number>;
  return errors.length ? { errors } : { rates: { currency, ...prices }, errors };
}
