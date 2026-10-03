import { NavLink } from "react-router-dom";
import {
  BarChart3,
  FileText,
  LayoutDashboard,
  Package,
  Percent,
  Receipt,
  Settings,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/invoices", label: "Invoices", icon: FileText },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/products", label: "Products & Services", icon: Package },
  { to: "/payments", label: "Payments", icon: Wallet },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/gst-summary", label: "GST Summary", icon: Percent },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function BrandMark({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className={cn(
          "flex items-center justify-center rounded-lg bg-primary font-bold text-white shadow-sm",
          size === "md" ? "h-9 w-9 text-base" : "h-7 w-7 text-sm",
        )}
      >
        B
      </div>
      <div className="leading-tight">
        <div className={cn("font-semibold tracking-tight", size === "md" ? "text-base" : "text-sm")}>
          BillFlow
        </div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          GST Billing &amp; Invoice Management
        </div>
      </div>
    </div>
  );
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary text-white shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )
          }
        >
          <item.icon className="h-4 w-4 shrink-0" />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
