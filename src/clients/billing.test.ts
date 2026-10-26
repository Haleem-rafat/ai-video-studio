import { test } from "node:test";
import assert from "node:assert/strict";

import { itemFor, piecesOf, refreshed, type Piece } from "./billing.ts";
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

const draft = (over: Partial<Invoice> = {}) =>
  ({ status: "draft", payments: [], currency: "USD", items: [{ description: "Carousel: old", detail: "old", quantity: 1, price: 0, source: { kind: "carousel", id: "c1" }, rated: true }], ...over }) as Invoice;

test("a draft follows its piece and the price list; a price typed by hand or a sent or paid invoice is never changed", () => {
  const item = itemFor({ kind: "carousel", id: "c1", title: "new", date: "2026-10-20", detail: "new detail" } as Piece, { currency: "USD", reel: 0, carousel: 80, single: 0, video: 0 });
  const next = refreshed(draft(), item, "USD")!;
  assert.equal(next.items[0].price, 80);
  assert.equal(next.items[0].description, "Carousel: new");
  const typed = draft({ items: [{ ...draft().items[0], price: 99, rated: false }] });
  assert.equal(refreshed(typed, item, "USD")!.items[0].price, 99);
  assert.equal(refreshed(draft({ status: "sent" }), item, "USD"), null);
  assert.equal(refreshed(draft({ payments: [{ id: "p", date: "2026-10-21", amount: 5, method: "cash" }] }), item, "USD"), null);
  assert.equal(refreshed(refreshed(draft(), item, "USD")!, item, "USD"), null, "nothing to change the second time");
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
