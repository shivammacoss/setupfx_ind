"""Instrument service — search, list, get-by-token."""

from __future__ import annotations

import re
from typing import Any

from beanie.operators import Or
from pymongo import ASCENDING

from app.core.exceptions import NotFoundError
from app.models._base import Exchange
from app.models.instrument import Instrument


async def search(
    q: str | None,
    *,
    exchange: str | None = None,
    segment: str | list[str] | None = None,
    instrument_type: str | list[str] | None = None,
    limit: int = 30,
) -> list[Instrument]:
    """Case-insensitive prefix/contains search on symbol+name.

    `segment` and `instrument_type` accept either a single value or a list —
    the side panel's bucket chips (e.g. "NSE OPT") need to match BOTH
    `NSE_INDEX_OPTION_BUY` and `NSE_INDEX_OPTION_SELL`, so a single string is
    not enough. Lists become `$in` filters in the underlying Mongo query.
    """
    query: dict[str, Any] = {"is_active": True}
    if exchange:
        query["exchange"] = exchange
    if segment:
        query["segment"] = {"$in": list(segment)} if isinstance(segment, list) else segment
    if instrument_type:
        query["instrument_type"] = (
            {"$in": list(instrument_type)} if isinstance(instrument_type, list) else instrument_type
        )

    if q:
        regex = re.compile(re.escape(q), re.IGNORECASE)
        query["$or"] = [{"symbol": regex}, {"trading_symbol": regex}, {"name": regex}, {"token": q}]

    cursor = Instrument.find(query).sort([("symbol", ASCENDING)]).limit(limit)
    return await cursor.to_list()


async def get_by_token(token: str) -> Instrument:
    """Resolve an instrument by token. Falls back to the Zerodha CSV cache
    so that option chain legs (and any other Kite instrument the user clicks
    via search) get auto-mirrored into our `instruments` collection on first
    use — and on-demand-subscribed to the live ticker so prices flow.

    This is what makes "click an option strike → chart opens with live data
    → trades work" possible without admin pre-seeding every contract."""
    inst = await Instrument.find_one(Instrument.token == token)
    if inst is not None:
        return inst

    # Try to mirror from the Zerodha in-memory CSV cache.
    inst = await _mirror_from_zerodha(token)
    if inst is not None:
        return inst

    raise NotFoundError(f"Instrument {token} not found")


async def _mirror_from_zerodha(token: str) -> Instrument | None:
    """Look up `token` across the cached Kite instrument dumps (NSE/NFO/BFO/
    MCX/BSE) and create a local Instrument doc on the fly. Also fires an
    on-demand WS subscribe so the next quote/tick request finds live data.
    Returns None if Zerodha doesn't know this token either."""
    from datetime import datetime

    from bson import Decimal128

    from app.models._base import Exchange, InstrumentType, OptionType
    from app.services.zerodha_service import zerodha

    # Token must be numeric to belong to Zerodha; Infoway/synthetic tokens
    # like "CRYPTO_BTCUSD" should fail loudly via the original NotFoundError.
    try:
        token_int = int(token)
    except (TypeError, ValueError):
        return None

    catalog_row: dict | None = None
    catalog_exchange: str | None = None
    for ex in ("NSE", "NFO", "BFO", "MCX", "BSE"):
        try:
            rows = await zerodha.fetch_instruments(ex)
        except Exception:
            continue
        for row in rows:
            try:
                if int(row.get("token") or 0) == token_int:
                    catalog_row = row
                    catalog_exchange = ex
                    break
            except (TypeError, ValueError):
                continue
        if catalog_row is not None:
            break

    if catalog_row is None:
        return None

    sym = catalog_row.get("symbol") or str(token_int)
    name = catalog_row.get("name") or sym
    exch_str = (catalog_row.get("exchange") or catalog_exchange or "NSE").upper()
    try:
        exchange = Exchange(exch_str)
    except Exception:
        exchange = Exchange.NSE

    it_str = (catalog_row.get("instrumentType") or "EQ").upper()
    if it_str in ("CE", "PE"):
        instrument_type = InstrumentType.CE if it_str == "CE" else InstrumentType.PE
        option_type = OptionType.CE if it_str == "CE" else OptionType.PE
        segment = f"{exch_str}_OPT"
    elif it_str == "FUT":
        instrument_type = InstrumentType.FUT
        option_type = None
        segment = f"{exch_str}_FUT"
    else:
        instrument_type = InstrumentType.EQ
        option_type = None
        segment = f"{exch_str}_EQUITY"

    expiry_d = None
    exp_raw = catalog_row.get("expiry")
    if exp_raw:
        try:
            expiry_d = datetime.fromisoformat(str(exp_raw).replace("Z", "+00:00")).date()
        except Exception:
            try:
                expiry_d = datetime.strptime(str(exp_raw)[:10], "%Y-%m-%d").date()
            except Exception:
                expiry_d = None

    strike_val = catalog_row.get("strike")
    strike_money = None
    if strike_val is not None:
        try:
            strike_money = Decimal128(str(float(strike_val)))
        except Exception:
            strike_money = None

    tick_size_val = catalog_row.get("tickSize") or 0.05
    try:
        tick_money = Decimal128(str(float(tick_size_val)))
    except Exception:
        tick_money = Decimal128("0.05")

    inst = Instrument(
        token=str(token_int),
        symbol=sym,
        trading_symbol=catalog_row.get("tradingSymbol") or sym,
        name=name,
        exchange=exchange,
        segment=segment,
        instrument_type=instrument_type,
        isin=catalog_row.get("isin"),
        expiry=expiry_d,
        strike=strike_money,
        option_type=option_type,
        lot_size=int(catalog_row.get("lotSize") or 1),
        tick_size=tick_money,
        is_active=True,
        is_tradable=True,
    )
    try:
        await inst.insert()
    except Exception:
        # Race condition: another request mirrored it first. Re-fetch.
        existing = await Instrument.find_one(Instrument.token == str(token_int))
        if existing is not None:
            return existing
        raise

    # Subscribe to ticker so the chart / order panel see live ticks.
    try:
        await zerodha.subscribe_tokens_on_demand(
            [token_int],
            symbols={token_int: {"symbol": sym, "exchange": exch_str}},
        )
    except Exception:
        pass

    return inst


async def list_paginated(
    *, page: int = 1, page_size: int = 50, exchange: str | None = None, segment: str | None = None, q: str | None = None
) -> tuple[list[Instrument], int]:
    query: dict[str, Any] = {}
    if exchange:
        query["exchange"] = exchange
    if segment:
        query["segment"] = segment
    if q:
        regex = re.compile(re.escape(q), re.IGNORECASE)
        query["$or"] = [{"symbol": regex}, {"name": regex}]
    total = await Instrument.find(query).count()
    items = (
        await Instrument.find(query)
        .sort([("exchange", ASCENDING), ("symbol", ASCENDING)])
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list()
    )
    return items, total
