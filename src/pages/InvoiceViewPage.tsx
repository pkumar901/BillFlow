import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Ban,
  CircleCheck,
  Download,
  Link2,
  Mail,
  MessageCircle,
  Pencil,
  Printer,
  RotateCcw,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/StatusBadge";
import { COPY_LABELS, InvoiceDocument, type CopyLabel } from "@/components/invoices/InvoiceDocument";
import { shippingAddressLines } from "@/components/invoices/invoiceShared";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ErrorState, LoadingState } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";
import { copyText } from "@/lib/clipboard";
import { amountInWords, formatDate, formatDateTime, formatINR, todayISO } from "@/lib/format";
import { downloadInvoicePdf } from "@/lib/pdf/invoicePdf";
import { pdfDeliveryMessage } from "@/lib/pdf/savePdf";
import { printNode } from "@/lib/print";
import { PAYMENT_METHODS, type InvoiceDetail } from "~shared/types";

export function InvoiceViewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyLabel, setCopyLabel] = useState<CopyLabel>("Original for Recipient");
  const [pdfBusy, setPdfBusy] = useState(false);

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);

  const sheetRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setDetail(await api.getInvoice(id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load this invoice.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const shareUrl = `${window.location.origin}/invoices/${id ?? ""}`;

  const downloadPdf = async () => {
    if (!detail) return;
    setPdfBusy(true);
    try {
      const delivery = downloadInvoicePdf(detail, { copyLabel });
      const { ok, message } = pdfDeliveryMessage(delivery);
      if (ok) toast.success(message);
      else toast.error(message);
    } catch {
      toast.error("Unable to build the PDF.");
    } finally {
      setPdfBusy(false);
    }
  };

  const print = () => {
    const node = sheetRef.current?.querySelector<HTMLElement>("[data-invoice-sheet]");
    if (!node) {
      toast.error("The invoice preview is not ready yet.");
      return;
    }
    printNode(node, `${detail?.invoice.invoice_number ?? "Invoice"} - BillFlow`);
  };

  const copyLink = async () => {
    const copied = await copyText(shareUrl);
    if (copied) {
      toast.success("Invoice link copied to clipboard.");
    } else {
      toast.error("Unable to copy the link - select it from the address bar instead.");
    }
  };

  const shareWhatsapp = () => {
    if (!detail) return;
    const text = [
      `Invoice ${detail.invoice.invoice_number} from ${detail.business.business_name}`,
      `Amount: ${formatINR(detail.invoice.grand_total)}`,
      `Status: ${detail.invoice.payment_status === "paid" ? "Paid" : `Balance ${formatINR(detail.invoice.balance_due)}`}`,
      shareUrl,
    ].join("\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };

  const shareEmail = () => {
    if (!detail) return;
    const subject = `Invoice ${detail.invoice.invoice_number} from ${detail.business.business_name}`;
    const body = [
      `Hello ${detail.customer.name},`,
      "",
      `Please find invoice ${detail.invoice.invoice_number} dated ${formatDate(detail.invoice.invoice_date)}.`,
      `Grand total: ${formatINR(detail.invoice.grand_total)}`,
      `Balance due: ${formatINR(detail.invoice.balance_due)}`,
      "",
      `View the invoice: ${shareUrl}`,
      "",
      `Regards,`,
      detail.business.business_name,
    ].join("\n");
    const to = detail.customer.email ?? "";
    window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const toggleCancelled = async () => {
    if (!detail) return;
    setStatusBusy(true);
    try {
      const updated =
        detail.invoice.payment_status === "cancelled"
          ? await api.restoreInvoice(detail.invoice.id)
          : await api.cancelInvoice(detail.invoice.id);
      setDetail(updated);
      toast.success(
        updated.invoice.payment_status === "cancelled" ? "Invoice cancelled." : "Invoice restored.",
      );
      setCancelOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Unable to update the invoice status.");
    } finally {
      setStatusBusy(false);
    }
  };

  const remove = async () => {
    if (!detail) return;
    setDeleteLoading(true);
    try {
      await api.deleteInvoice(detail.invoice.id);
      toast.success(`Invoice ${detail.invoice.invoice_number} deleted.`);
      navigate("/invoices", { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Unable to delete this invoice.");
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading) return <LoadingState label="Loading invoice…" />;
  if (error) return <ErrorState message={error} />;
  if (!detail) return <ErrorState message="Invoice not found." />;

  const { invoice, customer, payments } = detail;
  const cancelled = invoice.payment_status === "cancelled";

  return (
    <div className="space-y-6">
      <PageHeader
        title={invoice.invoice_number}
        description={`${customer.company_name || customer.name} · ${formatDate(invoice.invoice_date)} · ${formatINR(invoice.grand_total)}`}
        actions={
          <>
            <StatusBadge status={invoice.display_status ?? invoice.payment_status} />
            <Button variant="outline" asChild>
              <Link to="/invoices">
                All invoices
              </Link>
            </Button>
            {!cancelled && (
              <Button variant="outline" asChild>
                <Link to={`/invoices/${invoice.id}/edit`}>
                  <Pencil /> Edit
                </Link>
              </Button>
            )}
            <Button variant="outline" onClick={print}>
              <Printer /> Print
            </Button>
            <Button variant="outline" loading={pdfBusy} onClick={() => void downloadPdf()}>
              <Download /> PDF
            </Button>
            {!cancelled && Number(invoice.balance_due) > 0 && (
              <Button onClick={() => setPaymentOpen(true)}>
                <Wallet /> Record Payment
              </Button>
            )}
          </>
        }
      />

      {/* action strip */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-white px-4 py-3 text-sm print:hidden">
        <span className="font-medium text-muted-foreground">Share:</span>
        <Button variant="outline" size="sm" onClick={shareWhatsapp}>
          <MessageCircle /> WhatsApp
        </Button>
        <Button variant="outline" size="sm" onClick={shareEmail}>
          <Mail /> Email
        </Button>
        <Button variant="outline" size="sm" onClick={() => void copyLink()}>
          <Link2 /> Copy Link
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <label htmlFor="view-copy" className="text-xs text-muted-foreground">
            Copy
          </label>
          <Select value={copyLabel} onValueChange={(value) => setCopyLabel(value as CopyLabel)}>
            <SelectTrigger id="view-copy" className="h-8 w-[200px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COPY_LABELS.map((label) => (
                <SelectItem key={label} value={label}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* document */}
        <div ref={sheetRef} className="overflow-x-auto rounded-lg bg-slate-100 p-4 print:p-0 print:bg-white">
          <InvoiceDocument detail={detail} copyLabel={copyLabel} />
        </div>

        {/* side panel */}
        <aside className="space-y-4 print:hidden">
          <section className="rounded-lg border bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Payment status
            </h2>
            <div className="space-y-2 text-sm">
              <Row label="Grand total" value={formatINR(invoice.grand_total)} />
              <Row label="Amount paid" value={formatINR(invoice.amount_paid)} />
              <div className="flex items-center justify-between border-t pt-2 text-base font-semibold">
                <span>Balance due</span>
                <span className={Number(invoice.balance_due) > 0 ? "text-destructive" : "text-emerald-600"}>
                  {formatINR(invoice.balance_due)}
                </span>
              </div>
              <p className="text-xs italic text-muted-foreground">{amountInWords(invoice.grand_total)}</p>
            </div>

            <Separator className="my-4" />

            <div className="flex flex-wrap gap-2">
              {!cancelled && Number(invoice.balance_due) > 0 && (
                <Button size="sm" onClick={() => setPaymentOpen(true)}>
                  <Wallet /> Record Payment
                </Button>
              )}
              {cancelled ? (
                <Button size="sm" variant="outline" loading={statusBusy} onClick={() => void toggleCancelled()}>
                  <RotateCcw /> Restore invoice
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setCancelOpen(true)}>
                  <Ban /> Cancel invoice
                </Button>
              )}
              <Button size="sm" variant="outline" className="text-destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 /> Delete
              </Button>
            </div>
          </section>

          <section className="rounded-lg border bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Payments received
            </h2>
            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
            ) : (
              <ul className="space-y-3">
                {payments.map((payment) => (
                  <li key={payment.id} className="flex items-start justify-between gap-3 text-sm">
                    <div>
                      <div className="font-medium">{formatINR(payment.amount)}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(payment.payment_date)} · {payment.payment_method}
                        {payment.transaction_reference ? ` · ${payment.transaction_reference}` : ""}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Added {formatDateTime(payment.created_at)}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline hover:text-destructive"
                      onClick={() => {
                        void (async () => {
                          try {
                            await api.deletePayment(payment.id);
                            toast.success("Payment removed.");
                            await load();
                          } catch (err) {
                            toast.error(
                              err instanceof ApiError ? err.message : "Unable to remove the payment.",
                            );
                          }
                        })();
                      }}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border bg-white p-5 text-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Invoice facts
            </h2>
            <div className="space-y-2">
              <Row label="Status" value={<StatusBadge status={invoice.display_status ?? invoice.payment_status} />} />
              <Row label="Supply type" value={invoice.interstate ? "Inter-state (IGST)" : "Intra-state (CGST/SGST)"} />
              <Row label="Place of supply" value={invoice.place_of_supply || customer.state || "—"} />
              {shippingAddressLines(invoice, customer).length > 0 && (
                <Row
                  label="Shipping address"
                  value={shippingAddressLines(invoice, customer).join(", ")}
                />
              )}
              <Row label="PO No" value={invoice.reference_number || "—"} />
              <Row
                label="PO Date"
                value={invoice.po_date ? formatDate(invoice.po_date) : "—"}
              />
              <Row label="Created" value={formatDateTime(invoice.created_at)} />
            </div>
          </section>
        </aside>
      </div>

      <PaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        detail={detail}
        onPaid={async (updated) => {
          setDetail({ ...detail, invoice: updated, payments: await reloadPayments(updated.id) });
        }}
      />

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={cancelled ? "Restore invoice?" : "Cancel invoice?"}
        description={
          cancelled
            ? "The invoice returns to its previous payment status and appears in reports again."
            : "A cancelled invoice stays on record but is excluded from sales and GST totals. You can restore it later."
        }
        confirmLabel={cancelled ? "Restore" : "Cancel invoice"}
        destructive={!cancelled}
        loading={statusBusy}
        onConfirm={() => void toggleCancelled()}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete invoice?"
        description={`Invoice ${invoice.invoice_number} and its payments will be permanently removed. This cannot be undone.`}
        loading={deleteLoading}
        onConfirm={() => void remove()}
      />
    </div>
  );
}

async function reloadPayments(invoiceId: string): Promise<InvoiceDetail["payments"]> {
  try {
    const fresh = await api.getInvoice(invoiceId);
    return fresh.payments;
  } catch {
    return [];
  }
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

/* ---------------------------- payment dialog ---------------------------- */

function PaymentDialog({
  open,
  onOpenChange,
  detail,
  onPaid,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: InvoiceDetail;
  onPaid: (invoice: InvoiceDetail["invoice"]) => Promise<void> | void;
}) {
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [method, setMethod] = useState<string>("UPI");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setPaymentDate(todayISO());
    setReference("");
    setNotes("");
    setMethod("UPI");
    setAmount(String(detail.invoice.balance_due > 0 ? detail.invoice.balance_due.toFixed(2) : ""));
  }, [open, detail.invoice.balance_due]);

  const submit = async () => {
    const value = Number.parseFloat(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    if (value > detail.invoice.balance_due + 0.001) {
      setError(`Amount cannot exceed the balance of ${formatINR(detail.invoice.balance_due)}.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await api.recordPayment(detail.invoice.id, {
        amount: value,
        payment_date: paymentDate,
        payment_method: method,
        transaction_reference: reference.trim() || null,
        notes: notes.trim() || null,
      });
      toast.success(`Payment of ${formatINR(value)} recorded.`);
      onOpenChange(false);
      await onPaid(res.invoice);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to record the payment.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            {detail.invoice.invoice_number} · balance {formatINR(detail.invoice.balance_due)}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {error && (
            <div className="col-span-full rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <Field label="Amount ₹" htmlFor="pay-amount" required>
            <Input
              id="pay-amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>

          <Field label="Payment date" htmlFor="pay-date" required>
            <Input
              id="pay-date"
              type="date"
              value={paymentDate}
              onChange={(event) => setPaymentDate(event.target.value)}
            />
          </Field>

          <Field label="Method" htmlFor="pay-method">
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger id="pay-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Transaction reference" htmlFor="pay-ref" hint="UPI ID / cheque no. / NEFT ref">
            <Input id="pay-ref" value={reference} onChange={(event) => setReference(event.target.value)} />
          </Field>

          <Field label="Notes" htmlFor="pay-notes" className="sm:col-span-2">
            <Textarea id="pay-notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={saving} onClick={() => void submit()}>
            <CircleCheck /> Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
