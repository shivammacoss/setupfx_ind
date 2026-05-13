"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, RefreshCw, Search, Star, Trash2, X } from "lucide-react";
import { InstrumentAPI, MarketwatchAPI, SegmentSettingsAPI } from "@/lib/api";
import { cn, formatPrice, pnlColor } from "@/lib/utils";
import { useMarketStream } from "@/lib/useMarketStream";

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
  // Admin matrix row name(s) that drive this chip. When admin toggles a row
  // to `isActive = false`, the bucket disappears entirely from the dropdown
  // and the chip strip — not just its results. A bucket disappears when
  // EVERY row it depends on is inactive (so e.g. a future cross-segment
  // chip won't vanish from one row going off).
  adminRows?: string[];
  // When true, the chip is USER-MANAGED — the list shows only instruments
  // the user has explicitly added (via search + "Add"), not every Kite
  // cached row. Indian segments only. Infoway-fed segments (Forex, Crypto,
  // Stocks, Indices, Commodities) stay non-managed: those feeds are
  // small and curated already.
  managed?: boolean;
};

const BUCKETS: Bucket[] = [
  // Core
  { key: "favorites", label: "Favorites", group: "core", mode: "watchlist" },
  { key: "all", label: "All", group: "core", mode: "query", query: "" },

  // Asset-class groups — strictly Infoway-fed segments. Indian-market
  // equivalents (NSE EQ, BSE EQ, MCX FUT, …) get their own dedicated
  // chips below, so these top-level filters never mix the two. Each
  // segment string here matches the value `_classify_infoway_code` writes
  // to `Instrument.segment` when mirroring Infoway subscriptions.
  { key: "forex", label: "Forex", group: "asset", mode: "filter", segments: ["FOREX"], adminRows: ["FOREX"] },
  { key: "stocks", label: "Stocks", group: "asset", mode: "filter", segments: ["STOCKS"], adminRows: ["STOCKS"] },
  { key: "indices", label: "Indices", group: "asset", mode: "filter", segments: ["INDICES"], adminRows: ["INDICES"] },
  { key: "commodities", label: "Commodities", group: "asset", mode: "filter", segments: ["COMMODITIES"], adminRows: ["COMMODITIES"] },
  { key: "crypto", label: "Crypto", group: "asset", mode: "filter", segments: ["CRYPTO_PERPETUAL", "CRYPTO_SPOT", "CRYPTO_FUTURE"], adminRows: ["CRYPTO"] },

  // NSE granular — managed (user adds instruments explicitly)
  { key: "nse_eq", label: "NSE EQ", group: "nse", mode: "filter", segments: ["NSE_EQUITY"], adminRows: ["NSE_EQ"], managed: true },
  { key: "nse_fut", label: "NSE FUT", group: "nse", mode: "filter", segments: ["NSE_FUTURE", "NSE_INDEX_FUTURE"], adminRows: ["NSE_FUT"], managed: true },
  { key: "nse_opt", label: "NSE OPT", group: "nse", mode: "filter", segments: ["NSE_INDEX_OPTION_BUY", "NSE_INDEX_OPTION_SELL", "NSE_STOCK_OPTION_BUY", "NSE_STOCK_OPTION_SELL"], adminRows: ["NSE_OPT"], managed: true },

  // BSE granular — managed
  { key: "bse_eq", label: "BSE EQ", group: "bse", mode: "filter", segments: ["BSE_EQUITY"], adminRows: ["BSE_EQ"], managed: true },
  { key: "bse_fut", label: "BSE FUT", group: "bse", mode: "filter", segments: ["BSE_FUTURE", "BSE_INDEX_FUTURE"], adminRows: ["BSE_FUT"], managed: true },
  { key: "bse_opt", label: "BSE OPT", group: "bse", mode: "filter", segments: ["BSE_OPTION_BUY", "BSE_OPTION_SELL"], adminRows: ["BSE_OPT"], managed: true },

  // MCX granular — managed
  { key: "mcx_fut", label: "MCX FUT", group: "mcx", mode: "filter", segments: ["MCX_FUTURE"], adminRows: ["MCX_FUT"], managed: true },
  { key: "mcx_opt", label: "MCX OPT", group: "mcx", mode: "filter", segments: ["MCX_OPTION_BUY", "MCX_OPTION_SELL"], adminRows: ["MCX_OPT"], managed: true },
  // Crypto deliberately has no granular split — admin manages a single
  // CRYPTO segment row, the top-level "Crypto" asset chip above covers
  // spot / perpetual / futures with one filter.
];

// GROUP_LABELS removed along with the native <select>+<optgroup> dropdown
// — the new single-strip chip selector flattens every bucket into one
// horizontal scrollable row, so per-group section headings are gone.

const _EXPIRY_MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"] as const;

