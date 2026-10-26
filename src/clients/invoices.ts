import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import puppeteer from "puppeteer-core";

import { clientDir, listClients, localDate } from "./store.ts";
import type { Client } from "./types.ts";

/**
 * Invoices, kept per client in <client>/invoices/<id>.json: what was billed,
 * how to pay, and every payment received. Totals, the balance and whether it
 * is overdue are worked out from them, never typed.
 */

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export const CURRENCIES = ["EGP", "USD", "EUR", "SAR", "AED", "GBP"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const PAYMENT_METHODS = ["bank", "instapay", "vodafone-cash", "cash", "card", "paypal", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const METHOD_LABELS: Record<PaymentMethod, string> = { bank: "Bank transfer", instapay: "InstaPay", "vodafone-cash": "Vodafone Cash", cash: "Cash", card: "Card", paypal: "PayPal", other: "Other" };

/** A piece of work an invoice line bills for: a post, or a video made for the client outside the posts. */
/** "planning": a day's ideas and research for the client, billed at its API cost. */
export type PieceKind = "reel" | "carousel" | "single" | "video" | "planning";
/**
 * `detail`: what exactly was delivered (format, length, slides, dialect, date).
 * `source`: the piece the line bills for, so it stays up to date by itself.
 * `rated`: the price comes from the client's price list (a price typed on the line clears it).
 */
export type InvoiceItem = { description: string; quantity: number; price: number; detail?: string; source?: { kind: PieceKind; id: string }; rated?: boolean };
export type Payment = { id: string; date: string; amount: number; method: PaymentMethod; reference?: string; note?: string };
export type Invoice = {
  id: string;
  number: string;
  clientId: string;
  issueDate: string;
  dueDate: string;
  currency: Currency;
  items: InvoiceItem[];
  /** An amount off the subtotal. */
  discount: number;
  /** Percent, on the subtotal after the discount. */
  taxRate: number;
  billTo: { name: string; email?: string; phone?: string; address?: string };
  /** How to pay: bank account, InstaPay address, wallet number… */
  paymentInfo: string;
  notes: string;
  /** Draft until it's sent; paid and overdue are worked out from the payments and the due date. */
  status: "draft" | "sent" | "cancelled";
  payments: Payment[];
  /** The one piece this invoice bills for, when it was made for it automatically. */
  source?: { kind: PieceKind; id: string };
  createdAt: string;
  updatedAt: string;
};
export type InvoiceState = "draft" | "unpaid" | "partly paid" | "paid" | "overdue" | "cancelled";
export type Totals = { subtotal: number; discount: number; tax: number; total: number; paid: number; balance: number };
export type InvoiceView = Invoice & { totals: Totals; state: InvoiceState };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const money = (n: number) => Math.round(n * 100) / 100;
const text = (value: unknown, max = 2000) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const amount = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : NaN);

export function totals(invoice: Pick<Invoice, "items" | "discount" | "taxRate" | "payments">): Totals {
  const subtotal = money(invoice.items.reduce((sum, item) => sum + item.quantity * item.price, 0));
  const discount = money(Math.min(invoice.discount, subtotal));
  const tax = money(((subtotal - discount) * invoice.taxRate) / 100);
  const total = money(subtotal - discount + tax);
  const paid = money(invoice.payments.reduce((sum, payment) => sum + payment.amount, 0));
  return { subtotal, discount, tax, total, paid, balance: money(total - paid) };
}

export function stateOf(invoice: Invoice, today = localDate()): InvoiceState {
  if (invoice.status === "cancelled") return "cancelled";
  const { total, paid, balance } = totals(invoice);
  if (total > 0 && balance <= 0) return "paid";
  if (invoice.status === "draft" && paid === 0) return "draft";
  if (invoice.dueDate < today) return "overdue";
  return paid > 0 ? "partly paid" : "unpaid";
}

export const viewOf = (invoice: Invoice, today = localDate()): InvoiceView => ({ ...invoice, totals: totals(invoice), state: stateOf(invoice, today) });

/**
 * One payment spread over a client's open invoices in its currency, oldest
 * first, each getting at most what it still owes. `left`: what was more than
 * everything owed.
 */
export function allocatePayment(invoices: Invoice[], amount: number, currency: Currency): { shares: { id: string; amount: number }[]; left: number } {
  const open = invoices
    .filter((invoice) => invoice.currency === currency && invoice.status !== "cancelled" && totals(invoice).balance > 0)
    .sort((a, b) => a.issueDate.localeCompare(b.issueDate) || a.number.localeCompare(b.number));
  const shares: { id: string; amount: number }[] = [];
  let left = money(amount);
  for (const invoice of open) {
    if (left <= 0) break;
    const share = money(Math.min(left, totals(invoice).balance));
    shares.push({ id: invoice.id, amount: share });
    left = money(left - share);
  }
  return { shares, left };
}

/** What a client owes and paid, per currency (invoices in different currencies are never added together). */
export function summaryOf(invoices: Invoice[], today = localDate()) {
  const by: Record<string, { invoiced: number; paid: number; outstanding: number; overdue: number }> = {};
  for (const invoice of invoices) {
    const state = stateOf(invoice, today);
    if (state === "cancelled" || state === "draft") continue;
    const t = totals(invoice);
    const row = (by[invoice.currency] ??= { invoiced: 0, paid: 0, outstanding: 0, overdue: 0 });
    row.invoiced = money(row.invoiced + t.total);
    row.paid = money(row.paid + t.paid);
    row.outstanding = money(row.outstanding + Math.max(0, t.balance));
    if (state === "overdue") row.overdue = money(row.overdue + Math.max(0, t.balance));
  }
  return by;
}

/**
 * Checks an invoice sent by the app, keeping what the app may not change (id,
 * number, client, payments, dates made). Returns the problems, if any.
 */
export function readInvoice(raw: Record<string, unknown>, base: Invoice): { invoice: Invoice; errors: string[] } {
  const errors: string[] = [];
  const items = (Array.isArray(raw.items) ? raw.items : base.items).map((entry, i) => {
    const item = (entry ?? {}) as Record<string, unknown>;
    const quantity = amount(item.quantity);
    const price = amount(item.price);
    const description = text(item.description, 300);
    if (!description) errors.push(`Line ${i + 1} needs a description.`);
    if (!(quantity > 0)) errors.push(`Line ${i + 1}: the quantity must be more than 0.`);
    if (!(price >= 0)) errors.push(`Line ${i + 1}: the price must be 0 or more.`);
    // A line made for a piece keeps its piece and details; a price typed by hand stops following the price list.
    const source = item.source as InvoiceItem["source"];
    const known = source && base.items.find((line) => line.source?.kind === source.kind && line.source.id === source.id);
    if (!known) return { description, quantity, price };
    const detail = text(item.detail, 600) || known.detail;
    return { description, quantity, price, ...(detail ? { detail } : {}), source: known.source, rated: Boolean(known.rated && price === known.price) };
  });
  if (!items.length) errors.push("Add at least one line.");
  const pick = <T>(key: string, check: (value: unknown) => boolean, fallback: T): T => (key in raw ? (check(raw[key]) ? (raw[key] as T) : (errors.push(`${key} is not valid.`), fallback)) : fallback);
  const issueDate = pick("issueDate", (v) => typeof v === "string" && DATE.test(v), base.issueDate);
  const dueDate = pick("dueDate", (v) => typeof v === "string" && DATE.test(v), base.dueDate);
  if (dueDate < issueDate) errors.push("The due date is before the issue date.");
  const discount = "discount" in raw ? amount(raw.discount) : base.discount;
  if (!(discount >= 0)) errors.push("The discount must be 0 or more.");
  const taxRate = "taxRate" in raw ? amount(raw.taxRate) : base.taxRate;
  if (!(taxRate >= 0 && taxRate <= 100)) errors.push("Tax must be between 0 and 100%.");
  const billRaw = (raw.billTo ?? base.billTo) as Record<string, unknown>;
  const billTo = { name: text(billRaw.name, 200), email: text(billRaw.email, 200), phone: text(billRaw.phone, 60), address: text(billRaw.address, 500) };
  if (!billTo.name) errors.push("Who is it billed to?");
  const invoice: Invoice = {
    ...base,
    issueDate,
    dueDate,
    currency: pick("currency", (v) => (CURRENCIES as readonly unknown[]).includes(v), base.currency),
    items,
    discount: discount >= 0 ? discount : 0,
    taxRate: taxRate >= 0 && taxRate <= 100 ? taxRate : 0,
    billTo,
    paymentInfo: "paymentInfo" in raw ? text(raw.paymentInfo) : base.paymentInfo,
    notes: "notes" in raw ? text(raw.notes) : base.notes,
    status: pick("status", (v) => v === "draft" || v === "sent" || v === "cancelled", base.status),
  };
  return { invoice, errors };
}

export function readPayment(raw: Record<string, unknown>, today = localDate()): { payment?: Payment; errors: string[] } {
  const errors: string[] = [];
  const value = amount(raw.amount);
  if (!(value > 0)) errors.push("The amount must be more than 0.");
  const date = typeof raw.date === "string" && DATE.test(raw.date) ? raw.date : "";
  if (!date) errors.push("When was it paid?");
  else if (date > today) errors.push("A payment can't be in the future.");
  const method = (PAYMENT_METHODS as readonly unknown[]).includes(raw.method) ? (raw.method as PaymentMethod) : undefined;
  if (!method) errors.push("How was it paid?");
  if (errors.length) return { errors };
  const reference = text(raw.reference, 200);
  const note = text(raw.note, 500);
  return { payment: { id: `p${Date.now().toString(36)}`, date, amount: money(value), method: method!, ...(reference ? { reference } : {}), ...(note ? { note } : {}) }, errors };
}

const invoicesDir = (clientId: string) => join(clientDir(clientId), "invoices");
const invoicePath = (clientId: string, id: string) => join(invoicesDir(clientId), `${id}.json`);

export async function listInvoices(clientId: string): Promise<Invoice[]> {
  const dir = invoicesDir(clientId);
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir)).filter((file) => file.endsWith(".json"));
  const invoices = await Promise.all(files.map(async (file) => JSON.parse(await readFile(join(dir, file), "utf8")) as Invoice));
  return invoices.sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.number.localeCompare(a.number));
}

