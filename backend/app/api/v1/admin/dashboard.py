"""Admin dashboard summary endpoint."""

from __future__ import annotations

import logging
from datetime import timedelta

from fastapi import APIRouter

from app.core.database import healthcheck as db_health
from app.core.dependencies import CurrentAdmin
from app.core.redis_client import healthcheck as redis_health
from app.models.holding import Holding
from app.models.order import Order, OrderStatus
from app.models.position import Position, PositionStatus
from app.models.trade import Trade
from app.models.transaction import (
    DepositRequest,
    DepositStatus,
    WithdrawalRequest,
    WithdrawalStatus,
)
from app.models.user import User, UserStatus
from app.models.wallet import Wallet
from app.schemas.common import APIResponse
from app.utils.time_utils import now_utc

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dashboard", tags=["admin-dashboard"])


async def _safe(coro, default):
    """Run an awaitable; on failure log and return `default` so a single bad
    query doesn't blank the whole admin dashboard."""
    try:
        return await coro
    except Exception:
        logger.exception("admin_dashboard_query_failed")
        return default


@router.get("/stats", response_model=APIResponse[dict])
async def stats(admin: CurrentAdmin):
    today_start = now_utc() - timedelta(hours=24)

    total_users = await _safe(User.find(User.status != UserStatus.CLOSED).count(), 0)
    active_users_today = await _safe(
        # Raw `$gte` because Beanie's typed comparison rejects nullable fields.
        User.find({"last_login_at": {"$gte": today_start}}).count(),
        0,
    )
    pending_deposits = await _safe(
        DepositRequest.find(DepositRequest.status == DepositStatus.PENDING).count(), 0
    )
    pending_withdrawals = await _safe(
        WithdrawalRequest.find(WithdrawalRequest.status == WithdrawalStatus.PENDING).count(), 0
    )
    open_positions = await _safe(
        Position.find(Position.status == PositionStatus.OPEN).count(), 0
    )
    # Beanie's chained `.in_()` on enum fields is unreliable — use raw `$in`.
    pending_orders = await _safe(
        Order.find(
            {"status": {"$in": [OrderStatus.OPEN.value, OrderStatus.PENDING.value, OrderStatus.PARTIAL.value]}}
        ).count(),
        0,
    )
    trades_today = await _safe(Trade.find(Trade.executed_at >= today_start).to_list(), [])
    today_volume = sum(float(str(t.value)) for t in trades_today)
    today_revenue = sum(float(str(t.brokerage)) for t in trades_today)

    wallets = await _safe(Wallet.find_all().to_list(), [])
    total_balance = sum(float(str(w.available_balance)) for w in wallets)
    total_margin = sum(float(str(w.used_margin)) for w in wallets)

    holdings = await _safe(Holding.find_all().to_list(), [])
    holdings_count = len(holdings)

    return APIResponse(
        data={
            "users": {"total": total_users, "active_today": active_users_today},
            "money": {
                "wallet_balance_total": round(total_balance, 2),
                "margin_used_total": round(total_margin, 2),
            },
            "trading": {
                "open_positions": open_positions,
                "pending_orders": pending_orders,
                "trades_today": len(trades_today),
                "today_volume": round(today_volume, 2),
                "today_revenue": round(today_revenue, 2),
                "holdings_count": holdings_count,
            },
            "approvals": {
                "pending_deposits": pending_deposits,
                "pending_withdrawals": pending_withdrawals,
            },
            "system": {
                "db": await _safe(db_health(), False),
                "redis": await _safe(redis_health(), False),
            },
        }
    )


@router.get("/risk-alerts", response_model=APIResponse[list])
async def risk_alerts(admin: CurrentAdmin):
    """High-MTM-loss users + heavy concentration."""
    rows = []
    positions = await Position.find(Position.status == PositionStatus.OPEN).to_list()
    by_user: dict[str, dict] = {}
    for p in positions:
        agg = by_user.setdefault(
            str(p.user_id),
            {"user_id": str(p.user_id), "open_positions": 0, "unrealized_pnl": 0.0, "margin_used": 0.0},
        )
        agg["open_positions"] += 1
        agg["unrealized_pnl"] += float(str(p.unrealized_pnl))
        agg["margin_used"] += float(str(p.margin_used))
    for entry in by_user.values():
        if entry["margin_used"] > 0 and entry["unrealized_pnl"] < 0:
            ratio = abs(entry["unrealized_pnl"]) / max(1, entry["margin_used"])
            if ratio > 0.5:
                level = "DANGER"
            elif ratio > 0.25:
                level = "WARNING"
            else:
                continue
            entry["mtm_ratio_pct"] = round(ratio * 100, 1)
            entry["level"] = level
            rows.append(entry)
    rows.sort(key=lambda r: -r["mtm_ratio_pct"])
    return APIResponse(data=rows)
