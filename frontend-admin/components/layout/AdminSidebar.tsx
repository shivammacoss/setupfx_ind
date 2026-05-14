"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Banknote,
  Calendar,
  ClipboardList,
  Cog,
  DatabaseBackup,
  Layers,
  History,
  Home,
  ListChecks,
  ListOrdered,
  Plug,
  ShieldCheck,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/layout/BrandLogo";

const groups: { title: string; items: { href: string; label: string; icon: any }[] }[] = [
  {
    title: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", icon: Home }],
  },
  {
    title: "Users",
    items: [
      { href: "/users", label: "All users", icon: Users },
      { href: "/kyc", label: "KYC review", icon: ShieldCheck },
    ],
  },
  {
    title: "Payments",
    items: [
      { href: "/payments", label: "Payments", icon: Banknote },
    ],
  },
  {
    title: "Risk & Settings",
    items: [
      { href: "/risk-management", label: "Risk Management", icon: ShieldCheck },
      { href: "/segment-settings", label: "Segment Settings", icon: Layers },
    ],
  },
  {
    title: "Trading",
    items: [
      { href: "/orders", label: "Orders", icon: ListOrdered },
      { href: "/positions", label: "Positions", icon: Activity },
      // Holdings was removed from the user side, so the admin shadow
      // view is dropped here as well — kept the route file but not
      // surfaced in nav.
      { href: "/instruments", label: "Instruments", icon: ListChecks },
      { href: "/zerodha", label: "Zerodha Connect", icon: Plug },
    ],
  },
  {
    title: "Reports",
    items: [
      { href: "/reports/users", label: "User reports", icon: Users },
      { href: "/reports/financial", label: "Financial", icon: Banknote },
      { href: "/reports/trades", label: "Trades", icon: ClipboardList },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/settings/platform", label: "Platform settings", icon: Cog },
      { href: "/holidays", label: "Holiday calendar", icon: Calendar },
      { href: "/backup", label: "Backup & EOD", icon: DatabaseBackup },
      { href: "/audit", label: "Audit logs", icon: History },
    ],
  },
];

export function AdminSidebar() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 z-30 hidden h-screen w-64 flex-col border-r border-border bg-card md:flex">
      <div className="flex h-14 items-center border-b border-border px-4">
        <BrandLogo size="sm" />
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3 scrollbar-thin">
        {groups.map((g) => (
          <div key={g.title} className="space-y-1">
            <div className="px-2 text-[10px] uppercase tracking-wider text-muted-foreground">{g.title}</div>
            {g.items.map((it) => {
              const active = pathname === it.href || pathname?.startsWith(it.href + "/");
              const Icon = it.icon;
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                    active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="truncate">{it.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
