"""Netting Segment + Risk Management service.

Three resolvers:
    NettingSegment   → NettingScriptOverride → UserSegmentOverride
    RiskSettings     → UserRiskSettings
"""

from __future__ import annotations

import logging
from typing import Any

from beanie import PydanticObjectId

from app.core.exceptions import NotFoundError, ValidationFailedError
from app.core.redis_client import cache_delete_pattern, cache_get, cache_set
from app.models.netting import (
    NettingFieldsBase,
    NettingFieldsRequired,
    NettingScriptOverride,
    NettingSegment,
    RiskSettings,
    RiskSettingsBase,
    RiskSettingsRequired,
    SEGMENT_CODES,
    UserRiskSettings,
    UserSegmentOverride,
)
from app.models.user import User

logger = logging.getLogger(__name__)

CACHE_TTL = 300

NETTING_FIELDS = list(NettingFieldsRequired.model_fields.keys())
RISK_FIELDS = list(RiskSettingsRequired.model_fields.keys())

# Module-local debounce for "netting_eff:*" wipes. The admin Segment Matrix
# fires N parallel PUTs (one per dirty segment); without this each call
# would do its own SCAN-based Redis pattern delete, paying O(N×keys) when
# one wipe is enough. We dedupe by remembering the last wipe timestamp and
# skipping subsequent wipes within `_WIPE_DEDUP_SEC`.
_WIPE_DEDUP_SEC = 1.5
_last_eff_wipe: float = 0.0


async def _wipe_eff_cache_debounced() -> None:
    """Cheap O(1) check before the O(N) SCAN — drops redundant wipes that
    arrive within ~1.5 s of each other (typical for a multi-segment save).
    """
    global _last_eff_wipe
    import time

    now = time.time()
    if now - _last_eff_wipe < _WIPE_DEDUP_SEC:
        return
    _last_eff_wipe = now
    try:
        await cache_delete_pattern("netting_eff:*")
    except Exception:
        logger.warning("netting_cache_invalidation_failed_redis_down")


# ── Default segment seed metadata (matches bharat reference) ─────────
SEGMENT_DEFAULTS: list[dict[str, Any]] = [
    {"name": "NSE_EQ", "displayName": "NSE EQ", "lotApplies": False, "qtyApplies": True, "optionApplies": False, "expiryHoldApplies": False, "futureApplies": False},
    {"name": "NSE_FUT", "displayName": "NSE FUT", "lotApplies": True, "qtyApplies": False, "optionApplies": False, "expiryHoldApplies": True, "futureApplies": True},
    {"name": "NSE_OPT", "displayName": "NSE OPT", "lotApplies": True, "qtyApplies": False, "optionApplies": True, "expiryHoldApplies": True, "futureApplies": False},
    {"name": "BSE_EQ", "displayName": "BSE EQ", "lotApplies": False, "qtyApplies": True, "optionApplies": False, "expiryHoldApplies": False, "futureApplies": False},
    {"name": "BSE_FUT", "displayName": "BSE FUT", "lotApplies": True, "qtyApplies": False, "optionApplies": False, "expiryHoldApplies": True, "futureApplies": True},
    {"name": "BSE_OPT", "displayName": "BSE OPT", "lotApplies": True, "qtyApplies": False, "optionApplies": True, "expiryHoldApplies": True, "futureApplies": False},
    {"name": "MCX_FUT", "displayName": "MCX FUT", "lotApplies": True, "qtyApplies": False, "optionApplies": False, "expiryHoldApplies": True, "futureApplies": True},
    {"name": "MCX_OPT", "displayName": "MCX OPT", "lotApplies": True, "qtyApplies": False, "optionApplies": True, "expiryHoldApplies": True, "futureApplies": False},
    {"name": "FOREX", "displayName": "Forex", "lotApplies": True, "qtyApplies": False, "optionApplies": False, "expiryHoldApplies": False, "futureApplies": False},
    {"name": "STOCKS", "displayName": "Stocks", "lotApplies": True, "qtyApplies": False, "optionApplies": False, "expiryHoldApplies": False, "futureApplies": False},
    {"name": "CRYPTO_PERPETUAL", "displayName": "Crypto Perpetual", "lotApplies": True, "qtyApplies": False, "optionApplies": False, "expiryHoldApplies": False, "futureApplies": False},
    {"name": "CRYPTO_OPTIONS", "displayName": "Crypto Options", "lotApplies": True, "qtyApplies": False, "optionApplies": True, "expiryHoldApplies": True, "futureApplies": False},
    {"name": "INDICES", "displayName": "Indices", "lotApplies": True, "qtyApplies": False, "optionApplies": False, "expiryHoldApplies": False, "futureApplies": False},
    {"name": "COMMODITIES", "displayName": "Commodities", "lotApplies": True, "qtyApplies": False, "optionApplies": False, "expiryHoldApplies": False, "futureApplies": False},
]


