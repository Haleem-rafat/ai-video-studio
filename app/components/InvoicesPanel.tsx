import { useEffect, useState } from "react";
import { BanknoteIcon, FileDownIcon, FileTextIcon, PencilIcon, PlusIcon, ReceiptIcon, Trash2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { api, invoicePdfUrl, statementPdfUrl, type Client, type Currency, type Invoice, type InvoiceState, type InvoiceView, type PaymentMethod, type Rates } from "../api.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Confirm, Field } from "./shared.tsx";
import { when } from "./PostAt.tsx";

// The same lists as src/clients/invoices.ts (which the app can't import: it draws PDFs with Chrome).
const CURRENCIES: Currency[] = ["EGP", "USD", "EUR", "SAR", "AED", "GBP"];
const METHODS: Record<PaymentMethod, string> = { bank: "Bank transfer", instapay: "InstaPay", "vodafone-cash": "Vodafone Cash", cash: "Cash", card: "Card", paypal: "PayPal", other: "Other" };
const STATE_TONE: Record<InvoiceState, "default" | "secondary" | "destructive" | "outline"> = { draft: "outline", unpaid: "secondary", "partly paid": "secondary", paid: "default", overdue: "destructive", cancelled: "outline" };

const money = (n: number, currency: string) => `${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

type Summary = Record<string, { invoiced: number; paid: number; outstanding: number; overdue: number }>;

/** A client's invoices: what was billed, how to pay, every payment received, and what's still owed. */
export function InvoicesPanel({ client }: { client: Client }) {
  const [invoices, setInvoices] = useState<InvoiceView[] | null>(null);
  const [summary, setSummary] = useState<Summary>({});
  const [editing, setEditing] = useState<InvoiceView | null>(null);
  const [paying, setPaying] = useState<InvoiceView | null>(null);
  const [rates, setRates] = useState<Rates | null>(null);
  const [payingAll, setPayingAll] = useState<Currency | null>(null);
  // Everything still owed, per currency, drafts included: what one sheet and one payment cover.
  const owed: Record<string, { amount: number; count: number }> = {};
  for (const invoice of invoices ?? []) {
    if (invoice.state === "cancelled" || invoice.totals.balance <= 0) continue;
    const row = (owed[invoice.currency] ??= { amount: 0, count: 0 });
    row.amount = Math.round((row.amount + invoice.totals.balance) * 100) / 100;
    row.count++;
  }

  const refresh = () =>
    api
      .invoices(client.id)
      .then(({ invoices, summary, rates }) => {
        setInvoices(invoices);
        setSummary(summary);
        setRates((current) => current ?? rates);
      })
      .catch((error: Error) => toast.error(error.message));
  useEffect(() => void refresh(), [client.id]);

  const create = () =>
    api
      .createInvoice(client.id)
      .then((invoice) => {
        setEditing(invoice);
        void refresh();
      })
      .catch((error: Error) => toast.error(error.message));

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={create}>
          <PlusIcon /> New invoice
        </Button>
        <span className="text-xs text-muted-foreground">Every reel, carousel, post and video gets its own invoice automatically. Numbered across all clients; paid and overdue are worked out from the payments and due dates.</span>
      </div>

      {Object.entries(owed).map(([currency, row]) => (
        <div key={currency} className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/40 p-3">
          <div className="grid">
            <span className="text-xs text-muted-foreground">Owed on {row.count} invoice{row.count === 1 ? "" : "s"}</span>
            <span className="font-mono text-lg font-medium">{money(row.amount, currency)}</span>
          </div>
          <div className="ms-auto flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" asChild>
              <a href={statementPdfUrl(client.id, currency)}>
                <FileTextIcon /> One sheet (PDF)
              </a>
            </Button>
            <Button size="sm" onClick={() => setPayingAll(currency as Currency)}>
              <BanknoteIcon /> Pay all at once
            </Button>
          </div>
        </div>
      ))}

      {rates && <PriceList clientId={client.id} rates={rates} onChange={setRates} onSaved={refresh} />}

      {Object.entries(summary).map(([currency, row]) => (
        <div key={currency} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              ["Invoiced", row.invoiced, ""],
              ["Paid", row.paid, "text-emerald-600 dark:text-emerald-400"],
              ["Outstanding", row.outstanding, ""],
              ["Overdue", row.overdue, row.overdue ? "text-destructive" : ""],
            ] as const
          ).map(([label, value, tone]) => (
            <div key={label} className="rounded-xl border p-3">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className={`font-mono text-lg ${tone}`}>{money(value, currency)}</div>
            </div>
          ))}
        </div>
      ))}

      {invoices && !invoices.length && (
        <div className="grid place-items-center gap-2 rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
          <ReceiptIcon className="size-6" />
          No invoices for {client.name} yet.
        </div>
      )}

      <div className="grid gap-2">
        {invoices?.map((invoice) => (
          <div key={invoice.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border p-3">
            <div className="grid min-w-36">
              <span className="font-mono text-sm font-medium">{invoice.number}</span>
              <span className="text-xs text-muted-foreground">
                Issued {when(`${invoice.issueDate}T12:00`, false)} · due {when(`${invoice.dueDate}T12:00`, false)}
              </span>
            </div>
            {invoice.source && (
              <div className="grid min-w-0 flex-1 basis-60">
                <span className="truncate text-sm" dir="auto">
                  {invoice.items[0]?.description}
                </span>
                <span className="truncate text-xs text-muted-foreground">{invoice.items[0]?.detail}</span>
              </div>
            )}
            <Badge variant={STATE_TONE[invoice.state]} className="capitalize">
              {invoice.state}
            </Badge>
            <div className="grid text-sm">
              <span className="font-mono">{money(invoice.totals.total, invoice.currency)}</span>
              <span className="text-xs text-muted-foreground">
                paid {money(invoice.totals.paid, invoice.currency)} · owed <span className="font-mono">{money(Math.max(0, invoice.totals.balance), invoice.currency)}</span>
              </span>
            </div>
            <div className="ms-auto flex flex-wrap gap-1.5">
              {invoice.state !== "cancelled" && invoice.totals.balance > 0 && (
                <Button size="sm" variant="outline" onClick={() => setPaying(invoice)}>
                  <BanknoteIcon /> Record payment
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setEditing(invoice)}>
                <PencilIcon /> Open
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a href={invoicePdfUrl(client.id, invoice.id)}>
                  <FileDownIcon /> PDF
                </a>
              </Button>
              {invoice.payments.length === 0 && (
                <Confirm
                  trigger={
                    <Button size="sm" variant="ghost" className="text-destructive" aria-label="Delete invoice">
                      <Trash2Icon />
                    </Button>
                  }
                  title={`Delete ${invoice.number}?`}
                  description="It has no payments, so it is deleted for good. To keep a record of a sent invoice, open it and cancel it instead."
                  action="Delete invoice"
                  onConfirm={() =>
                    api
                      .deleteInvoice(client.id, invoice.id)
                      .then(() => (toast.success("Invoice deleted"), refresh()))
                      .catch((error: Error) => toast.error(error.message))
                  }
                />
              )}
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <InvoiceDialog
          key={editing.id}
          clientId={client.id}
          invoice={editing}
          onClose={() => setEditing(null)}
          onSaved={(next) => {
            setEditing(next);
            void refresh();
          }}
          onPay={() => setPaying(editing)}
        />
      )}
      {payingAll && owed[payingAll] && (
        <PayAllDialog
          clientId={client.id}
          currency={payingAll}
          owed={owed[payingAll]}
          onClose={() => setPayingAll(null)}
          onSaved={() => {
            setPayingAll(null);
            void refresh();
          }}
        />
      )}
      {paying && (
        <PaymentDialog
          clientId={client.id}
          invoice={paying}
          onClose={() => setPaying(null)}
          onSaved={(next) => {
            setPaying(null);
            if (editing?.id === next.id) setEditing(next);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

const PIECES: { kind: "reel" | "carousel" | "single" | "video"; label: string }[] = [
  { kind: "reel", label: "Reel" },
  { kind: "carousel", label: "Carousel" },
  { kind: "single", label: "Single post" },
  { kind: "video", label: "Video" },
];

/** The client's price per piece: every piece's invoice is priced from it, and saving it updates the drafts. */
function PriceList({ clientId, rates, onChange, onSaved }: { clientId: string; rates: Rates; onChange: (rates: Rates) => void; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const save = () => {
    setBusy(true);
    api
      .saveRates(clientId, rates)
      .then(({ updated, created }) => {
        toast.success(`Prices saved${updated || created ? ` · ${updated} draft(s) updated${created ? `, ${created} new` : ""}` : ""}`);
        onSaved();
      })
      .catch((error: Error) => toast.error(error.message))
      .finally(() => setBusy(false));
  };
  return (
    <div className="grid gap-3 rounded-xl border p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-0.5">
          <span className="text-sm font-medium">Price per piece</span>
          <span className="text-xs text-muted-foreground">Draft invoices follow these prices. Sent or paid invoices never change, and a price typed on a line stays.</span>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={Boolean(rates.fromCost)} onCheckedChange={(fromCost) => onChange({ ...rates, fromCost, ...(fromCost ? { currency: "USD" as Currency } : {}) })} />
          Price = API cost
        </label>
      </div>
      {rates.fromCost ? (
        <div className="grid gap-2 sm:grid-cols-[12rem_auto] sm:items-end">
          <Field label="Markup %" detail="0 bills the exact cost">
            <Input type="number" min={0} step="any" value={rates.markup ?? 0} onChange={(event) => onChange({ ...rates, markup: event.target.value === "" ? 0 : Number(event.target.value) })} />
          </Field>
          <Button onClick={save} disabled={busy} className="w-fit">
            Save prices
          </Button>
          <span className="col-span-full text-xs text-muted-foreground">Each piece is billed at the AI/API cost recorded while making it (script, voice, pictures), in USD, shown on its line.</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(4,1fr)_7rem_auto] sm:items-end">
          {PIECES.map(({ kind, label }) => (
            <Field key={kind} label={label}>
              <Input type="number" min={0} step="any" value={rates[kind]} onChange={(event) => onChange({ ...rates, [kind]: event.target.value === "" ? 0 : Number(event.target.value) })} />
            </Field>
          ))}
          <Field label="Currency">
            <Select value={rates.currency} onValueChange={(currency) => onChange({ ...rates, currency: currency as Currency })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((currency) => (
                  <SelectItem key={currency} value={currency}>
                    {currency}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Button onClick={save} disabled={busy}>
            Save prices
          </Button>
        </div>
      )}
    </div>
  );
}

/** One invoice: who it's billed to, the lines, discount and tax, how to pay, and its payments. */
function InvoiceDialog({ clientId, invoice, onClose, onSaved, onPay }: { clientId: string; invoice: InvoiceView; onClose: () => void; onSaved: (invoice: InvoiceView) => void; onPay: () => void }) {
  const [draft, setDraft] = useState<Invoice>(invoice);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Invoice>) => setDraft((current) => ({ ...current, ...patch }));
  const setItem = (i: number, patch: Partial<Invoice["items"][number]>) => set({ items: draft.items.map((item, n) => (n === i ? { ...item, ...patch } : item)) });

  const subtotal = draft.items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.price) || 0), 0);
  const discount = Math.min(Number(draft.discount) || 0, subtotal);
  const tax = ((subtotal - discount) * (Number(draft.taxRate) || 0)) / 100;
  const total = subtotal - discount + tax;
  const paid = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const changed = JSON.stringify(draft) !== JSON.stringify((({ totals: _t, state: _s, ...rest }) => rest)(invoice));

  const save = () => {
    setBusy(true);
    const { billTo, issueDate, dueDate, currency, items, discount, taxRate, paymentInfo, notes, status } = draft;
    api
      .saveInvoice(clientId, invoice.id, { billTo, issueDate, dueDate, currency, items, discount, taxRate, paymentInfo, notes, status })
      .then((next) => {
        toast.success("Invoice saved");
        onSaved(next);
      })
      .catch((error: Error) => toast.error(error.message))
      .finally(() => setBusy(false));
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="font-mono">{invoice.number}</span>
            <Badge variant={STATE_TONE[invoice.state]} className="capitalize">
              {invoice.state}
            </Badge>
          </DialogTitle>
          <DialogDescription>Created {when(invoice.createdAt)} · last changed {when(invoice.updatedAt)}</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid max-h-[70vh] gap-4 overflow-auto">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Billed to">
              <Input value={draft.billTo.name} dir="auto" onChange={(event) => set({ billTo: { ...draft.billTo, name: event.target.value } })} />
            </Field>
            <Field label="Email">
              <Input value={draft.billTo.email ?? ""} type="email" onChange={(event) => set({ billTo: { ...draft.billTo, email: event.target.value } })} />
            </Field>
            <Field label="Phone">
              <Input value={draft.billTo.phone ?? ""} dir="ltr" onChange={(event) => set({ billTo: { ...draft.billTo, phone: event.target.value } })} />
            </Field>
            <Field label="Address">
              <Input value={draft.billTo.address ?? ""} dir="auto" onChange={(event) => set({ billTo: { ...draft.billTo, address: event.target.value } })} />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Issued">
              <Input type="date" value={draft.issueDate} onChange={(event) => set({ issueDate: event.target.value })} />
            </Field>
            <Field label="Due">
              <Input type="date" value={draft.dueDate} onChange={(event) => set({ dueDate: event.target.value })} />
            </Field>
            <Field label="Currency">
              <Select value={draft.currency} onValueChange={(value) => set({ currency: value as Currency })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((currency) => (
                    <SelectItem key={currency} value={currency}>
                      {currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={draft.status} onValueChange={(value) => set({ status: value as Invoice["status"] })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-2">
            <span className="text-sm font-medium">Lines</span>
            {draft.items.map((item, i) => (
              <div key={i} className="grid grid-cols-[1fr_5rem_7rem_auto] items-center gap-2">
                <div className="grid gap-1">
                  <Input value={item.description} dir="auto" placeholder="What was done" onChange={(event) => setItem(i, { description: event.target.value })} />
                  {(item.detail || item.rated) && (
                    <span className="px-1 text-xs text-muted-foreground">
                      {item.detail}
                      {item.rated && <> · price from the price list</>}
                    </span>
                  )}
                </div>
                <Input type="number" min={0} step="any" value={item.quantity} aria-label="Quantity" onChange={(event) => setItem(i, { quantity: event.target.value === "" ? 0 : Number(event.target.value) })} />
                <Input type="number" min={0} step="any" value={item.price} aria-label="Price" onChange={(event) => setItem(i, { price: event.target.value === "" ? 0 : Number(event.target.value) })} />
                <Button size="icon" variant="ghost" aria-label="Remove line" disabled={draft.items.length === 1} onClick={() => set({ items: draft.items.filter((_, n) => n !== i) })}>
                  <XIcon />
                </Button>
              </div>
            ))}
            <Button size="sm" variant="outline" className="w-fit" onClick={() => set({ items: [...draft.items, { description: "", quantity: 1, price: 0 }] })}>
              <PlusIcon /> Add line
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_16rem]">
            <Field label={`Discount (${draft.currency})`}>
              <Input type="number" min={0} step="any" value={draft.discount} onChange={(event) => set({ discount: Number(event.target.value) || 0 })} />
            </Field>
            <Field label="Tax %">
              <Input type="number" min={0} max={100} step="any" value={draft.taxRate} onChange={(event) => set({ taxRate: Number(event.target.value) || 0 })} />
            </Field>
            <dl className="grid grid-cols-2 gap-x-3 self-end rounded-lg bg-muted/50 p-2.5 text-sm">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="text-end font-mono">{money(subtotal, draft.currency)}</dd>
              {discount > 0 && (
                <>
                  <dt className="text-muted-foreground">Discount</dt>
                  <dd className="text-end font-mono">−{money(discount, draft.currency)}</dd>
                </>
              )}
              {tax > 0 && (
                <>
                  <dt className="text-muted-foreground">Tax</dt>
                  <dd className="text-end font-mono">{money(tax, draft.currency)}</dd>
                </>
              )}
              <dt className="font-medium">Total</dt>
              <dd className="text-end font-mono font-medium">{money(total, draft.currency)}</dd>
              <dt className="text-muted-foreground">Paid</dt>
              <dd className="text-end font-mono">{money(paid, draft.currency)}</dd>
              <dt className="font-medium">Owed</dt>
              <dd className="text-end font-mono font-medium">{money(Math.max(0, total - paid), draft.currency)}</dd>
            </dl>
          </div>

          <Field label="How to pay" detail="bank account, InstaPay address, wallet number… (kept for the next invoice)">
            <Textarea value={draft.paymentInfo} dir="auto" rows={3} onChange={(event) => set({ paymentInfo: event.target.value })} />
          </Field>
          <Field label="Notes">
            <Textarea value={draft.notes} dir="auto" rows={2} onChange={(event) => set({ notes: event.target.value })} />
          </Field>

          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Payments</span>
              {invoice.state !== "cancelled" && invoice.totals.balance > 0 && (
                <Button size="sm" variant="outline" className="ms-auto" onClick={onPay}>
                  <BanknoteIcon /> Record payment
                </Button>
              )}
            </div>
            {!invoice.payments.length && <p className="text-sm text-muted-foreground">None yet.</p>}
            {invoice.payments.map((payment) => (
              <div key={payment.id} className="flex flex-wrap items-center gap-x-3 rounded-lg border px-3 py-2 text-sm">
                <span>{when(`${payment.date}T12:00`, false)}</span>
                <Badge variant="outline">{METHODS[payment.method]}</Badge>
                {payment.reference && <span className="font-mono text-xs text-muted-foreground">{payment.reference}</span>}
                {payment.note && (
                  <span className="text-xs text-muted-foreground" dir="auto">
                    {payment.note}
                  </span>
                )}
                <span className="ms-auto font-mono">{money(payment.amount, invoice.currency)}</span>
                <Confirm
                  trigger={
                    <Button size="icon" variant="ghost" aria-label="Remove payment">
                      <Trash2Icon />
                    </Button>
                  }
                  title="Remove this payment?"
                  description="Only if it was recorded by mistake: the invoice goes back to owing this amount."
                  action="Remove payment"
                  onConfirm={() =>
                    api
                      .deletePayment(clientId, invoice.id, payment.id)
                      .then((next) => (toast.success("Payment removed"), onSaved(next)))
                      .catch((error: Error) => toast.error(error.message))
                  }
                />
              </div>
            ))}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" asChild>
            <a href={invoicePdfUrl(clientId, invoice.id)}>
              <FileDownIcon /> PDF
            </a>
          </Button>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button disabled={!changed || busy} onClick={save}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Records money received against an invoice; the amount starts at what's still owed. */
function PaymentDialog({ clientId, invoice, onClose, onSaved }: { clientId: string; invoice: InvoiceView; onClose: () => void; onSaved: (invoice: InvoiceView) => void }) {
  const [amount, setAmount] = useState(String(Math.max(0, invoice.totals.balance)));
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState<PaymentMethod>(invoice.payments.at(-1)?.method ?? "instapay");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const value = Number(amount);
  const over = value > invoice.totals.balance + 0.001;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>
            {invoice.number}: {money(invoice.totals.balance, invoice.currency)} still owed.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Amount (${invoice.currency})`}>
              <Input type="number" min={0} step="any" value={amount} onChange={(event) => setAmount(event.target.value)} />
            </Field>
            <Field label="Paid on">
              <Input type="date" value={date} max={today()} onChange={(event) => setDate(event.target.value)} />
            </Field>
          </div>
          <Field label="Method">
            <Select value={method} onValueChange={(next) => setMethod(next as PaymentMethod)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(METHODS) as PaymentMethod[]).map((id) => (
                  <SelectItem key={id} value={id}>
                    {METHODS[id]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Reference" detail="transfer number, receipt…">
            <Input value={reference} dir="ltr" onChange={(event) => setReference(event.target.value)} />
          </Field>
          <Field label="Note">
            <Input value={note} dir="auto" onChange={(event) => setNote(event.target.value)} />
          </Field>
          {over && <p className="text-xs text-amber-600 dark:text-amber-400">That's more than is owed; the extra shows as a credit on this invoice.</p>}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || !(value > 0) || !date}
            onClick={() => {
              setBusy(true);
              api
                .addPayment(clientId, invoice.id, { amount: value, date, method, ...(reference.trim() ? { reference } : {}), ...(note.trim() ? { note } : {}) })
                .then((next) => {
                  toast.success(next.state === "paid" ? `${invoice.number} is paid in full` : "Payment recorded");
                  onSaved(next);
                })
                .catch((error: Error) => toast.error(error.message))
                .finally(() => setBusy(false));
            }}
          >
            Record {value > 0 ? money(value, invoice.currency) : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One payment for everything owed in a currency: the studio spreads it over the invoices, oldest first. */
function PayAllDialog({ clientId, currency, owed, onClose, onSaved }: { clientId: string; currency: Currency; owed: { amount: number; count: number }; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState(String(owed.amount));
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState<PaymentMethod>("instapay");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const value = Number(amount);
  const over = value > owed.amount + 0.001;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pay all at once</DialogTitle>
          <DialogDescription>
            {money(owed.amount, currency)} owed on {owed.count} invoice{owed.count === 1 ? "" : "s"}. One payment is applied to the oldest first; a smaller amount leaves the newest partly paid.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Amount (${currency})`}>
              <Input type="number" min={0} step="any" value={amount} onChange={(event) => setAmount(event.target.value)} />
            </Field>
            <Field label="Paid on">
              <Input type="date" value={date} max={today()} onChange={(event) => setDate(event.target.value)} />
            </Field>
          </div>
          <Field label="Method">
            <Select value={method} onValueChange={(next) => setMethod(next as PaymentMethod)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(METHODS) as PaymentMethod[]).map((id) => (
                  <SelectItem key={id} value={id}>
                    {METHODS[id]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Reference" detail="transfer number, receipt…">
            <Input value={reference} dir="ltr" onChange={(event) => setReference(event.target.value)} />
          </Field>
          <Field label="Note">
            <Input value={note} dir="auto" onChange={(event) => setNote(event.target.value)} />
          </Field>
          {over && <p className="text-xs text-destructive">That's more than everything owed; record the exact total.</p>}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || !(value > 0) || over || !date}
            onClick={() => {
              setBusy(true);
              api
                .payAll(clientId, { currency, amount: value, date, method, ...(reference.trim() ? { reference } : {}), ...(note.trim() ? { note } : {}) })
                .then(({ invoices }) => {
                  toast.success(`${money(value, currency)} recorded over ${invoices} invoice${invoices === 1 ? "" : "s"}`);
                  onSaved();
                })
                .catch((error: Error) => toast.error(error.message))
                .finally(() => setBusy(false));
            }}
          >
            Record {value > 0 ? money(value, currency) : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
