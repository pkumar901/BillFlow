import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AuthLayout } from "./AuthLayout";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api, ApiError } from "@/lib/api";

type State = "idle" | "working" | "done" | "error";

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<State>(token ? "working" : "idle");
  const [message, setMessage] = useState<string>("");
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;
    api.auth
      .verify(token)
      .then(() => {
        setState("done");
        setMessage("Your email address has been verified.");
      })
      .catch((error: unknown) => {
        setState("error");
        setMessage(
          error instanceof ApiError ? error.message : "Unable to verify this link right now.",
        );
      });
  }, [token]);

  return (
    <AuthLayout title="Verify your email" subtitle="Confirm that you own this email address.">
      <div className="space-y-4">
        {state === "working" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner /> Verifying your email…
          </div>
        )}
        {state === "done" && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
            {message}
          </div>
        )}
        {state === "error" && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
            {message}
          </div>
        )}
        {state === "idle" && (
          <div className="rounded-md border bg-muted/50 px-3 py-3 text-sm text-muted-foreground">
            Open the verification link that was sent to your email address. In this demo deployment no
            e-mail provider is configured, so verification links are returned by the API after signup.
          </div>
        )}
        <div className="flex flex-col gap-2">
          <Button asChild>
            <Link to="/settings?tab=business">Continue to business setup</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/">Go to dashboard</Link>
          </Button>
        </div>
      </div>
    </AuthLayout>
  );
}
