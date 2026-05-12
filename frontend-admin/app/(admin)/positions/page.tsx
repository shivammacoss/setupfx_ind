"use client";

import { useEffect, useState } from "react";
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
  const [tab, setTab] = useState<"open" | "closed">("open");

  const { data: openRows, isFetching: openLoading } = useQuery({
    queryKey: ["admin", "positions", "OPEN"],
    queryFn: () => TradingAPI.positions({ status: "OPEN" }),
    refetchInterval: 5000,
  });

  const { data: closedRows, isFetching: closedLoading } = useQuery({
    queryKey: ["admin", "positions", "CLOSED"],
    queryFn: () => TradingAPI.positions({ status: "CLOSED" }),
    refetchInterval: 10000,
    enabled: tab === "closed",
  });

  const data = tab === "open" ? openRows : closedRows;
  const isFetching = tab === "open" ? openLoading : closedLoading;

  // PnL summary (today / current week / last week) — auto-refreshes with the table.
  const { data: pnl } = useQuery({
    queryKey: ["admin", "positions", "pnl-summary"],
    queryFn: () => TradingAPI.pnlSummary(),
    refetchInterval: 10000,
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

  const totalPnl = (openRows ?? []).reduce(
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
          {r.status === "OPEN" && (
            <>
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
            </>
          )}
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
        description={`${openRows?.length ?? 0} open · Live M2M: ${formatINR(totalPnl)}`}
        actions={
          <Button variant="destructive" onClick={emergencyAll}>
            <AlertOctagon className="size-4" /> Emergency square-off all
          </Button>
        }
      />

      {/* ── PnL summary cards ─────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <PnlCard
          label="Open PNL"
          value={pnl?.open_unrealised ?? 0}
          hint="Unrealised M2M on currently open positions"
          icon={(pnl?.open_unrealised ?? 0) >= 0 ? TrendingUp : TrendingDown}
        />
        <PnlCard
          label="This Week's Closed PNL"
          value={pnl?.week_realised ?? 0}
          hint="Sun → today (IST) — realised only"
          icon={(pnl?.week_realised ?? 0) >= 0 ? TrendingUp : TrendingDown}
        />
        <PnlCard
          label="Last Week's Closed PNL"
          value={pnl?.last_week_pnl ?? 0}
          hint="Previous Sun → Sat — realised only"
          icon={CalendarDays}
        />
      </section>

      {/* ── Tabs: Open Trades | Closed Trades ───────────────────────── */}
      <div className="inline-flex rounded-md border border-border bg-muted/30 p-1 text-sm">
        {(["open", "closed"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded px-3 py-1.5 transition-colors",
              tab === t ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t === "open" ? "Open Trades" : "Closed Trades"}
          </button>
        ))}
      </div>

      <DataTable
        columns={cols}
        rows={data}
        keyExtractor={(r) => r.id}
        loading={isFetching && !data}
        rowClassName={(r) =>
          tab === "open" && Number(r.unrealized_pnl) < -Number(r.margin_used) * 0.5
            ? "bg-destructive/5"
            : tab === "open" && Number(r.unrealized_pnl) < -Number(r.margin_used) * 0.25
              ? "bg-atm/5"
              : undefined
        }
      />

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

