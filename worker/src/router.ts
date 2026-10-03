import type { Env } from "./env";
import { ApiError, notFound } from "./errors";
import { fail } from "./http";
import { requireUser, type AuthUser } from "./auth";

export interface Ctx {
  req: Request;
  url: URL;
  env: Env;
  params: Record<string, string>;
  query: URLSearchParams;
  user: AuthUser;
  body: Record<string, unknown>;
}

export type Handler = (ctx: Ctx) => Promise<Response>;

interface Route {
  method: string;
  parts: string[];
  auth: boolean;
  handler: Handler;
}

function match(pattern: string[], actual: string[]): Record<string, string> | null {
  if (pattern.length !== actual.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i += 1) {
    const p = pattern[i];
    if (p.startsWith(":")) {
      params[p.slice(1)] = decodeURIComponent(actual[i]);
    } else if (p !== actual[i]) {
      return null;
    }
  }
  return params;
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (!text || !text.trim()) return {};
  try {
    const parsed = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new ApiError(422, "Request body must be a valid JSON object.");
  }
}

/** Minimal method + path router with optional auth middleware. */
export class Router {
  private readonly routes: Route[] = [];

  add(method: string, path: string, handler: Handler, auth = true): this {
    this.routes.push({
      method: method.toUpperCase(),
      parts: path.split("/").filter(Boolean),
      auth,
      handler,
    });
    return this;
  }

  get(path: string, handler: Handler, auth = true): this {
    return this.add("GET", path, handler, auth);
  }

  post(path: string, handler: Handler, auth = true): this {
    return this.add("POST", path, handler, auth);
  }

  put(path: string, handler: Handler, auth = true): this {
    return this.add("PUT", path, handler, auth);
  }

  delete(path: string, handler: Handler, auth = true): this {
    return this.add("DELETE", path, handler, auth);
  }

  async handle(req: Request, env: Env): Promise<Response> {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204 });
    }

    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const actual = path.split("/").filter(Boolean);

    for (const route of this.routes) {
      if (route.method !== req.method.toUpperCase()) continue;
      const params = match(route.parts, actual);
      if (!params) continue;

      const user = route.auth ? await requireUser(req, env) : (undefined as unknown as AuthUser);
      const body =
        req.method === "POST" || req.method === "PUT" || req.method === "PATCH"
          ? await readJson(req)
          : {};

      return route.handler({ req, url, env, params, query: url.searchParams, user, body });
    }

    throw notFound(`No API route matches ${req.method} ${path}.`);
  }
}
