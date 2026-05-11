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
  Pencil,
  Ruler,
  Smile,
  TrendingUp,
  Type,
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
import { WalletAPI } from "@/lib/api";
import { cn, formatINR, pnlColor } from "@/lib/utils";

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
  const { data: wallet } = useQuery<any>({
    queryKey: ["wallet", "summary"],
    queryFn: () => WalletAPI.summary(),
    enabled: !!user,
    refetchInterval: 4000,
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
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>

      {/* ── Footer status bar ──────────────────────────────────── */}
      <footer className="flex h-9 shrink-0 items-center gap-5 border-t border-border bg-card px-3 text-[11px]">
        <Stat label="Equity" value={formatINR(equity)} className={pnlColor(equity - balance)} />
        <Stat label="Free Margin" value={formatINR(freeMargin)} />
        <Stat label="Balance" value={formatINR(balance)} />
        <Stat label="Margin" value={formatINR(usedMargin)} />
        <Stat
          label="Margin level"
          value={usedMargin > 0 ? `${marginLevelPct.toFixed(2)}%` : "—"}
          className={
            usedMargin > 0
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
  // Top section: two functional toggles that open a side panel.
  // Bottom section: drawing-tool placeholders (no-ops; will be wired when
  // the chart drawing layer lands).
  const drawing = [
    { icon: TrendingUp, title: "Trendline" },
    { icon: Pencil, title: "Annotation" },
    { icon: Type, title: "Text" },
    { icon: Smile, title: "Emoji" },
    { icon: Ruler, title: "Measure" },
  ];
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
      <div className="my-1 h-px w-5 bg-border" />
      {drawing.map((t) => (
        <RailButton key={t.title} {...t} />
      ))}
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

function RailButton({
  icon: Icon,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
    >
      <Icon className="size-4" />
    </button>
  );
}
