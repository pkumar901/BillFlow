-- Editable CGST / SGST split per invoice line.
--
-- The invoice still stores `gst_rate` (the total rate, used for display), and
-- gains the two halves so an explicitly entered CGST% / SGST% survives a reload
-- instead of being re-derived as gst_rate / 2.

ALTER TABLE invoice_items ADD COLUMN cgst_rate REAL;
ALTER TABLE invoice_items ADD COLUMN sgst_rate REAL;
