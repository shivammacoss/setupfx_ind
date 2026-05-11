"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, X, Zap } from "lucide-react";
import { InstrumentAPI, OrderAPI, PositionAPI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn, formatINR, formatPrice, isUsdSegment, pnlColor, relativeTime } from "@/lib/utils";
import { playClosedTone } from "@/lib/trade-audio";

interface Props {
  positions: any[];
  pendingOrders: any[];
  history: any[];
  cancelled: any[];
  totalPnL: number;
}

const ONE_CLICK_KEY = "setupfx.terminal.oneClick";

type TabKey = "positions" | "active" | "pending" | "history" | "cancelled";

const COL_TEMPLATE =
  "minmax(80px,80px) minmax(110px,1fr) 50px 60px 70px minmax(80px,1fr) minmax(80px,1fr) minmax(80px,1fr) minmax(80px,1fr) 60px minmax(80px,1fr) minmax(96px,120px)";

export function PositionsTabs({ positions, pendingOrders, history, cancelled, totalPnL }: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>("positions");

  // One-Click trading mode persists across reloads — once a trader opts in,
  // they shouldn't have to re-tick it every session. Window-guarded for SSR.
  const [oneClick, setOneClick] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setOneClick(window.localStorage.getItem(ONE_CLICK_KEY) === "1");
  }, []);
  function toggleOneClick(v: boolean) {
    setOneClick(v);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ONE_CLICK_KEY, v ? "1" : "0");
    }
    // Broadcast so OrderPanel (separate component tree) can react too.
    window.dispatchEvent(new CustomEvent("oneclick:change", { detail: v }));
  }

  const [editing, setEditing] = useState<any | null>(null);

  // ── Active Trades: one row per fill that's still part of an open
  // position. Lets the trader close / edit each entry individually instead
  // of dealing with the aggregated weighted-avg position.
  const { data: activeTrades } = useQuery<any[]>({
    queryKey: ["active-trades"],
    queryFn: () => PositionAPI.activeTrades(),
    refetchInterval: 2000,
  });

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "positions", label: "Positions", count: positions.length },
    { key: "active", label: "Active Trades", count: activeTrades?.length ?? 0 },
    { key: "pending", label: "Pending", count: pendingOrders.length },
    { key: "history", label: "History", count: history.length },
    { key: "cancelled", label: "Cancelled", count: cancelled.length },
  ];

  // ── Live P&L for filled history rows ────────────────────────────
  // Each row is a closed/filled order; the P/L column shows what the
  // trade is worth right now (current_LTP vs fill_price × qty × side).
  const historyTokens = useMemo<string[]>(() => {
    const set = new Set<string>();
    for (const o of history) {
      const tok = o.token || o.instrument_token;
      if (tok) set.add(String(tok));
    }
    return Array.from(set);
  }, [history]);

  const { data: historyQuotes } = useQuery<any[]>({
    queryKey: ["history-quotes", historyTokens.sort().join(",")],
    queryFn: () => InstrumentAPI.quotesBatch(historyTokens),
    enabled: tab === "history" && historyTokens.length > 0,
    refetchInterval: 1500,
    staleTime: 1000,
  });

  const historyLtp = useMemo<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    for (const q of historyQuotes ?? []) {
      const ltp = Number(q.ltp ?? 0);
      if (ltp > 0 && q.token) m[String(q.token)] = ltp;
    }
    return m;
  }, [historyQuotes]);

  // Live USD/INR rate so per-history P&L (and the tab total below) reflect
  // wallet INR for crypto/forex trades, not raw USD.
  const { data: pnlSummary } = useQuery({
    queryKey: ["positions", "pnl-summary"],
    queryFn: () => PositionAPI.pnlSummary(),
    refetchInterval: 10000,
  });
  const usdInr = Number(pnlSummary?.usd_inr_rate ?? 83);

  // Tab-aware P/L: positions tab shows open M2M (already INR from backend);
  // history tab sums the live floating P&L across every visible row in INR.
  const historyTotalInr = useMemo(() => {
    let sum = 0;
    for (const o of history) {
      const tok = o.token || o.instrument_token;
      const ltp = tok ? historyLtp[String(tok)] : undefined;
      const avg = Number(o.average_price ?? o.price ?? 0);
      const qty = Number(o.filled_quantity ?? o.quantity ?? 0);
      if (!ltp || !avg || !qty) continue;
      const dir = String(o.action).toUpperCase() === "BUY" ? 1 : -1;
      const isUsd = isUsdSegment(o.segment) || isUsdSegment(o.exchange);
      const fx = isUsd ? usdInr : 1;
      sum += dir * (ltp - avg) * qty * fx;
    }
    return sum;
  }, [history, historyLtp, usdInr]);

  // Active-trade totals are already INR (backend applies FX before send).
  const activeTotalInr = useMemo(() => {
    return (activeTrades ?? []).reduce((s, t: any) => s + Number(t.pnl || 0), 0);
  }, [activeTrades]);

  const tabPnL =
    tab === "positions" ? totalPnL :
    tab === "active" ? activeTotalInr :
    tab === "history" ? historyTotalInr :
    0;

  // ─── Pro-terminal close pattern ──────────────────────────────────────
  // All three close/cancel handlers below are FIRE-AND-FORGET:
  //   1. Optimistic UI update (remove the row immediately)
  //   2. Audio cue (instant feedback)
  //   3. POST in the background (no `await` — button stays responsive)
  //   4. On success → toast + invalidate caches (real fill replaces row)
  //   5. On error → rollback + error toast
  // Backend is fast; the perceived lag was the awaited promise gating the
  // click handler. Now the button releases the moment it's pressed.

  function closeActiveTrade(
    tradeId: string,
    symbol: string,
    positionId?: string,
    tradeQty?: number,
  ) {
    if (!oneClick && !confirm(`Close this ${symbol} trade at market?`)) return;
    playClosedTone();

    qc.cancelQueries({ queryKey: ["active-trades"] });
    qc.cancelQueries({ queryKey: ["positions", "open"] });

    const tradesSnapshot = qc.getQueryData<any[]>(["active-trades"]);
    const posSnapshot = qc.getQueryData<any[]>(["positions", "open"]);

    // Optimistic: drop the active-trade row.
    qc.setQueryData<any[]>(["active-trades"], (old) =>
      Array.isArray(old) ? old.filter((t) => t.id !== tradeId) : []
    );

    // Optimistic: reduce the parent position's qty by the trade's qty
    // (or remove the row entirely if this is the last open fill). Keeps
    // the Positions tab in sync with Active Trades without waiting for
    // the next poll.
    if (positionId && tradeQty && tradeQty > 0) {
      qc.setQueryData<any[]>(["positions", "open"], (old) => {
        if (!Array.isArray(old)) return [];
        return old
          .map((p) => {
            if (p.id !== positionId) return p;
            const curQty = Number(p.quantity) || 0;
            const sign = curQty >= 0 ? 1 : -1;
            const nextAbs = Math.max(0, Math.abs(curQty) - tradeQty);
            const nextQty = nextAbs * sign;
            return nextAbs < 1e-9 ? null : { ...p, quantity: nextQty };
          })
          .filter(Boolean) as any[];
      });
    }

    PositionAPI.closeActiveTrade(tradeId)
      .then(() => {
        toast.success(`Closed ${symbol}`, { duration: 1500 });
        qc.invalidateQueries({ queryKey: ["active-trades"] });
        qc.invalidateQueries({ queryKey: ["positions"] });
        qc.invalidateQueries({ queryKey: ["orders"] });
        qc.invalidateQueries({ queryKey: ["wallet"] });
      })
      .catch((e: any) => {
        if (tradesSnapshot) qc.setQueryData(["active-trades"], tradesSnapshot);
        if (posSnapshot) qc.setQueryData(["positions", "open"], posSnapshot);
        toast.error(e.message || "Close failed");
      });
  }

  function squareoff(id: string, symbol: string) {
    playClosedTone();

    // Cancel BOTH queries — closing a position kills its Active Trades
    // rows too (since they're just the BUY fills against this position).
    qc.cancelQueries({ queryKey: ["positions", "open"] });
    qc.cancelQueries({ queryKey: ["active-trades"] });

    const posSnapshot = qc.getQueryData<any[]>(["positions", "open"]);
    const tradesSnapshot = qc.getQueryData<any[]>(["active-trades"]);

    // Optimistically drop the position row…
    qc.setQueryData<any[]>(["positions", "open"], (old) =>
      Array.isArray(old) ? old.filter((p) => p.id !== id) : []
    );
    // …and every Active Trades row whose position_id matches. Without
    // this the Active Trades tab keeps showing 4 stale BUY rows for
    // ~2 s after the position has already vanished from Positions.
    qc.setQueryData<any[]>(["active-trades"], (old) =>
      Array.isArray(old) ? old.filter((t) => t.position_id !== id) : []
    );

    PositionAPI.squareoff(id)
      .then(() => {
        toast.success(`Closed ${symbol} at market`, { duration: 1500 });
        qc.invalidateQueries({ queryKey: ["positions"] });
        qc.invalidateQueries({ queryKey: ["active-trades"] });
        qc.invalidateQueries({ queryKey: ["orders"] });
        qc.invalidateQueries({ queryKey: ["wallet"] });
      })
      .catch((e: any) => {
        if (posSnapshot) qc.setQueryData(["positions", "open"], posSnapshot);
        if (tradesSnapshot) qc.setQueryData(["active-trades"], tradesSnapshot);
        qc.invalidateQueries({ queryKey: ["positions"] });
        toast.error(e.message || "Failed");
      });

    // Kick off the wallet/orders refresh in parallel.
    qc.invalidateQueries({ queryKey: ["orders"] });
    qc.invalidateQueries({ queryKey: ["wallet"] });
  }

  function cancel(id: string) {
    qc.cancelQueries({ queryKey: ["orders"] });

    // Optimistic remove the pending order row
    const snapshot = qc.getQueryData<any[]>(["orders"]);
    qc.setQueryData<any[]>(["orders"], (old) =>
      Array.isArray(old) ? old.filter((o) => o.id !== id) : []
    );

    OrderAPI.cancel(id)
      .then(() => {
        toast.success("Order cancelled", { duration: 1200 });
        qc.invalidateQueries({ queryKey: ["orders"] });
      })
      .catch((e: any) => {
        if (snapshot) qc.setQueryData(["orders"], snapshot);
        toast.error(e.message || "Failed");
      });
  }

  return (
    <div className="flex min-h-0 flex-col rounded-lg border border-border bg-card">
      {/* Tabs row */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-2">
        <div className="flex">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "relative px-3 py-2 text-xs font-medium transition-colors",
                tab === t.key ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}({t.count})
              {tab === t.key && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-t bg-primary" />}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => toggleOneClick(!oneClick)}
            title={
              oneClick
                ? "One-Click ON — close/cancel actions skip the confirm dialog"
                : "Turn on One-Click to skip the confirm dialog on close/cancel"
            }
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
              oneClick
                ? "border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400"
                : "border-border bg-muted/40 text-muted-foreground hover:text-foreground"
            )}
          >
            <Zap className={cn("size-3", oneClick && "fill-current")} />
            One Click
            <span className={cn("rounded px-1 text-[9px] tracking-wider", oneClick ? "bg-amber-500/30" : "bg-muted")}>
              {oneClick ? "ON" : "OFF"}
            </span>
          </button>
          <span className={cn("font-tabular", pnlColor(tabPnL))}>
            P/L: {tabPnL >= 0 ? "+" : ""}
            {formatINR(tabPnL)}
          </span>
        </div>
      </div>

      {/* Scrollable table area */}
      <div className="overflow-x-auto scrollbar-thin">
      {/* Header */}
      <div
        className="grid items-center gap-2 border-b border-border bg-muted/10 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground"
        style={{ gridTemplateColumns: COL_TEMPLATE, minWidth: 900 }}
      >
        <span>TIME</span>
        <span>SYM</span>
        <span>M</span>
        <span>SIDE</span>
        <span>SIZE</span>
        <span>ENTRY</span>
        <span>CURRENT</span>
        <span>S/L</span>
        <span>T/P</span>
        <span>COMM</span>
        <span className="text-right">P/L</span>
        <span className="text-right">ACTION</span>
      </div>

      {/* Body */}
      <div className="max-h-[40vh] min-h-[120px] overflow-y-auto scrollbar-thin">
        {tab === "positions" && (
          <Body
            empty="No open positions on this challenge"
            isEmpty={positions.length === 0}
            rows={positions.map((p) => (
              <PositionRow
                key={p.id}
                position={p}
                onEdit={() => setEditing(p)}
                onClose={() => squareoff(p.id, p.symbol)}
              />
            ))}
          />
        )}
        {tab === "active" && (
          <Body
            empty="No active trades"
            isEmpty={(activeTrades?.length ?? 0) === 0}
            rows={(activeTrades ?? []).map((t: any) => (
              <ActiveTradeRow
                key={t.id}
                trade={t}
                onEdit={() => setEditing({
                  // Adapt trade row → editing dialog expects position shape
                  id: t.position_id,
                  symbol: t.symbol,
                  quantity: t.action === "BUY" ? t.quantity : -t.quantity,
                  avg_price: t.price,
                  ltp: t.ltp,
                  stop_loss: t.stop_loss,
                  target: t.target,
                  segment_type: t.segment,
                  exchange: t.exchange,
                  // Override the dialog save so it routes to per-trade endpoint
                  __activeTradeId: t.id,
                })}
                onClose={() =>
                  closeActiveTrade(t.id, t.symbol, t.position_id, t.quantity)
                }
              />
            ))}
          />
        )}
        {tab === "pending" && (
          <Body
            empty="No pending orders"
            isEmpty={pendingOrders.length === 0}
            rows={pendingOrders.map((o) => (
              <Row
                key={o.id}
                cells={[
                  o.created_at ? relativeTime(o.created_at) : "—",
                  o.symbol,
                  (o.product_type || "MIS").slice(0, 1),
                  <SideBadge key="s" side={o.action} />,
                  String(o.quantity),
                  formatPrice(o.price, o.segment, o.exchange),
                  "—",
                  "—",
                  "—",
                  "—",
                  <span key="st" className="text-right text-muted-foreground">
                    {o.status}
                  </span>,
                  <RowActions
                    key="a"
                    actions={[{ label: "Cancel", icon: X, color: "destructive", onClick: () => cancel(o.id) }]}
                  />,
                ]}
              />
            ))}
          />
        )}
        {tab === "history" && (
          <Body
            empty="No history"
            isEmpty={history.length === 0}
            rows={history.map((o) => {
              const tok = o.token || o.instrument_token;
              const ltp = tok ? historyLtp[String(tok)] : undefined;
              const avg = Number(o.average_price ?? o.price ?? 0);
              const qty = Number(o.filled_quantity ?? o.quantity ?? 0);
              const direction = String(o.action).toUpperCase() === "BUY" ? 1 : -1;
              const havePnl = !!(ltp && avg && qty);
              const pnl = havePnl ? direction * (ltp - avg) * qty : 0;
              return (
                <Row
                  key={o.id}
                  cells={[
                    o.created_at ? relativeTime(o.created_at) : "—",
                    o.symbol,
                    (o.product_type || "MIS").slice(0, 1),
                    <SideBadge key="s" side={o.action} />,
                    String(o.quantity),
                    formatPrice(o.price, o.segment, o.exchange),
                    formatPrice(o.average_price ?? o.price, o.segment, o.exchange),
                    "—",
                    "—",
                    formatINR(o.brokerage ?? 0),
                    havePnl ? (
                      <HistoryPnl
                        key="pnl"
                        pnl={pnl}
                        segment={o.segment}
                        exchange={o.exchange}
                        ltp={ltp!}
                        avg={avg}
                        qty={qty}
                      />
                    ) : (
                      <span key="pnl" className="text-right text-muted-foreground">—</span>
                    ),
                    <span key="st" className="text-right text-[10px] text-muted-foreground">
                      {o.status}
                    </span>,
                  ]}
                />
              );
            })}
          />
        )}
        {tab === "cancelled" && (
          <Body
            empty="No cancelled orders"
            isEmpty={cancelled.length === 0}
            rows={cancelled.map((o) => (
              <Row
                key={o.id}
                cells={[
                  o.created_at ? relativeTime(o.created_at) : "—",
                  o.symbol,
                  (o.product_type || "MIS").slice(0, 1),
                  <SideBadge key="s" side={o.action} />,
                  String(o.quantity),
                  formatPrice(o.price, o.segment, o.exchange),
                  "—",
                  "—",
                  "—",
                  "—",
                  <span key="st" className="text-right text-muted-foreground">
                    {o.status}
                  </span>,
                  "—",
                ]}
              />
            ))}
          />
        )}
      </div>
      </div>{/* end overflow-x-auto wrapper */}

      <EditSlTpDialog
        position={editing}
        onClose={() => setEditing(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["positions"] })}
      />
    </div>
  );
}

