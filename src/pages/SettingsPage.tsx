import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorState, LoadingState } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { resizeImageToDataUrl } from "@/lib/export";
import { COPY_LABELS } from "@/components/invoices/InvoiceDocument";
import { STATES, stateLabel } from "~shared/states";
import type { Business, InvoiceSettings, InvoiceTemplate } from "~shared/types";

const TEMPLATES: Array<{ value: InvoiceTemplate; label: string }> = [
  { value: "classic", label: "Classic" },
  { value: "modern", label: "Modern" },
  { value: "minimal", label: "Minimal" },
  { value: "professional", label: "Professional" },
  { value: "standard", label: "Standard" },
];

const ACCENT_COLORS = [
  { value: "#0f766e", label: "Teal" },
  { value: "#0369a1", label: "Ocean blue" },
  { value: "#4338ca", label: "Indigo" },
  { value: "#7c3aed", label: "Violet" },
  { value: "#b91c1c", label: "Crimson" },
  { value: "#b45309", label: "Amber" },
  { value: "#166534", label: "Forest" },
  { value: "#111827", label: "Charcoal" },
];

const TABS = ["business", "invoice", "tax", "bank", "pdf", "account"] as const;
const TAB_ALIASES: Record<string, string> = { profile: "account", security: "account" };

type BusinessForm = Partial<Business>;

