import type { Env } from "./env";
import { newId } from "./helpers";

export interface AuditEntry {
  userId?: string | null;
  businessId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  detail?: string | null;
}

/**
 * Writes an audit row. Failures are logged but never break the main request,
 * because auditing must not take down the API.
 */
export async function logAudit(env: Env, entry: AuditEntry): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO audit_logs (id, business_id, user_id, action, entity_type, entity_id, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        newId(),
        entry.businessId ?? null,
        entry.userId ?? null,
        entry.action,
        entry.entityType ?? null,
        entry.entityId ?? null,
        entry.detail ?? null,
        new Date().toISOString(),
      )
      .run();
  } catch (error) {
    console.error("audit log failed", error);
  }
}
