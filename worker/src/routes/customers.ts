import { Router } from "../router";
import { ok } from "../http";
import { notFound, conflict } from "../errors";
import { getBusiness, intParam, newId, nowIso, ownedRow, trimOrNull, upperOrNull } from "../helpers";
import { logAudit } from "../audit";
import { customerSchema, parse } from "../validate";
import type { Customer, Page } from "~shared/types";

const SORTS: Record<string, string> = {
  name: "c.name",
  created: "c.created_at",
  updated: "c.updated_at",
  outstanding: "outstanding",
};

interface CustomerAggregate extends Customer {
  invoice_count: number;
  total_invoiced: number;
  outstanding: number;
}

export function registerCustomerRoutes(router: Router): void {
  router.get("/api/customers", async ({ env, user, query }) => {
    const business = await getBusiness(env, user.id);
    const q = (query.get("q") ?? "").trim();
    const state = (query.get("state") ?? "").trim();
    const page = intParam(query, "page", 1, 1, 100000);
    const limit = intParam(query, "limit", 50, 1, 200);
    const sortKey = query.get("sort") ?? "updated";
    const sortSql = SORTS[sortKey] ?? SORTS["updated"];
    const direction = (query.get("order") ?? "desc").toLowerCase() === "asc" ? "ASC" : "DESC";

    const where: string[] = ["c.business_id = ?"];
    const args: unknown[] = [business.id];

    if (q) {
      where.push(
        "(c.name LIKE ? OR c.company_name LIKE ? OR c.gstin LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR c.contact_person LIKE ?)",
      );
      const like = `%${q}%`;
      args.push(like, like, like, like, like, like);
    }
    if (state) {
      where.push("c.state = ?");
      args.push(state);
    }

    const whereSql = where.join(" AND ");

    const countRow = await env.DB.prepare(`SELECT COUNT(*) AS n FROM customers c WHERE ${whereSql}`)
      .bind(...args)
      .first<{ n: number }>();

    const rows = await env.DB.prepare(
      `SELECT c.*,
              COUNT(i.id) AS invoice_count,
              COALESCE(SUM(CASE WHEN i.payment_status <> 'cancelled' THEN i.grand_total ELSE 0 END), 0) AS total_invoiced,
              COALESCE(SUM(CASE WHEN i.payment_status <> 'cancelled' THEN i.balance_due ELSE 0 END), 0) AS outstanding
       FROM customers c
       LEFT JOIN invoices i ON i.customer_id = c.id
       WHERE ${whereSql}
       GROUP BY c.id
       ORDER BY ${sortSql} ${direction}
       LIMIT ? OFFSET ?`,
    )
      .bind(...args, limit, (page - 1) * limit)
      .all<CustomerAggregate>();

    const payload: Page<CustomerAggregate> = {
      items: (rows.results ?? []).map((row) => ({ ...row, invoice_count: Number(row.invoice_count ?? 0), total_invoiced: Number(row.total_invoiced ?? 0), outstanding: Number(row.outstanding ?? 0) })),
      total: Number(countRow?.n ?? 0),
      page,
      limit,
    };
    return ok(payload);
  });

  router.get("/api/customers/:id", async ({ env, user, params }) => {
    const business = await getBusiness(env, user.id);
    const row = await env.DB.prepare(
      `SELECT c.*,
              (SELECT COUNT(*) FROM invoices i WHERE i.customer_id = c.id AND i.payment_status <> 'cancelled') AS invoice_count,
              COALESCE((SELECT SUM(i.grand_total) FROM invoices i WHERE i.customer_id = c.id AND i.payment_status <> 'cancelled'), 0) AS total_invoiced,
              COALESCE((SELECT SUM(i.balance_due) FROM invoices i WHERE i.customer_id = c.id AND i.payment_status <> 'cancelled'), 0) AS outstanding
       FROM customers c WHERE c.id = ? AND c.business_id = ?`,
    )
      .bind(params["id"], business.id)
      .first<CustomerAggregate>();
    if (!row) throw notFound("Customer not found.");
    return ok(row);
  });

  router.post("/api/customers", async ({ env, user, body }) => {
    const input = parse(customerSchema, body);
    const business = await getBusiness(env, user.id);
    const id = newId();
    const now = nowIso();

    await env.DB.prepare(
      `INSERT INTO customers (id, business_id, name, company_name, gstin, billing_address, shipping_address,
        city, state, pincode, email, phone, contact_person, place_of_supply, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        business.id,
        input.name,
        trimOrNull(input.company_name),
        upperOrNull(input.gstin),
        trimOrNull(input.billing_address),
        trimOrNull(input.shipping_address),
        trimOrNull(input.city),
        trimOrNull(input.state),
        trimOrNull(input.pincode),
        input.email,
        input.phone,
        trimOrNull(input.contact_person),
        trimOrNull(input.place_of_supply) ?? trimOrNull(input.state),
        now,
        now,
      )
      .run();

    await logAudit(env, {
      userId: user.id,
      businessId: business.id,
      action: "customer.created",
      entityType: "customer",
      entityId: id,
      detail: input.name,
    });

    const row = await env.DB.prepare("SELECT * FROM customers WHERE id = ? AND business_id = ?")
      .bind(id, business.id)
      .first<Customer>();
    return ok(row, 201);
  });

  router.put("/api/customers/:id", async ({ env, user, params, body }) => {
    const input = parse(customerSchema, body);
    const business = await getBusiness(env, user.id);
    const existing = await ownedRow<Customer>(env, "customers", params["id"], business.id);

    await env.DB.prepare(
      `UPDATE customers SET name = ?, company_name = ?, gstin = ?, billing_address = ?, shipping_address = ?,
        city = ?, state = ?, pincode = ?, email = ?, phone = ?, contact_person = ?, place_of_supply = ?, updated_at = ?
       WHERE id = ? AND business_id = ?`,
    )
      .bind(
        input.name,
        trimOrNull(input.company_name),
        upperOrNull(input.gstin),
        trimOrNull(input.billing_address),
        trimOrNull(input.shipping_address),
        trimOrNull(input.city),
        trimOrNull(input.state),
        trimOrNull(input.pincode),
        input.email,
        input.phone,
        trimOrNull(input.contact_person),
        trimOrNull(input.place_of_supply) ?? trimOrNull(input.state),
        nowIso(),
        existing.id,
        business.id,
      )
      .run();

    await logAudit(env, {
      userId: user.id,
      businessId: business.id,
      action: "customer.updated",
      entityType: "customer",
      entityId: existing.id,
      detail: input.name,
    });

    const row = await env.DB.prepare("SELECT * FROM customers WHERE id = ?")
      .bind(existing.id)
      .first<Customer>();
    return ok(row);
  });

  router.delete("/api/customers/:id", async ({ env, user, params }) => {
    const business = await getBusiness(env, user.id);
    const existing = await ownedRow<Customer>(env, "customers", params["id"], business.id);

    const linked = await env.DB.prepare("SELECT COUNT(*) AS n FROM invoices WHERE customer_id = ?")
      .bind(existing.id)
      .first<{ n: number }>();
    if (Number(linked?.n ?? 0) > 0) {
      throw conflict(
        `Cannot delete "${existing.name}" because ${linked?.n} invoice(s) are linked to this customer.`,
      );
    }

    await env.DB.prepare("DELETE FROM customers WHERE id = ? AND business_id = ?")
      .bind(existing.id, business.id)
      .run();

    await logAudit(env, {
      userId: user.id,
      businessId: business.id,
      action: "customer.deleted",
      entityType: "customer",
      entityId: existing.id,
      detail: existing.name,
    });

    return ok({ deleted: true, id: existing.id });
  });
}
