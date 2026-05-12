"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Bell, LogOut, Search, User as UserIcon, Wallet } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { WalletAPI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { BrandLogo } from "@/components/layout/BrandLogo";
import { cn, formatINR } from "@/lib/utils";
import { readWalletSnapshot, writeWalletSnapshot } from "@/lib/walletSnapshot";

export function TopBar() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  // Live wallet balance — drives the pill on the topbar.
  // `placeholderData` paints the last-known balance from localStorage so the
  // pill never flashes ₹0 between login and the first /wallet/summary
  // response. We persist on every fresh fetch so the snapshot stays current
  // across refreshes/tabs.
  const { data: wallet, isLoading: walletLoading } = useQuery({
    queryKey: ["wallet", "summary"],
    queryFn: async () => {
      const s = await WalletAPI.summary();
      writeWalletSnapshot(s);
      return s;
    },
    refetchInterval: 8000,
    placeholderData: () => readWalletSnapshot(),
  });
  const hasBalance = wallet?.available_balance != null;
  const balance = Number(wallet?.available_balance ?? 0);

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-3 backdrop-blur md:px-4">
      {/* Mobile-only brand (sidebar is hidden ≤ md) */}
      <div className="md:hidden">
        <BrandLogo size="sm" />
      </div>

      {/* Desktop search */}
      <div className="relative hidden flex-1 md:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search RELIANCE, NIFTY, BANKNIFTY…"
          className="h-9 max-w-md pl-9"
          aria-label="Search instruments"
        />
      </div>

      {/* Wallet balance pill — always visible, click → /wallet. While the
          first /wallet/summary is still loading and we have no cached
          snapshot to fall back on, show a dim ellipsis instead of "₹0" so
          the user doesn't briefly think their wallet is empty. */}
      <Link
        href="/wallet"
        className="ml-auto inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
      >
        <Wallet className="size-3.5" />
        <span className="hidden text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:inline">
          Wallet
        </span>
        <span className={cn("font-tabular", !hasBalance && walletLoading && "text-muted-foreground/60")}>
          {hasBalance ? formatINR(balance) : walletLoading ? "₹ —" : formatINR(balance)}
        </span>
      </Link>

      <ThemeToggle />

      <Button variant="ghost" size="icon" aria-label="Notifications" asChild className="hidden sm:inline-flex">
        <Link href="/notifications">
          <Bell className="size-4" />
        </Link>
      </Button>

      <Button variant="ghost" size="icon" aria-label="Profile" asChild className="hidden md:inline-flex">
        <Link href="/profile">
          <UserIcon className="size-4" />
        </Link>
      </Button>

      <Button
        variant="ghost"
        size="icon"
        aria-label="Sign out"
        onClick={() => logout().then(() => (window.location.href = "/login"))}
        title={user ? `Sign out ${user.full_name}` : "Sign out"}
      >
        <LogOut className="size-4" />
      </Button>
    </header>
  );
}