# ── Seeding ─────────────────────────────────────────────────────────
async def seed_default_segments() -> int:
    inserted = 0
    for spec in SEGMENT_DEFAULTS:
        existing = await NettingSegment.find_one(NettingSegment.name == spec["name"])
        if existing is not None:
            continue
        defaults = NettingFieldsRequired().model_dump()
        # Equity segments: percent margin and per-crore brokerage; tweak a couple
        if spec["name"].endswith("_EQ"):
            defaults["commissionType"] = "per_crore"
            defaults["commission"] = 300.0
        if spec["name"] == "FOREX":
            defaults["spreadType"] = "floating"
            defaults["minLots"] = 0.01
            defaults["orderLots"] = 0.01
        if spec["name"].startswith("CRYPTO"):
            defaults["minLots"] = 0.001
            defaults["orderLots"] = 0.001
        await NettingSegment(**spec, **defaults).insert()
        inserted += 1
    return inserted


async def seed_default_risk() -> bool:
    existing = await RiskSettings.find_one(RiskSettings.type == "global")
    if existing is not None:
        return False
    await RiskSettings(**RiskSettingsRequired().model_dump()).insert()
    return True


# ── Risk Management ────────────────────────────────────────────────
async def get_global_risk() -> RiskSettings:
    doc = await RiskSettings.find_one(RiskSettings.type == "global")
    if doc is None:
        await seed_default_risk()
        doc = await RiskSettings.find_one(RiskSettings.type == "global")
    return doc  # type: ignore[return-value]


def _coerce_risk_value(field: str, v: Any) -> Any:
    """Coerce frontend payloads to the model's declared type. Number inputs
    on the form arrive as floats (because of step=0.01); the int-typed hold
    timers must be rounded to int or Pydantic 2.13 strict-mode will reject
    them on the next read and crash the GET endpoint."""
    if v is None:
        return None
    if field in ("profitTradeHoldMinSeconds", "lossTradeHoldMinSeconds"):
        try:
            return int(round(float(v)))
        except (TypeError, ValueError):
            return v
    if field in ("ledgerBalanceClose", "marginCallLevel", "stopOutLevel"):
        try:
            return float(v)
        except (TypeError, ValueError):
            return v
    if field in ("blockLimitAboveBelowHighLow", "blockLimitBetweenHighLow", "exitOnlyMode"):
        if isinstance(v, str):
            return v.lower() in ("true", "1", "yes", "on")
        return bool(v)
    return v


async def update_global_risk(patch: dict[str, Any]) -> RiskSettings:
    doc = await get_global_risk()
    for k, v in patch.items():
        if k in RISK_FIELDS and v is not None:
            setattr(doc, k, _coerce_risk_value(k, v))
    await doc.save()
    await cache_delete_pattern("risk:*")
    return doc


async def get_user_risk(user_id: str | PydanticObjectId) -> UserRiskSettings | None:
    return await UserRiskSettings.find_one(
        UserRiskSettings.user_id == PydanticObjectId(user_id)
    )


