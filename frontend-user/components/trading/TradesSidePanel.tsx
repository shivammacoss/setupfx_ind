"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { OrderAPI, PositionAPI } from "@/lib/api";
import { PositionsTabs } from "./PositionsTabs";

interface Props {
  onClose: () => void;
}

// Slide-out replacement for the old bottom Positions strip. Internally
// runs the same positions / orders queries as the strip did — React Query
// dedupes by key, so the optimistic writes the OrderPanel does still
// land in this panel's view without any prop wiring.
//
// Width: 480 px on desktop keeps the chart breathable when both this
// drawer and the right-side order panel are open simultaneously (the
// previous 720 px squeezed the chart down to ~200 px on 1280-wide
// laptops). The inner PositionsTabs table scrolls horizontally so all
// columns remain reachable even at this narrower drawer width.
export function TradesSidePanel({ onClose }: Props) {
  // Match the polling cadence the bottom strip used: 2 s baseline, paused
  // for 3 s after an optimistic write so the just-mutated cache isn't
  // wiped by a stale read-after-write from Atlas.
  const livePollInterval = (query: any) => {
    const last = (query?.state?.dataUpdatedAt as number) || 0;
    return Date.now() - last < 3000 ? false : 2000;
  };

  const { data: positions } = useQuery({
    queryKey: ["positions", "open"],
    queryFn: () => PositionAPI.open(),
    refetchInterval: livePollInterval,
  });

  const { data: orders } = useQuery({
    queryKey: ["orders", "recent"],
    queryFn: () => OrderAPI.list(),
    refetchInterval: livePollInterval,
  });

  const pendingOrders = useMemo(
    () =>
      (orders ?? []).filter((o: any) =>
        ["PENDING", "OPEN", "TRIGGERED"].includes(String(o.status).toUpperCase()),
      ),
    [orders],
  );
  const history = useMemo(
    () =>
      (orders ?? []).filter((o: any) =>
        ["COMPLETE", "EXECUTED", "FILLED", "REJECTED"].includes(String(o.status).toUpperCase()),
      ),
    [orders],
  );
  const cancelled = useMemo(
    () => (orders ?? []).filter((o: any) => String(o.status).toUpperCase() === "CANCELLED"),
    [orders],
  );
  const totalPnL = useMemo(
    () =>
      (positions ?? []).reduce(
        (acc: number, p: any) => acc + (Number(p.unrealized_pnl) || 0),
        0,
      ),
    [positions],
  );

  return (
    <aside className="flex h-full w-[min(480px,92vw)] shrink-0 animate-in slide-in-from-left-4 fade-in-0 flex-col border-r border-border bg-card duration-200 lg:w-[min(520px,40vw)]">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Trades & Orders
        </span>
        <span className="text-[10px] text-muted-foreground">
          {(positions ?? []).length} open · {pendingOrders.length} pending
        </span>
        <button
          type="button"
          aria-label="Close panel"
          onClick={onClose}
          className="ml-auto grid size-7 place-items-center rounded text-muted-foreground hover:bg-muted/40 hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
      {/* overflow-auto so the 13-column PositionsTabs table can scroll
          horizontally if the panel is narrower than its natural width
          (mobile, or when the user has resized the browser narrow). */}
      <div className="min-h-0 flex-1 overflow-auto">
        <PositionsTabs
          positions={positions ?? []}
          pendingOrders={pendingOrders}
          history={history}
          cancelled={cancelled}
          totalPnL={totalPnL}
        />
      </div>
    </aside>
  );
}
