import { Router } from "../router";
import { ok } from "../http";
import { conflict, unauthorized, unprocessable, ApiError } from "../errors";
import { hashPassword, randomToken, signToken, verifyPassword } from "../auth";
import { createInvoiceSettings, getBusiness, newId, nowIso } from "../helpers";
import { logAudit } from "../audit";
import { isDemoAuthLinks } from "../env";
import {
  changePasswordSchema,
  forgotSchema,
  loginSchema,
  parse,
  profileSchema,
  resetSchema,
  signupSchema,
  verifySchema,
} from "../validate";
import type { AuthSession, Business, PublicUser } from "~shared/types";

interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  email_verified: number;
  verification_token: string | null;
  reset_token: string | null;
  reset_token_expires_at: string | null;
  created_at: string;
}

function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    email_verified: row.email_verified === 1,
    created_at: row.created_at,
  };
}

async function sessionFor(user: UserRow, env: import("../env").Env): Promise<AuthSession> {
  const token = await signToken({ sub: user.id, email: user.email }, env);
  let business: Business | null = null;
  try {
    business = await getBusiness(env, user.id);
  } catch {
    business = null;
  }
  return { token, user: toPublicUser(user), business };
}

async function findUserByEmail(env: import("../env").Env, email: string): Promise<UserRow | null> {
  const row = await env.DB.prepare("SELECT * FROM users WHERE email = ?")
    .bind(email.toLowerCase())
    .first<UserRow>();
  return row ?? null;
}