async def upsert_user_risk(user_id: str | PydanticObjectId, patch: dict[str, Any]) -> UserRiskSettings:
    uid = PydanticObjectId(user_id)
    existing = await UserRiskSettings.find_one(UserRiskSettings.user_id == uid)
    if existing is None:
        existing = UserRiskSettings(user_id=uid)
    for k, v in patch.items():
        if k in RISK_FIELDS:
            setattr(existing, k, _coerce_risk_value(k, v) if v is not None else None)
    await existing.save()
    await cache_delete_pattern(f"risk:{uid}")
    return existing


async def copy_user_risk(source_user_id: str | PydanticObjectId, dest_user_id: str | PydanticObjectId) -> UserRiskSettings:
    """Clone one user's override doc onto another. If the source has no
    override, the destination ends up inheriting global (override deleted)."""
    src_uid = PydanticObjectId(source_user_id)
    dst_uid = PydanticObjectId(dest_user_id)
    if src_uid == dst_uid:
        raise ValueError("Source and destination users are the same")
    src = await UserRiskSettings.find_one(UserRiskSettings.user_id == src_uid)
    if src is None:
        # Nothing to copy → drop any existing override on dest so it inherits.
        await delete_user_risk(dst_uid)
        return UserRiskSettings(user_id=dst_uid)
    patch = {f: getattr(src, f, None) for f in RISK_FIELDS}
    return await upsert_user_risk(dst_uid, patch)


async def delete_user_risk(user_id: str | PydanticObjectId) -> None:
    uid = PydanticObjectId(user_id)
    await UserRiskSettings.find(UserRiskSettings.user_id == uid).delete()
    await cache_delete_pattern(f"risk:{uid}")


async def get_effective_risk(user_id: str | PydanticObjectId) -> dict[str, Any]:
    uid = str(user_id)
    cache_key = f"risk:{uid}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached
    g = await get_global_risk()
    merged: dict[str, Any] = {f: getattr(g, f) for f in RISK_FIELDS}
    sources = {f: "GLOBAL" for f in RISK_FIELDS}
    u = await get_user_risk(uid)
    if u is not None:
        for f in RISK_FIELDS:
            v = getattr(u, f, None)
            if v is not None:
                merged[f] = v
                sources[f] = "USER"
    payload = {"settings": merged, "sources": sources}
    await cache_set(cache_key, payload, ttl_sec=CACHE_TTL)
    return payload


# ── Netting Segments ───────────────────────────────────────────────
async def list_segments() -> list[NettingSegment]:
    rows = await NettingSegment.find_all().to_list()
    if not rows:
        await seed_default_segments()
        rows = await NettingSegment.find_all().to_list()
    # Stable order matching SEGMENT_CODES
    order = {n: i for i, n in enumerate(SEGMENT_CODES)}
    rows.sort(key=lambda r: order.get(r.name, 99))
    return rows


async def get_segment(segment_id: str | PydanticObjectId) -> NettingSegment:
    doc = await NettingSegment.get(PydanticObjectId(segment_id))
    if doc is None:
        raise NotFoundError("Segment not found")
    return doc


async def update_segment(segment_id: str | PydanticObjectId, patch: dict[str, Any]) -> NettingSegment:
    doc = await get_segment(segment_id)
    for k, v in patch.items():
        if k in NETTING_FIELDS and v is not None:
            setattr(doc, k, v)
    await doc.save()
    # Clear per-user effective-settings caches so admin edits take effect
    # immediately on the user terminal. The resolver's cache key has the
    # form `netting_eff:{user_id}:{seg_name}:...` — the old
    # `netting:NAME:*` pattern never matched and made admin edits invisible.
    # `_wipe_eff_cache_debounced` collapses bursts so a 14-segment Save All
    # pays one O(N) SCAN, not fourteen.
    await _wipe_eff_cache_debounced()
    try:
        await cache_delete_pattern(f"netting:{doc.name}:*")
    except Exception:
        logger.warning("netting_cache_invalidation_failed_redis_down")
    return doc


