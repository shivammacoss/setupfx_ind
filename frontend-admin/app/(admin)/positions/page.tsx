"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertOctagon, CalendarDays, Pencil, TrendingDown, TrendingUp, Trash2, X } from "lucide-react";
import { TradingAPI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusPill } from "@/components/common/StatusPill";
import { cn, formatINR, pnlColor } from "@/lib/utils";

/** USD-quoted (forex/crypto) → "$ 80,220.83". Everything else → "₹ 80,220.83". */
function fmtFeedPrice(value: string | number | null | undefined, quote?: string) {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  if (!Number.isFinite(n)) return quote === "USD" ? "$ 0.00" : "₹ 0.00";
  if (quote === "USD") {
    return `$ ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  }
  return formatINR(n);
}

/** Backend serialises naive UTC; add `Z` if missing before parsing. */
function parseDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(v);
  const d = new Date(hasTz ? v : v + "Z");
  return isNaN(d.getTime()) ? null : d;
}

function holdTime(v: string | Date | null | undefined): string {
  const d = parseDate(v);
  if (!d) return "—";
  const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ${min % 60}m`;
  const day = Math.floor(hr / 24);
  return `${day}d ${hr % 24}h`;
}

export default function AdminPositionsPage() {
  const qc = useQueryClient();
  // Single combined view — both OPEN and CLOSED rows in one list. The Status
  // column distinguishes them, and the LTP/Close column shows current LTP for
  // open positions and the actual close price for closed ones (frozen by
  // position_service on squareoff).
  const { data, isFetching } = useQuery({
    queryKey: ["admin", "positions", "ALL"],
    queryFn: () => TradingAPI.positions({ status: "ALL" }),
    refetchInterval: 5000,
  });

  // PnL summary (today / current week / last week) — auto-refreshes with the table.
  const { data: pnl } = useQuery({
    queryKey: ["admin", "positions", "pnl-summary"],
    queryFn: () => TradingAPI.pnlSummary(),
    refetchInterval: 10000,
  });

  // Last week's trades — only fetched when the user switches to that tab.
  const [tab, setTab] = useState<"live" | "lastWeek">("live");
  const { data: lastWeekTrades, isFetching: lwLoading } = useQuery({
    queryKey: ["admin", "trades", "last-week", pnl?.last_week_start, pnl?.last_week_end],
    queryFn: () =>
      TradingAPI.trades({
        from_dt: pnl.last_week_start,
        to_dt: pnl.last_week_end,
        limit: 1000,
      }),
    enabled: tab === "lastWeek" && !!pnl?.last_week_start,
  });

  async function squareoff(id: string) {
    if (!confirm("Square off this position at market?")) return;
    try {
      await TradingAPI.squareoff(id);
      toast.success("Squared off");
      qc.invalidateQueries({ queryKey: ["admin", "positions"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function remove(id: string, sym: string) {
    if (!confirm(`Permanently delete position ${sym}? This wipes the record without squaring off — use only for bad data.`)) return;
    try {
      await TradingAPI.deletePosition(id);
      toast.success("Position deleted");
      qc.invalidateQueries({ queryKey: ["admin", "positions"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function emergencyAll() {
    if (!confirm("⚠ EMERGENCY: Square off ALL open positions across the platform?")) return;
    try {
      const r = await TradingAPI.emergencySquareoffAll();
      toast.success(`Squared off ${r.placed}/${r.total} positions`);
      qc.invalidateQueries({ queryKey: ["admin", "positions"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  // ── Edit modal ────────────────────────────────────────────────────
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<{
    avg_price: string;
    quantity: string;
    opened_at: string;
    stop_loss: string;
    target: string;
  }>({ avg_price: "", quantity: "", opened_at: "", stop_loss: "", target: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) return;
    setForm({
      avg_price: String(editing.avg_price ?? ""),
      quantity: String(editing.quantity ?? ""),
      opened_at: editing.opened_at
        ? new Date(parseDate(editing.opened_at) ?? editing.opened_at).toISOString().slice(0, 16)
        : "",
      stop_loss: editing.stop_loss != null ? String(editing.stop_loss) : "",
      target: editing.target != null ? String(editing.target) : "",
    });
  }, [editing]);

  async function saveEdit() {
    if (!editing) return;
    const patch: Record<string, any> = {};
    if (form.avg_price !== "" && form.avg_price !== String(editing.avg_price))
      patch.avg_price = form.avg_price;
    if (form.quantity !== "" && Number(form.quantity) !== Number(editing.quantity))
      patch.quantity = Number(form.quantity);
    if (form.opened_at) {
      const iso = new Date(form.opened_at).toISOString();
      if (iso !== editing.opened_at) patch.opened_at = iso;
    }
    if (form.stop_loss === "") patch.stop_loss = null;
    else if (Number(form.stop_loss) !== Number(editing.stop_loss ?? 0))
      patch.stop_loss = Number(form.stop_loss);
    if (form.target === "") patch.target = null;
    else if (Number(form.target) !== Number(editing.target ?? 0))
      patch.target = Number(form.target);

    if (Object.keys(patch).length === 0) {
      toast.info("Nothing changed");
      setEditing(null);
      return;
    }
    setSaving(true);
    try {
      await TradingAPI.editPosition(editing.id, patch);
      toast.success("Position updated — user terminal will refresh live");
      qc.invalidateQueries({ queryKey: ["admin", "positions"] });
      setEditing(null);
    } catch (e: any) {
      toast.error(e.message || "Edit failed");
    } finally {
      setSaving(false);
    }
  }

  const totalPnl = (data ?? []).reduce(
    (s: number, r: any) => s + Number(r.unrealized_pnl || 0),
    0
  );

  // ── Original column set, plus a new "Hold Time" + polished action buttons ──
  const cols: Column<any>[] = [
    { key: "user_code", header: "User", render: (r) => r.user_code || r.user_id?.slice(-6) },
    { key: "symbol", header: "Symbol" },
    { key: "exchange", header: "Exch" },
    {
      key: "quantity",
      header: "Qty",
      align: "right",
      render: (r) => (
        <span className={Number(r.quantity) >= 0 ? "text-buy" : "text-sell"}>{r.quantity}</span>
      ),
    },
    {
      key: "avg_price",
      header: "Avg",
      align: "right",
      render: (r) => fmtFeedPrice(r.avg_price, r.currency_quote),
    },
    {
      // For closed positions, `ltp` was set to the actual close price by
      // position_service.apply_trade — so the same field doubles as "Close".
      // Header reflects whichever flavour the row is.
      key: "ltp",
      header: "LTP / Close",
      align: "right",
      render: (r) => (
        <span title={r.status === "CLOSED" ? "Closing price" : "Live LTP"}>
          {fmtFeedPrice(r.ltp, r.currency_quote)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} />,
    },
    {
      key: "realized_pnl",
      header: "Realized",
      align: "right",
      // Only meaningful for closed positions; for open ones the realized
      // bucket is whatever has been booked from partial closes so far.
      render: (r) => (
        <span className={pnlColor(r.realized_pnl)}>{formatINR(r.realized_pnl)}</span>
      ),
    },
    {
      key: "unrealized_pnl",
      header: "M2M",
      align: "right",
      render: (r) => (
        <span className={pnlColor(r.unrealized_pnl)}>{formatINR(r.unrealized_pnl)}</span>
      ),
    },
    { key: "margin_used", header: "Margin", align: "right", render: (r) => formatINR(r.margin_used) },
    {
      key: "hold_time",
      header: "Hold Time",
      render: (r) => <span className="whitespace-nowrap font-tabular">{holdTime(r.opened_at)}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            size="sm"
            onClick={() => setEditing(r)}
            className="h-7 gap-1 rounded-md bg-blue-600 px-2.5 text-xs font-semibold text-white hover:bg-blue-700"
          >
            <Pencil className="size-3.5" /> Edit
          </Button>
          <Button
            size="sm"
            onClick={() => squareoff(r.id)}
            className="h-7 gap-1 rounded-md bg-destructive px-2.5 text-xs font-semibold text-destructive-foreground hover:bg-destructive/90"
          >
            <X className="size-3.5" /> Close
          </Button>
          <Button
            size="sm"
            onClick={() => remove(r.id, r.symbol)}
            aria-label="Delete record"
            title="Delete record (no square-off)"
            className="size-7 rounded-md bg-destructive/15 p-0 text-destructive ring-1 ring-inset ring-destructive/30 hover:bg-destructive hover:text-destructive-foreground hover:ring-destructive"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Position Management"
        description={`${data?.length ?? 0} open · Live M2M: ${formatINR(totalPnl)}`}
        actions={
          <Button variant="destructive" onClick={emergencyAll}>
            <AlertOctagon className="size-4" /> Emergency square-off all
          </Button>
        }
      />

      {/* ── PnL summary cards ─────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <PnlCard
          label="Today's PNL"
          value={pnl?.today_pnl ?? 0}
          hint={`Realised ${formatINR(pnl?.today_realised ?? 0)} + Unrealised ${formatINR(pnl?.open_unrealised ?? 0)}`}
          icon={(pnl?.today_pnl ?? 0) >= 0 ? TrendingUp : TrendingDown}
        />
        <PnlCard
          label="This Week's PNL"
          value={pnl?.week_pnl ?? 0}
          hint="Sun → today (IST)"
          icon={(pnl?.week_pnl ?? 0) >= 0 ? TrendingUp : TrendingDown}
        />
        <PnlCard
          label="Last Week's PNL"
          value={pnl?.last_week_pnl ?? 0}
          hint="Previous Sun → Sat — realised only"
          icon={CalendarDays}
        />
      </section>

      {/* ── Tabs: Live positions | Last week trades ─────────────────── */}
      <div className="inline-flex rounded-md border border-border bg-muted/30 p-1 text-sm">
        {(["live", "lastWeek"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded px-3 py-1.5 transition-colors",
              tab === t ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t === "live" ? "Live positions" : "Last week trades"}
          </button>
        ))}
      </div>

      {tab === "live" && (
        <DataTable
          columns={cols}
          rows={data}
          keyExtractor={(r) => r.id}
          loading={isFetching && !data}
          rowClassName={(r) =>
            Number(r.unrealized_pnl) < -Number(r.margin_used) * 0.5
              ? "bg-destructive/5"
              : Number(r.unrealized_pnl) < -Number(r.margin_used) * 0.25
                ? "bg-atm/5"
                : undefined
          }
        />
      )}

      {tab === "lastWeek" && (
        <LastWeekTradesTable rows={lastWeekTrades} loading={lwLoading} />
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit position</DialogTitle>
            <DialogDescription>
              {editing
                ? `${editing.symbol} · ${editing.product_type} · qty ${editing.quantity}`
                : ""}
              <br />
              <span className="text-[11px]">User receives a live update — no refresh needed.</span>
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Entry price</Label>
              <Input
                type="number"
                step="0.05"
                value={form.avg_price}
                onChange={(e) => setForm((p) => ({ ...p, avg_price: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Quantity (signed)</Label>
              <Input
                type="number"
                step="any"
                value={form.quantity}
                onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Opened at</Label>
              <Input
                type="datetime-local"
                value={form.opened_at}
                onChange={(e) => setForm((p) => ({ ...p, opened_at: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Stop loss (blank = clear)</Label>
              <Input
                type="number"
                step="0.05"
                value={form.stop_loss}
                onChange={(e) => setForm((p) => ({ ...p, stop_loss: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Target (blank = clear)</Label>
              <Input
                type="number"
                step="0.05"
                value={form.target}
                onChange={(e) => setForm((p) => ({ ...p, target: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={saveEdit} loading={saving}>
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// PnL summary card
// ─────────────────────────────────────────────────────────────────
function PnlCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon?: any;
}) {
  const n = Number(value ?? 0);
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between pb-2">
        <CardDescription>{label}</CardDescription>
        {Icon && <Icon className={cn("size-4", pnlColor(n))} />}
      </CardHeader>
      <CardContent className="space-y-1">
        <div className={cn("font-tabular text-2xl font-semibold", pnlColor(n))}>
          {formatINR(n)}
        </div>
        {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────
// Last week trades table
// ─────────────────────────────────────────────────────────────────
function LastWeekTradesTable({ rows, loading }: { rows: any[] | undefined; loading: boolean }) {
  // Live LTP per token so we can show floating P&L per trade against the
  // current price. For trades that were the closing leg of an already-shut
  // position this is the "what would it be now" view.
  const tokens = useMemo(() => {
    const set = new Set<string>();
    for (const r of (rows ?? []) as any[]) {
      const t = r.token || r.instrument_token;
      if (t) set.add(String(t));
    }
    return Array.from(set);
  }, [rows]);

  const { data: quotes } = useQuery({
    queryKey: ["admin", "trade-quotes", tokens.sort().join(",")],
    queryFn: () => TradingAPI.orderQuotes(tokens),
    enabled: tokens.length > 0,
    refetchInterval: 8000,
    staleTime: 6000,
  });

  const ltpByToken = useMemo(() => {
    const m: Record<string, number> = {};
    for (const q of (quotes ?? []) as any[]) {
      const ltp = Number(q.ltp ?? 0);
      if (ltp > 0 && q.token) m[String(q.token)] = ltp;
    }
    return m;
  }, [quotes]);

  // USD/INR rate so per-trade P&L on USD-quoted segments (crypto / forex /
  // CDS) is shown in wallet INR — keeps this column consistent with the
  // PnL summary cards above.
  const { data: pnlSum } = useQuery({
    queryKey: ["admin", "positions", "pnl-summary"],
    queryFn: () => TradingAPI.pnlSummary(),
    refetchInterval: 10000,
  });
  const usdInr = Number(pnlSum?.usd_inr_rate ?? 83);

  function tradePnl(r: any): number | null {
    const tok = r.token || r.instrument_token;
    const ltp = tok ? ltpByToken[String(tok)] : 0;
    const price = Number(r.price ?? 0);
    const qty = Number(r.quantity ?? 0);
    if (!ltp || !price || !qty) return null;
    const dir = String(r.action).toUpperCase() === "BUY" ? 1 : -1;
    const seg = String(r.segment || "").toUpperCase();
    const exch = String(r.exchange || "").toUpperCase();
    const isUsd = /CRYPTO|FOREX|FX|CDS/.test(seg) || /CRYPTO|FOREX|FX|CDS/.test(exch);
    const fx = isUsd ? usdInr : 1;
    return dir * (ltp - price) * qty * fx;
  }

  const cols: Column<any>[] = [
    {
      key: "executed_at",
      header: "When",
      render: (r) => (
        <span className="whitespace-nowrap text-[11px]">
          {new Intl.DateTimeFormat("en-IN", {
            timeZone: "Asia/Kolkata",
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          }).format(new Date(r.executed_at))}{" "}
          IST
        </span>
      ),
    },
    {
      key: "user_code",
      header: "User",
      render: (r) => <span className="font-mono text-[11px]">{r.user_code || r.user_id?.slice(-8)}</span>,
    },
    { key: "symbol", header: "Symbol", render: (r) => <span className="font-medium">{r.symbol}</span> },
    { key: "exchange", header: "Exch" },
    {
      key: "action",
      header: "Side",
      render: (r) => <StatusPill status={r.action} />,
    },
    { key: "quantity", header: "Qty", align: "right", render: (r) => Number(r.quantity).toFixed(Number(r.quantity) < 1 ? 4 : 0) },
    { key: "price", header: "Open", align: "right", render: (r) => formatINR(r.price) },
    {
      key: "close_price",
      header: "Close / LTP",
      align: "right",
      render: (r) => {
        const tok = r.token || r.instrument_token;
        const ltp = tok ? ltpByToken[String(tok)] : 0;
        if (!ltp) return <span className="text-muted-foreground">—</span>;
        return <span className="font-tabular">{formatINR(ltp)}</span>;
      },
    },
    { key: "value", header: "Value", align: "right", render: (r) => formatINR(r.value) },
    {
      key: "pnl",
      header: "P&L",
      align: "right",
      render: (r) => {
        const p = tradePnl(r);
        if (p === null) return <span className="text-muted-foreground">—</span>;
        return (
          <span className={cn("font-tabular font-semibold", pnlColor(p))} title="Floating P&L vs current LTP">
            {p >= 0 ? "+" : ""}
            {formatINR(p)}
          </span>
        );
      },
    },
    {
      key: "total_charges",
      header: "Brokerage",
      align: "right",
      // Brokerage is the only charge on this platform — no statutory
      // pass-through (STT / exchange / SEBI / stamp / DP / GST).
      render: (r) => (
        <span title="Platform brokerage. No statutory charges are passed through.">
          {formatINR(r.total_charges)}
        </span>
      ),
    },
  ];
  const totalValue = (rows ?? []).reduce((s, r) => s + Number(r.value || 0), 0);
  const totalCharges = (rows ?? []).reduce((s, r) => s + Number(r.total_charges || 0), 0);
  const totalPnl = (rows ?? []).reduce((s, r) => {
    const p = tradePnl(r);
    return s + (p ?? 0);
  }, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{rows?.length ?? 0} trades · Sun → Sat (previous week, IST)</span>
        <span className="flex flex-wrap gap-x-3">
          <span>
            Value <span className="font-tabular text-foreground">{formatINR(totalValue)}</span>
          </span>
          <span>
            Charges <span className="font-tabular text-foreground">{formatINR(totalCharges)}</span>
          </span>
          <span>
            Total P&L <span className={cn("font-tabular", pnlColor(totalPnl))}>
              {totalPnl >= 0 ? "+" : ""}{formatINR(totalPnl)}
            </span>
          </span>
        </span>
      </div>
      <DataTable columns={cols} rows={rows} keyExtractor={(r) => r.id} loading={loading && !rows} />
    </div>
  );
}