export async function loadInvoice(clientId: string, id: string): Promise<Invoice> {
  if (!/^[a-z0-9-]+$/.test(id) || !existsSync(invoicePath(clientId, id))) throw new Error(`No invoice ${id}`);
  return JSON.parse(await readFile(invoicePath(clientId, id), "utf8")) as Invoice;
}

export async function saveInvoice(invoice: Invoice): Promise<void> {
  await mkdir(invoicesDir(invoice.clientId), { recursive: true });
  await writeFile(invoicePath(invoice.clientId, invoice.id), `${JSON.stringify({ ...invoice, updatedAt: new Date().toISOString() }, null, 2)}\n`);
}

export const deleteInvoice = (clientId: string, id: string) => rm(invoicePath(clientId, id), { force: true });

/** "INV-2026-007": numbered across all clients, so no two invoices share a number. */
export function nextNumber(numbers: string[], year: string): string {
  const used = numbers.map((n) => n.match(new RegExp(`^INV-${year}-(\\d+)$`))?.[1]).filter(Boolean).map(Number);
  return `INV-${year}-${String(Math.max(0, ...used) + 1).padStart(3, "0")}`;
}

/** A new draft, billed to the client and with the last invoice's payment details, due in 14 days. */
export async function newInvoice(client: Client, today = localDate()): Promise<Invoice> {
  const all = (await Promise.all((await listClients()).map((entry) => listInvoices(entry.id)))).flat();
  const number = nextNumber(
    all.map((invoice) => invoice.number),
    today.slice(0, 4),
  );
  const last = all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const own = all.find((invoice) => invoice.clientId === client.id);
  const due = new Date(`${today}T12:00:00`);
  due.setDate(due.getDate() + 14);
  const now = new Date().toISOString();
  return {
    id: number.toLowerCase(),
    number,
    clientId: client.id,
    issueDate: today,
    dueDate: localDate(due),
    currency: own?.currency ?? last?.currency ?? (client.language === "ar" ? "EGP" : "USD"),
    items: [{ description: "Instagram content: posts and reels", quantity: 1, price: 0 }],
    discount: 0,
    taxRate: own?.taxRate ?? 0,
    billTo: own?.billTo ?? { name: client.name },
    paymentInfo: last?.paymentInfo ?? "",
    notes: "",
    status: "draft",
    payments: [],
    createdAt: now,
    updatedAt: now,
  };
}

