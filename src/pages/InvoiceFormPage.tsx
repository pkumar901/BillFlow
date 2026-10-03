import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { COPY_LABELS, InvoiceDocument, type CopyLabel } from "@/components/invoices/InvoiceDocument";
import { CustomerDialog } from "@/components/customers/CustomerDialog";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorState, LoadingState, Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";
import { addDaysISO, amountInWords, formatINR, round2, todayISO } from "@/lib/format";
import { CalculationError, calculateInvoice, type DiscountType, type InvoiceCalcResult } from "~shared/gst";
import { STATES, stateLabel } from "~shared/states";
import type {
  Business,
  CreateInvoicePayload,
  Customer,
  InvoiceDetail,
  InvoiceItem,
  InvoiceSettings,
  Product,
} from "~shared/types";

/* ------------------------------- row model ------------------------------- */

interface ItemRow {
  key: string;
  product_id: string | null;
  item_name: string;
  description: string;
  hsn_sac: string;
  rate: string;
  quantity: string;
  unit: string;
  gst_rate: string;
  cess_rate: string;
  discount_type: DiscountType;
  discount_value: string;
}

interface FormState {
  customer_id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  place_of_supply: string;
  reference_number: string;
  payment_terms: string;
  shipping_address: string;
  notes: string;
  terms: string;
  discount_type: DiscountType;
  discount_value: string;
}

const EMPTY_FORM: FormState = {
  customer_id: "",
  invoice_number: "",
  invoice_date: "",
  due_date: "",
  place_of_supply: "",
  reference_number: "",
  payment_terms: "",
  shipping_address: "",
  notes: "",
  terms: "",
  discount_type: "amount",
  discount_value: "",
};

let rowCounter = 0;
function nextKey(): string {
  rowCounter += 1;
  return `row-${rowCounter}`;
}

function emptyRow(): ItemRow {
  return {
    key: nextKey(),
    product_id: null,
    item_name: "",
    description: "",
    hsn_sac: "",
    rate: "",
    quantity: "1",
    unit: "PCS",
    gst_rate: "18",
    cess_rate: "0",
    discount_type: "percent",
    discount_value: "",
  };
}