function Body({ empty, isEmpty, rows }: { empty: string; isEmpty: boolean; rows: React.ReactNode[] }) {
  if (isEmpty) {
    return <div className="grid h-32 place-items-center text-xs text-muted-foreground">{empty}</div>;
  }
  return <div>{rows}</div>;
}

function Row({ cells }: { cells: React.ReactNode[] }) {
  return (
    <div
      className="grid items-center gap-2 border-b border-border/40 px-3 py-2 text-xs hover:bg-muted/10"
      style={{ gridTemplateColumns: COL_TEMPLATE, minWidth: 900 }}
    >
      {cells.map((c, i) => (
        <span key={i} className="truncate font-tabular">
          {c}
        </span>
      ))}
    </div>
  );
}

function PositionRow({
  position,
  onEdit,
  onClose,
}: {
  position: any;
  onEdit: () => void;
  onClose: () => void;
}) {
  const isBuy = Number(position.quantity) >= 0;
  const absQty = Math.abs(Number(position.quantity));
  const seg = position.segment_type;
  const exch = position.exchange;
  return (
    <Row
      cells={[
        position.opened_at ? relativeTime(position.opened_at) : "—",
        position.symbol,
        (position.product_type || "MIS").slice(0, 1),
        <SideBadge key="s" side={isBuy ? "BUY" : "SELL"} />,
        absQty < 1 ? absQty.toFixed(2) : String(absQty),
        formatPrice(position.avg_price, seg, exch),
        formatPrice(position.ltp, seg, exch),
        position.stop_loss ? formatPrice(position.stop_loss, seg, exch) : "—",
        position.target ? formatPrice(position.target, seg, exch) : "—",
        formatINR(position.charges ?? 0),
        <span key="pnl" className={cn("text-right font-tabular", pnlColor(position.unrealized_pnl))}>
          {formatINR(position.unrealized_pnl)}
        </span>,
        <RowActions
          key="a"
          actions={[
            { label: "Edit SL / TP", icon: Pencil, onClick: onEdit },
            { label: "Close", icon: X, color: "destructive", onClick: onClose, showLabel: true },
          ]}
        />,
      ]}
    />
  );
}