const esc = (value: string) => value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const fmt = (n: number, currency: string) => `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

/** The invoice as a printable A4 page. */
export function invoiceHtml(invoice: Invoice, client: Client): string {
  const t = totals(invoice);
  const state = stateOf(invoice);
  const rows = invoice.items.map((item) => `<tr><td dir="auto">${esc(item.description)}${item.detail ? `<div class="detail">${esc(item.detail)}</div>` : ""}</td><td class="n">${item.quantity}</td><td class="n">${fmt(item.price, invoice.currency)}</td><td class="n">${fmt(item.quantity * item.price, invoice.currency)}</td></tr>`).join("");
  const payments = invoice.payments.length
    ? `<h3>Payments received</h3><table><tr><th>Date</th><th>Method</th><th>Reference</th><th class="n">Amount</th></tr>${invoice.payments.map((p) => `<tr><td>${p.date}</td><td>${METHOD_LABELS[p.method]}</td><td dir="auto">${esc(p.reference ?? "")}</td><td class="n">${fmt(p.amount, invoice.currency)}</td></tr>`).join("")}</table>`
    : "";
  const line = (label: string, value: number, strong = false) => `<tr${strong ? ' class="strong"' : ""}><td>${label}</td><td class="n">${fmt(value, invoice.currency)}</td></tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page{size:A4;margin:18mm}
