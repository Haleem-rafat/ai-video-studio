import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Client } from "./types.ts";
import type { Invoice } from "./invoices.ts";

process.env.CLIENTS_DIR = mkdtempSync(join(tmpdir(), "invoices-"));
const { invoiceHtml, listInvoices, newInvoice, nextNumber, readInvoice, readPayment, saveInvoice, stateOf, summaryOf, totals } = await import("./invoices.ts");
const store = await import("./store.ts");

const client = { id: "risero", name: "Risero", url: "https://risero.io", language: "ar" } as unknown as Client;

test("totals: discount off the subtotal, tax on what's left, payments off the total", () => {
  const t = totals({ items: [{ description: "a", quantity: 2, price: 1000 }, { description: "b", quantity: 1, price: 500.5 }], discount: 500.5, taxRate: 14, payments: [{ id: "1", date: "2026-10-01", amount: 1000, method: "cash" }] });
  assert.deepEqual(t, { subtotal: 2500.5, discount: 500.5, tax: 280, total: 2280, paid: 1000, balance: 1280 });
});

test("state: draft, unpaid, partly paid, overdue, paid and cancelled", async () => {
  await store.saveClient(client);
  const base = { ...(await newInvoice(client, "2026-10-22")), items: [{ description: "x", quantity: 1, price: 100 }] };
  assert.equal(stateOf(base, "2026-10-22"), "draft");
  const sent = { ...base, status: "sent" as const };
  assert.equal(stateOf(sent, "2026-10-22"), "unpaid");
  assert.equal(stateOf(sent, "2026-11-30"), "overdue");
  const part = { ...sent, payments: [{ id: "p", date: "2026-10-22", amount: 40, method: "instapay" as const }] };
  assert.equal(stateOf(part, "2026-10-22"), "partly paid");
  assert.equal(stateOf({ ...part, payments: [...part.payments, { id: "q", date: "2026-10-23", amount: 60, method: "cash" as const }] }, "2026-12-01"), "paid");
  assert.equal(stateOf({ ...sent, status: "cancelled" }, "2026-12-01"), "cancelled");
});

test("numbers run across all clients and years restart", async () => {
  assert.equal(nextNumber([], "2026"), "INV-2026-001");
  assert.equal(nextNumber(["INV-2026-001", "INV-2026-009", "INV-2025-044"], "2026"), "INV-2026-010");
  const first = await newInvoice(client, "2026-10-22");
  await saveInvoice(first);
  await store.saveClient({ ...client, id: "other", name: "Other" });
  const second = await newInvoice({ ...client, id: "other", name: "Other" }, "2026-10-22");
  assert.notEqual(first.number, second.number);
  assert.equal(first.dueDate, "2026-11-05");
  assert.equal((await listInvoices("risero")).length, 1);
});

test("an edit is checked and can't change the number, client or payments", async () => {
  const base = await newInvoice(client, "2026-10-22");
  const { invoice, errors } = readInvoice({ number: "HACK", clientId: "x", payments: [{}], items: [{ description: "Carousels", quantity: "4", price: "750" }], taxRate: 14, billTo: { name: "Diaa" } }, base);
  assert.deepEqual(errors, []);
  assert.equal(invoice.number, base.number);
  assert.equal(invoice.clientId, "risero");
  assert.deepEqual(invoice.payments, []);
  assert.deepEqual(invoice.items, [{ description: "Carousels", quantity: 4, price: 750 }]);
  const bad = readInvoice({ items: [{ description: "", quantity: 0, price: -1 }], dueDate: "2026-01-01", taxRate: 120, billTo: { name: "" } }, base).errors;
  assert.equal(bad.length, 6);
});

test("a payment needs an amount, a past date and a method", () => {
  assert.equal(readPayment({ amount: "500", date: "2026-10-20", method: "instapay", reference: " 123 " }, "2026-10-22").payment?.reference, "123");
  assert.equal(readPayment({ amount: 0, date: "2026-10-30", method: "gold" }, "2026-10-22").errors.length, 3);
});

