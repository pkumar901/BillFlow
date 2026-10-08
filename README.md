# BillFlow — GST Billing & Invoice Management

A full-stack GST invoicing app: **React + TypeScript + Vite** frontend, **Cloudflare Worker** API, **Cloudflare D1** database.

- The browser never talks to the database. Every read/write goes
  `React → src/lib/api.ts → Worker API → env.DB (D1)`.
- All money math is done **server-side** in integer paisa (`shared/money.ts`,
  `shared/gst.ts`); frontend totals are a live preview only.
- Auth is a custom HMAC-SHA256 JWT (`JWT_SECRET`) with PBKDF2-SHA256 password
  hashing. Every business-data query is filtered by the authenticated owner
  (`business_id`), so one tenant can never read another's rows.
- SQL uses parameterised prepared statements everywhere; request bodies are
  validated with zod before they touch a query.

---

## 1. Requirements

- Node.js 18+ and npm
- A Cloudflare account (only needed for remote/deployed use)
- `wrangler` is used through `npx` (installed via dev dependencies)

## 2. Local setup

```bash
npm install

# local secrets for `wrangler dev` (git-ignored)
copy .dev.vars.example .dev.vars      # Windows: copy, macOS/Linux: cp
```

Edit `.dev.vars` and set a long random `JWT_SECRET`.

Create the local D1 database and apply the schema:

```bash
npx wrangler d1 migrations apply billflow-db --local
```

Check what has been applied:

```bash
npx wrangler d1 migrations list billflow-db --local
```

Run arbitrary SQL against the **local** database (read-only queries are a safe
way to inspect data):

```bash
npx wrangler d1 execute billflow-db --local --command "SELECT id, invoice_number, payment_status FROM invoices;"
```

### Start the app

```bash
# everything at once: Vite (http://localhost:5173) + Worker API (http://127.0.0.1:8787)
npm run dev
```

Vite proxies `/api` to the Worker, so open **http://localhost:5173**.

Alternatively, run only the Worker:

```bash
npm run build     # compile React into dist/
npm run dev:api   # wrangler dev → serves dist/ AND the API on http://127.0.0.1:8787
```

`wrangler dev` serves the built SPA from `dist/` with single-page-app fallback,
so **http://127.0.0.1:8787** works on its own. After any change under `src/`,
re-run `npm run build` to refresh `dist/` (Worker changes under `worker/` are
hot-reloaded automatically).

## 3. Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server + `wrangler dev` together |
| `npm run dev:web` | Frontend only (proxies `/api` → `:8787`) |
| `npm run dev:api` | Worker only (serves `dist/` + API on `:8787`) |
| `npm run build` | Type-check (`tsc -b`) + production build into `dist/` |
| `npm run typecheck` | Type-check frontend + worker |
| `npm run preview` | Preview the Vite build |
| `npm run deploy` | `build` then `wrangler deploy` |
| `npm run db:migrate:local` | Apply migrations to the **local** D1 database |
| `npm run db:migrate:remote` | Apply migrations to the **remote** (Cloudflare) D1 database |
| `npm run db:preview` | List applied migrations (local) |
| `npm run db:local -- "SELECT ..."` | Run SQL on the local database |
| `npm run db:remote -- "SELECT ..."` | Run SQL on the remote database |

> Never run destructive statements (`DROP`, `TRUNCATE`, mass `DELETE`) without a
> backup. Nothing in the app or in these scripts does that for you.

## 4. Database migrations

Schema files live in `migrations/` and are applied by Wrangler in filename order.

| File | Purpose |
| --- | --- |
| `001_initial_schema.sql` | Core schema (users, business, customers, products, invoices, items, payments, settings) |
| `002_invoice_shipping_address.sql` | Adds the optional `shipping_address` fill-up column to `invoices` |

```bash
# apply to local dev DB (data lives under .wrangler/state/v3/d1)
npx wrangler d1 migrations apply billflow-db --local

# apply to the real Cloudflare D1 database
npx wrangler d1 migrations apply billflow-db --remote

# see which migrations are applied / pending
npx wrangler d1 migrations list billflow-db --local
npx wrangler d1 migrations list billflow-db --remote

# ad-hoc SQL
npx wrangler d1 execute billflow-db --local  --command "SELECT COUNT(*) FROM invoices;"
npx wrangler d1 execute billflow-db --remote --command "SELECT COUNT(*) FROM invoices;"
```

After adding a migration file, run `--local` first, verify the app, then run
`--remote`.

## 5. Cloudflare configuration (production)

### 5.1 Create the D1 database and set `database_id`

```bash
npx wrangler d1 create billflow-db
npx wrangler d1 list          # copy the database id
```

`wrangler.toml` ships with a placeholder:

```toml
[[d1_databases]]
binding   = "DB"
database_name = "billflow-db"
database_id   = "<CLOUDFLARE_D1_DATABASE_ID>"
```

**Replace `<CLOUDFLARE_D1_DATABASE_ID>` with the real id from `wrangler d1
list`.** The app will not work against the remote database until this is done.

### 5.2 Set the JWT secret

Locally the Worker reads `.dev.vars` (git-ignored; `.dev.vars.example` shows the
shape). In production set the real secret — it is never committed and never sent
to the browser:

```bash
npx wrangler secret put JWT_SECRET
```

Use a long, random value (e.g. 64+ random characters).

### 5.3 Environment variables (non-secret)

Set in `wrangler.toml` `[vars]`:

- `ALLOWED_ORIGINS` — comma-separated browser origins allowed to call the API.
- `DEMO_AUTH_LINKS` — `"true"` returns e-mail verification / password-reset links
  in the API response instead of sending mail. **Set to `"false"` in production**
  and wire a real e-mail provider in `worker/src/routes/auth.ts`.

### 5.4 Deploy

```bash
npm run db:migrate:remote     # schema on the real database
npm run build
npx wrangler secret put JWT_SECRET
npx wrangler deploy
```

The Worker serves both the API (`/api/*`) and the compiled SPA from `dist/`, so
the whole app runs on one origin.

## 6. Architecture

```
src/            React app (pages, components, ui primitives)
  lib/api.ts    ← the ONLY module that talks to the API from the browser
  lib/pdf/      jsPDF invoice/report generation (client-side, data from the API)
worker/src/     Cloudflare Worker (router, zod validation, handlers, auth)
  routes/       auth · business · customers · products · invoices · payments · reports
shared/         code shared by both sides: money, GST, validation, types, states
migrations/     D1 schema (SQL)
wrangler.toml   D1 binding, SPA assets, CORS/dev vars
```

Request/response conventions:

- Envelope: `{ "success": true, "data": … }` or `{ "success": false, "error": "…" }`.
- Status codes: `401` unauthenticated, `403` wrong owner, `404` not found,
  `409` conflict (duplicate invoice number, etc.), `422` validation,
  `500` server error.
- Field names are `snake_case` and map 1:1 to D1 columns.
- Money is stored as integer **paisa** and converted only at the edges.

