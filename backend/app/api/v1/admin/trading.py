"""Admin trading views: orders, positions, trades, holdings, instruments."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any

from beanie import PydanticObjectId
from bson import Decimal128
from fastapi import APIRouter, HTTPException, Query

from app.core.dependencies import CurrentAdmin
from app.core.redis_client import publish
from app.models._base import OrderAction, OrderType
from app.models.audit_log import AuditAction
from app.models.holding import Holding
from app.models.order import Order
from app.models.position import Position, PositionStatus
from app.models.trade import Trade
from app.models.user import User
from app.schemas.common import APIResponse
from app.services import market_data_service, order_service
from app.services.audit_service import log_event


async def _publish_position_event(
    user_id: PydanticObjectId,
    event: str,
    position: Position | None,
    extra: dict[str, Any] | None = None,
) -> None:
    """Push a position-update message to the user's Redis pub/sub channel so
    open browsers refresh their positions strip without a page reload."""
    try:
        payload: dict[str, Any] = {"type": "position_update", "event": event}
        if position is not None:
            payload["position"] = {
                "id": str(position.id),
                "symbol": position.instrument.symbol,
                "instrument_token": position.instrument.token,
                "segment_type": position.segment_type,
                "product_type": position.product_type.value,
                "quantity": position.quantity,
                "avg_price": str(position.avg_price),
                "stop_loss": str(position.stop_loss) if position.stop_loss is not None else None,
                "target": str(position.target) if position.target is not None else None,
                "status": position.status.value,
                "opened_at": position.opened_at.isoformat() if position.opened_at else None,
                "closed_at": position.closed_at.isoformat() if position.closed_at else None,
            }
        if extra:
            payload.update(extra)
        await publish(f"user:{user_id}:positions", payload)
    except Exception:  # pragma: no cover — never fail the API call on a publish error
        pass

router = APIRouter(tags=["admin-trading"])


# ── Orders ──────────────────────────────────────────────────────────
@router.get("/orders", response_model=APIResponse[dict])
async def list_orders(
    admin: CurrentAdmin,
    status: str | None = None,
    user_id: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
):
    q: dict[str, Any] = {}
    if status:
        q["status"] = status
    if user_id:
        q["user_id"] = PydanticObjectId(user_id)
    total = await Order.find(q).count()
    rows = await Order.find(q).sort("-created_at").skip((page - 1) * page_size).limit(page_size).to_list()

    user_ids = list({r.user_id for r in rows})
    users = await User.find({"_id": {"$in": user_ids}}).to_list() if user_ids else []
    user_map = {str(u.id): {"user_code": u.user_code, "full_name": u.full_name} for u in users}

    return APIResponse(
        data={
            "items": [
                {
                    "id": str(r.id),
                    "order_number": r.order_number,
                    "user_id": str(r.user_id),
                    "user_code": user_map.get(str(r.user_id), {}).get("user_code"),
                    "user_name": user_map.get(str(r.user_id), {}).get("full_name"),
                    "symbol": r.instrument.symbol,
                    "exchange": str(r.instrument.exchange),
                    "segment": r.instrument.segment,
                    "token": r.instrument.token,
                    "instrument_token": r.instrument.token,
                    "action": r.action.value,
                    "order_type": r.order_type.value,
                    "product_type": r.product_type.value,
                    "lots": r.lots,
                    "quantity": r.quantity,
                    "filled_quantity": r.filled_quantity,
                    "price": str(r.price),
                    "average_price": str(r.average_price),
                    "status": r.status.value,
                    "created_at": r.created_at,
                    "executed_at": r.executed_at,
                    "cancelled_at": getattr(r, "cancelled_at", None),
                }
                for r in rows
            ],
            "meta": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "total_pages": (total + page_size - 1) // page_size,
            },
        }
    )


@router.get("/orders/quotes", response_model=APIResponse[list])
async def order_quotes(admin: CurrentAdmin, tokens: str = Query(default="")):
    """Tiny LTP batch endpoint so the admin Orders page can compute live P&L
    for every order, including ones whose position is already closed."""
    out = []
    for tok in (t.strip() for t in (tokens or "").split(",") if t.strip()):
        try:
            ltp = await market_data_service.get_ltp(tok)
            out.append({"token": tok, "ltp": float(ltp)})
        except Exception:
            out.append({"token": tok, "ltp": 0.0})
    return APIResponse(data=out)


@router.delete("/orders/{order_id}", response_model=APIResponse[dict])
async def force_cancel(order_id: str, admin: CurrentAdmin):
    o = await order_service.admin_force_cancel(order_id)
    await log_event(
        action=AuditAction.ORDER_CANCEL,
        entity_type="Order",
        entity_id=o.id,
        actor_id=admin.id,
        target_user_id=o.user_id,
    )
    return APIResponse(data={"id": str(o.id), "status": o.status.value})


# ── Positions ────────────────────────────────────────────────────────
@router.get("/positions", response_model=APIResponse[list])
async def list_positions(admin: CurrentAdmin, user_id: str | None = None, status: str | None = None):
    q: dict[str, Any] = {}
    if user_id:
        q["user_id"] = PydanticObjectId(user_id)
    # status="ALL" (or "*") → return both OPEN and CLOSED. Empty → default
    # to OPEN-only so the page is fast on load.
    norm_status = (status or "").strip().upper()
    if norm_status and norm_status not in ("ALL", "*"):
        q["status"] = norm_status
    elif not norm_status:
        q["status"] = PositionStatus.OPEN.value
    rows = await Position.find(q).sort("-opened_at").limit(500).to_list()

    user_ids = list({r.user_id for r in rows})
    users = await User.find({"_id": {"$in": user_ids}}).to_list() if user_ids else []
    user_map = {str(u.id): {"user_code": u.user_code, "full_name": u.full_name} for u in users}

    # Snapshot the live USD/INR rate once so every USD-quoted row in this
    # response is converted using a consistent reference. Infoway keeps this
    # tick fresh; on cold start we fall back to the constant.
    current_usd_inr = market_data_service.get_usd_inr_rate()

    out = []
    for r in rows:
        ltp = await market_data_service.get_ltp(r.instrument.token)
        avg = float(str(r.avg_price))
        ltp_f = float(ltp)
        qty = r.quantity
        margin = float(str(r.margin_used))
        realized = float(str(r.realized_pnl))

        is_usd = market_data_service.is_usd_quoted_segment(r.segment_type) or \
            market_data_service.is_usd_quoted_segment(r.instrument.segment)

        # Prices stay in source currency (USD for crypto/forex, INR for the
        # rest) — that's what the live feed quotes. Only realised + unrealised
        # P&L gets converted to INR so the wallet/M2M columns are consistent.
        if is_usd:
            open_rate = (
                float(str(r.open_usd_inr_rate))
                if r.open_usd_inr_rate is not None
                else current_usd_inr
            )
            # Live FX for the unrealised leg — moves with USDINR every refresh.
            unrealized_pnl_inr = (ltp_f - avg) * qty * current_usd_inr
            # Realised legs are frozen at the close rate (or open rate if
            # this position is still open and has had partial closes).
            realized_pnl_inr = realized * open_rate
            # margin_used was locked from the wallet at order time (validator
            # computed it as a wallet-currency number), so DON'T re-apply FX
            # here — that's why the position view used to show ~80× the
            # wallet's used_margin.
            margin_inr = margin
        else:
            unrealized_pnl_inr = (ltp_f - avg) * qty
            realized_pnl_inr = realized
            margin_inr = margin
            open_rate = 1.0

        out.append(
            {
                "id": str(r.id),
                "user_id": str(r.user_id),
                "user_code": user_map.get(str(r.user_id), {}).get("user_code"),
                "user_name": user_map.get(str(r.user_id), {}).get("full_name"),
                "symbol": r.instrument.symbol,
                "instrument_token": r.instrument.token,
                "exchange": str(r.instrument.exchange),
                "segment_type": r.segment_type,
                "product_type": r.product_type.value,
                "quantity": qty,
                # Prices in source currency — UI renders with $ or ₹ based on
                # the `currency_quote` flag below.
                "avg_price": f"{avg:.4f}" if is_usd else f"{avg:.2f}",
                "ltp": f"{ltp_f:.4f}" if is_usd else f"{ltp_f:.2f}",
                # P&L + margin are always INR (wallet currency).
                "unrealized_pnl": f"{unrealized_pnl_inr:.2f}",
                "realized_pnl": f"{realized_pnl_inr:.2f}",
                "margin_used": f"{margin_inr:.2f}",
                # Currency tag so the UI can prefix avg/ltp with $ instead of ₹
                "currency_quote": "USD" if is_usd else "INR",
                "open_usd_inr_rate": f"{open_rate:.4f}" if is_usd else None,
                "current_usd_inr_rate": f"{current_usd_inr:.4f}" if is_usd else None,
                "status": r.status.value,
                "opened_at": r.opened_at,
            }
        )
    return APIResponse(data=out)


@router.post("/positions/{position_id}/squareoff", response_model=APIResponse[dict])
async def admin_squareoff(position_id: str, admin: CurrentAdmin):
    p = await Position.get(PydanticObjectId(position_id))
    if p is None or p.status != PositionStatus.OPEN or p.quantity == 0:
        raise HTTPException(status_code=400, detail="Position is not open")
    target_user = await User.get(p.user_id)
    if target_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    action = OrderAction.SELL if p.quantity > 0 else OrderAction.BUY
    qty = abs(p.quantity)
    lots = max(1, qty // max(1, p.instrument.lot_size or 1))
    o = await order_service.place_order(
        user=target_user,
        payload={
            "token": p.instrument.token,
            "action": action.value,
            "order_type": OrderType.MARKET.value,
            "product_type": p.product_type.value,
            "lots": lots,
            "placed_from": "ADMIN",
        },
    )
    await log_event(
        action=AuditAction.SQUAREOFF_FORCE,
        entity_type="Position",
        entity_id=p.id,
        actor_id=admin.id,
        target_user_id=p.user_id,
    )
    # Reload the position so the published payload reflects the closed state
    refreshed = await Position.get(PydanticObjectId(position_id))
    await _publish_position_event(p.user_id, "force_close", refreshed or p, {"by": "admin"})
    return APIResponse(data={"order_id": str(o.id), "status": o.status.value})


@router.patch("/positions/{position_id}", response_model=APIResponse[dict])
async def admin_edit_position(position_id: str, payload: dict[str, Any], admin: CurrentAdmin):
    """Admin-only: edit an open position's entry details. Used to correct
    fat-fingered fills, set/adjust attached SL & target, or back-date the
    open time. Patch is fanned out via Redis pub/sub so the user's terminal
    re-renders the positions strip without a refresh.

    Accepted fields:
        avg_price, quantity, opened_at, stop_loss, target
    """
    p = await Position.get(PydanticObjectId(position_id))
    if p is None:
        raise HTTPException(status_code=404, detail="Position not found")

    old_values: dict[str, Any] = {
        "avg_price": str(p.avg_price),
        "quantity": p.quantity,
        "opened_at": p.opened_at.isoformat() if p.opened_at else None,
        "stop_loss": str(p.stop_loss) if p.stop_loss is not None else None,
        "target": str(p.target) if p.target is not None else None,
    }

    if "avg_price" in payload and payload["avg_price"] is not None:
        try:
            p.avg_price = Decimal128(str(payload["avg_price"]))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid avg_price: {e}")
    if "quantity" in payload and payload["quantity"] is not None:
        try:
            p.quantity = float(payload["quantity"])
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid quantity: {e}")
    if "opened_at" in payload and payload["opened_at"] is not None:
        try:
            p.opened_at = datetime.fromisoformat(str(payload["opened_at"]).replace("Z", "+00:00"))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid opened_at: {e}")
    if "stop_loss" in payload:
        v = payload["stop_loss"]
        p.stop_loss = Decimal128(str(v)) if v not in (None, "", 0) else None
    if "target" in payload:
        v = payload["target"]
        p.target = Decimal128(str(v)) if v not in (None, "", 0) else None

    # Recompute margin_used at the new entry so the wallet view stays consistent.
    if "avg_price" in payload or "quantity" in payload:
        try:
            ref_price = float(str(p.avg_price))
            p.margin_used = Decimal128(str(round(abs(p.quantity) * ref_price, 2)))
        except Exception:
            pass

    await p.save()

    new_values: dict[str, Any] = {
        "avg_price": str(p.avg_price),
        "quantity": p.quantity,
        "opened_at": p.opened_at.isoformat() if p.opened_at else None,
        "stop_loss": str(p.stop_loss) if p.stop_loss is not None else None,
        "target": str(p.target) if p.target is not None else None,
    }
    await log_event(
        action=AuditAction.POSITION_EDIT
        if hasattr(AuditAction, "POSITION_EDIT")
        else AuditAction.SETTING_CHANGE,
        entity_type="Position",
        entity_id=p.id,
        actor_id=admin.id,
        target_user_id=p.user_id,
        old_values=old_values,
        new_values=new_values,
    )
    await _publish_position_event(p.user_id, "edit", p, {"by": "admin"})
    return APIResponse(data={"id": str(p.id), "status": p.status.value, **new_values})


@router.get("/positions/pnl-summary", response_model=APIResponse[dict])
async def positions_pnl_summary(admin: CurrentAdmin):
    """Aggregate PnL windows for the admin dashboard cards.

    today_pnl    — sum of realised P&L from trades + unrealised on open
                   positions, since IST midnight.
    week_pnl     — same, since the most recent IST Sunday 00:00.
    last_week_pnl — total realised P&L of the previous Sun→Sat window.
    """
    from datetime import datetime as _dt, timedelta as _td, timezone as _tz

    IST = _tz(_td(hours=5, minutes=30))
    now_ist = _dt.now(IST)
    today_start_ist = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
    # Sunday-anchored week (weekday: Mon=0 ... Sun=6 → days back = (wd+1) % 7)
    days_back = (now_ist.weekday() + 1) % 7
    week_start_ist = today_start_ist - _td(days=days_back)
    last_week_start_ist = week_start_ist - _td(days=7)
    last_week_end_ist = week_start_ist  # exclusive

    today_start = today_start_ist.astimezone(_tz.utc)
    week_start = week_start_ist.astimezone(_tz.utc)
    last_week_start = last_week_start_ist.astimezone(_tz.utc)
    last_week_end = last_week_end_ist.astimezone(_tz.utc)

    # Realised P&L lives on each Position (set on SELL closes/flips). We sum
    # across positions whose closed_at OR updated_at falls in the window —
    # covers fully-closed and partially-closed-but-still-open positions in
    # one query (positions that closed in window have closed_at set; ones
    # still open with realised slices booked have updated_at in window).
    #
    # FX: realized_pnl + unrealized_pnl are stored in NATIVE currency. For
    # USD-quoted (crypto/forex) we convert to INR via the locked open rate
    # (realised) or live rate (unrealised) — same logic as _pos() view.
    current_usd_inr = market_data_service.get_usd_inr_rate()

    def _is_usd(p: Position) -> bool:
        return market_data_service.is_usd_quoted_segment(p.segment_type) or \
            market_data_service.is_usd_quoted_segment(p.instrument.segment)

    def _realised_inr(p: Position) -> float:
        raw = float(str(p.realized_pnl))
        if not _is_usd(p):
            return raw
        rate = (
            float(str(p.open_usd_inr_rate))
            if p.open_usd_inr_rate is not None
            else current_usd_inr
        )
        return raw * rate

    async def _realised_in(window_start, window_end=None):
        rng: dict[str, Any] = {"$gte": window_start}
        if window_end is not None:
            rng["$lt"] = window_end
        rows = await Position.find(
            {"$or": [{"closed_at": rng}, {"updated_at": rng}]}
        ).to_list()
        return sum(_realised_inr(p) for p in rows)

    today_realised = await _realised_in(today_start)
    week_realised = await _realised_in(week_start)
    last_week_realised = await _realised_in(last_week_start, last_week_end)

    # Recompute unrealised LIVE per position rather than reading the stored
    # `p.unrealized_pnl` field — that field is only refreshed when the
    # position is touched (new fill, partial close, manual edit). For an
    # open position sitting idle between fills the stored number is stale
    # (often 0 on a freshly opened position), which is what made the
    # admin's "Open PNL" card stick at ₹0.00 while the per-row M2M column
    # showed the correct live number. Mirror the /positions list view's
    # (ltp - avg) * qty math so both reads stay in lockstep.
    open_positions = await Position.find(Position.status == PositionStatus.OPEN).to_list()
    total_unrealised = 0.0
    for p in open_positions:
        if p.quantity == 0:
            continue
        try:
            ltp = await market_data_service.get_ltp(p.instrument.token)
            ltp_f = float(ltp)
        except Exception:
            # Feed hiccup — fall back to the stored value so the card
            # doesn't silently zero out on a single failed lookup.
            stored = float(str(p.unrealized_pnl))
            total_unrealised += stored * (current_usd_inr if _is_usd(p) else 1.0)
            continue
        avg = float(str(p.avg_price))
        raw = (ltp_f - avg) * p.quantity
        if _is_usd(p):
            raw *= current_usd_inr
        total_unrealised += raw

    return APIResponse(
        data={
            "today_pnl": round(today_realised + total_unrealised, 2),
            "today_realised": round(today_realised, 2),
            "open_unrealised": round(total_unrealised, 2),
            "week_pnl": round(week_realised + total_unrealised, 2),
            "week_realised": round(week_realised, 2),
            "last_week_pnl": round(last_week_realised, 2),
            "today_start": today_start.isoformat(),
            "week_start": week_start.isoformat(),
            "last_week_start": last_week_start.isoformat(),
            "last_week_end": last_week_end.isoformat(),
            "usd_inr_rate": round(current_usd_inr, 4),
        }
    )


@router.delete("/positions/{position_id}", response_model=APIResponse[dict])
async def delete_position(position_id: str, admin: CurrentAdmin):
    """Hard-delete a position record. Use only for cleaning up bad/test data —
    closes via squareoff for normal flow."""
    p = await Position.get(PydanticObjectId(position_id))
    if p is None:
        raise HTTPException(status_code=404, detail="Position not found")
    user_id = p.user_id
    await p.delete()
    await _publish_position_event(user_id, "delete", None, {"id": position_id, "by": "admin"})
    return APIResponse(data={"ok": True, "id": position_id})


@router.post("/positions/emergency-squareoff", response_model=APIResponse[dict])
async def emergency_squareoff_all(admin: CurrentAdmin):
    """Panic button — squares off every open position across the platform."""
    rows = await Position.find(Position.status == PositionStatus.OPEN).to_list()
    total = 0
    placed = 0
    for r in rows:
        if r.quantity == 0:
            continue
        total += 1
        try:
            target = await User.get(r.user_id)
            if target is None:
                continue
            action = OrderAction.SELL if r.quantity > 0 else OrderAction.BUY
            qty = abs(r.quantity)
            lots = max(1, qty // max(1, r.instrument.lot_size or 1))
            await order_service.place_order(
                user=target,
                payload={
                    "token": r.instrument.token,
                    "action": action.value,
                    "order_type": OrderType.MARKET.value,
                    "product_type": r.product_type.value,
                    "lots": lots,
                    "placed_from": "ADMIN",
                },
            )
            placed += 1
            refreshed = await Position.get(r.id)
            await _publish_position_event(
                r.user_id, "force_close", refreshed or r, {"by": "admin", "reason": "emergency"}
            )
        except Exception:
            continue
    await log_event(
        action=AuditAction.SQUAREOFF_FORCE,
        entity_type="Platform",
        entity_id="emergency_all",
        actor_id=admin.id,
        metadata={"total": total, "placed": placed},
    )
    return APIResponse(data={"total": total, "placed": placed})


# ── Trades ──────────────────────────────────────────────────────────
@router.get("/trades", response_model=APIResponse[list])
async def list_trades(
    admin: CurrentAdmin,
    user_id: str | None = None,
    limit: int = Query(default=200, le=1000),
    from_dt: str | None = Query(default=None, description="ISO datetime, inclusive"),
    to_dt: str | None = Query(default=None, description="ISO datetime, exclusive"),
):
    q: dict[str, Any] = {}
    if user_id:
        q["user_id"] = PydanticObjectId(user_id)
    if from_dt or to_dt:
        from datetime import datetime as _dt
        rng: dict[str, Any] = {}
        if from_dt:
            rng["$gte"] = _dt.fromisoformat(from_dt.replace("Z", "+00:00"))
        if to_dt:
            rng["$lt"] = _dt.fromisoformat(to_dt.replace("Z", "+00:00"))
        q["executed_at"] = rng
    rows = await Trade.find(q).sort("-executed_at").limit(limit).to_list()
    user_ids = list({r.user_id for r in rows})
    users = await User.find({"_id": {"$in": user_ids}}).to_list() if user_ids else []
    umap = {str(u.id): u.user_code for u in users}
    return APIResponse(
        data=[
            {
                "id": str(r.id),
                "trade_number": r.trade_number,
                "order_id": str(r.order_id),
                "user_id": str(r.user_id),
                "user_code": umap.get(str(r.user_id)),
                "symbol": r.instrument.symbol,
                "exchange": str(r.instrument.exchange),
                "segment": r.instrument.segment,
                "token": r.instrument.token,
                "instrument_token": r.instrument.token,
                "action": r.action.value,
                "quantity": r.quantity,
                "price": str(r.price),
                "value": str(r.value),
                "brokerage": str(r.brokerage),
                "net_amount": str(r.net_amount),
                "total_charges": str(r.total_charges),
                "executed_at": r.executed_at,
            }
            for r in rows
        ]
    )


# ── Holdings ────────────────────────────────────────────────────────
@router.get("/holdings", response_model=APIResponse[list])
async def list_holdings(admin: CurrentAdmin, user_id: str | None = None):
    q: dict[str, Any] = {}
    if user_id:
        q["user_id"] = PydanticObjectId(user_id)
    rows = await Holding.find(q).limit(500).to_list()
    user_ids = list({r.user_id for r in rows})
    users = await User.find({"_id": {"$in": user_ids}}).to_list() if user_ids else []
    umap = {str(u.id): u.user_code for u in users}
    return APIResponse(
        data=[
            {
                "id": str(r.id),
                "user_id": str(r.user_id),
                "user_code": umap.get(str(r.user_id)),
                "symbol": r.instrument.symbol,
                "exchange": str(r.instrument.exchange),
                "quantity": r.quantity,
                "avg_price": str(r.avg_price),
                "ltp": str(r.ltp),
                "invested_value": str(r.invested_value),
                "current_value": str(r.current_value),
                "pnl": str(r.pnl),
                "pnl_percentage": r.pnl_percentage,
            }
            for r in rows
        ]
    )
