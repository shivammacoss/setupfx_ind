"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarClock,
  Layers,
  ListChecks,
  LogOut,
  Wallet as WalletIcon,
  Wifi,
} from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/layout/BrandLogo";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { UserWsBridge } from "@/components/common/UserWsBridge";
import { EconomicCalendarPanel } from "@/components/trading/EconomicCalendarPanel";
import { InstrumentsPanel } from "@/components/trading/InstrumentsPanel";
import { OptionChainPicker } from "@/components/trading/OptionChainPicker";
import { OptionChainAPI, WalletAPI } from "@/lib/api";
import { cn, formatINR, pnlColor } from "@/lib/utils";
import { readWalletSnapshot, writeWalletSnapshot } from "@/lib/walletSnapshot";

type SidePanel = "instruments" | "calendar" | null;

/**
 * Full-bleed broker layout — top tab bar, left vertical tool rail,
 * footer status bar (Equity / Free Margin / Balance / Margin / level).
 * Body content (chart + order panel) is rendered by `terminal/page.tsx`.
 */
export default function TerminalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);
  const logout = useAuthStore((s) => s.logout);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [sidePanel, setSidePanel] = useState<SidePanel>(null);

  // Wallet status drives the footer numbers — refresh every 4s so the strip
  // stays current as fills happen.
  // `placeholderData` paints the last-known balance from localStorage so
  // the Equity / Free Margin / Balance strip never flashes ₹0 between
  // login and the first /wallet/summary response. Snapshot is refreshed
  // on every successful fetch so it stays current across reloads.
  const { data: wallet } = useQuery<any>({
    queryKey: ["wallet", "summary"],
    queryFn: async () => {
      const s = await WalletAPI.summary();
      writeWalletSnapshot(s);
      return s;
    },
    enabled: !!user,
    refetchInterval: 4000,
    placeholderData: () => readWalletSnapshot(),
  });
  const walletReady = wallet?.available_balance != null;

  // ── Option-chain warm cache ─────────────────────────────────────
  // The Option-chain dialog used to feel slow because its first network
  // round-trip (CSV catalog scan + Kite REST batch quote) costs 1-3 s on
  // a cold cache. Pre-fetching the three default underlyings here — using
  // the SAME query keys the picker uses — means the dialog finds cached
  // rows on open and renders instantly. Background refetch every 6 s keeps
  // the cache warm. When the picker actually opens, its own 2 s refetch
  // interval takes over (React Query uses the lowest interval among active
  // observers).
  const { data: ocCfg } = useQuery({
    queryKey: ["option-chain-config"],
    queryFn: () => OptionChainAPI.config(),
    enabled: !!user,
    staleTime: 60_000,
  });
  const ocUnderlyings: string[] = (ocCfg?.underlyings as any[] | undefined)
    ?.map((u) => u.symbol)
    .filter(Boolean) ?? ["NIFTY", "BANKNIFTY", "SENSEX"];
  // Run a fixed-shape set of prefetch hooks for the three defaults so the
  // hook order stays stable across renders even if admin reconfigures the
  // underlyings list. Extra underlyings beyond three rely on the in-picker
  // fetch (still benefits from the warm catalog cache on the backend).
  const [u0, u1, u2] = [ocUnderlyings[0], ocUnderlyings[1], ocUnderlyings[2]];
  useQuery({
    queryKey: ["option-chain-picker", u0, undefined],
    queryFn: () => OptionChainAPI.fetch(u0!),
    enabled: !!user && !!u0,
    refetchInterval: 6000,
    staleTime: 5000,
    notifyOnChangeProps: [],
  });
  useQuery({
    queryKey: ["option-chain-picker", u1, undefined],
    queryFn: () => OptionChainAPI.fetch(u1!),
    enabled: !!user && !!u1,
    refetchInterval: 6000,
    staleTime: 5000,
    notifyOnChangeProps: [],
  });
  useQuery({
    queryKey: ["option-chain-picker", u2, undefined],
    queryFn: () => OptionChainAPI.fetch(u2!),
    enabled: !!user && !!u2,
    refetchInterval: 6000,
    staleTime: 5000,
    notifyOnChangeProps: [],
  });

  useEffect(() => {
    if (hydrated && !user) router.replace("/login");
  }, [hydrated, user, router]);

  if (!hydrated) {
    return (
      <div className="grid h-screen place-items-center text-sm text-muted-foreground">Loading…</div>
    );
  }
  if (!user) return null;

  const equity =
    Number(wallet?.available_balance ?? 0) +
    Number(wallet?.used_margin ?? 0) +
    Number(wallet?.unrealized_pnl ?? 0);
  const freeMargin = Number(wallet?.available_balance ?? 0);
  const balance = Number(wallet?.available_balance ?? 0) + Number(wallet?.used_margin ?? 0);
  const usedMargin = Number(wallet?.used_margin ?? 0);
  const marginLevelPct = usedMargin > 0 ? (equity / usedMargin) * 100 : 0;

  return (
    <div className="flex h-screen min-h-0 flex-col bg-background">
      <UserWsBridge />

      {/* ── Top header ─────────────────────────────────────────── */}
      <header className="relative z-20 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card px-3">
        <Button asChild variant="ghost" size="icon" aria-label="Back to dashboard" className="size-8">
          <Link href="/dashboard">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <BrandLogo size="sm" />

        <div className="ml-auto flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => setPickerOpen(true)}
            title="Open option chain"
          >
            <Layers className="size-4" />
            <span className="text-xs font-medium">Option chain</span>
          </Button>
          <ThemeToggle />
          <Button asChild variant="ghost" size="icon" aria-label="Wallet" className="size-8">
            <Link href="/wallet">
              <WalletIcon className="size-4" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Sign out"
            className="size-8"
            onClick={() => logout().then(() => (window.location.href = "/login"))}
          >
            <LogOut className="size-4" />
          </Button>
        </div>
      </header>

      {/* ── Body: left tool rail + main canvas ─────────────────── */}
      <div className="flex min-h-0 flex-1">
        <ToolRail active={sidePanel} onToggle={setSidePanel} />
        {sidePanel === "instruments" && (
          <InstrumentsPanel onClose={() => setSidePanel(null)} />
        )}
        {sidePanel === "calendar" && (
          <EconomicCalendarPanel onClose={() => setSidePanel(null)} />
        )}
        {/* Mobile/md: allow vertical scroll so the chart + order panel +
            positions strip can all be reached. The previous unconditional
            `overflow-hidden` clipped everything past the chart card on
            narrow viewports, which is what made the chart appear tiny
            with a huge empty band below it on phones. lg+ stays fixed
            (no page scroll) — the grid columns there are self-contained. */}
        <main className="min-h-0 flex-1 overflow-y-auto lg:overflow-hidden">{children}</main>
      </div>

      {/* ── Footer status bar ──────────────────────────────────── */}
      {/* Before the first /wallet/summary response (and with no localStorage
          snapshot to fall back on), every Stat would otherwise read "₹0.00"
          — making it look like the account has zero equity. Render a dim
          "₹ —" placeholder instead so users only see a real number. */}
      <footer className="flex h-9 shrink-0 items-center gap-5 border-t border-border bg-card px-3 text-[11px]">
        <Stat label="Equity" value={walletReady ? formatINR(equity) : "₹ —"} className={walletReady ? pnlColor(equity - balance) : "text-muted-foreground/60"} />
        <Stat label="Free Margin" value={walletReady ? formatINR(freeMargin) : "₹ —"} className={walletReady ? undefined : "text-muted-foreground/60"} />
        <Stat label="Balance" value={walletReady ? formatINR(balance) : "₹ —"} className={walletReady ? undefined : "text-muted-foreground/60"} />
        <Stat label="Margin" value={walletReady ? formatINR(usedMargin) : "₹ —"} className={walletReady ? undefined : "text-muted-foreground/60"} />
        <Stat
          label="Margin level"
          value={!walletReady ? "—" : usedMargin > 0 ? `${marginLevelPct.toFixed(2)}%` : "—"}
          className={
            !walletReady
              ? "text-muted-foreground/60"
              : usedMargin > 0
                ? marginLevelPct < 100
                  ? "text-destructive"
                  : marginLevelPct < 200
                    ? "text-atm"
                    : "text-buy"
                : "text-muted-foreground"
          }
        />
        <div className="ml-auto flex items-center gap-1.5 text-muted-foreground">
          <Wifi className="size-3.5 text-buy" />
          <span>Connected</span>
        </div>
      </footer>

      <OptionChainPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(token) => {
          setPickerOpen(false);
          // Switch the terminal to the picked instrument via URL param.
          router.push(`/terminal?token=${encodeURIComponent(token)}`);
        }}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-tabular font-medium tabular-nums", className)}>{value}</span>
    </div>
  );
}

function ToolRail({
  active,
  onToggle,
}: {
  active: SidePanel;
  onToggle: (panel: SidePanel) => void;
}) {
  // Only the two functional toggles that open a side panel. The drawing-tool
  // placeholders (Trendline / Annotation / Text / Emoji / Measure) used to
  // sit below — removed because they were no-ops and TradingView already
  // ships its own drawing toolbar inside the chart.
  return (
    <aside className="flex w-10 shrink-0 flex-col items-center gap-1 border-r border-border bg-card py-2">
      <RailToggle
        icon={ListChecks}
        title="Instruments"
        on={active === "instruments"}
        onClick={() => onToggle(active === "instruments" ? null : "instruments")}
      />
      <RailToggle
        icon={CalendarClock}
        title="Economic calendar"
        on={active === "calendar"}
        onClick={() => onToggle(active === "calendar" ? null : "calendar")}
      />
    </aside>
  );
}

function RailToggle({
  icon: Icon,
  title,
  on,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "grid size-8 place-items-center rounded-md transition-colors",
        on
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}

