"""Risk Management background enforcer.

Runs every few seconds and applies the three "automatic" risk policies
configured under Admin → Risk Management:

    marginCallLevel    — notify the user when equity / used_margin × 100
                         falls below this percentage
    stopOutLevel       — square off the worst-losing position when it falls
                         below this percentage (one position per tick so
                         we don't liquidate the whole book on a single dip)
    ledgerBalanceClose — force-close ALL open positions when the ledger
                         balance % collapses below this percentage

The "hold-time" + "exit-only" + "block-limit" policies are enforced
synchronously inside the order placement / squareoff handlers and the
order_validator — they don't need a background loop.
"""

from __future__ import annotations

import asyncio
import logging
from decimal import Decimal
from typing import Any

from app.models._base import OrderAction, OrderType
from app.models.position import Position, PositionStatus
from app.models.user import User
from app.services import (
    market_data_service,
    netting_service,
    order_service,
    position_service,
    wallet_service,
)
from app.utils.decimal_utils import to_decimal

logger = logging.getLogger(__name__)

_running = False
_notified_margin_call: set[str] = set()  # user_id strings already notified this session


def _equity(wallet: Any, unrealised_inr: Decimal) -> Decimal:
    """Equity = available + used_margin + unrealised P&L. Mirrors the
    standard pro-terminal formula so the % matches what users see."""
    avail = to_decimal(wallet.available_balance)
    used = to_decimal(wallet.used_margin)
    return avail + used + unrealised_inr


async def _send_margin_call_notice(user_id: str, level: float, current_pct: float) -> None:
    """Best-effort margin-call ping. Uses Redis pub/sub so the user's
    open browser tab can show a banner without polling."""
    try:
        from app.core.redis_client import publish

        await publish(
            f"user:{user_id}:risk",
            {
                "type": "margin_call",
                "level": level,
                "current_pct": round(current_pct, 2),
            },
        )
    except Exception:
        logger.debug("margin_call_publish_failed", extra={"user_id": user_id})


async def _squareoff_position(user: User, p: Position, reason: str) -> None:
    """Fire an opposite-side market order to flatten one position. Mirrors
    the user's manual squareoff flow but bypasses the hold-time guard
    (this IS the system enforcing the rule, not the user)."""
    if p.quantity == 0:
        return
    action = OrderAction.SELL if p.quantity > 0 else OrderAction.BUY
    qty = abs(p.quantity)
    lots = max(0.01, qty / max(1, p.instrument.lot_size or 1))
    try:
        await order_service.place_order(
            user=user,
            payload={
                "token": p.instrument.token,
                "action": action.value,
                "order_type": OrderType.MARKET.value,
                "product_type": p.product_type.value,
                "lots": lots,
                "placed_from": "RISK_ENFORCER",
            },
        )
        logger.info(
            "risk_auto_squareoff",
            extra={
                "user_id": str(user.id),
                "position_id": str(p.id),
                "symbol": p.instrument.symbol,
                "reason": reason,
            },
        )
    except Exception:
        logger.exception(
            "risk_auto_squareoff_failed",
            extra={"user_id": str(user.id), "position_id": str(p.id)},
        )