# ── Script overrides ──────────────────────────────────────────────
async def list_scripts(segment: str | None = None) -> list[NettingScriptOverride]:
    if segment:
        return await NettingScriptOverride.find(
            NettingScriptOverride.segment_name == segment
        ).to_list()
    return await NettingScriptOverride.find_all().to_list()


async def create_script(payload: dict[str, Any]) -> NettingScriptOverride:
    seg_name = payload.get("segment_name")
    seg_id = payload.get("segment_id")
    if not seg_name or not seg_id:
        raise ValidationFailedError("segment_name and segment_id required")
    symbol = (payload.get("symbol") or "").strip().upper()
    if not symbol:
        raise ValidationFailedError("symbol required")
    existing = await NettingScriptOverride.find_one(
        NettingScriptOverride.segment_name == seg_name,
        NettingScriptOverride.symbol == symbol,
    )
    if existing is not None:
        raise ValidationFailedError(f"Script {symbol} already exists in {seg_name}")
    clean: dict[str, Any] = {
        "segment_id": PydanticObjectId(seg_id),
        "segment_name": seg_name,
        "symbol": symbol,
        "tradingSymbol": payload.get("tradingSymbol") or symbol,
        "instrumentToken": payload.get("instrumentToken"),
        "lotSize": payload.get("lotSize") or 1.0,
    }
    for k in NETTING_FIELDS:
        if k in payload and payload[k] is not None:
            clean[k] = payload[k]
    doc = NettingScriptOverride(**clean)
    await doc.insert()
    return doc


async def update_script(script_id: str | PydanticObjectId, patch: dict[str, Any]) -> NettingScriptOverride:
    doc = await NettingScriptOverride.get(PydanticObjectId(script_id))
    if doc is None:
        raise NotFoundError("Script override not found")
    for k, v in patch.items():
        if k in NETTING_FIELDS:
            setattr(doc, k, v)
    if "lotSize" in patch and patch["lotSize"] is not None:
        doc.lotSize = float(patch["lotSize"])
    await doc.save()
    await _wipe_eff_cache_debounced()
    return doc


async def delete_script(script_id: str | PydanticObjectId) -> None:
    doc = await NettingScriptOverride.get(PydanticObjectId(script_id))
    if doc is not None:
        await doc.delete()
        await _wipe_eff_cache_debounced()


# ── Per-user segment overrides ────────────────────────────────────
async def list_user_overrides(user_id: str | PydanticObjectId) -> list[UserSegmentOverride]:
    return await UserSegmentOverride.find(
        UserSegmentOverride.user_id == PydanticObjectId(user_id)
    ).to_list()


async def upsert_user_override(
    user_id: str | PydanticObjectId,
    segment_name: str,
    patch: dict[str, Any],
    symbol: str | None = None,
) -> UserSegmentOverride:
    uid = PydanticObjectId(user_id)
    sym = (symbol or "").strip().upper() or None
    existing = await UserSegmentOverride.find_one(
        UserSegmentOverride.user_id == uid,
        UserSegmentOverride.segment_name == segment_name,
        UserSegmentOverride.symbol == sym,
    )
    if existing is None:
        existing = UserSegmentOverride(user_id=uid, segment_name=segment_name, symbol=sym)
    for k, v in patch.items():
        if k in NETTING_FIELDS:
            setattr(existing, k, v)
    await existing.save()
    # Wipe per-user effective-settings cache so next read reflects this override.
    await cache_delete_pattern(f"netting_eff:{uid}:*")
    return existing


