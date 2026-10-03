import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";
import { GST_RATES } from "~shared/validation";
import type { Product } from "~shared/types";

interface FormState {
  name: string;
  sku: string;
  hsn_sac: string;
  description: string;
  unit: string;
  selling_price: string;
  gst_rate: string;
  cess: string;
  stock_quantity: string;
}

const EMPTY: FormState = {
  name: "",
  sku: "",
  hsn_sac: "",
  description: "",
  unit: "PCS",
  selling_price: "0",
  gst_rate: "18",
  cess: "0",
  stock_quantity: "",
};

function validate(values: FormState): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!values.name.trim()) errors.name = "Product / service name is required.";
  if (!values.unit.trim()) errors.unit = "Unit is required.";

  const price = Number(values.selling_price);
  if (values.selling_price === "" || Number.isNaN(price)) errors.selling_price = "Enter a valid price.";
  else if (price < 0) errors.selling_price = "Price cannot be negative.";

  const gst = Number(values.gst_rate);
  if (values.gst_rate === "" || Number.isNaN(gst)) errors.gst_rate = "Enter a GST rate.";
  else if (gst < 0 || gst > 100) errors.gst_rate = "GST rate must be between 0 and 100.";

  const cess = Number(values.cess);
  if (values.cess === "" || Number.isNaN(cess)) errors.cess = "Enter a valid cess.";
  else if (cess < 0 || cess > 100) errors.cess = "Cess must be between 0 and 100.";

  if (values.stock_quantity) {
    const stock = Number(values.stock_quantity);
    if (Number.isNaN(stock) || stock < 0) errors.stock_quantity = "Stock must be zero or more.";
  }
  return errors;
}

export function ProductDialog({
  open,
  onOpenChange,
  product,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product | null;
  onSaved: (product: Product) => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setServerError(null);
    setForm(
      product
        ? {
            name: product.name ?? "",
            sku: product.sku ?? "",
            hsn_sac: product.hsn_sac ?? "",
            description: product.description ?? "",
            unit: product.unit ?? "PCS",
            selling_price: String(product.selling_price ?? 0),
            gst_rate: String(product.gst_rate ?? 18),
            cess: String(product.cess ?? 0),
            stock_quantity: product.stock_quantity === null ? "" : String(product.stock_quantity),
          }
        : EMPTY,
    );
  }, [open, product]);

  const set = (key: keyof FormState) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    setServerError(null);
    try {
      const payload = {
        name: form.name.trim(),
        sku: form.sku.trim() || null,
        hsn_sac: form.hsn_sac.trim() || null,
        description: form.description.trim() || null,
        unit: form.unit.trim(),
        selling_price: Number(form.selling_price),
        gst_rate: Number(form.gst_rate),
        cess: Number(form.cess),
        stock_quantity: form.stock_quantity ? Number(form.stock_quantity) : null,
      };
      const saved = product ? await api.updateProduct(product.id, payload) : await api.createProduct(payload);
      toast.success(product ? "Product updated." : "Product added.");
      onSaved(saved);
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Unable to save the product.";
      setServerError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{product ? "Edit product / service" : "Add product / service"}</DialogTitle>
          <DialogDescription>
            Prices and GST rates pre-fill invoice items. You can still override them per invoice.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
          {serverError && (
            <div className="col-span-full rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {serverError}
            </div>
          )}

          <Field label="Product / service name" htmlFor="p-name" required error={errors.name} className="sm:col-span-2">
            <Input id="p-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="Precision Tool" />
          </Field>

          <Field label="SKU" htmlFor="p-sku">
            <Input id="p-sku" value={form.sku} onChange={(e) => set("sku")(e.target.value.toUpperCase())} placeholder="TOOL-001" />
          </Field>

          <Field label="HSN / SAC code" htmlFor="p-hsn">
            <Input id="p-hsn" value={form.hsn_sac} onChange={(e) => set("hsn_sac")(e.target.value)} placeholder="8466" />
          </Field>

          <Field label="Unit" htmlFor="p-unit" required error={errors.unit}>
            <Select value={form.unit} onValueChange={set("unit")}>
              <SelectTrigger id="p-unit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["PCS", "KG", "GMS", "LTR", "MTR", "SQF", "HRS", "DAY", "NOS", "BOX", "SET"].map((unit) => (
                  <SelectItem key={unit} value={unit}>
                    {unit}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Selling price (₹)" htmlFor="p-price" required error={errors.selling_price}>
            <Input
              id="p-price"
              type="number"
              min={0}
              step="0.01"
              value={form.selling_price}
              onChange={(e) => set("selling_price")(e.target.value)}
            />
          </Field>

          <Field label="GST rate" htmlFor="p-gst" required error={errors.gst_rate}>
            <Select value={form.gst_rate} onValueChange={set("gst_rate")}>
              <SelectTrigger id="p-gst">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GST_RATES.map((rate) => (
                  <SelectItem key={rate} value={String(rate)}>
                    {rate}%
                  </SelectItem>
                ))}
                {!GST_RATES.includes(Number(form.gst_rate)) && form.gst_rate !== "" && (
                  <SelectItem value={form.gst_rate}>{form.gst_rate}% (custom)</SelectItem>
                )}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Custom GST rate (%)" htmlFor="p-gst-custom" error={errors.gst_rate} hint="Use for rates outside the standard slabs">
            <Input
              id="p-gst-custom"
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={form.gst_rate}
              onChange={(e) => set("gst_rate")(e.target.value)}
            />
          </Field>

          <Field label="Cess (%)" htmlFor="p-cess" error={errors.cess}>
            <Input id="p-cess" type="number" min={0} max={100} step="0.01" value={form.cess} onChange={(e) => set("cess")(e.target.value)} />
          </Field>

          <Field label="Stock quantity" htmlFor="p-stock" error={errors.stock_quantity} hint="Optional for services">
            <Input
              id="p-stock"
              type="number"
              min={0}
              step="0.01"
              value={form.stock_quantity}
              onChange={(e) => set("stock_quantity")(e.target.value)}
              placeholder="—"
            />
          </Field>

          <Field label="Description" htmlFor="p-desc" className="sm:col-span-2">
            <Textarea id="p-desc" value={form.description} onChange={(e) => set("description")(e.target.value)} />
          </Field>

          <DialogFooter className="col-span-full">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {product ? "Save changes" : "Add product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
