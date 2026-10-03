import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CircleDollarSign,
  FilePlus2,
  FileText,
  IndianRupee,
  Package,
  Plus,
  Receipt,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/layout/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState, LoadingState } from "@/components/ui/spinner";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { deleteDemoData, seedDemoData } from "@/lib/demo";
import { formatDate, formatINR, periodLabel } from "@/lib/format";
import type { DashboardData } from "~shared/types";

const PIE_COLORS = ["#0f766e", "#f59e0b", "#38bdf8", "#94a3b8"];

export function DashboardPage() {
  const navigate = useNavigate();
  const { business } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.getDashboard());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load the dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setupIncomplete = business && (!business.gstin || !business.state);

  const handleSeed = async () => {
    setBusy(true);
    try {
      await seedDemoData(business?.state ?? "");
      toast.success("Sample invoices created. You can delete them anytime.");
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Unable to create sample data.");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteDemo = async () => {
    setBusy(true);
    try {
      const result = await deleteDemoData();
      toast.success(`Removed ${result.removed} sample record(s).`);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Unable to remove sample data.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingState label="Loading dashboard…" />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const monthly = data.monthly_sales.map((row) => ({
    ...row,
    label: periodLabel(row.period),
  }));

  const pieData = data.status_split
    .filter((row) => row.status !== "cancelled")
    .map((row) => ({
      name: row.status === "partial" ? "Partially Paid" : row.status === "paid" ? "Paid" : "Unpaid",
      value: row.amount,
    }));

  const gstData = data.gst_by_rate.map((row) => ({
    name: `${row.gst_rate}%`,
    taxable: row.taxable_amount,
    gst: row.gst_amount,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`Overview of ${business?.business_name ?? "your business"} · GST billing at a glance`}
        actions={
          <Button onClick={() => navigate("/invoices/new")}>
            <Plus /> Create Invoice
          </Button>
        }
      />

      {setupIncomplete && (
        <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <span className="font-medium">Finish your business setup.</span> Add your GSTIN, address
              and state so they appear on every invoice and GST is calculated correctly.
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => navigate("/settings?tab=business")}>
            Complete setup <ArrowRight />
          </Button>
        </div>
      )}

      {/* ------------------------------------------------------ stat cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Total Sales"
          value={formatINR(data.total_sales)}
          icon={<TrendingUp className="h-5 w-5" />}
          hint={`${data.invoice_count} invoice${data.invoice_count === 1 ? "" : "s"}`}
        />
        <StatCard
          label="Total Invoices"
          value={String(data.invoice_count)}
          icon={<FileText className="h-5 w-5" />}
          hint={`${data.month_invoices} this month`}
        />
        <StatCard
          label="Paid Amount"
          value={formatINR(data.paid_amount)}
          icon={<CircleDollarSign className="h-5 w-5" />}
          tone="success"
          hint="Collected against invoices"
        />
        <StatCard
          label="Pending Amount"
          value={formatINR(data.pending_amount)}
          icon={<Wallet className="h-5 w-5" />}
          tone={data.pending_amount > 0 ? "warning" : "default"}
          hint={`${data.overdue_count} overdue`}
        />
        <StatCard
          label="GST Collected"
          value={formatINR(data.gst_collected)}
          icon={<Receipt className="h-5 w-5" />}
          hint="CGST + SGST + IGST billed"
        />
        <StatCard
          label="This Month Sales"
          value={formatINR(data.month_sales)}
          icon={<IndianRupee className="h-5 w-5" />}
          hint={`${data.month_invoices} invoice${data.month_invoices === 1 ? "" : "s"} in ${periodLabel(
            new Date().toISOString().slice(0, 7),
          )}`}
        />
      </div>

      {/* --------------------------------------------------- quick actions */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <QuickAction label="Create Invoice" hint="New GST invoice" onClick={() => navigate("/invoices/new")} icon={<FilePlus2 className="h-5 w-5" />} />
        <QuickAction label="Add Customer" hint="Bills & GSTIN" onClick={() => navigate("/customers?new=1")} icon={<Users className="h-5 w-5" />} />
        <QuickAction label="Add Product" hint="Items & services" onClick={() => navigate("/products?new=1")} icon={<Package className="h-5 w-5" />} />
        <QuickAction label="View Reports" hint="Sales, GST, dues" onClick={() => navigate("/reports")} icon={<BarChart3 className="h-5 w-5" />} />
      </div>

      {/* --------------------------------------------------------- charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Monthly Sales</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {monthly.length === 0 ? (
              <EmptyState title="No sales yet" description="Charts appear once you create invoices." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly}>
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={70} tickFormatter={(v) => formatINR(Number(v), { decimals: 0, symbol: false })} />
                  <Tooltip formatter={(value: number) => formatINR(Number(value))} />
                  <Bar dataKey="sales" name="Sales" fill="#0f766e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Paid vs Unpaid</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {pieData.length === 0 ? (
              <EmptyState title="No invoices yet" description="Paid vs unpaid shows up here." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {pieData.map((_, index) => (
                      <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatINR(Number(value))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Invoices by Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.status_split.length === 0 && (
                <p className="text-sm text-muted-foreground">No invoices yet.</p>
              )}
              {data.status_split.map((row) => (
                <div key={row.status} className="flex items-center justify-between text-sm">
                  <StatusBadge status={row.status} />
                  <span className="text-muted-foreground">
                    {row.count} · {formatINR(row.amount)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">GST by Rate</CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            {gstData.length === 0 ? (
              <EmptyState title="No GST data" description="GST breakdown appears once invoices exist." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={gstData}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={70} tickFormatter={(v) => formatINR(Number(v), { decimals: 0, symbol: false })} />
                  <Tooltip formatter={(value: number) => formatINR(Number(value))} />
                  <Legend />
                  <Bar dataKey="taxable" name="Taxable" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="gst" name="GST" fill="#0f766e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------ recent + onboarding */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-semibold">Recent Invoices</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="/invoices">
                View all <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {data.recent_invoices.length === 0 ? (
              <EmptyState
                icon={<FileText />}
                title="No invoices yet"
                description="Create your first GST invoice - it takes less than a minute."
                action={
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button onClick={() => navigate("/invoices/new")}>
                      <Plus /> Create Your First Invoice
                    </Button>
                    <Button variant="outline" onClick={handleSeed} loading={busy}>
                      Load sample demo data
                    </Button>
                  </div>
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table min-w-[560px]">
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Customer</th>
                      <th>Date</th>
                      <th className="text-right">Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent_invoices.map((invoice) => (
                      <tr
                        key={invoice.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/invoices/${invoice.id}`)}
                      >
                        <td className="font-medium">{invoice.invoice_number}</td>
                        <td className="max-w-[200px] truncate">{invoice.customer_name}</td>
                        <td>{formatDate(invoice.invoice_date)}</td>
                        <td className="text-right font-medium">{formatINR(invoice.grand_total)}</td>
                        <td>
                          <StatusBadge status={invoice.display_status ?? invoice.payment_status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {data.recent_invoices.length > 0 && (
              <div className="mt-3 flex justify-end">
                <Button variant="outline" size="sm" onClick={handleDeleteDemo} loading={busy}>
                  Delete demo data
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm font-semibold">Recent Customers</CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link to="/customers">
                  All <ArrowRight />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.recent_customers.length === 0 && (
                <p className="text-sm text-muted-foreground">No customers added yet.</p>
              )}
              {data.recent_customers.map((customer) => (
                <div key={customer.id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{customer.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {customer.gstin || customer.city || "—"}
                    </div>
                  </div>
                  <Button asChild variant="ghost" size="icon-sm">
                    <Link to={`/customers?edit=${customer.id}`} aria-label={`Edit ${customer.name}`}>
                      <ArrowRight />
                    </Link>
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          {data.overdue_invoices.length > 0 && (
            <Card className="border-red-200">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-red-700">
                  <AlertTriangle className="h-4 w-4" /> Overdue invoices
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.overdue_invoices.map((invoice) => (
                  <button
                    key={invoice.id}
                    type="button"
                    onClick={() => navigate(`/invoices/${invoice.id}`)}
                    className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    <span className="truncate">{invoice.invoice_number} · {invoice.customer_name}</span>
                    <span className="font-medium text-red-700">{formatINR(invoice.balance_due)}</span>
                  </button>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function QuickAction({
  label,
  hint,
  icon,
  onClick,
}: {
  label: string;
  hint: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-3 rounded-lg border bg-white px-4 py-3 text-left shadow-sm transition hover:border-primary/40 hover:shadow"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-white">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{label}</span>
        <span className="block truncate text-xs text-muted-foreground">{hint}</span>
      </span>
      <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
    </button>
  );
}