async def delete_user_override(
    user_id: str | PydanticObjectId,
    segment_name: str,
    symbol: str | None = None,
) -> None:
    uid = PydanticObjectId(user_id)
    sym = (symbol or "").strip().upper() or None
    await UserSegmentOverride.find(
        UserSegmentOverride.user_id == uid,
        UserSegmentOverride.segment_name == segment_name,
        UserSegmentOverride.symbol == sym,
    ).delete()
    await cache_delete_pattern(f"netting_eff:{uid}:*")


# ── Effective resolver (legacy field-name shim for order_validator) ─
# Map legacy SegmentType strings (NSE_EQUITY, NSE_FUTURE, …) to NettingSegment
# names (NSE_EQ, NSE_FUT, …). Multiple legacy types fold into one netting row.
_SEGMENT_NAME_MAP: dict[str, str] = {
    "NSE_EQUITY": "NSE_EQ",
    "NSE_FUTURE": "NSE_FUT",
    "NSE_INDEX_FUTURE": "NSE_FUT",
    "NSE_STOCK_OPTION_BUY": "NSE_OPT",
    "NSE_STOCK_OPTION_SELL": "NSE_OPT",
    "NSE_INDEX_OPTION_BUY": "NSE_OPT",
    "NSE_INDEX_OPTION_SELL": "NSE_OPT",
    "BSE_EQUITY": "BSE_EQ",
    "BSE_FUTURE": "BSE_FUT",
    "BSE_INDEX_FUTURE": "BSE_FUT",
    "BSE_OPTION_BUY": "BSE_OPT",
    "BSE_OPTION_SELL": "BSE_OPT",
    "MCX_FUTURE": "MCX_FUT",
    "MCX_OPTION_BUY": "MCX_OPT",
    "MCX_OPTION_SELL": "MCX_OPT",
    "CDS_FUTURE": "FOREX",
    "CDS_OPTION_BUY": "FOREX",
    "CDS_OPTION_SELL": "FOREX",
    "CRYPTO_SPOT": "CRYPTO_PERPETUAL",
    "CRYPTO_FUTURE": "CRYPTO_PERPETUAL",
}


