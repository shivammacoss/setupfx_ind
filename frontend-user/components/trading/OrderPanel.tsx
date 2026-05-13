"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { OrderAPI, SegmentSettingsAPI, WalletAPI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn, formatINR } from "@/lib/utils";
import { playBuyTone, playSellTone } from "@/lib/trade-audio";

interface Props {
  instrument: any;
  ltp: number;
  bid?: number | null;
  ask?: number | null;
  /** Live USD/INR rate from the quote feed. Used to convert USD-quoted
   *  margin into INR for display — without this the panel shows the USD
   *  number with a ₹ symbol, which makes a $4737 gold lot look like it
   *  needs ₹4,737 when it actually needs ~₹3,93,000. Defaults to 1 so
   *  INR-quoted instruments work as-is. */
  fxRate?: number;
}

const ORDER_TABS = [
  { key: "MARKET", label: "Market" },
  { key: "LIMIT", label: "Limit" },
  { key: "SL-M", label: "SL-M" },
] as const;

type OrderTab = (typeof ORDER_TABS)[number]["key"];

const _OP_EXPIRY_MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"] as const;

/** Friendly `DD-MMM-YYYY` rendering of the instrument's expiry, shown
 *  next to the order title for F&O contracts so the trader sees
 *  exactly which expiry their order will hit. */
function formatOrderPanelExpiry(raw: string | null | undefined): string {
  if (!raw) return "";
  const s = String(raw).slice(0, 10);
  const [y, m, d] = s.split("-");
  if (!y || !m || !d) return s;
  const mi = Number(m) - 1;
  if (mi < 0 || mi > 11) return s;
  return `${d}-${_OP_EXPIRY_MONTHS[mi]}-${y}`;
}

