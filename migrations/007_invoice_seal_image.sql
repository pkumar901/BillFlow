-- Uploaded company seal / stamp (data URL) printed next to the signature above
-- the "Authorized Signatory" line on the invoice preview, printout and PDFs.
-- Same rules as signature_image: client-resized (max ~640px) data URL.
ALTER TABLE invoice_settings ADD COLUMN seal_image TEXT;
