import { Router } from "../router";
import { ok } from "../http";
import { conflict, notFound, unprocessable } from "../errors";
import { CalculationError, calculateInvoice, derivePaymentStatus, type InvoiceCalcResult } from "~shared/gst";
import type { PaymentStatus } from "~shared/gst";
import {
  getBusiness,
  getInvoiceSettings,
  intParam,
  newId,
  nowIso,
  ownedRow,
  toBool,
  trimOrNull,
} from "../helpers";
import { logAudit } from "../audit";
import { cancelSchema, invoiceSchema, parse, paymentSchema } from "../validate";
import type {
  Business,
  CreateInvoicePayload,
  Customer,
  Invoice,
  InvoiceDetail,
  InvoiceItem,
  InvoiceSettings,
  Page,
  Payment,
} from "~shared/types";

/* ------------------------------- helpers --------------------------------- */

/** "Today" in Asia/Kolkata so overdue checks match the business's calendar. */
function today(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

function displayStatus(invoice: Invoice): PaymentStatus | "overdue" {
  if (invoice.payment_status === "cancelled") return "cancelled";
  if (
    (invoice.payment_status === "unpaid" || invoice.payment_status === "partial") &&
    invoice.due_date &&
    invoice.due_date < today()
  ) {
    return "overdue";
  }
  return invoice.payment_status;
}

const INVOICE_SELECT = `
  SELECT i.*,
         c.name AS customer_name,
         c.gstin AS customer_gstin,
         c.state AS customer_state,
         (i.cgst + i.sgst + i.igst) AS gst_total,
         (SELECT COUNT(*) FROM invoice_items ii WHERE ii.invoice_id = i.id) AS item_count
  FROM invoices i
  LEFT JOIN customers c ON c.id = i.customer_id`;

export { INVOICE_SELECT };

export function serializeInvoice(row: Invoice): Invoice {
  const raw = row as unknown as { interstate: number | boolean };
  const interstate = raw.interstate === 1 || raw.interstate === true;
  const invoice: Invoice = { ...row, interstate };
  invoice.display_status = displayStatus(invoice);
  return invoice;
}

async function loadInvoiceDetail(env: import("../env").Env, businessId: string, invoiceId: string): Promise<InvoiceDetail> {
  const invoiceRow = await env.DB.prepare(`${INVOICE_SELECT} WHERE i.id = ? AND i.business_id = ?`)
    .bind(invoiceId, businessId)
    .first<Invoice>();
  if (!invoiceRow) throw notFound("Invoice not found.");

  const [itemRows, paymentRows, customer, business] = await Promise.all([
    env.DB.prepare(
      "SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY sort_order, rowid",
    )
      .bind(invoiceId)
      .all<InvoiceItem>(),
    env.DB.prepare("SELECT * FROM payments WHERE invoice_id = ? ORDER BY payment_date, created_at")
      .bind(invoiceId)
      .all<Payment>(),
    env.DB.prepare("SELECT * FROM customers WHERE id = ? AND business_id = ?")
      .bind(invoiceRow.customer_id, businessId)
      .first<Customer>(),
    env.DB.prepare("SELECT * FROM businesses WHERE id = ?").bind(businessId).first<Business>(),
  ]);

  if (!customer || !business) throw notFound("Invoice references data that no longer exists.");

  return {
    invoice: serializeInvoice(invoiceRow),
    items: itemRows.results ?? [],
    payments: paymentRows.results ?? [],
    customer,
    business,
    settings: await getInvoiceSettings(env, businessId),
  };
}

/** Validates customer + products and runs the authoritative GST calculation. */
async function validateAndCalculate(
  env: import("../env").Env,
  business: Business,
  settings: InvoiceSettings,
  input: CreateInvoicePayload,
): Promise<{ customer: Customer; calc: InvoiceCalcResult }> {
  if (!business.state) {
    throw unprocessable(
      "Your business state is missing. Add it in Settings > Business Profile so GST can be calculated.",
    );
  }

  const customer = await env.DB.prepare(
    "SELECT * FROM customers WHERE id = ? AND business_id = ?",
  )
    .bind(input.customer_id, business.id)
    .first<Customer>();
  if (!customer) throw unprocessable("Please select a valid customer.");

  const productIds = [...new Set(input.items.map((i) => i.product_id).filter(Boolean))] as string[];
  if (productIds.length > 0) {
    const placeholders = productIds.map(() => "?").join(",");
    const rows = await env.DB.prepare(
      `SELECT id FROM products WHERE business_id = ? AND id IN (${placeholders})`,
    )
      .bind(business.id, ...productIds)
      .all<{ id: string }>();
    const found = new Set((rows.results ?? []).map((r) => r.id));
    for (const id of productIds) {
      if (!found.has(id)) throw unprocessable("One of the selected products does not belong to your business.");
    }
  }

  try {
    const calc = calculateInvoice({
      seller_state: business.state ?? "",
      customer_state: customer.state ?? "",
      place_of_supply: input.place_of_supply || customer.place_of_supply || customer.state,
      items: input.items.map((item) => ({
        product_id: item.product_id ?? null,
        item_name: item.item_name,
        description: item.description ?? null,
        hsn_sac: item.hsn_sac ?? null,
        rate: item.rate,
        quantity: item.quantity,
        unit: item.unit ?? "PCS",
        gst_rate: item.gst_rate,
        cess_rate: item.cess_rate ?? 0,
        discount_type: item.discount_type,
        discount_value: item.discount_value ?? 0,
      })),
      discount_type: input.discount_type,
      discount_value: input.discount_value ?? 0,
      round_to_rupee: toBool(settings.round_to_rupee),
    });
    return { customer, calc };
  } catch (error) {
    if (error instanceof CalculationError) throw unprocessable(error.message);
    throw error;
  }
}

/**
 * Keeps `invoice_settings.next_invoice_number` ahead of the numbers actually in use.
 * The invoice form submits the number it was shown, so the counter has to follow it -
 * otherwise Settings keeps offering numbers that are already taken.
 */
async function advanceInvoiceCounter(
  env: import("../env").Env,
  businessId: string,
  settings: InvoiceSettings,
  usedNumber: string,
): Promise<void> {
  const prefix = (settings.invoice_prefix || "INV").toUpperCase();
  const pattern = `^${prefix.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")}-(\\d+)$`;
  const match = new RegExp(pattern).exec(usedNumber.trim().toUpperCase());
  if (!match) return;

  const seq = Number(match[1]);
  if (!Number.isFinite(seq)) return;

  const current = Math.max(1, Number(settings.next_invoice_number) || 1);
  if (seq < current) return;

  // Monotonic guard: only move the counter forward, never backwards.
  await env.DB.prepare(
    `UPDATE invoice_settings SET next_invoice_number = ?, updated_at = ?
     WHERE business_id = ? AND next_invoice_number <= ?`,
  )
    .bind(seq + 1, nowIso(), businessId, seq)
    .run();
}

/** Generates `PREFIX-0001` style numbers, unique per business. */
async function resolveInvoiceNumber(
  env: import("../env").Env,
  businessId: string,
  settings: InvoiceSettings,
  requested?: string | null,
): Promise<string> {
  if (requested) {
    const dup = await env.DB.prepare(
      "SELECT 1 AS x FROM invoices WHERE business_id = ? AND invoice_number = ?",
    )
      .bind(businessId, requested)
      .first();
    if (dup) throw conflict(`Invoice number ${requested} already exists. Choose a different number.`);
    await advanceInvoiceCounter(env, businessId, settings, requested);
    return requested;
  }

  const prefix = (settings.invoice_prefix || "INV").toUpperCase();
  let seq = Math.max(1, Number(settings.next_invoice_number) || 1);

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = `${prefix}-${String(seq).padStart(4, "0")}`;
    const dup = await env.DB.prepare(
      "SELECT 1 AS x FROM invoices WHERE business_id = ? AND invoice_number = ?",
    )
      .bind(businessId, candidate)
      .first();

    if (!dup) {
      const result = await env.DB.prepare(
        `UPDATE invoice_settings SET next_invoice_number = ?, updated_at = ?
         WHERE business_id = ? AND next_invoice_number <= ?`,
      )
        .bind(seq + 1, nowIso(), businessId, seq)
        .run();
      if ((result.meta.changes ?? 0) > 0) return candidate;

      const fresh = await env.DB.prepare(
        "SELECT next_invoice_number FROM invoice_settings WHERE business_id = ?",
      )
        .bind(businessId)
        .first<{ next_invoice_number: number }>();
      seq = Math.max(seq + 1, Number(fresh?.next_invoice_number ?? seq + 1));
      continue;
    }
    seq += 1;
  }

  throw conflict("Unable to generate a unique invoice number. Please change the prefix in Settings > Invoice.");
}