function num(value: string): number {
  const parsed = Number.parseFloat(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Recovers the pure line discount (before invoice-level allocation) for editing. */
function recoverLineDiscount(item: InvoiceItem, invoice: InvoiceDetail["invoice"]): number {
  const base = round2(Number(item.rate) * Number(item.quantity));
  const taxable = Number(item.taxable_value || 0);
  const invoiceDiscount = Number(invoice.discount || 0);
  const taxableTotal = Number(invoice.taxable_amount || 0);
  if (base <= taxable) return 0;
  if (invoiceDiscount > 0 && taxableTotal > 0) {
    return Math.max(0, round2(base - taxable * (1 + invoiceDiscount / taxableTotal)));
  }
  return Math.max(0, round2(base - taxable));
}

function rowFromItem(item: InvoiceItem, invoice: InvoiceDetail["invoice"]): ItemRow {
  const taxable = Number(item.taxable_value || 0);
  const cessRate = taxable > 0 ? round2((Number(item.cess || 0) / taxable) * 100) : 0;
  return {
    key: nextKey(),
    product_id: item.product_id,
    item_name: item.item_name ?? "",
    description: item.description ?? "",
    hsn_sac: item.hsn_sac ?? "",
    rate: String(item.rate ?? ""),
    quantity: String(item.quantity ?? 1),
    unit: item.unit || "PCS",
    gst_rate: String(item.gst_rate ?? 18),
    cess_rate: String(cessRate || 0),
    discount_type: "amount",
    discount_value: String(recoverLineDiscount(item, invoice) || ""),
  };
}

/* -------------------------------- page ---------------------------------- */

export function InvoiceFormPage() {
  const { id } = useParams<{ id: string }>();
  const editing = Boolean(id);
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [business, setBusiness] = useState<Business | null>(null);
  const [settings, setSettings] = useState<InvoiceSettings | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [original, setOriginal] = useState<InvoiceDetail | null>(null);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [rows, setRows] = useState<ItemRow[]>([emptyRow()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [copyLabel, setCopyLabel] = useState<CopyLabel>("Original for Recipient");
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);

  /* ------------------------------ bootstrap ----------------------------- */

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [biz, customerPage, productPage] = await Promise.all([
          api.getBusiness(),
          api.getCustomers({ limit: 100, sort: "name", order: "asc" }),
          api.getProducts({ limit: 200 }),
        ]);
        if (cancelled) return;
        setBusiness(biz.business);
        setSettings(biz.settings);
        setCustomers(customerPage.items);
        setProducts(productPage.items);

        if (id) {
          const detail = await api.getInvoice(id);
          if (cancelled) return;
          setOriginal(detail);
          setBusiness(detail.business);
          setSettings(detail.settings);
          setForm({
            customer_id: detail.invoice.customer_id,
            invoice_number: detail.invoice.invoice_number,
            invoice_date: detail.invoice.invoice_date,
            due_date: detail.invoice.due_date ?? "",
            place_of_supply: detail.invoice.place_of_supply ?? "",
            reference_number: detail.invoice.reference_number ?? "",
            payment_terms: detail.invoice.payment_terms ?? "",
            shipping_address: detail.invoice.shipping_address ?? "",
            notes: detail.invoice.notes ?? "",
            terms: detail.invoice.terms ?? "",
            discount_type: (detail.invoice.discount_type as DiscountType) ?? "amount",
            discount_value: detail.invoice.discount_value ? String(detail.invoice.discount_value) : "",
          });
          setRows(detail.items.map((item) => rowFromItem(item, detail.invoice)));
        } else {
          const next = await api.getNextInvoiceNumber();
          if (cancelled) return;
          const today = todayISO();
          setForm({
            ...EMPTY_FORM,
            invoice_number: next.invoice_number,
            invoice_date: today,
            due_date: addDaysISO(today, biz.settings.default_due_days ?? 0),
            payment_terms: biz.settings.default_payment_terms ?? "",
            notes: biz.settings.default_notes ?? "",
            terms: biz.settings.default_terms ?? "",
          });
          setRows([emptyRow()]);
        }
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : "Unable to load the invoice form.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const setField = (key: keyof FormState) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const customer = useMemo(
    () => customers.find((row) => row.id === form.customer_id) ?? null,
    [customers, form.customer_id],
  );

  /* ----------------------------- calculation ---------------------------- */

  const calc = useMemo<{ result: InvoiceCalcResult | null; error: string | null }>(() => {
    if (!business) return { result: null, error: null };
    const active = rows.filter((row) => row.item_name.trim());
    if (active.length === 0) return { result: null, error: null };

    const placeOfSupply = form.place_of_supply || customer?.place_of_supply || customer?.state || "";
    try {
      const result = calculateInvoice({
        seller_state: business.state ?? "",
        customer_state: customer?.state ?? placeOfSupply,
        place_of_supply: placeOfSupply,
        round_to_rupee: settings?.round_to_rupee ?? true,
        discount_type: form.discount_value ? form.discount_type : undefined,
        discount_value: form.discount_value ? num(form.discount_value) : 0,
        items: active.map((row) => ({
          item_name: row.item_name.trim(),
          description: row.description.trim() || null,
          hsn_sac: row.hsn_sac.trim() || null,
          rate: num(row.rate),
          quantity: num(row.quantity),
          unit: row.unit || "PCS",
          gst_rate: num(row.gst_rate),
          cess_rate: num(row.cess_rate),
          discount_type: num(row.discount_value) > 0 ? row.discount_type : undefined,
          discount_value: num(row.discount_value) > 0 ? num(row.discount_value) : undefined,
        })),
      });
      return { result, error: null };
    } catch (err) {
      const message =
        err instanceof CalculationError
          ? err.message
          : "Check the item rates and quantities to see totals.";
      return { result: null, error: message };
    }
  }, [business, settings, rows, form, customer]);

  const previewDetail = useMemo<InvoiceDetail | null>(() => {
    if (!calc.result || !business || !settings || !customer) return null;
    const result = calc.result;
    const invoice: InvoiceDetail["invoice"] = {
      id: original?.invoice.id ?? "preview",
      business_id: business.id,
      customer_id: customer.id,
      invoice_number: form.invoice_number || "—",
      invoice_date: form.invoice_date || todayISO(),
      due_date: form.due_date || null,
      place_of_supply: form.place_of_supply || null,
      reference_number: form.reference_number || null,
      payment_terms: form.payment_terms || null,
      shipping_address: form.shipping_address.trim() || null,
      subtotal: result.subtotal,
      discount: result.discount,
      discount_type: form.discount_value ? form.discount_type : null,
      discount_value: form.discount_value ? num(form.discount_value) : 0,
      taxable_amount: result.taxable_amount,
      cgst: result.cgst,
      sgst: result.sgst,
      igst: result.igst,
      cess: result.cess,
      round_off: result.round_off,
      grand_total: result.grand_total,
      amount_paid: original?.invoice.amount_paid ?? 0,
      balance_due: original?.invoice.balance_due ?? result.grand_total,
      payment_status: original?.invoice.payment_status ?? "unpaid",
      interstate: result.interstate,
      notes: form.notes || null,
      terms: form.terms || null,
      cancelled_at: null,
      created_at: original?.invoice.created_at ?? "",
      updated_at: "",
    };

    const items: InvoiceItem[] = result.items.map((line, index) => {
      const source = rows.filter((row) => row.item_name.trim())[index];
      return {
        id: `preview-${index}`,
        invoice_id: invoice.id,
        product_id: line.product_id,
        item_name: line.item_name,
        description: line.description,
        hsn_sac: line.hsn_sac,
        rate: line.rate,
        quantity: line.quantity,
        unit: line.unit,
        discount: line.discount,
        discount_type: (source?.discount_type as DiscountType) ?? null,
        discount_value: source ? num(source.discount_value) : 0,
        taxable_value: line.taxable_value,
        gst_rate: line.gst_rate,
        cgst: line.cgst,
        sgst: line.sgst,
        igst: line.igst,
        cess: line.cess,
        total_amount: line.total_amount,
        sort_order: index,
      };
    });

    return { invoice, items, customer, payments: original?.payments ?? [], business, settings };
  }, [calc.result, business, settings, customer, form, original, rows]);

  /* -------------------------------- items -------------------------------- */

  const updateRow = (key: string, patch: Partial<ItemRow>) =>
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const addRow = () => setRows((prev) => [...prev, emptyRow()]);

  const removeRow = (key: string) =>
    setRows((prev) => (prev.length === 1 ? [emptyRow()] : prev.filter((row) => row.key !== key)));

  const addProduct = (productId: string) => {
    const product = products.find((row) => row.id === productId);
    if (!product) return;
    setRows((prev) => {
      const blank = prev.length === 1 && !prev[0].item_name.trim() ? [] : prev;
      return [
        ...blank,
        {
          ...emptyRow(),
          product_id: product.id,
          item_name: product.name,
          description: product.description ?? "",
          hsn_sac: product.hsn_sac ?? "",
          rate: String(product.selling_price),
          quantity: "1",
          unit: product.unit || "PCS",
          gst_rate: String(product.gst_rate),
          cess_rate: String(product.cess ?? 0),
        },
      ];
    });
  };

  /* -------------------------------- save --------------------------------- */

  const buildPayload = (): CreateInvoicePayload => ({
    customer_id: form.customer_id,
    invoice_number: form.invoice_number || undefined,
    invoice_date: form.invoice_date,
    due_date: form.due_date || null,
    place_of_supply: form.place_of_supply || null,
    reference_number: form.reference_number || null,
    payment_terms: form.payment_terms || null,
    shipping_address: form.shipping_address.trim() || null,
    notes: form.notes || null,
    terms: form.terms || null,
    discount_type: form.discount_value ? form.discount_type : undefined,
    discount_value: form.discount_value ? num(form.discount_value) : undefined,
    items: rows
      .filter((row) => row.item_name.trim())
      .map((row) => ({
        product_id: row.product_id,
        item_name: row.item_name.trim(),
        description: row.description.trim() || undefined,
        hsn_sac: row.hsn_sac.trim() || undefined,
        rate: num(row.rate),
        quantity: num(row.quantity),
        unit: row.unit || "PCS",
        gst_rate: num(row.gst_rate),
        cess_rate: num(row.cess_rate) || undefined,
        discount_type: num(row.discount_value) > 0 ? row.discount_type : undefined,
        discount_value: num(row.discount_value) > 0 ? num(row.discount_value) : undefined,
      })),
  });

  const validate = (): Record<string, string> => {
    const found: Record<string, string> = {};
    if (!form.customer_id) found.customer_id = "Select a customer.";
    if (!form.invoice_date) found.invoice_date = "Invoice date is required.";
    const active = rows.filter((row) => row.item_name.trim());
    if (active.length === 0) found.items = "Add at least one item with a name.";
    active.forEach((row) => {
      if (!(num(row.quantity) > 0)) found.items = "Every item needs a quantity greater than zero.";
      if (num(row.rate) < 0) found.items = "Rate cannot be negative.";
      if (num(row.gst_rate) < 0 || num(row.gst_rate) > 100) found.items = "GST rate must be 0-100%.";
    });
    return found;
  };

  const save = async (alsoNew = false) => {
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      toast.error("Please fix the highlighted fields.");
      return;
    }

    setSaving(true);
    setServerError(null);
    try {
      const payload = buildPayload();
      const saved = id ? await api.updateInvoice(id, payload) : await api.createInvoice(payload);
      toast.success(
        id ? `Invoice ${saved.invoice.invoice_number} updated.` : `Invoice ${saved.invoice.invoice_number} created.`,
      );
      if (alsoNew) {
        setForm(EMPTY_FORM);
        setRows([emptyRow()]);
        const next = await api.getNextInvoiceNumber();
        const today = todayISO();
        setForm({
          ...EMPTY_FORM,
          invoice_number: next.invoice_number,
          invoice_date: today,
          due_date: settings ? addDaysISO(today, settings.default_due_days ?? 0) : "",
        });
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        navigate(`/invoices/${saved.invoice.id}`, { replace: true });
      }
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Unable to save the invoice.";
      setServerError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  /* ------------------------------- render -------------------------------- */

  if (loading) return <LoadingState label="Loading invoice form…" />;
  if (loadError) return <ErrorState message={loadError} />;
  if (!business || !settings) return <ErrorState message="Business profile could not be loaded." />;

  const result = calc.result;

  return (
    <div className="space-y-6">
      <PageHeader
        title={editing ? `Edit ${original?.invoice.invoice_number ?? "invoice"}` : "Create Invoice"}
        description={
          editing
            ? "Changes are re-calculated on the server before saving."
            : "Totals, GST split and round-off are calculated server-side - the preview below is a live mirror."
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to={id ? `/invoices/${id}` : "/invoices"}>Cancel</Link>
            </Button>
            <Button onClick={() => void save()} loading={saving}>
              {editing ? "Save changes" : "Save Invoice"}
            </Button>
          </>
        }
      />

      {serverError && <ErrorState message={serverError} />}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_460px]">
        {/* ------------------------------ left: form ---------------------- */}
        <div className="space-y-6">
          {/* invoice details */}
          <section className="rounded-lg border bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Invoice details
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Invoice number" htmlFor="inv-number" hint="Auto-generated, unique per business">
                <Input
                  id="inv-number"
                  value={form.invoice_number}
                  onChange={(event) => setField("invoice_number")(event.target.value)}
                  placeholder="INV-0001"
                />
              </Field>
              <Field label="Invoice date" htmlFor="inv-date" required error={errors.invoice_date}>
                <Input
                  id="inv-date"
                  type="date"
                  value={form.invoice_date}
                  onChange={(event) => setField("invoice_date")(event.target.value)}
                />
              </Field>
              <Field label="Due date" htmlFor="inv-due" hint="Drives the Overdue status">
                <Input
                  id="inv-due"
                  type="date"
                  value={form.due_date}
                  onChange={(event) => setField("due_date")(event.target.value)}
                />
              </Field>
              <Field label="Place of supply" htmlFor="inv-pos" hint="Same state = CGST/SGST, other = IGST">
                <Select value={form.place_of_supply} onValueChange={setField("place_of_supply")}>
                  <SelectTrigger id="inv-pos">
                    <SelectValue placeholder={customer?.state ? `Default: ${customer.state}` : "Select state"} />
                  </SelectTrigger>
                  <SelectContent>
                    {STATES.map((state) => (
                      <SelectItem key={state.code} value={stateLabel(state)}>
                        {stateLabel(state)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Reference / PO number" htmlFor="inv-ref">
                <Input
                  id="inv-ref"
                  value={form.reference_number}
                  onChange={(event) => setField("reference_number")(event.target.value)}
                />
              </Field>
              <Field label="Payment terms" htmlFor="inv-terms-text">
                <Input
                  id="inv-terms-text"
                  value={form.payment_terms}
                  onChange={(event) => setField("payment_terms")(event.target.value)}
                  placeholder="Payable within 15 days"
                />
              </Field>
            </div>
          </section>

          {/* customer */}
          <section className="rounded-lg border bg-white p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Bill to</h2>
              <Button variant="outline" size="sm" onClick={() => setCustomerDialogOpen(true)}>
                <Plus /> New customer
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Customer" htmlFor="inv-customer" required error={errors.customer_id}>
                <Select value={form.customer_id} onValueChange={setField("customer_id")}>
                  <SelectTrigger id="inv-customer">
                    <SelectValue placeholder="Select a customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.company_name || row.name}
                        {row.gstin ? ` · ${row.gstin}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="rounded-md border border-dashed bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
                {customer ? (
                  <>
                    <div className="font-medium text-foreground">{customer.company_name || customer.name}</div>
                    <div>
                      {[customer.billing_address, customer.city, customer.state, customer.pincode]
                        .filter(Boolean)
                        .join(", ") || "No address on file"}
                    </div>
                    <div>GSTIN: {customer.gstin || "Unregistered"}</div>
                    <div>State: {customer.state || "—"}</div>
                  </>
                ) : (
                  "Select a customer to lock the place of supply and the CGST/SGST vs IGST split."
                )}
              </div>
            </div>
            <Field
              label="Shipping address (optional)"
              htmlFor="inv-shipping"
              hint="Printed on the invoice when filled - leave blank to use the customer's address."
              className="mt-4 sm:col-span-2"
            >
              <Textarea
                id="inv-shipping"
                rows={3}
                value={form.shipping_address}
                onChange={(event) => setField("shipping_address")(event.target.value)}
                placeholder={"Flat 4B, 22 GST Road\nCoimbatore, TAMIL NADU 641001"}
              />
            </Field>
          </section>

          {/* items */}
          <section className="rounded-lg border bg-white p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Items {errors.items && <span className="ml-2 text-destructive normal-case">{errors.items}</span>}
              </h2>
              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor="inv-add-product">
                  Add product
                </label>
                <select
                  id="inv-add-product"
                  className="h-9 w-full rounded-md border border-input bg-white px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring sm:w-64"
                  value=""
                  onChange={(event) => {
                    if (event.target.value) addProduct(event.target.value);
                  }}
                >
                  <option value="">Add a saved product…</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} · {formatINR(product.selling_price)}
                    </option>
                  ))}
                </select>
                <Button variant="outline" size="sm" onClick={addRow}>
                  <Plus /> Line
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="w-8 py-2">#</th>
                    <th className="min-w-[200px] py-2">Item / description</th>
                    <th className="w-24 py-2">HSN/SAC</th>
                    <th className="w-20 py-2 text-right">Qty</th>
                    <th className="w-24 py-2">Unit</th>
                    <th className="w-28 py-2 text-right">Rate ₹</th>
                    <th className="w-24 py-2">Disc type</th>
                    <th className="w-24 py-2 text-right">Disc</th>
                    <th className="w-20 py-2 text-right">GST %</th>
                    <th className="w-20 py-2 text-right">Cess %</th>
                    <th className="w-32 py-2 text-right">Taxable</th>
                    <th className="w-32 py-2 text-right">Amount</th>
                    <th className="w-10 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => {
                    const activeRows = rows.filter((r) => r.item_name.trim());
                    const activeIndex = activeRows.indexOf(row);
                    const line = activeIndex >= 0 ? result?.items[activeIndex] : undefined;
                    return (
                      <tr key={row.key} className="border-b align-top last:border-b-0">
                        <td className="py-2 text-xs text-muted-foreground">{index + 1}</td>
                        <td className="py-2 pr-2">
                          <input
                            className="h-8 w-full rounded border border-input bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            value={row.item_name}
                            placeholder="Item name"
                            aria-label={`Item ${index + 1} name`}
                            onChange={(event) => updateRow(row.key, { item_name: event.target.value })}
                          />
                          <input
                            className="mt-1 h-7 w-full rounded border border-dashed border-input bg-transparent px-2 text-xs text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                            value={row.description}
                            placeholder="Description (optional)"
                            aria-label={`Item ${index + 1} description`}
                            onChange={(event) => updateRow(row.key, { description: event.target.value })}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            className="h-8 w-full rounded border border-input bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            value={row.hsn_sac}
                            aria-label={`Item ${index + 1} HSN code`}
                            onChange={(event) => updateRow(row.key, { hsn_sac: event.target.value })}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            className="h-8 w-full rounded border border-input bg-white px-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            inputMode="decimal"
                            value={row.quantity}
                            aria-label={`Item ${index + 1} quantity`}
                            onChange={(event) => updateRow(row.key, { quantity: event.target.value })}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            className="h-8 w-full rounded border border-input bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            value={row.unit}
                            aria-label={`Item ${index + 1} unit`}
                            onChange={(event) => updateRow(row.key, { unit: event.target.value })}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            className="h-8 w-full rounded border border-input bg-white px-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            inputMode="decimal"
                            value={row.rate}
                            aria-label={`Item ${index + 1} rate`}
                            onChange={(event) => updateRow(row.key, { rate: event.target.value })}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <select
                            className="h-8 w-full rounded border border-input bg-white px-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                            value={row.discount_type}
                            aria-label={`Item ${index + 1} discount type`}
                            onChange={(event) =>
                              updateRow(row.key, { discount_type: event.target.value as DiscountType })
                            }
                          >
                            <option value="percent">%</option>
                            <option value="amount">₹</option>
                          </select>
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            className="h-8 w-full rounded border border-input bg-white px-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            inputMode="decimal"
                            value={row.discount_value}
                            placeholder="0"
                            aria-label={`Item ${index + 1} discount`}
                            onChange={(event) => updateRow(row.key, { discount_value: event.target.value })}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            className="h-8 w-full rounded border border-input bg-white px-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            inputMode="decimal"
                            value={row.gst_rate}
                            aria-label={`Item ${index + 1} GST rate`}
                            onChange={(event) => updateRow(row.key, { gst_rate: event.target.value })}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            className="h-8 w-full rounded border border-input bg-white px-2 text-right text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            inputMode="decimal"
                            value={row.cess_rate}
                            aria-label={`Item ${index + 1} cess rate`}
                            onChange={(event) => updateRow(row.key, { cess_rate: event.target.value })}
                          />
                        </td>
                        <td className="py-3 pr-2 text-right text-xs text-muted-foreground">
                          {line ? formatINR(line.taxable_value) : "—"}
                        </td>
                        <td className="py-3 pr-2 text-right text-xs font-medium">
                          {line ? formatINR(line.total_amount) : "—"}
                        </td>
                        <td className="py-2">
                          <button
                            type="button"
                            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
                            aria-label={`Remove item ${index + 1}`}
                            onClick={() => removeRow(row.key)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <Button variant="ghost" size="sm" onClick={addRow}>
                <Plus /> Add another line
              </Button>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <Label htmlFor="inv-discount" className="text-muted-foreground">
                    Invoice discount
                  </Label>
                  <select
                    id="inv-discount-type"
                    className="h-8 rounded border border-input bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={form.discount_type}
                    aria-label="Invoice discount type"
                    onChange={(event) => setField("discount_type")(event.target.value)}
                  >
                    <option value="amount">₹</option>
                    <option value="percent">%</option>
                  </select>
                  <Input
                    id="inv-discount"
                    className="h-8 w-24 text-right"
                    inputMode="decimal"
                    value={form.discount_value}
                    placeholder="0"
                    onChange={(event) => setField("discount_value")(event.target.value)}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* notes + terms */}
          <section className="rounded-lg border bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Notes &amp; terms
            </h2>
            <div className="grid grid-cols-1 gap-4">
              <Field label="Notes" htmlFor="inv-notes" hint="Shown above the terms block on the invoice">
                <Textarea
                  id="inv-notes"
                  rows={2}
                  value={form.notes}
                  onChange={(event) => setField("notes")(event.target.value)}
                />
              </Field>
              <Field label="Terms & conditions" htmlFor="inv-terms" hint="One clause per line">
                <Textarea
                  id="inv-terms"
                  rows={4}
                  value={form.terms}
                  onChange={(event) => setField("terms")(event.target.value)}
                />
              </Field>
            </div>
            <Separator className="my-4" />
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" asChild>
                <Link to={id ? `/invoices/${id}` : "/invoices"}>Cancel</Link>
              </Button>
              {!editing && (
                <Button variant="secondary" loading={saving} onClick={() => void save(true)}>
                  Save &amp; create another
                </Button>
              )}
              <Button loading={saving} onClick={() => void save()}>
                {editing ? "Save changes" : "Save Invoice"}
              </Button>
            </div>
          </section>
        </div>

        {/* ----------------------------- right: preview ------------------- */}
        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <section className="rounded-lg border bg-white p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Totals</h2>
              <Select value={copyLabel} onValueChange={(value) => setCopyLabel(value as CopyLabel)}>
                <SelectTrigger className="h-8 w-[190px] text-xs" aria-label="Copy label">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COPY_LABELS.map((label) => (
                    <SelectItem key={label} value={label}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!customer && (
              <p className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                Select a customer to see the tax split and the printable preview.
              </p>
            )}

            {calc.error && (
              <p className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {calc.error}
              </p>
            )}

            {result && (
              <div className="mt-3 space-y-1.5 text-sm">
                <TotalRow label={`Items / qty (${result.total_items})`} value={String(result.total_quantity)} />
                <TotalRow label="Subtotal" value={formatINR(result.subtotal)} />
                {result.discount > 0 && (
                  <TotalRow label="Discount" value={`- ${formatINR(result.discount)}`} />
                )}
                <TotalRow label="Taxable value" value={formatINR(result.taxable_amount)} />
                {result.interstate ? (
                  <TotalRow label="IGST" value={formatINR(result.igst)} />
                ) : (
                  <>
                    <TotalRow label="CGST" value={formatINR(result.cgst)} />
                    <TotalRow label="SGST" value={formatINR(result.sgst)} />
                  </>
                )}
                {result.cess > 0 && <TotalRow label="Cess" value={formatINR(result.cess)} />}
                {result.round_off !== 0 && <TotalRow label="Round off" value={formatINR(result.round_off)} />}
                <Separator className="my-2" />
                <div className="flex items-center justify-between text-base font-semibold">
                  <span>Grand total</span>
                  <span>{formatINR(result.grand_total)}</span>
                </div>
                <p className="text-xs italic text-muted-foreground">{amountInWords(result.grand_total)}</p>
                <p className="pt-1 text-[11px] text-muted-foreground">
                  {result.interstate
                    ? "Inter-state supply → IGST applies."
                    : "Intra-state supply → CGST + SGST apply."}
                </p>
              </div>
            )}
          </section>

          {previewDetail && (
            <section className="rounded-lg border bg-white p-4">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Preview</h2>
              <div className="max-h-[620px] overflow-auto rounded border bg-slate-50 p-2">
                <div style={{ zoom: 0.5 }}>
                  <InvoiceDocument detail={previewDetail} copyLabel={copyLabel} showBalance={false} />
                </div>
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Spinner className="h-3 w-3" /> Live preview - the saved invoice is re-calculated on the server.
              </p>
            </section>
          )}
        </aside>
      </div>

      <CustomerDialog
        open={customerDialogOpen}
        onOpenChange={setCustomerDialogOpen}
        onSaved={(saved) => {
          setCustomers((prev) => [saved, ...prev]);
          setForm((prev) => ({
            ...prev,
            customer_id: saved.id,
            place_of_supply:
              prev.place_of_supply || saved.place_of_supply || (saved.state ? stateLabelByName(saved.state) : ""),
          }));
        }}
      />
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function stateLabelByName(name: string): string {
  const found = STATES.find((state) => state.name.toLowerCase() === name.toLowerCase());
  return found ? stateLabel(found) : name;
}