export function OrderPanel({ instrument, ltp, bid, ask, fxRate }: Props) {
  const qc = useQueryClient();

  // ── Segment-aware defaults ───────────────────────────────────────
  const seg = (instrument?.segment ?? "").toUpperCase();
  const exch = (instrument?.exchange ?? "").toUpperCase();
  const isCrypto = seg.includes("CRYPTO") || exch === "CRYPTO";
  // AllTick-mirrored forex / metals / energy all sit on virtual exchange CDS.
  // Treat them all as USD-quoted regardless of segment label.
  const isForex = seg.includes("FOREX") || seg.includes("FX") || exch === "CDS";
  const isFno = seg.includes("FUTURE") || seg.includes("OPTION");
  const isEquity = seg.includes("EQUITY") || seg === "" /* treat unknown as equity */;

  // Default product type: NRML for crypto/forex (no MIS auto-squareoff),
  // MIS for Indian intraday. (Lot defaults now come from the server's
  // resolved settings further below — admin is the source of truth.)
  const defaultProduct: "MIS" | "NRML" | "CNC" = isCrypto || isForex ? "NRML" : "MIS";

  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [orderType, setOrderType] = useState<OrderTab>("MARKET");
  const [productType, setProductType] = useState<"MIS" | "NRML" | "CNC">(defaultProduct);
  const [lots, setLots] = useState<number>(1);
  const [price, setPrice] = useState<string>("");
  const [trigger, setTrigger] = useState<string>("");
  const [stopLoss, setStopLoss] = useState<string>("");
  const [target, setTarget] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // One-Click trading flag (managed by PositionsTabs toolbar). When ON we
  // skip the order-confirm prompt; the user wants immediate execution. Sync
  // from localStorage on mount, then live-update via the broadcast event.
  const [oneClick, setOneClick] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setOneClick(window.localStorage.getItem("setupfx.terminal.oneClick") === "1");
    const onChange = (e: Event) => setOneClick(!!(e as CustomEvent).detail);
    window.addEventListener("oneclick:change", onChange);
    return () => window.removeEventListener("oneclick:change", onChange);
  }, []);

  useEffect(() => {
    WalletAPI.summary().catch(() => undefined);
  }, []);

  // Price field stays empty on LIMIT / SL-M switch — the placeholder shows
  // the limit-away boundary (see entryPlaceholder below) so the trader sees
  // the cap they need to stay within, and types the actual price they want
  // to fill at. Pre-filling with LTP / a small offset was confusing because
  // it looked like a committed value, not a suggestion — and it covered up
  // the limit-away placeholder the user explicitly asked for. If the trader
  // wants an instant-park price they can still type one; the matching
  // engine will park it in Pending whenever it sits outside the spread.

  // Pull effective segment-settings for this exact instrument + side + product
  // so margin, lot limits and brokerage shown here match what the server will
  // actually enforce. Refetch when any of those change.
  // Refetched every 8 s so admin's segment-settings save (margin %, leverage,
  // commission, lot caps) propagates to the live order panel within at most
  // ~8 s — the previous 30 s staleTime meant traders saw stale margin
  // numbers for half a minute after every admin tweak. Window-focus refetch
  // is on by default, so alt-tabbing back also picks up the new values.
  const { data: effSettings } = useQuery<any>({
    queryKey: ["segment-settings", instrument?.token, side, productType],
    queryFn: () => SegmentSettingsAPI.effective(instrument.token, side, productType),
    enabled: !!instrument?.token,
    staleTime: 5_000,
    refetchInterval: 8_000,
  });

  // Server-resolved lot defaults — drive the stepper min, max and default.
  // `minLots` = min lots per order, `orderLots` = max lots per order.
  const minLot = Number(effSettings?.min_lot ?? 1) || 1;
  const maxLotPerOrder = Number(effSettings?.order_lot ?? 0) || 0; // 0 = no cap
  // Stepper increment: when the segment's minimum is fractional (MCX 0.1,
  // crypto 0.001, forex 0.01) the +/− buttons should walk in the same units.
  // A hard-coded step of 1 made it impossible to go 0.1 → 0.2 → 0.3 from the
  // buttons, and turned an intended 0.1 entry into 0.01 if the user typed
  // through an off-by-one decimal place. Round-up to the next 0.001 to
  // avoid float-precision noise in the input.
  const lotStep = minLot < 1 ? +minLot.toFixed(3) : 1;
  const defaultLot = minLot;

  // Reset lot + product when instrument changes OR when we get a fresh
  // server-resolved minimum (so a crypto market correctly starts at 0.001
  // when admin set it that way).
  useEffect(() => {
    setLots(defaultLot);
    setProductType(defaultProduct);
    setStopLoss("");
    setTarget("");
  }, [instrument?.token, defaultLot, defaultProduct]);

  // Lot size — trust the backend.
  //   • Indian F&O (NSE / BSE / NFO / BFO) → Zerodha CSV via
  //     `instrument.lot_size`, refreshed on every backend boot. The
  //     exchange revises NIFTY / BANKNIFTY / FINNIFTY / etc every
  //     quarter; hardcoding a client table would actively mislead.
  //   • MCX → canonical table on the backend (already baked into
  //     `instrument.lot_size`).
  //   • Crypto / forex → 1 (fractional native units).
  // effSettings.lot_size is used when admin's segment override has
  // explicitly set a custom value; otherwise we fall straight back to
  // the instrument row.
  const lotSize =
    isCrypto || isForex
      ? 1
      : effSettings?.lot_size ?? instrument?.lot_size ?? 1;
  const qty = lots * lotSize;
  // For MARKET orders the user will fill at the close-side price they see
  // on the BUY/SELL strip (BUY → ask, SELL → bid). Using that price (rather
  // than the LTP midpoint) for both notional and margin keeps the order
  // panel's Total value / Margin numbers aligned with what's actually
  // booked at execution — otherwise the user sees a number that's off by
  // half-spread × quantity. LIMIT orders use the user-entered price as
  // they always did.
  const sideQuote = side === "BUY" ? (ask ?? ltp ?? 0) : (bid ?? ltp ?? 0);
  const refPrice = orderType === "MARKET" ? (sideQuote || ltp) : Number(price || ltp);
  const notional = qty * refPrice;

  // Server-resolved margin %  (admin's segment-settings → script-override →
  // user-override). Fall back to coarse client constants only while the
  // settings query is still loading, never for the actual order submission.
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
  // USD-quoted instruments (crypto / forex / metals / energy) need their
  // margin multiplied by the live USD/INR rate to match what the wallet
  // actually locks (wallet runs in INR). For native-INR segments the
  // multiplier stays 1. Falls back to 83 only if the quote feed hasn't
  // pushed an fx_rate yet — matches the backend fallback.
  const isUsdSeg = seg.includes("CRYPTO") || seg.includes("FOREX") || seg.includes("FX") || seg.includes("COMMODITIES") || exch === "CDS" || exch === "CRYPTO";
  const fxMultiplier = isUsdSeg ? (fxRate && fxRate > 1 ? fxRate : 83) : 1;
  // Admin's margin-mode dropdown — "fixed" means the configured value is
  // a flat ₹/lot, the rest of the price × lot_size math is bypassed.
  const marginCalcMode = String(effSettings?.margin_calc_mode || "").toLowerCase();
  const fixedMarginPerLot = Number(effSettings?.fixed_margin_per_lot ?? 0);
  const marginPerLot = useMemo(() => {
    if (marginCalcMode === "fixed" && fixedMarginPerLot > 0) {
      // Flat ₹/lot — admin's configured number, charged once per lot
      // regardless of price/lot_size. Matches the backend validator's
      // fixed-mode short-circuit in order_validator.py.
      return +fixedMarginPerLot.toFixed(2);
    }
    // Times / legacy percent: notional × marginPct ÷ leverage × fx.
    // `refPrice` is the BUY/SELL close-side price (ask for BUY, bid for
    // SELL) so the displayed margin tracks the price the order fills at.
    return +(((lotSize * (refPrice || ltp || 0) * serverMarginPct) / serverLeverage) * fxMultiplier).toFixed(2);
  }, [marginCalcMode, fixedMarginPerLot, lotSize, refPrice, ltp, serverMarginPct, serverLeverage, fxMultiplier]);
  const intradayMargin = +(marginPerLot * lots).toFixed(2);
  const carryforwardMargin = +(intradayMargin * 1.4).toFixed(2);
  // `notional` is in the instrument's quote currency. For USD-quoted segments
  // (crypto / forex / spot metals / energy) that's dollars; for Indian segments
  // it's already rupees. The breakdown tile renders everything with ₹, so we
  // convert USD → INR before display. Without this the Total value just shows
  // the USD number with a ₹ symbol — making an $80k BTC notional look like
  // ₹80k when it's actually ~₹66.8 lakh.
  const notionalInr = isUsdSeg ? notional * fxMultiplier : notional;
  const totalValue = notionalInr;

  // Brokerage preview using the same commission_type / commission_value the
  // server will charge. Statutory components (STT, exchange, SEBI, stamp, DP) come from the
  // BrokeragePlan and aren't included here — admin's segment-settings only
  // drives the brokerage portion.
  // PERCENTAGE / PER_CRORE rates are quoted against INR turnover — so we
  // must use the INR-converted notional, not the raw USD one.
  const brokeragePreview = useMemo(() => {
    if (!effSettings) return null;
    const ctype = (effSettings.commission_type || "PER_LOT").toUpperCase();
    const cval = Number(effSettings.commission_value ?? 0);
    if (!cval) return 0;
    let b = 0;
    if (ctype === "FLAT") b = cval;
    else if (ctype === "PERCENTAGE") b = (notionalInr * cval) / 100;
    else if (ctype === "PER_CRORE") b = (notionalInr * cval) / 1e7;
    else b = cval * Math.max(0.01, lots); // PER_LOT
    const minB = Number(effSettings.min_brokerage ?? 0);
    return Math.max(b, minB);
  }, [effSettings, notionalInr, lots]);

  const orderTypeApi: "MARKET" | "LIMIT" | "SL_M" =
    orderType === "SL-M" ? "SL_M" : (orderType as "MARKET" | "LIMIT");

  const sellPrice = bid ?? ltp ?? 0;
  const buyPrice = ask ?? ltp ?? 0;

  // Forex / crypto are USD-quoted on the source feed (AllTick). All P&L,
  // margin and wallet stays in INR — only the live BID/ASK shown to the user
  // is rendered with a $ sign so it matches what they see on TradingView.
  const isUsdQuoted = isCrypto || isForex;
  const priceCcy = isUsdQuoted ? "$" : "₹";
  const priceDecimals = isCrypto ? 2 : isForex ? 4 : 2;
  function fmtPrice(n: number) {
    return `${priceCcy}${Number(n || 0).toFixed(priceDecimals)}`;
  }

  // ── Limit-away hints ────────────────────────────────────────────
  // Admin's `limitAwayPercent` sets the band the LIMIT price + trigger +
  // bracket SL / TP must stay inside. We render the relevant boundary as
  // a placeholder so the trader can see at a glance the furthest price
  // they're allowed to enter — and the backend enforces the same bound
  // in order_validator.py (`*_AWAY_FROM_PRICE` rejection codes).
  //
  //   • LIMIT price (BUY)  → upper bound = ask × (1 + pct/100)
  //   • LIMIT price (SELL) → lower bound = bid × (1 − pct/100)
  //   • Bracket SL / TP for a LIMIT order is bounded against the user-
  //     entered price (not LTP) — once the LIMIT fills that IS the entry,
  //     so SL/TP relative to it is what the user typically means by
  //     "10% stop". For MARKET orders we fall back to the close-side
  //     live quote (bid for a long, ask for a short).
  // Declared AFTER `priceDecimals` so the rounding helper below has a
  // valid reference at evaluation time (TDZ otherwise).
  const limitAwayPct = Number(effSettings?.limit_percentage ?? 0) || 0;
  const limitEntryRef = side === "BUY" ? buyPrice : sellPrice;
  const limitBracketRef =
    orderType !== "MARKET" && Number(price) > 0
      ? Number(price)
      : side === "BUY"
        ? sellPrice
        : buyPrice;
  const _roundPx = (n: number) => +n.toFixed(priceDecimals);
  // Entry-leg cap: the farthest LIMIT price / trigger the user can place.
  const entryPlaceholder =
    limitAwayPct > 0 && limitEntryRef > 0
      ? String(
          _roundPx(
            side === "BUY"
              ? limitEntryRef * (1 + limitAwayPct / 100)
              : limitEntryRef * (1 - limitAwayPct / 100),
          ),
        )
      : "";
  // SL boundary (closes the position).
  //   Long  → SL is below entry → lower bound = ref × (1 − pct/100)
  //   Short → SL is above entry → upper bound = ref × (1 + pct/100)
  const slPlaceholder =
    limitAwayPct > 0 && limitBracketRef > 0
      ? String(
          _roundPx(
            side === "BUY"
              ? limitBracketRef * (1 - limitAwayPct / 100)
              : limitBracketRef * (1 + limitAwayPct / 100),
          ),
        )
      : "";
  // TP boundary — mirror of SL on the opposite direction.
  const tpPlaceholder =
    limitAwayPct > 0 && limitBracketRef > 0
      ? String(
          _roundPx(
            side === "BUY"
              ? limitBracketRef * (1 + limitAwayPct / 100)
              : limitBracketRef * (1 - limitAwayPct / 100),
          ),
        )
      : "";

  function fmtLots(n: number) {
    return isCrypto || isForex ? n.toFixed(2) : String(n);
  }

  function submit() {
    if (!instrument) {
      toast.error("Instrument not loaded — try selecting it again");
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
    if (orderType === "LIMIT" && !Number(price)) {
      toast.error("Enter a limit price");
      return;
    }
    if (orderType === "SL-M" && !Number(trigger)) {
      toast.error("Enter a trigger price");
      return;
    }

    // No confirm dialog — every BUY/SELL fires straight through to the
    // API. Pro-terminal behaviour: you're already looking at the panel,
    // an extra "are you sure?" just adds latency.

    // ── Audio cue: fires the instant the user commits, BEFORE the network
    // round-trip — that's what makes it feel pro-platform tight. The click
    // itself is the user-gesture that unlocks AudioContext on first use.
    if (side === "BUY") playBuyTone();
    else playSellTone();

    // ── Optimistic updates: shape depends on order_type ─────────────
    // MARKET orders execute server-side immediately, so we insert a
    // placeholder Position. LIMIT / SL-M orders sit in OPEN status until
    // the matching engine's 1.5 s poller sees LTP cross the limit — they
    // must NEVER touch the positions cache, otherwise the user sees a
    // "filled" trade and a P&L that doesn't reflect the actual server
    // state. For those, we drop an optimistic row into the orders cache
    // so the pending-orders panel reacts instantly instead.
    const optimisticId = `optimistic_${Date.now()}`;
    const signedQty = (side === "BUY" ? 1 : -1) * lots * lotSize;
    const fillPrice = refPrice || ltp || 0;
    const isImmediate = orderTypeApi === "MARKET";

    if (isImmediate) {
      // Cancel any in-flight positions refetch FIRST — otherwise the poll
      // that's already on the wire returns server data (without our trade
      // yet) and overwrites the optimistic row before the user sees it.
      qc.cancelQueries({ queryKey: ["positions", "open"] });

      // ── Merge with existing position (same instrument + product) ──────
      // The backend's position_service.apply_fill folds same-side fills
      // into ONE position row with a weighted-avg price. The optimistic
      // update must mirror that — otherwise each click of "BUY" briefly
      // shows a SEPARATE optimistic row in the Positions tab until the
      // server response lands and collapses them back into one. From the
      // user's perspective the table flickers between 4 rows and 1 row.
      qc.setQueryData<any[]>(["positions", "open"], (old) => {
        const prev = Array.isArray(old) ? old : [];
        const matchIdx = prev.findIndex(
          (p) =>
            p &&
            p.instrument_token === instrument.token &&
            p.product_type === productType
        );

        if (matchIdx < 0) {
          return [
            {
              id: optimisticId,
              _optimistic: true,
              symbol: instrument.symbol,
              exchange: instrument.exchange,
              segment_type: instrument.segment,
              product_type: productType,
              quantity: signedQty,
              // Include lots + lot_size so the positions panel's resolveQty
              // doesn't fall back to dividing by 1 (which would mis-display
              // a fractional-lot MCX order as e.g. "3 lots" until the next
              // server poll catches up).
              lots: (side === "BUY" ? 1 : -1) * lots,
              lot_size: lotSize,
              avg_price: fillPrice,
              ltp: ltp || fillPrice,
              stop_loss: stopLoss ? Number(stopLoss) : null,
              target: target ? Number(target) : null,
              charges: 0,
              unrealized_pnl: 0,
              realized_pnl: 0,
              margin_used: marginPerLot * lots,
              status: "OPEN",
              opened_at: new Date().toISOString(),
              instrument_token: instrument.token,
            },
            ...prev,
          ];
        }

        const existing = prev[matchIdx];
        const curQty = Number(existing.quantity) || 0;
        const curAvg = Number(existing.avg_price) || 0;
        const newQty = curQty + signedQty;

        let nextAvg = curAvg;
        if (newQty !== 0 && Math.sign(newQty) === Math.sign(curQty || signedQty)) {
          const totalAbs = Math.abs(curQty) + Math.abs(signedQty);
          nextAvg =
            totalAbs > 0
              ? (curAvg * Math.abs(curQty) + fillPrice * Math.abs(signedQty)) / totalAbs
              : fillPrice;
        }

        const merged = {
          ...existing,
          quantity: newQty,
          avg_price: nextAvg,
          ltp: ltp || existing.ltp,
          margin_used: (Number(existing.margin_used) || 0) + marginPerLot * lots,
        };

        const next = prev.slice();
        if (newQty === 0) {
          next.splice(matchIdx, 1);
        } else {
          next[matchIdx] = merged;
        }
        return next;
      });
    } else {
      // LIMIT / SL-M: park an optimistic order row so the pending-orders
      // panel reacts immediately. Shape mirrors backend orders.py
      // `_serialize` so the panel can render it the same as real rows.
      const limitPrice = Number(price || 0);
      const triggerPrice = orderType === "SL-M" ? Number(trigger || 0) : 0;
      const totalQty = lots * lotSize;
      qc.setQueryData<any[]>(["orders", "recent"], (old) => {
        const prev = Array.isArray(old) ? old : [];
        return [
          {
            id: optimisticId,
            _optimistic: true,
            order_number: "—",
            symbol: instrument.symbol,
            exchange: instrument.exchange,
            segment: instrument.segment,
            token: instrument.token,
            instrument_token: instrument.token,
            action: side,
            order_type: orderTypeApi,
            product_type: productType,
            validity: "DAY",
            lots,
            quantity: totalQty,
            filled_quantity: 0,
            pending_quantity: totalQty,
            price: String(limitPrice),
            trigger_price: String(triggerPrice),
            average_price: "0",
            status: "OPEN",
            rejection_reason: null,
            is_amo: false,
            margin_blocked: String(marginPerLot * lots),
            brokerage: "0",
            other_charges: "0",
            bracket_stop_loss: stopLoss ? String(Number(stopLoss)) : null,
            bracket_target: target ? String(Number(target)) : null,
            created_at: new Date().toISOString(),
            executed_at: null,
          },
          ...prev,
        ];
      });
    }

    // Brief 250 ms lockout JUST to prevent accidental double-clicks. The
    // button does NOT wait for the API response — we already inserted the
    // optimistic position row above, so the user sees their trade
    // immediately. The request itself runs fire-and-forget; success/error
    // are handled via toast + cache invalidation when it settles.
    setSubmitting(true);
    setTimeout(() => setSubmitting(false), 250);

    OrderAPI.place({
      token: instrument.token,
      action: side,
      order_type: orderTypeApi,
      product_type: productType,
      lots,
      price: orderType === "MARKET" ? 0 : Number(price || 0),
      trigger_price: orderType === "SL-M" ? Number(trigger || 0) : 0,
      validity: "DAY",
      is_amo: false,
      stop_loss: stopLoss ? Number(stopLoss) : null,
      target: target ? Number(target) : null,
      // For MARKET orders, pin the fill at exactly what the user just saw
      // on the BUY/SELL strip (ask for BUY, bid for SELL). The backend
      // caps this at ±1% from the current live bid/ask so a tampered
      // client can't book off-market, but inside that band the displayed
      // price wins — ENTRY then matches the panel down to the rupee.
      expected_price:
        orderType === "MARKET" ? (side === "BUY" ? buyPrice : sellPrice) || null : null,
    })
      .then(() => {
        toast.success(`${side} ${fmtLots(lots)} ${instrument.symbol} placed`, {
          duration: 1500,
        });
        // DO NOT invalidate "positions" here for MARKET — that triggers an
        // immediate refetch which can return server data that doesn't yet
        // include the new trade (Atlas can be ~100 ms behind the write
        // that just succeeded), and the resulting "flicker" wipes the
        // optimistic row for one tick before the next regular poll
        // restores it. The 2 s polling interval handles reconciliation.
        // For LIMIT/SL-M we DO want an orders refetch so the optimistic
        // placeholder is replaced with the real persisted row (carries
        // the proper id, order_number, server-side margin).
        qc.invalidateQueries({ queryKey: ["orders"] });
        qc.invalidateQueries({ queryKey: ["wallet"] });
      })
      .catch((e: any) => {
        // Rollback whichever optimistic row we inserted — server rejected
        // the order so the user shouldn't see a phantom position/order.
        if (isImmediate) {
          qc.setQueryData<any[]>(["positions", "open"], (old) =>
            Array.isArray(old) ? old.filter((p) => p.id !== optimisticId) : []
          );
        } else {
          qc.setQueryData<any[]>(["orders", "recent"], (old) =>
            Array.isArray(old) ? old.filter((o) => o.id !== optimisticId) : []
          );
        }
        toast.error(e.message || "Order rejected");
      });
  }

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="border-b border-border px-3 py-2">
        <div className="flex items-baseline gap-2">
          <div className="text-sm font-semibold">{instrument?.symbol ?? "—"} order</div>
          {instrument?.expiry && (
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Expiry {formatOrderPanelExpiry(instrument.expiry)}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 scrollbar-thin">
        {/* Order type tabs (the decorative "Trade" button that sat above was
            a no-op heading and just stole vertical space — removed.) */}
        <div className="grid grid-cols-3 border-b border-border text-xs">
          {ORDER_TABS.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => setOrderType(o.key)}
              className={cn(
                "relative py-2 transition-colors",
                orderType === o.key ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {o.label}
              {orderType === o.key && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-t bg-primary" />}
            </button>
          ))}
        </div>

        {/* SELL / BUY price cards — compact: label + price on one row so
            the whole panel fits in the viewport without scrolling. */}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setSide("SELL")}
            className={cn(
              "flex items-center justify-between rounded-md border px-2.5 py-1.5 text-left transition-colors",
              side === "SELL"
                ? "border-sell bg-sell/15"
                : "border-sell/30 bg-sell/5 hover:bg-sell/10"
            )}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-sell">SELL</span>
            <span className="font-tabular text-sm font-semibold">{fmtPrice(sellPrice)}</span>
          </button>
          <button
            type="button"
            onClick={() => setSide("BUY")}
            className={cn(
              "flex items-center justify-between rounded-md border px-2.5 py-1.5 text-left transition-colors",
              side === "BUY"
                ? "border-buy bg-buy/15"
                : "border-buy/30 bg-buy/5 hover:bg-buy/10"
            )}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-buy">BUY</span>
            <span className="font-tabular text-sm font-semibold">{fmtPrice(buyPrice)}</span>
          </button>
        </div>

        {/* Notional pill removed — the same number is shown inside the
            Margin breakdown as "Total value". */}

        {/* Limit / SL price input */}
        {orderType !== "MARKET" && (
          <div className="mt-2">
            <Label>{orderType === "SL-M" ? "Trigger price" : "Price"}</Label>
            <input
              type="number"
              step="0.05"
              value={orderType === "SL-M" ? trigger : price}
              onChange={(e) =>
                orderType === "SL-M" ? setTrigger(e.target.value) : setPrice(e.target.value)
              }
              placeholder={entryPlaceholder || undefined}
              className="h-9 w-full rounded-md border border-border bg-muted/20 px-2 text-sm font-tabular outline-none placeholder:text-muted-foreground focus:border-primary"
            />
          </div>
        )}

        {/* Product type UI removed by request — `productType` still tracked
            internally and submitted with every order. The default is segment-
            derived (NRML for crypto/forex, MIS for Indian intraday). */}

        {/* Lot Size — compact: stepper + meta on one row */}
        <div className="mt-2">
          <Label>{isCrypto || isForex ? "Volume (lots)" : "Lot Size"}</Label>
          <div className="flex h-9 overflow-hidden rounded-md border border-border bg-muted/20">
            <button
              type="button"
              onClick={() => setLots((x) => +Math.max(minLot, x - lotStep).toFixed(3))}
              className="grid w-9 place-items-center text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              aria-label="Decrease lots"
            >
              <Minus className="size-4" />
            </button>
            <input
              type="number"
              step={lotStep}
              min={minLot}
              max={maxLotPerOrder || undefined}
              value={lots}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v) && v >= 0) setLots(v);
              }}
              onBlur={() => setLots((x) => { const clamped = Math.max(minLot, x); return maxLotPerOrder > 0 ? Math.min(maxLotPerOrder, clamped) : clamped; })}
              className="flex-1 bg-transparent text-center font-tabular text-sm outline-none"
            />
            <button
              type="button"
              onClick={() => setLots((x) => { const v = +(x + lotStep).toFixed(3); return maxLotPerOrder > 0 ? Math.min(maxLotPerOrder, v) : v; })}
              className="grid w-9 place-items-center text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              aria-label="Increase lots"
            >
              <Plus className="size-4" />
            </button>
          </div>
          {/* Lot-info badge — mirrors the reference broker UI: for F&O the
              user wants to see "1 lot = 75 units (index points / Qty per
              exchange)" + "Total contracts: 75" right under the stepper, so
              there's no confusion about how many real contracts a lot maps
              to. For equity / crypto / forex (lot_size == 1 or fractional)
              we fall back to the compact "Total: N" pill. */}
          {lotSize > 1 && !isCrypto && !isForex ? (
            <div className="mt-1.5 space-y-0.5 rounded-md border border-primary/20 bg-primary/5 px-2 py-1.5 text-[10px]">
              <div className="text-primary">
                1 lot = <span className="font-tabular font-semibold">{lotSize}</span> units
                <span className="text-muted-foreground"> (index points / Qty per exchange)</span>
              </div>
              <div className="text-muted-foreground">
                Total contracts:{" "}
                <span className="font-tabular font-semibold text-foreground">{fmtLots(qty)}</span>
              </div>
            </div>
          ) : (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[10px] text-muted-foreground">
              <span>1 lot = <span className="font-tabular text-foreground">{lotSize}</span> units</span>
              <span>·</span>
              <span>Total: <span className="font-tabular text-foreground">{fmtLots(qty)}</span></span>
              {(isCrypto || isForex) && <><span>·</span><span>min {minLot}</span></>}
            </div>
          )}
        </div>

        {/* Take Profit + Stop Loss — always visible with +/- steppers.
            Empty value = no bracket leg (the order is still placed without it). */}
        <PriceStepper
          label="Take Profit"
          value={target}
          onChange={setTarget}
          step={isUsdQuoted ? 0.5 : 0.05}
          placeholder={tpPlaceholder || "Not set"}
        />
        <PriceStepper
          label="Stop Loss"
          value={stopLoss}
          onChange={setStopLoss}
          step={isUsdQuoted ? 0.5 : 0.05}
          placeholder={slPlaceholder || "Not set"}
        />

        {/* Margin breakdown — tighter spacing */}
        <div className="mt-2 space-y-1 rounded-md border border-border bg-muted/10 px-2.5 py-2 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Margin</span>
            <span className="font-tabular">
              {!effSettings
                ? "Fixed"
                : marginCalcMode === "fixed"
                  ? "Fixed"
                  : marginCalcMode === "times"
                    ? `${Math.round(serverLeverage)}×`
                    : `${(serverMarginPct * 100).toFixed(2)}%`}
              {" · "}
              {formatINR(marginPerLot)}/lot
            </span>
          </div>
          <Row label="Intraday" value={formatINR(intradayMargin)} />
          {/* Carryforward is meaningful only for segments that have a
              daily settlement (NSE / BSE cash + F&O, MCX). Infoway-fed
              segments (Forex, Stocks, Indices, Commodities, Crypto) don't
              settle daily — admin's segment matrix even hides their
              overnight column — so showing a Carryforward number here is
              misleading. Mirror the same INTRADAY_ONLY_ADMIN_ROWS set the
              backend resolver uses. */}
          {!["FOREX", "STOCKS", "INDICES", "COMMODITIES", "CRYPTO"].some(
            (s) => seg.includes(s),
          ) && (
            <Row label="Carryforward" value={formatINR(carryforwardMargin)} />
          )}
          <Row label="Total value" value={formatINR(totalValue)} />
          {brokeragePreview != null && (
            <Row label="Brokerage" value={formatINR(brokeragePreview)} />
          )}
        </div>

        {/* Show ONLY the blocking warnings; the informational chips
            (Min lot, Per order, Max/script, MIS cap, CNC cap, Limit ±%)
            were removed by request — they're enforced server-side anyway. */}
        {effSettings && (!effSettings.allow || effSettings.stop_loss_mandatory) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {!effSettings.allow && (
              <Chip className="bg-destructive/15 text-destructive">
                Trading blocked for this segment
              </Chip>
            )}
            {effSettings.stop_loss_mandatory && (
              <Chip className="bg-atm/15 text-atm">SL mandatory</Chip>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border p-3">
        <Button
          type="button"
          variant={side === "BUY" ? "buy" : "sell"}
          className="h-11 w-full text-sm font-semibold"
          loading={submitting}
          onClick={submit}
        >
          {side} {fmtLots(lots)} {isCrypto || isForex ? "lots" : `lot${lots === 1 ? "" : "s"}`}
        </Button>
      </div>
    </aside>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 text-xs text-muted-foreground">{children}</div>;
}

function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "rounded border border-border bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground",
        className
      )}
    >
      {children}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-tabular">{value}</span>
    </div>
  );
}

function PriceStepper({
  label,
  value,
  onChange,
  step,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step: number;
  placeholder?: string;
}) {
  function bump(delta: number) {
    const cur = Number(value || 0);
    const next = +(cur + delta).toFixed(4);
    onChange(next > 0 ? String(next) : "");
  }
  return (
    <div className="mt-3 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        {!value && <span className="text-[10px] text-muted-foreground">Not set</span>}
      </div>
      <div className="flex h-9 items-stretch overflow-hidden rounded-md border border-border bg-muted/20">
        <input
          type="number"
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "Price"}
          className="flex-1 bg-transparent px-2 text-sm font-tabular outline-none placeholder:text-muted-foreground"
        />
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => bump(-step)}
          className="grid w-9 place-items-center border-l border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground"
        >
          −
        </button>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => bump(step)}
          className="grid w-9 place-items-center border-l border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground"
        >
          +
        </button>
      </div>
    </div>
  );
}

function Collapsible({
  label,
  open,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3 overflow-hidden rounded-md border border-border bg-muted/10">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-2 text-xs hover:bg-muted/20"
      >
        <span>{label}</span>
        <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="border-t border-border px-3 py-2">{children}</div>}
    </div>
  );
}
