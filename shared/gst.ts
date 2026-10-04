/**
 * GST calculation engine - the single source of truth for invoice money math.
 *
 * Used by:
 *   - the Cloudflare Worker (authoritative, server-side calculation before saving)
 *   - the React frontend (live preview while building an invoice)
 *
 * Rules
 *  - Every intermediate value is held in integer paise.
 *  - Taxable value = rate x quantity (- applicable discounts)
 *  - Tax = taxable value x GST rate / 100
 *  - Same state  -> CGST + SGST (each half of the tax)
 *  - Other state -> IGST (full tax); CGST/SGST are never used
 *  - Grand total may be rounded to the nearest rupee ("round off").
 */

import {
  multiply,
  percentOf,
  round2,
  splitEqual,
  toPaisa,
  toRupees,
} from "./money";
import { sameState } from "./states";

export type DiscountType = "percent" | "amount";

export interface CalcItemInput {
  product_id?: string | null;
  item_name: string;
  description?: string | null;
  hsn_sac?: string | null;
  rate: number;
  quantity: number;
  unit: string;
  gst_rate: number;
  /**
   * Optional explicit intra-state split. When both are supplied the tax is
   * derived from these two rates instead of halving `gst_rate`, so a manually
   * entered CGST% / SGST% is honoured exactly. Defaults to equal halves.
   */
  cgst_rate?: number | null;
  sgst_rate?: number | null;
  /** Cess as a percentage of taxable value (usually 0). */
  cess_rate?: number;
  discount_type?: DiscountType;
  discount_value?: number;
}

export interface InvoiceCalcInput {
  seller_state: string;
  customer_state: string;
  place_of_supply?: string | null;
  items: CalcItemInput[];
  /** Optional overall invoice discount applied after line discounts. */
  discount_type?: DiscountType;
  discount_value?: number;
  /** Round the grand total to the nearest rupee (default true). */
  round_to_rupee?: boolean;
}

export interface CalcItemOutput {
  index: number;
  product_id: string | null;
  item_name: string;
  description: string | null;
  hsn_sac: string | null;
  unit: string;
  rate: number;
  quantity: number;
  gst_rate: number;
  cgst_rate: number;
  sgst_rate: number;
  cess_rate: number;
  base_amount: number;
  discount: number;
  taxable_value: number;
  tax_amount: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  total_amount: number;
}

export interface InvoiceCalcResult {
  interstate: boolean;
  items: CalcItemOutput[];
  total_items: number;
  total_quantity: number;
  /** rate x quantity before any discount */
  subtotal: number;
  item_discount: number;
  invoice_discount: number;
  discount: number;
  taxable_amount: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  tax_total: number;
  gross_total: number;
  round_off: number;
  grand_total: number;
  /** whether the grand total was rounded to the nearest rupee */
  round_to_rupee: boolean;
}

export class CalculationError extends Error {}

function assertFinite(value: number, label: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new CalculationError(`${label} must be a number.`);
  }
}

/** Validates + normalises one line. Throws CalculationError with a readable message. */
function validateItem(item: CalcItemInput, position: number): void {
  const label = `Item ${position + 1}`;
  if (!item.item_name || !String(item.item_name).trim()) {
    throw new CalculationError(`${label}: item name is required.`);
  }
  assertFinite(item.rate, `${label}: rate`);
  assertFinite(item.quantity, `${label}: quantity`);
  assertFinite(item.gst_rate, `${label}: GST rate`);
  if (item.rate < 0) throw new CalculationError(`${label}: rate cannot be negative.`);
  if (!(item.quantity > 0)) throw new CalculationError(`${label}: quantity must be greater than zero.`);
  if (item.gst_rate < 0 || item.gst_rate > 100) {
    throw new CalculationError(`${label}: GST rate must be between 0 and 100.`);
  }
  const explicitSplit =
    typeof item.cgst_rate === "number" && typeof item.sgst_rate === "number";
  if (explicitSplit) {
    assertFinite(item.cgst_rate as number, `${label}: CGST rate`);
    assertFinite(item.sgst_rate as number, `${label}: SGST rate`);
    if ((item.cgst_rate as number) < 0 || (item.cgst_rate as number) > 100) {
      throw new CalculationError(`${label}: CGST rate must be between 0 and 100.`);
    }
    if ((item.sgst_rate as number) < 0 || (item.sgst_rate as number) > 100) {
      throw new CalculationError(`${label}: SGST rate must be between 0 and 100.`);
    }
    if ((item.cgst_rate as number) + (item.sgst_rate as number) > 100) {
      throw new CalculationError(`${label}: CGST + SGST cannot exceed 100%.`);
    }
  }
  const cessRate = item.cess_rate ?? 0;
  if (cessRate < 0 || cessRate > 100) {
    throw new CalculationError(`${label}: cess must be between 0 and 100.`);
  }
  const discountValue = item.discount_value ?? 0;
  if (discountValue < 0) throw new CalculationError(`${label}: discount cannot be negative.`);
  if (item.discount_type === "percent" && discountValue > 100) {
    throw new CalculationError(`${label}: discount percentage cannot exceed 100.`);
  }
}