/** Format an expiry date for the side-panel row. Server returns
 *  `YYYY-MM-DD`; the F&O blotter convention is `DD-MMM-YYYY` so traders
 *  can scan a column of expiries fast (e.g. `26-JUN-2026`). Returns "" for
 *  non-F&O rows (no expiry field). */
function formatExpiry(raw: string | null | undefined): string {
  if (!raw) return "";
  const s = String(raw).slice(0, 10);
  const [y, m, d] = s.split("-");
  if (!y || !m || !d) return s;
  const mi = Number(m) - 1;
  if (mi < 0 || mi > 11) return s;
  return `${d}-${_EXPIRY_MONTHS[mi]}-${y}`;
}

/**
 * Sliding instruments panel — search any tradeable symbol, see live bid/ask,
 * 1-day arrow, click to open it in the terminal. Drives off the existing
 * marketwatch + instrument-search APIs (no new backend work).
 */
export function InstrumentsPanel({ onClose }: Props) {
  const router = useRouter();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [bucketKey, setBucketKey] = useState<string>("favorites");
  // Optimistic favorite toggle — flips the star instantly while the
  // add/remove request is in flight. Reconciled by the watchlist refetch.
  const [pendingFav, setPendingFav] = useState<Map<string, boolean>>(new Map());

  // Inactive admin rows (Block → isActive = false). Refetched every 60 s so
  // a broker toggling a segment off shows up within a minute on every open
  // terminal; the backend caches the resolution for 30 s anyway. Buckets
  // whose admin row is in this set are removed before render so the chip
  // / dropdown entry disappears entirely instead of just returning empty
  // results.
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
        // Core (Favorites / All) buckets have no `adminRows` — always visible.
        if (rows.length === 0) return true;
        // Hide only when EVERY admin row backing the bucket is inactive.
        // Future cross-segment chips (e.g. one chip backed by both NSE_FUT
        // and BSE_FUT) survive partial deactivation.
        return rows.some((r) => !inactiveSet.has(r));
      }),
    [inactiveSet],
  );

  // Fall back to Favorites if the user had a bucket selected that was just
  // turned off — otherwise the dropdown would render the empty selection.
  useEffect(() => {
    if (!visibleBuckets.find((b) => b.key === bucketKey)) {
      setBucketKey("favorites");
    }
  }, [visibleBuckets, bucketKey]);

  const bucket = visibleBuckets.find((b) => b.key === bucketKey) ?? visibleBuckets[0];

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

  // Token → item-id lookup so the star can flip a row in or out of the
  // active watchlist without a second round-trip to find the item.
  const favItemByToken = useMemo(() => {
    const map = new Map<string, string>();
    for (const it of activeWl?.items ?? []) {
      if (it?.instrument_token && it?.id) map.set(String(it.instrument_token), String(it.id));
    }
    return map;
  }, [activeWl]);

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
      setPendingFav((prev) => {
        const next = new Map(prev);
        next.delete(tok);
        return next;
      });
      toast.error(e?.message || (currentlyFav ? "Failed to remove" : "Failed to add"));
    }
  }

  // Managed-segment marker — Indian chips (NSE EQ / NSE FUT / NSE OPT /
  // BSE * / MCX *) show only what the user has explicitly added. The
  // admin row name (e.g. "NSE_EQ") is the segment key on the backend.
  const managedSegmentName =
    bucket.managed && bucket.adminRows?.[0] ? bucket.adminRows[0] : null;

  // Per-segment "added items" list. Drives both the empty-list render
  // when search is off AND the "✓ Added" badge on search results.
  const { data: segmentItems } = useQuery<any[]>({
    queryKey: ["segment-items", managedSegmentName],
    queryFn: () => MarketwatchAPI.segmentItems(managedSegmentName!),
    enabled: !!managedSegmentName,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
  const addedTokenSet = useMemo(() => {
    const s = new Set<string>();
    for (const it of segmentItems ?? []) {
      if (it?.instrument_token) s.add(String(it.instrument_token));
    }
    return s;
  }, [segmentItems]);

  async function addToSegment(token: string, symbol: string) {
    if (!managedSegmentName) return;
    try {
      await MarketwatchAPI.addSegmentItem(managedSegmentName, token);
      qc.invalidateQueries({ queryKey: ["segment-items", managedSegmentName] });
      toast.success(`Added ${symbol} to ${bucket.label}`, { duration: 1500 });
    } catch (e: any) {
      toast.error(e?.message || `Failed to add ${symbol}`);
    }
  }

  async function removeFromSegment(token: string, symbol: string) {
    if (!managedSegmentName) return;
    try {
      await MarketwatchAPI.removeSegmentItem(managedSegmentName, token);
      qc.invalidateQueries({ queryKey: ["segment-items", managedSegmentName] });
      toast.success(`Removed ${symbol}`, { duration: 1500 });
    } catch (e: any) {
      toast.error(e?.message || `Failed to remove ${symbol}`);
    }
  }

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
      // Managed segments don't pre-browse the full Kite cache — they
      // only render the user's added items. The browse only fires for
      // Forex / Crypto / etc. (Infoway-fed) chips.
      !managedSegmentName &&
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
    if (managedSegmentName) {
      return (segmentItems ?? []).map((it: any) => String(it.instrument_token));
    }
    return (bucketHits ?? []).map((s: any) => s.token);
  }, [debouncedSearch, searchHits, bucketHits, bucket, managedSegmentName, segmentItems]);

  // Live quote pump — uses the `/ws/marketdata` stream so bid/ask/change tick
  // at the same 250 ms cadence as the order panel / positions, instead of a
  // 2 s REST poll. The server-side `_overlay_all` runs per-tick: Infoway
  // (forex/crypto/metals/energy) + Zerodha (Indian) + admin spread. The
  // initial REST snapshot below seeds rows with bid/ask immediately on first
  // render — without it, rows would render "—" until the first WS tick (up
  // to one heartbeat). After the first tick the stream takes over.
  const tokensKey = visibleTokens.join(",");
  const { data: liveQuotes } = useQuery<any[]>({
    queryKey: ["instruments-batch-quotes-seed", tokensKey],
    queryFn: () => InstrumentAPI.quotesBatch(visibleTokens),
    enabled: visibleTokens.length > 0,
    staleTime: 30_000,
    refetchInterval: false,
  });
  const streamQuotes = useMarketStream(visibleTokens);
  const quoteByToken = useMemo(() => {
    const map = new Map<string, any>();
    // Seed with the REST snapshot first so the row has bid/ask before the
    // first WS tick. Live ticks overwrite per token as they arrive.
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
        // Expiry date for F&O contracts — surfaced under the symbol so the
        // trader knows exactly which expiry they're about to click into
        // without having to open the contract first. Index/equity rows
        // have no expiry, so the field is null and the row renders symbol
        // only.
        expiry: s.expiry ?? null,
        instrument_type: s.instrument_type ?? null,
        bid: live?.bid ?? null,
        ask: live?.ask ?? null,
        // LTP surfaced too so the row can fall back to it when the order book
        // (bid/ask) hasn't been pushed yet — equity / index instruments with
        // a Zerodha subscription land LTP before their depth, and traders
        // saw "— —" for the first second on every refresh. With LTP available
        // both cells render instantly and update to the real bid/ask the
        // moment depth arrives.
        ltp: live?.ltp ?? null,
        change_pct: live?.change_pct ?? null,
      };
    };
    if (debouncedSearch.trim().length > 0) return (searchHits ?? []).map(enrich);
    if (bucket.mode === "watchlist") return wlQuotes ?? [];
    if (managedSegmentName) {
      // Segment items come back as {id, instrument_token, symbol, exchange}.
      // Shape them like search hits so the same `enrich` works.
      return (segmentItems ?? []).map((it: any) =>
        enrich({
          token: it.instrument_token,
          symbol: it.symbol,
          exchange: it.exchange,
          segment: null,
          expiry: null,
          instrument_type: null,
        }),
      );
    }
    return (bucketHits ?? []).map(enrich);
  }, [
    debouncedSearch, searchHits, wlQuotes, bucketHits, bucket,
    quoteByToken, managedSegmentName, segmentItems,
  ]);

  // Auto-clear search when panel re-opens
  useEffect(() => {
    setSearch("");
  }, []);

  function pickToken(token: string) {
    router.push(`/terminal?token=${encodeURIComponent(token)}`);
    onClose();
  }

  return (
    <aside className="flex h-full w-[min(340px,92vw)] shrink-0 animate-in slide-in-from-left-4 fade-in-0 flex-col border-r border-border bg-card duration-200">
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
        {/* Bucket selector — single horizontal chip strip covering every
            bucket (Favorites + All + asset / NSE / BSE / MCX). Replaces
            the old native <select> + secondary chip-strip combo: that
            popped a Windows-style OS dropdown the user couldn't style,
            and on mobile the chip row below it was hidden whenever
            Favorites / All was active. One strip = one consistent
            tap-and-pick UX on every device. `visibleBuckets` already
            hides any bucket whose admin row is flagged inactive. */}
        <div
          className="scroll-smooth -mx-1 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          style={{
            WebkitOverflowScrolling: "touch",
            maskImage:
              "linear-gradient(to right, black 0%, black calc(100% - 16px), transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to right, black 0%, black calc(100% - 16px), transparent 100%)",
          }}
        >
          {visibleBuckets.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => setBucketKey(b.key)}
              className={cn(
                "shrink-0 snap-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition-colors",
                bucketKey === b.key
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground",
              )}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* Column header */}
      <div className="grid grid-cols-[1fr_58px_58px_24px] gap-2 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
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
              : managedSegmentName
                ? `No instruments yet. Search above to add to ${bucket.label}.`
                : "Add instruments to your watchlist to see them here."}
          </div>
        )}
        {list.map((q: any) => {
          const token = String(q.instrument_token);
          const starred = isFav(token);
          // Bid/ask can be null for a few seconds after the row appears — the
          // first WS tick + REST seed need to land. Fall back to LTP so the
          // user sees *some* number while we wait, instead of two em-dashes
          // making the panel look broken. The chart's price line uses the
          // same fallback, so the strip and the chart agree on what to show
          // when the order book hasn't been delivered yet.
          // For search-hit rows that don't carry bid/ask of their own, also
          // pull from the live WS overlay so a starred-then-typed search lands
          // a number quickly.
          const liveOverlay = quoteByToken.get(token);
          const bidDisplay = q.bid ?? liveOverlay?.bid ?? q.ltp ?? null;
          const askDisplay = q.ask ?? liveOverlay?.ask ?? q.ltp ?? null;
          const changePct = q.change_pct ?? liveOverlay?.change_pct ?? null;
          return (
            <div
              key={token}
              className="grid w-full grid-cols-[1fr_58px_58px_24px] items-start gap-2 border-b border-border/40 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/30"
            >
              <div className="flex min-w-0 items-start gap-1.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(token);
                  }}
                  aria-label={starred ? `Remove ${q.symbol} from favorites` : `Add ${q.symbol} to favorites`}
                  title={starred ? "Remove from favorites" : "Add to favorites"}
                  className="mt-0.5 grid size-5 shrink-0 place-items-center rounded hover:bg-muted/40"
                >
                  <Star
                    className={cn(
                      "size-3 transition-colors",
                      starred ? "fill-atm text-atm" : "text-muted-foreground",
                    )}
                  />
                </button>
                {/* Managed-segment action button:
                    • Search mode + not added → "+" Add to segment
                    • Search mode + already added → checkmark badge (no action)
                    • Viewing segment list (no search) → "🗑" Remove from segment
                    Non-managed buckets render nothing here. */}
                {managedSegmentName && (() => {
                  const alreadyAdded = addedTokenSet.has(token);
                  const inSearchMode = debouncedSearch.trim().length > 0;
                  if (inSearchMode && !alreadyAdded) {
                    return (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          addToSegment(token, q.symbol);
                        }}
                        aria-label={`Add ${q.symbol} to ${bucket.label}`}
                        title={`Add to ${bucket.label}`}
                        className="mt-0.5 grid size-5 shrink-0 place-items-center rounded text-primary hover:bg-primary/10"
                      >
                        <Plus className="size-3" />
                      </button>
                    );
                  }
                  if (inSearchMode && alreadyAdded) {
                    return (
                      <span
                        title="Already in this segment"
                        className="mt-0.5 grid size-5 shrink-0 place-items-center text-[9px] font-bold text-emerald-500"
                      >
                        ✓
                      </span>
                    );
                  }
                  // Showing segment list — every row is in the segment.
                  return (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromSegment(token, q.symbol);
                      }}
                      aria-label={`Remove ${q.symbol} from ${bucket.label}`}
                      title={`Remove from ${bucket.label}`}
                      className="mt-0.5 grid size-5 shrink-0 place-items-center rounded text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  );
                })()}
                <button
                  type="button"
                  onClick={() => pickToken(token)}
                  className="flex min-w-0 flex-col items-start leading-tight text-left"
                >
                  {/* `break-all` (not `truncate`) lets a long F&O symbol like
                      "BANKNIFTY25DECFUT" wrap onto a second line instead of
                      getting clipped with an ellipsis. */}
                  <span className="break-all font-medium leading-snug">{q.symbol}</span>
                  {q.expiry && (
                    <span className="truncate text-[9px] uppercase tracking-wider text-muted-foreground">
                      {formatExpiry(q.expiry)}
                    </span>
                  )}
                </button>
              </div>
              <button
                type="button"
                onClick={() => pickToken(token)}
                className="text-right font-tabular tabular-nums"
              >
                {bidDisplay != null ? formatPrice(bidDisplay, q.segment, q.exchange) : "—"}
              </button>
              <button
                type="button"
                onClick={() => pickToken(token)}
                className="text-right font-tabular tabular-nums"
              >
                {askDisplay != null ? formatPrice(askDisplay, q.segment, q.exchange) : "—"}
              </button>
              <span
                className={cn(
                  "ml-auto grid size-5 place-items-center rounded",
                  pnlColor(changePct ?? 0)
                )}
                title={
                  changePct != null ? `${Number(changePct).toFixed(2)}%` : "no change data"
                }
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
    </aside>
  );
}
