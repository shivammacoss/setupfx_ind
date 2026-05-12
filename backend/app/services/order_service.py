"""Order service — accepts a request, runs the validator, blocks margin,
persists the order document, and (for MARKET) executes immediately."""

from __future__ import annotations

import logging
import secrets
from decimal import Decimal
from typing import Any

from beanie import PydanticObjectId
from bson import Decimal128

from app.core.exceptions import NotFoundError, ValidationFailedError
from app.models._base import (
    OrderAction,
    OrderType,
    ProductType,
    Validity,
)
from app.models.order import (
    AppliedSettings,
    InstrumentRef,
    Order,
    OrderStatus,
)
from app.models.user import User
from app.services import (
    instrument_service,
    matching_engine,
    order_validator,
    wallet_service,
)
from app.utils.decimal_utils import to_decimal
from app.utils.time_utils import now_utc

logger = logging.getLogger(__name__)


def _order_number() -> str:
    return f"O{now_utc().strftime('%y%m%d')}{secrets.token_hex(4).upper()}"


async def place_order(
    *,
    user: User,
    payload: dict[str, Any],
) -> Order:
    """Place a new order. Validates, blocks margin, persists, and (for MARKET) executes.

    Each major step is timed and the breakdown logged at INFO so we can see
    where latency comes from in production logs without attaching a profiler.
    Format: `order_perf step=<name> ms=<float>` — easy to grep + plot.
    """
    import time as _time

    t_start = _time.perf_counter()

    def _mark(name: str, since: float) -> float:
        elapsed_ms = (_time.perf_counter() - since) * 1000
        logger.info("order_perf step=%s ms=%.1f", name, elapsed_ms)
        return _time.perf_counter()

    # Inputs
    token = str(payload.get("token") or "").strip()
    if not token:
        raise ValidationFailedError("instrument token is required")

    t = _time.perf_counter()
    instrument = await instrument_service.get_by_token(token)
    t = _mark("get_instrument", t)
    if not instrument.is_tradable or instrument.is_halted or not instrument.is_active:
        raise ValidationFailedError("Instrument is not tradable")

    action = OrderAction(payload["action"])
    order_type = OrderType(payload["order_type"])
    product_type = ProductType(payload["product_type"])
    validity = Validity(payload.get("validity") or "DAY")
    lots = float(payload.get("lots") or 1)  # fractional for crypto/forex
    # For Infoway-quoted instruments (forex / crypto / metals / energy) we
    # always trade in 1 native base unit per lot — the price feed already
    # quotes the underlying directly (BTC, EUR, gold oz, …). If a stale or
    # mis-seeded Instrument row has lot_size > 1 stored, that would inflate
    # `quantity = lots * lot_size` by exactly the multiplier and break
    # margin math (e.g. 0.001 lots × 10 = 0.01 → 10× margin). Force the
    # multiplier to 1 here so the math is correct regardless of DB state.
    from app.services.market_data_service import is_usd_quoted_segment

    if is_usd_quoted_segment(instrument.segment):
        lot_size = 1
    else:
        # For Indian index F&O the canonical exchange lot (NIFTY=75,
        # BANKNIFTY=35, SENSEX=20…) wins over whatever's stored on the
        # Instrument row. The DB value can be stale (auto-created from a
        # half-warm Zerodha CSV cache → 1) or outdated (old NIFTY=50
        # contracts) — using it would silently undercount quantity and
        # break the user's position size. The canonical helper is the
        # single source of truth here, AND we persist the corrected value
        # back to the Instrument row so segment-settings / positions
        # responses see the same number without depending on the startup
        # backfill having run.
        from app.models._base import InstrumentType
        from app.services.index_lots import get_canonical_lot_size

        canonical_lot = None
        if instrument.instrument_type in (InstrumentType.CE, InstrumentType.PE, InstrumentType.FUT):
            ex_val = (
                instrument.exchange.value
                if hasattr(instrument.exchange, "value")
                else str(instrument.exchange)
            )
            canonical_lot = get_canonical_lot_size(
                instrument.symbol, instrument.name, exchange=ex_val
            )
        stored_lot = max(1, int(instrument.lot_size or 1))
        lot_size = canonical_lot or stored_lot
        # Heal stored row inline (idempotent) so the next read everywhere —
        # /instruments/{token}, /segment-settings/effective, positions
        # enrichment — returns the right lot without waiting for backfill.
        if canonical_lot and int(instrument.lot_size or 0) != canonical_lot:
            instrument.lot_size = canonical_lot
            try:
                await instrument.save()
            except Exception:
                pass

    # Squareoff override: when the caller (manual close / risk-auto-flatten /
    # SL-TP trigger) sends an explicit `force_quantity`, that wins over the
    # lots × lot_size math. Without this, closing a legacy position whose
    # stored quantity is `lots × 1 = 1` against the new canonical lot (75)
    # would try to SELL 75 of a 1-qty position — leaving a phantom -74
    # short, or rejecting outright. We always want squareoff to flatten
    # exactly what's open.
    force_qty_raw = payload.get("force_quantity")
    if force_qty_raw is not None:
        try:
            force_quantity = float(force_qty_raw)
        except (TypeError, ValueError):
            force_quantity = 0.0
    else:
        force_quantity = 0.0

    if force_quantity > 0:
        quantity = force_quantity
        # Recompute `lots` so downstream brokerage / margin math uses a
        # consistent pair (lots × lot_size ≈ quantity). Falls back to
        # quantity when lot_size is 1 to avoid divide-by-anything weirdness.
        lots = quantity / lot_size if lot_size > 0 else quantity
    else:
        quantity = lots * lot_size
    logger.info(
        "order_lot_resolved symbol=%s instrument_type=%s segment=%s stored_lot=%s resolved_lot=%s lots=%s qty=%s",
        instrument.symbol,
        getattr(instrument.instrument_type, "value", instrument.instrument_type),
        instrument.segment,
        instrument.lot_size,
        lot_size,
        lots,
        quantity,
    )
    price = to_decimal(payload.get("price") or 0)
    trigger = to_decimal(payload.get("trigger_price") or 0)
    is_amo = bool(payload.get("is_amo") or False)
    is_squareoff = bool(payload.get("is_squareoff") or False)
    segment_type = instrument.segment

    # Optional bracket-order legs (auto SL + target after entry fills)
    raw_sl = payload.get("stop_loss")
    raw_tp = payload.get("target")
    bracket_sl = to_decimal(raw_sl) if raw_sl not in (None, "", 0) else None
    bracket_tp = to_decimal(raw_tp) if raw_tp not in (None, "", 0) else None

    # Validate
    validated = await order_validator.validate(
        user=user,
        instrument=instrument,
        segment_type=segment_type,
        action=action,
        order_type=order_type,
        product_type=product_type,
        lots=lots,
        quantity=quantity,
        price=price,
        trigger_price=trigger,
        is_amo=is_amo,
        is_squareoff=is_squareoff,
    )
    t = _mark("validate", t)

    # Block margin (only for BUY or short SELL — for selling existing position the wallet is untouched)
    # Squareoff orders close existing positions — margin_required is 0 from validator.
    margin = validated.margin_required
    if action == OrderAction.BUY and margin > 0:
        await wallet_service.block_margin(user.id, margin)  # type: ignore[arg-type]
        t = _mark("block_margin", t)

    # Persist
    instr_ref = InstrumentRef(
        token=instrument.token,
        symbol=instrument.symbol,
        trading_symbol=instrument.trading_symbol,
        exchange=instrument.exchange,
        segment=instrument.segment,
        lot_size=lot_size,  # canonical (resolved above) — never the raw DB value
        tick_size=instrument.tick_size,
    )
    applied = AppliedSettings(**validated.settings)
    order = Order(
        order_number=_order_number(),
        user_id=user.id,  # type: ignore[arg-type]
        instrument=instr_ref,
        action=action,
        order_type=order_type,
        product_type=product_type,
        validity=validity,
        lots=lots,
        quantity=quantity,
        pending_quantity=quantity,
        price=Decimal128(str(price)),
        trigger_price=Decimal128(str(trigger)),
        margin_blocked=Decimal128(str(margin)),
        status=OrderStatus.PENDING,
        is_amo=is_amo,
        applied_settings=applied,
        placed_by=user.id,  # type: ignore[arg-type]
        placed_from=str(payload.get("placed_from") or "WEB"),
        bracket_stop_loss=Decimal128(str(bracket_sl)) if bracket_sl is not None else None,
        bracket_target=Decimal128(str(bracket_tp)) if bracket_tp is not None else None,
    )
    await order.insert()
    t = _mark("insert_order", t)

    # Execute or park
    if order_type == OrderType.MARKET and not is_amo:
        await matching_engine.execute_market_order(
            order, cached_ltp=validated.ltp, cached_netting=validated.netting_settings
        )
        _mark("execute_market", t)
    else:
        order.status = OrderStatus.OPEN
        await order.save()
        _mark("park_pending", t)

    total_ms = (_time.perf_counter() - t_start) * 1000
    logger.info(
        "order_perf step=TOTAL ms=%.1f action=%s symbol=%s qty=%s",
        total_ms, action.value, instrument.symbol, quantity,
    )

    return order


async def cancel(user_id: PydanticObjectId, order_id: str) -> Order:
    o = await Order.get(PydanticObjectId(order_id))
    if o is None or o.user_id != user_id:
        raise NotFoundError("Order not found")
    return await matching_engine.cancel_order(o, reason="USER_CANCELLED")


async def admin_force_cancel(order_id: str, *, reason: str = "ADMIN_FORCE_CANCEL") -> Order:
    o = await Order.get(PydanticObjectId(order_id))
    if o is None:
        raise NotFoundError("Order not found")
    return await matching_engine.cancel_order(o, reason=reason)


async def list_for_user(
    user_id: PydanticObjectId, *, status: str | None = None, limit: int = 100, skip: int = 0
) -> list[Order]:
    q: dict[str, Any] = {"user_id": user_id}
    if status:
        q["status"] = status
    return (
        await Order.find(q).sort("-created_at").skip(skip).limit(limit).to_list()
    )


async def list_all(*, status: str | None = None, limit: int = 100, skip: int = 0) -> list[Order]:
    q: dict[str, Any] = {}
    if status:
        q["status"] = status
    return await Order.find(q).sort("-created_at").skip(skip).limit(limit).to_list()
