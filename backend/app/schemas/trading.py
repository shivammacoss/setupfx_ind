"""Trading-domain request/response schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class PlaceOrderRequest(BaseModel):
    token: str
    action: str  # BUY / SELL
    order_type: str  # MARKET / LIMIT / SL / SL_M
    product_type: str  # MIS / CNC / NRML
    lots: float = Field(ge=0.001, le=100000)  # fractional for crypto/forex
    price: float | None = 0
    trigger_price: float | None = 0
    validity: str = "DAY"
    is_amo: bool = False
    # Bracket order legs — auto-place opposite-side SL & target after entry
    stop_loss: float | None = None
    target: float | None = None


class ModifyOrderRequest(BaseModel):
    lots: float | None = None
    price: float | None = None
    trigger_price: float | None = None


class OrderOut(BaseModel):
    id: str
    order_number: str
    user_id: str
    symbol: str
    exchange: str
    segment: str
    token: str | None = None
    instrument_token: str | None = None
    action: str
    order_type: str
    product_type: str
    validity: str
    lots: float
    quantity: float
    filled_quantity: float
    pending_quantity: float
    price: str
    trigger_price: str
    average_price: str
    status: str
    rejection_reason: str | None = None
    is_amo: bool
    margin_blocked: str
    brokerage: str
    other_charges: str
    bracket_stop_loss: str | None = None
    bracket_target: str | None = None
    created_at: datetime
    executed_at: datetime | None = None
    cancelled_at: datetime | None = None
    updated_at: datetime | None = None


class TradeOut(BaseModel):
    id: str
    trade_number: str
    order_id: str
    user_id: str
    symbol: str
    exchange: str
    action: str
    quantity: float
    price: str
    value: str
    total_charges: str
    net_amount: str
    executed_at: datetime


class PositionOut(BaseModel):
    id: str
    user_id: str
    symbol: str
    exchange: str
    segment_type: str
    product_type: str
    quantity: float
    avg_price: str
    ltp: str
    realized_pnl: str
    unrealized_pnl: str
    margin_used: str
    stop_loss: str | None = None
    target: str | None = None
    status: str
    opened_at: str | None = None
    instrument_token: str | None = None


class HoldingOut(BaseModel):
    id: str
    user_id: str
    symbol: str
    exchange: str
    quantity: float
    avg_price: str
    ltp: str
    invested_value: str
    current_value: str
    pnl: str
    pnl_percentage: float


class WalletSummary(BaseModel):
    available_balance: str
    used_margin: str
    realized_pnl: str
    unrealized_pnl: str
    credit_limit: str
    total_deposits: str
    total_withdrawals: str
    total_brokerage: str
    total_charges: str


class InstrumentOut(BaseModel):
    token: str
    symbol: str
    trading_symbol: str
    name: str
    exchange: str
    segment: str
    instrument_type: str
    lot_size: int
    tick_size: str
    expiry: str | None = None
    strike: str | None = None
    option_type: str | None = None
    is_active: bool
    is_tradable: bool


class QuoteOut(BaseModel):
    token: str
    ltp: float
    change: float
    change_pct: float
    open: float
    high: float
    low: float
    prev_close: float
    volume: float  # crypto/forex have fractional contract volumes (e.g. 5.21241 BTC)
    bid: float
    ask: float
    depth: dict[str, Any] | None = None
    # "zerodha" / "infoway" / None (mock). Helps the UI show a provider badge
    # so users can verify whether they're seeing live exchange data or fallback.
    source: str | None = None


class WatchlistOut(BaseModel):
    id: str
    name: str
    sort_order: int
    is_default: bool
    items: list[dict[str, Any]] = []


class WatchlistCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)


class WatchlistAddItem(BaseModel):
    token: str


class DepositCreate(BaseModel):
    amount: float = Field(gt=0)
    payment_mode: str = "UPI"
    utr_number: str | None = None
    screenshot_url: str | None = None
    user_remark: str | None = None
    bank_account_id: str | None = None


class WithdrawalCreate(BaseModel):
    amount: float = Field(gt=0)
    bank: dict[str, Any]
    remarks: str | None = None


class AlertCreate(BaseModel):
    token: str
    alert_type: str = "LTP_ABOVE"
    target_price: float | None = None
    target_percent: float | None = None
    note: str | None = None
