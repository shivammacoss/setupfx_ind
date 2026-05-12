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

/** Generic asset-class buckets that map onto the backend's segment / exchange
 *  / instrument_type fields. The side panel ships with two layers:
 *    • Top-level groups (Forex, Stocks, Indices, Commodities, Crypto) — wide
 *      filters that just narrow by exchange or instrument type.
 *    • Granular segment chips (NSE EQ, NSE FUT, NSE OPT, BSE …, MCX …,
 *      Crypto Perp / Call / Put) — match the SegmentType enum used by the
 *      backend's netting + brokerage stacks.
 *  `segments` is sent comma-separated so a single round-trip can match
 *  multiple SegmentType values (NSE OPT covers four index- and stock-option
 *  segments, etc.). `instrumentTypes` does the same for InstrumentType. */
type Bucket = {
  key: string;
  label: string;
  group: "core" | "asset" | "nse" | "bse" | "mcx";
  // Either a watchlist marker, a segment/exchange/type filter, or free-text.
  mode: "watchlist" | "filter" | "query";
  segments?: string[];
  instrumentTypes?: string[];
  exchange?: string;
  query?: string;
};

const BUCKETS: Bucket[] = [
  // Core
  { key: "favorites", label: "Favorites", group: "core", mode: "watchlist" },
  { key: "all", label: "All", group: "core", mode: "query", query: "" },

  // Asset-class groups
  { key: "forex", label: "Forex", group: "asset", mode: "filter", segments: ["FOREX", "CDS_FUTURE"] },
  { key: "stocks", label: "Stocks", group: "asset", mode: "filter", segments: ["NSE_EQUITY", "BSE_EQUITY"] },
  { key: "indices", label: "Indices", group: "asset", mode: "filter", instrumentTypes: ["INDEX"] },
  { key: "commodities", label: "Commodities", group: "asset", mode: "filter", segments: ["COMMODITIES", "MCX_FUTURE", "MCX_OPTION_BUY", "MCX_OPTION_SELL"] },

  // NSE granular
  { key: "nse_eq", label: "NSE EQ", group: "nse", mode: "filter", segments: ["NSE_EQUITY"] },
  { key: "nse_fut", label: "NSE FUT", group: "nse", mode: "filter", segments: ["NSE_FUTURE", "NSE_INDEX_FUTURE"] },
  { key: "nse_opt", label: "NSE OPT", group: "nse", mode: "filter", segments: ["NSE_INDEX_OPTION_BUY", "NSE_INDEX_OPTION_SELL", "NSE_STOCK_OPTION_BUY", "NSE_STOCK_OPTION_SELL"] },

  // BSE granular
  { key: "bse_eq", label: "BSE EQ", group: "bse", mode: "filter", segments: ["BSE_EQUITY"] },
  { key: "bse_fut", label: "BSE FUT", group: "bse", mode: "filter", segments: ["BSE_FUTURE", "BSE_INDEX_FUTURE"] },
  { key: "bse_opt", label: "BSE OPT", group: "bse", mode: "filter", segments: ["BSE_OPTION_BUY", "BSE_OPTION_SELL"] },

  // MCX granular
  { key: "mcx_fut", label: "MCX FUT", group: "mcx", mode: "filter", segments: ["MCX_FUTURE"] },
  { key: "mcx_opt", label: "MCX OPT", group: "mcx", mode: "filter", segments: ["MCX_OPTION_BUY", "MCX_OPTION_SELL"] },
];

const GROUP_LABELS: Record<Bucket["group"], string> = {
  core: "—",
  asset: "Asset class",
  nse: "NSE",
  bse: "BSE",
  mcx: "MCX",
};

/**
 * Sliding instruments panel — search any tradeable symbol, see live bid/ask,
 * 1-day arrow, click to open it in the terminal. Drives off the existing
 * marketwatch + instrument-search APIs (no new backend work).
 */
