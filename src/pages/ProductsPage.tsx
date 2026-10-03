import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MoreHorizontal, Package, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { ProductDialog } from "@/components/products/ProductDialog";
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
import { ErrorState, LoadingState } from "@/components/ui/spinner";
import { api, ApiError } from "@/lib/api";
import { formatINR, formatNumber } from "@/lib/format";
import type { Product } from "~shared/types";

export function ProductsPage() {
  const [params, setParams] = useSearchParams();

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getProducts({ q: debounced || undefined, page, limit: 20 });
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load products.");
    } finally {
      setLoading(false);
    }
  }, [debounced, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (params.get("new") === "1") {
      setEditing(null);
      setDialogOpen(true);
      params.delete("new");
      setParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await api.deleteProduct(deleting.id);
      toast.success(`Deleted ${deleting.name}.`);
      setDeleting(null);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Unable to delete this product.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products & Services"
        description={`${total} item${total === 1 ? "" : "s"} · prices and GST rates pre-fill every invoice`}
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus /> Add Product
          </Button>
        }
      />

      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search name, SKU, HSN…"
          className="pl-8"
          aria-label="Search products"
        />
      </div>

      {loading && <LoadingState label="Loading products…" />}
      {error && !loading && <ErrorState message={error} />}

      {!loading && !error && items.length === 0 && (
        <div className="rounded-lg border bg-white">
          <EmptyState
            icon={<Package />}
            title={debounced ? "No products match your search" : "No products yet"}
            description={
              debounced
                ? "Try another term, or clear the search."
                : "Add the products and services you sell so invoicing is a two click job."
            }
            action={
              <Button
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                <Plus /> Add Product
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
                  <th>Product / Service</th>
                  <th>SKU</th>
                  <th>HSN/SAC</th>
                  <th>Unit</th>
                  <th className="text-right">Price</th>
                  <th className="text-right">GST</th>
                  <th className="text-right">Stock</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {items.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <div className="font-medium">{product.name}</div>
                      <div className="max-w-[320px] truncate text-xs text-muted-foreground">
                        {product.description || "—"}
                      </div>
                    </td>
                    <td className="font-mono text-xs">{product.sku || "—"}</td>
                    <td className="text-xs">{product.hsn_sac || "—"}</td>
                    <td className="text-xs">{product.unit}</td>
                    <td className="text-right font-medium">{formatINR(product.selling_price)}</td>
                    <td className="text-right">
                      {product.gst_rate}%
                      {Number(product.cess) > 0 && (
                        <span className="text-xs text-muted-foreground"> +{product.cess}% cess</span>
                      )}
                    </td>
                    <td className="text-right">
                      {product.stock_quantity === null || product.stock_quantity === undefined
                        ? "—"
                        : formatNumber(product.stock_quantity, 0)}
                    </td>
                    <td>
                      <ProductMenu
                        product={product}
                        onEdit={() => {
                          setEditing(product);
                          setDialogOpen(true);
                        }}
                        onDelete={() => setDeleting(product)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {items.map((product) => (
              <div key={product.id} className="rounded-lg border bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{product.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {product.hsn_sac ? `HSN ${product.hsn_sac} · ` : ""}
                      {product.unit}
                    </div>
                  </div>
                  <ProductMenu
                    product={product}
                    onEdit={() => {
                      setEditing(product);
                      setDialogOpen(true);
                    }}
                    onDelete={() => setDeleting(product)}
                  />
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Price</dt>
                    <dd className="font-medium">{formatINR(product.selling_price)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">GST</dt>
                    <dd>{product.gst_rate}%</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Stock</dt>
                    <dd>{product.stock_quantity ?? "—"}</dd>
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

      <ProductDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        product={editing}
        onSaved={() => void load()}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete product?"
        description={`"${deleting?.name ?? ""}" will be permanently removed. Existing invoices keep their item rows.`}
        loading={deleteLoading}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function ProductMenu({
  product,
  onEdit,
  onDelete,
}: {
  product: Product;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="rounded-md p-1.5 hover:bg-accent" aria-label={`Actions for ${product.name}`}>
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
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
