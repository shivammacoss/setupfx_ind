"""Internal B-Book matching engine.

For market orders we fill immediately at the current LTP.
For limit / SL / SL-M orders, the order is parked OPEN — a background
poller (Phase 4 Celery) walks pending orders and fills any whose conditions
are met. This file ships the **immediate-fill** path used by `order_service`.

CRITICAL: orders are NEVER routed to an external exchange.
"""

from __future__ import annotations

import logging
import secrets
from decimal import Decimal

from beanie import PydanticObjectId
from bson import Decimal128

from app.models._base import OrderAction, OrderType
from app.models.order import Order, OrderStatus
from app.models.trade import Trade
from app.services import (
    brokerage_calculator,
    market_data_service,
    netting_service,
    position_service,
    wallet_service,
)
from app.utils.decimal_utils import quantize_money, to_decimal
from app.utils.time_utils import now_utc

logger = logging.getLogger(__name__)


def _trade_number() -> str:
    return f"T{now_utc().strftime('%y%m%d')}{secrets.token_hex(4).upper()}"


async def execute_market_order(order: Order) -> Trade:
    """Immediately fill a MARKET order at LTP, generate a Trade,
    update positions/holdings, debit charges + (settle PnL if closing)."""
    ltp = await market_data_service.get_ltp(order.instrument.token)

    # Resolve the same action/option/product-aware netting settings the
    # validator used so brokerage matches what admin configured for this
    # specific leg (option BUY vs SELL, intraday vs overnight, etc.).
    instr_ref = order.instrument
    option_type = None
    if "OPTION" in (instr_ref.segment or "").upper():
        # Option type is encoded in the trading symbol's last 2 chars (CE/PE)
        sym = (instr_ref.symbol or "").upper()
        if sym.endswith("CE"):
            option_type = "CE"
        elif sym.endswith("PE"):
            option_type = "PE"

    netting_resolved = await netting_service.get_effective_settings(
        order.user_id,
        instr_ref.segment,
        action=order.action.value if hasattr(order.action, "value") else str(order.action),
        option_type=option_type,
        product_type=order.product_type.value if hasattr(order.product_type, "value") else str(order.product_type),
        symbol=instr_ref.symbol,
    )

    charges = await brokerage_calculator.calculate(
        segment_type=order.instrument.segment,
        action=order.action,
        product_type=order.product_type,
        qty=order.quantity,
        price=ltp,
        lot_size=order.instrument.lot_size,
        netting_override=netting_resolved.get("settings"),
    )

    qty_dec = to_decimal(order.quantity)
    notional = quantize_money(ltp * qty_dec)
    trade = Trade(
        trade_number=_trade_number(),
        order_id=order.id,  # type: ignore[arg-type]
        user_id=order.user_id,
        instrument=order.instrument,
        action=order.action,
        product_type=order.product_type,
        quantity=order.quantity,
        price=Decimal128(str(ltp)),
        value=Decimal128(str(notional)),
        brokerage=Decimal128(str(charges.brokerage)),
        total_charges=Decimal128(str(charges.total)),
        net_amount=Decimal128(
            str(quantize_money(notional + (charges.total if order.action == OrderAction.SELL else -charges.total)))
        ),
    )
    await trade.insert()

    # Update order
    order.filled_quantity += order.quantity
    order.pending_quantity = max(0, order.quantity - order.filled_quantity)
    order.average_price = Decimal128(str(ltp))
    order.brokerage = Decimal128(str(charges.brokerage))
    order.other_charges = Decimal128(
        str(quantize_money(charges.total - charges.brokerage))
    )
    order.status = OrderStatus.EXECUTED
    order.executed_at = now_utc()
    await order.save()

    # Capture position margin BEFORE the fill so we can detect how much
    # margin was freed (partial close, full close, or flip).
    from app.models.position import Position, PositionStatus

    existing_pos = await Position.find_one(
        Position.user_id == order.user_id,
        Position.instrument.token == order.instrument.token,
        Position.product_type == order.product_type,
        Position.status == PositionStatus.OPEN,
    )
    old_pos_margin = to_decimal(existing_pos.margin_used) if existing_pos else Decimal(0)

    # Update position / holding — carry the order's bracket SL/TP onto the
    # newly opened (or merged) Position so the auto-squareoff worker can act
    # on it and the UI can render / edit it.
    sl_dec = to_decimal(order.bracket_stop_loss) if order.bracket_stop_loss is not None else None
    tp_dec = to_decimal(order.bracket_target) if order.bracket_target is not None else None
    pos = await position_service.apply_fill(
        user_id=order.user_id,
        instrument=order.instrument,
        segment_type=order.instrument.segment,
        action=order.action,
        product_type=order.product_type,
        quantity=order.quantity,
        price=ltp,
        margin_used=to_decimal(order.margin_blocked),
        stop_loss=sl_dec,
        target=tp_dec,
    )

    # Release wallet margin proportional to the position margin decrease.
    # This handles ALL cases: BUY closing a short, SELL closing a long,
    # partial closes, and flips — without relying on order.margin_blocked
    # which may be 0 for squareoff orders.
    new_pos_margin = to_decimal(pos.margin_used)
    freed_margin = old_pos_margin - new_pos_margin
    if freed_margin > 0:
        await wallet_service.release_margin(order.user_id, freed_margin)

    # Charges debit (always negative cash impact)
    from app.models.transaction import TransactionType

    await wallet_service.adjust(
        order.user_id,
        -charges.total,
        transaction_type=TransactionType.CHARGES,
        narration=f"Charges for {order.action.value} {order.instrument.symbol} x{order.quantity}",
        reference_type="ORDER",
        reference_id=str(order.id),
    )

    # If SELL: credit proceeds
    if order.action == OrderAction.SELL:
        proceeds = quantize_money(ltp * to_decimal(order.quantity))
        await wallet_service.adjust(
            order.user_id,
            proceeds,
            transaction_type=TransactionType.TRADE,
            narration=f"SELL {order.instrument.symbol} x{order.quantity} @ ₹{ltp}",
            reference_type="ORDER",
            reference_id=str(order.id),
        )

    return trade


