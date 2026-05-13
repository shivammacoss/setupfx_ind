"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Search, TrendingUp, X } from "lucide-react";
import { InstrumentAPI, OptionChainAPI } from "@/lib/api";
import { Dialog, DialogContent, DialogPortal, DialogOverlay } from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn, formatNumber } from "@/lib/utils";

interface UnderlyingCfg {
  label: string;
  symbol: string;
  color: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the selected leg's token + symbol — parent should add it as a tab. */
  onPick: (token: string, symbol: string) => void;
}

const FALLBACK_UNDERLYINGS: UnderlyingCfg[] = [
  { label: "Nifty", symbol: "NIFTY", color: "emerald" },
  { label: "BankNifty", symbol: "BANKNIFTY", color: "violet" },
  { label: "Sensex", symbol: "SENSEX", color: "rose" },
];

const COLOR_DOT: Record<string, string> = {
  emerald: "bg-emerald-500",
  violet: "bg-violet-500",
  rose: "bg-rose-500",
  amber: "bg-amber-500",
  sky: "bg-sky-500",
  fuchsia: "bg-fuchsia-500",
};

export function OptionChainPicker({ open, onOpenChange, onPick }: Props) {
  // Fetch admin-configured underlyings + visible expiry / strike count
  const { data: cfg } = useQuery({
    queryKey: ["option-chain-config"],
    queryFn: () => OptionChainAPI.config(),
    staleTime: 60_000,
    enabled: open,
  });

  const underlyings: UnderlyingCfg[] = cfg?.underlyings ?? FALLBACK_UNDERLYINGS;

  // Default to the first configured underlying (NIFTY) instead of "All" —
  // makes the chain immediately useful on open without needing a click.
  const [activeUnd, setActiveUnd] = useState<string | "ALL">(
    () => underlyings[0]?.symbol ?? "NIFTY"
  );
  const [activeExpiry, setActiveExpiry] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search input — 200ms delay for snappy feel without hammering API
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(t);
  }, [search]);

  // Re-pin the default underlying every time the picker opens — and once
  // admin-config underlyings load, ensure the active selection is valid.
  useEffect(() => {
    if (!open) return;
    setSearch("");
    setDebouncedSearch("");
    setActiveExpiry(undefined);
    setActiveUnd(underlyings[0]?.symbol ?? "NIFTY");
  }, [open, underlyings]);

  // For "ALL" we just hit the first underlying — option chain is keyed by one
  // underlying. Picking "All" really means "first underlying with the global
  // expiry chips". We still surface the chip so the UI matches the screenshot.
  const focusedUnd = activeUnd === "ALL" ? underlyings[0]?.symbol ?? "NIFTY" : activeUnd;
  const focusedUndLabel =
    underlyings.find((u) => u.symbol === focusedUnd)?.label ?? focusedUnd;

  // Live option-chain data — refetches every 2s for tick-by-tick price moves.
  // `placeholderData: keep previous` so chip-switching never blanks the table
  // — the previously rendered chain stays on-screen until the new one lands.
  // `staleTime: 5000` matches the TerminalLayout's 6 s background prefetch
  // so the dialog hits the cache (instant paint) on every open.
  const { data: chain, isFetching } = useQuery({
    queryKey: ["option-chain-picker", focusedUnd, activeExpiry],
    queryFn: () => OptionChainAPI.fetch(focusedUnd, activeExpiry),
    enabled: open && !!focusedUnd && !search.trim(),
    refetchInterval: 2000,
    staleTime: 5000,
    placeholderData: (prev) => prev,
  });

  const expiries: string[] = chain?.expiries ?? [];
  const rows: any[] = chain?.rows ?? [];
  const atmStrike: number | null = chain?.atm_strike ?? null;
  // `atm_spot` is the put-call-parity-derived spot price. Falls back to the
  // ATM strike if no leg has a live LTP (then ATM strike ≈ spot).
  const atmSpot: number | null = (chain?.atm_spot ?? null) ?? atmStrike;
  const selectedExpiry = chain?.selected_expiry ?? activeExpiry ?? expiries[0];
  const dataSource: "live" | "rest" | "none" | undefined = chain?.data_source;
  const dataSourceError: string | null | undefined = chain?.data_source_error;

  // Free-text search across instruments — debounced for speed
  const { data: searchHits, isFetching: isSearching } = useQuery({
    queryKey: ["option-picker-search", debouncedSearch],
    queryFn: () => InstrumentAPI.search(debouncedSearch, undefined, undefined, 30),
    enabled: open && debouncedSearch.trim().length > 1,
    staleTime: 30_000,
  });

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const ce = r.ce?.symbol?.toLowerCase?.() ?? "";
      const pe = r.pe?.symbol?.toLowerCase?.() ?? "";
      const strike = String(r.strike);
      return ce.includes(q) || pe.includes(q) || strike.includes(q);
    });
  }, [rows, search]);

  // Auto-scroll to ATM when it changes
  const atmRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      atmRef.current?.scrollIntoView({ block: "center", behavior: "auto" });
    }, 50);
    return () => clearTimeout(t);
  }, [atmStrike, open, focusedUnd, selectedExpiry]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex max-h-[85vh] w-[min(1100px,95vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          )}
        >
          {/* Search bar */}
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Search className="size-4 text-muted-foreground" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search instruments…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {dataSource && (
              <span
                title={
                  dataSource === "live"
                    ? "Streaming live ticks from Zerodha KiteTicker"
                    : dataSource === "rest"
                      ? "Last close from Zerodha REST /quote (market closed or pre-open)"
                      : "No Zerodha data available — subscribe instruments in admin → Zerodha Connect"
                }
                className={cn(
                  "rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                  dataSource === "live"
                    ? "bg-buy/15 text-buy"
                    : dataSource === "rest"
                      ? "bg-atm/20 text-atm"
                      : "bg-destructive/15 text-destructive"
                )}
              >
                {dataSource === "live" ? "LIVE" : dataSource === "rest" ? "LAST CLOSE" : "NO DATA"}
              </span>
            )}
            <DialogPrimitive.Close className="rounded-md border border-border p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Close">
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>

          {/* If user is searching globally, render search-hit list and skip the chain */}
          {search.trim() ? (
            <div className="flex-1 overflow-y-auto scrollbar-thin">
              {isSearching ? (
                <div className="grid h-32 place-items-center text-xs text-muted-foreground">Searching…</div>
              ) : (searchHits ?? []).length === 0 ? (
                <div className="grid h-32 place-items-center text-xs text-muted-foreground">
                  {debouncedSearch.trim().length < 2 ? "Type at least 2 characters…" : "No matches"}
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {searchHits!.map((r: any) => (
                    <button
                      key={r.token}
                      type="button"
                      onClick={() => {
                        // Inside the Option Chain dialog the search hit
                        // should LOAD that symbol's option chain, not
                        // add it as a chart tab. Set it as the active
                        // underlying and clear search; the chain query
                        // (which is `enabled: !search.trim()`) re-runs
                        // automatically and renders the strikes grid.
                        // Anything without a derivatives book (e.g. an
                        // ETF) will simply produce an empty chain.
                        setActiveUnd(r.symbol);
                        setActiveExpiry(undefined);
                        setSearch("");
                        setDebouncedSearch("");
                      }}
                      className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-muted/30"
                    >
                      <div>
                        <div className="font-medium">{r.symbol}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {r.exchange} · {r.segment ?? r.instrument_type ?? ""}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground">{r.name ?? ""}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Underlying filter chips — horizontally scrollable strip
                  matching the screenshot: "All" as a solid dark pill, each
                  configured underlying as a bordered pill with a coloured
                  dot. Scrolling is smooth + scrollbar-free for a clean
                  mobile feel. */}
              <div className="border-b border-border px-4 py-3">
                <div className="scroll-smooth -mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                  <Chip
                    label="All"
                    active={activeUnd === "ALL"}
                    onClick={() => setActiveUnd("ALL")}
                  />
                  {underlyings.map((u) => (
                    <Chip
                      key={u.symbol}
                      label={u.label}
                      color={u.color}
                      active={activeUnd === u.symbol}
                      onClick={() => setActiveUnd(u.symbol)}
                    />
                  ))}
                  {/* Ad-hoc chip for an underlying found via free-text
                      search that's not in the admin's configured list
                      (e.g. SBIN). Lets the user flip back to a configured
                      symbol without re-typing. */}
                  {activeUnd !== "ALL" &&
                    !underlyings.some((u) => u.symbol === activeUnd) && (
                      <Chip label={activeUnd} color="sky" active onClick={() => {}} />
                    )}
                </div>
              </div>

              {/* Expiry dropdown — native <select> styled to match the
                  screenshot. Way more compact than a row of pills, and
                  the OS-level picker is the right UX on mobile where the
                  expiry chips otherwise overflow horizontally. */}
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
                {expiries.length === 0 ? (
                  <span className="text-xs text-muted-foreground">
                    {isFetching ? "Loading expiries…" : "No expiries available"}
                  </span>
                ) : (
                  <div className="relative inline-flex">
                    <select
                      value={selectedExpiry ?? expiries[0] ?? ""}
                      onChange={(e) => setActiveExpiry(e.target.value)}
                      className="cursor-pointer appearance-none rounded-md border border-border bg-card py-1.5 pl-3 pr-9 text-sm font-semibold outline-none transition-colors hover:bg-muted/30 focus:border-foreground/40"
                    >
                      {expiries.map((iso) => (
                        <option key={iso} value={iso}>
                          {formatExpiryLong(iso)}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                )}
                {atmSpot != null && (
                  <div className="flex items-baseline gap-1.5 rounded-md border border-border bg-muted/30 px-2.5 py-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {focusedUndLabel}
                    </span>
                    <span className="font-tabular text-sm font-semibold text-foreground">
                      ₹{Number(atmSpot).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
              </div>

              {/* CE | STRIKE | PE header — three equal-feeling columns,
                  CE in green and PE in red, matching the screenshot. */}
              <div className="grid grid-cols-3 items-center border-b border-border bg-muted/10 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider">
                <div className="text-left text-buy">CE</div>
                <div className="text-center text-muted-foreground">Strike</div>
                <div className="text-right text-sell">PE</div>
              </div>

              {/* Inline error banner — shown when the Kite REST batch fails. */}
              {dataSourceError && (
                <div className="mx-4 mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
                  <span className="font-semibold">Zerodha returned no prices: </span>
                  <span className="text-muted-foreground">{dataSourceError}</span>
                </div>
              )}

              {/* Rows */}
              <div className="flex-1 overflow-y-auto scrollbar-thin">
                {filteredRows.length === 0 ? (
                  <div className="grid h-32 place-items-center text-xs text-muted-foreground">
                    {isFetching ? "Loading…" : "No options. Subscribe instruments via admin → Zerodha Connect."}
                  </div>
                ) : (
                  <div>
                    {filteredRows.map((r) => {
                      const isATM = r.strike === atmStrike;
                      return (
                        <div
                          key={r.strike}
                          ref={isATM ? atmRef : undefined}
                          className={cn(
                            "relative grid grid-cols-3 items-stretch px-4 py-3 text-sm transition-colors",
                            isATM
                              ? // ATM band: pale-orange tint + green top
                                // and bottom rules, mirroring the user's
                                // screenshot. The centered "ATM" pill is
                                // drawn separately so it sits in the
                                // middle of the row regardless of leg
                                // content.
                                "border-y border-buy/70 bg-atm/15"
                              : "border-b border-border/50",
                          )}
                        >
                          {/* CE leg */}
                          <Leg
                            leg={r.ce}
                            expiryIso={selectedExpiry ?? expiries[0]}
                            onPick={onPick}
                            side="ce"
                          />

                          {/* Strike center */}
                          <div className="relative flex flex-col items-center justify-center">
                            <span
                              className={cn(
                                "font-tabular text-lg font-bold tabular-nums",
                                isATM ? "text-atm" : "text-foreground",
                              )}
                            >
                              {Number(r.strike).toLocaleString("en-IN")}
                            </span>
                            {isATM && atmSpot != null && (
                              <span className="absolute left-1/2 top-0 z-10 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-buy px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
                                <TrendingUp className="size-3" />
                                ATM{" "}
                                {Number(atmSpot).toLocaleString("en-IN", {
                                  maximumFractionDigits: 2,
                                })}
                              </span>
                            )}
                          </div>

                          {/* PE leg */}
                          <Leg
                            leg={r.pe}
                            expiryIso={selectedExpiry ?? expiries[0]}
                            onPick={onPick}
                            side="pe"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}

function Chip({
  label,
  active,
  color,
  onClick,
}: {
  label: string;
  active: boolean;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
        active
          ? "border-foreground/50 bg-foreground/5 text-foreground"
          : "border-border text-muted-foreground hover:bg-muted/30 hover:text-foreground"
      )}
    >
      {color && (
        <span className={cn("size-1.5 rounded-full", COLOR_DOT[color] ?? "bg-foreground")} />
      )}
      {label}
    </button>
  );
}

function Leg({
  leg,
  expiryIso,
  onPick,
  side,
}: {
  leg: any;
  expiryIso?: string;
  onPick: (token: string, symbol: string) => void;
  side: "ce" | "pe";
}) {
  // Underlying-only label (drop the CE/PE suffix and the strike + expiry
  // codes that follow it in the Zerodha symbol). e.g.
  // "NIFTY26MAY23500CE" → "NIFTY". When the leg is missing entirely
  // (rare — usually means Kite returned no quote for that strike) we
  // still want the column to render the underlying so the user sees a
  // recognisable row layout, hence the fallback to dash.
  const underlying = (leg?.symbol ?? "—")
    .replace(/\d+\s*$/i, "")
    .replace(/(CE|PE)\s*$/i, "")
    .replace(/\d{2}[A-Z]{3}\d{0,2}.*$/i, "")
    .trim() || "—";
  const expiryLabel = expiryIso ? formatExpiryLong(expiryIso) : "—";
  const isCE = side === "ce";
  const align = isCE ? "items-start text-left" : "items-end text-right";
  const ltpColor = isCE ? "text-buy" : "text-sell";

  // No-quote state: still show the symbol + expiry so the row keeps its
  // shape, but skip the LTP line with a single em-dash. Matches the
  // screenshot's "—" placeholder rows.
  if (!leg || leg.ltp == null) {
    return (
      <div
        className={cn(
          "flex min-h-[3.25rem] flex-col justify-center gap-0.5 px-1",
          align,
        )}
      >
        <span className="text-[13px] font-semibold leading-tight text-foreground">
          {underlying}
        </span>
        <span className="text-[10px] leading-tight text-muted-foreground">
          {expiryLabel} · LTP
        </span>
        <span className="text-[13px] font-semibold leading-tight text-muted-foreground">
          —
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onPick(leg.token, leg.symbol)}
      className={cn(
        "flex min-h-[3.25rem] flex-col justify-center gap-0.5 rounded-md px-1 transition-colors hover:bg-muted/40",
        align,
      )}
    >
      <span className="text-[13px] font-semibold leading-tight text-foreground">
        {underlying}
      </span>
      <span className="text-[10px] leading-tight text-muted-foreground">
        {expiryLabel} · LTP
      </span>
      <span className={cn("text-[13px] font-semibold leading-tight font-tabular", ltpColor)}>
        LTP ₹{formatNumber(leg.ltp)}
      </span>
    </button>
  );
}

function formatExpiryLong(iso: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    // "19 May 2026" — matches the dropdown + per-row labels in the
    // screenshot. Day un-padded so it reads naturally as a date phrase.
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
