/**
 * Domain types shared by the Cloudflare Worker API and the React frontend.
 *
 * API payloads use snake_case field names that map 1:1 to D1 columns.
 */

import type { DiscountType, PaymentStatus } from "./gst";

export type { DiscountType, PaymentStatus };

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  email_verified: boolean;
  created_at: string;
}

export interface AuthSession {
  token: string;
  user: PublicUser;
  business: Business | null;
}

export interface Business {
  id: string;
  owner_id: string;
  business_name: string;
  gstin: string | null;
  pan: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceSettings {
  id: string;
  business_id: string;
  invoice_prefix: string;
  next_invoice_number: number;
  invoice_title: string;
  default_copy_label: string;
  default_due_days: number;
  default_payment_terms: string | null;
  default_terms: string | null;
  default_notes: string | null;
  footer_text: string | null;
  signature_text: string | null;
  show_bank_details: boolean;
  bank_name: string | null;
  account_holder: string | null;
  account_number: string | null;
  ifsc_code: string | null;
  branch: string | null;
  authorized_signatory: string | null;
  template: InvoiceTemplate;
  accent_color: string;
  round_to_rupee: boolean;
  created_at: string;
  updated_at: string;
}

export type InvoiceTemplate = "classic" | "modern" | "minimal" | "professional" | "standard";

export interface Customer {
  id: string;
  business_id: string;
  name: string;
  company_name: string | null;
  gstin: string | null;
  billing_address: string | null;
  shipping_address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  email: string | null;
  phone: string | null;
  contact_person: string | null;
  place_of_supply: string | null;
  created_at: string;
  updated_at: string;
  /** present on list responses */
  invoice_count?: number;
  total_invoiced?: number;
  outstanding?: number;
}

export interface Product {
  id: string;
  business_id: string;
  name: string;
  sku: string | null;
  hsn_sac: string | null;
  description: string | null;
  unit: string;
  selling_price: number;
  gst_rate: number;
  cess: number;
  stock_quantity: number | null;
  created_at: string;
  updated_at: string;
}

export interface Invoice {
  id: string;
  business_id: string;
  customer_id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  place_of_supply: string | null;
  /** customer purchase-order number (shown as "PO" on the invoice) */
  reference_number: string | null;
  /** customer purchase-order date (shown as "PO Date") */
  po_date: string | null;
  payment_terms: string | null;
  /** optional invoice-level override; falls back to the customer's shipping address */
  shipping_address: string | null;
  subtotal: number;
  discount: number;
  discount_type: DiscountType | null;
  discount_value: number;
  taxable_amount: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  round_off: number;
  grand_total: number;
  /** 1 when CGST/SGST were typed manually in the Totals panel */
  tax_override: number;
  amount_paid: number;
  balance_due: number;
  payment_status: PaymentStatus;
  interstate: boolean;
  notes: string | null;
  terms: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  /** joined fields */
  customer_name?: string | null;
  customer_gstin?: string | null;
  customer_state?: string | null;
  gst_total?: number;
  item_count?: number;
  total_quantity?: number;
  /** derived: "overdue" when unpaid past its due date */
  display_status?: PaymentStatus | "overdue";
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  product_id: string | null;
  item_name: string;
  description: string | null;
  hsn_sac: string | null;
  rate: number;
  quantity: number;
  unit: string;
  discount: number;
  discount_type: DiscountType | null;
  discount_value: number;
  taxable_value: number;
  gst_rate: number;
  /** intra-state split used for this line (null when never edited) */
  cgst_rate: number | null;
  sgst_rate: number | null;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  total_amount: number;
  sort_order: number;
}

export interface Payment {
  id: string;
  business_id: string;
  invoice_id: string;
  amount: number;
  payment_date: string;
  payment_method: PaymentMethod;
  transaction_reference: string | null;
  notes: string | null;
  created_at: string;
  invoice_number?: string | null;
  customer_name?: string | null;
  grand_total?: number;
}

export type PaymentMethod = "Cash" | "UPI" | "Bank Transfer" | "Card" | "Cheque" | "Other";

export const PAYMENT_METHODS: PaymentMethod[] = ["Cash", "UPI", "Bank Transfer", "Card", "Cheque", "Other"];

export interface AuditLog {
  id: string;
  business_id: string | null;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  detail: string | null;
  created_at: string;
  user_email?: string | null;
  user_name?: string | null;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

/* ------------------------------- payloads -------------------------------- */

export interface CreateInvoicePayload {
  customer_id: string;
  invoice_number?: string | null;
  invoice_date: string;
  due_date?: string | null;
  place_of_supply?: string | null;
  reference_number?: string | null;
  po_date?: string | null;
  payment_terms?: string | null;
  shipping_address?: string | null;
  notes?: string | null;
  terms?: string | null;
  discount_type?: DiscountType;
  discount_value?: number;
  items: CreateInvoiceItemPayload[];
  /** Manual override of the computed intra-state tax (Totals-panel editing). */
  cgst_override?: number | null;
  sgst_override?: number | null;
}

export interface CreateInvoiceItemPayload {
  product_id?: string | null;
  item_name: string;
  description?: string | null;
  hsn_sac?: string | null;
  rate: number;
  quantity: number;
  unit?: string;
  gst_rate: number;
  cgst_rate?: number;
  sgst_rate?: number;
  cess_rate?: number;
  discount_type?: DiscountType;
  discount_value?: number;
}

export interface InvoiceDetail {
  invoice: Invoice;
  items: InvoiceItem[];
  customer: Customer;
  payments: Payment[];
  business: Business;
  settings: InvoiceSettings;
}

export interface DashboardData {
  total_sales: number;
  invoice_count: number;
  paid_amount: number;
  pending_amount: number;
  gst_collected: number;
  month_sales: number;
  month_invoices: number;
  overdue_count: number;
  customer_count: number;
  product_count: number;
  recent_invoices: Invoice[];
  recent_customers: Customer[];
  overdue_invoices: Invoice[];
  monthly_sales: Array<{ period: string; label: string; sales: number; invoices: number }>;
  status_split: Array<{ status: string; count: number; amount: number }>;
  gst_by_rate: Array<{ gst_rate: number; taxable_amount: number; gst_amount: number }>;
}

export interface SalesReportRow {
  period: string;
  label: string;
  invoice_count: number;
  taxable_amount: number;
  gst: number;
  grand_total: number;
}

export interface SalesReport {
  rows: SalesReportRow[];
  summary: {
    invoice_count: number;
    taxable_amount: number;
    gst: number;
    grand_total: number;
  };
}

export interface GstReport {
  summary: {
    invoice_count: number;
    taxable_amount: number;
    cgst: number;
    sgst: number;
    igst: number;
    cess: number;
    total_gst: number;
    grand_total: number;
  };
  by_rate: Array<{
    gst_rate: number;
    invoice_count: number;
    taxable_amount: number;
    cgst: number;
    sgst: number;
    igst: number;
    total_gst: number;
  }>;
  interstate: { taxable_amount: number; igst: number };
  intrastate: { taxable_amount: number; cgst: number; sgst: number };
}

export interface OutstandingRow {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  po_date: string | null;
  customer_name: string;
  grand_total: number;
  amount_paid: number;
  balance_due: number;
  payment_status: PaymentStatus;
  days_overdue: number;
}

export interface PaymentReport {
  rows: Array<{
    period: string;
    label: string;
    payment_count: number;
    amount: number;
  }>;
  by_method: Array<{ payment_method: string; payment_count: number; amount: number }>;
  summary: { payment_count: number; amount: number };
}

export interface CustomerReportRow {
  customer_id: string;
  customer_name: string;
  invoice_count: number;
  taxable_amount: number;
  gst: number;
  grand_total: number;
  amount_paid: number;
  balance_due: number;
}

export interface ProductReportRow {
  product_id: string | null;
  item_name: string;
  quantity: number;
  taxable_value: number;
  gst: number;
  total_amount: number;
  invoice_count: number;
}
