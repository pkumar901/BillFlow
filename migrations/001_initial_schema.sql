-- ===========================================================================
-- BillFlow - initial schema for Cloudflare D1 (SQLite)
-- Apply with:
--   npx wrangler d1 migrations apply billflow-db --local
--   npx wrangler d1 migrations apply billflow-db --remote
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Users (auth) and business ownership
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                    TEXT PRIMARY KEY,
  email                 TEXT NOT NULL COLLATE NOCASE,
  name                  TEXT NOT NULL,
  password_hash         TEXT NOT NULL,
  email_verified        INTEGER NOT NULL DEFAULT 0,
  verification_token    TEXT,
  reset_token           TEXT,
  reset_token_expires_at TEXT,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at);

-- ---------------------------------------------------------------------------
-- Businesses (one owner -> one business in this product)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS businesses (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  gstin       TEXT,
  pan         TEXT,
  address     TEXT,
  city        TEXT,
  state       TEXT,
  pincode     TEXT,
  phone       TEXT,
  email       TEXT,
  website     TEXT,
  logo_url    TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_businesses_owner ON businesses (owner_id);
CREATE INDEX IF NOT EXISTS idx_businesses_created_at ON businesses (created_at);

-- ---------------------------------------------------------------------------
-- Invoice settings + bank details + customisation (1 row per business)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice_settings (
  id                 TEXT PRIMARY KEY,
  business_id        TEXT NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  invoice_prefix     TEXT NOT NULL DEFAULT 'INV',
  next_invoice_number INTEGER NOT NULL DEFAULT 1,
  invoice_title      TEXT NOT NULL DEFAULT 'TAX INVOICE',
  default_copy_label TEXT NOT NULL DEFAULT 'Original for Recipient',
  default_due_days   INTEGER NOT NULL DEFAULT 0,
  default_payment_terms TEXT,
  default_terms      TEXT,
  default_notes      TEXT,
  footer_text        TEXT,
  signature_text     TEXT,
  show_bank_details  INTEGER NOT NULL DEFAULT 1,
  bank_name          TEXT,
  account_holder     TEXT,
  account_number     TEXT,
  ifsc_code          TEXT,
  branch             TEXT,
  authorized_signatory TEXT,
  template           TEXT NOT NULL DEFAULT 'classic',
  accent_color       TEXT NOT NULL DEFAULT '#0f766e',
  round_to_rupee     INTEGER NOT NULL DEFAULT 1,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_settings_business ON invoice_settings (business_id);

-- ---------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id               TEXT PRIMARY KEY,
  business_id      TEXT NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  company_name     TEXT,
  gstin            TEXT,
  billing_address  TEXT,
  shipping_address TEXT,
  city             TEXT,
  state            TEXT,
  pincode          TEXT,
  email            TEXT,
  phone            TEXT,
  contact_person   TEXT,
  place_of_supply  TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_customers_business_id ON customers (business_id);
CREATE INDEX IF NOT EXISTS idx_customers_created_at ON customers (created_at);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers (name);

-- ---------------------------------------------------------------------------
-- Products / services
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id             TEXT PRIMARY KEY,
  business_id    TEXT NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  sku            TEXT,
  hsn_sac        TEXT,
  description    TEXT,
  unit           TEXT NOT NULL DEFAULT 'PCS',
  selling_price  REAL NOT NULL DEFAULT 0,
  gst_rate       REAL NOT NULL DEFAULT 18,
  cess           REAL NOT NULL DEFAULT 0,
  stock_quantity REAL,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_products_business_id ON products (business_id);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products (created_at);
CREATE INDEX IF NOT EXISTS idx_products_name ON products (name);

-- ---------------------------------------------------------------------------
-- Invoices (totals are always recalculated server-side)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
  id              TEXT PRIMARY KEY,
  business_id     TEXT NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  customer_id     TEXT NOT NULL REFERENCES customers (id),
  invoice_number  TEXT NOT NULL,
  invoice_date    TEXT NOT NULL,
  due_date        TEXT,
  place_of_supply TEXT,
  reference_number TEXT,
  payment_terms   TEXT,
  subtotal          REAL NOT NULL DEFAULT 0,
  discount          REAL NOT NULL DEFAULT 0,
  discount_type     TEXT,
  discount_value    REAL NOT NULL DEFAULT 0,
  taxable_amount    REAL NOT NULL DEFAULT 0,
  cgst              REAL NOT NULL DEFAULT 0,
  sgst              REAL NOT NULL DEFAULT 0,
  igst              REAL NOT NULL DEFAULT 0,
  cess              REAL NOT NULL DEFAULT 0,
  round_off          REAL NOT NULL DEFAULT 0,
  grand_total        REAL NOT NULL DEFAULT 0,
  amount_paid        REAL NOT NULL DEFAULT 0,
  balance_due        REAL NOT NULL DEFAULT 0,
  payment_status   TEXT NOT NULL DEFAULT 'unpaid',
  interstate        INTEGER NOT NULL DEFAULT 0,
  notes            TEXT,
  terms            TEXT,
  cancelled_at     TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Invoice number must be unique per business
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_number_unique ON invoices (business_id, invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_business_id ON invoices (business_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices (customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_date ON invoices (invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_status ON invoices (payment_status);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices (created_at);

-- ---------------------------------------------------------------------------
-- Invoice items (all individual tax values are stored)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice_items (
  id            TEXT PRIMARY KEY,
  invoice_id    TEXT NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  product_id    TEXT REFERENCES products (id) ON DELETE SET NULL,
  item_name     TEXT NOT NULL,
  description   TEXT,
  hsn_sac       TEXT,
  rate          REAL NOT NULL DEFAULT 0,
  quantity      REAL NOT NULL DEFAULT 1,
  unit          TEXT NOT NULL DEFAULT 'PCS',
  discount      REAL NOT NULL DEFAULT 0,
  discount_type TEXT,
  discount_value REAL NOT NULL DEFAULT 0,
  taxable_value REAL NOT NULL DEFAULT 0,
  gst_rate      REAL NOT NULL DEFAULT 0,
  cgst          REAL NOT NULL DEFAULT 0,
  sgst          REAL NOT NULL DEFAULT 0,
  igst          REAL NOT NULL DEFAULT 0,
  cess          REAL NOT NULL DEFAULT 0,
  total_amount  REAL NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items (invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_product_id ON invoice_items (product_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_hsn ON invoice_items (hsn_sac);
CREATE INDEX IF NOT EXISTS idx_invoice_items_created_at ON invoice_items (id);

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id                   TEXT PRIMARY KEY,
  business_id          TEXT NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  invoice_id           TEXT NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  amount               REAL NOT NULL,
  payment_date         TEXT NOT NULL,
  payment_method       TEXT NOT NULL DEFAULT 'Cash',
  transaction_reference TEXT,
  notes                TEXT,
  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_payments_business_id ON payments (business_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payments (invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON payments (payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments (created_at);

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id          TEXT PRIMARY KEY,
  business_id TEXT REFERENCES businesses (id) ON DELETE CASCADE,
  user_id     TEXT REFERENCES users (id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  detail      TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_business_id ON audit_logs (business_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at);
