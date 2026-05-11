"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X } from "lucide-react";
import { PositionAPI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable, type Column } from "@/components/common/DataTable";
import { PnlSummaryCards } from "@/components/common/PnlSummaryCards";
import { formatINR, formatPrice, pnlColor } from "@/lib/utils";

/** USD-quoted (forex/crypto) → "$ 80,218.50". Everything else → "₹ 80,218.50".
 *  P&L / margin always stays in ₹ because that's the wallet currency. */
function fmtFeedPrice(
  value: string | number | null | undefined,
  quote?: string,
  segment?: string,
  exchange?: string,
) {
  // Prefer the explicit `currency_quote` flag from the backend; fall back to
  // segment / exchange sniffing for legacy rows that don't include the flag.
  if (quote === "USD") {
    const n = typeof value === "string" ? Number(value) : (value ?? 0);
    if (!Number.isFinite(n)) return "$ 0.00";
    return `$ ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  }
  if (quote === "INR") return formatINR(value);
  return formatPrice(value, segment, exchange);
}

export default function PositionsPage() {
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

  const totalMtm = (data ?? []).reduce((s: number, p: any) => s + Number(p.unrealized_pnl || 0), 0);
  const totalRealized = (data ?? []).reduce((s: number, p: any) => s + Number(p.realized_pnl || 0), 0);

  const cols: Column<any>[] = [
    { key: "symbol", header: "Symbol" },
    { key: "exchange", header: "Exch" },
    {
      key: "quantity",
      header: "Qty",
      align: "right",
      render: (r) => <span className={r.quantity >= 0 ? "text-buy" : "text-sell"}>{r.quantity}</span>,
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
      render: (r) => <span className={pnlColor(r.unrealized_pnl)}>{formatINR(r.unrealized_pnl)}</span>,
    },
    { key: "realized_pnl", header: "Realized", align: "right", render: (r) => formatINR(r.realized_pnl) },
    { key: "margin_used", header: "Margin", align: "right", render: (r) => formatINR(r.margin_used) },
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
    <div className="space-y-4">
      <PageHeader
        title="Positions"
        description={`${data?.length ?? 0} open · M2M: ${formatINR(totalMtm)} · Realized: ${formatINR(totalRealized)}`}
        actions={
          <Button variant="destructive" disabled={!data?.length} onClick={squareoffAll}>
            Square off all
          </Button>
        }
      />

      <PnlSummaryCards />

      <DataTable columns={cols} rows={data} keyExtractor={(r) => r.id} loading={isFetching && !data} />
    </div>
  );
}
