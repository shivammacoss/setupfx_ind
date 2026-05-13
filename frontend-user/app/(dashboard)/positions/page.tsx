"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, LogOut, X } from "lucide-react";
import { PositionAPI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable, type Column } from "@/components/common/DataTable";
import { cn, formatINR, formatPrice, pnlColor } from "@/lib/utils";

type TabKey = "closed" | "position" | "active";

/** USD-quoted (forex/crypto) → "$ 80,218.50". Everything else → "₹ ...".
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

// Compact pill that translates Position.close_reason into a human label
// with a tone-matching color. Same legal set as
// setupfx-ind_web/backend/app/models/position.py:close_reason.
const CLOSE_REASON_META: Record<
  string,
  { label: string; cls: string }
> = {
  USER: { label: "User", cls: "bg-blue-500/10 text-blue-400 ring-blue-500/30" },
  SL_HIT: {
    label: "Stop Loss",
    cls: "bg-sell/10 text-sell ring-sell/30",
  },
  TP_HIT: { label: "Target", cls: "bg-buy/10 text-buy ring-buy/30" },
  STOP_OUT: {
    label: "Stop-out",
    cls: "bg-amber-500/10 text-amber-400 ring-amber-500/30",
  },
  AUTO: {
    label: "Auto",
    cls: "bg-muted/40 text-muted-foreground ring-border",
  },
};

function CloseReasonChip({ reason }: { reason?: string | null }) {
  if (!reason)
    return <span className="text-muted-foreground/60 text-xs">—</span>;
  const meta = CLOSE_REASON_META[reason] ?? {
    label: reason,
    cls: "bg-muted/40 text-muted-foreground ring-border",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset",
        meta.cls,
      )}
    >
      {meta.label}
    </span>
  );
}

export default function PositionsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>("position");
  const [editing, setEditing] = useState<{ row: any; kind: "TP" | "SL" } | null>(null);

  // ── Data ────────────────────────────────────────────────────────────
  // Open positions are always fetched so the tab badge stays current and
  // the Active-tab margin breakdown has fresh used_margin to sum.
  const { data: open, isFetching: openLoading } = useQuery<any[]>({
    queryKey: ["positions", "open"],
    queryFn: () => PositionAPI.open(),
    refetchInterval: 3000,
  });
  const { data: closed, isFetching: closedLoading } = useQuery<any[]>({
    queryKey: ["positions", "closed"],
    queryFn: () => PositionAPI.closed(),
    refetchInterval: 10000,
    enabled: tab === "closed",
  });
  const { data: activeTrades, isFetching: activeLoading } = useQuery<any[]>({
    queryKey: ["positions", "active-trades"],
    queryFn: () => PositionAPI.activeTrades(),
    refetchInterval: 3000,
    enabled: tab === "active",
  });
  const { data: pnlSummary } = useQuery<any>({
    queryKey: ["positions", "pnl-summary"],
    queryFn: () => PositionAPI.pnlSummary(),
    refetchInterval: 5000,
    enabled: tab === "active",
  });

  // ── Counts ──────────────────────────────────────────────────────────
  const counts = {
    closed: closed?.length ?? 0,
    position: open?.length ?? 0,
    active: activeTrades?.length ?? 0,
  };

  // ── Header description: M2M + Realized snapshot ─────────────────────
  const totalMtm = (open ?? []).reduce(
    (s: number, p: any) => s + Number(p.unrealized_pnl || 0),
    0,
  );
  const totalRealized = (open ?? []).reduce(
    (s: number, p: any) => s + Number(p.realized_pnl || 0),
    0,
  );

  // ── Active-tab MARGIN STATUS breakdown ──────────────────────────────
  // Required Margin = additional margin needed for CARRY-FORWARD. Only
  // Indian segments (NSE / BSE / MCX cash + F&O) have a separate
  // intraday vs overnight margin; Infoway-fed instruments (Forex,
  // Crypto, Stocks, Indices, Commodities) trade in carry-forward mode
  // by default — their `margin_used` IS already the carry margin, so
  // counting them here would double-count what the wallet already
  // shows under "Used Margin". The 1 % buffer protects the trader
  // against a small adverse tick on the Indian side.
  const isInfowayPosition = (p: any): boolean => {
    const seg = (p?.segment_type ?? "").toUpperCase();
    const exch = (p?.exchange ?? "").toUpperCase();
    return (
      /CRYPTO|FOREX|FX|CDS|STOCKS|INDICES|COMMODITIES/.test(seg) ||
      exch === "CDS" ||
      exch === "CRYPTO"
    );
  };
  const requiredMargin = useMemo(
    () =>
      (open ?? [])
        .filter((p: any) => !isInfowayPosition(p))
        .reduce((s, p) => s + Number(p.margin_used ?? 0), 0),
    [open],
  );
  // M2M = floating (unrealised) P&L across all open positions. Was
  // previously `ledger + openUnrealised` which is the EQUITY number —
  // misleading in a panel labelled M2M (mark-to-market) since users
  // expect this to be a small number tracking the open positions'
  // gain/loss, not their full account value (₹1.64 crore for a
  // ₹1k loss is obviously wrong).
  const m2m = Number(pnlSummary?.open_unrealised ?? 0);
  const safeBuffer = +(requiredMargin * 0.01).toFixed(2);
  const totalNeeded = requiredMargin + safeBuffer;

  // ── Actions ─────────────────────────────────────────────────────────
  async function squareoff(id: string) {
    if (!confirm("Square off this position at market?")) return;
    try {
      await PositionAPI.squareoff(id);
      toast.success("Submitted");
      qc.invalidateQueries({ queryKey: ["positions"] });
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    }
  }
  async function squareoffAll() {
    if (!open?.length) return;
    if (!confirm("Square off ALL open positions?")) return;
    try {
      const r = await PositionAPI.squareoffAll();
      toast.success(`Squared off ${r?.squared_off ?? 0}/${r?.total ?? 0}`);
      qc.invalidateQueries({ queryKey: ["positions"] });
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    }
  }
  async function exitActive(id: string) {
    try {
      await PositionAPI.closeActiveTrade(id);
      toast.success("Exit placed");
      qc.invalidateQueries({ queryKey: ["positions"] });
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    }
  }

  // ── Columns per tab ─────────────────────────────────────────────────
  const positionCols: Column<any>[] = [
    { key: "symbol", header: "Symbol" },
    { key: "exchange", header: "Exch" },
    {
      key: "quantity",
      header: "Qty",
      align: "right",
      render: (r) => (
        <span className={r.quantity >= 0 ? "text-buy" : "text-sell"}>
          {r.quantity}
        </span>
      ),
    },
    {
      key: "avg_price",
      header: "Avg",
      align: "right",
      render: (r) =>
        fmtFeedPrice(r.avg_price, r.currency_quote, r.segment_type, r.exchange),
    },
    {
      key: "ltp",
      header: "LTP",
      align: "right",
      render: (r) =>
        fmtFeedPrice(r.ltp, r.currency_quote, r.segment_type, r.exchange),
    },
    {
      key: "unrealized_pnl",
      header: "M2M",
      align: "right",
      render: (r) => (
        <span className={pnlColor(r.unrealized_pnl)}>
          {formatINR(r.unrealized_pnl)}
        </span>
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

  // Closed-tab columns: realized P&L is the headline number, no live LTP
  // because the position is fully exited. Stays in the same table shape
  // so the user's eye doesn't have to relearn the column layout when
  // switching tabs.
  const closedCols: Column<any>[] = [
    { key: "symbol", header: "Symbol" },
    { key: "exchange", header: "Exch" },
    {
      key: "quantity",
      header: "Qty",
      align: "right",
      render: (r) => (
        <span className={r.quantity >= 0 ? "text-buy" : "text-sell"}>
          {r.quantity}
        </span>
      ),
    },
    {
      key: "avg_price",
      header: "Avg",
      align: "right",
      render: (r) =>
        fmtFeedPrice(r.avg_price, r.currency_quote, r.segment_type, r.exchange),
    },
    {
      key: "ltp",
      header: "Close",
      align: "right",
      render: (r) =>
        fmtFeedPrice(r.ltp, r.currency_quote, r.segment_type, r.exchange),
    },
    {
      key: "realized_pnl",
      header: "Realized P&L",
      align: "right",
      render: (r) => (
        <span className={pnlColor(r.realized_pnl)}>
          {formatINR(r.realized_pnl)}
        </span>
      ),
    },
    {
      // Compact tag stamped by the squareoff path. Lets the user see at a
      // glance that a position was closed by their bracket SL/TP while
      // they were away — not by a forgotten manual close.
      key: "close_reason",
      header: "Closed By",
      render: (r) => <CloseReasonChip reason={r.close_reason} />,
    },
  ];

  // Active-trades-tab columns: one row per fill that's still part of an
  // open position. Adds Used Margin / Holding Margin (1.4× for MIS, same
  // for NRML), inline TP / SL edit buttons and a per-fill Exit action.
  const activeCols: Column<any>[] = [
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
        const used = Number(r.margin ?? r.used_margin ?? r.margin_used ?? 0);
        const isMIS = String(r.product_type ?? "").toUpperCase() === "MIS";
        const holding = isMIS ? +(used * 1.4).toFixed(2) : used;
        return formatINR(holding);
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
        <button
          type="button"
          onClick={() => setEditing({ row: r, kind: "TP" })}
          className="rounded border border-border px-1.5 py-0.5 text-[11px] font-semibold hover:bg-muted/40"
        >
          {r.target ? Number(r.target).toFixed(2) : "Add +"}
        </button>
      ),
    },
    {
      key: "sl",
      header: "SL",
      align: "right",
      render: (r) => (
        <button
          type="button"
          onClick={() => setEditing({ row: r, kind: "SL" })}
          className="rounded border border-border px-1.5 py-0.5 text-[11px] font-semibold hover:bg-muted/40"
        >
          {r.stop_loss ? Number(r.stop_loss).toFixed(2) : "Add +"}
        </button>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <Button
          size="sm"
          onClick={() => exitActive(r.id)}
          className="h-7 gap-1 rounded-md bg-destructive/15 px-2.5 text-xs font-semibold text-destructive ring-1 ring-inset ring-destructive/30 hover:bg-destructive hover:text-destructive-foreground hover:ring-destructive"
        >
          <LogOut className="size-3.5" /> Exit
        </Button>
      ),
    },
  ];

  // Pick what to render based on the selected tab.
  const tableProps =
    tab === "closed"
      ? { columns: closedCols, rows: closed, loading: closedLoading && !closed }
      : tab === "active"
        ? {
            columns: activeCols,
            rows: activeTrades,
            loading: activeLoading && !activeTrades,
          }
        : { columns: positionCols, rows: open, loading: openLoading && !open };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Positions"
        description={`${counts.position} open · M2M: ${formatINR(totalMtm)} · Realized: ${formatINR(totalRealized)}`}
        actions={
          <Button
            variant="destructive"
            disabled={!open?.length}
            onClick={squareoffAll}
          >
            Square off all
          </Button>
        }
      />

      {/* Three-tab strip. Inline above the table — keeps the existing
          PageHeader layout intact, just lets the user switch the data
          view between aggregated Position rows, per-fill Active trades,
          and (last) today's Closed positions. */}
      <div className="flex items-center gap-6 border-b border-border">
        <TabBtn
          active={tab === "position"}
          count={counts.position}
          onClick={() => setTab("position")}
        >
          Position
        </TabBtn>
        <TabBtn active={tab === "active"} count={counts.active} onClick={() => setTab("active")}>
          Active
        </TabBtn>
        <TabBtn active={tab === "closed"} count={counts.closed} onClick={() => setTab("closed")}>
          Closed
        </TabBtn>
      </div>

      {/* MARGIN STATUS — Active tab only. Mirrors the breakdown the user's
          reference design shows: required margin, current M2M, a 1 %
          safety buffer, and the total needed-to-hold figure. */}
      {tab === "active" && (
        <MarginStatusCard
          required={requiredMargin}
          m2m={m2m}
          buffer={safeBuffer}
          total={totalNeeded}
        />
      )}

      <DataTable
        columns={tableProps.columns}
        rows={tableProps.rows}
        keyExtractor={(r) => r.id}
        loading={tableProps.loading}
      />

      <EditSlTpDialog
        open={!!editing}
        kind={editing?.kind ?? "TP"}
        row={editing?.row}
        onClose={() => setEditing(null)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["positions"] });
          setEditing(null);
        }}
      />
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────

