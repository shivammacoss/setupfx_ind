"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { InstrumentAPI, MarketwatchAPI, OrderAPI, PositionAPI } from "@/lib/api";
import { OrderPanel } from "@/components/trading/OrderPanel";
import { PositionsTabs } from "@/components/trading/PositionsTabs";
import { TradingViewChart } from "@/components/trading/TradingViewChart";
import { ChartTabs, type ChartTab } from "@/components/trading/ChartTabs";
import { TIMEFRAMES, type Timeframe } from "@/components/trading/ChartToolbar";
import { cn, formatPercent, pnlColor } from "@/lib/utils";

const ORDER_PANEL_COLLAPSED_KEY = "setupfx.terminal.orderPanelCollapsed";

export default function TradingTerminalPage() {
  const qc = useQueryClient();
  // Mirror the app theme into the embedded TradingView widget. Defaults to
  // dark while the theme provider hasn't hydrated to avoid a white flash.
  const { resolvedTheme } = useTheme();
  const chartTheme: "light" | "dark" = resolvedTheme === "light" ? "light" : "dark";

  // Active watchlist drives the chart-tabs row
  const { data: watchlists } = useQuery({
    queryKey: ["watchlists"],
    queryFn: () => MarketwatchAPI.list(),
  });
  const activeWl = watchlists?.[0];

  const { data: wlQuotes } = useQuery({
    queryKey: ["watchlist-quotes", activeWl?.id],
    queryFn: () => MarketwatchAPI.quotes(activeWl!.id),
    enabled: !!activeWl?.id,
    refetchInterval: 2000,
  });

  // Selected instrument — kept in sync with the ?token= URL param so that
  // soft-nav clicks from the side panel (router.push) actually swap the chart.
  const searchParams = useSearchParams();
  const urlToken = searchParams?.get("token") || null;
  const [selectedToken, setSelectedToken] = useState<string | null>(urlToken);

  useEffect(() => {
    if (urlToken && urlToken !== selectedToken) {
      setSelectedToken(urlToken);
    }
  }, [urlToken]);

  useEffect(() => {
    if (selectedToken) return;
    let cancelled = false;
    (async () => {
      try {
        const found = await InstrumentAPI.search("BTCUSD", undefined, undefined, 1);
        if (!cancelled && found && found[0]?.token) {
          setSelectedToken(found[0].token);
          return;
        }
      } catch {
        // ignore — fall through
      }
      if (!cancelled && wlQuotes && wlQuotes.length > 0) {
        setSelectedToken(wlQuotes[0].instrument_token);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedToken, wlQuotes]);

  const { data: instrument } = useQuery({
    queryKey: ["instrument", selectedToken],
    queryFn: () => InstrumentAPI.detail(selectedToken!),
    enabled: !!selectedToken,
  });

  const { data: quote } = useQuery({
    queryKey: ["quote", selectedToken],
    queryFn: () => InstrumentAPI.quote(selectedToken!),
    enabled: !!selectedToken,
    refetchInterval: 1000,
  });

  // Chart timeframe — fixed at 5m for the initial chart load + OHLC label.
  // TradingView's own toolbar handles in-chart timeframe switching.
  const tf: Timeframe = TIMEFRAMES[1];

  // Order panel collapse — toggleable via the chevron on the panel's left
  // edge. State persists across reloads so the trader's preferred layout
  // sticks. Hydrated client-side after mount to avoid SSR / localStorage
  // mismatch.
  const [orderPanelCollapsed, setOrderPanelCollapsed] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setOrderPanelCollapsed(
      window.localStorage.getItem(ORDER_PANEL_COLLAPSED_KEY) === "1",
    );
  }, []);
  function toggleOrderPanel() {
    setOrderPanelCollapsed((v) => {
      const next = !v;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(ORDER_PANEL_COLLAPSED_KEY, next ? "1" : "0");
      }
      return next;
    });
  }

  // Tabs derived from watchlist quotes
  const tabs: ChartTab[] = useMemo(
    () =>
      (wlQuotes ?? []).map((q: any) => ({
        token: q.instrument_token,
        symbol: q.symbol,
      })),
    [wlQuotes]
  );

  const tabsWithSelected: ChartTab[] = useMemo(() => {
    if (!selectedToken) return tabs;
    if (tabs.find((t) => t.token === selectedToken)) return tabs;
    return [{ token: selectedToken, symbol: instrument?.symbol ?? "—" }, ...tabs];
  }, [tabs, selectedToken, instrument?.symbol]);

  async function closeTab(token: string) {
    if (!activeWl) return;
    const item = activeWl.items?.find((i: any) => i.instrument_token === token);
    if (!item) {
      if (token === selectedToken) setSelectedToken(null);
      return;
    }
    try {
      await MarketwatchAPI.removeItem(activeWl.id, item.id);
      qc.invalidateQueries({ queryKey: ["watchlist-quotes"] });
      qc.invalidateQueries({ queryKey: ["watchlists"] });
      if (token === selectedToken) {
        const next = tabsWithSelected.find((t) => t.token !== token);
        setSelectedToken(next?.token ?? null);
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to remove");
    }
  }

  // Polling interval for the Positions / Orders queries. 2 s baseline,
  // BUT widened to 3.5 s for ~3 s after any optimistic update so an
  // in-flight stale read from Atlas doesn't wipe the just-mutated row.
  // Returning `false` here used to permanently disable polling — once
  // dataUpdatedAt was bumped by setQueryData or by the post-invalidate
  // refetch, the interval re-evaluated to `false` and the loop never
  // resumed. The visible symptom: a limit order would appear in Pending
  // for a few seconds and then "vanish" without ever showing up in
  // History, because the cache stayed at status=OPEN forever while the
  // backend had already moved it to EXECUTED. Returning a positive
  // number keeps the polling loop alive.
  const livePollInterval = (query: any) => {
    const last = (query?.state?.dataUpdatedAt as number) || 0;
    const sinceMs = Date.now() - last;
    return sinceMs < 3000 ? 3500 : 2000;
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
        ["PENDING", "OPEN", "TRIGGERED"].includes(String(o.status).toUpperCase())
      ),
    [orders]
  );
  const history = useMemo(
    () =>
      (orders ?? []).filter((o: any) =>
        ["COMPLETE", "EXECUTED", "FILLED", "REJECTED"].includes(String(o.status).toUpperCase())
      ),
    [orders]
  );
  const cancelled = useMemo(
    () => (orders ?? []).filter((o: any) => String(o.status).toUpperCase() === "CANCELLED"),
    [orders]
  );
  const totalPnL = useMemo(
    () => (positions ?? []).reduce((acc: number, p: any) => acc + (Number(p.unrealized_pnl) || 0), 0),
    [positions]
  );

  const bestBid = quote?.bid ?? quote?.depth?.bids?.[0]?.price ?? null;
  const bestAsk = quote?.ask ?? quote?.depth?.asks?.[0]?.price ?? null;

  return (
    // Layout strategy:
    //  • lg+ (≥1024px): two-column grid filling the viewport height, no
    //    page scroll — chart and order panel are independently sized.
    //  • mobile / md: single column, page scrolls naturally. The chart
    //    keeps an aspect-ratio-driven min height so it doesn't collapse
    //    to nothing on a narrow screen, and the order panel + positions
    //    flow below where the user can scroll to them.
    //
    // Responsiveness across monitor sizes (16″ laptop → 32″ ultra-wide):
    //   • `max-w-[1800px] mx-auto` keeps the chart from ballooning into
    //     an awkward wide-screen rectangle on 4K / 32″ displays — past
    //     1800 px the content centres instead of stretching.
    //   • Order-panel column scales with breakpoint (`lg:340 → xl:380 →
    //     2xl:420 px`) so on bigger screens it doesn't look like a
    //     toy panel next to a giant chart.
    // lg+ uses flex so the order-panel column can animate its width when
    // the user collapses it. CSS grid template columns aren't transitionable
    // — flex + Tailwind's `transition-[width]` is.
    <div className="mx-auto flex min-h-0 w-full max-w-[1800px] flex-col gap-2 lg:h-full lg:flex-row">
      {/* ── CENTER: chart card + positions strip ──────────
          `min-w-0` is critical with `flex-row`: without it the TradingView
          chart's intrinsic content width keeps the section from shrinking,
          which pushes the order-panel column past the viewport's right
          edge (BUY/SELL prices get clipped). With `min-w-0` the section
          can compress as needed and the fixed-width order panel stays
          visible. Matches the `minmax(0,1fr)` behaviour of the old grid. */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
        {/* Chart card. Now the sole occupant of the centre section
            (the old bottom positions strip moved into the slide-out
            TradesSidePanel) so it gets the full column height on lg+.
            mobile / md keeps `min-h-[60vh]` so the chart can't collapse
            below ~60 % of the viewport on narrow screens. */}
        {/* lg+: cap the chart at 70vh so the PositionsTabs strip below is
            always visible without scrolling. Without the cap the chart
            would `flex-1` and consume all leftover height, pushing the
            positions strip into vertical scroll territory. */}
        <div className="flex min-h-[60vh] flex-col overflow-hidden rounded-lg border border-border bg-card lg:min-h-0 lg:max-h-[70vh] lg:flex-1">
          {/* Tabs */}
          <ChartTabs
            tabs={tabsWithSelected}
            active={selectedToken}
            onSelect={setSelectedToken}
            onClose={closeTab}
            watchlistId={activeWl?.id ?? null}
            onAdded={(token) => setSelectedToken(token)}
          />

          {/* Symbol header strip — OHLC / change.
              The custom ChartToolbar that previously sat here was duplicating
              the TradingView widget's built-in timeframe / indicator / undo
              controls one row above its own toolbar — removed so the user
              sees one toolbar, the chart's own. */}
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border px-3 py-2 text-xs">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold text-foreground">
                {instrument?.symbol ?? "Select an instrument"}
              </span>
              <span className="text-muted-foreground">· {tf.label} ·</span>
              <span className="text-muted-foreground">
                {(instrument?.exchange ?? "MARKET").toUpperCase()}
              </span>
            </div>
            <div className="flex items-baseline gap-2 font-tabular text-muted-foreground">
              <span>O</span>
              <span className="text-foreground">{quote?.open?.toFixed?.(2) ?? "—"}</span>
              <span>H</span>
              <span className="text-foreground">{quote?.high?.toFixed?.(2) ?? "—"}</span>
              <span>L</span>
              <span className="text-foreground">{quote?.low?.toFixed?.(2) ?? "—"}</span>
              <span>C</span>
              <span className="text-foreground">{quote?.ltp?.toFixed?.(2) ?? "—"}</span>
              <span className={cn("ml-1", pnlColor(quote?.change_pct ?? 0))}>
                {quote?.change?.toFixed?.(2) ?? "0.00"} ({formatPercent(quote?.change_pct ?? 0)})
              </span>
            </div>
            <div className="ml-auto flex items-baseline gap-2 text-[11px] text-muted-foreground">
              <span>Volume</span>
              <span className="font-tabular text-foreground">
                {((quote?.volume ?? 0) / 1_000_000).toFixed(2)}M
              </span>
              {quote?.source && (
                <span
                  title={`Quote provider: ${quote.source}`}
                  className={cn(
                    "ml-1 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                    quote.source === "zerodha"
                      ? "bg-buy/15 text-buy"
                      : quote.source === "infoway"
                        ? "bg-info/15 text-info"
                        : "bg-muted text-muted-foreground"
                  )}
                >
                  {quote.source}
                </span>
              )}
            </div>
          </div>

          {/* Chart fills remaining height */}
          <div className="relative min-h-0 flex-1">
            {selectedToken ? (
              <TradingViewChart
                token={selectedToken}
                symbol={instrument?.symbol}
                interval={tf.interval === "minute" ? "1" : tf.interval === "3minute" ? "3" : tf.interval === "5minute" ? "5" : tf.interval === "15minute" ? "15" : tf.interval === "30minute" ? "30" : tf.interval === "60minute" ? "60" : "1D"}
                theme={chartTheme}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                Select an instrument to view chart
              </div>
            )}
          </div>
        </div>

        {/* Bottom positions strip — restored from the earlier side-drawer
            experiment. Sits under the chart full-width so the trader can
            glance at Positions / Active Trades / Pending / History without
            losing the chart real-estate to a vertical drawer. */}
        <PositionsTabs
          positions={positions ?? []}
          pendingOrders={pendingOrders}
          history={history}
          cancelled={cancelled}
          totalPnL={totalPnL}
        />
      </section>

      {/* ── RIGHT: Order panel ──────────────────────────────────────
          The wrapper handles the collapse chevron + animated width. The
          OrderPanel itself stays mounted even when collapsed so its
          internal state (selected order type, lot count, SL/TP fields)
          isn't lost on toggle — we just hide it via `display:none`.

          Widths step with breakpoint so the panel matches the chart's
          natural scaling on bigger monitors:
            lg  → 340 px,  xl → 380 px,  2xl → 420 px
          Collapsed: 44 px (just enough for the expand chevron). On
          mobile / md the column stacks below the chart and is always
          rendered at full width — collapse only kicks in on lg+. */}
      <div
        className={cn(
          "relative shrink-0 transition-[width] duration-300 ease-out",
          orderPanelCollapsed
            ? "lg:w-11"
            : "lg:w-[340px] xl:w-[380px] 2xl:w-[420px]",
        )}
      >
        {/* Collapse chevron — left edge of the panel on lg+; hidden on
            mobile / md where the panel just stacks under the chart. */}
        <button
          type="button"
          onClick={toggleOrderPanel}
          title={orderPanelCollapsed ? "Expand order panel" : "Collapse order panel"}
          aria-label={orderPanelCollapsed ? "Expand order panel" : "Collapse order panel"}
          className="absolute left-0 top-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 grid size-6 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground lg:grid"
        >
          {orderPanelCollapsed ? <ChevronLeft className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </button>
        <div className={cn("h-full", orderPanelCollapsed ? "lg:hidden" : "block")}>
          <OrderPanel
            instrument={instrument}
            ltp={Number(quote?.ltp ?? 0)}
            bid={bestBid}
            ask={bestAsk}
            fxRate={Number(quote?.fx_rate ?? 1)}
          />
        </div>
      </div>
    </div>
  );
}