def _to_legacy_dict(
    seg,
    override,
    *,
    action: str | None = None,
    option_type: str | None = None,
    product_type: str | None = None,
    is_expiry_day: bool = False,
) -> dict[str, Any]:
    """Map NettingSegment + optional UserSegmentOverride → legacy field names
    that order_validator + brokerage_calculator consume.

    When `option_type` ∈ {"CE", "PE"} and `action` ∈ {"BUY","SELL"}, the
    resolver picks `optionBuyIntraday` / `optionSellIntraday` (and equivalent
    overnight + commission fields) instead of the segment-wide values. This
    lets admins tune option-buy and option-sell margins separately, the way
    the netting UI advertises.
    """

    def pick(field: str, default=None):
        if override is not None:
            v = getattr(override, field, None)
            if v is not None:
                return v
        return getattr(seg, field, default)

    margin_mode = pick("marginCalcMode", "percent")
    is_option = (option_type or "").upper() in ("CE", "PE")
    is_option_buy = is_option and (action or "").upper() == "BUY"
    is_option_sell = is_option and (action or "").upper() == "SELL"

    # `Times` mode quotes a leverage multiplier (e.g. 700×), which is symmetric
    # across intraday and overnight — telling a user "you have 700× intraday
    # leverage but only 100× overnight" doesn't match how brokers price
    # leverage. So in Times mode we always read the `*Intraday*` field and
    # use it for any product type. The intraday/overnight split only matters
    # for `Percent` / `Fixed` mode, where margin actually carries more cost
    # to hold overnight.
    is_overnight = (
        False if margin_mode == "times" else (product_type or "").upper() in ("CNC", "NRML")
    )

    # Resolve effective margin %. Order matters: expiry-day → option BUY/SELL
    # specifics → segment-wide intraday/overnight.
    if is_expiry_day:
        if is_option_buy:
            effective_margin_pct = float(pick("expiryDayOptionBuyMargin", 100.0) or 100.0)
        elif is_option_sell:
            effective_margin_pct = float(pick("expiryDayOptionSellMargin", 50.0) or 50.0)
        else:
            effective_margin_pct = float(pick("expiryDayIntradayMargin", 100.0) or 100.0)
    elif is_option_buy:
        effective_margin_pct = float(
            (pick("optionBuyOvernight", None) if is_overnight else pick("optionBuyIntraday", None))
            or pick("optionBuyIntraday", 100.0)
            or 100.0
        )
    elif is_option_sell:
        effective_margin_pct = float(
            (pick("optionSellOvernight", None) if is_overnight else pick("optionSellIntraday", None))
            or pick("optionSellIntraday", 15.0)
            or 15.0
        )
    else:
        effective_margin_pct = float(
            (pick("overnightMargin", None) if is_overnight else pick("intradayMargin", None))
            or pick("intradayMargin", 100.0)
            or 100.0
        )

    # Translate to legacy {leverage, margin_percentage}
    if margin_mode == "times":
        leverage = max(1.0, effective_margin_pct)
        margin_pct = 100.0
    else:  # "fixed" / "percent"
        leverage = 1.0
        margin_pct = effective_margin_pct

    # Diagnostic log — one line per resolution. Lets us answer "is the
    # running process on the symmetric-Times patch?" by tailing the backend
    # console: a `is_ovn=False mode=times` line for an NRML order proves
    # the patch is live; `is_ovn=True mode=times` means it's not.
    logger.info(
        "netting_resolve seg=%s mode=%s product=%s is_ovn=%s eff_pct=%s leverage=%s margin_pct=%s",
        getattr(seg, "name", "?"),
        margin_mode,
        (product_type or "?"),
        is_overnight,
        effective_margin_pct,
        leverage,
        margin_pct,
    )

    # Action-aware commission (option leg vs everything else)
    commission_type_raw = pick("commissionType", "per_lot")
    if is_option_buy:
        commission_value = float(
            (pick("optionBuyCommission", None) or pick("commission", 0.0)) or 0.0
        )
    elif is_option_sell:
        commission_value = float(
            (pick("optionSellCommission", None) or pick("commission", 0.0)) or 0.0
        )
    else:
        commission_value = float(pick("commission", 0.0) or 0.0)
    if commission_type_raw == "per_crore":
        legacy_commission_type = "PER_CRORE"
    elif commission_type_raw == "per_lot":
        legacy_commission_type = "PER_LOT"
    else:
        legacy_commission_type = "PERCENTAGE"

    # Segment metadata — these flags decide whether lot-based or qty-based
    # caps apply. NSE_OPT, NSE_FUT etc. are LOT-based: 1 lot = N units, the
    # qty caps are meaningless and just block legitimate orders. NSE_EQ is
    # QTY-based: every share is one unit, the lot caps don't apply.
    lot_applies = getattr(seg, "lotApplies", True)
    qty_applies = getattr(seg, "qtyApplies", False)

    return {
        # legacy 22-field shape (and a few netting-only extras)
        "allow": bool(pick("tradingEnabled", True)) and bool(pick("isActive", True)),
        "commission_type": legacy_commission_type,
        "commission_value": commission_value,
        "min_brokerage": 0.0,
        "min_lot": float(pick("minLots", 1.0) if pick("minLots", 1.0) else 1.0) if lot_applies else 0.0,
        "max_lot": float(pick("maxLots", 0.0) or 0.0) if lot_applies else 0.0,
        "order_lot": float(pick("orderLots", 0.0) or 0.0) if lot_applies else 0.0,
        "intraday_lot_limit": float(pick("maxExchangeLots", 0.0) or 0.0) if lot_applies else 0.0,
        "holding_lot_limit": float(pick("maxExchangeLots", 0.0) or 0.0) if lot_applies else 0.0,
        "selling_overnight": bool(pick("allowOvernight", True)),
        "limit_percentage": float(pick("limitAwayPercent", 0.0) or 0.0),
        "strike_difference": 5,
        "max_each_lot": float(pick("maxLots", 0.0) or 0.0) if lot_applies else 0.0,
        "otm_max_each_lot": float(pick("maxLots", 0.0) or 0.0) if lot_applies else 0.0,
        "expiry_loss_holding": float(pick("expiryLossHoldMinSeconds", 0) or 0),
        "expiry_profit_hold": float(pick("expiryProfitHoldMinSeconds", 0) or 0),
        "expiry_intraday_margin": float(pick("expiryDayIntradayMargin", effective_margin_pct) or effective_margin_pct),
        "margin_percentage": margin_pct,
        "leverage": leverage,
        "auto_squareoff_time": "15:15",
        "m2m_squareoff_percent": 80.0,
        "stop_loss_mandatory": False,
        # ── Netting-only fields exposed for validator ──────────────
        # `lot_applies` / `qty_applies` let the validator skip the caps that
        # don't make sense for this segment kind. Without this gating the
        # default `perOrderQty=1` on a lot-based segment (NFO_OPT) blocks
        # every legitimate option order because lot_size×lots > 1.
        "lot_applies": bool(lot_applies),
        "qty_applies": bool(qty_applies),
        "max_margin_usage_percent": float(pick("maxMarginUsagePercent", 100.0) or 100.0),
        "max_value": float(pick("maxValue", 0.0) or 0.0),
        "min_qty": float(pick("minQty", 0.0) or 0.0) if qty_applies else 0.0,
        "per_order_qty": float(pick("perOrderQty", 0.0) or 0.0) if qty_applies else 0.0,
        "max_qty_per_script": float(pick("maxQtyPerScript", 0.0) or 0.0) if qty_applies else 0.0,
        "buying_strike_far_percent": float(pick("buyingStrikeFarPercent", 0.0) or 0.0),
        "selling_strike_far_percent": float(pick("sellingStrikeFarPercent", 0.0) or 0.0),
        "spread_type": str(pick("spreadType", "fixed")),
        "spread_pips": float(pick("spreadPips", 0.0) or 0.0),
        "swap_type": str(pick("swapType", "points")),
        "swap_long": float(pick("swapLong", 0.0) or 0.0),
        "swap_short": float(pick("swapShort", 0.0) or 0.0),
        "swap_time": str(pick("swapTime", "22:30")),
        "charge_on": str(pick("chargeOn", "both")),
    }