function invoiceStatements(
  env: import("../env").Env,
  values: Record<string, unknown>,
): ReturnType<typeof env.DB.prepare> {
  return env.DB.prepare(
    `INSERT INTO invoices (id, business_id, customer_id, invoice_number, invoice_date, due_date,
      place_of_supply, reference_number, payment_terms, shipping_address, subtotal, discount,
      discount_type, discount_value, taxable_amount, cgst, sgst, igst, cess, round_off, grand_total,
      amount_paid, balance_due, payment_status, interstate, notes, terms, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    values["id"],
    values["business_id"],
    values["customer_id"],
    values["invoice_number"],
    values["invoice_date"],
    values["due_date"],
    values["place_of_supply"],
    values["reference_number"],
    values["payment_terms"],
    values["shipping_address"],
    values["subtotal"],
    values["discount"],
    values["discount_type"],
    values["discount_value"],
    values["taxable_amount"],
    values["cgst"],
    values["sgst"],
    values["igst"],
    values["cess"],
    values["round_off"],
    values["grand_total"],
    values["amount_paid"],
    values["balance_due"],
    values["payment_status"],
    values["interstate"],
    values["notes"],
    values["terms"],
    values["created_at"],
    values["updated_at"],
  );
}

function itemStatements(
  env: import("../env").Env,
  invoiceId: string,
  calc: InvoiceCalcResult,
  input: CreateInvoicePayload,
): ReturnType<typeof env.DB.prepare>[] {
  return calc.items.map((line, index) => {
    const source = input.items[index];
    return env.DB.prepare(
      `INSERT INTO invoice_items (id, invoice_id, product_id, item_name, description, hsn_sac, rate,
        quantity, unit, discount, discount_type, discount_value, taxable_value, gst_rate, cgst, sgst,
        igst, cess, total_amount, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      newId(),
      invoiceId,
      source?.product_id ?? null,
      line.item_name,
      line.description,
      line.hsn_sac,
      line.rate,
      line.quantity,
      line.unit,
      line.discount,
      source?.discount_type ?? null,
      source?.discount_value ?? 0,
      line.taxable_value,
      line.gst_rate,
      line.cgst,
      line.sgst,
      line.igst,
      line.cess,
      line.total_amount,
      index + 1,
    );
  });
}

