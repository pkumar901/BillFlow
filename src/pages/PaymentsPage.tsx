import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorState, LoadingState } from "@/components/ui/spinner";
import { api, ApiError } from "@/lib/api";
import { formatDate, formatDateTime, formatINR } from "@/lib/format";
import { PAYMENT_METHODS, type Payment } from "~shared/types";

const LIMIT = 20;

export function PaymentsPage() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [method, setMethod] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<Payment[]>([]);
  const [total, setTotal] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Payment | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getPayments({
        search: debounced || undefined,
        method: method === "all" ? undefined : method,
        from: from || undefined,
        to: to || undefined,
        page,
        limit: LIMIT,
      });
      setItems(data.items);
      setTotal(data.total);
      setTotalAmount(data.total_amount ?? 0);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load payments.");
    } finally {
      setLoading(false);
    }
  }, [debounced, method, from, to, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await api.deletePayment(deleting.id);
      toast.success("Payment removed - the invoice balance was updated.");
      setDeleting(null);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Unable to remove this payment.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description={`${total} payment${total === 1 ? "" : "s"} · ${formatINR(totalAmount)} collected in this view`}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search invoice #, customer…"
            className="pl-8"
            aria-label="Search payments"
          />
        </div>

        <Select
          value={method}
          onValueChange={(value) => {
            setMethod(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-44" aria-label="Filter by method">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All methods</SelectItem>
            {PAYMENT_METHODS.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="date"
          value={from}
          aria-label="From date"
          className="w-full sm:w-40"
          onChange={(event) => {
            setFrom(event.target.value);
            setPage(1);
          }}
        />
        <Input
          type="date"
          value={to}
          aria-label="To date"
          className="w-full sm:w-40"
          onChange={(event) => {
            setTo(event.target.value);
            setPage(1);
          }}
        />
      </div>

      {loading && <LoadingState label="Loading payments…" />}
      {error && !loading && <ErrorState message={error} />}

      {!loading && !error && items.length === 0 && (
        <div className="rounded-lg border bg-white">
          <EmptyState
            icon={<Wallet />}
            title="No payments found"
            description="Record a payment from an invoice and it will show up here with its method and reference."
            action={
              <Button variant="outline" asChild>
                <Link to="/invoices">Go to invoices</Link>
              </Button>
            }
          />
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <>
          <div className="hidden overflow-hidden rounded-lg border bg-white md:block">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th className="text-right">Amount</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {items.map((payment) => (
                  <tr key={payment.id}>
                    <td className="text-sm">{formatDate(payment.payment_date)}</td>
                    <td>
                      <Link className="font-medium text-primary underline-offset-2 hover:underline" to={`/invoices/${payment.invoice_id}`}>
                        {payment.invoice_number || "—"}
                      </Link>
                    </td>
                    <td className="max-w-[200px] truncate text-sm">{payment.customer_name || "—"}</td>
                    <td className="text-sm">{payment.payment_method}</td>
                    <td className="max-w-[180px] truncate text-xs text-muted-foreground">
                      {payment.transaction_reference || "—"}
                    </td>
                    <td className="text-right font-medium">{formatINR(payment.amount)}</td>
                    <td>
                      <button
                        type="button"
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
                        aria-label="Remove payment"
                        onClick={() => setDeleting(payment)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {items.map((payment) => (
              <div key={payment.id} className="rounded-lg border bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{formatINR(payment.amount)}</div>
                    <div className="text-xs text-muted-foreground">{formatDateTime(payment.created_at)}</div>
                  </div>
                  <span className="rounded bg-muted px-2 py-0.5 text-xs">{payment.payment_method}</span>
                </div>
                <div className="mt-2 text-sm">
                  <Link className="text-primary underline-offset-2 hover:underline" to={`/invoices/${payment.invoice_id}`}>
                    {payment.invoice_number || "Invoice"}
                  </Link>{" "}
                  · {payment.customer_name || "—"}
                </div>
                <div className="mt-3 flex justify-end">
                  <Button size="sm" variant="outline" className="text-destructive" onClick={() => setDeleting(payment)}>
                    <Trash2 /> Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Page {page} of {totalPages} · {total} total
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Remove payment?"
        description={`${formatINR(deleting?.amount ?? 0)} recorded on ${formatDate(deleting?.payment_date)} will be removed and the invoice balance will increase accordingly.`}
        loading={deleteLoading}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
