import { Router } from "../router";
import { ok } from "../http";
import { unprocessable } from "../errors";
import { getBusiness, intParam, newId, nowIso, ownedRow } from "../helpers";
import { logAudit } from "../audit";
import type { Env } from "../env";
import type { Invoice, Page, Payment } from "~shared/types";

interface PaymentRow extends Payment {
  invoice_number: string;
  customer_name: string | null;
  grand_total: number;
}
const PAYMENT_SELECT = `
  SELECT p.*, i.invoice_number, i.grand_total, i.payment_status, c.name AS customer_name
  FROM payments p
  JOIN invoices i ON i.id = p.invoice_id
  LEFT JOIN customers c ON c.id = i.customer_id`;

async function recomputeInvoiceTotals(env: Env, invoiceId: string): Promise<void> {
  const invoice = await env.DB.prepare(
    "SELECT grand_total, amount_paid, cancelled_at FROM invoices WHERE id = ?",
  )
    .bind(invoiceId)
    .first<{ grand_total: number; amount_paid: number; cancelled_at: string | null }>();
  if (!invoice) return;

  const paidRow = await env.DB.prepare(
    "SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE invoice_id = ?",
  )
    .bind(invoiceId)
    .first<{ paid: number }>();

  const paid = Math.round(Number(paidRow?.paid ?? 0) * 100) / 100;
  const balance = Math.max(Math.round((Number(invoice.grand_total) - paid) * 100) / 100, 0);

  let status: string;
  if (invoice.cancelled_at) {
    status = "cancelled";
  } else if (paid <= 0) {
    status = "unpaid";
  } else if (paid >= Number(invoice.grand_total)) {
    status = "paid";
  } else {
    status = "partial";
  }

  await env.DB.prepare(
    "UPDATE invoices SET amount_paid = ?, balance_due = ?, payment_status = ?, updated_at = ? WHERE id = ?",
  )
    .bind(paid, balance, status, nowIso(), invoiceId)
    .run();
}

export function registerPaymentRoutes(router: Router): void {
  router.get("/api/payments", async ({ env, user, query }) => {
    const business = await getBusiness(env, user.id);
    const from = (query.get("from") ?? "").trim();
    const to = (query.get("to") ?? "").trim();
    const method = (query.get("method") ?? "").trim();
    const invoiceId = (query.get("invoice_id") ?? "").trim();
    const search = (query.get("search") ?? "").trim();
    const page = intParam(query, "page", 1, 1, 100000);
    const limit = intParam(query, "limit", 25, 1, 200);

    const where: string[] = ["p.business_id = ?"];
    const args: unknown[] = [business.id];
    if (from) {
      where.push("p.payment_date >= ?");
      args.push(from);
    }
    if (to) {
      where.push("p.payment_date <= ?");
      args.push(to);
    }
    if (method) {
      where.push("p.payment_method = ?");
      args.push(method);
    }
    if (invoiceId) {
      where.push("p.invoice_id = ?");
      args.push(invoiceId);
    }
    if (search) {
      where.push("(i.invoice_number LIKE ? OR c.name LIKE ? OR p.transaction_reference LIKE ?)");
      const like = `%${search}%`;
      args.push(like, like, like);
    }
    const whereSql = where.join(" AND ");

    const countRow = await env.DB.prepare(
      `SELECT COUNT(*) AS n, COALESCE(ROUND(SUM(p.amount), 2), 0) AS total
       FROM payments p JOIN invoices i ON i.id = p.invoice_id LEFT JOIN customers c ON c.id = i.customer_id
       WHERE ${whereSql}`,
    )
      .bind(...args)
      .first<{ n: number; total: number }>();

    const rows = await env.DB.prepare(
      `${PAYMENT_SELECT} WHERE ${whereSql} ORDER BY p.payment_date DESC, p.created_at DESC LIMIT ? OFFSET ?`,
    )
      .bind(...args, limit, (page - 1) * limit)
      .all<PaymentRow>();

    const payload: Page<PaymentRow> & { total_amount: number } = {
      items: rows.results ?? [],
      total: Number(countRow?.n ?? 0),
      total_amount: Number(countRow?.total ?? 0),
      page,
      limit,
    };
    return ok(payload);
  });

  router.delete("/api/payments/:id", async ({ env, user, params }) => {
    const business = await getBusiness(env, user.id);
    const payment = await ownedRow<Payment>(env, "payments", params["id"], business.id);

    const invoiceRow = await env.DB.prepare(
      "SELECT id, invoice_number FROM invoices WHERE id = ? AND business_id = ?",
    )
      .bind(payment.invoice_id, business.id)
      .first<{ id: string; invoice_number: string }>();
    if (!invoiceRow) throw unprocessable("The invoice linked to this payment no longer exists.");

    await env.DB.batch([
      env.DB.prepare("DELETE FROM payments WHERE id = ? AND business_id = ?").bind(
        payment.id,
        business.id,
      ),
    ]);
    await recomputeInvoiceTotals(env, invoiceRow.id);

    await logAudit(env, {
      userId: user.id,
      businessId: business.id,
      action: "payment.deleted",
      entityType: "payment",
      entityId: payment.id,
      detail: `${invoiceRow.invoice_number}: ${Number(payment.amount).toFixed(2)}`,
    });

    return ok({ deleted: true, id: payment.id });
  });
}