/** One row per fill that's still part of an open position. Entry price is
 *  the trade's actual fill price (NOT the position's weighted average), so
 *  the P/L shown here is what the trader sees as the gain on this specific
 *  entry. Closing this row partially closes the underlying position at the
 *  trade's lot count — server settles P&L vs avg price internally. */
function ActiveTradeRow({
  trade,
  onEdit,
  onClose,
}: {
  trade: any;
  onEdit: () => void;
  onClose: () => void;
}) {
  const seg = trade.segment;
  const exch = trade.exchange;
  const qty = Number(trade.quantity);
  const pnl = Number(trade.pnl ?? 0);
  return (
    <Row
      cells={[
        trade.executed_at ? relativeTime(trade.executed_at) : "—",
        trade.symbol,
        (trade.product_type || "MIS").slice(0, 1),
        <SideBadge key="s" side={trade.action as "BUY" | "SELL"} />,
        qty < 1 ? qty.toFixed(2) : String(qty),
        formatPrice(trade.price, seg, exch),
        formatPrice(trade.ltp, seg, exch),
        trade.stop_loss ? formatPrice(trade.stop_loss, seg, exch) : "—",
        trade.target ? formatPrice(trade.target, seg, exch) : "—",
        formatINR(trade.brokerage ?? 0),
        <span key="pnl" className={cn("text-right font-tabular", pnlColor(pnl))}>
          {pnl >= 0 ? "+" : ""}
          {formatINR(pnl)}
        </span>,
        <RowActions
          key="a"
          actions={[
            { label: "Edit SL / TP", icon: Pencil, onClick: onEdit },
            { label: "Close", icon: X, color: "destructive", onClick: onClose, showLabel: true },
          ]}
        />,
      ]}
    />
  );
}

