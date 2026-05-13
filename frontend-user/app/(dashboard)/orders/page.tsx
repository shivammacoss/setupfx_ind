"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, XCircle } from "lucide-react";
import { HoldingAPI, InstrumentAPI, OrderAPI, PositionAPI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable, type Column } from "@/components/common/DataTable";
import { PnlSummaryCards } from "@/components/common/PnlSummaryCards";
import { StatusPill } from "@/components/common/StatusPill";
import {
  cn,
  formatINR,
  formatIST,
  formatPercent,
  formatPrice,
  isUsdSegment,
  pnlColor,
} from "@/lib/utils";

type TopTab = "positions" | "holdings" | "all-orders";
type PositionTab = "open" | "closed";

/**
 * Unified blotter: Positions (open + closed) / Holdings / All Orders all
 * share one screen. Previously these lived on three separate routes
 * (/positions, /holdings, /orders); the bottom nav now exposes a single
 * "Orders" entry so traders see everything in one place without bouncing
 * between routes. Each top-tab carries its own React Query keys, so
 * switching tabs is instant and the data stays warm in the cache.
 */
export default function MyOrdersPage() {
  const [tab, setTab] = useState<TopTab>("positions");
  const [posTab, setPosTab] = useState<PositionTab>("open");

  const headerDescription =
    tab === "positions"
      ? posTab === "open"
        ? "Open positions — live M2M"
        : "Closed positions — realized P&L"
      : tab === "holdings"
        ? "Delivery holdings (CNC) — long-term portfolio"
        : "All orders placed — pending, executed, cancelled, rejected";

  return (
    <div className="space-y-4">
      <PageHeader title="Orders" description={headerDescription} />

      <PnlSummaryCards />

      <div className="flex flex-wrap gap-2">
        {(["positions", "holdings", "all-orders"] as const).map((t) => (
          <Button
            key={t}
            variant={tab === t ? "default" : "outline"}
            size="sm"
            onClick={() => setTab(t)}
          >
            {t === "positions" ? "Positions" : t === "holdings" ? "Holdings" : "All Orders"}
          </Button>
        ))}
      </div>

      {tab === "positions" && (
        <PositionsSection posTab={posTab} setPosTab={setPosTab} />
      )}
      {tab === "holdings" && <HoldingsSection />}
      {tab === "all-orders" && <AllOrdersSection />}
    </div>
  );
}

// ── Positions ──────────────────────────────────────────────────────────

function PositionsSection({
  posTab,
  setPosTab,
}: {
  posTab: PositionTab;
  setPosTab: (t: PositionTab) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {(["open", "closed"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setPosTab(t)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
              posTab === t
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
            )}
          >
            {t === "open" ? "Open" : "Closed"}
          </button>
        ))}
      </div>

      {posTab === "open" ? <OpenPositions /> : <ClosedPositions />}
    </div>
  );
}

/** USD-quoted (forex/crypto) → "$ 80,218.50". Everything else → "₹ 80,218.50".
 *  P&L / margin always stays in ₹ because that's the wallet currency. */