*{box-sizing:border-box}body{font:13px/1.5 -apple-system,"SF Pro Text","Geeza Pro",sans-serif;color:#1b1b1f;margin:0}
header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px}
h1{font-size:28px;margin:0 0 4px}h3{margin:24px 0 8px;font-size:14px}
.muted{color:#6b6b76}.state{display:inline-block;padding:2px 10px;border-radius:99px;background:#eee;font-size:12px;text-transform:capitalize}
.state.paid{background:#d9f5e3;color:#11683a}.state.overdue{background:#fde2e1;color:#a4161a}
.cols{display:flex;gap:40px;margin-bottom:24px}.cols div{flex:1}
table{width:100%;border-collapse:collapse}th{text-align:start;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#6b6b76;border-bottom:1px solid #ddd;padding:6px 4px}
td{padding:8px 4px;border-bottom:1px solid #eee;vertical-align:top}.n{text-align:end;white-space:nowrap}
.totals{width:300px;margin-inline-start:auto;margin-top:12px}.totals td{border:none;padding:3px 4px}.totals .strong td{font-weight:700;font-size:15px;border-top:1px solid #ccc;padding-top:8px}
.detail{color:#6b6b76;font-size:11.5px;margin-top:2px}
.box{white-space:pre-wrap;background:#f6f6f8;border-radius:8px;padding:12px}
</style></head><body>
<header><div><h1>Invoice</h1><div class="muted">${esc(invoice.number)}</div></div><div style="text-align:end"><span class="state ${state.replace(" ", "-")}">${state}</span><div class="muted" style="margin-top:6px">Issued ${invoice.issueDate}<br>Due ${invoice.dueDate}</div></div></header>
<div class="cols"><div><div class="muted">Billed to</div><strong dir="auto">${esc(invoice.billTo.name)}</strong>${[invoice.billTo.email, invoice.billTo.phone, invoice.billTo.address].filter(Boolean).map((v) => `<div dir="auto">${esc(v!)}</div>`).join("")}</div><div><div class="muted">For</div><strong dir="auto">${esc(client.name)}</strong><div>${esc(client.url)}</div></div></div>
<table><tr><th>Description</th><th class="n">Qty</th><th class="n">Price</th><th class="n">Amount</th></tr>${rows}</table>
<table class="totals">${line("Subtotal", t.subtotal)}${t.discount ? line("Discount", -t.discount) : ""}${invoice.taxRate ? line(`Tax ${invoice.taxRate}%`, t.tax) : ""}${line("Total", t.total, true)}${t.paid ? line("Paid", -t.paid) : ""}${t.paid ? line("Balance due", t.balance, true) : ""}</table>
${payments}
${invoice.paymentInfo ? `<h3>How to pay</h3><div class="box" dir="auto">${esc(invoice.paymentInfo)}</div>` : ""}
${invoice.notes ? `<h3>Notes</h3><div class="box" dir="auto">${esc(invoice.notes)}</div>` : ""}
</body></html>`;
}

/**
 * One sheet for everything a client still owes in one currency: each open
 * invoice with what it was for, and one total, so the client pays once.
 */
export function statementHtml(invoices: Invoice[], client: Client, currency: Currency, today = localDate()): string {
  const open = invoices
    .filter((invoice) => invoice.currency === currency && invoice.status !== "cancelled" && totals(invoice).balance > 0)
    .sort((a, b) => a.issueDate.localeCompare(b.issueDate) || a.number.localeCompare(b.number));
  const sum = (pick: (t: Totals) => number) => money(open.reduce((all, invoice) => all + pick(totals(invoice)), 0));
  const rows = open
    .map((invoice) => {
      const t = totals(invoice);
      const what = invoice.items.map((item) => `<div dir="auto">${esc(item.description)}</div>${item.detail ? `<div class="detail">${esc(item.detail)}</div>` : ""}`).join("");
      return `<tr><td class="nowrap">${esc(invoice.number)}<div class="detail">${invoice.issueDate}</div></td><td>${what}</td><td class="n">${fmt(t.total, currency)}</td><td class="n">${t.paid ? fmt(t.paid, currency) : "—"}</td><td class="n">${fmt(t.balance, currency)}</td></tr>`;
    })
    .join("");
  const latest = [...invoices].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).find((invoice) => invoice.paymentInfo)?.paymentInfo ?? "";
  const billTo = open[0]?.billTo ?? { name: client.name };
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page{size:A4;margin:16mm}
*{box-sizing:border-box}body{font:12px/1.45 -apple-system,"SF Pro Text","Geeza Pro",sans-serif;color:#1b1b1f;margin:0}
header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:22px}
h1{font-size:26px;margin:0 0 4px}h3{margin:22px 0 8px;font-size:13px}.muted{color:#6b6b76}
table{width:100%;border-collapse:collapse}th{text-align:start;font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:#6b6b76;border-bottom:1px solid #ddd;padding:6px 4px}
td{padding:7px 4px;border-bottom:1px solid #eee;vertical-align:top}.n,.nowrap{white-space:nowrap}.n{text-align:end}
.detail{color:#6b6b76;font-size:10.5px;margin-top:1px}
.due{margin:16px 0 0 auto;width:320px;border-top:2px solid #1b1b1f;padding-top:10px;display:flex;justify-content:space-between;font-size:17px;font-weight:700}
.box{white-space:pre-wrap;background:#f6f6f8;border-radius:8px;padding:12px}
</style></head><body>
<header><div><h1>Statement</h1><div class="muted">Everything owed, to pay at once · ${today}</div></div><div style="text-align:end"><div class="muted">Billed to</div><strong dir="auto">${esc(billTo.name)}</strong><div class="muted">${esc(client.url)}</div></div></header>
<table><tr><th>Invoice</th><th>For</th><th class="n">Total</th><th class="n">Paid</th><th class="n">Owed</th></tr>${rows || `<tr><td colspan="5" class="muted">Nothing is owed.</td></tr>`}</table>
<div class="due"><span>Total to pay · ${open.length} invoice${open.length === 1 ? "" : "s"}</span><span>${fmt(sum((t) => t.balance), currency)}</span></div>
${latest ? `<h3>How to pay</h3><div class="box" dir="auto">${esc(latest)}</div>` : ""}
<p class="muted" style="margin-top:18px">One payment of the total settles every invoice above; it is applied to the oldest first.</p>
</body></html>`;
}

export async function statementPdf(invoices: Invoice[], client: Client, currency: Currency): Promise<Uint8Array> {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(statementHtml(invoices, client, currency), { waitUntil: "load" });
    return await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  } finally {
    await browser.close();
  }
}

export async function invoicePdf(invoice: Invoice, client: Client): Promise<Uint8Array> {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(invoiceHtml(invoice, client), { waitUntil: "load" });
    return await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  } finally {
    await browser.close();
  }
}
