"""User reports — P&L, tradebook, brokerage, tax, margin."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, Query

from app.core.dependencies import CurrentUser
from app.models.trade import Trade
from app.models.transaction import TransactionType, WalletTransaction
from app.schemas.common import APIResponse
from app.utils.time_utils import now_utc

router = APIRouter(prefix="/reports", tags=["user-reports"])


@router.get("/pnl", response_model=APIResponse[dict])
async def pnl_report(
    user: CurrentUser,
    from_date: datetime | None = None,
    to_date: datetime | None = None,
):
    f = from_date or (now_utc() - timedelta(days=30))
    t = to_date or now_utc()
    trades = await Trade.find(
        Trade.user_id == user.id,
        Trade.executed_at >= f,
        Trade.executed_at <= t,
    ).sort("+executed_at").to_list()

    total_buy = 0.0
    total_sell = 0.0
    total_charges = 0.0
    by_symbol: dict[str, dict[str, Any]] = {}
    for tr in trades:
        sym = tr.instrument.symbol
        v = float(str(tr.value))
        c = float(str(tr.total_charges))
        total_charges += c
        agg = by_symbol.setdefault(
            sym, {"symbol": sym, "buy_qty": 0, "sell_qty": 0, "buy_value": 0.0, "sell_value": 0.0, "charges": 0.0}
        )
        if tr.action.value == "BUY":
            agg["buy_qty"] += tr.quantity
            agg["buy_value"] += v
            total_buy += v
        else:
            agg["sell_qty"] += tr.quantity
            agg["sell_value"] += v
            total_sell += v
        agg["charges"] += c
        agg["pnl"] = agg["sell_value"] - agg["buy_value"] - agg["charges"]

    return APIResponse(
        data={
            "from": f,
            "to": t,
            "total_trades": len(trades),
            "total_buy_value": round(total_buy, 2),
            "total_sell_value": round(total_sell, 2),
            "total_charges": round(total_charges, 2),
            "net_pnl": round(total_sell - total_buy - total_charges, 2),
            "by_symbol": list(by_symbol.values()),
        }
    )


@router.get("/tradebook", response_model=APIResponse[list])
async def tradebook(user: CurrentUser, from_date: datetime | None = None, to_date: datetime | None = None, limit: int = Query(default=500, le=2000)):
    q: dict[str, Any] = {"user_id": user.id}
    if from_date or to_date:
        q["executed_at"] = {}
        if from_date:
            q["executed_at"]["$gte"] = from_date
        if to_date:
            q["executed_at"]["$lte"] = to_date
    rows = await Trade.find(q).sort("-executed_at").limit(limit).to_list()
    return APIResponse(
        data=[
            {
                "id": str(t.id),
                "trade_number": t.trade_number,
                "order_id": str(t.order_id),
                "symbol": t.instrument.symbol,
                "exchange": str(t.instrument.exchange),
                "action": t.action.value,
                "quantity": t.quantity,
                "price": str(t.price),
                "value": str(t.value),
                "brokerage": str(t.brokerage),
                "total_charges": str(t.total_charges),
                "executed_at": t.executed_at,
            }
            for t in rows
        ]
    )


@router.get("/brokerage", response_model=APIResponse[dict])
async def brokerage_summary(user: CurrentUser, from_date: datetime | None = None, to_date: datetime | None = None):
    f = from_date or (now_utc() - timedelta(days=30))
    t = to_date or now_utc()
    trades = await Trade.find(
        Trade.user_id == user.id, Trade.executed_at >= f, Trade.executed_at <= t
    ).to_list()
    totals = {"brokerage": 0.0, "total": 0.0}
    for tr in trades:
        totals["brokerage"] += float(str(tr.brokerage))
        totals["total"] += float(str(tr.total_charges))
    return APIResponse(data={"from": f, "to": t, "totals": {k: round(v, 2) for k, v in totals.items()}, "trade_count": len(trades)})


@router.get("/tax", response_model=APIResponse[dict])
async def tax_pnl(user: CurrentUser):
    """Simplified Indian tax-pnl bucketization. Real CG calc would consider FIFO holding period etc."""
    trades = await Trade.find(Trade.user_id == user.id).to_list()
    buckets = {"intraday_speculative": 0.0, "stcg": 0.0, "ltcg": 0.0, "fno": 0.0}
    for tr in trades:
        seg = (tr.instrument.segment or "").upper()
        v = float(str(tr.value))
        if "FUTURE" in seg or "OPTION" in seg:
            buckets["fno"] += v if tr.action.value == "SELL" else -v
        else:
            buckets["stcg"] += v if tr.action.value == "SELL" else -v
    return APIResponse(data={"buckets": {k: round(v, 2) for k, v in buckets.items()}})


@router.get("/margin", response_model=APIResponse[dict])
async def margin_report(user: CurrentUser):
    from app.services import wallet_service
    s = await wallet_service.summary(user.id)
    return APIResponse(data=s)
