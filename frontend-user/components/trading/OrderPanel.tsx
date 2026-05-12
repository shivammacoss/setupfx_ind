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

  useEffect(() => {
    if (orderType !== "MARKET" && !price && ltp) setPrice(ltp.toFixed(2));
  }, [orderType, ltp, price]);

  // Pull effective segment-settings for this exact instrument + side + product
  // so margin, lot limits and brokerage shown here match what the server will
  // actually enforce. Refetch when any of those change.
  const { data: effSettings } = useQuery<any>({
    queryKey: ["segment-settings", instrument?.token, side, productType],
    queryFn: () => SegmentSettingsAPI.effective(instrument.token, side, productType),
    enabled: !!instrument?.token,
    staleTime: 30_000,
  });

  // Server-resolved lot defaults — drive the stepper min, max and default.
  // `minLots` = min lots per order, `orderLots` = max lots per order.
  const minLot = Number(effSettings?.min_lot ?? 1) || 1;
  const maxLotPerOrder = Number(effSettings?.order_lot ?? 0) || 0; // 0 = no cap
  const lotStep = 1; // stepper increments by 1
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

  const lotSize = effSettings?.lot_size ?? instrument?.lot_size ?? 1;
  const qty = lots * lotSize;
  const refPrice = orderType === "MARKET" ? ltp : Number(price || ltp);
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
  const marginPerLot = useMemo(
    () => +(((lotSize * (ltp || refPrice || 0) * serverMarginPct) / serverLeverage) * fxMultiplier).toFixed(2),
    [lotSize, ltp, refPrice, serverMarginPct, serverLeverage, fxMultiplier]
  );
  const intradayMargin = +(marginPerLot * lots).toFixed(2);
  const carryforwardMargin = +(intradayMargin * 1.4).toFixed(2);
  const totalValue = notional;

  // Brokerage preview using the same commission_type / commission_value the
  // server will charge. Statutory components (STT, exchange, SEBI, stamp, DP) come from the
  // BrokeragePlan and aren't included here — admin's segment-settings only
  // drives the brokerage portion.
  const brokeragePreview = useMemo(() => {
    if (!effSettings) return null;
    const ctype = (effSettings.commission_type || "PER_LOT").toUpperCase();
    const cval = Number(effSettings.commission_value ?? 0);
    if (!cval) return 0;
    let b = 0;
    if (ctype === "FLAT") b = cval;
    else if (ctype === "PERCENTAGE") b = (notional * cval) / 100;
    else if (ctype === "PER_CRORE") b = (notional * cval) / 1e7;
    else b = cval * Math.max(0.01, lots); // PER_LOT
    const minB = Number(effSettings.min_brokerage ?? 0);
    return Math.max(b, minB);
  }, [effSettings, notional, lots]);

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

    // ── Optimistic position row: insert a placeholder into the positions
    // cache *before* the API call lands so the table reflects the trade
    // immediately. Server-side fill (carried via /ws/user push or the next
    // 500 ms poll) replaces the placeholder seamlessly.
    const optimisticId = `optimistic_${Date.now()}`;
    const signedQty = (side === "BUY" ? 1 : -1) * lots * lotSize;
    const fillPrice = refPrice || ltp || 0;

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
        // No existing row — insert a fresh optimistic position.
        return [
          {
            id: optimisticId,
            _optimistic: true,
            symbol: instrument.symbol,
            exchange: instrument.exchange,
            segment_type: instrument.segment,
            product_type: productType,
            quantity: signedQty,
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

      // Merge into existing position. Weighted avg for same-side, qty
      // reduction for opposite-side. Matches backend FIFO accounting.
      const existing = prev[matchIdx];
      const curQty = Number(existing.quantity) || 0;
      const curAvg = Number(existing.avg_price) || 0;
      const newQty = curQty + signedQty;

      let nextAvg = curAvg;
      if (newQty !== 0 && Math.sign(newQty) === Math.sign(curQty || signedQty)) {
        // Same side (or fresh open): weighted-avg the entry price.
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

      // Replace the matched row in-place; drop it entirely if fully closed.
      const next = prev.slice();
      if (newQty === 0) {
        next.splice(matchIdx, 1);
      } else {
        next[matchIdx] = merged;
      }
      return next;
    });

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
    })
      .then(() => {
        toast.success(`${side} ${fmtLots(lots)} ${instrument.symbol} placed`, {
          duration: 1500,
        });
        // DO NOT invalidate "positions" here — that triggers an immediate
        // refetch which can return server data that doesn't yet include
        // the new trade (Atlas can be ~100 ms behind the write that just
        // succeeded), and the resulting "flicker" wipes the optimistic
        // row for one tick before the next regular poll restores it. The
        // 2 s polling interval handles the eventual reconciliation
        // without the flicker. Orders/wallet are independent + small,
        // they don't flicker the trade row, so invalidate is fine there.
        qc.invalidateQueries({ queryKey: ["orders"] });
        qc.invalidateQueries({ queryKey: ["wallet"] });
      })
      .catch((e: any) => {
        // Rollback the optimistic row if the order was rejected so the
        // user doesn't see a phantom position that never existed server-side.
        qc.setQueryData<any[]>(["positions", "open"], (old) =>
          Array.isArray(old) ? old.filter((p) => p.id !== optimisticId) : []
        );
        toast.error(e.message || "Order rejected");
      });
  }

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="border-b border-border px-3 py-2">
        <div className="text-sm font-semibold">{instrument?.symbol ?? "—"} order</div>
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
              className="h-9 w-full rounded-md border border-border bg-muted/20 px-2 text-sm font-tabular outline-none focus:border-primary"
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
              onClick={() => setLots((x) => Math.max(minLot, x - lotStep))}
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
              onClick={() => setLots((x) => { const v = x + lotStep; return maxLotPerOrder > 0 ? Math.min(maxLotPerOrder, v) : v; })}
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
          placeholder="Not set"
        />
        <PriceStepper
          label="Stop Loss"
          value={stopLoss}
          onChange={setStopLoss}
          step={isUsdQuoted ? 0.5 : 0.05}
          placeholder="Not set"
        />

        {/* Margin breakdown — tighter spacing */}
        <div className="mt-2 space-y-1 rounded-md border border-border bg-muted/10 px-2.5 py-2 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Margin</span>
            <span className="font-tabular">
              {effSettings ? `${(serverMarginPct * 100).toFixed(2)}%` : "Fixed"} · {formatINR(marginPerLot)}/lot
            </span>
          </div>
          <Row label="Intraday" value={formatINR(intradayMargin)} />
          <Row label="Carryforward" value={formatINR(carryforwardMargin)} />
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