/**
 * Allocates a total discount across lines proportionally using the largest
 * remainder method so the allocated amounts always add up exactly.
 */
function allocate(totalPaisa: number, weightsPaisa: number[]): number[] {
  const weightSum = weightsPaisa.reduce((a, b) => a + b, 0);
  if (totalPaisa <= 0 || weightSum <= 0) return weightsPaisa.map(() => 0);

  const exact = weightsPaisa.map((w) => (totalPaisa * w) / weightSum);
  const floored = exact.map((v) => Math.floor(v));
  let remainder = totalPaisa - floored.reduce((a, b) => a + b, 0);

  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);

  const result = [...floored];
  for (const { i } of order) {
    if (remainder <= 0) break;
    // never discount a line below zero
    if (result[i] < weightsPaisa[i]) {
      result[i] += 1;
      remainder -= 1;
    }
  }
  return result;
}

export function calculateInvoice(input: InvoiceCalcInput): InvoiceCalcResult {
  const items = input.items ?? [];
  if (items.length === 0) {
    throw new CalculationError("Please add at least one item.");
  }

  const placeOfSupply = input.place_of_supply || input.customer_state;
  const interstate = !sameState(input.seller_state, placeOfSupply);

  const roundToRupee = input.round_to_rupee !== false;

  // ---- pass 1: base values + line discounts --------------------------------
  const basePaisa: number[] = [];
  const lineDiscountPaisa: number[] = [];
  const preInvoiceTaxablePaisa: number[] = [];

  items.forEach((item, i) => {
    validateItem(item, i);
    const base = toPaisa(multiply(item.rate, item.quantity));
    let discount = 0;
    if (item.discount_type && (item.discount_value ?? 0) > 0) {
      discount =
        item.discount_type === "percent"
          ? toPaisa(percentOf(toRupees(base), item.discount_value as number))
          : Math.min(toPaisa(item.discount_value as number), base);
    }
    basePaisa.push(base);
    lineDiscountPaisa.push(discount);
    preInvoiceTaxablePaisa.push(base - discount);
  });

  // ---- pass 2: overall invoice discount ------------------------------------
  const preInvoiceSum = preInvoiceTaxablePaisa.reduce((a, b) => a + b, 0);
  let invoiceDiscountPaisa = 0;
  const discountType = input.discount_type;
  const discountValue = input.discount_value ?? 0;
  if (discountValue > 0) {
    if (discountValue < 0) throw new CalculationError("Discount cannot be negative.");
    if (discountType === "percent") {
      if (discountValue > 100) throw new CalculationError("Discount percentage cannot exceed 100.");
      invoiceDiscountPaisa = toPaisa(percentOf(toRupees(preInvoiceSum), discountValue));
    } else if (discountType === "amount") {
      invoiceDiscountPaisa = Math.min(toPaisa(discountValue), preInvoiceSum);
    } else {
      throw new CalculationError("Discount type must be percent or amount.");
    }
  }
  invoiceDiscountPaisa = Math.min(invoiceDiscountPaisa, preInvoiceSum);

  const allocated = allocate(invoiceDiscountPaisa, preInvoiceTaxablePaisa);

  // ---- pass 3: tax per line -------------------------------------------------
  let subtotalPaisa = 0;
  let itemDiscountPaisa = 0;
  let taxablePaisa = 0;
  let cgstPaisa = 0;
  let sgstPaisa = 0;
  let igstPaisa = 0;
  let cessPaisa = 0;
  let totalQuantity = 0;

  const outputs: CalcItemOutput[] = items.map((item, i) => {
    const lineTaxable = Math.max(preInvoiceTaxablePaisa[i] - allocated[i], 0);
    const gstRate = item.gst_rate;
    const tax = Math.round((lineTaxable * gstRate) / 100);
    const cessRate = item.cess_rate ?? 0;
    const cess = Math.round((lineTaxable * cessRate) / 100);

    let cgst = 0;
    let sgst = 0;
    let igst = 0;
    if (interstate) {
      if (tax > 0) igst = tax;
    } else if (typeof item.cgst_rate === "number" && typeof item.sgst_rate === "number") {
      // explicit CGST% / SGST% entered by the user - honoured as typed
      cgst = Math.round((lineTaxable * item.cgst_rate) / 100);
      sgst = Math.round((lineTaxable * item.sgst_rate) / 100);
    } else if (tax > 0) {
      const halves = splitEqual(tax);
      cgst = toPaisa(halves.cgst);
      sgst = toPaisa(halves.sgst);
    }

    const cgstRate = typeof item.cgst_rate === "number" ? item.cgst_rate : gstRate / 2;
    const sgstRate = typeof item.sgst_rate === "number" ? item.sgst_rate : gstRate / 2;

    subtotalPaisa += basePaisa[i];
    itemDiscountPaisa += lineDiscountPaisa[i] + allocated[i];
    taxablePaisa += lineTaxable;
    cgstPaisa += cgst;
    sgstPaisa += sgst;
    igstPaisa += igst;
    cessPaisa += cess;
    totalQuantity += item.quantity;

    return {
      index: i,
      product_id: item.product_id ?? null,
      item_name: String(item.item_name).trim(),
      description: item.description ?? null,
      hsn_sac: item.hsn_sac ?? null,
      unit: item.unit || "PCS",
      rate: round2(item.rate),
      quantity: item.quantity,
      gst_rate: gstRate,
      cgst_rate: round2(cgstRate),
      sgst_rate: round2(sgstRate),
      cess_rate: cessRate,
      base_amount: toRupees(basePaisa[i]),
      discount: toRupees(lineDiscountPaisa[i] + allocated[i]),
      taxable_value: toRupees(lineTaxable),
      tax_amount: toRupees(cgst + sgst + igst),
      cgst: toRupees(cgst),
      sgst: toRupees(sgst),
      igst: toRupees(igst),
      cess: toRupees(cess),
      total_amount: toRupees(lineTaxable + cgst + sgst + igst + cess),
    };
  });

  const taxPaisa = cgstPaisa + sgstPaisa + igstPaisa;
  const grossPaisa = taxablePaisa + taxPaisa + cessPaisa;

  let grandPaisa = grossPaisa;
  let roundOffPaisa = 0;
  if (roundToRupee) {
    grandPaisa = Math.round(grossPaisa / 100) * 100;
    roundOffPaisa = grandPaisa - grossPaisa;
  }

  return {
    interstate,
    items: outputs.map((it, i) => ({ ...it, index: i + 1 })),
    total_items: items.length,
    total_quantity: round2(totalQuantity),
    subtotal: toRupees(subtotalPaisa),
    item_discount: toRupees(itemDiscountPaisa),
    invoice_discount: toRupees(invoiceDiscountPaisa),
    discount: toRupees(itemDiscountPaisa + invoiceDiscountPaisa),
    taxable_amount: toRupees(taxablePaisa),
    cgst: toRupees(cgstPaisa),
    sgst: toRupees(sgstPaisa),
    igst: toRupees(igstPaisa),
    cess: toRupees(cessPaisa),
    tax_total: toRupees(taxPaisa),
    gross_total: toRupees(grossPaisa),
    round_off: toRupees(roundOffPaisa),
    grand_total: toRupees(grandPaisa),
    round_to_rupee: roundToRupee,
  };
}