export function InstrumentsPanel({ onClose }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [bucketKey, setBucketKey] = useState<string>("favorites");
  const bucket = BUCKETS.find((b) => b.key === bucketKey) ?? BUCKETS[0];

  // Debounce the search input so we don't hammer the API on every keystroke.
  // 180 ms is the sweet spot — feels instant but lets a typist finish a word.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 180);
    return () => clearTimeout(t);
  }, [search]);

  // Active watchlist (drives the "Favorites" bucket)
  const { data: watchlists } = useQuery({
    queryKey: ["watchlists"],
    queryFn: () => MarketwatchAPI.list(),
    staleTime: 30_000,
  });
  const activeWl = watchlists?.[0];
  const { data: wlQuotes } = useQuery({
    queryKey: ["watchlist-quotes", activeWl?.id],
    queryFn: () => MarketwatchAPI.quotes(activeWl!.id),
    enabled: !!activeWl?.id && bucketKey === "favorites" && search.trim().length === 0,
    refetchInterval: 2000,
    placeholderData: (prev) => prev,
  });

  // Bucket-driven browse (when search is empty and bucket isn't Favorites).
  // The backend accepts comma-separated `segment` and `instrument_type` so a
  // single chip ("NSE OPT") can match all four option-segment values in one
  // round-trip. `placeholderData: keep previous` keeps the table rendered
  // when the user flips between chips — no blank flash mid-switch.
  const browseSegments = bucket.mode === "filter" ? bucket.segments?.join(",") : undefined;
  const browseTypes = bucket.mode === "filter" ? bucket.instrumentTypes?.join(",") : undefined;
  const browseExchange = bucket.mode === "filter" ? bucket.exchange : undefined;

  // Free-text search — wins over the bucket when the box has any text.
  // Scoped to the current bucket's filters so typing "BANK" inside NSE OPT
  // returns only NSE option contracts, not MCX or crypto. When the bucket
  // is Favorites / All / a free-text bucket we don't constrain — that's
  // the global search the user expects.
  const searchScopeSegments = bucket.mode === "filter" ? browseSegments : undefined;
  const searchScopeTypes = bucket.mode === "filter" ? browseTypes : undefined;
  const searchScopeExchange = bucket.mode === "filter" ? browseExchange : undefined;
  const { data: searchHits } = useQuery({
    queryKey: [
      "instruments-search-side",
      debouncedSearch,
      searchScopeSegments,
      searchScopeTypes,
      searchScopeExchange,
    ],
    queryFn: () =>
      InstrumentAPI.search(
        debouncedSearch,
        searchScopeExchange,
        searchScopeSegments,
        30,
        searchScopeTypes,
      ),
    enabled: debouncedSearch.trim().length > 0,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
  const { data: bucketHits } = useQuery({
    queryKey: ["instruments-bucket", bucketKey, browseSegments, browseTypes, browseExchange],
    queryFn: () =>
      InstrumentAPI.search(
        bucket.mode === "query" ? bucket.query : undefined,
        browseExchange,
        browseSegments,
        100,
        browseTypes,
      ),
    enabled:
      search.trim().length === 0 &&
      bucket.mode !== "watchlist" &&
      (bucket.mode === "query" || !!browseSegments || !!browseTypes || !!browseExchange),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  // Tokens currently visible — drives the live-quote pump. Watchlist quotes
  // already include bid/ask, so we only need to pump the search/bucket lists.
  // Keyed off `debouncedSearch` (not the raw input) so a half-typed query
  // doesn't blank the visible-tokens list mid-keystroke.
  const visibleTokens = useMemo<string[]>(() => {
    if (debouncedSearch.trim().length > 0) return (searchHits ?? []).map((s: any) => s.token);
    if (bucket.mode === "watchlist") return [];
    return (bucketHits ?? []).map((s: any) => s.token);
  }, [debouncedSearch, searchHits, bucketHits, bucket]);

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
    if (debouncedSearch.trim().length > 0) return (searchHits ?? []).map(enrich);
    if (bucket.mode === "watchlist") return wlQuotes ?? [];
    return (bucketHits ?? []).map(enrich);
  }, [debouncedSearch, searchHits, wlQuotes, bucketHits, bucket, quoteByToken]);

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
            {/* Render each `group` as a labelled <optgroup>. Core (Favorites,
                All) is flat — no optgroup label, just two top-level options. */}
            {BUCKETS.filter((b) => b.group === "core").map((b) => (
              <option key={b.key} value={b.key} className="bg-popover text-foreground">
                {b.label}
              </option>
            ))}
            {(["asset", "nse", "bse", "mcx"] as const).map((g) => {
              const items = BUCKETS.filter((b) => b.group === g);
              if (items.length === 0) return null;
              return (
                <optgroup key={g} label={GROUP_LABELS[g]}>
                  {items.map((b) => (
                    <option key={b.key} value={b.key} className="bg-popover text-foreground">
                      {b.label}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>

        {/* Granular segment chips — horizontally scrollable row that mirrors
            the dropdown but keeps every segment one click away. Hidden when
            the user is on Favorites or All so it doesn't compete with the
            primary view. Reused for chip-style filtering on touch devices
            where the native <select> popover is awkward. */}
        {bucket.group !== "core" && (
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1 scrollbar-thin">
            {BUCKETS.filter((b) => b.group !== "core").map((b) => (
              <button
                key={b.key}
                type="button"
                onClick={() => setBucketKey(b.key)}
                className={cn(
                  "shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition-colors",
                  bucketKey === b.key
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                )}
              >
                {b.label}
              </button>
            ))}
          </div>
        )}
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
