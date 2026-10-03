import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  FileDown,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  Receipt,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/StatusBadge";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { downloadInvoicePdf } from "@/lib/pdf/invoicePdf";
import { formatINR, formatDate } from "@/lib/format";
import type { Invoice } from "~shared/types";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "unpaid", label: "Unpaid" },
  { value: "partial", label: "Partially paid" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "cancelled", label: "Cancelled" },
];

const LIMIT = 15;

export function InvoicesPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<Invoice[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState<Invoice | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getInvoices({
        search: debounced || undefined,
        status: status === "all" ? undefined : status,
        page,
        limit: LIMIT,
        sort: "invoice_date",
        order: "desc",
      });
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load invoices.");
    } finally {
      setLoading(false);
    }
  }, [debounced, status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (params.get("new") === "1") {
      navigate("/invoices/new", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await api.deleteInvoice(deleting.id);
      toast.success(`Invoice ${deleting.invoice_number} deleted.`);
      setDeleting(null);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Unable to delete this invoice.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const downloadPdf = async (invoice: Invoice) => {
    setPdfBusy(invoice.id);
    try {
      const detail = await api.getInvoice(invoice.id);
      downloadInvoicePdf(detail);
      toast.success("PDF downloaded.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Unable to build the PDF.");
    } finally {
      setPdfBusy(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        description={`${total} invoice${total === 1 ? "" : "s"} · create, track and collect`}
        actions={
          <Button asChild>
            <Link to="/invoices/new">
              <Plus /> Create Invoice
            </Link>
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
            aria-label="Search invoices"
          />
        </div>
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-44" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading && <LoadingState label="Loading invoices…" />}
      {error && !loading && <ErrorState message={error} />}

      {!loading && !error && items.length === 0 && (
        <div className="rounded-lg border bg-white">
          <EmptyState
            icon={<Receipt />}
            title={debounced || status !== "all" ? "No invoices match your filters" : "No invoices yet"}
            description={
              debounced || status !== "all"
                ? "Try clearing the search or status filter."
                : "Create your first GST invoice - totals, tax split and round-off are calculated for you."
            }
            action={
              <Button asChild>
                <Link to="/invoices/new">
                  <Plus /> Create Invoice
                </Link>
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
                  <th>Invoice</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Balance</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {items.map((invoice) => (
                  <tr key={invoice.id} className="cursor-pointer" onClick={() => navigate(`/invoices/${invoice.id}`)}>
                    <td>
                      <div className="font-medium">{invoice.invoice_number}</div>
                      <div className="text-xs text-muted-foreground">
                        {invoice.item_count ?? 0} item{(invoice.item_count ?? 0) === 1 ? "" : "s"}
                      </div>
                    </td>
                    <td className="text-sm">{formatDate(invoice.invoice_date)}</td>
                    <td className="max-w-[220px] truncate text-sm">
                      {invoice.customer_name || "—"}
                    </td>
                    <td>
                      <StatusBadge status={invoice.display_status ?? invoice.payment_status} />
                    </td>
                    <td className="text-right font-medium">{formatINR(invoice.grand_total)}</td>
                    <td className="text-right">
                      {Number(invoice.balance_due) > 0 ? (
                        <span className="font-medium text-destructive">{formatINR(invoice.balance_due)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td onClick={(event) => event.stopPropagation()}>
                      <InvoiceMenu
                        invoice={invoice}
                        busy={pdfBusy === invoice.id}
                        onDownload={() => void downloadPdf(invoice)}
                        onDelete={() => setDeleting(invoice)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {items.map((invoice) => (
              <Link
                key={invoice.id}
                to={`/invoices/${invoice.id}`}
                className="block rounded-lg border bg-white p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{invoice.invoice_number}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(invoice.invoice_date)} · {invoice.customer_name || "—"}
                    </div>
                  </div>
                  <StatusBadge status={invoice.display_status ?? invoice.payment_status} />
                </div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-medium">{formatINR(invoice.grand_total)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Balance</span>
                  <span className={Number(invoice.balance_due) > 0 ? "font-medium text-destructive" : ""}>
                    {Number(invoice.balance_due) > 0 ? formatINR(invoice.balance_due) : "—"}
                  </span>
                </div>
              </Link>
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
        title="Delete invoice?"
        description={`Invoice ${deleting?.invoice_number ?? ""} and its item rows will be permanently removed. Recorded payments are removed too. This cannot be undone.`}
        loading={deleteLoading}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function InvoiceMenu({
  invoice,
  busy,
  onDownload,
  onDelete,
}: {
  invoice: Invoice;
  busy: boolean;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const navigate = useNavigate();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-md p-1.5 hover:bg-accent"
          aria-label={`Actions for ${invoice.invoice_number}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => navigate(`/invoices/${invoice.id}`)}>
          <FileText /> View
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate(`/invoices/${invoice.id}/edit`)}>
          <Pencil /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onDownload} disabled={busy}>
          <FileDown /> Download PDF
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