function invoiceValues(
  business: Business,
  input: CreateInvoicePayload,
  calc: InvoiceCalcResult,
  base: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...base,
    subtotal: calc.subtotal,
    discount: calc.discount,
    discount_type: input.discount_type ?? null,
    discount_value: input.discount_value ?? 0,
    taxable_amount: calc.taxable_amount,
    cgst: calc.cgst,
    sgst: calc.sgst,
    igst: calc.igst,
    cess: calc.cess,
    round_off: calc.round_off,
    grand_total: calc.grand_total,
    interstate: calc.interstate ? 1 : 0,
    business_id: business.id,
    customer_id: input.customer_id,
    invoice_date: input.invoice_date,
    due_date: input.due_date ?? null,
    place_of_supply: input.place_of_supply || null,
    reference_number: trimOrNull(input.reference_number),
    payment_terms: trimOrNull(input.payment_terms),
    shipping_address: trimOrNull(input.shipping_address),
    notes: trimOrNull(input.notes),
    terms: trimOrNull(input.terms),
  };
}

/* -------------------------------- routes --------------------------------- */

export function registerInvoiceRoutes(router: Router): void {
  // ------------------------------------------------- next invoice number
  router.get("/api/invoices/next-number", async ({ env, user }) => {
    const business = await getBusiness(env, user.id);
    const settings = await getInvoiceSettings(env, business.id);
    const prefix = (settings.invoice_prefix || "INV").toUpperCase();
    let seq = Math.max(1, Number(settings.next_invoice_number) || 1);
    for (let attempt = 0; attempt < 500; attempt += 1) {
      const candidate = `${prefix}-${String(seq).padStart(4, "0")}`;
      const dup = await env.DB.prepare(
        "SELECT 1 AS x FROM invoices WHERE business_id = ? AND invoice_number = ?",
      )
        .bind(business.id, candidate)
        .first();
      if (!dup) return ok({ invoice_number: candidate });
      seq += 1;
    }
    return ok({ invoice_number: `${prefix}-${Date.now()}` });
  });

  // ------------------------------------------------------------- list/get
  router.get("/api/invoices", async ({ env, user, query }) => {
    const business = await getBusiness(env, user.id);
    const search = (query.get("search") ?? query.get("q") ?? "").trim();
    const status = (query.get("status") ?? "").trim().toLowerCase();
    const from = (query.get("from") ?? "").trim();
    const to = (query.get("to") ?? "").trim();
    const customerId = (query.get("customer_id") ?? "").trim();
    const page = intParam(query, "page", 1, 1, 100000);
    const limit = intParam(query, "limit", 25, 1, 200);
    const sortMap: Record<string, string> = {
      date: "i.invoice_date",
      number: "i.invoice_number",
      amount: "i.grand_total",
      status: "i.payment_status",
      created: "i.created_at",
    };
    const sortCol = sortMap[(query.get("sort") ?? "date").toLowerCase()] ?? "i.invoice_date";
    const direction = (query.get("order") ?? "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
    const day = today();

    const where: string[] = ["i.business_id = ?"];
    const args: unknown[] = [business.id];

    if (search) {
      where.push("(i.invoice_number LIKE ? OR c.name LIKE ? OR c.gstin LIKE ? OR i.reference_number LIKE ?)");
      const like = `%${search}%`;
      args.push(like, like, like, like);
    }
    if (from) {
      where.push("i.invoice_date >= ?");
      args.push(from);
    }
    if (to) {
      where.push("i.invoice_date <= ?");
      args.push(to);
    }
    if (customerId) {
      where.push("i.customer_id = ?");
      args.push(customerId);
    }
    if (status && status !== "all") {
      if (status === "overdue") {
        where.push("i.payment_status IN ('unpaid', 'partial') AND i.due_date IS NOT NULL AND i.due_date < ?");
        args.push(day);
      } else if (["unpaid", "partial", "paid", "cancelled"].includes(status)) {
        where.push("i.payment_status = ?");
        args.push(status);
      }
    }

    const whereSql = where.join(" AND ");
    const countRow = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM invoices i LEFT JOIN customers c ON c.id = i.customer_id WHERE ${whereSql}`,
    )
      .bind(...args)
      .first<{ n: number }>();

    const rows = await env.DB.prepare(
      `${INVOICE_SELECT} WHERE ${whereSql} ORDER BY ${sortCol} ${direction}, i.created_at ${direction} LIMIT ? OFFSET ?`,
    )
      .bind(...args, limit, (page - 1) * limit)
      .all<Invoice>();

    const payload: Page<Invoice> = {
      items: (rows.results ?? []).map(serializeInvoice),
      total: Number(countRow?.n ?? 0),
      page,
      limit,
    };
    return ok(payload);
  });

  router.get("/api/invoices/:id", async ({ env, user, params }) => {
    const business = await getBusiness(env, user.id);
    return ok(await loadInvoiceDetail(env, business.id, params["id"]));
  });

  // -------------------------------------------------------------- create
  router.post("/api/invoices", async ({ env, user, body }) => {
    const input = parse(invoiceSchema, body) as CreateInvoicePayload;
    const business = await getBusiness(env, user.id);
    const settings = await getInvoiceSettings(env, business.id);

    // validate customer ownership + products, then calculate server-side
    const { calc } = await validateAndCalculate(env, business, settings, input);

    // unique invoice number (per business)
    const invoiceId = newId();
    const invoiceNumber = await resolveInvoiceNumber(env, business.id, settings, input.invoice_number);
    const now = nowIso();

    const values = invoiceValues(business, input, calc, {
      id: invoiceId,
      invoice_number: invoiceNumber,
      amount_paid: 0,
      balance_due: calc.grand_total,
      payment_status: "unpaid",
      created_at: now,
      updated_at: now,
    });

    await env.DB.batch([
      invoiceStatements(env, values),
      ...itemStatements(env, invoiceId, calc, input),
    ]);

    await logAudit(env, {
      userId: user.id,
      businessId: business.id,
      action: "invoice.created",
      entityType: "invoice",
      entityId: invoiceId,
      detail: `${invoiceNumber} - ${calc.grand_total.toFixed(2)}`,
    });

    return ok(await loadInvoiceDetail(env, business.id, invoiceId), 201);
  });

  // --------------------------------------------------------------- update
  router.put("/api/invoices/:id", async ({ env, user, params, body }) => {
    const business = await getBusiness(env, user.id);
    const existing = await ownedRow<Invoice>(env, "invoices", params["id"], business.id);

    // ---- status changes --------------------------------------------------
    if (!body["items"]) {
      const statusInput = parse(cancelSchema, body);

      if (statusInput.restore) {
        if (existing.payment_status !== "cancelled") {
          throw unprocessable("This invoice is not cancelled.");
        }
        const status = derivePaymentStatus(existing.grand_total, existing.amount_paid);
        await env.DB.prepare(
          "UPDATE invoices SET payment_status = ?, cancelled_at = NULL, updated_at = ? WHERE id = ? AND business_id = ?",
        )
          .bind(status, nowIso(), existing.id, business.id)
          .run();
        await logAudit(env, {
          userId: user.id,
          businessId: business.id,
          action: "invoice.restored",
          entityType: "invoice",
          entityId: existing.id,
          detail: existing.invoice_number,
        });
        return ok(await loadInvoiceDetail(env, business.id, existing.id));
      }

      if (body["payment_status"] === "cancelled") {
        await env.DB.prepare(
          "UPDATE invoices SET payment_status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE id = ? AND business_id = ?",
        )
          .bind(nowIso(), nowIso(), existing.id, business.id)
          .run();
        await logAudit(env, {
          userId: user.id,
          businessId: business.id,
          action: "invoice.cancelled",
          entityType: "invoice",
          entityId: existing.id,
          detail: trimOrNull(statusInput.reason) ?? existing.invoice_number,
        });
        return ok(await loadInvoiceDetail(env, business.id, existing.id));
      }

      throw unprocessable("Unsupported invoice update.");
    }

    // ---- full edit -------------------------------------------------------
    if (existing.payment_status === "cancelled") {
      throw conflict("This invoice is cancelled. Restore it before editing.");
    }

    const input = parse(invoiceSchema, body) as CreateInvoicePayload;
    const settings = await getInvoiceSettings(env, business.id);
    const { calc } = await validateAndCalculate(env, business, settings, input);

    let invoiceNumber = existing.invoice_number;
    if (input.invoice_number && input.invoice_number !== existing.invoice_number) {
      invoiceNumber = await resolveInvoiceNumber(env, business.id, settings, input.invoice_number);
    }

    const now = nowIso();
    const amountPaid = Number(existing.amount_paid ?? 0);
    const balanceDue = Math.max(Number((calc.grand_total as number)) - amountPaid, 0);
    const status = derivePaymentStatus(calc.grand_total, amountPaid);

    const values = invoiceValues(business, input, calc, {
      id: existing.id,
      invoice_number: invoiceNumber,
      amount_paid: amountPaid,
      balance_due: balanceDue,
      payment_status: status,
      created_at: existing.created_at,
      updated_at: now,
    });

    await env.DB.batch([
      env.DB.prepare(
        `UPDATE invoices SET customer_id = ?, invoice_number = ?, invoice_date = ?, due_date = ?,
          place_of_supply = ?, reference_number = ?, payment_terms = ?, shipping_address = ?,
          subtotal = ?, discount = ?, discount_type = ?, discount_value = ?, taxable_amount = ?,
          cgst = ?, sgst = ?, igst = ?, cess = ?, round_off = ?, grand_total = ?, amount_paid = ?,
          balance_due = ?, payment_status = ?, interstate = ?, notes = ?, terms = ?, updated_at = ?
         WHERE id = ? AND business_id = ?`,
      ).bind(
        values["customer_id"],
        values["invoice_number"],
        values["invoice_date"],
        values["due_date"],
        values["place_of_supply"],
        values["reference_number"],
        values["payment_terms"],
        values["shipping_address"],
        values["subtotal"],
        values["discount"],
        values["discount_type"],
        values["discount_value"],
        values["taxable_amount"],
        values["cgst"],
        values["sgst"],
        values["igst"],
        values["cess"],
        values["round_off"],
        values["grand_total"],
        values["amount_paid"],
        values["balance_due"],
        values["payment_status"],
        values["interstate"],
        values["notes"],
        values["terms"],
        values["updated_at"],
        existing.id,
        business.id,
      ),
      env.DB.prepare("DELETE FROM invoice_items WHERE invoice_id = ?").bind(existing.id),
      ...itemStatements(env, existing.id, calc, input),
    ]);

    await logAudit(env, {
      userId: user.id,
      businessId: business.id,
      action: "invoice.updated",
      entityType: "invoice",
      entityId: existing.id,
      detail: `${invoiceNumber} - ${calc.grand_total.toFixed(2)}`,
    });

    return ok(await loadInvoiceDetail(env, business.id, existing.id));
  });

  // --------------------------------------------------------------- delete
  router.delete("/api/invoices/:id", async ({ env, user, params }) => {
    const business = await getBusiness(env, user.id);
    const existing = await ownedRow<Invoice>(env, "invoices", params["id"], business.id);

    const payments = await env.DB.prepare("SELECT COUNT(*) AS n FROM payments WHERE invoice_id = ?")
      .bind(existing.id)
      .first<{ n: number }>();
    if (Number(payments?.n ?? 0) > 0) {
      throw conflict(
        `Invoice ${existing.invoice_number} has recorded payments and cannot be deleted. Cancel it instead.`,
      );
    }

    await env.DB.prepare("DELETE FROM invoices WHERE id = ? AND business_id = ?")
      .bind(existing.id, business.id)
      .run();

    await logAudit(env, {
      userId: user.id,
      businessId: business.id,
      action: "invoice.deleted",
      entityType: "invoice",
      entityId: existing.id,
      detail: existing.invoice_number,
    });

    return ok({ deleted: true, id: existing.id });
  });

  // -------------------------------------------------------- record payment
  router.post("/api/invoices/:id/payment", async ({ env, user, params, body }) => {
    const input = parse(paymentSchema, body);
    const business = await getBusiness(env, user.id);
    const invoice = await ownedRow<Invoice>(env, "invoices", params["id"], business.id);

    if (invoice.payment_status === "cancelled") {
      throw conflict("Cancelled invoices cannot receive payments.");
    }

    const balance = Math.max(Number(invoice.balance_due ?? 0), 0);
    if (input.amount > balance + 0.0001) {
      throw unprocessable(
        `Payment amount exceeds the balance due (${balance.toFixed(2)}).`,
      );
    }

    const paymentId = newId();
    const now = nowIso();
    const newPaid = Math.round((Number(invoice.amount_paid ?? 0) + input.amount) * 100) / 100;
    const newBalance = Math.max(Math.round((Number(invoice.grand_total) - newPaid) * 100) / 100, 0);
    const status = derivePaymentStatus(invoice.grand_total, newPaid);

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO payments (id, business_id, invoice_id, amount, payment_date, payment_method, transaction_reference, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        paymentId,
        business.id,
        invoice.id,
        input.amount,
        input.payment_date,
        input.payment_method,
        trimOrNull(input.transaction_reference),
        trimOrNull(input.notes),
        now,
      ),
      env.DB.prepare(
        `UPDATE invoices SET amount_paid = ?, balance_due = ?, payment_status = ?, updated_at = ?
         WHERE id = ? AND business_id = ?`,
      ).bind(newPaid, newBalance, status, now, invoice.id, business.id),
    ]);

    await logAudit(env, {
      userId: user.id,
      businessId: business.id,
      action: "payment.recorded",
      entityType: "invoice",
      entityId: invoice.id,
      detail: `${invoice.invoice_number}: ${input.amount.toFixed(2)} via ${input.payment_method}`,
    });

    return ok(
      {
        payment: await env.DB.prepare("SELECT * FROM payments WHERE id = ?").bind(paymentId).first<Payment>(),
        invoice: serializeInvoice(
          (await env.DB.prepare(`${INVOICE_SELECT} WHERE i.id = ? AND i.business_id = ?`)
            .bind(invoice.id, business.id)
            .first<Invoice>()) as Invoice,
        ),
      },
      201,
    );
  });
}
