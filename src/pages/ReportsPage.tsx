import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  Percent,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { StatusBadge } from "@/components/StatusBadge";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorState, LoadingState } from "@/components/ui/spinner";
import { api, ApiError } from "@/lib/api";
import { downloadCsv } from "@/lib/export";
import { formatDate, formatINR, periodLabel } from "@/lib/format";
import { downloadReportPdf } from "@/lib/pdf/reportPdf";

const GROUP_OPTIONS = [
  { value: "month", label: "Monthly" },
  { value: "day", label: "Daily" },
  { value: "year", label: "Yearly" },
];

const PIE_COLORS = ["#0d9488", "#0369a1", "#7c3aed", "#d97706", "#dc2626", "#059669", "#be185d", "#475569"];

type TabKey = "sales" | "gst" | "payments" | "customers" | "products" | "outstanding";

export function ReportsPage() {
  const [tab, setTab] = useState<TabKey>("sales");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [groupBy, setGroupBy] = useState("month");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sales, setSales] = useState<Awaited<ReturnType<typeof api.getSalesReport>> | null>(null);
  const [gst, setGst] = useState<Awaited<ReturnType<typeof api.getGstReport>> | null>(null);
  const [payments, setPayments] = useState<Awaited<ReturnType<typeof api.getPaymentReport>> | null>(null);
  const [customers, setCustomers] = useState<Awaited<ReturnType<typeof api.getCustomerReport>> | null>(null);
  const [products, setProducts] = useState<Awaited<ReturnType<typeof api.getProductReport>> | null>(null);
  const [outstanding, setOutstanding] = useState<
    Awaited<ReturnType<typeof api.getOutstandingReport>> | null
  >(null);

  const query = useMemo(() => ({ from: from || undefined, to: to || undefined }), [from, to]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, g, p, c, pr, o] = await Promise.all([
        api.getSalesReport({ ...query, groupBy }),
        api.getGstReport(query),
        api.getPaymentReport({ ...query, groupBy }),
        api.getCustomerReport(query),
        api.getProductReport(query),
        api.getOutstandingReport(),
      ]);
      setSales(s);
      setGst(g);
      setPayments(p);
      setCustomers(c);
      setProducts(pr);
      setOutstanding(o);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load reports.");
    } finally {
      setLoading(false);
    }
  }, [query, groupBy]);

  useEffect(() => {
    void load();
  }, [load]);

  const rangeLabel = `${from ? formatDate(from) : "All time"} — ${to ? formatDate(to) : "Today"}`;

  /* ------------------------------- exports ------------------------------- */

  const exportSales = (kind: "csv" | "pdf") => {
    if (!sales) return;
    const headers = ["Period", "Invoices", "Taxable", "GST", "Grand total"];
    const rows = sales.rows.map((row) => [
      row.label,
      row.invoice_count,
      formatINR(row.taxable_amount),
      formatINR(row.gst),
      formatINR(row.grand_total),
    ]);
    if (kind === "csv") {
      downloadCsv(`sales-report-${groupBy}.csv`, headers, rows);
    } else {
      downloadReportPdf({
        title: "Sales Report",
        subtitle: rangeLabel,
        headers,
        rows,
        summary: [
          { label: "Invoices", value: String(sales.summary.invoice_count) },
          { label: "Taxable", value: formatINR(sales.summary.taxable_amount) },
          { label: "GST", value: formatINR(sales.summary.gst) },
          { label: "Grand total", value: formatINR(sales.summary.grand_total) },
        ],
      });
    }
  };

  const exportGst = (kind: "csv" | "pdf") => {
    if (!gst) return;
    const headers = ["GST rate", "Invoices", "Taxable", "CGST", "SGST", "IGST", "Total tax"];
    const rows = gst.by_rate.map((row) => [
      `${row.gst_rate}%`,
      row.invoice_count,
      formatINR(row.taxable_amount),
      formatINR(row.cgst),
      formatINR(row.sgst),
      formatINR(row.igst),
      formatINR(row.total_gst),
    ]);
    if (kind === "csv") {
      downloadCsv("gst-report.csv", headers, rows);
    } else {
      downloadReportPdf({
        title: "GST Report",
        subtitle: rangeLabel,
        headers,
        rows,
        summary: [
          { label: "Invoices", value: String(gst.summary.invoice_count) },
          { label: "Taxable", value: formatINR(gst.summary.taxable_amount) },
          { label: "Total GST", value: formatINR(gst.summary.total_gst) },
        ],
      });
    }
  };

  const exportPayments = (kind: "csv" | "pdf") => {
    if (!payments) return;
    const headers = ["Period", "Payments", "Amount"];
    const rows = payments.rows.map((row) => [row.label, row.payment_count, formatINR(row.amount)]);
    if (kind === "csv") {
      downloadCsv(`payments-report-${groupBy}.csv`, headers, rows);
    } else {
      downloadReportPdf({
        title: "Payments Report",
        subtitle: rangeLabel,
        headers,
        rows,
        summary: [{ label: "Collected", value: formatINR(payments.summary.amount) }],
      });
    }
  };

  const exportCustomers = (kind: "csv" | "pdf") => {
    if (!customers) return;
    const headers = ["Customer", "Invoices", "Taxable", "GST", "Invoiced", "Paid", "Balance"];
    const rows = customers.items.map((row) => [
      row.customer_name,
      row.invoice_count,
      formatINR(row.taxable_amount),
      formatINR(row.gst),
      formatINR(row.grand_total),
      formatINR(row.amount_paid),
      formatINR(row.balance_due),
    ]);
    if (kind === "csv") {
      downloadCsv("customer-report.csv", headers, rows);
    } else {
      downloadReportPdf({ title: "Customer Report", subtitle: rangeLabel, headers, rows });
    }
  };

  const exportProducts = (kind: "csv" | "pdf") => {
    if (!products) return;
    const headers = ["Item", "Qty sold", "Taxable", "GST", "Total amount"];
    const rows = products.items.map((row) => [
      row.item_name,
      row.quantity,
      formatINR(row.taxable_value),
      formatINR(row.gst),
      formatINR(row.total_amount),
    ]);
    if (kind === "csv") {
      downloadCsv("product-report.csv", headers, rows);
    } else {
      downloadReportPdf({ title: "Product Report", subtitle: rangeLabel, headers, rows });
    }
  };

  const exportOutstanding = (kind: "csv" | "pdf") => {
    if (!outstanding) return;
    const headers = ["Invoice", "Date", "Due", "Customer", "Total", "Paid", "Balance", "Status", "Days overdue"];
    const rows = outstanding.items.map((row) => [
      row.invoice_number,
      formatDate(row.invoice_date),
      row.due_date ? formatDate(row.due_date) : "-",
      row.customer_name,
      formatINR(row.grand_total),
      formatINR(row.amount_paid),
      formatINR(row.balance_due),
      row.payment_status,
      row.days_overdue > 0 ? row.days_overdue : 0,
    ]);
    if (kind === "csv") {
      downloadCsv("outstanding-report.csv", headers, rows);
    } else {
      downloadReportPdf({
        title: "Outstanding Report",
        subtitle: rangeLabel,
        headers,
        rows,
        summary: [{ label: "Total outstanding", value: formatINR(outstanding.total_outstanding) }],
      });
    }
  };

  /* -------------------------------- render ------------------------------- */

  if (loading && !sales) return <LoadingState label="Loading reports…" />;
  if (error && !sales) return <ErrorState message={error} />;

  const salesChart = (sales?.rows ?? []).map((row) => ({
    label: periodLabel(row.period),
    grand_total: row.grand_total,
    gst: row.gst,
  }));

  const gstChart = (gst?.by_rate ?? [])
    .slice(0, 8)
    .map((row) => ({ label: `${row.gst_rate}%`, value: row.total_gst }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Sales, GST, payments and outstanding analysis straight from your invoice data."
      />

      <div className="flex flex-col gap-3 rounded-lg border bg-white p-4 sm:flex-row sm:items-end">
        <div>
          <Label htmlFor="rep-from" className="text-xs text-muted-foreground">
            From
          </Label>
          <Input
            id="rep-from"
            type="date"
            value={from}
            className="mt-1 w-full sm:w-44"
            onChange={(event) => setFrom(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="rep-to" className="text-xs text-muted-foreground">
            To
          </Label>
          <Input
            id="rep-to"
            type="date"
            value={to}
            className="mt-1 w-full sm:w-44"
            onChange={(event) => setTo(event.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Group by</Label>
          <Select value={groupBy} onValueChange={setGroupBy}>
            <SelectTrigger className="mt-1 w-full sm:w-40" aria-label="Group by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GROUP_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="sm:ml-auto">
          <Button variant="outline" onClick={() => load()}>
            Apply filters
          </Button>
        </div>
      </div>

      {error && sales && <ErrorState message={error} />}

      <Tabs value={tab} onValueChange={(value) => setTab(value as TabKey)} activationMode="manual">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="gst">GST</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="outstanding">Outstanding</TabsTrigger>
        </TabsList>

        {/* ---------------------------------- sales ------------------------- */}
        <TabsContent value="sales" className="space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Metric label="Invoices" value={String(sales?.summary.invoice_count ?? 0)} />
            <Metric label="Taxable value" value={formatINR(sales?.summary.taxable_amount ?? 0)} />
            <Metric label="GST collected" value={formatINR(sales?.summary.gst ?? 0)} />
            <Metric label="Gross sales" value={formatINR(sales?.summary.grand_total ?? 0)} accent />
          </div>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" /> Trend
                </span>
              </CardTitle>
              <ExportButtons onCsv={() => exportSales("csv")} onPdf={() => exportSales("pdf")} />
            </CardHeader>
            <CardContent className="h-[280px]">
              {salesChart.length === 0 ? (
                <EmptyChart message="No sales in this date range." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={salesChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={70} tickFormatter={(v) => `₹${v}`} />
                    <Tooltip formatter={(value) => formatINR(Number(value))} />
                    <Bar dataKey="grand_total" name="Sales" fill="#0d9488" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <ReportTable
            headers={["Period", "Invoices", "Taxable", "GST", "Grand total"]}
            rows={(sales?.rows ?? []).map((row) => [
              periodLabel(row.period),
              String(row.invoice_count),
              formatINR(row.taxable_amount),
              formatINR(row.gst),
              formatINR(row.grand_total),
            ])}
          />
        </TabsContent>

        {/* ----------------------------------- gst -------------------------- */}
        <TabsContent value="gst" className="space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Metric label="Taxable value" value={formatINR(gst?.summary.taxable_amount ?? 0)} />
            <Metric label="CGST" value={formatINR(gst?.summary.cgst ?? 0)} />
            <Metric label="SGST" value={formatINR(gst?.summary.sgst ?? 0)} />
            <Metric label="IGST" value={formatINR(gst?.summary.igst ?? 0)} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <Percent className="h-4 w-4" /> Tax by rate
                  </span>
                </CardTitle>
                <ExportButtons onCsv={() => exportGst("csv")} onPdf={() => exportGst("pdf")} />
              </CardHeader>
              <CardContent className="h-[260px]">
                {gstChart.length === 0 ? (
                  <EmptyChart message="No taxable invoices in this range." />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={gstChart}
                        dataKey="value"
                        nameKey="label"
                        innerRadius={55}
                        outerRadius={90}
                        paddingAngle={2}
                      >
                        {gstChart.map((_, index) => (
                          <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatINR(Number(value))} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Supply split
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Intra-state (CGST + SGST)</span>
                  <span className="font-medium">{formatINR(gst?.intrastate.cgst ?? 0)} + {formatINR(gst?.intrastate.sgst ?? 0)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Inter-state (IGST)</span>
                  <span className="font-medium">{formatINR(gst?.interstate.igst ?? 0)}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Cess</span>
                  <span className="font-medium">{formatINR(gst?.summary.cess ?? 0)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total tax</span>
                  <span className="font-semibold">{formatINR(gst?.summary.total_gst ?? 0)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Invoices</span>
                  <span className="font-medium">{gst?.summary.invoice_count ?? 0}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <ReportTable
            headers={["Rate", "Invoices", "Taxable", "CGST", "SGST", "IGST", "Total tax"]}
            rows={(gst?.by_rate ?? []).map((row) => [
              `${row.gst_rate}%`,
              String(row.invoice_count),
              formatINR(row.taxable_amount),
              formatINR(row.cgst),
              formatINR(row.sgst),
              formatINR(row.igst),
              formatINR(row.total_gst),
            ])}
          />
        </TabsContent>

        {/* -------------------------------- payments ------------------------ */}
        <TabsContent value="payments" className="space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <Metric label="Payments" value={String(payments?.summary.payment_count ?? 0)} />
            <Metric label="Collected" value={formatINR(payments?.summary.amount ?? 0)} accent />
            <Metric label="Outstanding" value={formatINR(outstanding?.total_outstanding ?? 0)} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <Wallet className="h-4 w-4" /> Collections
                  </span>
                </CardTitle>
                <ExportButtons onCsv={() => exportPayments("csv")} onPdf={() => exportPayments("pdf")} />
              </CardHeader>
              <CardContent className="h-[240px]">
                {(payments?.rows.length ?? 0) === 0 ? (
                  <EmptyChart message="No payments in this date range." />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={(payments?.rows ?? []).map((row) => ({ label: periodLabel(row.period), amount: row.amount }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} width={70} tickFormatter={(v) => `₹${v}`} />
                      <Tooltip formatter={(value) => formatINR(Number(value))} />
                      <Bar dataKey="amount" name="Collected" fill="#0369a1" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  By method
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(payments?.by_method.length ?? 0) === 0 ? (
                  <EmptyChart message="No payments recorded yet." />
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Method</th>
                        <th className="text-right">Count</th>
                        <th className="text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(payments?.by_method ?? []).map((row) => (
                        <tr key={row.payment_method}>
                          <td>{row.payment_method}</td>
                          <td className="text-right">{row.payment_count}</td>
                          <td className="text-right font-medium">{formatINR(row.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* -------------------------------- customers ----------------------- */}
        <TabsContent value="customers" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <Users className="h-4 w-4" /> Customer performance
            </h2>
            <ExportButtons onCsv={() => exportCustomers("csv")} onPdf={() => exportCustomers("pdf")} />
          </div>
          <ReportTable
            headers={["Customer", "Invoices", "Taxable", "GST", "Invoiced", "Paid", "Balance"]}
            rows={(customers?.items ?? []).map((row) => [
              row.customer_name,
              String(row.invoice_count),
              formatINR(row.taxable_amount),
              formatINR(row.gst),
              formatINR(row.grand_total),
              formatINR(row.amount_paid),
              formatINR(row.balance_due),
            ])}
            empty="No customers have been invoiced yet."
          />
        </TabsContent>

        {/* --------------------------------- products ----------------------- */}
        <TabsContent value="products" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <BarChart3 className="h-4 w-4" /> Items sold
            </h2>
            <ExportButtons onCsv={() => exportProducts("csv")} onPdf={() => exportProducts("pdf")} />
          </div>
          <ReportTable
            headers={["Item", "Qty sold", "Taxable", "GST", "Total amount"]}
            rows={(products?.items ?? []).map((row) => [
              row.item_name,
              String(row.quantity),
              formatINR(row.taxable_value),
              formatINR(row.gst),
              formatINR(row.total_amount),
            ])}
            empty="No items have been invoiced yet."
          />
        </TabsContent>

        {/* ------------------------------- outstanding ---------------------- */}
        <TabsContent value="outstanding" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Receivables · {formatINR(outstanding?.total_outstanding ?? 0)} outstanding
            </h2>
            <ExportButtons onCsv={() => exportOutstanding("csv")} onPdf={() => exportOutstanding("pdf")} />
          </div>
          {(outstanding?.items.length ?? 0) === 0 ? (
            <div className="rounded-lg border bg-white px-4 py-10 text-center text-sm text-muted-foreground">
              Every invoice is settled. Nothing is outstanding.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border bg-white">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Customer</th>
                    <th>Due date</th>
                    <th className="text-right">Balance</th>
                    <th>Status</th>
                    <th className="text-right">Days overdue</th>
                  </tr>
                </thead>
                <tbody>
                  {(outstanding?.items ?? []).map((row) => (
                    <tr key={row.id}>
                      <td className="font-medium">{row.invoice_number}</td>
                      <td className="max-w-[200px] truncate">{row.customer_name}</td>
                      <td>{row.due_date ? formatDate(row.due_date) : "—"}</td>
                      <td className="text-right font-medium text-destructive">{formatINR(row.balance_due)}</td>
                      <td>
                        <StatusBadge status={row.payment_status} />
                      </td>
                      <td className="text-right">{row.days_overdue > 0 ? row.days_overdue : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------ sub-components --------------------------- */

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${accent ? "border-teal-200 bg-teal-50" : "bg-white"}`}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold sm:text-xl">{value}</div>
    </div>
  );
}

function ExportButtons({ onCsv, onPdf }: { onCsv: () => void; onPdf: () => void }) {
  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={onCsv}>
        <FileSpreadsheet /> CSV
      </Button>
      <Button variant="outline" size="sm" onClick={onPdf}>
        <Download /> PDF
      </Button>
    </div>
  );
}

function ReportTable({
  headers,
  rows,
  empty = "No data for this date range.",
}: {
  headers: string[];
  rows: string[][];
  empty?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border bg-white px-4 py-10 text-center text-sm text-muted-foreground">
        {empty}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      <table className="data-table">
        <thead>
          <tr>
            {headers.map((header, index) => (
              <th key={header} className={index === 0 ? "" : "text-right"}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className={cellIndex === 0 ? "" : "text-right"}>
                  {cellIndex === 0 ? <span className="font-medium">{cell}</span> : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{message}</div>
  );
}
