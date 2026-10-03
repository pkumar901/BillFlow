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
import { STATES, stateLabel } from "~shared/states";
import { isValidEmail, isValidGstin, isValidPhone, isValidPincode } from "~shared/validation";
import type { Customer } from "~shared/types";

interface FormState {
  name: string;
  company_name: string;
  gstin: string;
  billing_address: string;
  shipping_address: string;
  city: string;
  state: string;
  pincode: string;
  email: string;
  phone: string;
  contact_person: string;
  place_of_supply: string;
}

const EMPTY: FormState = {
  name: "",
  company_name: "",
  gstin: "",
  billing_address: "",
  shipping_address: "",
  city: "",
  state: "",
  pincode: "",
  email: "",
  phone: "",
  contact_person: "",
  place_of_supply: "",
};

function validate(values: FormState): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!values.name.trim()) errors.name = "Customer name is required.";
  if (values.gstin && !isValidGstin(values.gstin)) errors.gstin = "GSTIN format is invalid.";
  if (values.email && !isValidEmail(values.email)) errors.email = "Enter a valid email address.";
  if (values.phone && !isValidPhone(values.phone)) errors.phone = "Enter a valid phone number.";
  if (values.pincode && !isValidPincode(values.pincode)) errors.pincode = "PIN code must be 6 digits.";
  return errors;
}

export function CustomerDialog({
  open,
  onOpenChange,
  customer,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer?: Customer | null;
  onSaved: (customer: Customer) => void;
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
      customer
        ? {
            name: customer.name ?? "",
            company_name: customer.company_name ?? "",
            gstin: customer.gstin ?? "",
            billing_address: customer.billing_address ?? "",
            shipping_address: customer.shipping_address ?? "",
            city: customer.city ?? "",
            state: customer.state ?? "",
            pincode: customer.pincode ?? "",
            email: customer.email ?? "",
            phone: customer.phone ?? "",
            contact_person: customer.contact_person ?? "",
            place_of_supply: customer.place_of_supply ?? customer.state ?? "",
          }
        : EMPTY,
    );
  }, [open, customer]);

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
        ...form,
        state: form.state || null,
        place_of_supply: form.place_of_supply || (form.state ? stateLabelByName(form.state) : null),
      };
      const saved = customer
        ? await api.updateCustomer(customer.id, payload)
        : await api.createCustomer(payload);
      toast.success(customer ? "Customer updated." : "Customer added.");
      onSaved(saved);
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Unable to save the customer.";
      setServerError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>{customer ? "Edit customer" : "Add customer"}</DialogTitle>
          <DialogDescription>
            Billing details appear on invoices and GST calculations use the customer state.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
          {serverError && (
            <div className="col-span-full rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {serverError}
            </div>
          )}

          <Field label="Customer name" htmlFor="c-name" required error={errors.name} className="sm:col-span-1">
            <Input id="c-name" value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="Ramesh Traders" />
          </Field>

          <Field label="Company name" htmlFor="c-company">
            <Input id="c-company" value={form.company_name} onChange={(e) => set("company_name")(e.target.value)} placeholder="Optional" />
          </Field>

          <Field label="GSTIN" htmlFor="c-gstin" error={errors.gstin} hint="15 digit GSTIN">
            <Input id="c-gstin" value={form.gstin} onChange={(e) => set("gstin")(e.target.value.toUpperCase())} placeholder="33ABCDE1234F1Z5" />
          </Field>

          <Field label="Contact person" htmlFor="c-contact">
            <Input id="c-contact" value={form.contact_person} onChange={(e) => set("contact_person")(e.target.value)} placeholder="Accounts contact" />
          </Field>

          <Field label="Billing address" htmlFor="c-billing" className="sm:col-span-2">
            <Textarea id="c-billing" value={form.billing_address} onChange={(e) => set("billing_address")(e.target.value)} placeholder="Street, area, landmark" />
          </Field>

          <Field label="Shipping address" htmlFor="c-shipping" className="sm:col-span-2" hint="Leave blank if same as billing address">
            <Textarea id="c-shipping" value={form.shipping_address} onChange={(e) => set("shipping_address")(e.target.value)} />
          </Field>

          <Field label="City" htmlFor="c-city">
            <Input id="c-city" value={form.city} onChange={(e) => set("city")(e.target.value)} />
          </Field>

          <Field label="State" htmlFor="c-state" required>
            <Select
              value={form.state}
              onValueChange={(value) => {
                setForm((prev) => ({
                  ...prev,
                  state: value,
                  place_of_supply: prev.place_of_supply || stateLabelByName(value),
                }));
              }}
            >
              <SelectTrigger id="c-state">
                <SelectValue placeholder="Select state" />
              </SelectTrigger>
              <SelectContent>
                {STATES.map((state) => (
                  <SelectItem key={state.code} value={state.name}>
                    {stateLabel(state)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="PIN code" htmlFor="c-pin" error={errors.pincode}>
            <Input id="c-pin" value={form.pincode} onChange={(e) => set("pincode")(e.target.value)} placeholder="641021" />
          </Field>

          <Field label="Place of supply" htmlFor="c-pos">
            <Select value={form.place_of_supply} onValueChange={set("place_of_supply")}>
              <SelectTrigger id="c-pos">
                <SelectValue placeholder="Defaults to state" />
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

          <Field label="Email" htmlFor="c-email" error={errors.email}>
            <Input id="c-email" type="email" value={form.email} onChange={(e) => set("email")(e.target.value)} />
          </Field>

          <Field label="Phone" htmlFor="c-phone" error={errors.phone}>
            <Input id="c-phone" value={form.phone} onChange={(e) => set("phone")(e.target.value)} placeholder="9876543210" />
          </Field>

          <DialogFooter className="col-span-full">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {customer ? "Save changes" : "Add customer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function stateLabelByName(name: string): string {
  const found = STATES.find((state) => state.name.toLowerCase() === name.toLowerCase());
  return found ? stateLabel(found) : name;
}
