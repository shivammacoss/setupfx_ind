"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bell,
  CandlestickChart,
  ChevronLeft,
  CircleDollarSign,
  FileText,
  Home,
  ScrollText,
  User,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/layout/BrandLogo";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/terminal", label: "Trading Terminal", icon: CandlestickChart },
  // Positions is the unified blotter — Position / Active / Closed /
  // Cancelled / Rejected tabs all live there. The old separate /orders
  // route was folded in per user request: "orders aur position dono
  // ka same kaam hai, bas position section rakho".
  { href: "/positions", label: "Positions", icon: Activity },
  { href: "/wallet", label: "Wallet", icon: Wallet },
  { href: "/ledger", label: "Ledger", icon: ScrollText },
  { href: "/reports/pnl", label: "Reports", icon: FileText },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/profile", label: "Profile", icon: User },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "sticky top-0 z-30 hidden h-screen flex-col border-r border-border bg-card md:flex",
        collapsed ? "w-16" : "w-60"
      )}
    >
      <div className="flex h-14 items-center justify-between gap-2 border-b border-border px-3">
        {collapsed ? (
          <BrandLogo iconOnly size="sm" />
        ) : (
          <BrandLogo size="sm" />
        )}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle sidebar"
          onClick={() => setCollapsed((v) => !v)}
          className="ml-auto"
        >
          <ChevronLeft className={cn("size-4 transition-transform", collapsed && "rotate-180")} />
        </Button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-2 scrollbar-thin">
        {items.map((it) => {
          const active =
            pathname === it.href ||
            (it.href !== "/dashboard" && pathname?.startsWith(it.href));
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                active
                  ? "bg-primary/10 text-primary shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
                collapsed && "justify-center px-2"
              )}
              aria-current={active ? "page" : undefined}
            >
              {/* Active indicator strip on the left */}
              {active && (
                <span className="absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-primary" />
              )}
              <Icon className={cn("size-4 shrink-0", active && "text-primary")} />
              {!collapsed && <span className="truncate">{it.label}</span>}
            </Link>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-2 rounded-md bg-muted/30 p-2 text-xs text-muted-foreground">
            <CircleDollarSign className="size-4 text-primary" />
            <div>Need help? Email support@setupfx.com</div>
          </div>
        </div>
      )}
    </aside>
  );
}
