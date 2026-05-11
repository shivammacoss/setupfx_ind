"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpToLine,
  Banknote,
  CircleDollarSign,
  ListOrdered,
  ShieldAlert,
  TrendingUp,
  Users,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardAPI } from "@/lib/api";
import { formatINR, formatNumber, pnlColor } from "@/lib/utils";
import { PageHeader } from "@/components/common/PageHeader";

export default function AdminDashboardPage() {
  const { data: stats } = useQuery({
    queryKey: ["admin", "dashboard", "stats"],
    queryFn: () => DashboardAPI.stats(),
    refetchInterval: 10_000,
  });
  const { data: alerts } = useQuery({
    queryKey: ["admin", "dashboard", "alerts"],
    queryFn: () => DashboardAPI.riskAlerts(),
    refetchInterval: 15_000,
  });

  const cards = [
    { label: "Total users", value: formatNumber(stats?.users?.total ?? 0), hint: "All roles", icon: Users },
    { label: "Active today", value: formatNumber(stats?.users?.active_today ?? 0), hint: "Last 24h", icon: Activity },
    { label: "Wallet balance", value: formatINR(stats?.money?.wallet_balance_total), hint: "All users", icon: CircleDollarSign },
    { label: "Margin used", value: formatINR(stats?.money?.margin_used_total), hint: "Locked in trades", icon: Banknote },
    { label: "Today's volume", value: formatINR(stats?.trading?.today_volume), hint: "Turnover", icon: TrendingUp },
    { label: "Today's revenue", value: formatINR(stats?.trading?.today_revenue), hint: "Brokerage", icon: Banknote },
    { label: "Open positions", value: formatNumber(stats?.trading?.open_positions ?? 0), hint: "Across users", icon: ListOrdered },
    { label: "Pending orders", value: formatNumber(stats?.trading?.pending_orders ?? 0), hint: "Awaiting fill", icon: ListOrdered },
    { label: "Pending deposits", value: formatNumber(stats?.approvals?.pending_deposits ?? 0), hint: "Approve in Money → Deposits", icon: ArrowDownToLine },
    { label: "Pending withdrawals", value: formatNumber(stats?.approvals?.pending_withdrawals ?? 0), hint: "Approve in Money → Withdrawals", icon: ArrowUpToLine },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Operations dashboard" description="Live metrics, refreshing every 10 seconds." />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label}>
              <CardHeader className="flex flex-row items-start justify-between pb-2">
                <CardDescription>{c.label}</CardDescription>
                <Icon className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="font-tabular text-xl font-semibold sm:text-2xl">{c.value}</div>
                {c.hint && <div className="text-[11px] text-muted-foreground">{c.hint}</div>}
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Risk monitor</CardTitle>
            <CardDescription>Users with high MTM-to-margin ratio. Refreshing every 15 s.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {!alerts || alerts.length === 0 ? (
              <div className="flex items-center gap-2 rounded-md border border-dashed border-border p-6 text-muted-foreground">
                <ShieldAlert className="size-4" /> No risk alerts at the moment.
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-left">User</th>
                    <th className="px-2 py-1.5 text-right">Open positions</th>
                    <th className="px-2 py-1.5 text-right">Margin used</th>
                    <th className="px-2 py-1.5 text-right">Unrealized</th>
                    <th className="px-2 py-1.5 text-right">MTM ratio</th>
                    <th className="px-2 py-1.5 text-right">Level</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {alerts.map((a: any) => (
                    <tr key={a.user_id}>
                      <td className="px-2 py-1.5 font-mono text-[10px]">{a.user_id.slice(-10)}</td>
                      <td className="px-2 py-1.5 text-right">{a.open_positions}</td>
                      <td className="px-2 py-1.5 text-right">{formatINR(a.margin_used)}</td>
                      <td className={`px-2 py-1.5 text-right ${pnlColor(a.unrealized_pnl)}`}>
                        {formatINR(a.unrealized_pnl)}
                      </td>
                      <td className="px-2 py-1.5 text-right">{a.mtm_ratio_pct}%</td>
                      <td className="px-2 py-1.5 text-right">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] ${
                            a.level === "DANGER" ? "bg-destructive/15 text-destructive" : "bg-amber-500/15 text-amber-400"
                          }`}
                        >
                          {a.level}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System health</CardTitle>
            <CardDescription>Live checks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="API" value="OK" ok />
            <Row label="Database" value={stats?.system?.db ? "OK" : "DOWN"} ok={!!stats?.system?.db} />
            <Row label="Redis" value={stats?.system?.redis ? "OK" : "DOWN"} ok={!!stats?.system?.redis} />
            <Row label="Market data feed" value="MOCK" ok />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Row({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono text-xs ${ok ? "text-primary" : "text-destructive"}`}>{value}</span>
    </div>
  );
}
