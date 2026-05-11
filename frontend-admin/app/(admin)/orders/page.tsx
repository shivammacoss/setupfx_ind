"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { XCircle } from "lucide-react";
import { TradingAPI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusPill } from "@/components/common/StatusPill";
import { formatINR, cn } from "@/lib/utils";

type Tab = "orders" | "executions";

export default function AdminOrdersPage() {
  const [tab, setTab] = useState<Tab>("orders");

  return (
    <div className="space-y-4">
      <PageHeader
        title="Orders monitor"
        description={
          tab === "orders"
            ? "User-placed orders — current status, side, type, quantity, fills."
            : "Trade executions — actual fills against orders, with charges."
        }
      />

      <div className="inline-flex rounded-md border border-border bg-muted/30 p-1 text-sm">
        {(["orders", "executions"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded px-3 py-1.5 capitalize transition-colors",
              tab === t ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t === "orders" ? "Orders" : "Executions"}
          </button>
        ))}
      </div>

      {tab === "orders" ? <OrdersTable /> : <TradesTable />}
    </div>
  );
}

function OrdersTable() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const { data, isFetching } = useQuery({
    queryKey: ["admin", "orders", { status, page }],
    queryFn: () => TradingAPI.orders({ status: status || undefined, page, page_size: 50 }),
    refetchInterval: 5000,
  });

  // Live LTP per token for the P&L column. Uses the admin-only batch
  // quote endpoint; refreshes every 5s alongside the orders list.
  const orderTokens = useMemo(() => {
    const set = new Set<string>();
    for (const o of (data?.items ?? []) as any[]) {
      const tok = o.token || o.instrument_token;
      if (tok) set.add(String(tok));
    }
    return Array.from(set);
  }, [data]);

  const { data: quotes } = useQuery({
    queryKey: ["admin", "order-quotes", orderTokens.sort().join(",")],
    queryFn: () => TradingAPI.orderQuotes(orderTokens),
    enabled: orderTokens.length > 0,
    refetchInterval: 5000,
    staleTime: 4000,
  });

  const ltpByToken = useMemo(() => {
    const m: Record<string, number> = {};
    for (const q of (quotes ?? []) as any[]) {
      const ltp = Number(q.ltp ?? 0);
      if (ltp > 0 && q.token) m[String(q.token)] = ltp;
    }
    return m;
  }, [quotes]);

  // Live USD/INR rate for converting per-order P&L on USD-quoted instruments
  // (crypto / forex). Same source as the Positions cards.
  const { data: pnl } = useQuery({
    queryKey: ["admin", "positions", "pnl-summary"],
    queryFn: () => TradingAPI.pnlSummary(),
    refetchInterval: 10000,
  });
  const usdInr = Number(pnl?.usd_inr_rate ?? 83);

  async function cancelOrder(id: string) {
    if (!confirm("Force-cancel this order?")) return;
    try {
      await TradingAPI.forceCancel(id);
      toast.success("Cancelled");
      qc.invalidateQueries({ queryKey: ["admin", "orders"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  const cols: Column<any>[] = [
    { key: "order_number", header: "Order #", render: (r) => <span className="font-mono text-[11px]">{r.order_number}</span> },
    { key: "user_code", header: "User", render: (r) => r.user_code || r.user_id.slice(-6) },
    { key: "symbol", header: "Symbol" },
    { key: "exchange", header: "Exch" },
    { key: "action", header: "Side", render: (r) => <StatusPill status={r.action} /> },
    { key: "order_type", header: "Type", render: (r) => <StatusPill status={r.order_type} /> },
    { key: "lots", header: "Lots", align: "right" },
    {
      // Entry fill price — what this order actually executed at.
      key: "average_price",
      header: "Open",
      align: "right",
      render: (r) => formatINR(r.average_price),
    },
    {
      // Current LTP for the instrument — for already-closed positions this is
      // effectively the close price (position_service freezes ltp at close).
      // For still-open exposure, it's the live mark.
      key: "close_price",
      header: "Close / LTP",
      align: "right",
      render: (r) => {
        if (!["EXECUTED", "PARTIAL"].includes(r.status)) {
          return <span className="text-muted-foreground">—</span>;
        }
        const tok = r.token || r.instrument_token;
        const ltp = tok ? ltpByToken[String(tok)] : undefined;
        if (!ltp) return <span className="text-muted-foreground">—</span>;
        return <span className="font-tabular">{formatINR(ltp)}</span>;
      },
    },
    {
      key: "pnl",
      header: "P&L",
      align: "right",
      render: (r) => {
        if (!["EXECUTED", "PARTIAL"].includes(r.status)) {
          return <span className="text-muted-foreground">—</span>;
        }
        const tok = r.token || r.instrument_token;
        const ltp = tok ? ltpByToken[String(tok)] : undefined;
        const avg = Number(r.average_price ?? 0);
        const qty = Number(r.filled_quantity ?? r.quantity ?? 0);
        if (!ltp || !avg || !qty) return <span className="text-muted-foreground">—</span>;
        const direction = String(r.action).toUpperCase() === "BUY" ? 1 : -1;
        // (LTP - avg) is in NATIVE currency. For USD-quoted segments
        // (CRYPTO / FOREX / CDS), convert to INR so this column matches
        // the Positions PnL cards.
        const seg = String(r.segment || "").toUpperCase();
        const exch = String(r.exchange || "").toUpperCase();
        const isUsd = /CRYPTO|FOREX|FX|CDS/.test(seg) || /CRYPTO|FOREX|FX|CDS/.test(exch);
        const fx = isUsd ? usdInr : 1;
        const pnl = direction * (ltp - avg) * qty * fx;
        return <PnlCell value={pnl} title={isUsd ? `LTP ${ltp} − Avg ${avg} × ${qty} × USD/INR ${usdInr}` : `LTP ${ltp} − Avg ${avg} × ${qty}`} />;
      },
    },
    { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} /> },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) =>
        ["OPEN", "PENDING", "PARTIAL"].includes(r.status) ? (
          <Button variant="ghost" size="icon" onClick={() => cancelOrder(r.id)} aria-label="Cancel">
            <XCircle className="size-4 text-destructive" />
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">{data?.meta?.total ?? 0} orders</div>
        <select
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm"
        >
          <option value="">All statuses</option>
          <option value="OPEN">Open</option>
          <option value="EXECUTED">Executed</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="REJECTED">Rejected</option>
        </select>
      </div>
      <DataTable columns={cols} rows={data?.items} keyExtractor={(r) => r.id} loading={isFetching && !data} />
      {(data?.meta?.total_pages ?? 1) > 1 && (
        <div className="flex justify-end gap-2 text-xs">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Prev
          </Button>
          <span className="self-center text-muted-foreground">
            {page} / {data?.meta?.total_pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= (data?.meta?.total_pages ?? 1)}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

function TradesTable() {
  const { data, isFetching } = useQuery({
    queryKey: ["admin", "trades"],
    queryFn: () => TradingAPI.trades({ limit: 200 }),
    refetchInterval: 5000,
  });

  // Same live-LTP overlay pattern as the Orders tab — gives admins a "what
  // would this fill be worth right now" P&L next to each execution.
  const tradeTokens = useMemo(() => {
    const set = new Set<string>();
    for (const t of (data ?? []) as any[]) {
      const tok = t.instrument_token || t.token;
      if (tok) set.add(String(tok));
    }
    return Array.from(set);
  }, [data]);

  const { data: quotes } = useQuery({
    queryKey: ["admin", "trade-quotes", tradeTokens.sort().join(",")],
    queryFn: () => TradingAPI.orderQuotes(tradeTokens),
    enabled: tradeTokens.length > 0,
    refetchInterval: 5000,
    staleTime: 4000,
  });

  const ltpByToken = useMemo(() => {
    const m: Record<string, number> = {};
    for (const q of (quotes ?? []) as any[]) {
      const ltp = Number(q.ltp ?? 0);
      if (ltp > 0 && q.token) m[String(q.token)] = ltp;
    }
    return m;
  }, [quotes]);

  const { data: pnlSum } = useQuery({
    queryKey: ["admin", "positions", "pnl-summary"],
    queryFn: () => TradingAPI.pnlSummary(),
    refetchInterval: 10000,
  });
  const usdInr = Number(pnlSum?.usd_inr_rate ?? 83);

  const cols: Column<any>[] = [
    { key: "trade_number", header: "Trade #", render: (r) => <span className="font-mono text-[11px]">{r.trade_number}</span> },
    { key: "order_number", header: "Order #", render: (r) => <span className="font-mono text-[11px] text-muted-foreground">{r.order_number || "—"}</span> },
    { key: "user_code", header: "User" },
    { key: "symbol", header: "Symbol" },
    { key: "action", header: "Side", render: (r) => <StatusPill status={r.action} /> },
    { key: "quantity", header: "Qty", align: "right" },
    { key: "price", header: "Open", align: "right", render: (r) => formatINR(r.price) },
    {
      key: "close_price",
      header: "Close / LTP",
      align: "right",
      render: (r) => {
        const tok = r.instrument_token || r.token;
        const ltp = tok ? ltpByToken[String(tok)] : undefined;
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
        const tok = r.instrument_token || r.token;
        const ltp = tok ? ltpByToken[String(tok)] : undefined;
        const tradePrice = Number(r.price ?? 0);
        const qty = Number(r.quantity ?? 0);
        if (!ltp || !tradePrice || !qty) {
          return <span className="text-muted-foreground">—</span>;
        }
        const direction = String(r.action).toUpperCase() === "BUY" ? 1 : -1;
        const seg = String(r.segment || "").toUpperCase();
        const exch = String(r.exchange || "").toUpperCase();
        const isUsd = /CRYPTO|FOREX|FX|CDS/.test(seg) || /CRYPTO|FOREX|FX|CDS/.test(exch);
        const fx = isUsd ? usdInr : 1;
        const pnl = direction * (ltp - tradePrice) * qty * fx;
        return <PnlCell value={pnl} title={isUsd ? `LTP ${ltp} − Fill ${tradePrice} × ${qty} × USD/INR ${usdInr}` : `LTP ${ltp} − Fill ${tradePrice} × ${qty}`} />;
      },
    },
    {
      key: "total_charges",
      header: "Brokerage",
      align: "right",
      // The only charge on this platform — configured under Admin → Brokerage
      // (per-segment rate) and Admin → Segment Settings (commission_type +
      // commission_value override). No statutory pass-through.
      render: (r) => (
        <span title="Platform brokerage only. Configured under Admin → Brokerage and Segment Settings. No statutory charges are passed through.">
          {formatINR(r.total_charges)}
        </span>
      ),
    },
    { key: "executed_at", header: "When", render: (r) => new Date(r.executed_at).toLocaleString() },
  ];

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">{data?.length ?? 0} executions</div>
      <DataTable columns={cols} rows={data} keyExtractor={(r) => r.id} loading={isFetching && !data} />
    </div>
  );
}

/** Shared red/green P&L cell with a subtle background tint so the colour
 *  reads at a glance even on dense tables. */
function PnlCell({ value, title }: { value: number; title?: string }) {
  const isProfit = value > 0;
  const isLoss = value < 0;
  return (
    <span
      title={title}
      className={cn(
        "inline-block rounded px-1.5 py-0.5 font-tabular font-bold tabular-nums",
        isProfit && "bg-profit/10 text-profit",
        isLoss && "bg-loss/10 text-loss",
        !isProfit && !isLoss && "text-muted-foreground"
      )}
    >
      {isProfit ? "+" : ""}
      {formatINR(value)}
    </span>
  );
}
