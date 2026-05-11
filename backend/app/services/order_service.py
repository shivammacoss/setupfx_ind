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
    """Place a new order. Validates, blocks margin, persists, and (for MARKET) executes."""
    # Inputs
    token = str(payload.get("token") or "").strip()
    if not token:
        raise ValidationFailedError("instrument token is required")

    instrument = await instrument_service.get_by_token(token)
    if not instrument.is_tradable or instrument.is_halted or not instrument.is_active:
        raise ValidationFailedError("Instrument is not tradable")

    action = OrderAction(payload["action"])
    order_type = OrderType(payload["order_type"])
    product_type = ProductType(payload["product_type"])
    validity = Validity(payload.get("validity") or "DAY")
    lots = float(payload.get("lots") or 1)  # fractional for crypto/forex
    lot_size = max(1, instrument.lot_size or 1)
    quantity = lots * lot_size
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

    # Block margin (only for BUY or short SELL — for selling existing position the wallet is untouched)
    margin = validated.margin_required
    if action == OrderAction.BUY:
        await wallet_service.block_margin(user.id, margin)  # type: ignore[arg-type]

    # Persist
    instr_ref = InstrumentRef(
        token=instrument.token,
        symbol=instrument.symbol,
        trading_symbol=instrument.trading_symbol,
        exchange=instrument.exchange,
        segment=instrument.segment,
        lot_size=instrument.lot_size or 1,
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

    # Execute or park
    if order_type == OrderType.MARKET and not is_amo:
        await matching_engine.execute_market_order(order)
    else:
        order.status = OrderStatus.OPEN
        await order.save()

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
