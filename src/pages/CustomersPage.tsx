import { useCallback, useEffect, useState } from "react";
import { createSearchParams, useNavigate, useSearchParams } from "react-router-dom";
import { MoreHorizontal, Plus, Search, Trash2, Users, FileText, Pencil } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { CustomerDialog } from "@/components/customers/CustomerDialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorState, LoadingState } from "@/components/ui/spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api, ApiError } from "@/lib/api";
import { formatINR, formatDate } from "@/lib/format";
import { STATES, stateLabel } from "~shared/states";
import type { Customer } from "~shared/types";

export function CustomersPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [search, setSearch] = useState(params.get("q") ?? "");
  const [debounced, setDebounced] = useState(search);
  const [state, setState] = useState("");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getCustomers({
        q: debounced || undefined,
        state: state || undefined,
        page,
        limit: 20,
        sort: "updated",
      });
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load customers.");
    } finally {
      setLoading(false);
    }
  }, [debounced, state, page]);

  useEffect(() => {
    void load();
  }, [load]);

  // deep links: /customers?new=1 and /customers?edit=<id>
  useEffect(() => {
    if (params.get("new") === "1") {
      setEditing(null);
      setDialogOpen(true);
      params.delete("new");
      setParams(params, { replace: true });
    }
    const editId = params.get("edit");
    if (editId) {
      const found = items.find((customer) => customer.id === editId);
      if (found) {
        setEditing(found);
        setDialogOpen(true);
      }
      params.delete("edit");
      setParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, items]);

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await api.deleteCustomer(deleting.id);
      toast.success(`Deleted ${deleting.name}.`);
      setDeleting(null);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Unable to delete this customer.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description={`${total} customer${total === 1 ? "" : "s"} · billing history, GSTIN and outstanding balances`}
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus /> Add Customer
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
            placeholder="Search name, GSTIN, phone…"
            className="pl-8"
            aria-label="Search customers"
          />
        </div>
        <Select
          value={state}
          onValueChange={(value) => {
            setState(value === "all" ? "" : value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-56" aria-label="Filter by state">
            <SelectValue placeholder="All states" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All states</SelectItem>
            {STATES.map((option) => (
              <SelectItem key={option.code} value={option.name}>
                {stateLabel(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading && <LoadingState label="Loading customers…" />}
      {error && !loading && <ErrorState message={error} />}

      {!loading && !error && items.length === 0 && (
        <div className="rounded-lg border bg-white">
          <EmptyState
            icon={<Users />}
            title={debounced || state ? "No customers match your search" : "No customers yet"}
            description={
              debounced || state
                ? "Try a different search term or clear the filters."
                : "Add the customers you bill so their GSTIN and addresses are ready for invoices."
            }
            action={
              <Button
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                <Plus /> Add Customer
              </Button>
            }
          />
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <>
          {/* desktop table */}
          <div className="hidden overflow-hidden rounded-lg border bg-white md:block">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>GSTIN</th>
                  <th>State</th>
                  <th>Contact</th>
                  <th className="text-right">Invoices</th>
                  <th className="text-right">Outstanding</th>
                  <th>Updated</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {items.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <div className="font-medium">{customer.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {customer.company_name && customer.company_name !== customer.name
                          ? customer.company_name
                          : customer.city || "—"}
                      </div>
                    </td>
                    <td className="font-mono text-xs">{customer.gstin || "—"}</td>
                    <td>{customer.state || "—"}</td>
                    <td className="text-xs">
                      <div>{customer.phone || "—"}</div>
                      <div className="text-muted-foreground">{customer.email || ""}</div>
                    </td>
                    <td className="text-right">{customer.invoice_count ?? 0}</td>
                    <td className="text-right font-medium">
                      {Number(customer.outstanding ?? 0) > 0 ? (
                        <span className="text-red-600">{formatINR(customer.outstanding ?? 0)}</span>
                      ) : (
                        <span className="text-muted-foreground">{formatINR(0)}</span>
                      )}
                    </td>
                    <td className="text-xs text-muted-foreground">{formatDate(customer.updated_at)}</td>
                    <td>
                      <RowMenu
                        customer={customer}
                        onEdit={() => {
                          setEditing(customer);
                          setDialogOpen(true);
                        }}
                        onView={() =>
                          navigate(
                            `/invoices?${createSearchParams({ customer_id: customer.id })}`,
                          )
                        }
                        onDelete={() => setDeleting(customer)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* mobile cards */}
          <div className="space-y-3 md:hidden">
            {items.map((customer) => (
              <div key={customer.id} className="rounded-lg border bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{customer.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {customer.company_name || customer.city || "—"}
                    </div>
                  </div>
                  <RowMenu
                    customer={customer}
                    onEdit={() => {
                      setEditing(customer);
                      setDialogOpen(true);
                    }}
                    onView={() => navigate(`/invoices?${createSearchParams({ customer_id: customer.id })}`)}
                    onDelete={() => setDeleting(customer)}
                  />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="text-muted-foreground">GSTIN</dt>
                    <dd className="font-mono">{customer.gstin || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">State</dt>
                    <dd>{customer.state || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Invoices</dt>
                    <dd>{customer.invoice_count ?? 0}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Outstanding</dt>
                    <dd className="font-medium">{formatINR(customer.outstanding ?? 0)}</dd>
                  </div>
                </dl>
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

      <CustomerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        customer={editing}
        onSaved={() => void load()}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete customer?"
        description={`"${deleting?.name ?? ""}" will be permanently removed. Customers with invoices cannot be deleted.`}
        loading={deleteLoading}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function RowMenu({
  customer,
  onEdit,
  onView,
  onDelete,
}: {
  customer: Customer;
  onEdit: () => void;
  onView: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-md p-1.5 hover:bg-accent"
          aria-label={`Actions for ${customer.name}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onView}>
          <FileText /> Invoice history
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil /> Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
