/** Worker environment bindings (see wrangler.toml). */
export interface Env {
  /** D1 database binding - the ONLY way this Worker talks to the database. */
  DB: D1Database;
  /** Secret set with `wrangler secret put JWT_SECRET`. */
  JWT_SECRET?: string;
  /** Comma separated browser origins allowed to call the API. */
  ALLOWED_ORIGINS?: string;
  /** "true" = return auth links in the API response (demo/dev mode). */
  DEMO_AUTH_LINKS?: string;
  ASSETS?: Fetcher;
}

export function getJwtSecret(env: Env): string {
  const secret = env.JWT_SECRET;
  if (!secret || secret.length < 8) {
    throw new Error(
      "JWT_SECRET is not configured. Run `npx wrangler secret put JWT_SECRET` (or create .dev.vars for local development).",
    );
  }
  return secret;
}

export function isDemoAuthLinks(env: Env): boolean {
  return (env.DEMO_AUTH_LINKS ?? "true").toLowerCase() === "true";
}