/**
 * Applies a manual CGST / SGST rupee override on top of a computed result.
 * The invoice form preview and the Worker both call this so the preview and the
 * persisted totals can never disagree. Null/undefined means "keep computed".
 */
export function applyTaxOverride(
  calc: InvoiceCalcResult,
  cgstOverride?: number | null,
  sgstOverride?: number | null,
): InvoiceCalcResult {
  if (cgstOverride == null && sgstOverride == null) return calc;
  const cgst = Math.max(0, cgstOverride ?? calc.cgst);
  const sgst = Math.max(0, sgstOverride ?? calc.sgst);
  if (round2(cgst) === round2(calc.cgst) && round2(sgst) === round2(calc.sgst)) return calc;

  const taxablePaisa = toPaisa(calc.taxable_amount);
  const taxPaisa = toPaisa(cgst) + toPaisa(sgst) + toPaisa(calc.igst);
  const grossPaisa = taxablePaisa + taxPaisa + toPaisa(calc.cess);
  let grandPaisa = grossPaisa;
  let roundOffPaisa = 0;
  if (calc.round_to_rupee) {
    grandPaisa = Math.round(grossPaisa / 100) * 100;
    roundOffPaisa = grandPaisa - grossPaisa;
  }

  return {
    ...calc,
    cgst: toRupees(toPaisa(cgst)),
    sgst: toRupees(toPaisa(sgst)),
    tax_total: toRupees(taxPaisa),
    gross_total: toRupees(grossPaisa),
    round_off: toRupees(roundOffPaisa),
    grand_total: toRupees(grandPaisa),
  };
}

/** Recomputes payment status from amounts (status stored on the invoice row). */
export function derivePaymentStatus(
  grandTotal: number,
  amountPaid: number,
  cancelled = false,
): PaymentStatus {
  if (cancelled) return "cancelled";
  const total = toPaisa(grandTotal);
  const paid = toPaisa(amountPaid);
  if (paid <= 0) return "unpaid";
  if (paid >= total) return "paid";
  return "partial";
}

export type PaymentStatus = "unpaid" | "partial" | "paid" | "cancelled";