function fmtFeedPrice(
  value: string | number | null | undefined,
  quote?: string,
  segment?: string,
  exchange?: string,
) {
  if (quote === "USD") {
    const n = typeof value === "string" ? Number(value) : (value ?? 0);
    if (!Number.isFinite(n)) return "$ 0.00";
    return `$ ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  }
  if (quote === "INR") return formatINR(value);
  return formatPrice(value, segment, exchange);
}

function OpenPositions() {
  const qc = useQueryClient();
  const { data, isFetching } = useQuery({
    queryKey: ["positions", "open"],
    queryFn: () => PositionAPI.open(),
    refetchInterval: 3000,
  });

  async function squareoff(id: string) {
    if (!confirm("Square off this position at market?")) return;
    try {
      await PositionAPI.squareoff(id);
      toast.success("Submitted");
      qc.invalidateQueries({ queryKey: ["positions"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function squareoffAll() {
    if (!confirm("Square off ALL open positions?")) return;
    try {
      const r = await PositionAPI.squareoffAll();
      toast.success(`Squared off ${r.squared_off}/${r.total}`);
      qc.invalidateQueries({ queryKey: ["positions"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  const totalMtm = (data ?? []).reduce(
    (s: number, p: any) => s + Number(p.unrealized_pnl || 0),
    0,
  );

  const cols: Column<any>[] = [
    { key: "symbol", header: "Symbol" },
    { key: "exchange", header: "Exch" },
    {
      key: "quantity",
      header: "Qty",
      align: "right",
      render: (r) => (
        <span className={r.quantity >= 0 ? "text-buy" : "text-sell"}>{r.quantity}</span>
      ),
    },
    {
      key: "avg_price",
      header: "Avg",
      align: "right",
      render: (r) => fmtFeedPrice(r.avg_price, r.currency_quote, r.segment_type, r.exchange),
    },
    {
      key: "ltp",
      header: "LTP",
      align: "right",
      render: (r) => fmtFeedPrice(r.ltp, r.currency_quote, r.segment_type, r.exchange),
    },
    {
      key: "unrealized_pnl",
      header: "M2M",
      align: "right",
      render: (r) => (
        <span className={pnlColor(r.unrealized_pnl)}>{formatINR(r.unrealized_pnl)}</span>
      ),
    },
    {
      key: "realized_pnl",
      header: "Realized",
      align: "right",
      render: (r) => formatINR(r.realized_pnl),
    },
    {
      key: "margin_used",
      header: "Margin",
      align: "right",
      render: (r) => formatINR(r.margin_used),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <Button
          size="sm"
          onClick={() => squareoff(r.id)}
          className="h-7 gap-1 rounded-md bg-destructive/15 px-2.5 text-xs font-semibold text-destructive ring-1 ring-inset ring-destructive/30 hover:bg-destructive hover:text-destructive-foreground hover:ring-destructive"
        >
          <X className="size-3.5" /> Close
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {data?.length ?? 0} open · M2M:{" "}
          <span className={pnlColor(totalMtm)}>{formatINR(totalMtm)}</span>
        </span>
        <Button variant="destructive" size="sm" disabled={!data?.length} onClick={squareoffAll}>
          Square off all
        </Button>
      </div>
      <DataTable
        columns={cols}
        rows={data}
        keyExtractor={(r) => r.id}
        loading={isFetching && !data}
      />
    </div>
  );
}

function ClosedPositions() {
  const { data, isFetching } = useQuery({
    queryKey: ["positions", "closed"],
    queryFn: () => PositionAPI.closed(),
    refetchInterval: 10_000,
  });

  const totalRealized = (data ?? []).reduce(
    (s: number, p: any) => s + Number(p.realized_pnl || 0),
    0,
  );

  const cols: Column<any>[] = [
    { key: "symbol", header: "Symbol" },
    { key: "exchange", header: "Exch" },
    {
      key: "quantity",
      header: "Qty",
      align: "right",
      render: (r) => (
        <span className={r.quantity >= 0 ? "text-buy" : "text-sell"}>{r.quantity}</span>
      ),
    },
    {
      key: "avg_price",
      header: "Avg",
      align: "right",
      render: (r) => fmtFeedPrice(r.avg_price, r.currency_quote, r.segment_type, r.exchange),
    },
    {
      key: "ltp",
      header: "Close",
      align: "right",
      render: (r) => fmtFeedPrice(r.ltp, r.currency_quote, r.segment_type, r.exchange),
    },
    {
      key: "realized_pnl",
      header: "Realized P&L",
      align: "right",
      render: (r) => (
        <span className={pnlColor(r.realized_pnl)}>{formatINR(r.realized_pnl)}</span>
      ),
    },
    {
      key: "closed_at",
      header: "Closed",
      render: (r) => (
        <span className="whitespace-nowrap text-[11px]">
          {formatIST(r.closed_at ?? r.updated_at, { withSeconds: true })}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        {data?.length ?? 0} closed · Realized:{" "}
        <span className={pnlColor(totalRealized)}>{formatINR(totalRealized)}</span>
      </div>
      <DataTable
        columns={cols}
        rows={data}
        keyExtractor={(r) => r.id}
        loading={isFetching && !data}
      />
    </div>
  );
}

// ── Holdings ───────────────────────────────────────────────────────────

function HoldingsSection() {
  const { data, isFetching } = useQuery({
    queryKey: ["holdings"],
    queryFn: () => HoldingAPI.list(),
    refetchInterval: 5000,
  });

  const totals = (data ?? []).reduce(
    (acc: any, h: any) => {
      acc.invested += Number(h.invested_value || 0);
      acc.current += Number(h.current_value || 0);
      return acc;
    },
    { invested: 0, current: 0 },
  );
  const pnl = totals.current - totals.invested;
  const pnlPct = totals.invested > 0 ? (pnl / totals.invested) * 100 : 0;

  const cols: Column<any>[] = [
    { key: "symbol", header: "Symbol" },
    { key: "exchange", header: "Exch" },
    { key: "quantity", header: "Qty", align: "right" },
    { key: "avg_price", header: "Avg", align: "right", render: (r) => formatINR(r.avg_price) },
    { key: "ltp", header: "LTP", align: "right", render: (r) => formatINR(r.ltp) },
    {
      key: "invested_value",
      header: "Invested",
      align: "right",
      render: (r) => formatINR(r.invested_value),
    },
    {
      key: "current_value",
      header: "Current",
      align: "right",
      render: (r) => formatINR(r.current_value),
    },
    {
      key: "pnl",
      header: "P&L",
      align: "right",
      render: (r) => <span className={pnlColor(r.pnl)}>{formatINR(r.pnl)}</span>,
    },
    {
      key: "pnl_percentage",
      header: "%",
      align: "right",
      render: (r) => (
        <span className={pnlColor(r.pnl_percentage)}>{formatPercent(r.pnl_percentage)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Invested" value={formatINR(totals.invested)} />
        <Stat label="Current value" value={formatINR(totals.current)} />
        <Stat label="P&L" value={formatINR(pnl)} className={pnlColor(pnl)} />
        <Stat label="P&L %" value={formatPercent(pnlPct)} className={pnlColor(pnlPct)} />
      </div>
      <DataTable
        columns={cols}
        rows={data}
        keyExtractor={(r) => r.id}
        loading={isFetching && !data}
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
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("font-tabular text-lg font-semibold", className)}>{value}</div>
    </div>
  );
}

// ── All Orders ─────────────────────────────────────────────────────────

function AllOrdersSection() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("");

  const { data, isFetching } = useQuery({
    queryKey: ["orders", statusFilter],
    queryFn: () => OrderAPI.list(statusFilter || undefined),
    refetchInterval: 4000,
  });

  const { data: openPos } = useQuery({
    queryKey: ["positions", "open"],
    queryFn: () => PositionAPI.open(),
    refetchInterval: 4000,
  });

  const { data: pnlSummary } = useQuery({
    queryKey: ["positions", "pnl-summary"],
    queryFn: () => PositionAPI.pnlSummary(),
    refetchInterval: 10000,
  });
  const usdInr = Number(pnlSummary?.usd_inr_rate ?? 83);

  const orderTokens = useMemo(() => {
    const set = new Set<string>();
    for (const o of (data ?? []) as any[]) {
      const tok = o.token || o.instrument_token;
      if (tok) set.add(String(tok));
    }
    return Array.from(set);
  }, [data]);

  const { data: batchQuotes } = useQuery({
    queryKey: ["orders-quotes", orderTokens.sort().join(",")],
    queryFn: () => InstrumentAPI.quotesBatch(orderTokens),
    enabled: orderTokens.length > 0,
    refetchInterval: 5000,
    staleTime: 4000,
  });

  const ltpByToken = useMemo(() => {
    const m: Record<string, number> = {};
    for (const q of (batchQuotes ?? []) as any[]) {
      const ltp = Number(q.ltp ?? 0);
      if (ltp > 0 && q.token) m[String(q.token)] = ltp;
    }
    return m;
  }, [batchQuotes]);

  const ltpBySymbol = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of (openPos ?? []) as any[]) {
      const ltp = Number(p.ltp ?? 0);
      if (ltp > 0 && p.symbol) m[p.symbol] = ltp;
    }
    return m;
  }, [openPos]);

  function ltpFor(o: any): number | undefined {
    const tok = o.token || o.instrument_token;
    if (tok && ltpByToken[String(tok)]) return ltpByToken[String(tok)];
    if (o.symbol && ltpBySymbol[o.symbol]) return ltpBySymbol[o.symbol];
    return undefined;
  }

  async function cancel(id: string) {
    if (!confirm("Cancel this order?")) return;
    try {
      await OrderAPI.cancel(id);
      toast.success("Cancelled");
      qc.invalidateQueries({ queryKey: ["orders"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  const cols: Column<any>[] = [
    {
      key: "order_number",
      header: "Order #",
      render: (r) => <span className="font-mono text-[11px]">{r.order_number}</span>,
    },
    { key: "symbol", header: "Symbol" },
    { key: "exchange", header: "Exch" },
    { key: "action", header: "Side", render: (r) => <StatusPill status={r.action} /> },
    { key: "order_type", header: "Type", render: (r) => <StatusPill status={r.order_type} /> },
    { key: "lots", header: "Lots", align: "right" },
    {
      key: "open_price",
      header: "Open",
      align: "right",
      render: (r) =>
        formatPrice(
          Number(r.average_price) > 0 ? r.average_price : r.price,
          r.segment,
          r.exchange,
        ),
    },
    {
      key: "close_price",
      header: "Close / LTP",
      align: "right",
      render: (r) => {
        const ltp = ltpFor(r);
        if (!ltp) return <span className="text-muted-foreground">—</span>;
        return (
          <span className="font-tabular">{formatPrice(ltp, r.segment, r.exchange)}</span>
        );
      },
    },
    { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} /> },
    {
      key: "pnl",
      header: "P&L",
      align: "right",
      render: (r) => {
        if (!["EXECUTED", "PARTIAL"].includes(r.status)) {
          return <span className="text-muted-foreground">—</span>;
        }
        const ltp = ltpFor(r);
        const avg = Number(r.average_price ?? 0);
        const qty = Number(r.filled_quantity ?? r.quantity ?? 0);
        if (!ltp || !avg || !qty) return <span className="text-muted-foreground">—</span>;
        const direction = String(r.action).toUpperCase() === "BUY" ? 1 : -1;
        const seg = r.segment;
        const exch = r.exchange;
        const isUsd = isUsdSegment(seg) || isUsdSegment(exch);
        const fx = isUsd ? usdInr : 1;
        const pnl = direction * (ltp - avg) * qty * fx;
        return (
          <span
            className={cn("font-tabular font-semibold", pnlColor(pnl))}
            title={
              isUsd
                ? `LTP ${formatPrice(ltp, seg, exch)} − Avg ${formatPrice(avg, seg, exch)} × ${qty} × USD/INR ${usdInr}`
                : `LTP ${formatPrice(ltp, seg, exch)} − Avg ${formatPrice(avg, seg, exch)} × ${qty}`
            }
          >
            {pnl >= 0 ? "+" : ""}
            {formatINR(pnl)}
          </span>
        );
      },
    },
    {
      key: "open_time",
      header: "Open Time",
      render: (r) => (
        <span className="whitespace-nowrap text-[11px]">
          {formatIST(r.created_at, { withSeconds: true })}
        </span>
      ),
    },
    {
      key: "close_time",
      header: "Close Time",
      render: (r) => {
        const closed =
          r.executed_at ??
          r.cancelled_at ??
          (["CANCELLED", "REJECTED", "EXECUTED"].includes(r.status) ? r.updated_at : null);
        if (!closed) return <span className="text-muted-foreground">—</span>;
        return (
          <span className="whitespace-nowrap text-[11px]">
            {formatIST(closed, { withSeconds: true })}
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) =>
        ["OPEN", "PENDING", "PARTIAL"].includes(r.status) ? (
          <Button variant="ghost" size="icon" onClick={() => cancel(r.id)} aria-label="Cancel">
            <XCircle className="size-4 text-destructive" />
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {["", "OPEN", "EXECUTED", "CANCELLED", "REJECTED"].map((s) => (
          <Button
            key={s || "ALL"}
            variant={statusFilter === s ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(s)}
          >
            {s || "All"}
          </Button>
        ))}
      </div>

      <DataTable
        columns={cols}
        rows={data}
        keyExtractor={(r) => r.id}
        loading={isFetching && !data}
      />
    </div>
  );
}