function RowActions({
  actions,
}: {
  actions: {
    label: string;
    icon: any;
    color?: "destructive" | "default";
    onClick: () => void;
    showLabel?: boolean;
  }[];
}) {
  return (
    <span className="flex justify-end gap-1">
      {actions.map((a, i) => {
        const Icon = a.icon;
        return (
          <button
            key={i}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              a.onClick();
            }}
            title={a.label}
            aria-label={a.label}
            className={cn(
              "inline-flex h-7 items-center justify-center gap-1 rounded-md text-[11px] font-semibold transition-colors",
              a.showLabel ? "px-2.5" : "size-6",
              a.color === "destructive"
                ? "bg-destructive/15 text-destructive ring-1 ring-inset ring-destructive/30 hover:bg-destructive hover:text-destructive-foreground hover:ring-destructive"
                : "border border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <Icon className="size-3.5" />
            {a.showLabel && <span>{a.label}</span>}
          </button>
        );
      })}
    </span>
  );
}

function SideBadge({ side }: { side: "BUY" | "SELL" }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit rounded px-1.5 py-0.5 text-[10px] font-semibold",
        side === "BUY" ? "bg-buy/15 text-buy" : "bg-sell/15 text-sell"
      )}
    >
      {side}
    </span>
  );
}

/** P/L cell for the History tab — what would this trade be worth right now
 *  if the user marked-to-market against the live LTP. Coloured green when
 *  positive, red when negative. Source-currency (USD for crypto/forex/CDS,
 *  ₹ otherwise) so it lines up with the price columns in the same row. */
