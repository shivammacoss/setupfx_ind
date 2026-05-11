"""Order pre-trade validator — 12 checks per spec, in order.

Returns (ok, applied_settings_snapshot) on success or raises OrderRejectedError.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, time
from decimal import Decimal
from typing import Any

from app.core.exceptions import (
    InsufficientFundsError,
    MarketClosedError,
    OrderRejectedError,
    SegmentNotAllowedError,
)
from app.models._base import (
    OrderAction,
    OrderType,
    ProductType,
)
from app.models.holiday import TradingHoliday
from app.models.instrument import Instrument
from app.models.position import Position, PositionStatus, UserPositionTracker
from app.models.user import User, UserStatus
from app.services import market_data_service, netting_service, wallet_service
from app.utils.decimal_utils import to_decimal
from app.utils.time_utils import is_weekend, now_ist, parse_hhmm, to_ist


@dataclass
class ValidatedOrder:
    settings: dict[str, Any]
    margin_required: Decimal
    ltp: Decimal


async def validate(
    *,
    user: User,
    instrument: Instrument,
    segment_type: str,
    action: OrderAction,
    order_type: OrderType,
    product_type: ProductType,
    lots: float,
    quantity: float,
    price: Decimal,
    trigger_price: Decimal,
    is_amo: bool,
    is_squareoff: bool = False,
) -> ValidatedOrder:
    # 12) user status
    if user.status != UserStatus.ACTIVE:
        raise OrderRejectedError("Account is not active", code="ACCOUNT_INACTIVE")
    if not user.permissions.can_place_orders:
        raise OrderRejectedError("Order placement disabled for this account", code="PERMISSION_DENIED")

    # ── Batch independent async lookups to cut latency ────────────
    # Risk, netting settings, position tracker, and open position are all
    # independent — fire them in parallel instead of sequentially.
    is_expiry_day_now = bool(instrument.expiry and instrument.expiry == now_ist().date())

    async def _fetch_risk() -> dict[str, Any]:
        try:
            rp = await netting_service.get_effective_risk(str(user.id))
            return rp.get("settings", {}) if rp else {}
        except Exception:
            return {}

    async def _fetch_netting() -> dict[str, Any]:
        return await netting_service.get_effective_settings(
            user.id,  # type: ignore[arg-type]
            segment_type,
            action=action.value if hasattr(action, "value") else str(action),
            option_type=instrument.option_type.value if instrument.option_type else None,
            product_type=product_type.value if hasattr(product_type, "value") else str(product_type),
            is_expiry_day=is_expiry_day_now,
            symbol=instrument.symbol,
        )

    risk, resolved, tracker, open_position = await asyncio.gather(
        _fetch_risk(),
        _fetch_netting(),
        UserPositionTracker.find_one(
            UserPositionTracker.user_id == user.id,
            UserPositionTracker.segment_type == segment_type,
            UserPositionTracker.instrument_token == instrument.token,
        ),
        Position.find_one(
            Position.user_id == user.id,
            Position.instrument.token == instrument.token,
            Position.segment_type == segment_type,
            Position.status == PositionStatus.OPEN,
        ),
    )
    s: dict[str, Any] = resolved["settings"]

    # 1) segment allowed
    if not s.get("allow", False):
        raise SegmentNotAllowedError(f"Segment {segment_type} is not allowed for this account")

    lot_size = max(1, instrument.lot_size or 1)

    # 2) lot limits — admin's segment settings are the single source of truth.
    min_lot = float(s.get("min_lot") or 1)
    order_lot = float(s.get("order_lot") or 0)  # per-order maximum (new positions only)
    if lots < min_lot:
        raise OrderRejectedError(f"Minimum {min_lot} lot(s) required", code="LOT_BELOW_MIN")

    # 3) position limits — running total per instrument + per segment
    held = tracker.total_lots if tracker else 0
    signed_held = float(open_position.quantity) if open_position else 0.0
    delta = float(lots) if action == OrderAction.BUY else -float(lots)
    projected_net = signed_held + delta
    is_reducing = abs(projected_net) < abs(signed_held)  # closing / partial close

    # Per-order cap: only applies to NEW/opening orders — closing must always
    # be allowed in full so user can exit the entire position in one click.
    if not is_squareoff and not is_reducing and order_lot > 0 and lots > order_lot:
        raise OrderRejectedError(
            f"Maximum {order_lot} lot(s) per order", code="LOT_PER_ORDER_MAX"
        )

    # ── Risk: exit-only mode ───────────────────────────────────────
    # Admin freezes the account for new entries (e.g. during volatility,
    # margin warnings). Only reducing/closing trades remain allowed.
    if risk.get("exitOnlyMode") and not is_reducing:
        raise OrderRejectedError(
            "Exit-only mode is active — only closing trades are allowed",
            code="EXIT_ONLY_MODE",
        )

    intra_limit = int(s.get("intraday_lot_limit") or 0)
    hold_limit = int(s.get("holding_lot_limit") or 0)
    max_each = int(s.get("max_each_lot") or 0)

    # Cap only applies when the order would INCREASE exposure on this script.
    if max_each and not is_reducing and abs(projected_net) > max_each:
        raise OrderRejectedError(
            f"Per-instrument cap reached: would hold {abs(projected_net)} > {max_each}",
            code="MAX_EACH_EXCEEDED",
        )
    if (
        not is_reducing
        and product_type == ProductType.MIS
        and intra_limit
        and (tracker.intraday_lots if tracker else 0) + lots > intra_limit
    ):
        raise OrderRejectedError(f"Intraday lot limit {intra_limit} reached", code="INTRADAY_LIMIT")
    if (
        not is_reducing
        and product_type in (ProductType.NRML, ProductType.CNC)
        and hold_limit
        and (tracker.holding_lots if tracker else 0) + lots > hold_limit
    ):
        raise OrderRejectedError(f"Holding lot limit {hold_limit} reached", code="HOLDING_LIMIT")

    # 4) price limit (skip for MARKET)
    ltp = await market_data_service.get_ltp(instrument.token)
    limit_pct = float(s.get("limit_percentage") or 0)
    if order_type != OrderType.MARKET and limit_pct > 0 and ltp > 0:
        upper = ltp * to_decimal(1 + limit_pct / 100)
        lower = ltp * to_decimal(1 - limit_pct / 100)
        check_price = price if price > 0 else trigger_price
        if check_price > 0 and (check_price > upper or check_price < lower):
            raise OrderRejectedError(
                f"Price ₹{check_price} is outside ±{limit_pct}% of LTP ₹{ltp}",
                code="PRICE_OUT_OF_RANGE",
            )

    # ── Risk: LIMIT/SL-M placement vs day high/low ─────────────────
    # Two opposing toggles for LIMIT-style orders only — MARKET fires at LTP
    # and isn't user-priced, so it bypasses both:
    #   blockLimitAboveBelowHighLow → reject if price OUTSIDE today's [low, high]
    #   blockLimitBetweenHighLow    → reject if price WITHIN today's [low, high]
    # Admins use these to force traders to either follow the day's range or
    # only break out of it. Both can be ON simultaneously which would gate
    # every limit order — that's intentional (= disable LIMIT placement).
    if order_type != OrderType.MARKET and (
        risk.get("blockLimitAboveBelowHighLow") or risk.get("blockLimitBetweenHighLow")
    ):
        check_price = price if price > 0 else trigger_price
        if check_price > 0:
            try:
                quote = await market_data_service.get_quote(instrument.token)
                day_high = float(quote.get("high") or 0)
                day_low = float(quote.get("low") or 0)
            except Exception:
                day_high = day_low = 0.0
            cp = float(check_price)
            if day_high > 0 and day_low > 0:
                inside = day_low <= cp <= day_high
                if risk.get("blockLimitAboveBelowHighLow") and not inside:
                    raise OrderRejectedError(
                        f"Limit price {cp} is outside today's range "
                        f"[{day_low}, {day_high}] — blocked by risk policy",
                        code="LIMIT_OUTSIDE_RANGE_BLOCKED",
                    )
                if risk.get("blockLimitBetweenHighLow") and inside:
                    raise OrderRejectedError(
                        f"Limit price {cp} is inside today's range "
                        f"[{day_low}, {day_high}] — blocked by risk policy",
                        code="LIMIT_INSIDE_RANGE_BLOCKED",
                    )

    # 5) strike difference (only for option segments)
    strike_diff = int(s.get("strike_difference") or 0)
    if strike_diff > 0 and instrument.strike is not None and "OPTION" in segment_type.upper():
        underlying = await Instrument.find_one(
            Instrument.token == (instrument.underlying_token or "")
        )
        if underlying is not None:
            spot = await market_data_service.get_ltp(underlying.token)
            atm = round(float(spot) / strike_diff) * strike_diff
            strike_val = float(to_decimal(instrument.strike))
            steps = abs(strike_val - atm) // strike_diff
            max_steps = int(s.get("strike_difference") or 5)
            if steps > max_steps:
                raise OrderRejectedError(
                    f"Strike too far from ATM ({int(steps)} > {max_steps})", code="STRIKE_OUT_OF_RANGE"
                )

    # 6) OTM extra-strict cap
    otm_max = int(s.get("otm_max_each_lot") or 0)
    if otm_max and "OPTION" in segment_type.upper() and instrument.option_type:
        # Heuristic: rely on max_each_lot already handling general cap; here we tighten
        if (held + lots) > otm_max:
            raise OrderRejectedError(f"OTM cap {otm_max} reached", code="OTM_CAP_EXCEEDED")

    # 6a-i) minimum quantity check (equity segments that use qty instead of lots)
    min_qty = float(s.get("min_qty") or 0)
    if min_qty > 0 and quantity < min_qty:
        raise OrderRejectedError(
            f"Minimum quantity is {min_qty}, got {quantity}",
            code="QTY_BELOW_MIN",
        )

    # 6a) per-order quantity cap (relevant mostly for equity segments).
    # Skip for reducing/closing orders — those exit existing exposure.
    per_order_qty = float(s.get("per_order_qty") or 0)
    if not is_reducing and per_order_qty > 0 and quantity > per_order_qty:
        raise OrderRejectedError(
            f"Quantity {quantity} exceeds per-order cap of {per_order_qty}",
            code="QTY_PER_ORDER_EXCEEDED",
        )

    # 6b) running total quantity per script (running held + new ≤ cap)
    max_qty_script = float(s.get("max_qty_per_script") or 0)
    if not is_reducing and max_qty_script > 0:
        held_qty = (tracker.total_lots if tracker else 0) * lot_size
        if held_qty + quantity > max_qty_script:
            raise OrderRejectedError(
                f"Per-script quantity cap {max_qty_script} would be breached "
                f"(held {held_qty} + new {quantity})",
                code="MAX_QTY_PER_SCRIPT",
            )

    # 6c) per-order notional cap (₹ value) — skip for closing orders
    max_value = float(s.get("max_value") or 0)
    if not is_reducing and max_value > 0:
        ref_price_for_value = price if price > 0 else ltp
        notional_check = quantity * float(ref_price_for_value)
        if notional_check > max_value:
            raise OrderRejectedError(
                f"Order value ₹{notional_check:,.0f} exceeds per-order cap of ₹{max_value:,.0f}",
                code="MAX_VALUE_EXCEEDED",
            )

    # 6d) option-leg strike-distance from spot — buyer's "buyingStrikeFarPercent"
    #     vs seller's "sellingStrikeFarPercent" admin setting.
    far_pct_setting = (
        s.get("buying_strike_far_percent")
        if action == OrderAction.BUY
        else s.get("selling_strike_far_percent")
    )
    far_pct = float(far_pct_setting or 0)
    if (
        far_pct > 0
        and "OPTION" in segment_type.upper()
        and instrument.strike is not None
        and instrument.underlying_token
    ):
        underlying = await Instrument.find_one(Instrument.token == instrument.underlying_token)
        if underlying is not None:
            spot = float(await market_data_service.get_ltp(underlying.token))
            if spot > 0:
                strike_val = float(to_decimal(instrument.strike))
                deviation_pct = abs(strike_val - spot) / spot * 100
                if deviation_pct > far_pct:
                    side_word = "buying" if action == OrderAction.BUY else "selling"
                    raise OrderRejectedError(
                        f"Strike {strike_val:.0f} is {deviation_pct:.1f}% from spot {spot:.2f} "
                        f"— {side_word} cap is {far_pct:.1f}%",
                        code="STRIKE_FAR_CAP",
                    )

    # 7) overnight selling
    if not s.get("selling_overnight", True) and action == OrderAction.SELL and product_type != ProductType.MIS:
        # Only block if user has no current long position to cover
        if not tracker or tracker.holding_lots <= 0:
            raise OrderRejectedError(
                "Overnight short selling is disabled for your account", code="NO_OVERNIGHT_SHORT"
            )

    # 8) expiry-day rules (placeholder — Phase 4 expiry_manager wires it)
    if instrument.expiry and instrument.expiry == now_ist().date():
        # Use stricter margin if configured
        s["margin_percentage"] = float(s.get("expiry_intraday_margin") or s.get("margin_percentage") or 100.0)

    # 9) margin check (all-Decimal arithmetic — never mix Decimal × float)
    margin_pct = to_decimal(s.get("margin_percentage") or 100.0) / to_decimal(100)
    leverage = to_decimal(s.get("leverage") or 1.0)
    if leverage <= 0:
        leverage = to_decimal(1)
    ref_price = price if price > 0 else ltp
    notional = to_decimal(quantity) * ref_price
    margin_required = notional * margin_pct / leverage

    # USD-quoted instruments (Infoway: crypto / forex / metals / energy)
    # price `ref_price` in dollars — wallet runs in INR, so the margin we
    # lock must be in INR too. Multiply by the live USD/INR rate. Skip for
    # native-INR segments (NSE / BSE / MCX / NFO / BFO).
    inst_segment = str(getattr(instrument.segment, "value", instrument.segment) or "")
    if market_data_service.is_usd_quoted_segment(segment_type) or market_data_service.is_usd_quoted_segment(inst_segment):
        usd_inr = to_decimal(market_data_service.get_usd_inr_rate())
        margin_required = margin_required * usd_inr
    wallet = await wallet_service.get_or_create(user.id)  # type: ignore[arg-type]
    available = to_decimal(wallet.available_balance) + to_decimal(wallet.credit_limit)
    # Closing/reducing orders don't lock new margin — they free it up — so
    # skip the funds + utilisation cap checks for them.
    if is_reducing or is_squareoff:
        margin_required = to_decimal(0)
    elif margin_required > available:
        raise InsufficientFundsError(
            f"Need ₹{margin_required:.2f}, have ₹{available:.2f}"
        )

    # 9b) Wallet-utilisation cap. Segment may declare `max_margin_usage_percent`
    # (default 100%) — once crossed, new positions are blocked even if the
    # bare margin would otherwise fit. This protects accounts from being
    # 100%-leveraged on a single bad print. Default is 100 (no extra cap).
    max_use_pct = float(s.get("max_margin_usage_percent") or 100.0)
    if not is_reducing and not is_squareoff and 0 < max_use_pct < 100:
        used_now = to_decimal(wallet.used_margin)
        total_pool = used_now + to_decimal(wallet.available_balance) + to_decimal(wallet.credit_limit)
        cap = total_pool * to_decimal(max_use_pct) / to_decimal(100)
        if used_now + margin_required > cap:
            raise InsufficientFundsError(
                f"Margin usage cap reached: blocking ₹{margin_required:.2f} "
                f"would push used (₹{used_now + margin_required:.2f}) above the "
                f"{max_use_pct:.0f}% segment cap (₹{cap:.2f})"
            )

    # 10) stop-loss mandatory
    if s.get("stop_loss_mandatory") and order_type not in (OrderType.SL, OrderType.SL_M):
        raise OrderRejectedError("Stop-loss is mandatory for this segment", code="SL_MANDATORY")

    # 11) market hours (skip for AMO and 24×7 segments)
    seg_upper = (segment_type or "").upper()
    exch_upper = str(getattr(instrument.exchange, "value", instrument.exchange) or "").upper()
    is_24x7 = "CRYPTO" in seg_upper or exch_upper == "CRYPTO"  # crypto runs 24×7
    # Forex + spot metals (XAU/XAG…) + energy (USOIL/UKOIL/NATGAS) all
    # follow the international 24×5 calendar — closed only on weekends.
    # They all sit on the virtual `CDS` exchange in our catalogue.
    is_24x5 = (
        "FOREX" in seg_upper
        or "FX" in seg_upper
        or "COMMODITIES" in seg_upper
        or "CDS" in seg_upper
        or exch_upper == "CDS"
    )
    is_mcx = "MCX" in seg_upper  # MCX has its own hours (~09:00-23:30 IST)

    if not is_amo and not is_24x7:
        ist = now_ist()

        # 24×5 (forex / metals / energy): closed only on weekends (Sat full-day;
        # Sun close before 17:30 ET ≈ 03:00 IST Mon)
        if is_24x5:
            wd = ist.weekday()  # Mon=0 ... Sun=6
            if wd == 5 or (wd == 6 and ist.hour < 4):
                raise MarketClosedError("Forex market is closed for the weekend.")
        else:
            if is_weekend(ist.date()):
                raise MarketClosedError("Market is closed (weekend). Place AMO instead.")
            # holiday lookup (only Indian exchanges)
            h = await TradingHoliday.find_one(
                TradingHoliday.holiday_date == ist.date(),
                TradingHoliday.exchange == instrument.exchange,
            )
            if h is not None and h.is_full_day:
                raise MarketClosedError(f"Holiday: {h.description}. Place AMO instead.")

            from app.core.config import settings as cfg

            if is_mcx:
                # MCX: 09:00 – 23:30 IST (winter) / 23:55 IST (summer evening session)
                # We use a generous 09:00 – 23:30 window.
                from datetime import time as _t

                if not (_t(9, 0) <= ist.time() <= _t(23, 30)):
                    raise MarketClosedError("MCX is closed. Place AMO instead.")
            else:
                # NSE / BSE equities + F&O: 09:15 – 15:30 IST
                open_t = parse_hhmm(cfg.MARKET_OPEN_TIME)
                close_t = parse_hhmm(cfg.MARKET_CLOSE_TIME)
                if not (open_t <= ist.time() <= close_t):
                    raise MarketClosedError("Market is closed. Place AMO instead.")

    # Build snapshot for the order document
    settings_snapshot = {
        "segment_type": segment_type,
        "margin_percentage": s.get("margin_percentage"),
        "leverage": s.get("leverage"),
        "commission_type": str(s.get("commission_type")) if s.get("commission_type") else None,
        "commission_value": s.get("commission_value"),
        "min_brokerage": s.get("min_brokerage"),
        "limit_percentage": s.get("limit_percentage"),
        "stop_loss_mandatory": s.get("stop_loss_mandatory"),
        "auto_squareoff_time": s.get("auto_squareoff_time"),
        "m2m_squareoff_percent": s.get("m2m_squareoff_percent"),
    }

    return ValidatedOrder(settings=settings_snapshot, margin_required=margin_required, ltp=ltp)
