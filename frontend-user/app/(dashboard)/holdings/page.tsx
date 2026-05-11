"use client";

import { useQuery } from "@tanstack/react-query";
import { HoldingAPI } from "@/lib/api";
import { PageHeader } from "@/components/common/PageHeader";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR, formatPercent, pnlColor } from "@/lib/utils";

export default function HoldingsPage() {
  const { data, isFetching } = useQuery({ queryKey: ["holdings"], queryFn: () => HoldingAPI.list(), refetchInterval: 5000 });

  const totals = (data ?? []).reduce(
    (acc: any, h: any) => {
      acc.invested += Number(h.invested_value || 0);
      acc.current += Number(h.current_value || 0);
      return acc;
    },
    { invested: 0, current: 0 }
  );
  const pnl = totals.current - totals.invested;
  const pnlPct = totals.invested > 0 ? (pnl / totals.invested) * 100 : 0;

  const cols: Column<any>[] = [
    { key: "symbol", header: "Symbol" },
    { key: "exchange", header: "Exch" },
    { key: "quantity", header: "Qty", align: "right" },
    { key: "avg_price", header: "Avg", align: "right", render: (r) => formatINR(r.avg_price) },
    { key: "ltp", header: "LTP", align: "right", render: (r) => formatINR(r.ltp) },
    { key: "invested_value", header: "Invested", align: "right", render: (r) => formatINR(r.invested_value) },
    { key: "current_value", header: "Current", align: "right", render: (r) => formatINR(r.current_value) },
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
      render: (r) => <span className={pnlColor(r.pnl_percentage)}>{formatPercent(r.pnl_percentage)}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Holdings" description={`${data?.length ?? 0} delivery holdings`} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Invested" value={formatINR(totals.invested)} />
        <Stat label="Current value" value={formatINR(totals.current)} />
        <Stat label="P&L" value={formatINR(pnl)} className={pnlColor(pnl)} />
        <Stat label="P&L %" value={formatPercent(pnlPct)} className={pnlColor(pnlPct)} />
      </div>

      <DataTable columns={cols} rows={data} keyExtractor={(r) => r.id} loading={isFetching && !data} />
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className={`font-tabular text-xl ${className ?? ""}`}>{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
