"""Position + Holding maintenance.

Called by the matching engine on each fill: updates the user's open Position
(or closes one out), maintains the per-(user,segment,instrument) tracker,
and for CNC trades writes/updates the long-term Holding record.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from beanie import PydanticObjectId
from bson import Decimal128

from app.models._base import OrderAction, ProductType
from app.models.holding import Holding
from app.models.order import InstrumentRef
from app.models.position import Position, PositionStatus, UserPositionTracker
from app.utils.decimal_utils import (
    ZERO,
    add,
    quantize_money,
    sub,
    to_decimal,
    to_decimal128,
)
from app.utils.time_utils import now_utc


async def apply_fill(
    *,
    user_id: PydanticObjectId,
    instrument: InstrumentRef,
    segment_type: str,
    action: OrderAction,
    product_type: ProductType,
    quantity: float,
    price: Decimal,
    margin_used: Decimal,
    stop_loss: Decimal | None = None,
    target: Decimal | None = None,
) -> Position:
    """Idempotent-ish: looks up an open position for this instrument+product
    and merges. For opposite-side fills it reduces and may close out."""
    pos = await Position.find_one(
        Position.user_id == user_id,
        Position.instrument.token == instrument.token,  # type: ignore[union-attr]
        Position.product_type == product_type,
        Position.status == PositionStatus.OPEN,
    )

    signed_qty = quantity if action == OrderAction.BUY else -quantity

    # Capture the prevailing USD/INR rate at the moment of fill — used later
    # to convert P&L on USD-quoted instruments (BTCUSD, EURUSD, …) into INR.
    # ``None`` for instruments already priced in INR.
    from app.services.market_data_service import get_usd_inr_rate, is_usd_quoted_segment

    open_fx_rate = (
        Decimal128(str(round(get_usd_inr_rate(), 4)))
        if is_usd_quoted_segment(segment_type) or is_usd_quoted_segment(instrument.segment)
        else None
    )

    if pos is None:
        pos = Position(
            user_id=user_id,
            instrument=instrument,
            segment_type=segment_type,
            product_type=product_type,
            quantity=signed_qty,
            avg_price=Decimal128(str(price)),
            ltp=Decimal128(str(price)),
            margin_used=Decimal128(str(margin_used)),
            stop_loss=Decimal128(str(stop_loss)) if stop_loss is not None else None,
            target=Decimal128(str(target)) if target is not None else None,
            open_usd_inr_rate=open_fx_rate,
            opened_at=now_utc(),
            status=PositionStatus.OPEN,
        )
        await pos.insert()
    else:
        cur_qty = pos.quantity
        new_qty = cur_qty + signed_qty
        cur_avg = to_decimal(pos.avg_price)

        # The position's `margin_used` represents how much wallet margin is
        # currently locked against this position. It must scale with
        # |quantity|, NOT just accumulate on every fill — otherwise SELL
        # legs that close a long add margin on top of the BUY margin instead
        # of releasing it, and the field grows by ~2× per round-trip cycle.
        # We compute the new margin_used below based on what kind of fill
        # this is, then assign it in one place.
        new_margin_used: Decimal | None = None

        if cur_qty == 0:
            # Previously closed position being reopened on this fill.
            pos.avg_price = Decimal128(str(price))
            pos.quantity = signed_qty
            new_margin_used = to_decimal(margin_used)
        elif (cur_qty > 0 and signed_qty > 0) or (cur_qty < 0 and signed_qty < 0):
            # Same side (pyramiding): weighted avg, ADD the new leg's margin.
            total = to_decimal(abs(cur_qty) + abs(signed_qty))
            pos.avg_price = Decimal128(
                str(quantize_money((cur_avg * to_decimal(abs(cur_qty)) + price * to_decimal(abs(signed_qty))) / total))
            )
            pos.quantity = new_qty
            new_margin_used = to_decimal(pos.margin_used) + to_decimal(margin_used)
        else:
            # Opposite side: realize PnL on the closed portion + release
            # margin proportional to how much of the original was closed.
            closed_qty = min(abs(cur_qty), abs(signed_qty))
            sign = 1 if cur_qty > 0 else -1
            realized = (price - cur_avg) * to_decimal(closed_qty) * sign
            pos.realized_pnl = Decimal128(str(quantize_money(to_decimal(pos.realized_pnl) + realized)))
            pos.quantity = new_qty
            if new_qty == 0:
                # Fully closed: all locked margin against this position is freed.
                pos.status = PositionStatus.CLOSED
                pos.closed_at = now_utc()
                if pos.open_usd_inr_rate is not None and pos.close_usd_inr_rate is None:
                    pos.close_usd_inr_rate = Decimal128(str(round(get_usd_inr_rate(), 4)))
                new_margin_used = to_decimal(0)
            elif (cur_qty > 0 and new_qty < 0) or (cur_qty < 0 and new_qty > 0):
                # Flipped sides — the closing leg fully cleared the original
                # direction; whatever of `signed_qty` remained opened a new
                # opposite position. Margin = the portion of the new order
                # margin that backs the remaining qty.
                pos.avg_price = Decimal128(str(price))
                if open_fx_rate is not None:
                    pos.open_usd_inr_rate = open_fx_rate
                flip_ratio = to_decimal(abs(new_qty)) / to_decimal(abs(signed_qty))
                new_margin_used = to_decimal(margin_used) * flip_ratio
            else:
                # Partial close on same side: scale the existing margin down
                # to the remaining quantity ratio. (The SELL order itself
                # doesn't add new locked margin — it releases existing.)
                scale = to_decimal(abs(new_qty)) / to_decimal(abs(cur_qty))
                new_margin_used = to_decimal(pos.margin_used) * scale

        pos.ltp = Decimal128(str(price))
        if new_margin_used is not None:
            # Floor at 0 so accumulated rounding can't drive it negative.
            if new_margin_used < 0:
                new_margin_used = to_decimal(0)
            pos.margin_used = Decimal128(str(quantize_money(new_margin_used)))
        # Carry over SL/TP from the originating Order if the user supplied them
        # and the position doesn't already have them (don't overwrite an
        # existing SL when the user is just adding to the same position).
        if stop_loss is not None and pos.stop_loss is None:
            pos.stop_loss = Decimal128(str(stop_loss))
        if target is not None and pos.target is None:
            pos.target = Decimal128(str(target))
        await pos.save()

    # Tracker
    await _bump_tracker(
        user_id=user_id,
        segment_type=segment_type,
        token=instrument.token,
        product_type=product_type,
        delta_lots=quantity / max(1, instrument.lot_size),
        delta_margin=margin_used,
        signed_qty=signed_qty,
    )

    # CNC also updates long-term Holding
    if product_type == ProductType.CNC:
        await _apply_holding(
            user_id=user_id,
            instrument=instrument,
            action=action,
            quantity=quantity,
            price=price,
        )

    return pos


async def _bump_tracker(
    *,
    user_id: PydanticObjectId,
    segment_type: str,
    token: str,
    product_type: ProductType,
    delta_lots: float,
    delta_margin: Decimal,
    signed_qty: float,
) -> None:
    t = await UserPositionTracker.find_one(
        UserPositionTracker.user_id == user_id,
        UserPositionTracker.segment_type == segment_type,
        UserPositionTracker.instrument_token == token,
    )
    if t is None:
        t = UserPositionTracker(
            user_id=user_id, segment_type=segment_type, instrument_token=token
        )
    if product_type == ProductType.MIS:
        t.intraday_lots = max(0.0, t.intraday_lots + (delta_lots if signed_qty > 0 else -delta_lots))
    else:
        t.holding_lots = max(0.0, t.holding_lots + (delta_lots if signed_qty > 0 else -delta_lots))
    t.total_lots = abs(t.intraday_lots) + abs(t.holding_lots)
    t.margin_blocked = to_decimal128(add(t.margin_blocked, delta_margin))
    await t.save()


async def _apply_holding(
    *,
    user_id: PydanticObjectId,
    instrument: InstrumentRef,
    action: OrderAction,
    quantity: float,
    price: Decimal,
) -> None:
    h = await Holding.find_one(
        Holding.user_id == user_id, Holding.instrument.token == instrument.token  # type: ignore[union-attr]
    )
    qty_dec = to_decimal(quantity)
    if h is None:
        if action == OrderAction.BUY:
            h = Holding(
                user_id=user_id,
                instrument=instrument,
                quantity=quantity,
                avg_price=Decimal128(str(price)),
                ltp=Decimal128(str(price)),
                invested_value=Decimal128(str(quantize_money(price * qty_dec))),
                current_value=Decimal128(str(quantize_money(price * qty_dec))),
            )
            await h.insert()
        return

    if action == OrderAction.BUY:
        new_qty = h.quantity + quantity
        denom = to_decimal(max(1.0, new_qty))
        new_avg = quantize_money(
            (to_decimal(h.avg_price) * to_decimal(h.quantity) + price * qty_dec) / denom
        )
        h.quantity = new_qty
        h.avg_price = Decimal128(str(new_avg))
    else:
        # SELL — reduce
        h.quantity = max(0.0, h.quantity - quantity)

    h.ltp = Decimal128(str(price))
    h.invested_value = Decimal128(
        str(quantize_money(to_decimal(h.avg_price) * to_decimal(h.quantity)))
    )
    h.current_value = Decimal128(
        str(quantize_money(to_decimal(h.ltp) * to_decimal(h.quantity)))
    )
    pnl = sub(h.current_value, h.invested_value)
    h.pnl = Decimal128(str(pnl))
    invested = to_decimal(h.invested_value)
    h.pnl_percentage = float((pnl / invested) * 100) if invested > ZERO else 0.0
    if h.quantity == 0:
        await h.delete()
    else:
        await h.save()


async def list_open(user_id: str | PydanticObjectId) -> list[Position]:
    return await Position.find(
        Position.user_id == PydanticObjectId(user_id), Position.status == PositionStatus.OPEN
    ).to_list()


async def list_closed_today(user_id: str | PydanticObjectId) -> list[Position]:
    from app.utils.time_utils import start_of_day_ist, to_utc

    since = to_utc(start_of_day_ist())
    return await Position.find(
        Position.user_id == PydanticObjectId(user_id),
        Position.status == PositionStatus.CLOSED,
        Position.closed_at >= since,
    ).to_list()


async def refresh_unrealized_pnl(position: Position, ltp: Decimal) -> Position:
    position.ltp = Decimal128(str(ltp))
    pnl = (ltp - to_decimal(position.avg_price)) * to_decimal(position.quantity)
    position.unrealized_pnl = Decimal128(str(quantize_money(pnl)))
    return position


async def list_holdings(user_id: str | PydanticObjectId) -> list[Holding]:
    return await Holding.find(Holding.user_id == PydanticObjectId(user_id)).to_list()
