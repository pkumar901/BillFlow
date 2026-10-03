import { Router } from "../router";
import { ok } from "../http";
import { getBusiness, intParam } from "../helpers";
import { INVOICE_SELECT, serializeInvoice } from "./invoices";
import type {
  CustomerReportRow,
  DashboardData,
  GstReport,
  Invoice,
  OutstandingRow,
  PaymentReport,
  ProductReportRow,
  SalesReport,
} from "~shared/types";

/** "Today" in Asia/Kolkata. */
function today(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

function bounds(query: URLSearchParams): { from: string; to: string } {
  const from = (query.get("from") ?? "").trim() || "0000-01-01";
  const to = (query.get("to") ?? "").trim() || "9999-12-31";
  return { from, to };
}

function groupFormat(groupBy: string): string {
  if (groupBy === "day") return "%Y-%m-%d";
  if (groupBy === "year") return "%Y";
  return "%Y-%m";
}

export function registerReportRoutes(router: Router): void {
  // -------------------------------------------------------------- dashboard
  router.get("/api/dashboard", async ({ env, user }) => {
    const business = await getBusiness(env, user.id);
    const day = today();
    const month = day.slice(0, 7);
    const shifted = new Date(Date.now() + 5.5 * 3600 * 1000);
    const seriesStart = new Date(
      Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() - 11, 1),
    )
      .toISOString()
      .slice(0, 10);

    const totals = await env.DB.prepare(
      `SELECT COUNT(*) AS invoice_count,
              COALESCE(ROUND(SUM(grand_total), 2), 0) AS total_sales,
              COALESCE(ROUND(SUM(amount_paid), 2), 0) AS paid_amount,
              COALESCE(ROUND(SUM(balance_due), 2), 0) AS pending_amount,
              COALESCE(ROUND(SUM(cgst + sgst + igst), 2), 0) AS gst_collected
       FROM invoices WHERE business_id = ? AND payment_status <> 'cancelled'`,
    )
      .bind(business.id)
      .first<Record<string, number>>();

    const monthTotals = await env.DB.prepare(
      `SELECT COUNT(*) AS invoice_count, COALESCE(ROUND(SUM(grand_total), 2), 0) AS total_sales
       FROM invoices
       WHERE business_id = ? AND payment_status <> 'cancelled' AND strftime('%Y-%m', invoice_date) = ?`,
    )
      .bind(business.id, month)
      .first<Record<string, number>>();

    const counts = await env.DB.prepare(
      `SELECT
        (SELECT COUNT(*) FROM customers WHERE business_id = ?) AS customer_count,
        (SELECT COUNT(*) FROM products WHERE business_id = ?) AS product_count,
        (SELECT COUNT(*) FROM invoices WHERE business_id = ? AND payment_status IN ('unpaid','partial')
            AND due_date IS NOT NULL AND due_date < ?) AS overdue_count`,
    )
      .bind(business.id, business.id, business.id, day)
      .first<Record<string, number>>();

    const recentInvoices = await env.DB.prepare(
      `${INVOICE_SELECT} WHERE i.business_id = ? ORDER BY i.created_at DESC LIMIT 6`,
    )
      .bind(business.id)
      .all<Invoice>();

    const recentCustomers = await env.DB.prepare(
      "SELECT * FROM customers WHERE business_id = ? ORDER BY created_at DESC LIMIT 6",
    )
      .bind(business.id)
      .all<DashboardData["recent_customers"][number]>();

    const overdueRows = await env.DB.prepare(
      `${INVOICE_SELECT} WHERE i.business_id = ? AND i.payment_status IN ('unpaid','partial')
         AND i.due_date IS NOT NULL AND i.due_date < ?
       ORDER BY i.due_date ASC LIMIT 5`,
    )
      .bind(business.id, day)
      .all<Invoice>();

    const monthlyRows = await env.DB.prepare(
      `SELECT strftime('%Y-%m', invoice_date) AS period,
              COALESCE(ROUND(SUM(grand_total), 2), 0) AS sales,
              COUNT(*) AS invoices
       FROM invoices
       WHERE business_id = ? AND payment_status <> 'cancelled' AND invoice_date >= ?
       GROUP BY period ORDER BY period ASC`,
    )
      .bind(business.id, seriesStart)
      .all<{ period: string; sales: number; invoices: number }>();

    const statusRows = await env.DB.prepare(
      `SELECT payment_status AS status, COUNT(*) AS count, COALESCE(ROUND(SUM(grand_total), 2), 0) AS amount
       FROM invoices WHERE business_id = ? GROUP BY payment_status`,
    )
      .bind(business.id)
      .all<{ status: string; count: number; amount: number }>();

    const gstRows = await env.DB.prepare(
      `SELECT ii.gst_rate,
              ROUND(SUM(ii.taxable_value), 2) AS taxable_amount,
              ROUND(SUM(ii.cgst + ii.sgst + ii.igst), 2) AS gst_amount
       FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
       WHERE i.business_id = ? AND i.payment_status <> 'cancelled'
       GROUP BY ii.gst_rate ORDER BY ii.gst_rate`,
    )
      .bind(business.id)
      .all<{ gst_rate: number; taxable_amount: number; gst_amount: number }>();

    const monthLabels: DashboardData["monthly_sales"] = (monthlyRows.results ?? []).map((row) => ({
      period: row.period,
      label: row.period,
      sales: Number(row.sales),
      invoices: Number(row.invoices),
    }));

    const data: DashboardData = {
      total_sales: Number(totals?.total_sales ?? 0),
      invoice_count: Number(totals?.invoice_count ?? 0),
      paid_amount: Number(totals?.paid_amount ?? 0),
      pending_amount: Number(totals?.pending_amount ?? 0),
      gst_collected: Number(totals?.gst_collected ?? 0),
      month_sales: Number(monthTotals?.total_sales ?? 0),
      month_invoices: Number(monthTotals?.invoice_count ?? 0),
      overdue_count: Number(counts?.overdue_count ?? 0),
      customer_count: Number(counts?.customer_count ?? 0),
      product_count: Number(counts?.product_count ?? 0),
      recent_invoices: (recentInvoices.results ?? []).map(serializeInvoice),
      recent_customers: recentCustomers.results ?? [],
      overdue_invoices: (overdueRows.results ?? []).map(serializeInvoice),
      monthly_sales: monthLabels,
      status_split: (statusRows.results ?? []).map((r) => ({
        status: r.status,
        count: Number(r.count),
        amount: Number(r.amount),
      })),
      gst_by_rate: (gstRows.results ?? []).map((r) => ({
        gst_rate: Number(r.gst_rate),
        taxable_amount: Number(r.taxable_amount),
        gst_amount: Number(r.gst_amount),
      })),
    };

    return ok(data);
  });

  // ------------------------------------------------------------- sales report
  router.get("/api/reports/sales", async ({ env, user, query }) => {
    const business = await getBusiness(env, user.id);
    const { from, to } = bounds(query);
    const groupBy = (query.get("groupBy") ?? query.get("group_by") ?? "month").toLowerCase();
    const fmt = groupFormat(groupBy);

    const rows = await env.DB.prepare(
      `SELECT strftime(?, invoice_date) AS period,
              COUNT(*) AS invoice_count,
              COALESCE(ROUND(SUM(taxable_amount), 2), 0) AS taxable_amount,
              COALESCE(ROUND(SUM(cgst + sgst + igst), 2), 0) AS gst,
              COALESCE(ROUND(SUM(grand_total), 2), 0) AS grand_total
       FROM invoices
       WHERE business_id = ? AND payment_status <> 'cancelled' AND invoice_date >= ? AND invoice_date <= ?
       GROUP BY period ORDER BY period ASC`,
    )
      .bind(fmt, business.id, from, to)
      .all<{ period: string; invoice_count: number; taxable_amount: number; gst: number; grand_total: number }>();

    const summary = await env.DB.prepare(
      `SELECT COUNT(*) AS invoice_count,
              COALESCE(ROUND(SUM(taxable_amount), 2), 0) AS taxable_amount,
              COALESCE(ROUND(SUM(cgst + sgst + igst), 2), 0) AS gst,
              COALESCE(ROUND(SUM(grand_total), 2), 0) AS grand_total
       FROM invoices
       WHERE business_id = ? AND payment_status <> 'cancelled' AND invoice_date >= ? AND invoice_date <= ?`,
    )
      .bind(business.id, from, to)
      .first<Record<string, number>>();

    const payload: SalesReport = {
      rows: (rows.results ?? []).map((r) => ({
        period: r.period,
        label: r.period,
        invoice_count: Number(r.invoice_count),
        taxable_amount: Number(r.taxable_amount),
        gst: Number(r.gst),
        grand_total: Number(r.grand_total),
      })),
      summary: {
        invoice_count: Number(summary?.invoice_count ?? 0),
        taxable_amount: Number(summary?.taxable_amount ?? 0),
        gst: Number(summary?.gst ?? 0),
        grand_total: Number(summary?.grand_total ?? 0),
      },
    };
    return ok(payload);
  });

  // -------------------------------------------------------------- gst report
  router.get("/api/reports/gst", async ({ env, user, query }) => {
    const business = await getBusiness(env, user.id);
    const { from, to } = bounds(query);

    const summary = await env.DB.prepare(
      `SELECT COUNT(*) AS invoice_count,
              COALESCE(ROUND(SUM(taxable_amount), 2), 0) AS taxable_amount,
              COALESCE(ROUND(SUM(cgst), 2), 0) AS cgst,
              COALESCE(ROUND(SUM(sgst), 2), 0) AS sgst,
              COALESCE(ROUND(SUM(igst), 2), 0) AS igst,
              COALESCE(ROUND(SUM(cess), 2), 0) AS cess,
              COALESCE(ROUND(SUM(cgst + sgst + igst), 2), 0) AS total_gst,
              COALESCE(ROUND(SUM(grand_total), 2), 0) AS grand_total,
              COALESCE(ROUND(SUM(CASE WHEN interstate = 1 THEN taxable_amount ELSE 0 END), 2), 0) AS interstate_taxable,
              COALESCE(ROUND(SUM(CASE WHEN interstate = 1 THEN igst ELSE 0 END), 2), 0) AS interstate_igst,
              COALESCE(ROUND(SUM(CASE WHEN interstate = 0 THEN taxable_amount ELSE 0 END), 2), 0) AS intrastate_taxable,
              COALESCE(ROUND(SUM(CASE WHEN interstate = 0 THEN cgst ELSE 0 END), 2), 0) AS intrastate_cgst,
              COALESCE(ROUND(SUM(CASE WHEN interstate = 0 THEN sgst ELSE 0 END), 2), 0) AS intrastate_sgst
       FROM invoices
       WHERE business_id = ? AND payment_status <> 'cancelled' AND invoice_date >= ? AND invoice_date <= ?`,
    )
      .bind(business.id, from, to)
      .first<Record<string, number>>();

    const byRate = await env.DB.prepare(
      `SELECT ii.gst_rate,
              COUNT(DISTINCT i.id) AS invoice_count,
              ROUND(SUM(ii.taxable_value), 2) AS taxable_amount,
              ROUND(SUM(ii.cgst), 2) AS cgst,
              ROUND(SUM(ii.sgst), 2) AS sgst,
              ROUND(SUM(ii.igst), 2) AS igst,
              ROUND(SUM(ii.cgst + ii.sgst + ii.igst), 2) AS total_gst
       FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
       WHERE i.business_id = ? AND i.payment_status <> 'cancelled'
         AND i.invoice_date >= ? AND i.invoice_date <= ?
       GROUP BY ii.gst_rate ORDER BY ii.gst_rate`,
    )
      .bind(business.id, from, to)
      .all<{ gst_rate: number; invoice_count: number; taxable_amount: number; cgst: number; sgst: number; igst: number; total_gst: number }>();

    const payload: GstReport = {
      summary: {
        invoice_count: Number(summary?.invoice_count ?? 0),
        taxable_amount: Number(summary?.taxable_amount ?? 0),
        cgst: Number(summary?.cgst ?? 0),
        sgst: Number(summary?.sgst ?? 0),
        igst: Number(summary?.igst ?? 0),
        cess: Number(summary?.cess ?? 0),
        total_gst: Number(summary?.total_gst ?? 0),
        grand_total: Number(summary?.grand_total ?? 0),
      },
      by_rate: (byRate.results ?? []).map((r) => ({
        gst_rate: Number(r.gst_rate),
        invoice_count: Number(r.invoice_count),
        taxable_amount: Number(r.taxable_amount),
        cgst: Number(r.cgst),
        sgst: Number(r.sgst),
        igst: Number(r.igst),
        total_gst: Number(r.total_gst),
      })),
      interstate: {
        taxable_amount: Number(summary?.interstate_taxable ?? 0),
        igst: Number(summary?.interstate_igst ?? 0),
      },
      intrastate: {
        taxable_amount: Number(summary?.intrastate_taxable ?? 0),
        cgst: Number(summary?.intrastate_cgst ?? 0),
        sgst: Number(summary?.intrastate_sgst ?? 0),
      },
    };
    return ok(payload);
  });

  // ------------------------------------------------------- outstanding report
  router.get("/api/reports/outstanding", async ({ env, user }) => {
    const business = await getBusiness(env, user.id);
    const day = today();

    const rows = await env.DB.prepare(
      `SELECT i.id, i.invoice_number, i.invoice_date, i.due_date, c.name AS customer_name,
              i.grand_total, i.amount_paid, i.balance_due, i.payment_status,
              CASE WHEN i.due_date IS NOT NULL AND i.due_date < ?
                   THEN CAST(ROUND(julianday(?) - julianday(i.due_date)) AS INTEGER) ELSE 0 END AS days_overdue
       FROM invoices i JOIN customers c ON c.id = i.customer_id
       WHERE i.business_id = ? AND i.balance_due > 0 AND i.payment_status <> 'cancelled'
       ORDER BY (i.due_date IS NULL) ASC, i.due_date ASC, i.invoice_date ASC`,
    )
      .bind(day, day, business.id)
      .all<OutstandingRow>();

    const total = (rows.results ?? []).reduce((sum, row) => sum + Number(row.balance_due ?? 0), 0);

    return ok({
      items: (rows.results ?? []).map((r) => ({ ...r, days_overdue: Number(r.days_overdue ?? 0) })),
      total_outstanding: Math.round(total * 100) / 100,
    });
  });

  // ---------------------------------------------------------- payment report
  router.get("/api/reports/payments", async ({ env, user, query }) => {
    const business = await getBusiness(env, user.id);
    const { from, to } = bounds(query);
    const groupBy = (query.get("groupBy") ?? "month").toLowerCase();
    const fmt = groupFormat(groupBy);

    const rows = await env.DB.prepare(
      `SELECT strftime(?, payment_date) AS period, COUNT(*) AS payment_count,
              COALESCE(ROUND(SUM(amount), 2), 0) AS amount
       FROM payments WHERE business_id = ? AND payment_date >= ? AND payment_date <= ?
       GROUP BY period ORDER BY period ASC`,
    )
      .bind(fmt, business.id, from, to)
      .all<{ period: string; payment_count: number; amount: number }>();

    const byMethod = await env.DB.prepare(
      `SELECT payment_method, COUNT(*) AS payment_count, COALESCE(ROUND(SUM(amount), 2), 0) AS amount
       FROM payments WHERE business_id = ? AND payment_date >= ? AND payment_date <= ?
       GROUP BY payment_method ORDER BY amount DESC`,
    )
      .bind(business.id, from, to)
      .all<{ payment_method: string; payment_count: number; amount: number }>();

    const summary = await env.DB.prepare(
      `SELECT COUNT(*) AS payment_count, COALESCE(ROUND(SUM(amount), 2), 0) AS amount
       FROM payments WHERE business_id = ? AND payment_date >= ? AND payment_date <= ?`,
    )
      .bind(business.id, from, to)
      .first<Record<string, number>>();

    const payload: PaymentReport = {
      rows: (rows.results ?? []).map((r) => ({
        period: r.period,
        label: r.period,
        payment_count: Number(r.payment_count),
        amount: Number(r.amount),
      })),
      by_method: (byMethod.results ?? []).map((r) => ({
        payment_method: r.payment_method,
        payment_count: Number(r.payment_count),
        amount: Number(r.amount),
      })),
      summary: {
        payment_count: Number(summary?.payment_count ?? 0),
        amount: Number(summary?.amount ?? 0),
      },
    };
    return ok(payload);
  });

  // -------------------------------------------------------- customer report
  router.get("/api/reports/customers", async ({ env, user, query }) => {
    const business = await getBusiness(env, user.id);
    const { from, to } = bounds(query);

    const rows = await env.DB.prepare(
      `SELECT c.id AS customer_id, c.name AS customer_name,
              COUNT(i.id) AS invoice_count,
              COALESCE(ROUND(SUM(i.taxable_amount), 2), 0) AS taxable_amount,
              COALESCE(ROUND(SUM(i.cgst + i.sgst + i.igst), 2), 0) AS gst,
              COALESCE(ROUND(SUM(i.grand_total), 2), 0) AS grand_total,
              COALESCE(ROUND(SUM(i.amount_paid), 2), 0) AS amount_paid,
              COALESCE(ROUND(SUM(i.balance_due), 2), 0) AS balance_due
       FROM customers c
       LEFT JOIN invoices i ON i.customer_id = c.id AND i.payment_status <> 'cancelled'
            AND i.invoice_date >= ? AND i.invoice_date <= ?
       WHERE c.business_id = ?
       GROUP BY c.id ORDER BY grand_total DESC`,
    )
      .bind(from, to, business.id)
      .all<CustomerReportRow>();

    return ok({ items: rows.results ?? [] });
  });

  // --------------------------------------------------------- product report
  router.get("/api/reports/products", async ({ env, user, query }) => {
    const business = await getBusiness(env, user.id);
    const { from, to } = bounds(query);
    const limit = intParam(query, "limit", 200, 1, 1000);

    const rows = await env.DB.prepare(
      `SELECT ii.product_id, ii.item_name,
              ROUND(SUM(ii.quantity), 2) AS quantity,
              ROUND(SUM(ii.taxable_value), 2) AS taxable_value,
              ROUND(SUM(ii.cgst + ii.sgst + ii.igst), 2) AS gst,
              ROUND(SUM(ii.total_amount), 2) AS total_amount,
              COUNT(DISTINCT i.id) AS invoice_count
       FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
       WHERE i.business_id = ? AND i.payment_status <> 'cancelled'
         AND i.invoice_date >= ? AND i.invoice_date <= ?
       GROUP BY ii.product_id, ii.item_name
       ORDER BY total_amount DESC LIMIT ?`,
    )
      .bind(business.id, from, to, limit)
      .all<ProductReportRow>();

    return ok({ items: rows.results ?? [] });
  });

  // ------------------------------------------------------------------ audit
  router.get("/api/audit", async ({ env, user, query }) => {
    const business = await getBusiness(env, user.id);
    const limit = intParam(query, "limit", 50, 1, 200);

    const rows = await env.DB.prepare(
      `SELECT a.*, u.email AS user_email, u.name AS user_name
       FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.business_id = ? ORDER BY a.created_at DESC LIMIT ?`,
    )
      .bind(business.id, limit)
      .all();

    return ok({ items: rows.results ?? [] });
  });
}