function TabBtn({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative -mb-px flex items-center gap-1.5 pb-2 pt-1 text-sm transition-colors",
        active
          ? "font-semibold text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
      {count > 0 && (
        <span
          className={cn(
            "rounded-full border px-1.5 text-[10px] font-semibold",
            active
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border text-muted-foreground",
          )}
        >
          {count}
        </span>
      )}
      {active && (
        <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-t bg-primary" />
      )}
    </button>
  );
}

function MarginStatusCard({
  required,
  m2m,
  buffer,
  total,
}: {
  required: number;
  m2m: number;
  buffer: number;
  total: number;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left"
      >
        <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Margin Status
        </span>
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
          Breakdown
          {open ? (
            <ChevronUp className="size-3.5" />
          ) : (
            <ChevronDown className="size-3.5" />
          )}
        </span>
      </button>
      {open && (
        <div className="border-t border-border px-4 py-3">
          <Row label="Required Margin" value={formatINR(required)} />
          <Row label="M2M" value={formatINR(m2m)} />
          <div className="my-2 h-px bg-border" />
          <Row label="Safe Buffer (1%)" value={formatINR(buffer)} />
          <div className="mt-3 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-primary">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Total Needed</span>
              <span className="font-tabular text-sm font-bold tabular-nums">
                {formatINR(total)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-tabular font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function EditSlTpDialog({
  open,
  kind,
  row,
  onClose,
  onSaved,
}: {
  open: boolean;
  kind: "TP" | "SL";
  row: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initial =
    kind === "TP"
      ? row?.target != null
        ? String(Number(row.target))
        : ""
      : row?.stop_loss != null
        ? String(Number(row.stop_loss))
        : "";
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);

  // Reset value when dialog opens for a different row/kind.
  useMemo(() => {
    setValue(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.id, kind]);

  async function save() {
    if (!row) return;
    const n = value === "" ? null : Number(value);
    if (n !== null && !Number.isFinite(n)) {
      toast.error("Enter a valid number");
      return;
    }
    // Directional sanity — mirrors backend SL_WRONG_SIDE / TP_WRONG_SIDE
    // so the user catches a wrong-side bracket here instead of via a
    // server-rejection toast after the dialog has already closed.
    if (n !== null && n > 0 && row.price != null) {
      const entry = Number(row.price);
      const isLong = String(row.action ?? row.side).toUpperCase() === "BUY";
      if (kind === "SL") {
        if (isLong && n >= entry) {
          toast.error(`Stop loss must be BELOW entry ${entry} for a BUY`);
          return;
        }
        if (!isLong && n <= entry) {
          toast.error(`Stop loss must be ABOVE entry ${entry} for a SELL`);
          return;
        }
      } else {
        if (isLong && n <= entry) {
          toast.error(`Target must be ABOVE entry ${entry} for a BUY`);
          return;
        }
        if (!isLong && n >= entry) {
          toast.error(`Target must be BELOW entry ${entry} for a SELL`);
          return;
        }
      }
    }
    setSaving(true);
    try {
      const body =
        kind === "TP" ? { target: n as any } : { stop_loss: n as any };
      await PositionAPI.updateActiveTradeSlTp(row.id, body);
      toast.success(`${kind === "TP" ? "Target" : "Stop loss"} updated`);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {kind === "TP" ? "Take Profit" : "Stop Loss"} — {row?.symbol ?? ""}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            type="number"
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Leave blank to clear"
            autoFocus
          />
          <p className="text-[11px] text-muted-foreground">
            When the market crosses this level the position is auto-squared off at market.
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
