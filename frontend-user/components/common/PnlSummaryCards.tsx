"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { PositionAPI } from "@/lib/api";
import { cn, formatINR, pnlColor } from "@/lib/utils";

export function PnlSummaryCards() {
  const { data: pnl } = useQuery({
    queryKey: ["positions", "pnl-summary"],
    queryFn: () => PositionAPI.pnlSummary(),
    refetchInterval: 10000,
  });

  return (
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
  );
}

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