## 7. API reference

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/auth/signup` | create account (returns `verification_url` when `DEMO_AUTH_LINKS=true`) |
| POST | `/api/auth/login` | sign in |
| GET | `/api/auth/me` | current user + business + settings |
| POST | `/api/auth/verify-email` | confirm e-mail |
| POST | `/api/auth/forgot-password` | request reset link |
| POST | `/api/auth/reset-password` | set new password |
| PUT | `/api/auth/profile` | update name/e-mail |
| POST | `/api/auth/change-password` | change password |
| GET/PUT | `/api/business` | business profile (GSTIN, address, logo…) |
| GET/PUT | `/api/invoice-settings` | numbering, due days, bank details, template, tax behaviour |
| GET | `/api/customers` · `/api/customers/:id` | list/search · fetch |
| POST/PUT/DELETE | `/api/customers[/:id]` | CRUD (delete is blocked when invoices exist → `409`) |
| GET | `/api/products` · `/api/products/:id` | list/search · fetch |
| POST/PUT/DELETE | `/api/products[/:id]` | CRUD |
| GET | `/api/invoices` | filters: `status`, `q`, `customer_id`, `from`, `to`, paging |
| GET | `/api/invoices/next-number` | next number in the business series |
| GET/PUT/DELETE | `/api/invoices/:id` | fetch · update · delete |
| POST | `/api/invoices` | create — server recomputes all totals/tax |
| POST | `/api/invoices/:id/payment` | record a payment |
| GET | `/api/payments` | payment ledger (`invoice_id`, date filters) |
| DELETE | `/api/payments/:id` | remove a payment |
| GET | `/api/dashboard` | counters + recent invoices/customers (all from D1) |
| GET | `/api/reports/sales` | date-range sales report |
| GET | `/api/reports/gst` | GST summary (rate-wise CGST/SGST/IGST) |
| GET | `/api/reports/outstanding` | unpaid balances |
| GET | `/api/reports/payments` | payments report |
| GET | `/api/reports/customers` · `/api/reports/products` | per-customer / per-product |
| GET | `/api/audit` | audit trail for the business |

## 8. Features

- **Auth** — sign up, e-mail verification, sign in, forgot/reset password, profile,
  change password, sign out.
- **Business setup** — name, GSTIN, PAN, address/state, contact details, logo
  (uploaded from the browser, resized to a compact PNG/JPEG data URL, capped at
  600 000 chars and rejected if it is not an `http(s)`/`data:image` URL).
- **Customers & products** — CRUD with search, GST rates, HSN/SAC codes,
  pricing defaults, usage guards before delete.
- **Invoices** — line items with an editable per-line **CGST% / SGST%** split
  (the totals are always computed from those rates) plus per-line discount,
  intra-state CGST/SGST vs inter-state IGST by place of supply, invoice-level
  discount, round-off option, Indian amount-in-words, `PREFIX-0001` numbering
  with a monotonic counter, status: Draft / Unpaid / Partial / Paid / Overdue /
  Cancelled, an **optional shipping address** (fill-up field, saved per invoice),
  editable **CGST / SGST amounts** in the Totals panel (a manual override is
  stored on the invoice and the grand total, amount-in-words and round-off
  follow it), and **PO No** (the customer's purchase-order number) plus **PO
  Date** shown side-by-side in the header meta block — the old "State Code"
  cell and the editable "Due date" field are both gone from the form, reports
  and layouts (an internal due date is still derived from *Default due days* so
  Overdue status keeps working).
- **Preview & output** — "TAX INVOICE" preview, 5 templates (Standard, Classic,
  Modern, Minimal, Professional) with accent colour, PDF download (jsPDF,
  embedded fonts), print, CSV export, share via WhatsApp / e-mail / copy link.
  Optional **signature** and **company seal** images (Settings → PDF &
  Template) print above the "Authorized Signatory" line — seal on the left,
  signature on the right — in the preview, the printout and both PDF
  renderers. PDF delivery adapts to the device: a real download where the
  browser supports it, otherwise the file opens in the native viewer
  (iOS/iPadOS) so it can be shared, saved or printed.
  The **Standard** template is a ruled A4 tax-invoice grid: bordered frame,
  divider-only item table (no row rules), totals band, bank + authorisation
  block, footer cell with a "Powered by BillFlow" divider, and two closing lines
  below the frame (accent-coloured footer text + page counter / signature note).
  Page geometry matches A4 with 8.5 mm margins.
- **Payments** — record against an invoice, ledger, refunds/removals, balances.
- **Dashboard** — sales, received, pending, GST collected, recent activity — all
  computed by SQL.
- **Reports** — Sales, GST, Payments, Customers, Products, Outstanding with CSV
  and PDF export; GST Summary is a business reporting tool and makes **no**
  compliance/filing claims.
- **Settings** — business profile, invoice defaults, tax behaviour, bank details,
  PDF/template (signature and company seal image uploads), account (tabs are
  URL-synced via `?tab=`).
- **Demo data** — seeded sample rows use masked GSTINs (`33XXXXXXXXXXXXXX`) and
  can be deleted like any other record.

## 9. Verification checklist

A full pass through the app looks like this:

1. Sign up → open the verification link → sign in.
2. Complete **Business setup** (logo, GSTIN, state).
3. Add a customer and a product.
4. Create an invoice → check the live preview totals (subtotal, CGST/SGST or
   IGST, grand total) → save.
5. Reload the page — the invoice must still be there.
6. Download the PDF and print it.
7. Record a payment → status becomes *Partially Paid*, balance drops.
8. Dashboard and Reports reflect the new numbers (nothing hard-coded).
9. Cancel / restore / delete an invoice; log out and back in.

Type-check + build must be clean:

```bash
npx tsc --noEmit -p tsconfig.json
npx tsc --noEmit -p tsconfig.worker.json
npm run build
```

## 10. Troubleshooting

- **`JWT_SECRET` missing** — `wrangler dev` fails to sign tokens. Create
  `.dev.vars` from `.dev.vars.example`, or run `wrangler secret put JWT_SECRET`.
- **`logo_url: String must contain at most 2000 character(s)`** — you are
  sending an unresized logo. Use the in-app logo picker (it resizes/shrinks to
  fit) and keep the URL ≤ `MAX_LOGO_CHARS` (600 000).
- **Remote queries return "no such table"** — run
  `npx wrangler d1 migrations apply billflow-db --remote`.
- **Frontend shows stale UI after editing `src/` while using `wrangler dev`** —
  run `npm run build` again; `dist/` is what the Worker serves.
- **API called from another origin** — add the origin to `ALLOWED_ORIGINS`.

## 11. Security notes

- `JWT_SECRET` and any other secrets live in `.dev.vars` (local) or
  `wrangler secret` (production) — never in `wrangler.toml` `[vars]` and never
  in frontend code.
- Passwords are stored as PBKDF2-SHA256 (100k iterations, per-user salt).
- Every business-data statement is `… WHERE id = ? AND business_id = ?` with
  `business_id` taken from the verified token.
- Uploads/URLs are validated server-side (`shared/validation.ts`).

---

_BillFlow · GST Billing & Invoice Management_
