import { amountInWords, formatINR, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { InvoiceDetail } from "~shared/types";

import {
  addressLines,
  groupTaxes,
  shippingAddressLines,
  COPY_LABELS,
  type CopyLabel,
} from "./invoiceShared";
import { StandardInvoice } from "./StandardInvoice";

export type { CopyLabel };
export { COPY_LABELS };

export function InvoiceDocument({
  detail,
  copyLabel = "Original for Recipient",
  showBalance = true,
  className,
}: {
  detail: InvoiceDetail;
  copyLabel?: CopyLabel;
  showBalance?: boolean;
  className?: string;
}) {
  const { invoice, items, customer, business, settings } = detail;
  const accent = settings.accent_color || "#0f766e";
  const template = settings.template || "classic";

  // The reference-style "Standard" layout is its own self-contained layout.
  if (template === "standard") {
    return (
      <StandardInvoice detail={detail} copyLabel={copyLabel} showBalance={showBalance} className={className} />
    );
  }

  const interstate = Boolean(invoice.interstate);

  const sellerAddress = addressLines([
    business.address,
    [business.city, business.state].filter(Boolean).join(", ") || null,
    business.pincode ? `${business.city ? "" : ""}${business.pincode}` : null,
  ]);

  const billingAddress = addressLines([
    customer.billing_address,
    [customer.city, customer.state].filter(Boolean).join(", ") || null,
    customer.pincode ?? null,
  ]);

  const shippingAddress = shippingAddressLines(invoice, customer);
  const showShipping = shippingAddress.length > 0;

  const taxGroups = groupTaxes(items, interstate);
  const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const totalTaxable = items.reduce((sum, item) => sum + Number(item.taxable_value || 0), 0);
  const totalDiscount = invoice.discount ?? 0;
  const cess = Number(invoice.cess ?? 0);
  const roundOff = Number(invoice.round_off ?? 0);

  const filledHeader = template === "modern" || template === "professional";
  const lightTable = template === "minimal";

  return (
    <article
      className={cn("invoice-sheet", className)}
      style={{ ["--invoice-accent" as string]: accent }}
      data-invoice-sheet
    >
      {/* ------------------------------------------------ header ------- */}
      <header
        className={cn(
          "mb-3 flex items-start justify-between gap-4 pb-3",
          filledHeader ? "-mx-[8.5mm] -mt-[8.5mm] px-[8.5mm] pt-[8mm] pb-4" : "border-b-2",
        )}
        style={
          filledHeader
            ? { background: accent, color: "#ffffff", borderColor: accent }
            : { borderColor: accent }
        }
      >
        <div className="flex items-start gap-3">
          {business.logo_url && (
            <img
              src={business.logo_url}
              alt={`${business.business_name} logo`}
              className="h-14 w-14 rounded object-contain bg-white p-1"
            />
          )}
          <div>
            <h1
              className={cn(
                "text-lg font-bold uppercase tracking-[0.18em]",
                template === "minimal" && "tracking-[0.1em]",
              )}
            >
              {settings.invoice_title || "TAX INVOICE"}
            </h1>
            <p className="text-[11px] opacity-90">{copyLabel}</p>
          </div>
        </div>
        <div className="text-right text-[11px] leading-5">
          <div className="text-[13px] font-semibold">{business.business_name}</div>
          {business.gstin && <div>GSTIN: {business.gstin}</div>}
          {business.pan && <div>PAN: {business.pan}</div>}
        </div>
      </header>

      {/* ------------------------------------- seller + customer -------- */}
      <section className="mb-3 grid grid-cols-2 gap-3">
        <div className={cn("rounded p-3", lightTable ? "bg-muted/40" : "border bg-white")}>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Seller Details
          </div>
          <div className="text-[13px] font-semibold">{business.business_name}</div>
          {business.gstin && <div className="text-[11px]">GSTIN: {business.gstin}</div>}
          <div className="text-[11px]">
            {sellerAddress.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
          <div className="mt-1 text-[11px]">
            {business.phone && <div>Mobile: {business.phone}</div>}
            {business.email && <div>Email: {business.email}</div>}
            {business.website && <div>Web: {business.website}</div>}
          </div>
        </div>

        <div className={cn("rounded p-3", lightTable ? "bg-muted/40" : "border bg-white")}>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Customer Details
          </div>
          <div className="text-[13px] font-semibold">
            {customer.company_name || customer.name}
          </div>
          {customer.company_name && customer.company_name !== customer.name && (
            <div className="text-[11px]">Attn: {customer.name}</div>
          )}
          {customer.gstin && <div className="text-[11px]">GSTIN: {customer.gstin}</div>}
          <div className="text-[11px]">
            <div className="font-medium">Billing Address:</div>
            {billingAddress.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
          <div className="mt-1 text-[11px]">
            {customer.email && <div>{customer.email}</div>}
            {customer.phone && <div>{customer.phone}</div>}
          </div>
        </div>
      </section>

      {/* ----------------------------------------- meta strip ----------- */}
      <section className="mb-3 grid grid-cols-3 gap-x-4 gap-y-1.5 rounded border border-dashed px-3 py-2 text-[11px] sm:grid-cols-4">
        <Meta label="Invoice #" value={invoice.invoice_number} />
        <Meta label="Invoice Date" value={formatDate(invoice.invoice_date)} />
        <Meta label="PO No" value={invoice.reference_number || ""} />
        <Meta
          label="PO Date"
          value={invoice.po_date ? formatDate(invoice.po_date) : ""}
        />
        <Meta
          label="Place of Supply"
          value={invoice.place_of_supply || customer.place_of_supply || customer.state || "—"}
        />
        <Meta label="Payment Terms" value={invoice.payment_terms || "—"} />
        <Meta label="Customer GSTIN" value={customer.gstin || "—"} />
        <Meta label="Supply Type" value={interstate ? "Inter-state (IGST)" : "Intra-state (CGST/SGST)"} />
      </section>

      {showShipping && (
        <section className="mb-3 grid grid-cols-2 gap-3 text-[11px]">
          <div>
            <span className="font-semibold">Billing Address:</span>{" "}
            {billingAddress.join(", ")}
          </div>
          <div>
            <span className="font-semibold">Shipping Address:</span>{" "}
            {shippingAddress.join(", ")}
          </div>
        </section>
      )}

      {/* ------------------------------------------ item table ---------- */}
      <table className={cn("mb-1 text-[11px]", lightTable && "border-none")}>
        <thead>
          <tr
            className="text-left text-[10px] uppercase tracking-wide"
            style={{ background: filledHeader ? "#f1f5f9" : accent, color: filledHeader ? "#0f172a" : "#ffffff" }}
          >
            <th className="border px-2 py-1.5" style={{ borderColor: accent }}>
              #
            </th>
            <th className="border px-2 py-1.5" style={{ borderColor: accent }}>
              Item / Description
            </th>
            <th className="border px-2 py-1.5" style={{ borderColor: accent }}>
              HSN/SAC
            </th>
            <th className="border px-2 py-1.5 text-right" style={{ borderColor: accent }}>
              Rate
            </th>
            <th className="border px-2 py-1.5 text-right" style={{ borderColor: accent }}>
              Qty
            </th>
            <th className="border px-2 py-1.5" style={{ borderColor: accent }}>
              Unit
            </th>
            <th className="border px-2 py-1.5 text-right" style={{ borderColor: accent }}>
              Taxable Value
            </th>
            <th className="border px-2 py-1.5 text-right" style={{ borderColor: accent }}>
              GST %
            </th>
            <th className="border px-2 py-1.5 text-right" style={{ borderColor: accent }}>
              Tax Amount
            </th>
            <th className="border px-2 py-1.5 text-right" style={{ borderColor: accent }}>
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={item.id ?? index}>
              <td className="border px-2 py-1.5 align-top">{index + 1}</td>
              <td className="border px-2 py-1.5 align-top">
                <div className="font-medium">{item.item_name}</div>
                {item.description && <div className="text-[10px] text-muted-foreground">{item.description}</div>}
                {Number(item.discount) > 0 && (
                  <div className="text-[10px] text-muted-foreground">
                    Line discount: {formatINR(item.discount)}
                  </div>
                )}
              </td>
              <td className="border px-2 py-1.5 align-top">{item.hsn_sac || "—"}</td>
              <td className="border px-2 py-1.5 text-right align-top">{formatINR(item.rate)}</td>
              <td className="border px-2 py-1.5 text-right align-top">{item.quantity}</td>
              <td className="border px-2 py-1.5 align-top">{item.unit || "PCS"}</td>
              <td className="border px-2 py-1.5 text-right align-top">{formatINR(item.taxable_value)}</td>
              <td className="border px-2 py-1.5 text-right align-top">{item.gst_rate}%</td>
              <td className="border px-2 py-1.5 text-right align-top">
                {formatINR(Number(item.cgst) + Number(item.sgst) + Number(item.igst))}
              </td>
              <td className="border px-2 py-1.5 text-right align-top font-medium">
                {formatINR(item.total_amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mb-3 text-[11px]">
        Total Items / Qty : {items.length} / {totalQuantity}
      </div>

      {/* ------------------------------------------ totals -------------- */}
      <section className="mb-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <div className="rounded border p-3 text-[11px]">
            <div className="mb-1 font-semibold">Total amount (in words):</div>
            <div className="font-medium">{amountInWords(invoice.grand_total)}</div>
          </div>
          <div className="rounded border p-3 text-[11px]">
            <div className="mb-1 font-semibold">Tax summary:</div>
            <div className="flex justify-between">
              <span>Taxable Amount</span>
              <span>{formatINR(totalTaxable)}</span>
            </div>
            {taxGroups.map((group) => (
              <div key={group.rate} className="flex justify-between">
                <span>{group.label}</span>
                <span>{formatINR(group.amount)}</span>
              </div>
            ))}
            {cess > 0 && (
              <div className="flex justify-between">
                <span>Cess</span>
                <span>{formatINR(cess)}</span>
              </div>
            )}
          </div>
        </div>

        <div className="rounded border text-[11px]">
          <Row label="Taxable Amount" value={formatINR(invoice.taxable_amount)} />
          {taxGroups.map((group) =>
            group.interstate ? (
              <Row key={group.rate} label={`IGST ${group.rate}%`} value={formatINR(group.igst)} />
            ) : (
              <Row
                key={group.rate}
                label={`CGST ${group.rate}% + SGST ${group.rate}%`}
                value={`${formatINR(group.cgstAmount)} + ${formatINR(group.sgstAmount)}`}
              />
            ),
          )}
          {cess > 0 && <Row label="Cess" value={formatINR(cess)} />}
          {totalDiscount > 0 && <Row label="Discount" value={`- ${formatINR(totalDiscount)}`} />}
          {roundOff !== 0 && <Row label="Round Off" value={formatINR(roundOff)} />}
          <div
            className="flex items-center justify-between border-t px-3 py-2 text-[13px] font-semibold"
            style={{ borderColor: accent }}
          >
            <span>Total</span>
            <span>{formatINR(invoice.grand_total)}</span>
          </div>
          {showBalance && (
            <>
              <Row label="Amount Paid" value={formatINR(invoice.amount_paid)} />
              <div className="flex items-center justify-between bg-muted/60 px-3 py-2 text-[13px] font-semibold">
                <span>Amount Payable</span>
                <span>{formatINR(invoice.balance_due ?? invoice.grand_total)}</span>
              </div>
            </>
          )}
        </div>
      </section>

      {/* ----------------------------------- bank + signature ----------- */}
      <section className="grid grid-cols-1 gap-4 border-t pt-3 text-[11px] sm:grid-cols-2">
        {settings.show_bank_details && (settings.bank_name || settings.account_number) && (
          <div>
            <div className="mb-1 font-semibold">Bank Details:</div>
            {settings.bank_name && <div>Bank: {settings.bank_name}</div>}
            {settings.account_holder && <div>Account Holder: {settings.account_holder}</div>}
            {settings.account_number && <div>Account #: {settings.account_number}</div>}
            {settings.ifsc_code && <div>IFSC Code: {settings.ifsc_code}</div>}
            {settings.branch && <div>Branch: {settings.branch}</div>}
          </div>
        )}
        <div className="sm:text-right">
          <div className="mb-6 font-semibold">For {business.business_name}</div>
          <div className="border-t pt-1 inline-block min-w-[180px]">
            {settings.authorized_signatory || settings.signature_text || "Authorized Signatory"}
          </div>
        </div>
      </section>

      {invoice.notes && (
        <section className="mt-3 rounded border p-2 text-[11px]">
          <span className="font-semibold">Notes: </span>
          {invoice.notes}
        </section>
      )}

      <section className="mt-2 text-[11px]">
        <div className="mb-1 font-semibold">Terms &amp; Conditions:</div>
        <ol className="list-decimal space-y-0.5 pl-4">
          {(invoice.terms || settings.default_terms || "")
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line, index) => (
              <li key={`${index}-${line}`}>{line}</li>
            ))}
        </ol>
      </section>

      <footer className="mt-4 flex items-center justify-between gap-4 border-t pt-2 text-[10px] text-muted-foreground">
        <span>
          {settings.footer_text || "This is a computer generated document and does not require a signature."}
        </span>
        <span>
          {business.business_name} · {invoice.invoice_number} · {formatDate(invoice.invoice_date)}
        </span>
      </footer>
    </article>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-dashed px-3 py-1.5 last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
