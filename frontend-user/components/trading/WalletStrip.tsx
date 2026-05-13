"use client";

import { useQuery } from "@tanstack/react-query";
import { PositionAPI, WalletAPI } from "@/lib/api";
import { cn, formatINR, pnlColor } from "@/lib/utils";

/**
 * Slim wallet stats strip for the desktop terminal layout — sits between
 * the chart card and the positions table so the trader always sees their
 * Total Balance / Equity / Used Margin / Available / open P&L without
 * leaving the page. Hidden on mobile (the same numbers are surfaced
 * inside the TradeDetailSheet's margin cards there).
 *
 * Values:
 *   • Total Balance = available + used (wallet capital, ignores P&L)
 *   • Equity        = available + used + open unrealised P&L (live mark-to-market)
 *   • Used Margin   = wallet.used_margin (locked in open positions)
 *   • Available     = wallet.available_balance (free to trade)
 *   • P/L           = live unrealised across all open positions
 */
export function WalletStrip({ className }: { className?: string }) {
  const { data: wallet } = useQuery({
    queryKey: ["wallet", "summary"],
    queryFn: () => WalletAPI.summary(),
    refetchInterval: 10_000,
    staleTime: 5_000,
    refetchOnWindowFocus: false,
  });

  // pnl-summary already aggregates live unrealised P&L across all open
  // positions on the server side (with USD→INR conversion for forex /
  // crypto), so we read that instead of summing positions client-side.
  const { data: pnl } = useQuery({
    queryKey: ["positions", "pnl-summary"],
    queryFn: () => PositionAPI.pnlSummary(),
    refetchInterval: 5_000,
    staleTime: 2_000,
    refetchOnWindowFocus: false,
  });

  const available = Number(wallet?.available_balance ?? 0);
  const used = Number(wallet?.used_margin ?? 0);
  const openUnrl = Number(pnl?.open_unrealised ?? pnl?.unrealized_pnl ?? 0);
  const totalBalance = available + used;
  const equity = totalBalance + openUnrl;

  return (
    <div
      className={cn(
        "hidden items-center gap-x-5 gap-y-1 rounded-md border border-border bg-card px-3 py-1.5 text-[11px] lg:flex",
        className,
      )}
    >
      <Stat label="Total Balance" value={formatINR(totalBalance)} />
      <Sep />
      <Stat label="Equity" value={formatINR(equity)} />
      <Sep />
      <Stat label="Used Margin" value={formatINR(used)} />
      <Sep />
      <Stat label="Available" value={formatINR(available)} />
      <Sep />
      <Stat
        label="Open P/L"
        value={`${openUnrl >= 0 ? "+" : ""}${formatINR(openUnrl)}`}
        valueClass={pnlColor(openUnrl)}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-tabular font-semibold tabular-nums", valueClass)}>
        {value}
      </span>
    </div>
  );
}

function Sep() {
  return <span className="h-3 w-px shrink-0 bg-border" aria-hidden />;
}
