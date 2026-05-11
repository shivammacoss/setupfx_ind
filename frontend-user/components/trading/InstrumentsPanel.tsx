"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronDown, RefreshCw, Search, Star, X } from "lucide-react";
import { InstrumentAPI, MarketwatchAPI } from "@/lib/api";
import { cn, formatPrice, pnlColor } from "@/lib/utils";

interface Props {
  onClose: () => void;
}

/** Generic asset-class buckets that map onto the backend's segment/exchange
 *  fields. Each entry says "what to send to /instruments/search". */
type Bucket = {
  key: string;
  label: string;
  // Either a watchlist marker, a segment filter, or a free-text query.
  mode: "watchlist" | "segment" | "query";
  segment?: string;
  query?: string;
};

const BUCKETS: Bucket[] = [
  { key: "favorites", label: "Favorites", mode: "watchlist" },
  { key: "all", label: "All", mode: "query", query: "" },
  { key: "forex", label: "Forex", mode: "segment", segment: "FOREX" },
  { key: "crypto", label: "Crypto", mode: "segment", segment: "CRYPTO_PERPETUAL" },
  { key: "metals", label: "Metals", mode: "segment", segment: "COMMODITIES" },
  { key: "indices", label: "Indices", mode: "segment", segment: "INDICES" },
  { key: "stocks", label: "Stocks", mode: "segment", segment: "NSE_EQUITY" },
];

/**
 * Sliding instruments panel — search any tradeable symbol, see live bid/ask,
 * 1-day arrow, click to open it in the terminal. Drives off the existing
 * marketwatch + instrument-search APIs (no new backend work).
 */
