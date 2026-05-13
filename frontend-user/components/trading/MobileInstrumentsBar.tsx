"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Search, Star, X } from "lucide-react";
import { InstrumentAPI, MarketwatchAPI, SegmentSettingsAPI } from "@/lib/api";
import { useMarketStream } from "@/lib/useMarketStream";
import { cn, formatPrice, pnlColor } from "@/lib/utils";

interface Props {
  activeToken: string | null;
  onSelect: (token: string) => void;
}

type Bucket = {
  key: string;
  label: string;
  mode: "watchlist" | "filter";
  segments?: string[];
  adminRows?: string[];
};

// Bucket order: Favorites first, then every Indian-exchange-backed
// segment (NSE EQ / FUT / OPT, MCX FUT), then the international /
// Infoway-backed ones (Indices, Stocks, Commodities, Forex, Crypto) so
// a user reaching for "NIFTY FUT" doesn't have to scroll past five
// foreign-market chips first. Matches the user's request: Indian
// markets pehle, crypto/forex last.
const BUCKETS: Bucket[] = [
  { key: "favorites", label: "Favorites", mode: "watchlist" },
  { key: "nse_eq", label: "NSE EQ", mode: "filter", segments: ["NSE_EQUITY"], adminRows: ["NSE_EQ"] },
  { key: "nse_fut", label: "NSE FUT", mode: "filter", segments: ["NSE_FUTURE", "NSE_INDEX_FUTURE"], adminRows: ["NSE_FUT"] },
  { key: "nse_opt", label: "NSE OPT", mode: "filter", segments: ["NSE_INDEX_OPTION_BUY", "NSE_INDEX_OPTION_SELL", "NSE_STOCK_OPTION_BUY", "NSE_STOCK_OPTION_SELL"], adminRows: ["NSE_OPT"] },
  { key: "bse_eq", label: "BSE EQ", mode: "filter", segments: ["BSE_EQUITY"], adminRows: ["BSE_EQ"] },
  { key: "bse_fut", label: "BSE FUT", mode: "filter", segments: ["BSE_FUTURE", "BSE_INDEX_FUTURE"], adminRows: ["BSE_FUT"] },
  { key: "bse_opt", label: "BSE OPT", mode: "filter", segments: ["BSE_OPTION_BUY", "BSE_OPTION_SELL"], adminRows: ["BSE_OPT"] },
  { key: "mcx_fut", label: "MCX FUT", mode: "filter", segments: ["MCX_FUTURE"], adminRows: ["MCX_FUT"] },
  { key: "indices", label: "Indices", mode: "filter", segments: ["INDICES"], adminRows: ["INDICES"] },
  { key: "stocks", label: "Stocks", mode: "filter", segments: ["STOCKS"], adminRows: ["STOCKS"] },
  { key: "commodities", label: "Commodities", mode: "filter", segments: ["COMMODITIES"], adminRows: ["COMMODITIES"] },
  { key: "forex", label: "Forex", mode: "filter", segments: ["FOREX"], adminRows: ["FOREX"] },
  { key: "crypto", label: "Crypto", mode: "filter", segments: ["CRYPTO_PERPETUAL", "CRYPTO_SPOT", "CRYPTO_FUTURE"], adminRows: ["CRYPTO"] },
];

/**
 * Mobile-only instruments bar that sits at the top of the terminal page.
 * Mirrors the InstrumentsPanel's search + bucket model but in a flatter
 * horizontal layout — chips strip + search row + scrollable picks. Tapping
 * a row fires `onSelect(token)` which the terminal page maps onto the
 * existing `selectedToken` state — no navigation, the chart and order panel
 * below just swap.
 */
