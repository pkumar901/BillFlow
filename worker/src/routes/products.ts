import { Router } from "../router";
import { ok } from "../http";
import { notFound } from "../errors";
import { getBusiness, intParam, newId, nowIso, ownedRow, trimOrNull, upperOrNull } from "../helpers";
import { logAudit } from "../audit";
import { productSchema, parse } from "../validate";
import type { Page, Product } from "~shared/types";

export function registerProductRoutes(router: Router): void {
  router.get("/api/products", async ({ env, user, query }) => {
    const business = await getBusiness(env, user.id);
    const q = (query.get("q") ?? "").trim();
    const page = intParam(query, "page", 1, 1, 100000);
    const limit = intParam(query, "limit", 50, 1, 200);

    const where: string[] = ["business_id = ?"];
    const args: unknown[] = [business.id];
    if (q) {
      where.push("(name LIKE ? OR sku LIKE ? OR hsn_sac LIKE ? OR description LIKE ?)");
      const like = `%${q}%`;
      args.push(like, like, like, like);
    }
    const whereSql = where.join(" AND ");

    const countRow = await env.DB.prepare(`SELECT COUNT(*) AS n FROM products WHERE ${whereSql}`)
      .bind(...args)
      .first<{ n: number }>();

    const rows = await env.DB.prepare(
      `SELECT * FROM products WHERE ${whereSql} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
    )
      .bind(...args, limit, (page - 1) * limit)
      .all<Product>();

    const payload: Page<Product> = {
      items: rows.results ?? [],
      total: Number(countRow?.n ?? 0),
      page,
      limit,
    };
    return ok(payload);
  });

  router.get("/api/products/:id", async ({ env, user, params }) => {
    const business = await getBusiness(env, user.id);
    const row = await env.DB.prepare("SELECT * FROM products WHERE id = ? AND business_id = ?")
      .bind(params["id"], business.id)
      .first<Product>();
    if (!row) throw notFound("Product not found.");
    return ok(row);
  });

  router.post("/api/products", async ({ env, user, body }) => {
    const input = parse(productSchema, body);
    const business = await getBusiness(env, user.id);
    const id = newId();
    const now = nowIso();

    await env.DB.prepare(
      `INSERT INTO products (id, business_id, name, sku, hsn_sac, description, unit, selling_price, gst_rate, cess, stock_quantity, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        business.id,
        input.name,
        upperOrNull(input.sku),
        trimOrNull(input.hsn_sac),
        trimOrNull(input.description),
        input.unit,
        input.selling_price,
        input.gst_rate,
        input.cess,
        input.stock_quantity,
        now,
        now,
      )
      .run();

    await logAudit(env, {
      userId: user.id,
      businessId: business.id,
      action: "product.created",
      entityType: "product",
      entityId: id,
      detail: input.name,
    });

    const row = await env.DB.prepare("SELECT * FROM products WHERE id = ? AND business_id = ?")
      .bind(id, business.id)
      .first<Product>();
    return ok(row, 201);
  });

  router.put("/api/products/:id", async ({ env, user, params, body }) => {
    const input = parse(productSchema, body);
    const business = await getBusiness(env, user.id);
    const existing = await ownedRow<Product>(env, "products", params["id"], business.id);

    await env.DB.prepare(
      `UPDATE products SET name = ?, sku = ?, hsn_sac = ?, description = ?, unit = ?, selling_price = ?,
        gst_rate = ?, cess = ?, stock_quantity = ?, updated_at = ? WHERE id = ? AND business_id = ?`,
    )
      .bind(
        input.name,
        upperOrNull(input.sku),
        trimOrNull(input.hsn_sac),
        trimOrNull(input.description),
        input.unit,
        input.selling_price,
        input.gst_rate,
        input.cess,
        input.stock_quantity,
        nowIso(),
        existing.id,
        business.id,
      )
      .run();

    await logAudit(env, {
      userId: user.id,
      businessId: business.id,
      action: "product.updated",
      entityType: "product",
      entityId: existing.id,
      detail: input.name,
    });

    const row = await env.DB.prepare("SELECT * FROM products WHERE id = ?")
      .bind(existing.id)
      .first<Product>();
    return ok(row);
  });

  router.delete("/api/products/:id", async ({ env, user, params }) => {
    const business = await getBusiness(env, user.id);
    const existing = await ownedRow<Product>(env, "products", params["id"], business.id);

    await env.DB.prepare("DELETE FROM products WHERE id = ? AND business_id = ?")
      .bind(existing.id, business.id)
      .run();

    await logAudit(env, {
      userId: user.id,
      businessId: business.id,
      action: "product.deleted",
      entityType: "product",
      entityId: existing.id,
      detail: existing.name,
    });

    return ok({ deleted: true, id: existing.id });
  });
}