async def _enforce_for_user(user: User) -> None:
    """One sweep for one user. Exits early if there are no open positions
    (most users at any moment)."""
    open_positions = await Position.find(
        Position.user_id == user.id, Position.status == PositionStatus.OPEN
    ).to_list()
    if not open_positions:
        # Clear any prior margin-call flag so a future breach re-notifies.
        _notified_margin_call.discard(str(user.id))
        return

    # Refresh LTP on each so unrealised is current. While we're holding the
    # fresh tick anyway, check the position's bracket SL/TP and force a
    # squareoff if either side is breached — this is what fires SL/TP on
    # open positions (the `pending_order_poller` only handles standalone
    # LIMIT / SL-M orders, not bracket legs attached to a position).
    total_unrealised = Decimal("0")
    bracket_fired_ids: set[str] = set()
    for p in open_positions:
        try:
            ltp = await market_data_service.get_ltp(p.instrument.token)
            await position_service.refresh_unrealized_pnl(p, ltp)
        except Exception:
            ltp = None  # type: ignore[assignment]
        try:
            total_unrealised += to_decimal(p.unrealized_pnl)
        except Exception:
            pass

        # ── Bracket SL / TP hit check ──────────────────────────────────
        # Long (qty > 0):
        #   SL fires when LTP <= stop_loss
        #   TP fires when LTP >= target
        # Short (qty < 0):
        #   SL fires when LTP >= stop_loss
        #   TP fires when LTP <= target
        if ltp is None or p.quantity == 0:
            continue
        try:
            ltp_dec = to_decimal(ltp)
            sl = to_decimal(p.stop_loss) if p.stop_loss is not None else None
            tp = to_decimal(p.target) if p.target is not None else None
        except Exception:
            continue

        hit_reason: str | None = None
        if p.quantity > 0:  # LONG
            if sl is not None and sl > 0 and ltp_dec <= sl:
                hit_reason = f"bracket_sl_long@{ltp_dec}"
            elif tp is not None and tp > 0 and ltp_dec >= tp:
                hit_reason = f"bracket_tp_long@{ltp_dec}"
        else:  # SHORT
            if sl is not None and sl > 0 and ltp_dec >= sl:
                hit_reason = f"bracket_sl_short@{ltp_dec}"
            elif tp is not None and tp > 0 and ltp_dec <= tp:
                hit_reason = f"bracket_tp_short@{ltp_dec}"

        if hit_reason is not None:
            await _squareoff_position(user, p, hit_reason)
            bracket_fired_ids.add(str(p.id))

    # Drop any positions we just flattened from downstream margin-call /
    # stop-out logic so it doesn't double-square the same leg.
    if bracket_fired_ids:
        open_positions = [p for p in open_positions if str(p.id) not in bracket_fired_ids]
        if not open_positions:
            return

    wallet = await wallet_service.get_or_create(user.id)  # type: ignore[arg-type]
    used = to_decimal(wallet.used_margin)
    equity = _equity(wallet, total_unrealised)

    risk = (await netting_service.get_effective_risk(str(user.id)))["settings"]
    margin_call_level = float(risk.get("marginCallLevel") or 0)
    stop_out_level = float(risk.get("stopOutLevel") or 0)
    ledger_close_level = float(risk.get("ledgerBalanceClose") or 0)

    # Equity / used_margin × 100 — undefined when no margin used. Skip those
    # checks; ledger-balance-close still applies via available balance.
    pct = float(equity / used * 100) if used > 0 else float("inf")

    user_id_str = str(user.id)

    # 1) Margin call notification — pub/sub once per breach window.
    if margin_call_level > 0 and pct < margin_call_level and used > 0:
        if user_id_str not in _notified_margin_call:
            _notified_margin_call.add(user_id_str)
            await _send_margin_call_notice(user_id_str, margin_call_level, pct)
            logger.warning(
                "margin_call_triggered",
                extra={"user_id": user_id_str, "pct": pct, "threshold": margin_call_level},
            )
    elif pct >= margin_call_level:
        _notified_margin_call.discard(user_id_str)

    # 2) Stop-out — square off the WORST losing position (most-negative
    # unrealised). One per tick so a quick recovery doesn't nuke the book.
    if stop_out_level > 0 and pct < stop_out_level and used > 0:
        worst = min(
            open_positions,
            key=lambda x: float(str(x.unrealized_pnl)) if x.unrealized_pnl is not None else 0.0,
        )
        await _squareoff_position(user, worst, f"stop_out_pct_{pct:.2f}_below_{stop_out_level}")
        return  # Re-evaluate next tick after the close lands

    # 3) Ledger balance close — total wipeout protection. When ledger balance
    # (avail + credit) % of the original exposure drops below the threshold,
    # flatten everything. Treat this as the harshest gate so it runs last.
    if ledger_close_level > 0:
        ledger = to_decimal(wallet.available_balance) + to_decimal(wallet.credit_limit)
        # Original exposure = used_margin (what was locked) + ledger remaining
        # — that's the user's total equity pool when the trades opened.
        pool = used + ledger
        if pool > 0:
            ledger_pct = float(ledger / pool * 100)
            if ledger_pct < ledger_close_level:
                logger.warning(
                    "ledger_balance_close_triggered",
                    extra={
                        "user_id": user_id_str,
                        "ledger_pct": ledger_pct,
                        "threshold": ledger_close_level,
                    },
                )
                for p in open_positions:
                    await _squareoff_position(user, p, f"ledger_balance_below_{ledger_close_level}")


async def enforce_once() -> int:
    """One full sweep across every user with open positions. Returns count
    of users processed (useful for liveness logging)."""
    user_ids = await Position.distinct("user_id", {"status": PositionStatus.OPEN.value})
    if not user_ids:
        return 0
    count = 0
    for uid in user_ids:
        try:
            user = await User.get(uid)
            if user is None:
                continue
            await _enforce_for_user(user)
            count += 1
        except Exception:
            logger.exception("risk_enforcer_user_failed", extra={"user_id": str(uid)})
    return count


async def risk_enforcer_loop(interval_sec: float = 5.0) -> None:
    """Background loop launched from the FastAPI lifespan. Idempotent — a
    second call returns immediately. 5 s default keeps overhead low while
    catching breaches well before any human could react."""
    global _running
    if _running:
        return
    _running = True
    logger.info("risk_enforcer_started", extra={"interval_sec": interval_sec})
    try:
        while _running:
            try:
                await enforce_once()
            except Exception:
                logger.exception("risk_enforcer_tick_failed")
            await asyncio.sleep(interval_sec)
    finally:
        _running = False
        logger.info("risk_enforcer_stopped")


def stop_risk_enforcer() -> None:
    global _running
    _running = False
