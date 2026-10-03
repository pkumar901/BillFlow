import { Badge } from "@/components/ui/badge";
import { statusLabel } from "@/lib/format";
import type { PaymentStatus } from "~shared/types";

const VARIANTS: Record<string, "success" | "warning" | "danger" | "info" | "muted"> = {
  paid: "success",
  partial: "warning",
  unpaid: "info",
  overdue: "danger",
  cancelled: "muted",
};

export function StatusBadge({ status }: { status?: PaymentStatus | "overdue" | string | null }) {
  const key = status ?? "unpaid";
  return (
    <Badge variant={VARIANTS[key] ?? "muted"} className="capitalize">
      {statusLabel(key)}
    </Badge>
  );
}
