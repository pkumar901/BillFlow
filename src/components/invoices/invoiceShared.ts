import { stateCodeFor } from "~shared/states";
import type { Business, Customer, Invoice, InvoiceItem } from "~shared/types";

/** Which copy of the invoice is being shown/printed. */
export type CopyLabel = "Original for Recipient" | "Duplicate for Recipient" | "Triplicate for Recipient";

export const COPY_LABELS: CopyLabel[] = [
  "Original for Recipient",
  "Duplicate for Recipient",
  "Triplicate for Recipient",
];

type Line = Pick<InvoiceItem, "gst_rate" | "cgst" | "sgst" | "igst">;

/**
 * Sums tax per GST slab so an invoice can show e.g. "CGST 9% / SGST 9%".
 * Shared by the classic and standard layouts (screen + PDF).
 */
export function groupTaxes(lines: Line[], interstate: boolean) {
  const map = new Map<number, { cgst: number; sgst: number; igst: number }>();
  for (const line of lines) {
    const key = Number(line.gst_rate) || 0;
    const entry = map.get(key) ?? { cgst: 0, sgst: 0, igst: 0 };
    entry.cgst = Math.round((entry.cgst + Number(line.cgst || 0)) * 100) / 100;
    entry.sgst = Math.round((entry.sgst + Number(line.sgst || 0)) * 100) / 100;
    entry.igst = Math.round((entry.igst + Number(line.igst || 0)) * 100) / 100;
    map.set(key, entry);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rate, values]) => ({
      rate,
      interstate,
      cgst: values.cgst,
      sgst: values.sgst,
      igst: values.igst,
      label: interstate ? `IGST ${rate}%` : `CGST ${rate}% / SGST ${rate}%`,
      amount: interstate ? values.igst : Math.round((values.cgst + values.sgst) * 100) / 100,
      cgstAmount: values.cgst,
      sgstAmount: values.sgst,
    }));
}

/** Drops empty address parts. */
export function addressLines(parts: Array<string | null | undefined>): string[] {
  return parts.map((p) => (p ?? "").trim()).filter(Boolean);
}

/**
 * Two-digit GST state code shown on the invoice.
 * Place of supply first, then the recipient's GSTIN/state, then the seller's.
 */
export function stateCodeOf(invoice: Invoice, customer: Customer, business: Business): string {
  return (
    stateCodeFor(invoice.place_of_supply) ||
    stateCodeFor(customer.gstin) ||
    stateCodeFor(customer.state) ||
    stateCodeFor(business.gstin) ||
    stateCodeFor(business.state) ||
    "—"
  );
}

/**
 * Shipping address for the invoice layouts: the optional invoice-level
 * address wins; otherwise the customer's shipping address is used (skipped
 * when it only repeats the billing address).
 */
export function shippingAddressLines(invoice: Invoice, customer: Customer): string[] {
  const own = (invoice.shipping_address ?? "").trim();
  if (own) return addressLines(own.split(/\r?\n/));

  const theirs = (customer.shipping_address ?? "").trim();
  if (!theirs || theirs === (customer.billing_address ?? "").trim()) return [];

  return addressLines([
    theirs,
    [customer.city, customer.state].filter(Boolean).join(", ") || null,
    customer.pincode ?? null,
  ]);
}
