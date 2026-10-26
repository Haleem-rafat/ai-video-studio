import { allocatePayment, CURRENCIES, deleteInvoice, invoicePdf, listInvoices, loadInvoice, newInvoice, readInvoice, readPayment, saveInvoice, statementPdf, summaryOf, viewOf, type Currency } from "../clients/invoices.ts";
import { DEFAULT_CURRENCY, PIECE_KINDS, readRates, syncInvoices } from "../clients/billing.ts";
import { loadClient, saveClient } from "../clients/store.ts";
import type { Ctx } from "./clients.ts";

/**
 * Invoices: /api/clients/:id/invoices… Every route reads and writes only the
 * client named in its path; false when the path is not one of them.
 */
export async function handleInvoices(ctx: Ctx): Promise<boolean> {
  const { path, method, request, response, json, body, fail } = ctx;
  const match = path.match(/^\/api\/clients\/([a-z0-9-]+)\/invoices(?:\/([a-z0-9-]+)(?:\/(pdf|payments)(?:\/([a-z0-9]+))?)?)?$/);
  if (!match) return false;
  const [, clientId, invoiceId, action, paymentId] = match;
  const client = await loadClient(clientId).catch(() => {
    throw fail(404, `No client "${clientId}"`);
  });

  // The price list every piece's invoice is made with; saving it brings the drafts up to date.
  if (invoiceId === "rates" && !action) {
    if (method !== "PUT") return false;
    const { rates, errors } = readRates(await body<Record<string, unknown>>(request));
    if (!rates) throw fail(400, errors.join(" "));
    const fresh = await loadClient(clientId);
    await saveClient({ ...fresh, rates });
    const done = await syncInvoices(clientId);
    json(response, 200, { rates, ...done });
    return true;
  }

  // One sheet with everything owed in a currency, to pay at once.
  if (invoiceId === "statement" && action === "pdf" && method === "GET") {
    const currency = (CURRENCIES as readonly string[]).includes(ctx.url.searchParams.get("currency") ?? "") ? (ctx.url.searchParams.get("currency") as Currency) : (client.rates?.fromCost ? "USD" : (client.rates?.currency ?? "USD"));
    await syncInvoices(clientId);
    const pdf = await statementPdf(await listInvoices(clientId), client, currency);
    response.writeHead(200, { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${client.id}-statement-${currency}.pdf"` });
    response.end(pdf);
    return true;
  }

  // One payment for everything owed: spread over the open invoices, oldest first.
  if (invoiceId === "pay-all" && !action && method === "POST") {
    const raw = await body<Record<string, unknown>>(request);
    const currency = raw.currency as Currency;
    if (!(CURRENCIES as readonly unknown[]).includes(currency)) throw fail(400, "Which currency was it paid in?");
    const { payment, errors } = readPayment(raw);
    if (!payment) throw fail(400, errors.join(" "));
    const invoices = await listInvoices(clientId);
    const { shares, left } = allocatePayment(invoices, payment.amount, currency);
    if (!shares.length) throw fail(400, `Nothing is owed in ${currency}.`);
    if (left > 0) throw fail(400, `That is ${left} ${currency} more than everything owed in ${currency}; record the exact total.`);
    const note = [`Part of one payment of ${payment.amount} ${currency} over ${shares.length} invoice(s)`, payment.note].filter(Boolean).join(" · ");
    for (const [n, share] of shares.entries()) {
      const invoice = invoices.find((entry) => entry.id === share.id)!;
      const part = { ...payment, id: `${payment.id}${n.toString(36)}`, amount: share.amount, note };
      await saveInvoice({ ...invoice, payments: [...invoice.payments, part].sort((a, b) => a.date.localeCompare(b.date)), status: invoice.status === "draft" ? "sent" : invoice.status });
    }
    json(response, 201, { invoices: shares.length, amount: payment.amount, currency });
    return true;
  }

  if (!invoiceId) {
    if (method === "GET") {
      // Every piece made since the last look gets its invoice before the list is shown.
      await syncInvoices(clientId);
      const invoices = await listInvoices(clientId);
      const rates = (await loadClient(clientId)).rates ?? { currency: DEFAULT_CURRENCY, ...Object.fromEntries(PIECE_KINDS.map((kind) => [kind, 0])) };
      json(response, 200, { invoices: invoices.map((invoice) => viewOf(invoice)), summary: summaryOf(invoices), rates });
      return true;
    }
    if (method === "POST") {
      const draft = await newInvoice(client);
      const { invoice, errors } = readInvoice(await body<Record<string, unknown>>(request), draft);
      if (errors.length) throw fail(400, errors.join(" "));
      await saveInvoice(invoice);
      json(response, 201, viewOf(invoice));
      return true;
    }
    return false;
  }

  const invoice = await loadInvoice(clientId, invoiceId).catch(() => {
    throw fail(404, `No invoice ${invoiceId}`);
  });

  if (!action) {
    if (method === "GET") {
      json(response, 200, viewOf(invoice));
      return true;
    }
    if (method === "PUT") {
      const { invoice: next, errors } = readInvoice(await body<Record<string, unknown>>(request), invoice);
      if (errors.length) throw fail(400, errors.join(" "));
      await saveInvoice(next);
      json(response, 200, viewOf(next));
      return true;
    }
    if (method === "DELETE") {
      if (invoice.payments.length) throw fail(409, "This invoice has payments recorded; cancel it instead, so the payments stay on record.");
      await deleteInvoice(clientId, invoiceId);
      json(response, 200, { ok: true });
      return true;
    }
    return false;
  }

  if (action === "pdf" && method === "GET") {
    const pdf = await invoicePdf(invoice, client);
    response.writeHead(200, { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${invoice.number}.pdf"` });
    response.end(pdf);
    return true;
  }

  if (action === "payments" && !paymentId && method === "POST") {
    const { payment, errors } = readPayment(await body<Record<string, unknown>>(request));
    if (!payment) throw fail(400, errors.join(" "));
    const next = { ...invoice, payments: [...invoice.payments, payment].sort((a, b) => a.date.localeCompare(b.date)), status: invoice.status === "draft" ? ("sent" as const) : invoice.status };
    await saveInvoice(next);
    json(response, 201, viewOf(next));
    return true;
  }

  if (action === "payments" && paymentId && method === "DELETE") {
    if (!invoice.payments.some((payment) => payment.id === paymentId)) throw fail(404, "No such payment.");
    const next = { ...invoice, payments: invoice.payments.filter((payment) => payment.id !== paymentId) };
    await saveInvoice(next);
    json(response, 200, viewOf(next));
    return true;
  }
  return false;
}
