import { Router } from "../router";
import { ok } from "../http";
import { getBusiness, getInvoiceSettings, nowIso, serializeSettings, upperOrNull, trimOrNull, toBool } from "../helpers";
import { logAudit } from "../audit";
import { businessSchema, invoiceSettingsSchema, parse } from "../validate";

export function registerBusinessRoutes(router: Router): void {
  // ------------------------------------------------------------- business
  router.get("/api/business", async ({ env, user }) => {
    const business = await getBusiness(env, user.id);
    const settings = await getInvoiceSettings(env, business.id);
    return ok({ business, settings });
  });

  router.put("/api/business", async ({ env, user, body }) => {
    const current = await getBusiness(env, user.id);
    // Partial payloads are merged with the stored row so callers can send only
    // the fields they changed.
    const input = parse(businessSchema, { ...current, ...(body ?? {}) });
    const business = current;
    const now = nowIso();

    await env.DB.prepare(
      `UPDATE businesses SET business_name = ?, gstin = ?, pan = ?, address = ?, city = ?, state = ?,
        pincode = ?, phone = ?, email = ?, website = ?, logo_url = ?, updated_at = ? WHERE id = ? AND owner_id = ?`,
    )
      .bind(
        input.business_name,
        input.gstin,
        input.pan,
        trimOrNull(input.address),
        trimOrNull(input.city),
        trimOrNull(input.state),
        trimOrNull(input.pincode),
        input.phone,
        input.email,
        trimOrNull(input.website),
        input.logo_url,
        now,
        business.id,
        user.id,
      )
      .run();

    // Bank + signatory details live with the invoice settings row.
    if (input.business_name) {
      const settings = await getInvoiceSettings(env, business.id);
      if (!settings.account_holder) {
        await env.DB.prepare(
          "UPDATE invoice_settings SET account_holder = ?, updated_at = ? WHERE business_id = ?",
        )
          .bind(input.business_name, now, business.id)
          .run();
      }
    }

    await logAudit(env, {
      userId: user.id,
      businessId: business.id,
      action: "business.updated",
      entityType: "business",
      entityId: business.id,
      detail: input.business_name,
    });

    const updated = await getBusiness(env, user.id);
    return ok({ business: updated, settings: await getInvoiceSettings(env, business.id) });
  });

  // ------------------------------------------------------ invoice settings
  router.get("/api/invoice-settings", async ({ env, user }) => {
    const business = await getBusiness(env, user.id);
    return ok(await getInvoiceSettings(env, business.id));
  });

  router.put("/api/invoice-settings", async ({ env, user, body }) => {
    const business = await getBusiness(env, user.id);
    const existing = await getInvoiceSettings(env, business.id); // creates the row on first use
    // Partial payloads are merged with the stored row so callers can send only
    // the settings they changed.
    const input = parse(invoiceSettingsSchema, { ...existing, ...(body ?? {}) });
    const now = nowIso();

    await env.DB.prepare(
      `UPDATE invoice_settings SET invoice_prefix = ?, next_invoice_number = ?, invoice_title = ?,
        default_copy_label = ?, default_due_days = ?, default_payment_terms = ?, default_terms = ?,
        default_notes = ?, footer_text = ?, signature_text = ?, signature_image = ?,
        show_bank_details = ?, bank_name = ?,
        account_holder = ?, account_number = ?, ifsc_code = ?, branch = ?, authorized_signatory = ?,
        template = ?, accent_color = ?, round_to_rupee = ?, updated_at = ?
       WHERE business_id = ?`,
    )
      .bind(
        input.invoice_prefix || "INV",
        input.next_invoice_number,
        input.invoice_title,
        input.default_copy_label,
        input.default_due_days,
        trimOrNull(input.default_payment_terms),
        trimOrNull(input.default_terms),
        trimOrNull(input.default_notes),
        trimOrNull(input.footer_text),
        trimOrNull(input.signature_text),
        trimOrNull(input.signature_image),
        input.show_bank_details ? 1 : 0,
        trimOrNull(input.bank_name),
        trimOrNull(input.account_holder),
        trimOrNull(input.account_number),
        upperOrNull(input.ifsc_code),
        trimOrNull(input.branch),
        trimOrNull(input.authorized_signatory),
        input.template,
        input.accent_color,
        input.round_to_rupee ? 1 : 0,
        now,
        business.id,
      )
      .run();

    await logAudit(env, {
      userId: user.id,
      businessId: business.id,
      action: "settings.invoice_updated",
      entityType: "invoice_settings",
      entityId: business.id,
      detail: `${input.invoice_prefix}-${input.next_invoice_number}`,
    });

    const row = await env.DB.prepare("SELECT * FROM invoice_settings WHERE business_id = ?")
      .bind(business.id)
      .first<Parameters<typeof serializeSettings>[0]>();
    if (!row) throw new Error("Invoice settings missing after update.");
    return ok(serializeSettings({ ...row, show_bank_details: toBool(row.show_bank_details) }));
  });
}
