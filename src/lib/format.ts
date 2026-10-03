import { formatINR, formatNumber, round2 } from "~shared/money";
import { amountInWords } from "~shared/amountInWords";

export { formatINR, formatNumber, round2, amountInWords };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-01" -> "01 Oct 2026" */
export function formatDate(value?: string | null): string {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const [, y, m, d] = match;
  return `${d} ${MONTHS[Number(m) - 1] ?? m} ${y}`;
}

/** "2026-10-01T12:00:00.000Z" -> "01 Oct 2026, 5:30 PM" */
export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDate(value);
  const d = String(date.getDate()).padStart(2, "0");
  const mon = MONTHS[date.getMonth()];
  const y = date.getFullYear();
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${d} ${mon} ${y}, ${hours}:${minutes} ${ampm}`;
}

/** Today's date as YYYY-MM-DD (local). */
export function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Human label for a YYYY-MM period key (report grouping). */
export function periodLabel(period: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (m) return `${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
  const y = /^(\d{4})$/.exec(period);
  if (y) return y[1];
  return period;
}

export type StatusVariant = "paid" | "partial" | "unpaid" | "overdue" | "cancelled";

export const STATUS_LABELS: Record<string, string> = {
  paid: "Paid",
  partial: "Partially Paid",
  unpaid: "Unpaid",
  overdue: "Overdue",
  cancelled: "Cancelled",
};

export function statusLabel(status?: string | null): string {
  if (!status) return "—";
  return STATUS_LABELS[status] ?? status;
}