async def cancel_order(order: Order, *, reason: str | None = None) -> Order:
    if order.status not in (OrderStatus.PENDING, OrderStatus.OPEN, OrderStatus.PARTIAL):
        return order
    order.status = OrderStatus.CANCELLED
    order.cancelled_at = now_utc()
    order.rejection_reason = reason
    await order.save()
    # Release any margin that had been blocked
    if to_decimal(order.margin_blocked) > 0:
        await wallet_service.release_margin(order.user_id, to_decimal(order.margin_blocked))
    return order


# ── Pending-order poller ─────────────────────────────────────────────
# Walks every parked LIMIT / SL-M order every tick and fires the ones whose
# trigger condition is met. Started once from the FastAPI lifespan.

_poller_running: bool = False


def _should_fill(order_type: OrderType, action: OrderAction, ltp: Decimal,
                 limit_price: Decimal, trigger_price: Decimal) -> bool:
    """LIMIT BUY  fills when LTP ≤ limit  (we get our price or better)
       LIMIT SELL fills when LTP ≥ limit
       SL-M  BUY  fills when LTP ≥ trigger (stop-buy / break-out)
       SL-M  SELL fills when LTP ≤ trigger (stop-loss exit)"""
    if order_type == OrderType.LIMIT:
        if limit_price <= 0:
            return False
        if action == OrderAction.BUY:
            return ltp <= limit_price
        return ltp >= limit_price
    if order_type == OrderType.SL_M:
        if trigger_price <= 0:
            return False
        if action == OrderAction.BUY:
            return ltp >= trigger_price
        return ltp <= trigger_price
    return False


async def trigger_pending_orders() -> int:
    """One pass over all OPEN/PARTIAL non-MARKET orders. Returns how many
    orders fired this pass. Logs but never raises — a single bad order
    must not stop the others."""
    triggered = 0
    try:
        rows = await Order.find(
            {
                "status": {"$in": [OrderStatus.OPEN.value, OrderStatus.PARTIAL.value]},
                "order_type": {"$in": [OrderType.LIMIT.value, OrderType.SL_M.value]},
            }
        ).to_list()
    except Exception:
        logger.exception("pending_order_scan_failed")
        return 0

    for o in rows:
        try:
            ltp = await market_data_service.get_ltp(o.instrument.token)
            if not _should_fill(
                o.order_type, o.action, ltp,
                to_decimal(o.price), to_decimal(o.trigger_price),
            ):
                continue
            await execute_market_order(o)
            triggered += 1
        except Exception:
            logger.exception(
                "pending_order_trigger_failed",
                extra={"order_id": str(o.id), "symbol": o.instrument.symbol},
            )
    return triggered


async def pending_order_poller(interval_sec: float = 1.5) -> None:
    """Background loop launched from the lifespan. Idempotent — second call
    returns immediately."""
    global _poller_running
    if _poller_running:
        return
    _poller_running = True
    logger.info("pending_order_poller_started", extra={"interval_sec": interval_sec})
    try:
        import asyncio as _asyncio
        while _poller_running:
            n = await trigger_pending_orders()
            if n:
                logger.info("pending_orders_triggered", extra={"count": n})
            await _asyncio.sleep(interval_sec)
    finally:
        _poller_running = False
        logger.info("pending_order_poller_stopped")


def stop_pending_order_poller() -> None:
    global _poller_running
    _poller_running = False
