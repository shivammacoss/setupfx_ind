"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, X, XCircle } from "lucide-react";
import { InstrumentAPI, OrderAPI, PositionAPI, WalletAPI } from "@/lib/api";
import { useMarketStream } from "@/lib/useMarketStream";
import { usePriceFlash } from "@/lib/usePriceFlash";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  formatPrice,
  isUsdSegment,
  pnlColor,
} from "@/lib/utils";

type TopTab = "positions" | "all-orders";
type PositionTab = "open" | "active" | "closed";

/**
 * Unified blotter: Positions (open + closed) / All Orders share one
 * screen. Each top-tab carries its own React Query keys, so switching
 * tabs is instant and the data stays warm in the cache. Holdings (CNC
 * delivery) is removed at user request — every trade in this platform
 * is intraday / carry-forward, so there's no separate delivery view.
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
      : "All orders placed — pending, executed, cancelled, rejected";

  return (
    <div className="space-y-4">
      <PageHeader title="Orders" description={headerDescription} />

      {/* Wallet & margin snapshot — shown on every device. Surfaces the
          numbers the trader needs to size new orders + see live equity:
          Balance, Equity, M2M, Used Margin, and the carry-forward
          margin requirement (only Indian-segment positions count
          toward CF because Forex/Crypto/Stocks/Indices/Commodities are
          carry-mode by default). */}
      <OrdersWalletStrip />

      {/* TODAY / THIS WEEK / LAST WEEK PnL cards are noise on the phone —
          the same info is reachable from the Dashboard, and on the
          Orders screen the trader cares about the live blotter, not a
          rolling P&L stat strip. Kept on desktop where the wider canvas
          can afford the row. */}
      <div className="hidden md:block">
        <PnlSummaryCards />
      </div>

      {/* Section tabs (Positions / All Orders) are mobile-only. On
          desktop (md+) the dedicated /positions route already exists
          in the sidebar, so the Orders page there is just the
          All-Orders blotter — no extra tab chrome. */}
      <div className="flex flex-wrap gap-2 md:hidden">
        {(["positions", "all-orders"] as const).map((t) => (
          <Button
            key={t}
            variant={tab === t ? "default" : "outline"}
            size="sm"
            onClick={() => setTab(t)}
          >
            {t === "positions" ? "Positions" : "All Orders"}
          </Button>
        ))}
      </div>

      {/* Mobile: render the active section based on the tab state. */}
      <div className="md:hidden">
        {tab === "positions" && (
          <PositionsSection posTab={posTab} setPosTab={setPosTab} />
        )}
        {tab === "all-orders" && <AllOrdersSection />}
      </div>

      {/* Desktop: always the All-Orders blotter (Positions lives on
          its own /positions route in the sidebar). */}
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
        description="This will close every open position at market price. This action cannot be undone."
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
  const [editing, setEditing] = useState<any | null>(null);

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
        <div className="flex items-center justify-end gap-1.5">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Edit SL / TP"
            title="Edit SL / TP"
            onClick={() => setEditing(r)}
            className="h-7 w-7"
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            size="sm"
            onClick={() => exitTrade(r.id)}
            className="h-7 gap-1 rounded-md bg-destructive/15 px-2.5 text-xs font-semibold text-destructive ring-1 ring-inset ring-destructive/30 hover:bg-destructive hover:text-destructive-foreground hover:ring-destructive"
          >
            <X className="size-3.5" /> Exit
          </Button>
        </div>
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

      <EditSlTpDialog
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["positions"] })}
      />
    </div>
  );
}

/** Inline SL/TP edit dialog for the active-trades row. Posts to the
 *  per-trade endpoint (the backend still aggregates onto the parent
 *  position internally, but the URL keeps the per-leg semantics so
 *  per-fill SL/TP is easy to add later). Mirrors the validation rules
 *  in the trading-terminal version: SL below entry / TP above entry
 *  for longs, opposite for shorts. */