async def get_effective_settings(
    user_id: str | PydanticObjectId,
    segment_type: str,
    *,
    action: str | None = None,
    option_type: str | None = None,
    product_type: str | None = None,
    is_expiry_day: bool = False,
    symbol: str | None = None,
) -> dict[str, Any]:
    """Legacy-compat resolver. Returns the merged `NettingSegment +
    NettingScriptOverride (per-symbol) + UserSegmentOverride (per-user)` view
    in the field shape ``order_validator`` + ``brokerage_calculator`` consume.

    When ``action`` / ``option_type`` / ``product_type`` are passed we pick
    option-buy vs option-sell margin and commission, intraday vs overnight,
    expiry-day vs normal — so the order validator gets the exact margin %
    and commission that should be applied to **this** specific order.
    """
    seg_name = _SEGMENT_NAME_MAP.get(segment_type, segment_type)
    sym_key = (symbol or "").strip().upper() or "_"
    cache_key = (
        f"netting_eff:{user_id}:{seg_name}:{sym_key}:"
        f"{(action or '_').upper()}:{(option_type or '_').upper()}:"
        f"{(product_type or '_').upper()}:{int(is_expiry_day)}"
    )
    try:
        cached = await cache_get(cache_key)
        if cached is not None:
            return cached
    except Exception:
        logger.warning("netting_cache_get_failed", extra={"key": cache_key})

    seg = await NettingSegment.find_one(NettingSegment.name == seg_name)
    if seg is None:
        # No row yet (un-seeded segment) — return all-permissive defaults
        seg = NettingSegment(
            name=seg_name, displayName=seg_name, **NettingFieldsRequired().model_dump()
        )

    # Resolve per-symbol script override first (segment-level), then user override.
    script_override = None
    if symbol:
        script_override = await NettingScriptOverride.find_one(
            NettingScriptOverride.segment_name == seg_name,
            NettingScriptOverride.symbol == symbol.strip().upper(),
        )

    user_override_symbol = await UserSegmentOverride.find_one(
        UserSegmentOverride.user_id == PydanticObjectId(user_id),
        UserSegmentOverride.segment_name == seg_name,
        UserSegmentOverride.symbol == (symbol.strip().upper() if symbol else None),
    )
    user_override_segment = await UserSegmentOverride.find_one(
        UserSegmentOverride.user_id == PydanticObjectId(user_id),
        UserSegmentOverride.segment_name == seg_name,
        UserSegmentOverride.symbol == None,  # noqa: E711
    )

    # Walk in priority order: user-symbol > user-segment > script-override > segment
    # `_to_legacy_dict.pick` only reads from one override layer, so flatten by
    # creating a synthetic override doc whose fields mask the segment defaults.
    composite_override = None
    layers = [user_override_symbol, user_override_segment, script_override]
    if any(layers):
        composite_override = NettingFieldsBase()
        for layer in layers:
            if layer is None:
                continue
            for f in NETTING_FIELDS:
                v = getattr(layer, f, None)
                if v is not None and getattr(composite_override, f, None) is None:
                    setattr(composite_override, f, v)

    settings_dict = _to_legacy_dict(
        seg,
        composite_override,
        action=action,
        option_type=option_type,
        product_type=product_type,
        is_expiry_day=is_expiry_day,
    )
    sources = {
        "segment": seg_name,
        "script_override": bool(script_override),
        "user_override": bool(user_override_symbol or user_override_segment),
    }
    payload = {"segment_type": segment_type, "settings": settings_dict, "sources": sources}
    try:
        await cache_set(cache_key, payload, ttl_sec=CACHE_TTL)
    except Exception:
        logger.warning("netting_cache_set_failed", extra={"key": cache_key})
    return payload


