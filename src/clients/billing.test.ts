import { test } from "node:test";
import assert from "node:assert/strict";

import { itemFor, piecesOf, type Piece } from "./billing.ts";
import type { Invoice } from "./invoices.ts";

const client = { name: "Risero", url: "https://diaaeziada.risero.io/" };
const posts = [
  { id: "2026-10-20-1-reel", kind: "reel", ideaId: "2026-10-20-1", projectId: "p-reel", caption: "x", createdAt: "2026-10-20T10:00:00Z", dialect: "egyptian" },
  { id: "2026-10-20-2-carousel", kind: "carousel", ideaId: "2026-10-20-2", caption: "عنوان الكاروسيل\nباقي الكلام", createdAt: "2026-10-20T11:00:00Z", slides: [{}, {}, {}, {}, {}, {}, {}], dialect: "gulf" },
] as never[];
const projects = [
  { id: "p-reel", format: "short", title: "Reel title", createdAt: "2026-10-20T10:00:00Z", render: { seconds: 38.2 }, marketing: { brand: { name: "Risero", url: "https://diaaeziada.risero.io/" } } },
  { id: "p-long", format: "long", title: "Risero: العميل يحجز", createdAt: "2026-10-18T12:00:00Z", render: { seconds: 64.8 }, marketing: { brand: { name: "risero", url: "https://other.example/" } } },
  { id: "p-draft", format: "short", title: "Not rendered", createdAt: "2026-10-18T12:00:00Z", marketing: { brand: { name: "Risero", url: "" } } },
  { id: "p-other", format: "short", title: "Someone else", createdAt: "2026-10-18T12:00:00Z", render: { seconds: 30 }, marketing: { brand: { name: "Other", url: "https://other.example/" } } },
] as never[];
const titles = { "2026-10-20-1": "العميل سأل وسكت؟" };

test("every post and every rendered video of the client is a piece; a reel's video is billed once, through its post", () => {
  const pieces = piecesOf(client, posts, projects, titles);
  assert.deepEqual(pieces.map((p) => `${p.kind}:${p.id}`), ["video:p-long", "reel:2026-10-20-1-reel", "carousel:2026-10-20-2-carousel"]);
});

test("each piece says what it is in detail: format, length or slides, dialect and the day it was made", () => {
  const [video, reel, carousel] = piecesOf(client, posts, projects, titles);
  assert.equal(reel.title, "العميل سأل وسكت؟");
  assert.match(reel.detail, /Instagram reel · 9:16 · 0:38 · Egyptian Arabic · made 2026-10-20/);
  assert.equal(carousel.title, "عنوان الكاروسيل");
  assert.match(carousel.detail, /Instagram carousel · 7 slides · Gulf Arabic · made 2026-10-20/);
  assert.match(video.detail, /YouTube video · 16:9 · 1:05 · made 2026-10-18/);
});

test("a piece's line takes its price from the client's price list, 0 while none is set", () => {
  const piece = { kind: "carousel", id: "c1", title: "T", date: "2026-10-20", detail: "d" } as Piece;
  assert.deepEqual(itemFor(piece, { currency: "USD", reel: 150, carousel: 80, single: 40, video: 250 }), { description: "Carousel: T", detail: "d", quantity: 1, price: 80, source: { kind: "carousel", id: "c1" }, rated: true });
  assert.equal(itemFor(piece, undefined).price, 0);
});

test("priced at API cost: the piece's recorded AI cost, plus the markup, shown on the line", () => {
  const piece = { kind: "reel", id: "r1", title: "T", date: "2026-10-26", at: "", detail: "Instagram reel", cost: 0.9912 } as Piece;
  const rates = { currency: "USD", reel: 150, carousel: 0, single: 0, video: 0, fromCost: true, markup: 0 } as const;
  const item = itemFor(piece, rates);
  assert.equal(item.price, 0.99);
  assert.match(item.detail!, /Instagram reel · API cost \$0\.99$/);
  assert.equal(itemFor(piece, { ...rates, markup: 50 }).price, 1.49);
  const unknown = itemFor({ ...piece, cost: undefined }, rates);
  assert.equal(unknown.price, 0);
  assert.match(unknown.detail!, /API cost not recorded/);
  assert.equal(itemFor(piece, { ...rates, fromCost: false }).price, 150, "a fixed price list ignores the cost");
  assert.doesNotMatch(itemFor(piece, { ...rates, fromCost: false }).detail!, /API cost/, "and never shows it to the client");
});

test("a day's ideas and research is one piece, at the API cost recorded that day", async () => {
  const { planningPieces } = await import("./billing.ts");
  const entries = [
    { at: "2026-10-20T09:00:00", cost: 0.25, step: "ideas" },
    { at: "2026-10-20T15:00:00", cost: 0.151, step: "knowledge" },
    { at: "2026-10-22T10:00:00", cost: 0.869, step: "ideas" },
  ] as never[];
  const pieces = planningPieces(entries);
  assert.deepEqual(pieces.map((p) => [p.kind, p.id, p.date, Math.round(p.cost! * 1000) / 1000]), [["planning", "2026-10-20", "2026-10-20", 0.401], ["planning", "2026-10-22", "2026-10-22", 0.869]]);
  assert.match(pieces[0].title, /Ideas & research/);
  assert.match(pieces[0].detail, /2 AI calls/);
  assert.equal(itemFor(pieces[0], { currency: "USD", reel: 1, carousel: 1, single: 1, video: 1, planning: 0 }).description.startsWith("Planning: "), true);
});

test("everything is collected on one open invoice: per-piece drafts merge into it, new pieces join it, deleted ones leave it", async () => {
  const { collect } = await import("./billing.ts");
  const line = (id: string, price: number, kind = "reel") => ({ description: `R ${id}`, detail: id, quantity: 1, price, source: { kind, id }, rated: true }) as never;
  const inv = (id: string, items: never[], over: Partial<Invoice> = {}) => ({ id, number: id, issueDate: "2026-10-20", status: "draft", payments: [], currency: "USD", items, ...over }) as Invoice;
  const invoices = [
    inv("inv-1", [line("a", 1)], { source: { kind: "reel", id: "a" } }),
    inv("inv-2", [line("b", 2)], { source: { kind: "reel", id: "b" } }),
    inv("inv-3", [line("c", 3)], { source: { kind: "reel", id: "c" }, status: "sent" }),
    inv("inv-4", [line("gone", 4)], { source: { kind: "reel", id: "gone" } }),
  ];
  const wanted = [line("a", 1.5), line("b", 2), line("c", 3), line("new", 5)];
  const { save, remove } = collect(invoices, wanted, "USD", () => inv("inv-9", []));
  const open = save.find((i) => i.collects)!;
  assert.equal(open.id, "inv-1", "the oldest draft becomes the one invoice");
  assert.deepEqual(open.items.map((i) => (i as { source: { id: string } }).source.id), ["a", "b", "new"]);
  assert.equal(open.items[0].price, 1.5, "lines follow the price list");
  assert.equal(open.source, undefined);
  assert.deepEqual(remove.sort(), ["inv-2", "inv-4"], "merged and deleted pieces' drafts go; the sent invoice stays");
  assert.equal(save.some((i) => i.id === "inv-3"), false, "a sent invoice is never touched");
  const again = collect([open, invoices[2]], wanted, "USD", () => inv("inv-9", []));
  assert.deepEqual([again.save.length, again.remove.length], [0, 0], "nothing to do the second time");
});
