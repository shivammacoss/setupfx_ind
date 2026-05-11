"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { XCircle } from "lucide-react";
import { InstrumentAPI, OrderAPI, PositionAPI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable, type Column } from "@/components/common/DataTable";
import { PnlSummaryCards } from "@/components/common/PnlSummaryCards";
import { StatusPill } from "@/components/common/StatusPill";
import { cn, formatINR, formatIST, formatPrice, isUsdSegment, pnlColor } from "@/lib/utils";

export default function MyOrdersPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<string>("");
  const { data, isFetching } = useQuery({
    queryKey: ["orders", tab],
    queryFn: () => OrderAPI.list(tab || undefined),
    refetchInterval: 4000,
  });

  // Pull live open positions for symbols that still have one — those carry
  // a fresh LTP from the position service.
  const { data: openPos } = useQuery({
    queryKey: ["positions", "open"],
    queryFn: () => PositionAPI.open(),
    refetchInterval: 4000,
  });

  // PnL summary also exposes the live USD/INR rate — needed to convert
  // per-order P&L for crypto/forex (which are USD-quoted) into wallet INR.
  const { data: pnlSummary } = useQuery({
    queryKey: ["positions", "pnl-summary"],
    queryFn: () => PositionAPI.pnlSummary(),
    refetchInterval: 10000,
  });
  const usdInr = Number(pnlSummary?.usd_inr_rate ?? 83);

  // For symbols that DON'T have an open position right now (closed trades),
  // we still want a live LTP so the P&L column doesn't go to "—". Collect
  // every unique instrument token from the orders list and batch-fetch quotes.
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

  // Two LTP maps: one keyed by instrument token (returned by quotesBatch)
  // and one by symbol (open positions only). Token is the most reliable
  // join because every order carries its instrument token.
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
    { key: "order_number", header: "Order #", render: (r) => <span className="font-mono text-[11px]">{r.order_number}</span> },
    { key: "symbol", header: "Symbol" },
    { key: "exchange", header: "Exch" },
    { key: "action", header: "Side", render: (r) => <StatusPill status={r.action} /> },
    { key: "order_type", header: "Type", render: (r) => <StatusPill status={r.order_type} /> },
    { key: "lots", header: "Lots", align: "right" },
    {
      // Entry fill price — what this order actually executed at.
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
      // Live LTP — for already-closed positions this is effectively the close
      // price (position_service freezes ltp on squareoff).
      key: "close_price",
      header: "Close / LTP",
      align: "right",
      render: (r) => {
        const ltp = ltpFor(r);
        if (!ltp) return <span className="text-muted-foreground">—</span>;
        return (
          <span className="font-tabular">
            {formatPrice(ltp, r.segment, r.exchange)}
          </span>
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
        // (LTP - avg) is in the instrument's NATIVE currency (USD for crypto/
        // forex, INR for everything else). Multiply by the live USD/INR rate
        // for USD-quoted segments so every row reads in wallet INR — keeps
        // this column consistent with the PnL summary cards.
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
      render: (r) => <span className="whitespace-nowrap text-[11px]">{formatIST(r.created_at, { withSeconds: true })}</span>,
    },
    {
      key: "close_time",
      header: "Close Time",
      // Filled / cancelled / rejected → terminal timestamp; pending/open → —
      render: (r) => {
        const closed = r.executed_at ?? r.cancelled_at ??
          (["CANCELLED", "REJECTED", "EXECUTED"].includes(r.status) ? r.updated_at : null);
        if (!closed) return <span className="text-muted-foreground">—</span>;
        return <span className="whitespace-nowrap text-[11px]">{formatIST(closed, { withSeconds: true })}</span>;
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
    <div className="space-y-4">
      <PageHeader title="Orders" description={`${data?.length ?? 0} orders`} />

      <PnlSummaryCards />

      <div className="flex flex-wrap gap-2">
        {["", "OPEN", "EXECUTED", "CANCELLED", "REJECTED"].map((s) => (
          <Button key={s || "ALL"} variant={tab === s ? "default" : "outline"} size="sm" onClick={() => setTab(s)}>
            {s || "All"}
          </Button>
        ))}
      </div>

      <DataTable columns={cols} rows={data} keyExtractor={(r) => r.id} loading={isFetching && !data} />
    </div>
  );
}