export function MobileInstrumentsBar({ activeToken, onSelect }: Props) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [bucketKey, setBucketKey] = useState<string>("favorites");
  // Optimistic favorite toggle — tracks tokens the user just starred /
  // unstarred so the star icon flips before the network round-trip lands.
  // Reset whenever the source watchlist refetches.
  const [pendingFav, setPendingFav] = useState<Map<string, boolean>>(new Map());

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 180);
    return () => clearTimeout(t);
  }, [search]);

  const { data: inactiveRows } = useQuery({
    queryKey: ["segment-settings", "inactive"],
    queryFn: () => SegmentSettingsAPI.inactive(),
    staleTime: 30_000,
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
  });
  const inactiveSet = useMemo(() => new Set(inactiveRows ?? []), [inactiveRows]);
  const visibleBuckets = useMemo(
    () =>
      BUCKETS.filter((b) => {
        const rows = b.adminRows ?? [];
        if (rows.length === 0) return true;
        return rows.some((r) => !inactiveSet.has(r));
      }),
    [inactiveSet],
  );
  useEffect(() => {
    if (!visibleBuckets.find((b) => b.key === bucketKey)) setBucketKey("favorites");
  }, [visibleBuckets, bucketKey]);

  // Smooth-scroll the active chip into view when the bucket changes.
  // `block: nearest` keeps vertical position; `inline: center` slides the
  // chip into the middle of the strip so the user always sees adjacent
  // buckets on both sides — far better than the previous `snap-start`
  // jump that left the active chip pinned to the left edge.
  const chipsScrollerRef = useRef<HTMLDivElement | null>(null);
  const chipRefs = useRef<Record<string, HTMLButtonElement>>({});
  useEffect(() => {
    const el = chipRefs.current[bucketKey];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [bucketKey]);

  const bucket = visibleBuckets.find((b) => b.key === bucketKey) ?? visibleBuckets[0];

  const { data: watchlists } = useQuery({
    queryKey: ["watchlists"],
    queryFn: () => MarketwatchAPI.list(),
    staleTime: 30_000,
  });
  const activeWl = watchlists?.[0];

  // Token → item-id map for the active watchlist so a tap on the star can
  // resolve the item id needed for `removeItem` without a second round-trip.
  const favItemByToken = useMemo(() => {
    const map = new Map<string, string>();
    for (const it of activeWl?.items ?? []) {
      if (it?.instrument_token && it?.id) map.set(String(it.instrument_token), String(it.id));
    }
    return map;
  }, [activeWl]);

  // Clear the optimistic-flip overlay once the server-side list catches up
  // — otherwise repeated stars on the same token would stay "pending" forever.
  useEffect(() => {
    if (pendingFav.size === 0) return;
    setPendingFav((prev) => {
      const next = new Map(prev);
      for (const [tok, wantStarred] of prev) {
        const isStarred = favItemByToken.has(tok);
        if (isStarred === wantStarred) next.delete(tok);
      }
      return next;
    });
  }, [favItemByToken, pendingFav]);

  function isFav(token: string): boolean {
    const tok = String(token);
    if (pendingFav.has(tok)) return pendingFav.get(tok)!;
    return favItemByToken.has(tok);
  }

  async function toggleFavorite(token: string) {
    const tok = String(token);
    if (!activeWl?.id) {
      toast.error("No watchlist available");
      return;
    }
    const currentlyFav = isFav(tok);
    // Flip the star instantly — server reconciliation happens in the
    // invalidate below.
    setPendingFav((prev) => new Map(prev).set(tok, !currentlyFav));
    try {
      if (currentlyFav) {
        const itemId = favItemByToken.get(tok);
        if (!itemId) throw new Error("Item not found in watchlist");
        await MarketwatchAPI.removeItem(activeWl.id, itemId);
      } else {
        await MarketwatchAPI.addItem(activeWl.id, tok);
      }
      qc.invalidateQueries({ queryKey: ["watchlists"] });
      qc.invalidateQueries({ queryKey: ["watchlist-quotes"] });
    } catch (e: any) {
      // Roll back the optimistic flip on failure.
      setPendingFav((prev) => {
        const next = new Map(prev);
        next.delete(tok);
        return next;
      });
      toast.error(e?.message || (currentlyFav ? "Failed to remove" : "Failed to add"));
    }
  }
  const { data: wlQuotes } = useQuery({
    queryKey: ["watchlist-quotes", activeWl?.id],
    queryFn: () => MarketwatchAPI.quotes(activeWl!.id),
    enabled: !!activeWl?.id && bucketKey === "favorites" && search.trim().length === 0 && expanded,
    refetchInterval: 3000,
    staleTime: 2000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });

  const browseSegments = bucket?.mode === "filter" ? bucket.segments?.join(",") : undefined;
  const searchScopeSegments = bucket?.mode === "filter" ? browseSegments : undefined;

  const { data: searchHits } = useQuery({
    queryKey: ["mobile-instruments-search", debouncedSearch, searchScopeSegments],
    queryFn: () =>
      InstrumentAPI.search(debouncedSearch, undefined, searchScopeSegments, 30),
    enabled: debouncedSearch.trim().length > 0 && expanded,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });
  // Browse the bucket — cap at 40 (was 60). A bigger result set bloats the
  // WS subscribe list and the per-row quote map without the user actually
  // seeing past the first ~10 rows on screen.
  const { data: bucketHits } = useQuery({
    queryKey: ["mobile-instruments-bucket", bucketKey, browseSegments],
    queryFn: () => InstrumentAPI.search(undefined, undefined, browseSegments, 40),
    enabled: search.trim().length === 0 && bucket?.mode !== "watchlist" && !!browseSegments && expanded,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });

  // `tokensKey` (a stable string) is the dep — using the array itself
  // would invalidate the memo on every render even when the contents
  // matched, which in turn churned the WS subscribe / unsubscribe in
  // useMarketStream below.
  const tokensKey = useMemo<string>(() => {
    if (debouncedSearch.trim().length > 0) {
      return (searchHits ?? []).map((s: any) => s.token).join(",");
    }
    if (bucket?.mode === "watchlist") return "";
    return (bucketHits ?? []).map((s: any) => s.token).join(",");
  }, [debouncedSearch, searchHits, bucketHits, bucket?.mode]);
  const visibleTokens = useMemo<string[]>(
    () => (tokensKey ? tokensKey.split(",") : []),
    [tokensKey],
  );

  const { data: liveQuotes } = useQuery<any[]>({
    queryKey: ["mobile-instruments-batch-seed", tokensKey],
    queryFn: () => InstrumentAPI.quotesBatch(visibleTokens),
    enabled: visibleTokens.length > 0 && expanded,
    staleTime: 60_000,
    refetchInterval: false,
    refetchOnWindowFocus: false,
  });
  // Skip WS subscription entirely when the bar is collapsed — the user
  // can't see anything, no point burning sockets / handlers.
  const streamQuotes = useMarketStream(expanded ? visibleTokens : []);
  const quoteByToken = useMemo(() => {
    const map = new Map<string, any>();
    for (const q of liveQuotes ?? []) map.set(String(q.token), q);
    streamQuotes.forEach((q, tok) => map.set(tok, q));
    return map;
  }, [liveQuotes, streamQuotes]);

  const list = useMemo(() => {
    const enrich = (s: any) => {
      const live = quoteByToken.get(String(s.token));
      return {
        instrument_token: s.token,
        symbol: s.symbol,
        exchange: s.exchange,
        segment: s.segment ?? s.instrument_type,
        bid: live?.bid ?? null,
        ask: live?.ask ?? null,
        change_pct: live?.change_pct ?? null,
      };
    };
    if (debouncedSearch.trim().length > 0) return (searchHits ?? []).map(enrich);
    if (bucket?.mode === "watchlist") return wlQuotes ?? [];
    return (bucketHits ?? []).map(enrich);
  }, [debouncedSearch, searchHits, wlQuotes, bucketHits, bucket, quoteByToken]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
      {/* Header — mirrors the desktop InstrumentsPanel ("INSTRUMENTS"
          uppercase label + close on the right). The collapse chevron is
          kept so the user can shrink the strip on phones that have less
          vertical room. */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Instruments
        </span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="ml-auto grid size-7 place-items-center rounded text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          aria-label={expanded ? "Collapse instruments" : "Expand instruments"}
        >
          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
      </div>

      {expanded && (
        <>
          <div className="shrink-0 space-y-2 border-b border-border px-3 py-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search symbols..."
                className="h-8 w-full rounded-md border border-border bg-background pl-7 pr-7 text-xs outline-none placeholder:text-muted-foreground focus:border-primary"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="absolute right-1 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            {/* Segment chips — horizontally scrollable strip. Hides the
                scrollbar entirely (touch-friendly), uses snap-x so a swipe
                lands the next chip cleanly aligned at the leading edge,
                and a fade-mask on the right indicates more chips are
                available off-screen. Larger touch target (h-7, px-3)
                makes the chips comfortable to tap on phones. `scroll-smooth`
                + `scrollIntoView` on the active chip below means a tap on
                a partially-clipped chip smoothly centres it instead of
                jumping abruptly to the snap point. */}
            <div
              ref={chipsScrollerRef}
              className="scroll-smooth -mx-3 overflow-x-auto overscroll-x-contain px-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
              style={{
                maskImage:
                  "linear-gradient(to right, black 0%, black calc(100% - 24px), transparent 100%)",
                WebkitMaskImage:
                  "linear-gradient(to right, black 0%, black calc(100% - 24px), transparent 100%)",
                WebkitOverflowScrolling: "touch",
              }}
            >
              <div className="flex snap-x gap-1.5">
                {visibleBuckets.map((b) => (
                  <button
                    key={b.key}
                    type="button"
                    ref={(el) => {
                      if (el) chipRefs.current[b.key] = el;
                      else delete chipRefs.current[b.key];
                    }}
                    onClick={() => setBucketKey(b.key)}
                    className={cn(
                      "h-7 shrink-0 snap-center whitespace-nowrap rounded-full border px-3 text-[11px] font-medium transition-colors",
                      bucketKey === b.key
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                    )}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Column header row — matches the desktop InstrumentsPanel
              (SYMBOL / BID / ASK / 1D). The grid template is identical
              to the data rows below so columns line up exactly. */}
          <div className="grid shrink-0 grid-cols-[20px_1fr_auto_auto_24px] items-center gap-2 border-b border-border bg-muted/20 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <span />
            <span>Symbol</span>
            <span className="w-[64px] text-right">Bid</span>
            <span className="w-[64px] text-right">Ask</span>
            <span className="text-right">1D</span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
            {list.length === 0 && (
              <div className="grid h-24 place-items-center px-4 text-center text-xs text-muted-foreground">
                {search.trim()
                  ? "No instruments match"
                  : "Add instruments to your watchlist to see them here."}
              </div>
            )}
            {list.map((q: any) => {
              const token = String(q.instrument_token);
              const isActive = token === String(activeToken);
              const starred = isFav(token);
              // Live overlay — search results / bucket rows arrive from the
              // /instruments search endpoint without bid/ask. The `enrich`
              // helper merges in REST batch + WS quotes, but for the
              // watchlist branch `wlQuotes` already carries bid/ask. Fall
              // back through both so a starred row never shows "—" once
              // any source has the number.
              const liveOverlay = quoteByToken.get(token);
              const bid = q.bid ?? liveOverlay?.bid ?? null;
              const ask = q.ask ?? liveOverlay?.ask ?? null;
              const changePct = q.change_pct ?? liveOverlay?.change_pct ?? null;
              return (
                <div
                  key={token}
                  className={cn(
                    "grid w-full grid-cols-[20px_1fr_auto_auto_24px] items-center gap-2 border-b border-border/40 px-3 py-2 text-xs transition-colors",
                    isActive ? "bg-primary/10" : "hover:bg-muted/30",
                  )}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(token);
                    }}
                    aria-label={starred ? `Remove ${q.symbol} from favorites` : `Add ${q.symbol} to favorites`}
                    title={starred ? "Remove from favorites" : "Add to favorites"}
                    className="grid size-5 place-items-center rounded hover:bg-muted/40"
                  >
                    <Star
                      className={cn(
                        "size-3.5 transition-colors",
                        starred ? "fill-atm text-atm" : "text-muted-foreground",
                      )}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelect(token)}
                    className="flex min-w-0 flex-col items-start leading-tight text-left"
                  >
                    <span className={cn("truncate font-medium", isActive && "text-primary")}>
                      {q.symbol}
                    </span>
                    {q.exchange && (
                      <span className="truncate text-[9px] uppercase tracking-wider text-muted-foreground">
                        {q.exchange}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelect(token)}
                    className="w-[64px] text-right font-tabular text-sell"
                  >
                    {bid != null ? formatPrice(bid, q.segment, q.exchange) : "—"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelect(token)}
                    className="w-[64px] text-right font-tabular text-buy"
                  >
                    {ask != null ? formatPrice(ask, q.segment, q.exchange) : "—"}
                  </button>
                  <span
                    className={cn(
                      "grid size-5 place-items-center rounded",
                      pnlColor(changePct ?? 0),
                    )}
                    title={changePct != null ? `${Number(changePct).toFixed(2)}%` : "no change data"}
                  >
                    {changePct == null ? (
                      <span className="text-muted-foreground">·</span>
                    ) : Number(changePct) >= 0 ? (
                      <ArrowUp className="size-3" />
                    ) : (
                      <ArrowDown className="size-3" />
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
