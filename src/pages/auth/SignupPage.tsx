import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AuthLayout } from "./AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { EMAIL_REGEX } from "~shared/validation";

export function SignupPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", business_name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (form.name.trim().length < 2) return setError("Please enter your name.");
    if (form.business_name.trim().length < 2) return setError("Please enter your business name.");
    if (!EMAIL_REGEX.test(form.email.trim())) return setError("Enter a valid email address.");
    if (form.password.length < 8) return setError("Password must be at least 8 characters.");
    if (form.password !== form.confirm) return setError("Passwords do not match.");

    setLoading(true);
    try {
      const session = await signUp({
        name: form.name.trim(),
        business_name: form.business_name.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      toast.success("Account created. Let's finish your business setup.");
      const token = session.verification_url
        ? new URL(session.verification_url).searchParams.get("token")
        : null;
      navigate(token ? `/verify-email?token=${encodeURIComponent(token)}` : "/settings?tab=business", {
        replace: true,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to create the account right now.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Create your BillFlow account"
      subtitle="Start invoicing with GST-ready documents in minutes."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="name">Your name</Label>
          <Input id="name" value={form.name} onChange={set("name")} placeholder="Ravi Kumar" autoComplete="name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="business_name">Business name</Label>
          <Input
            id="business_name"
            value={form.business_name}
            onChange={set("business_name")}
            placeholder="Demo Engineering Tools"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={form.email} onChange={set("email")} placeholder="you@business.com" autoComplete="email" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={form.password} onChange={set("password")} placeholder="Min 8 characters" autoComplete="new-password" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input id="confirm" type="password" value={form.confirm} onChange={set("confirm")} placeholder="Repeat password" autoComplete="new-password" />
          </div>
        </div>
        <Button type="submit" className="w-full" loading={loading}>
          Create account
        </Button>
        <p className="text-xs text-muted-foreground">
          By creating an account you agree to keep your own business and tax details accurate. BillFlow
          stores your data in your own workspace only.
        </p>
      </form>
    </AuthLayout>
  );
}
