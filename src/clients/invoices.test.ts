import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Client } from "./types.ts";

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
