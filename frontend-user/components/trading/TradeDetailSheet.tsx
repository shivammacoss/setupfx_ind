"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowDownRight,
  ArrowUpRight,
  ArrowLeftRight,
  LineChart,
  Minus,
  Plus,
  ShoppingBag,
  Target,
  Timer,
  Zap,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  InstrumentAPI,
  OrderAPI,
  PositionAPI,
  SegmentSettingsAPI,
  WalletAPI,
} from "@/lib/api";
import { playBuyTone, playSellTone } from "@/lib/trade-audio";
import { getIndexLotSize } from "@/lib/indexLots";
import { cn, formatINR, formatIST, formatPercent, pnlColor } from "@/lib/utils";

interface Props {
  token: string | null;
  open: boolean;
  onClose: () => void;
}

/**
 * Slide-up trade card. Opens over the Markets page when a row is tapped.
 * Card-style modal (not a full route) so closing returns the trader to the
 * exact scroll position in the watchlist they left. All sections are wired
 * to live data: instrument detail, 1 s quote, segment-resolved margin %,
 * wallet summary for available balance, open-position count for the badge.
 *
 * Theme: uses the project's purple `primary` for accent CTAs (Market tab,
 * BUY-side preselect), `buy` (green) and `sell` (red) for direction, never
 * pulling in foreign colours from external mocks.
 */
export function TradeDetailSheet(props: Props) {
  // Lazy-mount: when the sheet is closed we render NOTHING. That tears down
  // every useQuery / useState / useMemo inside the inner component, which
  // matters because the marketwatch page mounts this sheet permanently —
  // without the early-return, the closed sheet still occupied React-tree
  // memory and ran a useMarketStream WS (via the React Query cache it
  // shares with the order panel), making the watchlist feel sluggish.
  if (!props.open || !props.token) return null;
  return <TradeDetailSheetInner {...props} />;
}

