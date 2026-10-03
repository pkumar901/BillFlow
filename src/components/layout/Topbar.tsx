import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, Building2, LogOut, Menu, Plus, Search, Settings, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";
import { formatINR, formatDate, statusLabel } from "@/lib/format";
import type { Invoice } from "~shared/types";

export function Topbar({ onOpenMobile }: { onOpenMobile: () => void }) {
  const navigate = useNavigate();
  const { user, business, signOut } = useAuth();
  const [search, setSearch] = useState("");
  const [overdue, setOverdue] = useState<Invoice[] | null>(null);
  const [loadingNotif, setLoadingNotif] = useState(false);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    navigate(`/invoices?search=${encodeURIComponent(search.trim())}`);
  };

  const loadNotifications = async (open: boolean) => {
    if (!open || overdue || loadingNotif) return;
    setLoadingNotif(true);
    try {
      const data = await api.getDashboard();
      setOverdue(data.overdue_invoices);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Unable to load notifications.");
    } finally {
      setLoadingNotif(false);
    }
  };

  const initials = (user?.name ?? "U")
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const overdueCount = overdue?.length ?? 0;

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-white/95 px-4 backdrop-blur sm:px-6 print:hidden">
      <button
        type="button"
        onClick={onOpenMobile}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-white lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      <Link to="/" className="lg:hidden">
        <span className="font-semibold tracking-tight">BillFlow</span>
      </Link>

      <form onSubmit={submitSearch} className="ml-auto hidden max-w-md flex-1 md:block lg:ml-0">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search invoices, customers, GSTIN…"
            className="h-9 bg-muted/50 pl-8"
            aria-label="Search"
          />
        </div>
      </form>

      <div className="ml-auto flex items-center gap-2">
        <Button
          onClick={() => navigate("/invoices/new")}
          className="hidden sm:inline-flex"
          size="sm"
        >
          <Plus /> Create Invoice
        </Button>

        <DropdownMenu onOpenChange={loadNotifications}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon-sm" className="relative" aria-label="Notifications">
              <Bell className="h-4 w-4" />
              {overdueCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
                  {overdueCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel>Notifications</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {loadingNotif && <div className="px-2 py-3 text-sm text-muted-foreground">Loading…</div>}
            {!loadingNotif && overdue && overdue.length === 0 && (
              <div className="px-2 py-3 text-sm text-muted-foreground">You are all caught up.</div>
            )}
            {!loadingNotif &&
              overdue?.map((invoice) => (
                <DropdownMenuItem
                  key={invoice.id}
                  className="flex flex-col items-start gap-0.5"
                  onSelect={() => navigate(`/invoices/${invoice.id}`)}
                >
                  <span className="font-medium">
                    {invoice.invoice_number} · {formatINR(invoice.balance_due)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {invoice.customer_name} · due {formatDate(invoice.due_date)} ·{" "}
                    {statusLabel(invoice.display_status)}
                  </span>
                </DropdownMenuItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="hidden items-center gap-2 rounded-full border bg-white py-1 pl-1 pr-3 text-sm hover:bg-accent lg:flex"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
                {initials}
              </span>
              <span className="max-w-[10rem] truncate">{business?.business_name ?? "Business"}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="normal-case">
              <div className="truncate font-semibold">{business?.business_name}</div>
              <div className="truncate text-xs font-normal text-muted-foreground">
                {business?.gstin || "GSTIN not added"}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate("/settings?tab=business")}>
              <Building2 /> Business profile
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate("/settings?tab=invoice")}>
              <Settings /> Invoice settings
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground hover:bg-accent"
              aria-label="Account menu"
            >
              {initials}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="normal-case">
              <div className="truncate font-semibold">{user?.name}</div>
              <div className="truncate text-xs font-normal text-muted-foreground">{user?.email}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate("/settings?tab=profile")}>
              <UserRound /> My profile
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate("/settings?tab=security")}>
              <ShieldCheck /> Security
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                signOut();
                navigate("/login");
                toast.success("You have been signed out.");
              }}
            >
              <LogOut /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
