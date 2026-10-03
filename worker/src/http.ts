import type { Env } from "./env";

/** Standard success envelope. */
export function ok<T>(data: T, status = 200): Response {
  return Response.json({ success: true, data }, { status });
}

/** Standard error envelope: { success: false, error: "..." } */
export function fail(error: string, status: number): Response {
  return Response.json({ success: false, error }, { status });
}

/** CORS headers - only origins explicitly listed in ALLOWED_ORIGINS are echoed back. */
export function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get("Origin");
  const allowed = (env.ALLOWED_ORIGINS ?? "*")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };

  if (!origin) return headers;

  if (allowed.includes("*")) {
    headers["Access-Control-Allow-Origin"] = "*";
  } else if (allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return headers;
}

/** Wraps any Response with the CORS headers of the current request. */
export function withCors(res: Response, req: Request, env: Env): Response {
  const headers = new Headers(res.headers);
  for (const [key, value] of Object.entries(corsHeaders(req, env))) {
    headers.set(key, value);
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
