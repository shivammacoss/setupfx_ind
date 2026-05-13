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
import { ClosePositionDialog, type ClosePositionTarget } from "@/components/common/ClosePositionDialog";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
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
type PositionTab = "open" | "active" | "closed";

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
        : posTab === "active"
          ? "Active trades — per-fill with margin + bracket"
          : "Closed positions — realized P&L"
      : tab === "holdings"
        ? "Delivery holdings (CNC) — long-term portfolio"
        : "All orders placed — pending, executed, cancelled, rejected";

  return (
    <div className="space-y-4">
      <PageHeader title="Orders" description={headerDescription} />

      {/* TODAY / THIS WEEK / LAST WEEK PnL cards are noise on the phone —
          the same info is reachable from the Dashboard, and on the
          Orders screen the trader cares about the live blotter, not a
          rolling P&L stat strip. Kept on desktop where the wider canvas
          can afford the row. */}
      <div className="hidden md:block">
        <PnlSummaryCards />
      </div>

      {/* Section tabs (Positions / Holdings / All Orders) are mobile-only.
          On desktop (md+) the dedicated /positions, /holdings, and other
          dashboard routes already exist in the sidebar, so the Orders page
          there is just the All-Orders blotter — no extra tab chrome. The
          tabs were added specifically to consolidate these views on the
          mobile bottom-nav per user request. */}
      <div className="flex flex-wrap gap-2 md:hidden">
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

      {/* Mobile: render the active section based on the tab state. */}
      <div className="md:hidden">
        {tab === "positions" && (
          <PositionsSection posTab={posTab} setPosTab={setPosTab} />
        )}
        {tab === "holdings" && <HoldingsSection />}
        {tab === "all-orders" && <AllOrdersSection />}
      </div>

      {/* Desktop: always the All-Orders blotter (Positions / Holdings live
          on their own routes in the sidebar). */}
      <div className="hidden md:block">
        <AllOrdersSection />
      </div>
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
        {(["open", "active", "closed"] as const).map((t) => (
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
            {t === "open" ? "Open" : t === "active" ? "Active" : "Closed"}
          </button>
        ))}
      </div>

      {posTab === "open" && <OpenPositions />}
      {posTab === "active" && <ActivePositions />}
      {posTab === "closed" && <ClosedPositions />}
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

  // ── In-app modal state ────────────────────────────────────────────
  // Replaces three `window.confirm()` prompts with themed dialogs. The
  // close-position dialog holds the row being closed; clearing the state
  // closes the dialog. Squareoff-all uses the simpler ConfirmDialog with
  // a destructive Confirm button.
  const [closeTarget, setCloseTarget] = useState<ClosePositionTarget | null>(null);
  const [allOpen, setAllOpen] = useState(false);

  function openClose(row: any) {
    // The backend's "lots" is the canonical-lot count (fractional for
    // MCX/crypto/forex). Prefer `row.lots` and fall back to deriving from
    // qty when it isn't set (legacy positions before the canonical-lot
    // migration).
    const lots = Number(
      row.lots ??
        (row.lot_size && Number(row.lot_size) > 0
          ? Math.abs(Number(row.quantity ?? 0)) / Number(row.lot_size)
          : Math.abs(Number(row.quantity ?? 0))),
    );
    setCloseTarget({
      id: row.id,
      symbol: row.symbol,
      side: Number(row.quantity) >= 0 ? "BUY" : "SELL",
      lots: +lots.toFixed(3),
      // Required for the dialog's market-hours guard — without these the
      // helper defaults to the NSE 09:15-15:30 window for every position,
      // which would wrongly block 24/7 crypto and 24/5 forex closes.
      segment_type: row.segment_type,
      exchange: row.exchange,
    });
  }

  async function doSquareoffAll() {
    try {
      const r = await PositionAPI.squareoffAll();
      toast.success(`Squared off ${r.squared_off}/${r.total}`);
      qc.invalidateQueries({ queryKey: ["positions"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    } catch (e: any) {
      toast.error(e.message || "Squareoff failed");
    } finally {
      setAllOpen(false);
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
          onClick={() => openClose(r)}
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
        <Button variant="destructive" size="sm" disabled={!data?.length} onClick={() => setAllOpen(true)}>
          Square off all
        </Button>
      </div>
      <DataTable
        columns={cols}
        rows={data}
        keyExtractor={(r) => r.id}
        loading={isFetching && !data}
      />

      {/* Themed dialogs replace the previous native confirm() prompts.
          ClosePositionDialog handles single-row close with 25/50/75/FULL
          presets + optimistic row removal; ConfirmDialog is the destructive
          "are you sure" for closing every open position at once. */}
      <ClosePositionDialog target={closeTarget} onClose={() => setCloseTarget(null)} />
      <ConfirmDialog
        open={allOpen}
        title="Square off ALL open positions?"
        description="Yeh sabhi open positions ko market price par close kar dega. Yeh action wapas nahi liya ja sakta."
        confirmLabel="Square off all"
        cancelLabel="Cancel"
        onConfirm={doSquareoffAll}
        onCancel={() => setAllOpen(false)}
      />
    </div>
  );
}

// Active trades = per-fill view of currently-open exposure. Same parent
// position drives SL/TP (FIFO/avg accounting); this tab lets the trader
// see each entry leg with its own margin + bracket + Exit action so
// individual fills can be managed without dealing with the aggregated
// weighted-avg row.
function ActivePositions() {
  const qc = useQueryClient();
  const { data, isFetching } = useQuery<any[]>({
    queryKey: ["positions", "active-trades"],
    queryFn: () => PositionAPI.activeTrades(),
    refetchInterval: 3000,
  });

  async function exitTrade(tradeId: string) {
    try {
      await PositionAPI.closeActiveTrade(tradeId);
      toast.success("Exit placed");
      qc.invalidateQueries({ queryKey: ["positions"] });
    } catch (e: any) {
      toast.error(e?.message || "Exit failed");
    }
  }

  const totalPnl = (data ?? []).reduce(
    (s: number, t: any) => s + Number(t.pnl ?? 0),
    0,
  );

  const cols: Column<any>[] = [
    { key: "symbol", header: "Symbol" },
    { key: "exchange", header: "Exch" },
    {
      key: "action",
      header: "Side",
      align: "center",
      render: (r) => (
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-bold uppercase",
            String(r.action ?? r.side).toUpperCase() === "BUY"
              ? "bg-buy/15 text-buy"
              : "bg-sell/15 text-sell",
          )}
        >
          {String(r.action ?? r.side).toUpperCase()}
        </span>
      ),
    },
    {
      key: "product_type",
      header: "Prod",
      align: "center",
      render: (r) => (
        <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase">
          {r.product_type}
        </span>
      ),
    },
    { key: "quantity", header: "Qty", align: "right" },
    {
      key: "price",
      header: "Entry",
      align: "right",
      render: (r) =>
        fmtFeedPrice(r.price, r.currency_quote, r.segment, r.exchange),
    },
    {
      key: "ltp",
      header: "LTP",
      align: "right",
      render: (r) =>
        fmtFeedPrice(r.ltp, r.currency_quote, r.segment, r.exchange),
    },
    {
      key: "used_margin",
      header: "Used",
      align: "right",
      render: (r) => formatINR(r.margin ?? r.used_margin ?? r.margin_used ?? 0),
    },
    {
      key: "holding_margin",
      header: "Holding",
      align: "right",
      render: (r) => {
        // MIS converts to NRML at 1.4× margin; NRML already overnight-ready.
        const used = Number(r.margin ?? r.used_margin ?? r.margin_used ?? 0);
        const isMIS = String(r.product_type ?? "").toUpperCase() === "MIS";
        return formatINR(isMIS ? +(used * 1.4).toFixed(2) : used);
      },
    },
    {
      key: "pnl",
      header: "P&L",
      align: "right",
      render: (r) => (
        <span className={pnlColor(r.pnl)}>{formatINR(r.pnl)}</span>
      ),
    },
    {
      key: "tp",
      header: "TP",
      align: "right",
      render: (r) => (
        <span className="font-tabular text-xs tabular-nums">
          {r.target ? Number(r.target).toFixed(2) : "—"}
        </span>
      ),
    },
    {
      key: "sl",
      header: "SL",
      align: "right",
      render: (r) => (
        <span className="font-tabular text-xs tabular-nums">
          {r.stop_loss ? Number(r.stop_loss).toFixed(2) : "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <Button
          size="sm"
          onClick={() => exitTrade(r.id)}
          className="h-7 gap-1 rounded-md bg-destructive/15 px-2.5 text-xs font-semibold text-destructive ring-1 ring-inset ring-destructive/30 hover:bg-destructive hover:text-destructive-foreground hover:ring-destructive"
        >
          <X className="size-3.5" /> Exit
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {data?.length ?? 0} active · P&L:{" "}
          <span className={pnlColor(totalPnl)}>{formatINR(totalPnl)}</span>
        </span>
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
        <span className="whitespace-nowrap font-tabular text-xs font-semibold tabular-nums text-foreground">
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
      <div className={cn("text-lg font-semibold", className)}>{value}</div>
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

  // Themed cancel-order confirm (replaces native confirm()). Caller flips
  // `cancelTarget` to the order being cancelled; the dialog at the bottom
  // of this section reads it.
  const [cancelTarget, setCancelTarget] = useState<{ id: string; order_number?: string } | null>(null);

  async function doCancel() {
    if (!cancelTarget) return;
    const id = cancelTarget.id;
    setCancelTarget(null);
    try {
      await OrderAPI.cancel(id);
      toast.success("Cancelled");
      qc.invalidateQueries({ queryKey: ["orders"] });
    } catch (e: any) {
      toast.error(e?.message || "Cancel failed");
    }
  }

  const cols: Column<any>[] = [
    {
      key: "order_number",
      header: "Order #",
      render: (r) => <span className="text-[11px]">{r.order_number}</span>,
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
          <span>{formatPrice(ltp, r.segment, r.exchange)}</span>
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
            className={cn("font-semibold", pnlColor(pnl))}
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
        <span className="whitespace-nowrap font-tabular text-xs font-semibold tabular-nums text-foreground">
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
          <span className="whitespace-nowrap font-tabular text-xs font-semibold tabular-nums text-foreground">
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
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCancelTarget({ id: r.id, order_number: r.order_number })}
            aria-label="Cancel"
          >
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

      {/* Themed cancel-order dialog (replaces native confirm("Cancel this
          order?")). The previous prompt's OK / Cancel buttons came from
          the browser chrome and felt jarring against the app's dark UI. */}
      <ConfirmDialog
        open={!!cancelTarget}
        title="Cancel this order?"
        description={
          cancelTarget?.order_number
            ? `Order ${cancelTarget.order_number} ko cancel kar diya jaayega.`
            : "Yeh pending order cancel kar diya jaayega."
        }
        confirmLabel="Cancel order"
        cancelLabel="Keep order"
        onConfirm={doCancel}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
}
