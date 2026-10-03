import type { Env } from "./env";
import { notFound, unprocessable } from "./errors";
import type { Business, InvoiceSettings } from "~shared/types";

export const newId = (): string => crypto.randomUUID();
export const nowIso = (): string => new Date().toISOString();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateString(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** D1 stores booleans as 0/1 integers. */
export function toBool(value: unknown): boolean {
  return value === 1 || value === true || value === "1";
}

export function toNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "string" ? Number(value) : (value as number);
  return Number.isFinite(n) ? (n as number) : fallback;
}

/** undefined -> null so D1 prepared statements never receive `undefined`. */
export function nullify<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    out[key] = value === undefined ? null : value;
  }
  return out;
}

export function trimOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function upperOrNull(value: unknown): string | null {
  const v = trimOrNull(value);
  return v ? v.toUpperCase() : null;
}

/** Tables that may be ownership-checked (whitelisted to avoid SQL injection). */
export type OwnedTable = "customers" | "products" | "invoices" | "payments" | "invoice_settings";

/**
 * Fetches a row that MUST belong to the caller's business.
 * Returns 404 (instead of 403) so other tenants cannot probe for ids.
 */
export async function ownedRow<T>(
  env: Env,
  table: OwnedTable,
  id: string,
  businessId: string,
): Promise<T> {
  const row = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ? AND business_id = ?`)
    .bind(id, businessId)
    .first<T>();
  if (!row) throw notFound("The requested record was not found or you do not have access to it.");
  return row;
}

/** The signed-in user's business (created during signup). */
export async function getBusiness(env: Env, ownerId: string): Promise<Business> {
  const row = await env.DB.prepare("SELECT * FROM businesses WHERE owner_id = ?")
    .bind(ownerId)
    .first<Business>();
  if (!row) {
    throw unprocessable("Business setup is incomplete. Please complete your business profile first.");
  }
  return row;
}

export function serializeSettings(row: InvoiceSettings & { round_to_rupee: number | boolean }): InvoiceSettings {
  return {
    ...row,
    show_bank_details: toBool(row.show_bank_details),
    round_to_rupee: toBool(row.round_to_rupee),
    next_invoice_number: toNumber(row.next_invoice_number, 1),
    default_due_days: toNumber(row.default_due_days, 0),
  };
}

export async function getInvoiceSettings(env: Env, businessId: string): Promise<InvoiceSettings> {
  const row = await env.DB.prepare("SELECT * FROM invoice_settings WHERE business_id = ?")
    .bind(businessId)
    .first<InvoiceSettings>();
  if (row) return serializeSettings(row);
  return createInvoiceSettings(env, businessId);
}

export const DEFAULT_TERMS = [
  "Payment is due as per the due date mentioned on this invoice.",
  "Goods once sold are subject to the terms agreed between the parties.",
  "Any dispute is subject to the applicable jurisdiction agreed by the parties.",
].join("\n");

export async function createInvoiceSettings(env: Env, businessId: string): Promise<InvoiceSettings> {
  const id = newId();
  await env.DB.prepare(
    `INSERT INTO invoice_settings (id, business_id, invoice_prefix, next_invoice_number, default_due_days, default_terms)
     VALUES (?, ?, 'INV', 1, 15, ?)`,
  )
    .bind(id, businessId, DEFAULT_TERMS)
    .run();
  const row = await env.DB.prepare("SELECT * FROM invoice_settings WHERE business_id = ?")
    .bind(businessId)
    .first<InvoiceSettings>();
  if (!row) throw new Error("Failed to create invoice settings.");
  return serializeSettings(row);
}

/** Reads an integer query param with bounds. */
export function intParam(query: URLSearchParams, key: string, fallback: number, min: number, max: number): number {
  const raw = query.get(key);
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}
