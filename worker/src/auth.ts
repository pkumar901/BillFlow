import type { Env } from "./env";
import { getJwtSecret } from "./env";
import { unauthorized, ApiError } from "./errors";

/* ------------------------------ passwords -------------------------------- */

const PBKDF2_ITERATIONS = 100_000;
const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** PBKDF2-SHA256 password hash: `pbkdf2$<iterations>$<salt>$<hash>`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, iterationsRaw, saltRaw, hashRaw] = stored.split("$");
    if (scheme !== "pbkdf2") return false;
    const iterations = Number(iterationsRaw);
    if (!Number.isFinite(iterations) || iterations < 1000) return false;

    const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
      "deriveBits",
    ]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: fromBase64(saltRaw), iterations, hash: "SHA-256" },
      key,
      256,
    );
    const expected = fromBase64(hashRaw);
    const actual = new Uint8Array(bits);
    if (expected.length !== actual.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i += 1) diff |= actual[i] ^ expected[i];
    return diff === 0;
  } catch {
    return false;
  }
}

/* --------------------------------- JWT ----------------------------------- */

function b64url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), "="));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export interface TokenPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function signToken(
  payload: { sub: string; email: string },
  env: Env,
  ttlSeconds = 60 * 60 * 24 * 7,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = b64url(
    encoder.encode(JSON.stringify({ ...payload, iat: now, exp: now + ttlSeconds })),
  );
  const key = await hmacKey(getJwtSecret(env));
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${header}.${body}`));
  return `${header}.${body}.${b64url(new Uint8Array(signature))}`;
}

export async function verifyToken(token: string, env: Env): Promise<TokenPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;

    const key = await hmacKey(getJwtSecret(env));
    const expected = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, encoder.encode(`${header}.${body}`)),
    );
    const given = fromBase64(signature.replace(/-/g, "+").replace(/_/g, "/"));
    if (expected.length !== given.length) return null;
    let diff = 0;
    for (let i = 0; i < given.length; i += 1) diff |= expected[i] ^ given[i];
    if (diff !== 0) return null;

    const payload = JSON.parse(b64urlDecode(body)) as TokenPayload;
    if (!payload.sub || typeof payload.exp !== "number") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/* ------------------------------- request auth ---------------------------- */

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  email_verified: number;
}

/** Reads + verifies the `Authorization: Bearer <token>` header. */
export async function requireUser(req: Request, env: Env): Promise<AuthUser> {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
  if (!token) throw unauthorized("You are not signed in. Please log in to continue.");

  const payload = await verifyToken(token, env);
  if (!payload) throw unauthorized("Your session is invalid or has expired. Please log in again.");

  const user = await env.DB.prepare(
    "SELECT id, email, name, email_verified FROM users WHERE id = ?",
  )
    .bind(payload.sub)
    .first<AuthUser>();

  if (!user) throw unauthorized("Your account no longer exists.");
  return user;
}

/** Random URL-safe token for verification / password reset links. */
export function randomToken(bytes = 24): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export { ApiError };
