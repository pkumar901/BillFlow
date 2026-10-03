/**
 * Decimal-safe money helpers.
 *
 * Every calculation is performed on integer minor units (paise) so that
 * floating point noise can never leak into an invoice total. Rupee values are
 * only produced at the boundary (storage / display).
 */

export const PAISA_PER_RUPEE = 100;

/** Convert a rupee amount to integer paise (half-up at 2 decimal places). */
export function toPaisa(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const scaled = value * PAISA_PER_RUPEE;
  // toFixed(6) removes binary representation noise (e.g. 100.49999999999999)
  const cleaned = Number.parseFloat(scaled.toFixed(6));
  return Math.round(cleaned);
}

/** Convert integer paise back to a rupee number (always 2 decimal places). */
export function toRupees(paisa: number): number {
  return Math.round(paisa) / PAISA_PER_RUPEE;
}

/** Round any rupee value to 2 decimal places using integer paise math. */
export function round2(value: number): number {
  return toRupees(toPaisa(value));
}

/** Add rupee values (integer paise under the hood). */
export function moneyAdd(...values: number[]): number {
  return toRupees(values.reduce((sum, v) => sum + toPaisa(v), 0));
}

/** Subtract rupee values. */
export function moneySub(a: number, b: number): number {
  return toRupees(toPaisa(a) - toPaisa(b));
}

/**
 * Percentage of a rupee value, rounded half-up to paise.
 * `pct` is a percentage (18 = 18%).
 */
export function percentOf(value: number, pct: number): number {
  const amount = (toPaisa(value) * pct) / 100;
  return toRupees(Math.round(Number.parseFloat(amount.toFixed(6))));
}

/** Multiply a per-unit rate by a quantity, rounded half-up to paise. */
export function multiply(rate: number, quantity: number): number {
  const amount = toPaisa(rate) * quantity;
  return toRupees(Math.round(Number.parseFloat(amount.toFixed(6))));
}

/**
 * Split a tax amount into CGST / SGST without losing a paisa:
 * cgst gets the rounded half, sgst gets the remainder.
 */
export function splitEqual(taxPaisa: number): { cgst: number; sgst: number } {
  const cgst = Math.floor((taxPaisa + 1) / 2); // half-up on integers
  return { cgst: toRupees(cgst), sgst: toRupees(taxPaisa - cgst) };
}

/** Format a number as Indian-grouped currency, e.g. ₹12,34,567.89 */
export function formatINR(value: number, options?: { symbol?: boolean; decimals?: number }): symbolSafe {
  const decimals = options?.decimals ?? 2;
  const symbol = options?.symbol !== false;
  const n = Number.isFinite(value) ? value : 0;
  const formatted = Math.abs(n).toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const sign = n < 0 ? "-" : "";
  return `${sign}${symbol ? "₹" : ""}${formatted}` as symbolSafe;
}

type symbolSafe = string;

/** Format a plain number with Indian digit grouping (no currency symbol). */
export function formatNumber(value: number, decimals = 0): string {
  const n = Number.isFinite(value) ? value : 0;
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
