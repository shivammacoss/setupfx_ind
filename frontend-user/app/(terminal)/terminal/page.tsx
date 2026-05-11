"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { InstrumentAPI, MarketwatchAPI, OrderAPI, PositionAPI } from "@/lib/api";
import { OrderPanel } from "@/components/trading/OrderPanel";
import { TradingViewChart } from "@/components/trading/TradingViewChart";
import { ChartTabs, type ChartTab } from "@/components/trading/ChartTabs";
import { ChartToolbar, TIMEFRAMES, type Timeframe } from "@/components/trading/ChartToolbar";
import { PositionsTabs } from "@/components/trading/PositionsTabs";
import { cn, formatPercent, pnlColor } from "@/lib/utils";

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

  // Chart timeframe + history
  const [tf, setTf] = useState<Timeframe>(TIMEFRAMES[1]); // default 5m

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

  // Polling interval intentionally tight (500 ms) so the positions / orders
  // panels stay snappy even when a `/ws/user` push is dropped (mobile tab
  // throttling, transient disconnect, etc.). The WS push is still the
  // primary signal — the poll is the belt-and-suspenders safety net.
  // Polling cadence: 2 s baseline, BUT pause for 3 s after any
  // optimistic update (setQueryData via a click handler).
  //
  // Why: a click inserts/removes a row optimistically, but Atlas's
  // read-after-write has ~100–500 ms lag, so the very next scheduled
  // poll often returns stale server data (without the new BUY, or
  // still containing the just-closed position). That stale poll wipes
  // the optimistic state and the row "flickers" for one tick before
  // the poll-after-that gets it right.
  //
  // Using `refetchInterval` as a function gives us access to
  // `query.state.dataUpdatedAt`, which `setQueryData` bumps. If the
  // cache was updated in the last 3 s we pause polling; otherwise we
  // poll every 2 s like before.
  const livePollInterval = (query: any) => {
    const last = (query?.state?.dataUpdatedAt as number) || 0;
    const sinceMs = Date.now() - last;
    return sinceMs < 3000 ? false : 2000;
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

  // Fullscreen + screenshot for chart card
  const chartCardRef = useRef<HTMLDivElement | null>(null);
  const [isFs, setIsFs] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function toggleFullscreen() {
    if (!chartCardRef.current) return;
    if (!document.fullscreenElement) chartCardRef.current.requestFullscreen?.().catch(() => undefined);
    else document.exitFullscreen?.().catch(() => undefined);
  }

  function takeScreenshot() {
    const canvas = chartCardRef.current?.querySelector("canvas");
    if (!canvas) {
      toast.error("Chart not ready");
      return;
    }
    try {
      const url = (canvas as HTMLCanvasElement).toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `${instrument?.symbol ?? "chart"}-${Date.now()}.png`;
      a.click();
    } catch {
      toast.error("Screenshot failed");
    }
  }

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
    <div className="flex min-h-0 flex-col gap-2 lg:grid lg:h-full lg:grid-cols-[minmax(0,1fr)_340px]">
      {/* ── CENTER: chart card + positions strip ────────── */}
      <section className="flex min-h-0 flex-col gap-2">
        {/* Chart card — keeps a ~60vh min-height on mobile so the chart
            never collapses; on lg+ it flexes to fill the available column
            height. */}
        <div
          ref={chartCardRef}
          className="flex min-h-[60vh] flex-col overflow-hidden rounded-lg border border-border bg-card lg:min-h-0 lg:flex-1"
        >
          {/* Tabs */}
          <ChartTabs
            tabs={tabsWithSelected}
            active={selectedToken}
            onSelect={setSelectedToken}
            onClose={closeTab}
            watchlistId={activeWl?.id ?? null}
            onAdded={(token) => setSelectedToken(token)}
          />

          {/* Toolbar */}
          <ChartToolbar
            tf={tf}
            onTfChange={setTf}
            fullscreen={isFs}
            onToggleFullscreen={toggleFullscreen}
            onScreenshot={takeScreenshot}
          />

          {/* Symbol header strip — OHLC / change */}
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

        {/* Positions strip */}
        <PositionsTabs
          positions={positions ?? []}
          pendingOrders={pendingOrders}
          history={history}
          cancelled={cancelled}
          totalPnL={totalPnL}
        />
      </section>

      {/* ── RIGHT: Order panel ────────────────────────────────────── */}
      <OrderPanel
        instrument={instrument}
        ltp={Number(quote?.ltp ?? 0)}
        bid={bestBid}
        ask={bestAsk}
        fxRate={Number(quote?.fx_rate ?? 1)}
      />
    </div>
  );
}
