"""Netting Segment + Risk Management models.

Replaces the old `segment_settings` family. Built from the bharat_indian_funded
admin panel as the reference, adapted for FastAPI + Beanie.

Hierarchy:
    NettingSegment (one row per segment, e.g. NSE_EQ, NSE_FUT, FOREX, ...)
        ↓
    NettingScriptOverride (per-symbol override within a segment; null = inherit)
        ↓
    UserSegmentOverride (per-user override; null = inherit)

Plus:
    RiskSettings        — global default risk controls
    UserRiskSettings    — per-user risk overrides (null = inherit)
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from beanie import Indexed, PydanticObjectId
from pydantic import BaseModel, Field
from pymongo import ASCENDING, IndexModel

from app.models._base import TimestampMixin


# ── Risk Management ────────────────────────────────────────────────
class RiskSettingsBase(BaseModel):
    """8 fields shared between global default + per-user override."""

    ledgerBalanceClose: float | None = None  # %
    profitTradeHoldMinSeconds: int | None = None
    lossTradeHoldMinSeconds: int | None = None
    blockLimitAboveBelowHighLow: bool | None = None
    blockLimitBetweenHighLow: bool | None = None
    exitOnlyMode: bool | None = None
    marginCallLevel: float | None = None  # %
    stopOutLevel: float | None = None  # %


class RiskSettingsRequired(BaseModel):
    """Global default — all required, sane fallbacks."""

    ledgerBalanceClose: float = 0.0
    profitTradeHoldMinSeconds: int = 0
    lossTradeHoldMinSeconds: int = 0
    blockLimitAboveBelowHighLow: bool = False
    blockLimitBetweenHighLow: bool = False
    exitOnlyMode: bool = False
    marginCallLevel: float = 100.0
    stopOutLevel: float = 50.0


class RiskSettings(TimestampMixin, RiskSettingsRequired):
    type: Indexed(str, unique=True) = "global"  # type: ignore[valid-type]

    class Settings:
        name = "risk_settings"
        indexes = [IndexModel([("type", ASCENDING)], unique=True)]


class UserRiskSettings(TimestampMixin, RiskSettingsBase):
    user_id: PydanticObjectId

    class Settings:
        name = "user_risk_settings"
        indexes = [IndexModel([("user_id", ASCENDING)], unique=True)]


# ── Netting Segment matrix ─────────────────────────────────────────
SEGMENT_CODES = [
    "NSE_EQ", "NSE_FUT", "NSE_OPT",
    "BSE_EQ", "BSE_FUT", "BSE_OPT",
    "MCX_FUT", "MCX_OPT",
    "FOREX", "STOCKS",
    "CRYPTO_PERPETUAL", "CRYPTO_OPTIONS",
    "INDICES", "COMMODITIES",
]


class NettingFieldsBase(BaseModel):
    """All editable fields, all nullable for override layers."""

    # Lot
    minLots: float | None = None
    orderLots: float | None = None
    maxLots: float | None = None
    maxExchangeLots: float | None = None
    # Quantity
    minQty: float | None = None
    perOrderQty: float | None = None
    maxQtyPerScript: float | None = None
    # Value
    maxValue: float | None = None
    # Fixed Margin
    marginCalcMode: Literal["fixed", "times", "percent"] | None = None
    intradayMargin: float | None = None
    overnightMargin: float | None = None
    optionBuyIntraday: float | None = None
    optionBuyOvernight: float | None = None
    optionSellIntraday: float | None = None
    optionSellOvernight: float | None = None
    # Options
    buyingStrikeFarPercent: float | None = None
    sellingStrikeFarPercent: float | None = None
    # Brokerage
    commissionType: Literal["per_lot", "per_crore"] | None = None
    commission: float | None = None
    optionBuyCommission: float | None = None
    optionSellCommission: float | None = None
    chargeOn: Literal["open", "close", "both"] | None = None
    # Limit away
    limitAwayPercent: float | None = None
    # Spread
    spreadType: Literal["fixed", "floating"] | None = None
    spreadPips: float | None = None
    swapType: Literal["points", "percentage"] | None = None
    swapLong: float | None = None
    swapShort: float | None = None
    swapTime: str | None = None  # HH:MM IST
    # Block
    isActive: bool | None = None
    tradingEnabled: bool | None = None
    allowOvernight: bool | None = None
    # Wallet-utilisation cap (% of total wallet that may sit in used margin)
    maxMarginUsagePercent: float | None = None
    # Expiry day
    expiryProfitHoldMinSeconds: int | None = None
    expiryLossHoldMinSeconds: int | None = None
    expiryDayIntradayMargin: float | None = None
    expiryDayOptionBuyMargin: float | None = None
    expiryDayOptionSellMargin: float | None = None


class NettingFieldsRequired(BaseModel):
    """Defaults applied to every newly-seeded segment."""

    # Lot
    minLots: float = 1.0
    orderLots: float = 1.0
    maxLots: float = 100.0
    maxExchangeLots: float = 1000.0
    # Quantity
    minQty: float = 1.0
    perOrderQty: float = 1.0
    maxQtyPerScript: float = 100000.0
    # Value
    maxValue: float = 0.0  # 0 = no cap
    # Fixed Margin
    marginCalcMode: Literal["fixed", "times", "percent"] = "percent"
    intradayMargin: float = 100.0
    overnightMargin: float = 100.0
    optionBuyIntraday: float = 100.0
    optionBuyOvernight: float = 100.0
    optionSellIntraday: float = 15.0
    optionSellOvernight: float = 15.0
    # Options
    buyingStrikeFarPercent: float = 10.0
    sellingStrikeFarPercent: float = 10.0
    # Brokerage
    commissionType: Literal["per_lot", "per_crore"] = "per_lot"
    commission: float = 20.0
    optionBuyCommission: float = 20.0
    optionSellCommission: float = 20.0
    chargeOn: Literal["open", "close", "both"] = "both"
    # Limit away
    limitAwayPercent: float = 10.0
    # Spread
    spreadType: Literal["fixed", "floating"] = "fixed"
    spreadPips: float = 0.0
    swapType: Literal["points", "percentage"] = "points"
    swapLong: float = 0.0
    swapShort: float = 0.0
    swapTime: str = "22:30"
    # Block
    isActive: bool = True
    tradingEnabled: bool = True
    allowOvernight: bool = True
    # Wallet utilisation cap — once `used_margin / (used+available+credit)`
    # exceeds this %, new positions are blocked. Default 100% (no extra cap).
    maxMarginUsagePercent: float = 100.0
    # Expiry day
    expiryProfitHoldMinSeconds: int = 0
    expiryLossHoldMinSeconds: int = 0
    expiryDayIntradayMargin: float = 100.0
    expiryDayOptionBuyMargin: float = 100.0
    expiryDayOptionSellMargin: float = 50.0


class NettingSegment(TimestampMixin, NettingFieldsRequired):
    """One row per segment code."""

    name: Indexed(str, unique=True)  # type: ignore[valid-type]  # e.g. "NSE_EQ"
    displayName: str  # "NSE EQ"
    # UI cell-gating flags
    lotApplies: bool = True
    qtyApplies: bool = False
    optionApplies: bool = False
    expiryHoldApplies: bool = False
    futureApplies: bool = False

    class Settings:
        name = "netting_segments"
        indexes = [IndexModel([("name", ASCENDING)], unique=True)]


class NettingScriptOverride(TimestampMixin, NettingFieldsBase):
    """Per-symbol override within a segment — null fields inherit from segment."""

    segment_id: PydanticObjectId
    segment_name: str  # denormalised for filter queries
    symbol: str
    tradingSymbol: str | None = None
    instrumentToken: int | None = None
    lotSize: float = 1.0

    class Settings:
        name = "netting_script_overrides"
        indexes = [
            IndexModel(
                [("segment_name", ASCENDING), ("symbol", ASCENDING)], unique=True
            ),
        ]


class UserSegmentOverride(TimestampMixin, NettingFieldsBase):
    """Per-user override on a segment (or specific symbol within segment)."""

    user_id: PydanticObjectId
    segment_name: str
    symbol: str | None = None  # None = applies to entire segment

    class Settings:
        name = "user_segment_overrides"
        indexes = [
            IndexModel(
                [("user_id", ASCENDING), ("segment_name", ASCENDING), ("symbol", ASCENDING)],
                unique=True,
            ),
        ]
