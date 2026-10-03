-- Optional invoice-level shipping address (falls back to the customer's).
ALTER TABLE invoices ADD COLUMN shipping_address TEXT;
