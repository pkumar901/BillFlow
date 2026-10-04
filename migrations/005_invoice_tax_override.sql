-- Marks invoices whose CGST/SGST totals were typed by hand in the Totals panel
-- (rather than computed from the line rates). Lets the edit form restore a stored
-- override without mistaking a legacy rounding difference for one.
ALTER TABLE invoices ADD COLUMN tax_override INTEGER NOT NULL DEFAULT 0;