test("the summary adds per currency and leaves out drafts and cancelled invoices", async () => {
  const base = await newInvoice(client, "2026-10-01");
  const sent = (n: number, currency: "EGP" | "USD", extra = {}) => ({ ...base, id: `i${n}`, status: "sent" as const, currency, items: [{ description: "x", quantity: 1, price: 100 }], ...extra });
  const summary = summaryOf([sent(1, "EGP"), sent(2, "EGP", { payments: [{ id: "p", date: "2026-10-02", amount: 30, method: "cash" }] }), sent(3, "USD"), { ...sent(4, "EGP"), status: "draft" }, { ...sent(5, "EGP"), status: "cancelled" }], "2026-10-30");
  assert.deepEqual(summary.EGP, { invoiced: 200, paid: 30, outstanding: 170, overdue: 170 });
  assert.equal(summary.USD.invoiced, 100);
});

test("the printed invoice escapes what was typed and shows the balance", async () => {
  const invoice = { ...(await newInvoice(client, "2026-10-22")), items: [{ description: "<b>posts</b>", quantity: 1, price: 100 }], payments: [{ id: "p", date: "2026-10-22", amount: 40, method: "bank" as const }], paymentInfo: "InstaPay: risero@instapay" };
  const html = invoiceHtml(invoice, client);
  assert.ok(html.includes("&lt;b&gt;posts"));
  assert.match(html, /Balance due/);
  assert.match(html, /60\.00 EGP/);
  assert.match(html, /risero@instapay/);
});

test("one payment is spread over the open invoices, oldest first, never more than each owes", async () => {
  const { allocatePayment } = await import("./invoices.ts");
  const make = (id: string, issueDate: string, price: number, over: Partial<Invoice> = {}) =>
    ({ id, number: id, issueDate, dueDate: issueDate, currency: "USD", items: [{ description: "x", quantity: 1, price }], discount: 0, taxRate: 0, payments: [], status: "draft", ...over }) as Invoice;
  const invoices = [
    make("c", "2026-10-22", 1.0),
    make("a", "2026-10-18", 0.9),
    make("b", "2026-10-20", 0.5, { payments: [{ id: "p", date: "2026-10-21", amount: 0.2, method: "cash" }] }),
    make("x", "2026-10-19", 9, { status: "cancelled" }),
    make("z", "2026-10-17", 0),
  ];
  assert.deepEqual(allocatePayment(invoices, 1.5, "USD"), { shares: [{ id: "a", amount: 0.9 }, { id: "b", amount: 0.3 }, { id: "c", amount: 0.3 }], left: 0 });
  assert.deepEqual(allocatePayment(invoices, 5, "USD").left, 2.8, "more than everything owed leaves the rest unallocated");
  assert.deepEqual(allocatePayment(invoices, 1, "EGP"), { shares: [], left: 1 }, "only invoices in the payment's currency");
});

test("one sheet lists every open invoice with its details and one total to pay", async () => {
  const { statementHtml } = await import("./invoices.ts");
  const make = (id: string, price: number, over: Partial<Invoice> = {}) =>
    ({ id, number: id.toUpperCase(), issueDate: "2026-10-20", dueDate: "2026-11-03", currency: "USD", items: [{ description: `Reel ${id}`, detail: `detail ${id}`, quantity: 1, price }], discount: 0, taxRate: 0, payments: [], status: "draft", billTo: { name: "Risero" }, paymentInfo: "InstaPay: x@instapay", createdAt: "2026-10-20T10:00:00Z", updatedAt: "2026-10-20T10:00:00Z", ...over }) as Invoice;
  const html = statementHtml([make("inv-1", 0.99), make("inv-2", 0.5, { payments: [{ id: "p", date: "2026-10-21", amount: 0.2, method: "cash" }] }), make("inv-3", 9, { status: "cancelled" }), make("inv-4", 2, { currency: "EGP" })], { name: "Risero", url: "https://risero.io" } as Client, "USD", "2026-10-26");
  assert.match(html, /INV-1/);
  assert.match(html, /detail inv-1/);
  assert.match(html, /INV-2/);
  assert.doesNotMatch(html, /INV-3/, "cancelled invoices are left off");
  assert.doesNotMatch(html, /INV-4/, "other currencies are left off");
  assert.match(html, /1\.29 USD/, "the total due is 0.99 + 0.30");
  assert.match(html, /InstaPay: x@instapay/);
});