function HistoryPnl({
  pnl,
  segment,
  exchange,
  ltp,
  avg,
  qty,
}: {
  pnl: number;
  segment?: string;
  exchange?: string;
  ltp: number;
  avg: number;
  qty: number;
}) {
  const isProfit = pnl > 0;
  const isLoss = pnl < 0;
  const usdQuoted = /CRYPTO|FOREX|FX|CDS/i.test(`${segment ?? ""} ${exchange ?? ""}`);
  const formatted = usdQuoted
    ? `${pnl >= 0 ? "+" : "-"}$${Math.abs(pnl).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `${pnl >= 0 ? "+" : ""}${formatINR(pnl)}`;
  return (
    <span
      title={`LTP ${ltp} − Avg ${avg} × ${qty}`}
      className={cn(
        "inline-block rounded px-1.5 py-0.5 text-right font-tabular text-[11px] font-bold",
        isProfit && "bg-profit/10 text-profit",
        isLoss && "bg-loss/10 text-loss",
        !isProfit && !isLoss && "text-muted-foreground"
      )}
    >
      {formatted}
    </span>
  );
}

function EditSlTpDialog({
  position,
  onClose,
  onSaved,
}: {
  position: any | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [sl, setSl] = useState<string>("");
  const [tp, setTp] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [synced, setSynced] = useState<string | null>(null);

  // Sync once per opened position
  if (position && synced !== position.id) {
    setSl(position.stop_loss ? String(Number(position.stop_loss)) : "");
    setTp(position.target ? String(Number(position.target)) : "");
    setSynced(position.id);
  }
  if (!position && synced !== null) {
    setSl("");
    setTp("");
    setSynced(null);
  }

  async function save() {
    if (!position) return;
    setSaving(true);
    try {
      const body = {
        stop_loss: sl ? Number(sl) : null,
        target: tp ? Number(tp) : null,
      };
      // Active-trade rows tag themselves with __activeTradeId so we can route
      // through the per-trade endpoint (which still hits the parent position
      // server-side, but keeps the API surface symmetric for future per-leg
      // SL/TP support).
      if (position.__activeTradeId) {
        await PositionAPI.updateActiveTradeSlTp(position.__activeTradeId, body);
      } else {
        await PositionAPI.updateSlTp(position.id, body);
      }
      toast.success("SL / TP updated");
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={!!position}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit SL / TP — {position?.symbol}</DialogTitle>
          <DialogDescription>
            {position && (
              <>
                {Number(position.quantity) >= 0 ? "Long" : "Short"}{" "}
                {Math.abs(Number(position.quantity ?? 0))} @{" "}
                {formatPrice(position?.avg_price, position.segment_type, position.exchange)} · LTP{" "}
                {formatPrice(position?.ltp, position.segment_type, position.exchange)}
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Stop loss</Label>
            <Input
              type="number"
              step="0.01"
              value={sl}
              onChange={(e) => setSl(e.target.value)}
              placeholder="Leave blank to clear"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Target price</Label>
            <Input
              type="number"
              step="0.01"
              value={tp}
              onChange={(e) => setTp(e.target.value)}
              placeholder="Leave blank to clear"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            When LTP crosses these levels the position is auto-squared off at market.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={save} loading={saving}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
