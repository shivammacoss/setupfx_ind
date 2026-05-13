"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Minus, Plus } from "lucide-react";
import { OrderAPI } from "@/lib/api";
import { playBuyTone, playSellTone } from "@/lib/trade-audio";
import { cn } from "@/lib/utils";

interface Props {
  instrument: any;
  ltp: number;
  bid?: number | null;
  ask?: number | null;
}

/**
 * Mobile-only quick-trade strip that sits above the chart on the terminal
 * page. Mirrors the MT5 / cTrader top-of-chart pattern: a SELL price card
 * (bid), a centre lot-stepper, and a BUY price card (ask). Tapping a side
 * fires a MARKET order at the displayed price — no second screen, no
 * confirm dialog. For LIMIT / SL-M / SL-TP / product-type the trader uses
 * the desktop order panel; mobile keeps the surface minimal.
 */
export function MobileQuickTradeBar({ instrument, ltp, bid, ask }: Props) {
  const qc = useQueryClient();

  const seg = (instrument?.segment ?? "").toUpperCase();
  const exch = (instrument?.exchange ?? "").toUpperCase();
  const isCrypto = seg.includes("CRYPTO") || exch === "CRYPTO";
  const isForex = seg.includes("FOREX") || seg.includes("FX") || exch === "CDS";
  const defaultProduct: "MIS" | "NRML" | "CNC" = isCrypto || isForex ? "NRML" : "MIS";

  // Lot defaults — sub-1 minimum for crypto/forex so the stepper steps in
  // fractional units (0.01, 0.001) rather than whole lots.
  const minLot = isCrypto ? 0.001 : isForex ? 0.01 : 1;
  const lotStep = minLot;
  const [lots, setLots] = useState<number>(minLot);
  const [submitting, setSubmitting] = useState<"BUY" | "SELL" | null>(null);

  // Reset lots when the instrument swaps so a crypto symbol doesn't get
  // stuck at the previous equity's "1" default.
  useEffect(() => {
    setLots(minLot);
  }, [instrument?.token, minLot]);

  const priceDecimals = isCrypto ? 2 : isForex ? 4 : 2;
  const priceCcy = isCrypto || isForex ? "$" : "₹";
  const sellPrice = bid ?? ltp ?? 0;
  const buyPrice = ask ?? ltp ?? 0;
  function fmtPrice(n: number) {
    return `${priceCcy}${Number(n || 0).toFixed(priceDecimals)}`;
  }
  function fmtLots(n: number) {
    return isCrypto || isForex ? n.toFixed(isCrypto ? 3 : 2) : String(n);
  }

  async function place(side: "BUY" | "SELL") {
    if (!instrument?.token) {
      toast.error("Instrument not loaded");
      return;
    }
    if (!lots || lots < minLot) {
      toast.error(`Lots must be at least ${minLot}`);
      return;
    }
    setSubmitting(side);
    // Audio cue fires synchronously on the click — same as OrderPanel — so
    // the user gets confirmation before the network round-trip.
    if (side === "BUY") playBuyTone();
    else playSellTone();

    try {
      await OrderAPI.place({
        token: instrument.token,
        action: side,
        order_type: "MARKET",
        product_type: defaultProduct,
        lots,
        price: 0,
        trigger_price: 0,
        validity: "DAY",
        is_amo: false,
        stop_loss: null,
        target: null,
        expected_price: side === "BUY" ? buyPrice : sellPrice,
      });
      toast.success(`${side} ${fmtLots(lots)} ${instrument.symbol} placed`, {
        duration: 1500,
      });
      qc.invalidateQueries({ queryKey: ["positions"] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["wallet"] });
    } catch (e: any) {
      toast.error(e?.message || "Order rejected");
    } finally {
      setSubmitting(null);
    }
  }

  // Sticky bottom-of-chart layout — three big tiles (SELL · LOTS · BUY).
  // Matches the minimal screenshot the user signed off on: no symbol /
  // price duplication, no "Trade" header, no "1 lot = X units" footer —
  // the chart itself shows price on the right scale, and the bottom bar
  // is just for ACTION. Lots are tappable + editable inline; tap-and-
  // hold isn't supported on mobile so we use small +/- spans inside the
  // box to keep the touch target reachable without crowding the buttons.
  function fmtAria(price: number) {
    return `${fmtPrice(price)}`;
  }
  return (
    <div className="shrink-0 border-t border-border bg-card lg:hidden">
      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2 p-2">
        <button
          type="button"
          onClick={() => place("SELL")}
          disabled={submitting !== null || !instrument}
          aria-label={`Sell ${instrument?.symbol ?? ""} at market ${fmtAria(sellPrice)}`}
          className={cn(
            "flex items-center justify-center rounded-md bg-sell py-3 text-base font-bold uppercase tracking-wider text-white shadow-sm transition-opacity",
            (submitting !== null || !instrument) && "opacity-50",
            submitting === "SELL" && "animate-pulse",
          )}
        >
          SELL
        </button>

        <div className="flex min-w-[88px] flex-col items-center justify-center rounded-md border border-border bg-background px-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Lots
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setLots((x) => +Math.max(minLot, x - lotStep).toFixed(3))}
              aria-label="Decrease lots"
              className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            >
              <Minus className="size-3" />
            </button>
            <span className="min-w-[28px] text-center font-tabular text-lg font-bold tabular-nums">
              {fmtLots(lots)}
            </span>
            <button
              type="button"
              onClick={() => setLots((x) => +(x + lotStep).toFixed(3))}
              aria-label="Increase lots"
              className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            >
              <Plus className="size-3" />
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => place("BUY")}
          disabled={submitting !== null || !instrument}
          aria-label={`Buy ${instrument?.symbol ?? ""} at market ${fmtAria(buyPrice)}`}
          className={cn(
            "flex items-center justify-center rounded-md bg-buy py-3 text-base font-bold uppercase tracking-wider text-white shadow-sm transition-opacity",
            (submitting !== null || !instrument) && "opacity-50",
            submitting === "BUY" && "animate-pulse",
          )}
        >
          BUY
        </button>
      </div>
    </div>
  );
}
