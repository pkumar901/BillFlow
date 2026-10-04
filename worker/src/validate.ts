import { z } from "zod";
import { ApiError, validationError } from "./errors";
import { isDateString } from "./helpers";
import {
  isValidEmail,
  isValidGstin,
  isValidIfsc,
  isValidLogoValue,
  isValidPan,
  isValidPhone,
  isValidPincode,
  MAX_LOGO_CHARS,
} from "~shared/validation";
import { PAYMENT_METHODS } from "~shared/types";

const date = z
  .string()
  .refine(isDateString, { message: "Enter a valid date in YYYY-MM-DD format." });

const optionalDate = z
  .string()
  .nullish()
  .refine((v) => !v || isDateString(v), { message: "Enter a valid date in YYYY-MM-DD format." })
  .transform((v) => (v ? v : null));

const trimmed = (max: number) => z.string().trim().max(max, `Must be ${max} characters or fewer.`);

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer.`)
    .nullish()
    .transform((v) => (v ? v : null));

const gstinField = z
  .string()
  .trim()
  .max(15, "GSTIN must be 15 characters or fewer.")
  .nullish()
  .refine((v) => isValidGstin(v ?? null), { message: "GSTIN format is invalid." })
  .transform((v) => (v ? v.toUpperCase() : null));

const panField = z
  .string()
  .trim()
  .max(10, "PAN must be 10 characters or fewer.")
  .nullish()
  .refine((v) => isValidPan(v ?? null), { message: "PAN format is invalid." })
  .transform((v) => (v ? v.toUpperCase() : null));

const pincodeField = z
  .string()
  .trim()
  .max(6, "PIN code must be 6 digits.")
  .nullish()
  .refine((v) => isValidPincode(v ?? null), { message: "PIN code must be a 6 digit Indian PIN code." })
  .transform((v) => (v ? v : null));

const emailField = z
  .string()
  .trim()
  .max(254, "Email must be 254 characters or fewer.")
  .nullish()
  .refine((v) => isValidEmail(v ?? null), { message: "Enter a valid email address." })
  .transform((v) => (v ? v.toLowerCase() : null));

const phoneField = z
  .string()
  .trim()
  .max(20, "Phone number is too long.")
  .nullish()
  .refine((v) => isValidPhone(v ?? null), { message: "Enter a valid phone number." })
  .transform((v) => (v ? v : null));

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password must be 128 characters or fewer.");

/** Parses a payload with a zod schema and converts issues into a 422 ApiError. */
export function parse<T>(schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);
  if (!result.success) throw validationError(result.error.issues);
  return result.data;
}

/* --------------------------------- auth ---------------------------------- */

export const signupSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name.").max(120),
  email: z
    .string()
    .trim()
    .min(1, "Email is required.")
    .email("Enter a valid email address.")
    .max(254)
    .transform((v) => v.toLowerCase()),
  password: passwordSchema,
  business_name: z.string().trim().min(2, "Business name is required.").max(160).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().min(1, "Email is required.").email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

export const verifySchema = z.object({ token: z.string().min(10, "Verification token is missing.") });

export const forgotSchema = z.object({
  email: z.string().trim().min(1, "Email is required.").email("Enter a valid email address."),
});

export const resetSchema = z.object({
  token: z.string().min(10, "Reset token is missing."),
  password: passwordSchema,
});

export const profileSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name.").max(120),
  email: z.string().trim().email("Enter a valid email address.").max(254),
});

export const changePasswordSchema = z.object({
  current_password: z.string().min(1, "Enter your current password."),
  new_password: passwordSchema,
});

/* ------------------------------- business -------------------------------- */

export const businessSchema = z.object({
  business_name: z.string().trim().min(2, "Business name is required.").max(160),
  gstin: gstinField,
  pan: panField,
  address: optionalTrimmed(400),
  city: optionalTrimmed(120),
  state: optionalTrimmed(80),
  pincode: pincodeField,
  phone: phoneField,
  email: emailField,
  website: optionalTrimmed(200),
  logo_url: z
    .string()
    .trim()
    .max(MAX_LOGO_CHARS, "Logo image is too large. Please upload a smaller file.")
    .nullish()
    .refine((v) => isValidLogoValue(v ?? null), {
      message: "Logo must be an image data URL or an http(s) address.",
    })
    .transform((v) => (v ? v : null)),
});

export const invoiceSettingsSchema = z.object({
  invoice_prefix: z
    .string()
    .trim()
    .max(10, "Prefix must be 10 characters or fewer.")
    .regex(/^[A-Za-z0-9\-]*$/, "Prefix may only contain letters, numbers and hyphens.")
    .default("INV"),
  next_invoice_number: z
    .number()
    .int("Starting invoice number must be a whole number.")
    .min(1)
    .max(99999999),
  invoice_title: z.string().trim().min(2).max(60),
  default_copy_label: z.string().trim().max(80),
  default_due_days: z.number().int().min(0).max(3650),
  default_payment_terms: optionalTrimmed(300),
  default_terms: optionalTrimmed(5000),
  default_notes: optionalTrimmed(2000),
  footer_text: optionalTrimmed(400),
  signature_text: optionalTrimmed(200),
  show_bank_details: z.boolean(),
  bank_name: optionalTrimmed(160),
  account_holder: optionalTrimmed(160),
  account_number: optionalTrimmed(40),
  ifsc_code: z
    .string()
    .trim()
    .max(11)
    .nullish()
    .refine((v) => isValidIfsc(v ?? null), { message: "IFSC format is invalid (e.g. HDFC0001234)." })
    .transform((v) => (v ? v.toUpperCase() : null)),
  branch: optionalTrimmed(160),
  authorized_signatory: optionalTrimmed(160),
  template: z.enum(["classic", "modern", "minimal", "professional", "standard"]),
  accent_color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Colour must be a hex value such as #0f766e."),
  round_to_rupee: z.boolean(),
});

/* ------------------------------- customers ------------------------------- */

export const customerSchema = z.object({
  name: z.string().trim().min(1, "Customer name is required.").max(200),
  company_name: optionalTrimmed(200),
  gstin: gstinField,
  billing_address: optionalTrimmed(500),
  shipping_address: optionalTrimmed(500),
  city: optionalTrimmed(120),
  state: optionalTrimmed(80),
  pincode: pincodeField,
  email: emailField,
  phone: phoneField,
  contact_person: optionalTrimmed(160),
  place_of_supply: optionalTrimmed(80),
});

/* -------------------------------- products ------------------------------- */

export const productSchema = z.object({
  name: z.string().trim().min(1, "Product / service name is required.").max(200),
  sku: optionalTrimmed(60),
  hsn_sac: optionalTrimmed(20),
  description: optionalTrimmed(1000),
  unit: z.string().trim().min(1, "Unit is required.").max(20),
  selling_price: z
    .number({ invalid_type_error: "Selling price must be a number." })
    .min(0, "Price cannot be negative.")
    .max(1_000_000_000),
  gst_rate: z
    .number({ invalid_type_error: "GST rate must be a number." })
    .min(0, "GST rate must be 0 or more.")
    .max(100, "GST rate must be 100 or less."),
  cess: z
    .number({ invalid_type_error: "Cess must be a number." })
    .min(0, "Cess cannot be negative.")
    .max(100, "Cess must be 100 or less.")
    .nullish()
    .transform((v) => (v === undefined || v === null ? 0 : v)),
  stock_quantity: z
    .number()
    .min(0, "Stock quantity cannot be negative.")
    .max(1_000_000_000)
    .nullish()
    .transform((v) => (v === undefined || v === null ? null : v)),
});

/* -------------------------------- invoices ------------------------------- */

export const invoiceItemSchema = z.object({
  product_id: z.string().trim().min(1).nullish().transform((v) => (v ? v : null)),
  item_name: z.string().trim().min(1, "Item name is required.").max(300),
  description: optionalTrimmed(2000),
  hsn_sac: optionalTrimmed(20),
  rate: z
    .number({ invalid_type_error: "Rate must be a number." })
    .min(0, "Rate cannot be negative.")
    .max(1_000_000_000, "Rate is too large."),
  quantity: z
    .number({ invalid_type_error: "Quantity must be a number." })
    .positive("Quantity must be greater than zero.")
    .max(100_000_000, "Quantity is too large."),
  unit: z.string().trim().min(1).max(20).optional(),
  gst_rate: z
    .number({ invalid_type_error: "GST rate must be a number." })
    .min(0, "GST rate must be 0 or more.")
    .max(100, "GST rate must be 100 or less."),
  cgst_rate: z.number().min(0, "CGST rate must be 0 or more.").max(100).optional(),
  sgst_rate: z.number().min(0, "SGST rate must be 0 or more.").max(100).optional(),
  cess_rate: z.number().min(0).max(100).optional(),
  discount_type: z.enum(["percent", "amount"]).optional(),
  discount_value: z.number().min(0, "Discount cannot be negative.").max(1_000_000_000).optional(),
});

export const invoiceSchema = z.object({
  customer_id: z.string().trim().min(1, "Please select a customer."),
  invoice_number: z
    .string()
    .trim()
    .max(40)
    .regex(/^[A-Za-z0-9][A-Za-z0-9\-\/]*$/, "Invoice number may only contain letters, numbers, hyphens and slashes.")
    .nullish()
    .transform((v) => (v ? v : null)),
  invoice_date: date,
  due_date: optionalDate,
  place_of_supply: optionalTrimmed(80),
  reference_number: optionalTrimmed(120),
  po_date: optionalDate,
  payment_terms: optionalTrimmed(300),
  shipping_address: optionalTrimmed(600),
  notes: optionalTrimmed(2000),
  terms: optionalTrimmed(5000),
  discount_type: z.enum(["percent", "amount"]).optional(),
  discount_value: z.number().min(0, "Discount cannot be negative.").max(1_000_000_000).optional(),
  cgst_override: z.number().min(0, "CGST cannot be negative.").max(1_000_000_000).nullish(),
  sgst_override: z.number().min(0, "SGST cannot be negative.").max(1_000_000_000).nullish(),
  items: z
    .array(invoiceItemSchema)
    .min(1, "Please add at least one item.")
    .max(500, "An invoice can contain at most 500 items."),
});

/* -------------------------------- payments ------------------------------- */

export const paymentSchema = z.object({
  amount: z
    .number({ invalid_type_error: "Amount must be a number." })
    .positive("Payment amount must be greater than zero.")
    .max(1_000_000_000),
  payment_date: date,
  payment_method: z.enum(PAYMENT_METHODS as [string, ...string[]], {
    errorMap: () => ({ message: "Select a valid payment method." }),
  }),
  transaction_reference: optionalTrimmed(120),
  notes: optionalTrimmed(500),
});

export const cancelSchema = z.object({
  restore: z.boolean().optional(),
  reason: optionalTrimmed(300),
});

export function assertApiError(error: unknown): never {
  if (error instanceof ApiError) throw error;
  throw error;
}
