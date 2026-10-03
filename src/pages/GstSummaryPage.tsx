import { useCallback, useEffect, useState } from "react";
import { Download, FileSpreadsheet, Info, Percent } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorState, LoadingState } from "@/components/ui/spinner";
import { api, ApiError } from "@/lib/api";
import { downloadCsv } from "@/lib/export";
import { formatDate, formatINR } from "@/lib/format";
import { downloadReportPdf } from "@/lib/pdf/reportPdf";
import type { GstReport } from "~shared/types";

/**
 * GST Summary - an internal business reporting tool.
 * It summarises the tax already calculated on this business's invoices.
 * It makes no claims about returns, filing or government submissions.
 */
export function GstSummaryPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [report, setReport] = useState<GstReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await api.getGstReport({ from: from || undefined, to: to || undefined }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load the GST summary.");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rangeLabel = `${from ? formatDate(from) : "All time"} — ${to ? formatDate(to) : "Today"}`;

  const tableRows = () =>
    (report?.by_rate ?? []).map((row) => [
      `${row.gst_rate}%`,
      String(row.invoice_count),
      formatINR(row.taxable_amount),
      formatINR(row.cgst),
      formatINR(row.sgst),
      formatINR(row.igst),
      formatINR(row.total_gst),
    ]);

  const headers = ["Rate", "Invoices", "Taxable", "CGST", "SGST", "IGST", "Total tax"];

  const exportCsv = () => downloadCsv("gst-summary.csv", headers, tableRows());

  const exportPdf = () => {
    if (!report) return;
    downloadReportPdf({
      title: "GST Summary",
      subtitle: rangeLabel,
      headers,
      rows: tableRows(),
      summary: [
        { label: "Invoices", value: String(report.summary.invoice_count) },
        { label: "Taxable value", value: formatINR(report.summary.taxable_amount) },
        { label: "CGST", value: formatINR(report.summary.cgst) },
        { label: "SGST", value: formatINR(report.summary.sgst) },
        { label: "IGST", value: formatINR(report.summary.igst) },
        { label: "Total tax", value: formatINR(report.summary.total_gst) },
      ],
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="GST Summary"
        description="A business reporting tool that summarises the GST calculated on your invoices."
        actions={
          <>
            <Button variant="outline" onClick={exportCsv} disabled={!report}>
              <FileSpreadsheet /> CSV
            </Button>
            <Button variant="outline" onClick={exportPdf} disabled={!report}>
              <Download /> PDF
            </Button>
          </>
        }
      />

      <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Figures below are an internal summary of tax already computed on your saved invoices, grouped by
          GST rate. Use it for your own bookkeeping and conversations with your accountant - it does not
          prepare, submit or validate government returns.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border bg-white p-4 sm:flex-row sm:items-end">
        <div>
          <Label htmlFor="gst-from" className="text-xs text-muted-foreground">
            From
          </Label>
          <Input
            id="gst-from"
            type="date"
            value={from}
            className="mt-1 w-full sm:w-44"
            onChange={(event) => setFrom(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="gst-to" className="text-xs text-muted-foreground">
            To
          </Label>
          <Input
            id="gst-to"
            type="date"
            value={to}
            className="mt-1 w-full sm:w-44"
            onChange={(event) => setTo(event.target.value)}
          />
        </div>
        <div className="sm:ml-auto">
          <Button variant="outline" onClick={() => void load()}>
            Apply filters
          </Button>
        </div>
      </div>

      {loading && <LoadingState label="Loading GST summary…" />}
      {error && <ErrorState message={error} />}

      {!loading && report && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <SummaryCard label="Invoices" value={String(report.summary.invoice_count)} />
            <SummaryCard label="Taxable value" value={formatINR(report.summary.taxable_amount)} />
            <SummaryCard label="CGST" value={formatINR(report.summary.cgst)} />
            <SummaryCard label="SGST" value={formatINR(report.summary.sgst)} />
            <SummaryCard label="IGST" value={formatINR(report.summary.igst)} accent />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-lg border bg-white p-5 lg:col-span-2">
              <h2 className="mb-3 inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                <Percent className="h-4 w-4" /> Rate-wise breakdown
              </h2>
              {report.by_rate.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No taxable invoices for the selected period.
                </p>
              ) : (
                <div className="overflow-x-auto">
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
                      {report.by_rate.map((row) => (
                        <tr key={row.gst_rate}>
                          <td className="font-medium">{row.gst_rate}%</td>
                          <td className="text-right">{row.invoice_count}</td>
                          <td className="text-right">{formatINR(row.taxable_amount)}</td>
                          <td className="text-right">{formatINR(row.cgst)}</td>
                          <td className="text-right">{formatINR(row.sgst)}</td>
                          <td className="text-right">{formatINR(row.igst)}</td>
                          <td className="text-right font-medium">{formatINR(row.total_gst)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="rounded-lg border bg-white p-5">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Supply split
                </h2>
                <dl className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Intra-state taxable</dt>
                    <dd className="font-medium">{formatINR(report.intrastate.taxable_amount)}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Inter-state taxable</dt>
                    <dd className="font-medium">{formatINR(report.interstate.taxable_amount)}</dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-lg border bg-teal-50 p-5">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-teal-800">
                  Totals for {rangeLabel}
                </h2>
                <dl className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <dt className="text-teal-700">Total tax</dt>
                    <dd className="font-semibold">{formatINR(report.summary.total_gst)}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-teal-700">Cess</dt>
                    <dd className="font-medium">{formatINR(report.summary.cess)}</dd>
                  </div>
                  <div className="flex items-center justify-between border-t border-teal-200 pt-2">
                    <dt className="text-teal-700">Incl. invoice value</dt>
                    <dd className="font-semibold">{formatINR(report.summary.grand_total)}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${accent ? "border-teal-200 bg-teal-50" : "bg-white"}`}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
