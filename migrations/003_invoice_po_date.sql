-- Purchase-order date on invoices.
--
-- The invoice keeps its `due_date` column (it still drives the Overdue status,
-- it is simply no longer shown or edited by hand), and gains `po_date` next to
-- `reference_number` (the purchase-order number, labelled "PO" on the invoice).

ALTER TABLE invoices ADD COLUMN po_date TEXT;