function authLink(env: import("../env").Env, path: string, token: string, origin: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}${path}?token=${encodeURIComponent(token)}`;
}

export function registerAuthRoutes(router: Router): void {
  // ---------------------------------------------------------------- signup
  router.post(
    "/api/auth/signup",
    async ({ env, body, url }) => {
      const input = parse(signupSchema, body);

      const existing = await findUserByEmail(env, input.email);
      if (existing) throw conflict("An account with this email already exists. Please log in instead.");

      const userId = newId();
      const verificationToken = randomToken();
      const now = nowIso();

      await env.DB.prepare(
        `INSERT INTO users (id, email, name, password_hash, email_verified, verification_token, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
      )
        .bind(userId, input.email, input.name, await hashPassword(input.password), verificationToken, now, now)
        .run();

      const businessId = newId();
      await env.DB.prepare(
        `INSERT INTO businesses (id, owner_id, business_name, email, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
        .bind(businessId, userId, input.business_name ?? "My Business", input.email, now, now)
        .run();
      await createInvoiceSettings(env, businessId);

      const user = (await env.DB.prepare("SELECT * FROM users WHERE id = ?")
        .bind(userId)
        .first<UserRow>()) as UserRow;

      await logAudit(env, {
        userId,
        businessId,
        action: "auth.signup",
        entityType: "user",
        entityId: userId,
        detail: input.email,
      });

      const session = await sessionFor(user, env);
      const origin = url.origin;
      const payload: Record<string, unknown> = { ...session };
      if (isDemoAuthLinks(env)) {
        payload["verification_url"] = authLink(env, "/verify-email", verificationToken, origin);
      }
      return ok(payload);
    },
    false,
  );

  // ----------------------------------------------------------------- login
  router.post(
    "/api/auth/login",
    async ({ env, body, url }) => {
      const input = parse(loginSchema, body);
      const user = await findUserByEmail(env, input.email);
      if (!user) throw unauthorized("Incorrect email or password.");

      const valid = await verifyPassword(input.password, user.password_hash);
      if (!valid) throw unauthorized("Incorrect email or password.");

      const session = await sessionFor(user, env);
      await logAudit(env, {
        userId: user.id,
        businessId: session.business?.id ?? null,
        action: "auth.login",
        entityType: "user",
        entityId: user.id,
        detail: user.email,
      });

      const payload: Record<string, unknown> = { ...session };
      if (isDemoAuthLinks(env) && !user.email_verified) {
        payload["verification_url"] = authLink(env, "/verify-email", user.verification_token ?? "", url.origin);
      }
      return ok(payload);
    },
    false,
  );

  // ------------------------------------------------------------------- me
  router.get("/api/auth/me", async ({ env, user }) => {
    const row = await env.DB.prepare("SELECT * FROM users WHERE id = ?")
      .bind(user.id)
      .first<UserRow>();
    if (!row) throw unauthorized("Your account no longer exists.");
    return ok(await sessionFor(row, env));
  });

  // -------------------------------------------------------------- verify
  router.post(
    "/api/auth/verify",
    async ({ env, body }) => {
      const { token } = parse(verifySchema, body);
      const result = await env.DB.prepare(
        "UPDATE users SET email_verified = 1, verification_token = NULL, updated_at = ? WHERE verification_token = ?",
      )
        .bind(nowIso(), token)
        .run();
      if (!result.meta.changes) {
        throw new ApiError(409, "This verification link is invalid or has already been used.");
      }
      return ok({ verified: true });
    },
    false,
  );

  // -------------------------------------------------------------- forgot
  router.post(
    "/api/auth/forgot",
    async ({ env, body, url }) => {
      const input = parse(forgotSchema, body);
      const user = await findUserByEmail(env, input.email);

      if (user && isDemoAuthLinks(env)) {
        const token = randomToken();
        const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString();
        await env.DB.prepare(
          "UPDATE users SET reset_token = ?, reset_token_expires_at = ?, updated_at = ? WHERE id = ?",
        )
          .bind(token, expires, nowIso(), user.id)
          .run();
        return ok({
          message: "If an account exists for this email, a password reset link has been generated.",
          reset_url: authLink(env, "/reset-password", token, url.origin),
        });
      }

      // Never reveal whether the address exists.
      return ok({
        message: "If an account exists for this email, a password reset link has been generated.",
      });
    },
    false,
  );

  // --------------------------------------------------------------- reset
  router.post(
    "/api/auth/reset",
    async ({ env, body }) => {
      const input = parse(resetSchema, body);
      const user = await env.DB.prepare("SELECT * FROM users WHERE reset_token = ?")
        .bind(input.token)
        .first<UserRow>();
      if (!user) throw new ApiError(409, "This password reset link is invalid or has expired.");
      if (user.reset_token_expires_at && new Date(user.reset_token_expires_at).getTime() < Date.now()) {
        throw new ApiError(409, "This password reset link has expired. Please request a new one.");
      }

      await env.DB.prepare(
        `UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires_at = NULL,
         email_verified = 1, updated_at = ? WHERE id = ?`,
      )
        .bind(await hashPassword(input.password), nowIso(), user.id)
        .run();

      await logAudit(env, {
        userId: user.id,
        action: "auth.password_reset",
        entityType: "user",
        entityId: user.id,
        detail: user.email,
      });
      return ok({ reset: true });
    },
    false,
  );

  // -------------------------------------------------------------- profile
  router.put("/api/auth/profile", async ({ env, user, body }) => {
    const input = parse(profileSchema, body);
    const current = await env.DB.prepare("SELECT * FROM users WHERE id = ?")
      .bind(user.id)
      .first<UserRow>();
    if (!current) throw unauthorized("Your account no longer exists.");

    if (input.email.toLowerCase() !== current.email.toLowerCase()) {
      const clash = await env.DB.prepare("SELECT id FROM users WHERE email = ? AND id <> ?")
        .bind(input.email.toLowerCase(), user.id)
        .first();
      if (clash) throw conflict("That email address is already in use by another account.");
    }

    const emailChanged = input.email.toLowerCase() !== current.email.toLowerCase();
    await env.DB.prepare(
      `UPDATE users SET name = ?, email = ?, email_verified = ?, verification_token = ?, updated_at = ? WHERE id = ?`,
    )
      .bind(
        input.name,
        input.email.toLowerCase(),
        emailChanged ? 0 : current.email_verified,
        emailChanged ? randomToken() : current.verification_token,
        nowIso(),
        user.id,
      )
      .run();

    await logAudit(env, { userId: user.id, action: "profile.updated", entityType: "user", entityId: user.id });
    const updated = (await env.DB.prepare("SELECT * FROM users WHERE id = ?")
      .bind(user.id)
      .first<UserRow>()) as UserRow;
    return ok(await sessionFor(updated, env));
  });

  // ----------------------------------------------------- change password
  router.post("/api/auth/change-password", async ({ env, user, body }) => {
    const input = parse(changePasswordSchema, body);
    const row = await env.DB.prepare("SELECT * FROM users WHERE id = ?")
      .bind(user.id)
      .first<UserRow>();
    if (!row) throw unauthorized("Your account no longer exists.");

    const valid = await verifyPassword(input.current_password, row.password_hash);
    if (!valid) throw unprocessable("Your current password is incorrect.");

    await env.DB.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
      .bind(await hashPassword(input.new_password), nowIso(), user.id)
      .run();

    await logAudit(env, { userId: user.id, action: "auth.password_changed", entityType: "user", entityId: user.id });
    return ok({ changed: true });
  });
}