export function SettingsPage() {
  const { user, setUser, setBusiness: setBusinessState } = useAuth();
  const [params, setParams] = useSearchParams();

  const rawTab = params.get("tab") ?? "";
  const tab = TABS.includes((TAB_ALIASES[rawTab] ?? rawTab) as (typeof TABS)[number])
    ? (TAB_ALIASES[rawTab] ?? rawTab)
    : "business";

  const setTab = (value: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", value);
    setParams(next, { replace: true });
  };

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [settings, setSettings] = useState<InvoiceSettings | null>(null);
  const [bizForm, setBizForm] = useState<BusinessForm>({});
  const [invForm, setInvForm] = useState<Partial<InvoiceSettings>>({});
  const [profileForm, setProfileForm] = useState({ name: user?.name ?? "", email: user?.email ?? "" });
  const [passwordForm, setPasswordForm] = useState({
    current_password: "",
    new_password: "",
    confirm: "",
  });

  const [saving, setSaving] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await api.getBusiness();
        if (cancelled) return;
        setSettings(data.settings);
        setBizForm(data.business);
        setInvForm(data.settings);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Unable to load your settings.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setProfileForm({ name: user?.name ?? "", email: user?.email ?? "" });
  }, [user]);

  const saveBusiness = async () => {
    setSaving("business");
    try {
      const data = await api.updateBusiness(bizForm);
      setSettings(data.settings);
      setBizForm(data.business);
      setBusinessState(data.business);
      toast.success("Business profile saved.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Unable to save the business profile.");
    } finally {
      setSaving(null);
    }
  };

  const saveSettings = async () => {
    setSaving("settings");
    try {
      const updated = await api.updateInvoiceSettings(invForm);
      setSettings(updated);
      setInvForm(updated);
      toast.success("Invoice settings saved.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Unable to save invoice settings.");
    } finally {
      setSaving(null);
    }
  };

  const saveProfile = async () => {
    setSaving("profile");
    try {
      const session = await api.auth.updateProfile({
        name: profileForm.name.trim(),
        email: profileForm.email.trim(),
      });
      setUser(session.user);
      toast.success("Profile updated.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Unable to update your profile.");
    } finally {
      setSaving(null);
    }
  };

  const savePassword = async () => {
    if (passwordForm.new_password.length < 8) {
      toast.error("New password must be at least 8 characters.");
      return;
    }
    if (passwordForm.new_password !== passwordForm.confirm) {
      toast.error("New passwords do not match.");
      return;
    }
    setSaving("password");
    try {
      await api.auth.changePassword({
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      });
      setPasswordForm({ current_password: "", new_password: "", confirm: "" });
      toast.success("Password changed.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Unable to change the password.");
    } finally {
      setSaving(null);
    }
  };

  const pickLogo = async (file: File | null) => {
    if (!file) return;
    setLogoBusy(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file, 320);
      setBizForm((prev) => ({ ...prev, logo_url: dataUrl }));
      toast.success("Logo ready - save the business profile to apply it.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to read that image.");
    } finally {
      setLogoBusy(false);
    }
  };

  if (loading) return <LoadingState label="Loading settings…" />;
  if (error) return <ErrorState message={error} />;

  const biz = bizForm;
  const setBiz = (key: keyof Business) => (value: string) =>
    setBizForm((prev) => ({ ...prev, [key]: value }));

  const setInv = (key: keyof InvoiceSettings, value: string | number | boolean) =>
    setInvForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Business profile, invoice layout, tax behaviour, bank details and your account."
      />

      <Tabs value={tab} onValueChange={setTab} activationMode="manual">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
          <TabsTrigger value="business">Business Profile</TabsTrigger>
          <TabsTrigger value="invoice">Invoice</TabsTrigger>
          <TabsTrigger value="tax">Tax &amp; Payment</TabsTrigger>
          <TabsTrigger value="bank">Bank</TabsTrigger>
          <TabsTrigger value="pdf">PDF &amp; Template</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
        </TabsList>

        {/* ------------------------------ business ------------------------- */}
        <TabsContent value="business">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Business details
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Logo" htmlFor="biz-logo" hint="PNG or JPG, shown on the invoice header">
                <div className="flex items-center gap-3">
                  {biz.logo_url ? (
                    <img
                      src={biz.logo_url}
                      alt="Business logo"
                      className="h-12 w-12 rounded border bg-white object-contain p-1"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded border bg-muted text-xs text-muted-foreground">
                      N/A
                    </div>
                  )}
                  <label className="cursor-pointer">
                    <span className="inline-flex h-8 items-center rounded-md border border-input bg-white px-3 text-sm shadow-sm hover:bg-accent">
                      {logoBusy ? "Reading…" : biz.logo_url ? "Replace" : "Upload"}
                    </span>
                    <input
                      id="biz-logo"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => void pickLogo(event.target.files?.[0] ?? null)}
                    />
                  </label>
                  {biz.logo_url && (
                    <button
                      type="button"
                      className="text-xs underline text-muted-foreground hover:text-foreground"
                      onClick={() => setBizForm((prev) => ({ ...prev, logo_url: null }))}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </Field>

              <Field label="Business name" htmlFor="biz-name" required>
                <Input
                  id="biz-name"
                  value={biz.business_name ?? ""}
                  onChange={(event) => setBiz("business_name")(event.target.value)}
                />
              </Field>

              <Field label="GSTIN" htmlFor="biz-gstin" hint="15 digit GSTIN">
                <Input
                  id="biz-gstin"
                  value={biz.gstin ?? ""}
                  onChange={(event) => setBiz("gstin")(event.target.value.toUpperCase())}
                />
              </Field>

              <Field label="PAN" htmlFor="biz-pan">
                <Input
                  id="biz-pan"
                  value={biz.pan ?? ""}
                  onChange={(event) => setBiz("pan")(event.target.value.toUpperCase())}
                />
              </Field>

              <Field label="Address" htmlFor="biz-address" className="sm:col-span-2">
                <Textarea
                  id="biz-address"
                  rows={2}
                  value={biz.address ?? ""}
                  onChange={(event) => setBiz("address")(event.target.value)}
                />
              </Field>

              <Field label="City" htmlFor="biz-city">
                <Input
                  id="biz-city"
                  value={biz.city ?? ""}
                  onChange={(event) => setBiz("city")(event.target.value)}
                />
              </Field>

              <Field label="State" htmlFor="biz-state" required hint="Drives CGST/SGST vs IGST">
                <Select value={biz.state ?? ""} onValueChange={setBiz("state")}>
                  <SelectTrigger id="biz-state">
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

              <Field label="PIN code" htmlFor="biz-pin">
                <Input
                  id="biz-pin"
                  value={biz.pincode ?? ""}
                  onChange={(event) => setBiz("pincode")(event.target.value)}
                />
              </Field>

              <Field label="Phone" htmlFor="biz-phone">
                <Input
                  id="biz-phone"
                  value={biz.phone ?? ""}
                  onChange={(event) => setBiz("phone")(event.target.value)}
                />
              </Field>

              <Field label="Email" htmlFor="biz-email">
                <Input
                  id="biz-email"
                  type="email"
                  value={biz.email ?? ""}
                  onChange={(event) => setBiz("email")(event.target.value)}
                />
              </Field>

              <Field label="Website" htmlFor="biz-web">
                <Input
                  id="biz-web"
                  value={biz.website ?? ""}
                  onChange={(event) => setBiz("website")(event.target.value)}
                />
              </Field>

              <div className="sm:col-span-2">
                <Separator className="mb-4" />
                <div className="flex justify-end">
                  <Button loading={saving === "business"} onClick={() => void saveBusiness()}>
                    Save business profile
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------- invoice ------------------------- */}
        <TabsContent value="invoice">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Numbering &amp; defaults
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Invoice prefix" htmlFor="inv-prefix" hint="Invoices look like PREFIX-0001">
                <Input
                  id="inv-prefix"
                  value={invForm.invoice_prefix ?? ""}
                  onChange={(event) => setInv("invoice_prefix", event.target.value.toUpperCase())}
                />
              </Field>

              <Field label="Next invoice number" htmlFor="inv-next" hint="Increments automatically">
                <Input
                  id="inv-next"
                  inputMode="numeric"
                  value={String(invForm.next_invoice_number ?? 1)}
                  onChange={(event) => setInv("next_invoice_number", Number(event.target.value) || 1)}
                />
              </Field>

              <Field label="Document title" htmlFor="inv-title" hint="Printed at the top of the invoice">
                <Input
                  id="inv-title"
                  value={invForm.invoice_title ?? ""}
                  onChange={(event) => setInv("invoice_title", event.target.value)}
                />
              </Field>

              <Field label="Default copy label" htmlFor="inv-copy">
                <Select
                  value={invForm.default_copy_label ?? COPY_LABELS[0]}
                  onValueChange={(value) => setInv("default_copy_label", value)}
                >
                  <SelectTrigger id="inv-copy">
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
              </Field>

              <Field label="Default due days" htmlFor="inv-due" hint="Added to the invoice date">
                <Input
                  id="inv-due"
                  inputMode="numeric"
                  value={String(invForm.default_due_days ?? 0)}
                  onChange={(event) => setInv("default_due_days", Number(event.target.value) || 0)}
                />
              </Field>

              <Field label="Default payment terms" htmlFor="inv-payterms">
                <Input
                  id="inv-payterms"
                  value={invForm.default_payment_terms ?? ""}
                  onChange={(event) => setInv("default_payment_terms", event.target.value)}
                />
              </Field>

              <Field label="Default notes" htmlFor="inv-notes">
                <Textarea
                  id="inv-notes"
                  rows={2}
                  value={invForm.default_notes ?? ""}
                  onChange={(event) => setInv("default_notes", event.target.value)}
                />
              </Field>

              <Field label="Default terms & conditions" htmlFor="inv-terms" hint="One clause per line">
                <Textarea
                  id="inv-terms"
                  rows={4}
                  value={invForm.default_terms ?? ""}
                  onChange={(event) => setInv("default_terms", event.target.value)}
                />
              </Field>

              <div className="sm:col-span-2 flex justify-end">
                <Button loading={saving === "settings"} onClick={() => void saveSettings()}>
                  Save invoice settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* -------------------------------- tax ---------------------------- */}
        <TabsContent value="tax">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Tax behaviour
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start justify-between gap-4 rounded-md border p-4">
                <div>
                  <Label htmlFor="round-rupee">Round grand total to the nearest rupee</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Applies to every new invoice. Round-off is stored separately on the invoice.
                  </p>
                </div>
                <Checkbox
                  id="round-rupee"
                  checked={invForm.round_to_rupee ?? true}
                  onCheckedChange={(checked) => setInv("round_to_rupee", checked === true)}
                />
              </div>

              <div className="rounded-md border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
                <p className="mb-1 font-medium text-foreground">How tax is applied</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>Same state as your business → CGST + SGST (each half of the tax rate).</li>
                  <li>Different state (place of supply) → IGST for the full rate.</li>
                  <li>Each line keeps its own GST rate, and invoice-level discounts reduce taxable value before tax.</li>
                  <li>Seller state: {biz.state ? stateLabelByName(biz.state) : "set your state in Business Profile"}.</li>
                </ul>
              </div>

              <div className="flex justify-end">
                <Button loading={saving === "settings"} onClick={() => void saveSettings()}>
                  Save tax settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* -------------------------------- bank --------------------------- */}
        <TabsContent value="bank">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Bank &amp; signatory
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex items-start justify-between gap-4 rounded-md border p-4 sm:col-span-2">
                <div>
                  <Label htmlFor="show-bank">Show bank details on the invoice</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Prints a "Bank Details" block below the totals.
                  </p>
                </div>
                <Checkbox
                  id="show-bank"
                  checked={invForm.show_bank_details ?? true}
                  onCheckedChange={(checked) => setInv("show_bank_details", checked === true)}
                />
              </div>

              <Field label="Bank name" htmlFor="bank-name">
                <Input
                  id="bank-name"
                  value={invForm.bank_name ?? ""}
                  onChange={(event) => setInv("bank_name", event.target.value)}
                />
              </Field>

              <Field label="Account holder" htmlFor="bank-holder">
                <Input
                  id="bank-holder"
                  value={invForm.account_holder ?? ""}
                  onChange={(event) => setInv("account_holder", event.target.value)}
                />
              </Field>

              <Field label="Account number" htmlFor="bank-acct">
                <Input
                  id="bank-acct"
                  value={invForm.account_number ?? ""}
                  onChange={(event) => setInv("account_number", event.target.value)}
                />
              </Field>

              <Field label="IFSC code" htmlFor="bank-ifsc">
                <Input
                  id="bank-ifsc"
                  value={invForm.ifsc_code ?? ""}
                  onChange={(event) => setInv("ifsc_code", event.target.value.toUpperCase())}
                />
              </Field>

              <Field label="Branch" htmlFor="bank-branch">
                <Input
                  id="bank-branch"
                  value={invForm.branch ?? ""}
                  onChange={(event) => setInv("branch", event.target.value)}
                />
              </Field>

              <Field label="Authorized signatory" htmlFor="bank-sign">
                <Input
                  id="bank-sign"
                  value={invForm.authorized_signatory ?? ""}
                  onChange={(event) => setInv("authorized_signatory", event.target.value)}
                />
              </Field>

              <div className="sm:col-span-2 flex justify-end">
                <Button loading={saving === "settings"} onClick={() => void saveSettings()}>
                  Save bank details
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* -------------------------------- pdf ---------------------------- */}
        <TabsContent value="pdf">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Template &amp; print output
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Template" htmlFor="pdf-template">
                <Select
                  value={invForm.template ?? "classic"}
                  onValueChange={(value) => setInv("template", value as InvoiceTemplate)}
                >
                  <SelectTrigger id="pdf-template">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEMPLATES.map((template) => (
                      <SelectItem key={template.value} value={template.value}>
                        {template.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Accent colour" htmlFor="pdf-accent">
                <Select
                  value={invForm.accent_color ?? "#0f766e"}
                  onValueChange={(value) => setInv("accent_color", value)}
                >
                  <SelectTrigger id="pdf-accent">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCENT_COLORS.map((color) => (
                      <SelectItem key={color.value} value={color.value}>
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block h-3.5 w-3.5 rounded-full border"
                            style={{ background: color.value }}
                          />
                          {color.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Footer text" htmlFor="pdf-footer" className="sm:col-span-2">
                <Textarea
                  id="pdf-footer"
                  rows={2}
                  value={invForm.footer_text ?? ""}
                  onChange={(event) => setInv("footer_text", event.target.value)}
                />
              </Field>

              <Field label="Signature text" htmlFor="pdf-sign" className="sm:col-span-2" hint="Shown above the signatory line">
                <Input
                  id="pdf-sign"
                  value={invForm.signature_text ?? ""}
                  onChange={(event) => setInv("signature_text", event.target.value)}
                />
              </Field>

              <div className="sm:col-span-2 flex justify-end">
                <Button loading={saving === "settings"} onClick={() => void saveSettings()}>
                  Save PDF settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------- account ------------------------- */}
        <TabsContent value="account" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Your profile
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Name" htmlFor="acc-name" required>
                <Input
                  id="acc-name"
                  value={profileForm.name}
                  onChange={(event) => setProfileForm((prev) => ({ ...prev, name: event.target.value }))}
                />
              </Field>
              <Field label="Email" htmlFor="acc-email" required>
                <Input
                  id="acc-email"
                  type="email"
                  value={profileForm.email}
                  onChange={(event) => setProfileForm((prev) => ({ ...prev, email: event.target.value }))}
                />
              </Field>
              <div className="sm:col-span-2 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {user?.email_verified ? "Email verified" : "Email not verified yet"}
                </span>
                <Button loading={saving === "profile"} onClick={() => void saveProfile()}>
                  Save profile
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Change password
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Current password" htmlFor="acc-current" required>
                <Input
                  id="acc-current"
                  type="password"
                  value={passwordForm.current_password}
                  onChange={(event) =>
                    setPasswordForm((prev) => ({ ...prev, current_password: event.target.value }))
                  }
                />
              </Field>
              <Field label="New password" htmlFor="acc-new" required hint="At least 8 characters">
                <Input
                  id="acc-new"
                  type="password"
                  value={passwordForm.new_password}
                  onChange={(event) => setPasswordForm((prev) => ({ ...prev, new_password: event.target.value }))}
                />
              </Field>
              <Field label="Confirm new password" htmlFor="acc-confirm" required>
                <Input
                  id="acc-confirm"
                  type="password"
                  value={passwordForm.confirm}
                  onChange={(event) => setPasswordForm((prev) => ({ ...prev, confirm: event.target.value }))}
                />
              </Field>
              <div className="sm:col-span-3 flex justify-end">
                <Button loading={saving === "password"} onClick={() => void savePassword()}>
                  Change password
                </Button>
              </div>
            </CardContent>
          </Card>

          {settings && (
            <p className="text-xs text-muted-foreground">
              Invoice series: <span className="font-mono">{settings.invoice_prefix}</span> · next number{" "}
              <span className="font-mono">{settings.next_invoice_number}</span> · template{" "}
              <span className="capitalize">{settings.template}</span>
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function stateLabelByName(name: string): string {
  const found = STATES.find((state) => state.name.toLowerCase() === name.toLowerCase());
  return found ? stateLabel(found) : name;
}