# ── Bulk copy ──────────────────────────────────────────────────────
async def copy_user_overrides(
    *,
    source_user_id: str | PydanticObjectId,
    target_user_ids: list[str],
    overwrite: bool = True,
) -> dict[str, Any]:
    src_rows = await list_user_overrides(source_user_id)
    if not src_rows:
        return {"applied_users": 0, "applied_rows": 0, "skipped": len(target_user_ids), "reason": "Source has no overrides"}

    applied_users = 0
    applied_rows = 0
    skipped = 0
    for uid_raw in target_user_ids:
        try:
            uid = PydanticObjectId(uid_raw)
        except Exception:
            skipped += 1
            continue
        if str(uid) == str(source_user_id):
            skipped += 1
            continue
        if await User.get(uid) is None:
            skipped += 1
            continue
        touched = 0
        for src in src_rows:
            existing = await UserSegmentOverride.find_one(
                UserSegmentOverride.user_id == uid,
                UserSegmentOverride.segment_name == src.segment_name,
                UserSegmentOverride.symbol == src.symbol,
            )
            if existing is None:
                existing = UserSegmentOverride(
                    user_id=uid, segment_name=src.segment_name, symbol=src.symbol
                )
            elif not overwrite:
                if any(getattr(existing, f, None) is not None for f in NETTING_FIELDS):
                    continue
            for f in NETTING_FIELDS:
                v = getattr(src, f, None)
                if v is not None:
                    setattr(existing, f, v)
            await existing.save()
            touched += 1
        if touched > 0:
            applied_users += 1
            applied_rows += touched
    return {"applied_users": applied_users, "applied_rows": applied_rows, "skipped": skipped, "source_rows": len(src_rows)}