function EditSlTpDialog({
  target,
  onClose,
  onSaved,
}: {
  target: any | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [sl, setSl] = useState<string>("");
  const [tp, setTp] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [synced, setSynced] = useState<string | null>(null);

  if (target && synced !== target.id) {
    setSl(target.stop_loss ? String(Number(target.stop_loss)) : "");
    setTp(target.target ? String(Number(target.target)) : "");
    setSynced(target.id);
  }
  if (!target && synced !== null) {
    setSl("");
    setTp("");
    setSynced(null);
  }

  async function save() {
    if (!target) return;
    const avg = Number(target.price ?? target.avg_price ?? 0);
    const isLong = String(target.action ?? target.side ?? "").toUpperCase() === "BUY";
    const slNum = sl ? Number(sl) : 0;
    const tpNum = tp ? Number(tp) : 0;
    if (avg > 0) {
      if (slNum > 0) {
        if (isLong && slNum >= avg) {
          toast.error(`Stop loss must be BELOW entry ${avg} for a long`);
          return;
        }
        if (!isLong && slNum <= avg) {
          toast.error(`Stop loss must be ABOVE entry ${avg} for a short`);
          return;
        }
      }
      if (tpNum > 0) {
        if (isLong && tpNum <= avg) {
          toast.error(`Target must be ABOVE entry ${avg} for a long`);
          return;
        }
        if (!isLong && tpNum >= avg) {
          toast.error(`Target must be BELOW entry ${avg} for a short`);
          return;
        }
      }
    }

    setSaving(true);
    try {
      await PositionAPI.updateActiveTradeSlTp(target.id, {
        stop_loss: sl ? Number(sl) : null,
        target: tp ? Number(tp) : null,
      });
      toast.success("SL / TP updated");
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Edit SL / TP — {target?.symbol}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Entry: <span className="font-tabular font-semibold text-foreground">
              {target?.price}
            </span>{" "}
            · Side:{" "}
            <span className="font-semibold text-foreground">
              {String(target?.action ?? target?.side ?? "").toUpperCase()}
            </span>
          </div>
          <div className="space-y-1.5">
            <Label>Stop loss</Label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={sl}
              onChange={(e) => setSl(e.target.value)}
              placeholder="Leave empty to clear"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Target / take-profit</Label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={tp}
              onChange={(e) => setTp(e.target.value)}
              placeholder="Leave empty to clear"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

  // Live WS stream — 250 ms cadence. Same source the trading terminal
  // uses; lets the Close / LTP column tick live + flash green/red on
  // direction change instead of polling REST every 5 s.
  const liveStream = useMarketStream(orderTokens);

  const ltpByToken = useMemo(() => {
    const m: Record<string, number> = {};
    // Seed with REST snapshot first; WS ticks below overwrite.
    for (const q of (batchQuotes ?? []) as any[]) {
      const ltp = Number(q.ltp ?? 0);
      if (ltp > 0 && q.token) m[String(q.token)] = ltp;
    }
    liveStream.forEach((q, tok) => {
      const ltp = Number(q?.ltp ?? 0);
      if (ltp > 0) m[tok] = ltp;
    });
    return m;
  }, [batchQuotes, liveStream]);

  const ltpBySymbol = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of (openPos ?? []) as any[]) {
      const ltp = Number(p.ltp ?? 0);
      if (ltp > 0 && p.symbol) m[p.symbol] = ltp;
    }
    return m;
  }, [openPos]);

  // Merge in open positions when the user is on "All" or "OPEN" — the
  // blotter used to only show pending LIMIT/SL orders for these
  // filters, but users expect "open" to include their currently-held
  // executed positions too (positions tab on /positions is otherwise
  // hidden behind a separate route). Each position is shaped like an
  // Order row so the existing columns render correctly; `_isPosition`
  // flags the row so the Cancel action stays hidden and the P&L cell
  // pulls from the position's already-known unrealized_pnl instead of
  // re-deriving from LTP.
  const tableRows = useMemo(() => {
    const orders = (data ?? []) as any[];
    if (statusFilter !== "" && statusFilter !== "OPEN") return orders;
    const positionsAsOrders = (openPos ?? []).map((p: any) => ({
      _isPosition: true,
      id: `pos-${p.id}`,
      order_number: "—",
      symbol: p.symbol,
      exchange: p.exchange,
      segment: p.segment_type,
      token: p.instrument_token,
      action: Number(p.quantity) >= 0 ? "BUY" : "SELL",
      order_type: p.product_type || "MIS",
      lots: Math.abs(Number(p.lots ?? p.quantity ?? 0)),
      quantity: Math.abs(Number(p.quantity ?? 0)),
      filled_quantity: Math.abs(Number(p.quantity ?? 0)),
      price: p.avg_price,
      average_price: p.avg_price,
      status: "OPEN",
      created_at: p.opened_at,
      executed_at: p.opened_at,
      // Carry the server-known unrealized P&L (INR, with FX conversion)
      // so the P&L cell can render it directly without recomputing.
      _serverPnl: Number(p.unrealized_pnl ?? 0),
      _ltp: Number(p.ltp ?? 0),
    }));
    return [...positionsAsOrders, ...orders];
  }, [data, openPos, statusFilter]);

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
          <OrdersFlashPrice
            value={ltp}
            segment={r.segment}
            exchange={r.exchange}
          />
        );
      },
    },
    { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} /> },
    {
      key: "pnl",
      header: "P&L",
      align: "right",
      render: (r) => {
        // Synthetic position row → live P&L from server (already INR).
        if (r._isPosition) {
          const pnl = Number(r._serverPnl ?? 0);
          return (
            <span className={cn("font-semibold", pnlColor(pnl))}>
              {pnl >= 0 ? "+" : ""}
              {formatINR(pnl)}
            </span>
          );
        }
        // Real order row → use the FROZEN realized P&L the backend
        // wrote onto the order's closing trade (`pnl_inr`). Opening-
        // leg orders have no `pnl_inr` (no realisation yet, the gain
        // shows up on the corresponding position row above instead),
        // and pending / cancelled / rejected orders have nothing to
        // report. Live (ltp − avg) × qty math was misleading here —
        // an executed order's P&L should be FROZEN at close time, not
        // floating on every tick. Matches the History tab on the
        // trading terminal.
        if (r.pnl_inr != null && r.pnl_inr !== "") {
          const pnl = Number(r.pnl_inr);
          if (!Number.isFinite(pnl) || pnl === 0) {
            return <span className="text-muted-foreground">—</span>;
          }
          return (
            <span className={cn("font-semibold", pnlColor(pnl))}>
              {pnl >= 0 ? "+" : ""}
              {formatINR(pnl)}
            </span>
          );
        }
        return <span className="text-muted-foreground">—</span>;
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
        !r._isPosition && ["OPEN", "PENDING", "PARTIAL"].includes(r.status) ? (
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

      {/* Desktop / tablet: horizontal data table. */}
      <div className="hidden md:block">
        <DataTable
          columns={cols}
          rows={tableRows}
          keyExtractor={(r) => r.id}
          loading={isFetching && !data}
        />
      </div>

      {/* Mobile: vertical card list. The wide blotter columns (Order # /
          Symbol / Exch / Side / Type / Lots / Open / Close / Status / P&L /
          Open Time / Close Time / Cancel button) don't fit a 360 px screen
          without horizontal scroll — every cell ends up clipped. Cards
          stack the same fields top-to-bottom so the user sees every detail
          for an order at a glance, no scrolling sideways. */}
      <div className="space-y-2 md:hidden">
        {isFetching && !data ? (
          <div className="grid h-24 place-items-center text-xs text-muted-foreground">
            Loading orders…
          </div>
        ) : tableRows.length === 0 ? (
          <div className="grid h-24 place-items-center text-xs text-muted-foreground">
            No orders match this filter.
          </div>
        ) : (
          tableRows.map((r: any) => (
            <OrderCard
              key={r.id}
              order={r}
              ltp={r._isPosition ? r._ltp : ltpFor(r)}
              usdInr={usdInr}
              onCancel={() => setCancelTarget({ id: r.id, order_number: r.order_number })}
            />
          ))
        )}
      </div>

      {/* Themed cancel-order dialog (replaces native confirm("Cancel this
          order?")). The previous prompt's OK / Cancel buttons came from
          the browser chrome and felt jarring against the app's dark UI. */}
      <ConfirmDialog
        open={!!cancelTarget}
        title="Cancel this order?"
        description={
          cancelTarget?.order_number
            ? `Order ${cancelTarget.order_number} will be cancelled.`
            : "This pending order will be cancelled."
        }
        confirmLabel="Cancel order"
        cancelLabel="Keep order"
        onConfirm={doCancel}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
}

/**
 * Mobile card for a single order row. Replaces the horizontal blotter
 * table on phones — every relevant field is visible without scrolling
 * sideways. Symbol + side badge anchor the top, then a 2-column grid
 * for prices + lots, then P&L (only meaningful once executed) and the
 * timestamp + cancel action.
 */
function OrderCard({
  order: r,
  ltp,
  usdInr,
  onCancel,
}: {
  order: any;
  ltp: number | undefined;
  usdInr: number;
  onCancel: () => void;
}) {
  const isBuy = String(r.action).toUpperCase() === "BUY";
  const isCancellable = ["OPEN", "PENDING", "PARTIAL"].includes(r.status);
  const isExecuted = ["EXECUTED", "PARTIAL"].includes(r.status);
  const openPriceDisplay = formatPrice(
    Number(r.average_price) > 0 ? r.average_price : r.price,
    r.segment,
    r.exchange,
  );
  const closeDisplay = ltp ? formatPrice(ltp, r.segment, r.exchange) : "—";

  let pnlDisplay: { value: string; positive: boolean } | null = null;
  // Synthetic position row → live P/L from server.
  if (r._isPosition) {
    const pnl = Number(r._serverPnl ?? 0);
    if (pnl !== 0) {
      pnlDisplay = {
        value: `${pnl >= 0 ? "+" : ""}${formatINR(pnl)}`,
        positive: pnl >= 0,
      };
    }
  } else if (r.pnl_inr != null && r.pnl_inr !== "") {
    // Real order row → FROZEN realized P&L on the closing trade.
    // Opening-leg orders have null pnl_inr — their gain shows on
    // the corresponding position row instead.
    const pnl = Number(r.pnl_inr);
    if (Number.isFinite(pnl) && pnl !== 0) {
      pnlDisplay = {
        value: `${pnl >= 0 ? "+" : ""}${formatINR(pnl)}`,
        positive: pnl >= 0,
      };
    }
  }

  const closedAt =
    r.executed_at ??
    r.cancelled_at ??
    (["CANCELLED", "REJECTED", "EXECUTED"].includes(r.status) ? r.updated_at : null);

  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
      {/* Header — Symbol + Side + Status */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{r.symbol}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>{r.exchange}</span>
            <span>·</span>
            <span className="font-mono">{r.order_number}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusPill status={r.action} />
          <StatusPill status={r.status} />
        </div>
      </div>

      {/* Prices + lots */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <CardCell label="Open" value={openPriceDisplay} />
        <CardCell label="Close / LTP" value={closeDisplay} />
        <CardCell
          label="Lots"
          value={
            <span>
              {r.lots}{" "}
              <span className="text-muted-foreground">
                ({r.order_type})
              </span>
            </span>
          }
        />
      </div>

      {/* P&L (only for executed) */}
      {pnlDisplay && (
        <div className="mt-2 flex items-baseline justify-between rounded-md border border-border bg-muted/20 px-2.5 py-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">P&L</span>
          <span
            className={cn(
              "font-tabular text-sm font-bold tabular-nums",
              pnlDisplay.positive ? "text-buy" : "text-sell",
            )}
          >
            {pnlDisplay.value}
          </span>
        </div>
      )}

      {/* Timestamps + cancel */}
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/60 pt-2">
        <div className="flex flex-col text-[10px] text-muted-foreground">
          <span>
            Opened{" "}
            <span className="font-tabular font-semibold text-foreground">
              {formatIST(r.created_at, { withSeconds: false })}
            </span>
          </span>
          {closedAt && (
            <span>
              Closed{" "}
              <span className="font-tabular font-semibold text-foreground">
                {formatIST(closedAt, { withSeconds: false })}
              </span>
            </span>
          )}
        </div>
        {isCancellable && (
          <Button
            size="sm"
            variant="outline"
            onClick={onCancel}
            className="h-7 gap-1 rounded-md text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <XCircle className="size-3.5" /> Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

function CardCell({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-tabular text-sm font-semibold tabular-nums text-foreground">
        {value}
      </div>
    </div>
  );
}


/**
 * Wallet + margin snapshot strip for the Orders page header. Combines
 *   • Balance        — wallet.available + wallet.used (capital, no P/L)
 *   • Equity         — Balance + live M2M
 *   • M2M            — live unrealised P/L across open positions
 *   • Used Margin    — wallet.used_margin (locked right now)
 *   • CF Required    — extra carry-forward margin needed (Indian segments only;
 *                      Forex / Crypto / Stocks / Indices / Commodities skip
 *                      this because they're already carry-mode by default)
 *
 * Wallet poll is 10 s; pnl-summary is 5 s. Five tiles on lg+, two-row
 * grid on mobile so they still fit a 360 px screen without scrolling.
 */
function OrdersWalletStrip() {
  const { data: wallet } = useQuery({
    queryKey: ["wallet", "summary"],
    queryFn: () => WalletAPI.summary(),
    refetchInterval: 10_000,
    staleTime: 5_000,
    refetchOnWindowFocus: false,
  });
  const { data: pnlSummary } = useQuery({
    queryKey: ["positions", "pnl-summary"],
    queryFn: () => PositionAPI.pnlSummary(),
    refetchInterval: 5_000,
    staleTime: 2_000,
  });
  const { data: openPositions } = useQuery<any[]>({
    queryKey: ["positions", "open"],
    queryFn: () => PositionAPI.open(),
    refetchInterval: 4_000,
    staleTime: 2_000,
  });

  const available = Number(wallet?.available_balance ?? 0);
  const used = Number(wallet?.used_margin ?? 0);
  const balance = available + used;
  const m2m = Number(pnlSummary?.open_unrealised ?? 0);
  const equity = balance + m2m;

  // CF Required = sum of Indian-segment positions' margin_used. Infoway-
  // fed segments (Forex/Crypto/Stocks/Indices/Commodities) are already
  // on overnight margin and don't need an "extra for CF" tile here.
  const isInfowayPosition = (p: any): boolean => {
    const seg = (p?.segment_type ?? "").toUpperCase();
    const exch = (p?.exchange ?? "").toUpperCase();
    return (
      /CRYPTO|FOREX|FX|CDS|STOCKS|INDICES|COMMODITIES/.test(seg) ||
      exch === "CDS" ||
      exch === "CRYPTO"
    );
  };
  const cfRequired = (openPositions ?? [])
    .filter((p: any) => !isInfowayPosition(p))
    .reduce((s, p) => s + Number(p.margin_used ?? 0), 0);

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      <WalletTile label="Balance" value={formatINR(balance)} />
      <WalletTile label="Equity" value={formatINR(equity)} />
      <WalletTile
        label="M2M"
        value={`${m2m >= 0 ? "+" : ""}${formatINR(m2m)}`}
        valueClass={pnlColor(m2m)}
      />
      <WalletTile label="Used Margin" value={formatINR(used)} />
      <WalletTile
        label="CF Required"
        value={formatINR(cfRequired)}
        valueClass={cfRequired > available ? "text-red-500" : undefined}
      />
    </div>
  );
}

function WalletTile({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 font-tabular text-sm font-semibold tabular-nums",
          valueClass,
        )}
      >
        {value}
      </div>
    </div>
  );
}


/** Close / LTP cell that flashes green when the LTP ticks up, red when
 *  it ticks down, decays back to neutral after ~700 ms. Same UX as the
 *  trading-terminal positions / instruments tables. */
function OrdersFlashPrice({
  value,
  segment,
  exchange,
}: {
  value: number;
  segment?: string;
  exchange?: string;
}) {
  const dir = usePriceFlash(value);
  const flashColor =
    dir === "up" ? "text-emerald-500" : dir === "down" ? "text-red-500" : "";
  return (
    <span
      className={cn(
        "whitespace-nowrap font-tabular tabular-nums transition-colors",
        flashColor,
      )}
    >
      {formatPrice(value, segment, exchange)}
    </span>
  );
}
