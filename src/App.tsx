import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { LoadingState } from "@/components/ui/spinner";
import { useAuth } from "@/lib/auth";
import { DashboardPage } from "@/pages/DashboardPage";
import { CustomersPage } from "@/pages/CustomersPage";
import { GstSummaryPage } from "@/pages/GstSummaryPage";
import { InvoiceFormPage } from "@/pages/InvoiceFormPage";
import { InvoicesPage } from "@/pages/InvoicesPage";
import { InvoiceViewPage } from "@/pages/InvoiceViewPage";
import { PaymentsPage } from "@/pages/PaymentsPage";
import { ProductsPage } from "@/pages/ProductsPage";
import { ReportsPage } from "@/pages/ReportsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { LoginPage } from "@/pages/auth/LoginPage";
import { SignupPage } from "@/pages/auth/SignupPage";
import { ForgotPasswordPage } from "@/pages/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "@/pages/auth/ResetPasswordPage";
import { VerifyEmailPage } from "@/pages/auth/VerifyEmailPage";

/** Requires a signed-in user (and a business for business data routes). */
function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, business, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingState label="Checking your session…" />;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  // Business setup must happen before any business data screen.
  if (!business && location.pathname !== "/settings") {
    return <Navigate to="/settings?tab=business" replace />;
  }

  return <>{children}</>;
}

/** Auth screens are only available when signed out. */
function PublicOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState label="Checking your session…" />;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnly>
            <LoginPage />
          </PublicOnly>
        }
      />
      <Route
        path="/signup"
        element={
          <PublicOnly>
            <SignupPage />
          </PublicOnly>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <PublicOnly>
            <ForgotPasswordPage />
          </PublicOnly>
        }
      />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />

      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="invoices/new" element={<InvoiceFormPage />} />
        <Route path="invoices/:id" element={<InvoiceViewPage />} />
        <Route path="invoices/:id/edit" element={<InvoiceFormPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="gst-summary" element={<GstSummaryPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
