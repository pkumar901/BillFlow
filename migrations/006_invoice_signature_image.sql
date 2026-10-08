-- Uploaded handwritten signature (data URL) shown above the "Authorized
-- Signatory" line on the invoice preview, the print output and both PDFs.
-- Kept as a small client-resized JPEG/PNG (max width ~480px) so the row stays
-- well under the sizes D1 and the API handle comfortably.
ALTER TABLE invoice_settings ADD COLUMN signature_image TEXT;