export function InstrumentsPanel({ onClose }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [bucketKey, setBucketKey] = useState<string>("favorites");
  const bucket = BUCKETS.find((b) => b.key === bucketKey) ?? BUCKETS[0];

  // Active watchlist (drives the "Favorites" bucket)
  const { data: watchlists } = useQuery({
    queryKey: ["watchlists"],
    queryFn: () => MarketwatchAPI.list(),
  });
  const activeWl = watchlists?.[0];
  const { data: wlQuotes } = useQuery({
    queryKey: ["watchlist-quotes", activeWl?.id],
    queryFn: () => MarketwatchAPI.quotes(activeWl!.id),
    enabled: !!activeWl?.id && bucketKey === "favorites" && search.trim().length === 0,
    refetchInterval: 2000,
  });

  // Free-text search — wins over the bucket when the box has any text.
  const { data: searchHits } = useQuery({
    queryKey: ["instruments-search-side", search],
    queryFn: () => InstrumentAPI.search(search, undefined, undefined, 30),
    enabled: search.trim().length > 0,
  });

  // Bucket-driven browse (when search is empty and bucket isn't Favorites).
  const browseSegment = bucket.mode === "segment" ? bucket.segment : undefined;
  const { data: bucketHits } = useQuery({
    queryKey: ["instruments-bucket", bucketKey, browseSegment],
    queryFn: () =>
      InstrumentAPI.search(
        bucket.mode === "query" ? bucket.query : undefined,
        undefined,
        browseSegment,
        100,
      ),
    enabled:
      search.trim().length === 0 &&
      bucket.mode !== "watchlist" &&
      (!!browseSegment || bucket.mode === "query"),
  });

  // Tokens currently visible — drives the live-quote pump. Watchlist quotes
  // already include bid/ask, so we only need to pump the search/bucket lists.
  const visibleTokens = useMemo<string[]>(() => {
    if (search.trim().length > 0) return (searchHits ?? []).map((s: any) => s.token);
    if (bucket.mode === "watchlist") return [];
    return (bucketHits ?? []).map((s: any) => s.token);
  }, [search, searchHits, bucketHits, bucket]);

  // Batched quote pump — fetches bid/ask/change for everything in view every
  // 2 s. Goes through `/instruments/quotes/batch` which already overlays
  // AllTick (forex/crypto/metals/energy) + Zerodha (Indian) on top of the local instrument
  // catalogue, so prices flow regardless of provider.
  const tokensKey = visibleTokens.join(",");
  const { data: liveQuotes } = useQuery<any[]>({
    queryKey: ["instruments-batch-quotes", tokensKey],
    queryFn: () => InstrumentAPI.quotesBatch(visibleTokens),
    enabled: visibleTokens.length > 0,
    refetchInterval: 2000,
  });
  const quoteByToken = useMemo(() => {
    const map = new Map<string, any>();
    for (const q of liveQuotes ?? []) map.set(String(q.token), q);
    return map;
  }, [liveQuotes]);

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
    if (search.trim().length > 0) return (searchHits ?? []).map(enrich);
    if (bucket.mode === "watchlist") return wlQuotes ?? [];
    return (bucketHits ?? []).map(enrich);
  }, [search, searchHits, wlQuotes, bucketHits, bucket, quoteByToken]);

  // Auto-clear search when panel re-opens
  useEffect(() => {
    setSearch("");
  }, []);

  function pickToken(token: string) {
    router.push(`/terminal?token=${encodeURIComponent(token)}`);
    onClose();
  }

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-border bg-card">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Instruments
        </span>
        <button
          type="button"
          aria-label="Refresh"
          className="ml-auto grid size-7 place-items-center rounded text-muted-foreground hover:bg-muted/40 hover:text-foreground"
        >
          <RefreshCw className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Close panel"
          onClick={onClose}
          className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-muted/40 hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Search + favourites filter */}
      <div className="space-y-2 border-b border-border px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            className="h-8 w-full rounded-md border border-border bg-background pl-7 pr-2 text-xs outline-none placeholder:text-muted-foreground focus:border-primary"
          />
        </div>
        <div className="relative">
          <select
            value={bucketKey}
            onChange={(e) => setBucketKey(e.target.value)}
            className="h-8 w-full appearance-none rounded-md border border-border bg-background pl-2 pr-7 text-xs outline-none focus:border-primary"
          >
            {BUCKETS.map((b) => (
              <option key={b.key} value={b.key} className="bg-popover text-foreground">
                {b.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>

      {/* Column header */}
      <div className="grid grid-cols-[1fr_70px_70px_28px] gap-2 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>Symbol</span>
        <span className="text-right">Bid</span>
        <span className="text-right">Ask</span>
        <span className="text-right">1D</span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {list.length === 0 && (
          <div className="grid h-32 place-items-center px-4 text-center text-xs text-muted-foreground">
            {search.trim()
              ? "No instruments match"
              : "Add instruments to your watchlist to see them here."}
          </div>
        )}
        {list.map((q: any) => (
          <button
            key={q.instrument_token}
            type="button"
            onClick={() => pickToken(q.instrument_token)}
            className="grid w-full grid-cols-[1fr_70px_70px_28px] items-center gap-2 border-b border-border/40 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/30"
          >
            <div className="flex items-center gap-2 truncate">
              <Star className="size-3 text-muted-foreground" />
              <span className="truncate font-medium">{q.symbol}</span>
            </div>
            <span className="text-right font-tabular">
              {q.bid != null ? formatPrice(q.bid, q.segment, q.exchange) : "—"}
            </span>
            <span className="text-right font-tabular">
              {q.ask != null ? formatPrice(q.ask, q.segment, q.exchange) : "—"}
            </span>
            <span
              className={cn(
                "ml-auto grid size-5 place-items-center rounded",
                pnlColor(q.change_pct ?? 0)
              )}
              title={
                q.change_pct != null ? `${q.change_pct.toFixed(2)}%` : "no change data"
              }
            >
              {q.change_pct == null ? (
                <span className="text-muted-foreground">·</span>
              ) : Number(q.change_pct) >= 0 ? (
                <ArrowUp className="size-3" />
              ) : (
                <ArrowDown className="size-3" />
              )}
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}
