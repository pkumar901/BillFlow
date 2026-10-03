import { Router } from "./router";
import { withCors, fail } from "./http";
import { ApiError } from "./errors";
import type { Env } from "./env";
import { registerAuthRoutes } from "./routes/auth";
import { registerBusinessRoutes } from "./routes/business";
import { registerCustomerRoutes } from "./routes/customers";
import { registerProductRoutes } from "./routes/products";
import { registerInvoiceRoutes } from "./routes/invoices";
import { registerPaymentRoutes } from "./routes/payments";
import { registerReportRoutes } from "./routes/reports";

const router = new Router();

registerAuthRoutes(router);
registerBusinessRoutes(router);
registerCustomerRoutes(router);
registerProductRoutes(router);
registerInvoiceRoutes(router);
registerPaymentRoutes(router);
registerReportRoutes(router);

/**
 * BillFlow Worker entrypoint.
 *
 *   React SPA  ->  /api/* (this Worker)  ->  Cloudflare D1 via env.DB
 *
 * The frontend never talks to the database directly; every query is a
 * parameterised prepared statement executed here after the caller has been
 * authenticated and scoped to their own business.
 */
export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    try {
      const url = new URL(request.url);

      // API routes always answer with the JSON envelope.
      if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
        try {
          const response = await router.handle(request, env);
          return withCors(response, request, env);
        } catch (error) {
          if (error instanceof ApiError) {
            return withCors(fail(error.message, error.status), request, env);
          }
          console.error("unhandled API error", error);
          const message =
            error instanceof Error && error.message.includes("JWT_SECRET")
              ? error.message
              : "Something went wrong on the server. Please try again.";
          return withCors(fail(message, 500), request, env);
        }
      }

      // Unknown /api-less paths: hand over to the static asset server (SPA).
      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }

      return new Response("Not found", { status: 404 });
    } catch (error) {
      console.error("worker error", error);
      return new Response("Internal server error", { status: 500 });
    }
  },
};
