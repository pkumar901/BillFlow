import { useState } from "react";
import { Link } from "react-router-dom";
import { AuthLayout } from "./AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { EMAIL_REGEX } from "~shared/validation";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ message: string; reset_url?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!EMAIL_REGEX.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    setLoading(true);
    try {
      const data = await api.auth.forgot(email.trim());
      setResult(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to process that request.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We will generate a secure link to set a new password."
      footer={
        <>
          Remembered it?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        </>
      }
    >
      {result ? (
        <div className="space-y-4">
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
            {result.message}
          </div>
          {result.reset_url && (
            <div className="rounded-md border bg-muted/50 p-3 text-sm">
              <p className="mb-2 text-muted-foreground">
                Demo mode: no e-mail provider is configured, so the reset link is shown here.
              </p>
              <Link to={new URL(result.reset_url).pathname + new URL(result.reset_url).search} className="font-medium text-primary hover:underline">
                Open password reset link
              </Link>
            </div>
          )}
          <Button asChild variant="outline" className="w-full">
            <Link to="/login">Back to sign in</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@business.com"
            />
          </div>
          <Button type="submit" className="w-full" loading={loading}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