function TradeDetailSheetInner({ token, open, onClose }: Props) {
  const qc = useQueryClient();

  // ── Live data ─────────────────────────────────────────────────────
  // Instrument detail is essentially static — cache for 5 min, no refetch
  // on focus / mount (the Markets page already loaded most of these).
  const { data: instrument } = useQuery({
    queryKey: ["instrument", token],
    queryFn: () => InstrumentAPI.detail(token!),
    enabled: !!token,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  // 1.5 s quote — slightly slower than the OrderPanel's 1 s but a sheet that
  // ticks every second on a busy phone re-renders heavily and starves the
  // chart paint loop. 1.5 s still feels live, costs 33 % fewer requests.
  const { data: quote } = useQuery({
    queryKey: ["quote", token],
    queryFn: () => InstrumentAPI.quote(token!),
    enabled: !!token,
    refetchInterval: 1500,
    staleTime: 1000,
  });

  const { data: walletSummary } = useQuery({
    queryKey: ["wallet", "summary"],
    queryFn: () => WalletAPI.summary(),
    refetchInterval: 10_000,
    staleTime: 5_000,
    refetchOnWindowFocus: false,
  });

  const { data: openPositions } = useQuery({
    queryKey: ["positions", "open"],
    queryFn: () => PositionAPI.open(),
    refetchInterval: 6_000,
    staleTime: 3_000,
    refetchOnWindowFocus: false,
  });

  // Live unrealised P&L across ALL open positions — used to compute Equity
  // (= total balance + open unrealised) for the wallet strip below.
  const { data: pnlSummary } = useQuery({
    queryKey: ["positions", "pnl-summary"],
    queryFn: () => PositionAPI.pnlSummary(),
    refetchInterval: 5_000,
    staleTime: 2_000,
    refetchOnWindowFocus: false,
  });

  // ── Local UI state — reset whenever the sheet opens a fresh token ─
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [orderType, setOrderType] = useState<"MARKET" | "LIMIT">("MARKET");
  const [slTpEnabled, setSlTpEnabled] = useState(false);
  const [stopLoss, setStopLoss] = useState<string>("");
  const [target, setTarget] = useState<string>("");
  const [limitPrice, setLimitPrice] = useState<string>("");
  const [unit, setUnit] = useState<"LOTS" | "QTY">("LOTS");
  const [lots, setLots] = useState<number>(1);
  const [submitting, setSubmitting] = useState<"BUY" | "SELL" | null>(null);

  // ── Segment + product ─────────────────────────────────────────────
  const seg = (instrument?.segment ?? "").toUpperCase();
  const exch = (instrument?.exchange ?? "").toUpperCase();
  const isCrypto = seg.includes("CRYPTO") || exch === "CRYPTO";
  const isForex = seg.includes("FOREX") || seg.includes("FX") || exch === "CDS";
  const isFno = seg.includes("FUTURE") || seg.includes("OPTION");
  const isUsdQuoted = isCrypto || isForex || seg.includes("COMMODITIES");
  const productType: "MIS" | "NRML" | "CNC" =
    isCrypto || isForex ? "NRML" : "MIS";

  // ── Segment settings ──────────────────────────────────────────────
  // Admin's margin %/lot caps change rarely — 30 s refetch is plenty, and
  // a generous staleTime keeps the BUY ↔ SELL flip instant (was hitting
  // network on every toggle because the queryKey embeds `side`).
  const { data: effSettings } = useQuery({
    queryKey: ["segment-settings", token, side, productType],
    queryFn: () => SegmentSettingsAPI.effective(token!, side, productType),
    enabled: !!token,
    refetchInterval: 30_000,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });

  // ── Lot resolution (matches OrderPanel) ───────────────────────────
  const minLot =
    Number(effSettings?.min_lot ?? (isCrypto ? 0.001 : isForex ? 0.01 : 1)) || 1;
  const maxLotPerOrder = Number(effSettings?.order_lot ?? 0) || 0;
  const maxLotTotal = Number(effSettings?.max_lot ?? 0) || 0;
  const lotStep = minLot < 1 ? +minLot.toFixed(3) : 1;
  const canonicalLot =
    isCrypto || isForex
      ? null
      : getIndexLotSize(instrument?.symbol, instrument?.name, instrument?.trading_symbol);
  const lotSize = canonicalLot ?? effSettings?.lot_size ?? instrument?.lot_size ?? 1;

  // Reset form state whenever the sheet (re)opens for a different token.
  useEffect(() => {
    if (!open) return;
    setLots(minLot);
    setStopLoss("");
    setTarget("");
    setLimitPrice("");
    setSide("BUY");
    setOrderType("MARKET");
    setSlTpEnabled(false);
    setUnit("LOTS");
  }, [token, open, minLot]);

  // ── Pricing ───────────────────────────────────────────────────────
  const ltp = Number(quote?.ltp ?? 0);
  const bid = Number(quote?.bid ?? quote?.depth?.bids?.[0]?.price ?? ltp);
  const ask = Number(quote?.ask ?? quote?.depth?.asks?.[0]?.price ?? ltp);
  const sellPrice = bid || ltp;
  const buyPrice = ask || ltp;
  const sideQuote = side === "BUY" ? buyPrice : sellPrice;
  const refPrice = orderType === "MARKET" ? sideQuote : Number(limitPrice || ltp);
  const fxRate = Number(quote?.fx_rate ?? 1) || 1;
  const fxMultiplier = isUsdQuoted ? (fxRate > 1 ? fxRate : 83) : 1;

  // ── Margin ────────────────────────────────────────────────────────
  const serverMarginPct =
    effSettings?.margin_percentage != null
      ? Number(effSettings.margin_percentage) / 100
      : isFno
        ? 0.13
        : isCrypto
          ? 0.2
          : isForex
            ? 0.05
            : 1.0;
  const serverLeverage = Number(effSettings?.leverage ?? 1) || 1;
  const marginCalcMode = String(effSettings?.margin_calc_mode || "").toLowerCase();
  const fixedMarginPerLot = Number(effSettings?.fixed_margin_per_lot ?? 0);
  const marginPerLot = useMemo(() => {
    if (marginCalcMode === "fixed" && fixedMarginPerLot > 0) {
      return +fixedMarginPerLot.toFixed(2);
    }
    return +(
      ((lotSize * (refPrice || ltp || 0) * serverMarginPct) / serverLeverage) *
      fxMultiplier
    ).toFixed(2);
  }, [marginCalcMode, fixedMarginPerLot, lotSize, refPrice, ltp, serverMarginPct, serverLeverage, fxMultiplier]);
  const intradayMargin = +(marginPerLot * lots).toFixed(2);
  const carryforwardMargin = +(intradayMargin * 1.4).toFixed(2);
  const availableMargin =
    Number(walletSummary?.available_balance ?? 0) +
    Number(walletSummary?.credit_limit ?? 0);

  // Open-position count on THIS instrument — small badge by the symbol.
  const openPosCount = useMemo(() => {
    const tok = String(token ?? "");
    if (!tok) return 0;
    return (openPositions ?? []).filter(
      (p: any) => String(p?.instrument_token ?? p?.token ?? "") === tok,
    ).length;
  }, [openPositions, token]);

  // ── Formatters ────────────────────────────────────────────────────
  const priceDecimals = isCrypto ? 2 : isForex ? 4 : 2;
  const priceCcy = isUsdQuoted ? "$" : "₹";
  function fmtPrice(n: number | null | undefined): string {
    const v = Number(n ?? 0);
    if (!Number.isFinite(v)) return "—";
    return `${priceCcy}${v.toFixed(priceDecimals)}`;
  }
  function fmtLots(n: number) {
    return isCrypto || isForex ? n.toFixed(isCrypto ? 3 : 2) : String(n);
  }

  // Compact INR for large amounts so a 53-lakh available-margin doesn't
  // overflow the 1/3-width card. Indian notation: L = lakh (1e5), Cr =
  // crore (1e7). Below 1 lakh we stay with the full formatINR (looks
  // natural for typical intraday-margin numbers). Full value lives in the
  // `title` attribute on the card so the trader can still read the exact
  // paisa-precision figure by long-pressing.
  function formatINRCompact(value: number | null | undefined): string {
    const n = Number(value ?? 0);
    if (!Number.isFinite(n)) return "₹ 0";
    const abs = Math.abs(n);
    if (abs >= 1e7) return `₹ ${(n / 1e7).toFixed(2)} Cr`;
    if (abs >= 1e5) return `₹ ${(n / 1e5).toFixed(2)} L`;
    if (abs >= 1e3) return `₹ ${(n / 1e3).toFixed(1)} K`;
    return formatINR(n);
  }

  const expiryShort = useMemo(() => {
    const raw = instrument?.expiry;
    if (!raw) return "";
    const s = String(raw).slice(0, 10);
    const [y, m, d] = s.split("-");
    if (!y || !m || !d) return s;
    const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const mi = Number(m) - 1;
    if (mi < 0 || mi > 11) return s;
    return `${d} ${months[mi]}`;
  }, [instrument?.expiry]);

  // ── Submit ────────────────────────────────────────────────────────
  async function submit(action: "BUY" | "SELL") {
    if (!instrument || !token) {
      toast.error("Instrument not loaded");
      return;
    }
    if (!lots || lots < minLot) {
      toast.error(`Lots must be at least ${minLot}`);
      return;
    }
    if (maxLotPerOrder > 0 && lots > maxLotPerOrder) {
      toast.error(`Maximum ${maxLotPerOrder} lot(s) per order`);
      return;
    }
    if (orderType === "LIMIT" && !Number(limitPrice)) {
      toast.error("Enter a limit price");
      return;
    }
    // ── SL / TP directional sanity ───────────────────────────────────
    // Mirrors the backend validator (order_validator.py: SL_WRONG_SIDE /
    // TP_WRONG_SIDE). Validates SL and TP independently — the old check
    // only fired on SL, which let a wrong-side TP through. A long with
    // TP below entry would auto-trigger the moment the order filled.
    if (slTpEnabled) {
      const entry = orderType === "MARKET" ? refPrice : Number(limitPrice);
      const sl = Number(stopLoss);
      const tp = Number(target);
      if (entry > 0) {
        if (sl > 0) {
          if (action === "BUY" && sl >= entry) {
            toast.error(`Stop loss must be BELOW entry ${fmtPrice(entry)} for a BUY`);
            return;
          }
          if (action === "SELL" && sl <= entry) {
            toast.error(`Stop loss must be ABOVE entry ${fmtPrice(entry)} for a SELL`);
            return;
          }
        }
        if (tp > 0) {
          if (action === "BUY" && tp <= entry) {
            toast.error(`Target must be ABOVE entry ${fmtPrice(entry)} for a BUY`);
            return;
          }
          if (action === "SELL" && tp >= entry) {
            toast.error(`Target must be BELOW entry ${fmtPrice(entry)} for a SELL`);
            return;
          }
        }
      }
    }
    if (intradayMargin > 0 && availableMargin < intradayMargin) {
      toast.error(
        `Insufficient margin — need ${formatINR(intradayMargin)}, have ${formatINR(availableMargin)}`,
      );
      return;
    }

    setSubmitting(action);
    if (action === "BUY") playBuyTone();
    else playSellTone();

    try {
      await OrderAPI.place({
        token,
        action,
        order_type: orderType,
        product_type: productType,
        lots,
        price: orderType === "MARKET" ? 0 : Number(limitPrice || 0),
        trigger_price: 0,
        validity: "DAY",
        is_amo: false,
        stop_loss: slTpEnabled && Number(stopLoss) > 0 ? Number(stopLoss) : null,
        target: slTpEnabled && Number(target) > 0 ? Number(target) : null,
        expected_price: orderType === "MARKET" ? sideQuote : null,
      });
      toast.success(`${action} ${fmtLots(lots)} ${instrument.symbol} placed`, {
        duration: 1500,
      });
      qc.invalidateQueries({ queryKey: ["positions"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
      // Close the sheet on a successful place so the user returns to the
      // watchlist with the new position visible.
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Order rejected");
    } finally {
      setSubmitting(null);
    }
  }

  // Qty ↔ Lots conversion. Stepper always stores `lots`.
  const qty = lots * lotSize;
  const displayValue = unit === "LOTS" ? fmtLots(lots) : String(qty);
  function bumpLots(delta: number) {
    const next = +(lots + delta).toFixed(3);
    const min = Math.max(minLot, next);
    const capped = maxLotPerOrder > 0 ? Math.min(maxLotPerOrder, min) : min;
    setLots(capped);
  }
  function setFromDisplay(text: string) {
    const n = Number(text);
    if (!Number.isFinite(n) || n <= 0) return;
    if (unit === "LOTS") setLots(n);
    else setLots(+(n / lotSize).toFixed(3));
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[calc(100%-1rem)] max-w-md gap-0 p-0">
        <DialogTitle className="sr-only">
          Trade {instrument?.symbol ?? ""}
        </DialogTitle>

        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-lg font-bold">
                  {instrument?.symbol ?? "—"}
                </span>
                {openPosCount > 0 && (
                  <Link
                    href="/orders"
                    aria-label={`${openPosCount} open position${openPosCount === 1 ? "" : "s"}`}
                    className="flex h-5 items-center gap-1 rounded-full bg-primary/15 px-1.5 text-[10px] font-bold text-primary"
                  >
                    <ShoppingBag className="size-3" />
                    {openPosCount}
                  </Link>
                )}
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {expiryShort && <span className="mr-1.5">{expiryShort}</span>}
                LTP <span className="font-tabular tabular-nums">{fmtPrice(ltp)}</span>
              </div>
            </div>
            <div className="pr-7 text-right">
              <div className="flex items-baseline gap-2 font-tabular text-base font-bold tabular-nums">
                <span className="text-sell">{fmtPrice(sellPrice)}</span>
                <span className="text-buy">{fmtPrice(buyPrice)}</span>
              </div>
              <div
                className={cn(
                  "mt-0.5 text-[11px] font-tabular tabular-nums",
                  pnlColor(quote?.change_pct ?? 0),
                )}
              >
                {quote?.change != null ? quote.change.toFixed(2) : "—"} (
                {formatPercent(quote?.change_pct ?? 0)})
              </div>
            </div>
          </div>
        </div>

        {/* ── Action row ──────────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-4 pt-3">
          <Link
            href={`/terminal?token=${encodeURIComponent(token ?? "")}`}
            className="flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium hover:bg-muted/40"
          >
            <LineChart className="size-3.5" /> Charts
          </Link>
          <div className="flex h-9 overflow-hidden rounded-md border border-border bg-card">
            <button
              type="button"
              onClick={() => setSide("BUY")}
              className={cn(
                "flex items-center gap-1 px-3 text-xs font-semibold transition-colors",
                side === "BUY"
                  ? "bg-buy text-buy-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <ArrowUpRight className="size-3.5" /> BUY
            </button>
            <button
              type="button"
              onClick={() => setSide("SELL")}
              className={cn(
                "flex items-center gap-1 border-l border-border px-3 text-xs font-semibold transition-colors",
                side === "SELL"
                  ? "bg-sell text-sell-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <ArrowDownRight className="size-3.5" /> SELL
            </button>
          </div>
          <button
            type="button"
            onClick={() => setSlTpEnabled((v) => !v)}
            className="ml-auto flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium"
          >
            <Target className="size-3.5" /> SL · TP
            <span
              className={cn(
                "relative inline-block h-4 w-7 rounded-full transition-colors",
                slTpEnabled ? "bg-primary" : "bg-muted",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 size-3 rounded-full bg-background transition-all",
                  slTpEnabled ? "left-3" : "left-0.5",
                )}
              />
            </span>
          </button>
        </div>

        {/* ── Stats grid ──────────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-2 px-4 pt-4 text-[11px]">
          <Stat label="LTP High" value={fmtPrice(quote?.high ?? 0)} />
          <Stat label="LTP Low" value={fmtPrice(quote?.low ?? 0)} />
          <Stat label="Open" value={fmtPrice(quote?.open ?? 0)} />
          <Stat
            label="Last Trade"
            value={quote?.timestamp ? formatIST(quote.timestamp, { withSeconds: false }) : "—"}
          />
        </div>

        <div className="my-3 h-px bg-border" />

        {/* ── Lot info row ────────────────────────────────────────── */}
        <div className="flex items-end gap-3 px-4">
          <div className="flex flex-1 gap-4 text-[11px]">
            <LotMeta label="Max Lots" value={maxLotTotal > 0 ? String(maxLotTotal) : "—"} />
            <LotMeta label="Order Lots" value={maxLotPerOrder > 0 ? String(maxLotPerOrder) : "—"} />
            <LotMeta label="Lot Size" value={String(lotSize)} />
          </div>
          <button
            type="button"
            onClick={() => setUnit((u) => (u === "LOTS" ? "QTY" : "LOTS"))}
            className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-[11px] font-medium hover:bg-muted/40"
          >
            <ArrowLeftRight className="size-3" />
            {unit === "LOTS" ? "Qty" : "Lots"}
          </button>
        </div>

        {/* ── Price + Lot stepper ─────────────────────────────────── */}
        <div className="mt-3 grid grid-cols-2 gap-2 px-4">
          <div className="rounded-lg border border-border bg-card px-3 py-3 text-center">
            {orderType === "MARKET" ? (
              <>
                <div className="text-base font-semibold">Market</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Price
                </div>
              </>
            ) : (
              <>
                <input
                  inputMode="decimal"
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  placeholder={fmtPrice(refPrice).replace(priceCcy, "")}
                  className="w-full bg-transparent text-center text-base font-semibold outline-none"
                />
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Limit Price
                </div>
              </>
            )}
          </div>
          <div className="flex items-center justify-between gap-1 rounded-lg border border-border bg-card px-2 py-2">
            <button
              type="button"
              onClick={() => bumpLots(-lotStep)}
              aria-label="Decrease lots"
              className="grid size-9 place-items-center rounded-md hover:bg-muted/40"
            >
              <Minus className="size-4" />
            </button>
            <div className="text-center">
              <input
                inputMode="decimal"
                value={displayValue}
                onChange={(e) => setFromDisplay(e.target.value)}
                className="w-16 bg-transparent text-center text-base font-bold outline-none"
              />
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {unit === "LOTS" ? "Lot" : "Qty"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => bumpLots(lotStep)}
              aria-label="Increase lots"
              className="grid size-9 place-items-center rounded-md hover:bg-muted/40"
            >
              <Plus className="size-4" />
            </button>
          </div>
        </div>

        {/* ── Order type tabs ─────────────────────────────────────── */}
        <div className="mt-3 grid grid-cols-2 gap-2 px-4">
          <button
            type="button"
            onClick={() => setOrderType("MARKET")}
            className={cn(
              "flex h-10 items-center justify-center gap-1.5 rounded-md text-sm font-semibold transition-colors",
              orderType === "MARKET"
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-card text-muted-foreground",
            )}
          >
            <Zap className="size-4" /> Market
          </button>
          <button
            type="button"
            onClick={() => setOrderType("LIMIT")}
            className={cn(
              "flex h-10 items-center justify-center gap-1.5 rounded-md text-sm font-semibold transition-colors",
              orderType === "LIMIT"
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-card text-muted-foreground",
            )}
          >
            <Timer className="size-4" /> Limit
          </button>
        </div>

        {/* ── SL / TP inputs ──────────────────────────────────────── */}
        {slTpEnabled && (
          <div className="mt-3 grid grid-cols-2 gap-2 px-4">
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Stop Loss
              </div>
              <input
                inputMode="decimal"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                placeholder="Optional"
                className="w-full bg-transparent text-base font-semibold outline-none"
              />
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Take Profit
              </div>
              <input
                inputMode="decimal"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="Optional"
                className="w-full bg-transparent text-base font-semibold outline-none"
              />
            </div>
          </div>
        )}

        {/* ── Wallet snapshot ──────────────────────────────────────────
            Slim three-up of wallet-level numbers (Total Balance / Equity /
            Used Margin) so the trader sees their wallet health on the
            same screen as the order they're about to place. Equity =
            total + open unrealised P/L, so it ticks live as positions
            move. Mirrors the bottom-of-trade wallet footer on desktop. */}
        {(() => {
          const walletUsed = Number(walletSummary?.used_margin ?? 0);
          const walletAvail = Number(walletSummary?.available_balance ?? 0);
          const walletTotal = walletUsed + walletAvail;
          const openUnrl = Number(
            (pnlSummary as any)?.open_unrealised ?? (pnlSummary as any)?.unrealized_pnl ?? 0,
          );
          const equity = walletTotal + openUnrl;
          return (
            <div className="mt-4 grid grid-cols-3 gap-2 px-4 text-[11px]">
              <MarginCard
                label="Total Balance"
                value={formatINRCompact(walletTotal)}
                fullValue={formatINR(walletTotal)}
              />
              <MarginCard
                label="Equity"
                value={formatINRCompact(equity)}
                fullValue={`${formatINR(equity)} (incl. ${openUnrl >= 0 ? "+" : ""}${formatINR(openUnrl)} open P/L)`}
                accent={openUnrl >= 0 ? "ok" : "low"}
              />
              <MarginCard
                label="Used Margin"
                value={formatINRCompact(walletUsed)}
                fullValue={formatINR(walletUsed)}
              />
            </div>
          );
        })()}

        {/* ── Margin cards ────────────────────────────────────────────
            Order-level margin breakdown for the trade being composed.
            Compact INR (`₹ 53.27 L`) so a multi-lakh available balance
            doesn't overflow a 1/3-width card. Full value still readable
            via the `title` hover/long-press attribute on the value. */}
        <div className="mt-2 grid grid-cols-3 gap-2 px-4 text-[11px]">
          <MarginCard
            label="Intraday"
            value={formatINRCompact(intradayMargin)}
            fullValue={formatINR(intradayMargin)}
          />
          <MarginCard
            label="Holding"
            value={formatINRCompact(carryforwardMargin)}
            fullValue={formatINR(carryforwardMargin)}
          />
          <MarginCard
            label="Available"
            value={formatINRCompact(availableMargin)}
            fullValue={formatINR(availableMargin)}
            accent={availableMargin >= intradayMargin ? "ok" : "low"}
          />
        </div>

        {/* ── Big BUY / SELL ──────────────────────────────────────── */}
        <div className="mt-4 grid grid-cols-2 gap-2 px-4 pb-4">
          <Button
            type="button"
            loading={submitting === "BUY"}
            disabled={submitting !== null}
            onClick={() => submit("BUY")}
            className="flex h-14 flex-col items-center justify-center gap-0 rounded-lg bg-buy text-buy-foreground hover:bg-buy/90"
          >
            <span className="flex items-center gap-1 text-sm font-bold">
              <ArrowUpRight className="size-4" /> BUY
            </span>
            <span className="font-tabular text-xs tabular-nums opacity-90">
              {fmtPrice(buyPrice)}
            </span>
          </Button>
          <Button
            type="button"
            loading={submitting === "SELL"}
            disabled={submitting !== null}
            onClick={() => submit("SELL")}
            className="flex h-14 flex-col items-center justify-center gap-0 rounded-lg bg-sell text-sell-foreground hover:bg-sell/90"
          >
            <span className="flex items-center gap-1 text-sm font-bold">
              <ArrowDownRight className="size-4" /> SELL
            </span>
            <span className="font-tabular text-xs tabular-nums opacity-90">
              {fmtPrice(sellPrice)}
            </span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="font-tabular text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function LotMeta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="font-tabular text-base font-bold tabular-nums">{value}</div>
    </div>
  );
}

function MarginCard({
  label,
  value,
  fullValue,
  accent,
}: {
  label: string;
  value: string;
  fullValue?: string;
  accent?: "ok" | "low";
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card px-2.5 py-2">
      <div className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        title={fullValue}
        className={cn(
          "truncate font-tabular text-[13px] font-bold tabular-nums",
          accent === "ok" && "text-buy",
          accent === "low" && "text-sell",
        )}
      >
        {value}
      </div>
    </div>
  );
}
