"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
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

  // Live option-chain data — refetches every 2s for tick-by-tick price moves
  const { data: chain, isFetching } = useQuery({
    queryKey: ["option-chain-picker", focusedUnd, activeExpiry],
    queryFn: () => OptionChainAPI.fetch(focusedUnd, activeExpiry),
    enabled: open && !!focusedUnd && !search.trim(),
    refetchInterval: 2000,
    staleTime: 1000,
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
                      onClick={() => onPick(r.token, r.symbol)}
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
              {/* Underlying chips + spot price strip */}
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
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

                {/* Live underlying spot — derived from put-call parity on the
                    front-month chain (or ATM strike fallback). Sits beside
                    the underlying chips so the user always sees what NIFTY /
                    BANKNIFTY is trading at while picking strikes. */}
                {atmSpot != null && (
                  <div className="ml-auto flex items-baseline gap-1.5 rounded-md border border-border bg-muted/30 px-2.5 py-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {focusedUndLabel}
                    </span>
                    <span className="font-tabular text-sm font-semibold text-foreground">
                      ₹{Number(atmSpot).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
              </div>

              {/* Expiry chips */}
              <div className="flex items-center gap-2 overflow-x-auto border-b border-border px-4 py-2 scrollbar-thin">
                {expiries.length === 0 ? (
                  <span className="text-xs text-muted-foreground">
                    {isFetching ? "Loading expiries…" : "No expiries available"}
                  </span>
                ) : (
                  expiries.map((iso) => {
                    const isActive = (selectedExpiry ?? expiries[0]) === iso;
                    return (
                      <button
                        key={iso}
                        type="button"
                        onClick={() => setActiveExpiry(iso)}
                        className={cn(
                          "shrink-0 rounded-full border px-3 py-1 text-xs transition-colors",
                          isActive
                            ? "border-foreground/40 bg-foreground/5 text-foreground"
                            : "border-border text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                        )}
                      >
                        {formatExpiry(iso)}
                      </button>
                    );
                  })
                )}
              </div>

              {/* CE | STRIKE | PE header */}
              <div className="grid grid-cols-[1fr_100px_1fr] items-center border-b border-border bg-muted/10 px-2 py-2 text-[10px] font-semibold uppercase tracking-wider">
                <div className="grid grid-cols-5 gap-1 text-buy">
                  <span>Vol</span>
                  <span>Chg%</span>
                  <span>Bid</span>
                  <span>Ask</span>
                  <span className="text-right">LTP</span>
                </div>
                <div className="text-center text-muted-foreground">STRIKE</div>
                <div className="grid grid-cols-5 gap-1 text-sell">
                  <span>LTP</span>
                  <span>Bid</span>
                  <span>Ask</span>
                  <span>Chg%</span>
                  <span className="text-right">Vol</span>
                </div>
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
                            "relative grid grid-cols-[1fr_100px_1fr] items-center border-b border-border/50 px-2 py-1.5 text-sm transition-colors",
                            isATM && "bg-atm/10"
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
                          <div className="relative flex flex-col items-center">
                            <span
                              className={cn(
                                "font-tabular font-semibold",
                                isATM ? "text-atm" : "text-foreground"
                              )}
                            >
                              {Number(r.strike).toLocaleString("en-IN")}
                            </span>
                            {isATM && (
                              <span className="mt-0.5 rounded bg-atm px-1.5 py-0.5 text-[10px] font-semibold text-atm-foreground">
                                ATM {Number(r.strike).toLocaleString("en-IN")}
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
  if (!leg) {
    return (
      <div className={cn("grid grid-cols-5 gap-1 text-[11px] text-muted-foreground font-tabular")}>
        <span>—</span><span>—</span><span>—</span><span>—</span><span>—</span>
      </div>
    );
  }

  const ltp = leg.ltp;
  const hasLtp = ltp !== null && ltp !== undefined;
  const bid = leg.bid;
  const ask = leg.ask;
  const changePct = leg.change_pct;
  const volume = leg.volume;
  const hasChange = changePct !== null && changePct !== undefined;
  const isPositive = hasChange && changePct >= 0;

  const fmtPrice = (v: any) => (v != null ? formatNumber(v) : "—");
  const fmtVol = (v: any) => {
    if (v == null) return "—";
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return String(v);
  };

  const ltpColor = hasLtp
    ? side === "ce" ? "text-buy" : "text-sell"
    : "text-muted-foreground";

  const changeColor = hasChange
    ? isPositive ? "text-buy" : "text-sell"
    : "text-muted-foreground";

  // Change bar width (max 100%)
  const barWidth = hasChange ? Math.min(Math.abs(changePct) * 3, 100) : 0;

  if (side === "ce") {
    return (
      <button
        type="button"
        onClick={() => onPick(leg.token, leg.symbol)}
        className="group relative rounded-md transition-colors hover:bg-muted/40"
      >
        {/* Movement bar underneath */}
        {barWidth > 0 && (
          <div
            className={cn(
              "absolute right-0 top-0 h-full rounded-r-md opacity-10",
              isPositive ? "bg-buy" : "bg-sell"
            )}
            style={{ width: `${barWidth}%` }}
          />
        )}
        <div className="relative grid grid-cols-5 gap-1 px-1 py-0.5 text-[11px] font-tabular">
          <span className="text-muted-foreground">{fmtVol(volume)}</span>
          <span className={changeColor}>
            {hasChange ? `${isPositive ? "+" : ""}${changePct.toFixed(1)}%` : "—"}
          </span>
          <span className="text-muted-foreground">{fmtPrice(bid)}</span>
          <span className="text-muted-foreground">{fmtPrice(ask)}</span>
          <span className={cn("text-right font-semibold", ltpColor)}>
            {hasLtp ? formatNumber(ltp) : "—"}
          </span>
        </div>
      </button>
    );
  }

  // PE side — mirrored column order
  return (
    <button
      type="button"
      onClick={() => onPick(leg.token, leg.symbol)}
      className="group relative rounded-md transition-colors hover:bg-muted/40"
    >
      {barWidth > 0 && (
        <div
          className={cn(
            "absolute left-0 top-0 h-full rounded-l-md opacity-10",
            isPositive ? "bg-buy" : "bg-sell"
          )}
          style={{ width: `${barWidth}%` }}
        />
      )}
      <div className="relative grid grid-cols-5 gap-1 px-1 py-0.5 text-[11px] font-tabular">
        <span className={cn("font-semibold", ltpColor)}>
          {hasLtp ? formatNumber(ltp) : "—"}
        </span>
        <span className="text-muted-foreground">{fmtPrice(bid)}</span>
        <span className="text-muted-foreground">{fmtPrice(ask)}</span>
        <span className={changeColor}>
          {hasChange ? `${isPositive ? "+" : ""}${changePct.toFixed(1)}%` : "—"}
        </span>
        <span className="text-right text-muted-foreground">{fmtVol(volume)}</span>
      </div>
    </button>
  );
}

function formatExpiry(iso: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d
      .toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })
      .toUpperCase()
      .replace(/,/g, "");
  } catch {
    return iso;
  }
}
