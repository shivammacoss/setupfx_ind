"""Position + UserPositionTracker.

`Position` represents a *currently open* directional exposure (or today's
closed intraday positions). `UserPositionTracker` is a small denormalised
counter used by the order validator for fast lot-limit checks (no aggregation).
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from beanie import PydanticObjectId
from bson import Decimal128
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel

from app.models._base import ProductType, StrEnum, TimestampMixin
from app.models._types import Money
from app.models.order import InstrumentRef


def _zero() -> Decimal128:
    return Decimal128("0")


class PositionStatus(StrEnum):
    OPEN = "OPEN"
    CLOSED = "CLOSED"


class Position(TimestampMixin):
    user_id: PydanticObjectId
    instrument: InstrumentRef
    segment_type: str
    product_type: ProductType

    quantity: float = 0  # signed; positive = long, negative = short
    avg_price: Money = Field(default_factory=_zero)
    ltp: Money = Field(default_factory=_zero)

    realized_pnl: Money = Field(default_factory=_zero)
    unrealized_pnl: Money = Field(default_factory=_zero)
    margin_used: Money = Field(default_factory=_zero)

    # Bracket legs — optional SL / target attached to this open position.
    # The auto-squareoff worker compares LTP against these on every tick;
    # the user can also edit them inline from the positions strip.
    stop_loss: Money | None = None
    target: Money | None = None

    # FX rates frozen at trade open / close — used to convert USD-quoted
    # P&L (crypto, forex, currency-derivatives) into INR for the wallet.
    # ``None`` for INR-native instruments (NSE / BSE / MCX / NFO / BFO).
    open_usd_inr_rate: Money | None = None
    close_usd_inr_rate: Money | None = None

    status: PositionStatus = PositionStatus.OPEN
    opened_at: datetime | None = None
    closed_at: datetime | None = None

    class Settings:
        name = "positions"
        indexes = [
            IndexModel([("user_id", ASCENDING), ("status", ASCENDING)]),
            IndexModel(
                [
                    ("user_id", ASCENDING),
                    ("instrument.token", ASCENDING),
                    ("product_type", ASCENDING),
                    ("status", ASCENDING),
                ]
            ),
            IndexModel([("status", ASCENDING), ("instrument.token", ASCENDING)]),
            IndexModel([("opened_at", DESCENDING)]),
        ]


class UserPositionTracker(TimestampMixin):
    """Per-(user, segment, instrument) lot counters. Updated atomically on fill.

    Avoids aggregation during the 12-check validator hot path.
    """

    user_id: PydanticObjectId
    segment_type: str
    instrument_token: str

    intraday_lots: float = 0  # MIS lots currently held
    holding_lots: float = 0  # NRML/CNC lots
    total_lots: float = 0  # sum of abs(intraday) + abs(holding)
    margin_blocked: Money = Field(default_factory=_zero)

    class Settings:
        name = "user_position_tracker"
        indexes = [
            IndexModel(
                [
                    ("user_id", ASCENDING),
                    ("segment_type", ASCENDING),
                    ("instrument_token", ASCENDING),
                ],
                unique=True,
            ),
        ]
