"""Instrument endpoints — search, detail, quote, depth."""

from __future__ import annotations

import logging
from datetime import date as _date
from typing import Any

from bson import Decimal128
from fastapi import APIRouter, Query

from app.core.dependencies import CurrentUser
from app.models._base import Exchange, InstrumentType, OptionType
from app.models.instrument import Instrument
from app.schemas.common import APIResponse
from app.schemas.trading import InstrumentOut, QuoteOut
from app.services import instrument_service, market_data_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/instruments", tags=["user-instruments"])


def _serialize(i) -> dict:
    return {
        "token": i.token,
        "symbol": i.symbol,
        "trading_symbol": i.trading_symbol,
        "name": i.name,
        "exchange": i.exchange.value if hasattr(i.exchange, "value") else str(i.exchange),
        "segment": i.segment,
        "instrument_type": i.instrument_type.value if hasattr(i.instrument_type, "value") else str(i.instrument_type),
        "lot_size": i.lot_size,
        "tick_size": str(i.tick_size),
        "expiry": str(i.expiry) if i.expiry else None,
        "strike": str(i.strike) if i.strike else None,
        "option_type": i.option_type.value if i.option_type and hasattr(i.option_type, "value") else None,
        "is_active": i.is_active,
        "is_tradable": i.is_tradable,
    }


@router.get("/search", response_model=APIResponse[list])
async def search(
    user: CurrentUser,
    q: str | None = None,
    exchange: str | None = None,
    segment: str | None = None,
    instrument_type: str | None = None,
    limit: int = Query(default=30, le=100),
):
    """Fast instrument search — tries in-memory Zerodha cache first (instant),
    falls back to MongoDB if Zerodha is not connected.

    `segment` and `instrument_type` accept comma-separated lists so the side
    panel's compound buckets (e.g. "NSE OPT" = NSE_INDEX_OPTION_BUY +
    NSE_INDEX_OPTION_SELL + NSE_STOCK_OPTION_BUY + NSE_STOCK_OPTION_SELL)
    can be queried in a single round-trip.
    """
    seg_list = [s.strip() for s in (segment or "").split(",") if s.strip()]
    it_list = [t.strip().upper() for t in (instrument_type or "").split(",") if t.strip()]
    seg_arg: str | list[str] | None = seg_list[0] if len(seg_list) == 1 else (seg_list or None)
    it_arg: str | list[str] | None = it_list[0] if len(it_list) == 1 else (it_list or None)

    from app.services.zerodha_service import zerodha as _zerodha

    # Fast path: search Zerodha in-memory cache (no DB roundtrip).
    # The cache lacks the SegmentType labels the UI buckets reference, so
    # `segment` filters (e.g. `NSE_INDEX_OPTION_BUY`) can't be honoured
    # there — we'd return cross-segment noise. Same for the multi-value
    # `instrument_type` (CE,PE). When either filter is set we bypass the
    # fast path and let MongoDB's `$in` do the work properly.
    can_fast_path = not seg_list and not it_list
    if q and q.strip() and can_fast_path:
        try:
            fast_results = await _zerodha.search_instruments_fast(q, exchange=exchange, limit=limit)
            if fast_results:
                from app.services.index_lots import get_index_lot_size

                def _lot_for(r: dict) -> int:
                    it = (r.get("instrumentType") or "").upper()
                    if it in ("CE", "PE", "FUT"):
                        idx_lot = get_index_lot_size(r.get("symbol"), r.get("name"))
                        if idx_lot:
                            return idx_lot
                    return int(r.get("lotSize") or 1)

                return APIResponse(data=[
                    {
                        "token": str(r.get("token") or ""),
                        "symbol": r.get("symbol") or "",
                        "trading_symbol": r.get("tradingSymbol") or r.get("symbol") or "",
                        "name": r.get("name") or "",
                        "exchange": r.get("exchange") or "",
                        "segment": r.get("segment") or "",
                        "instrument_type": r.get("instrumentType") or "EQ",
                        "lot_size": _lot_for(r),
                        "tick_size": str(r.get("tickSize") or "0.05"),
                        "expiry": r.get("expiry"),
                        "strike": r.get("strike"),
                        "option_type": None,
                        "is_active": True,
                        "is_tradable": True,
                    }
                    for r in fast_results
                ])
        except Exception:
            pass  # fall through to MongoDB

    # Slow path: MongoDB
    results = await instrument_service.search(
        q,
        exchange=exchange,
        segment=seg_arg,
        instrument_type=it_arg,
        limit=limit,
    )
    return APIResponse(data=[_serialize(i) for i in results])


async def _find_or_create_from_zerodha(token: str) -> Instrument | None:
    """Look up an instrument by Zerodha token in MongoDB. If missing, try the
    Zerodha in-memory cache, auto-create in MongoDB, and return it.
    This ensures option chain instruments (which live in Zerodha cache) are
    always tradable without a manual backfill step.

    Also self-heals `lot_size` on every read: an Instrument row may have
    been auto-created earlier with a wrong lot (e.g. 1, when the Zerodha
    CSV cache hadn't populated lotSize yet for a fresh contract). For
    index F&O the exchange-canonical lot wins, so the next order placed
    will use the right multiplier without waiting on the startup backfill.
    """
    inst: Instrument | None = None
    try:
        inst = await instrument_service.get_by_token(token)
    except Exception:
        inst = None

    if inst is None:
        # Fall back to Zerodha in-memory instrument cache
        from app.services.zerodha_service import zerodha as _zerodha

        for ex in ("NFO", "NSE", "MCX", "BFO", "BSE"):
            cache = _zerodha._instruments_cache.get(ex, [])
            for z in cache:
                if str(z.get("token")) == str(token):
                    inst = await _auto_create_instrument(z, ex)
                    break
            if inst is not None:
                break

    if inst is not None:
        from app.models._base import InstrumentType
        from app.services.index_lots import get_index_lot_size

        if inst.instrument_type in (InstrumentType.CE, InstrumentType.PE, InstrumentType.FUT):
            canonical_lot = get_index_lot_size(inst.symbol, inst.name)
            if canonical_lot and int(inst.lot_size or 0) != canonical_lot:
                inst.lot_size = canonical_lot
                try:
                    await inst.save()
                except Exception:
                    pass
    return inst


async def _auto_create_instrument(z: dict[str, Any], exchange_hint: str) -> Instrument:
    """Create an Instrument document from a Zerodha cache dict."""
    tok = str(z.get("token") or 0)
    sym = z.get("symbol") or ""
    name = z.get("name") or sym
    exch_str = (z.get("exchange") or exchange_hint).upper()
    it_str = (z.get("instrumentType") or "EQ").upper()

    # Map exchange string → enum
    exch = getattr(Exchange, exch_str, None) or Exchange.NSE

    # Map instrument type
    it_map = {"CE": InstrumentType.CE, "PE": InstrumentType.PE, "FUT": InstrumentType.FUT,
              "EQ": InstrumentType.EQ, "INDEX": InstrumentType.INDEX}
    instr_type = it_map.get(it_str, InstrumentType.EQ)

    # Derive segment
    seg_map = {
        "NFO": {"CE": "NSE_INDEX_OPTION_BUY", "PE": "NSE_INDEX_OPTION_SELL",
                "FUT": "NSE_FUTURE", "EQ": "NSE_EQUITY"},
        "NSE": {"EQ": "NSE_EQUITY", "INDEX": "NSE_EQUITY"},
        "BSE": {"EQ": "BSE_EQUITY"},
        "BFO": {"CE": "BSE_OPTION_BUY", "PE": "BSE_OPTION_SELL", "FUT": "BSE_FUTURE"},
        "MCX": {"CE": "MCX_OPTION_BUY", "PE": "MCX_OPTION_SELL", "FUT": "MCX_FUTURE"},
    }
    segment = seg_map.get(exch_str, {}).get(it_str, f"{exch_str}_{it_str}")

    # Expiry
    expiry = None
    if z.get("expiry"):
        try:
            expiry = _date.fromisoformat(str(z["expiry"])[:10])
        except Exception:
            pass

    opt_type = None
    if it_str in ("CE", "PE"):
        opt_type = OptionType.CE if it_str == "CE" else OptionType.PE

    strike = None
    if z.get("strike") is not None:
        try:
            strike = Decimal128(str(z["strike"]))
        except Exception:
            pass

    # Upsert to avoid duplicate key on concurrent requests
    existing = await Instrument.find_one(Instrument.token == tok)
    if existing:
        return existing

    # Lot size: trust the canonical index lot for known indices
    # (NIFTY/BANKNIFTY/SENSEX/FINNIFTY/MIDCPNIFTY/BANKEX) since the CSV cache
    # can return 0 / stale values for fresh contracts, and stamping a 1 into
    # the DB then sticks forever.
    from app.services.index_lots import get_index_lot_size

    canonical_lot = (
        get_index_lot_size(sym, name) if instr_type in (InstrumentType.CE, InstrumentType.PE, InstrumentType.FUT) else None
    )
    csv_lot = int(z.get("lotSize") or 0)
    lot_size_final = canonical_lot or csv_lot or 1

    doc = Instrument(
        token=tok,
        symbol=sym,
        trading_symbol=sym,
        name=name,
        exchange=exch,
        segment=segment,
        instrument_type=instr_type,
        lot_size=lot_size_final,
        tick_size=Decimal128(str(z.get("tickSize") or 0.05)),
        expiry=expiry,
        strike=strike,
        option_type=opt_type,
        is_active=True,
        is_tradable=True,
    )
    try:
        await doc.insert()
        logger.info("auto_created_instrument_from_zerodha", extra={"token": tok, "symbol": sym})
    except Exception:
        # Duplicate key race — fetch the one that won
        existing = await Instrument.find_one(Instrument.token == tok)
        if existing:
            return existing
    return doc


@router.get("/{token}", response_model=APIResponse[InstrumentOut])
async def get_instrument(token: str, user: CurrentUser):
    i = await _find_or_create_from_zerodha(token)
    if i is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Instrument {token} not found")
    return APIResponse(data=_serialize(i))


@router.get("/{token}/quote", response_model=APIResponse[QuoteOut])
async def get_quote(token: str, user: CurrentUser):
    q = await market_data_service.get_quote(token)
    return APIResponse(data=q)


@router.get("/quotes/batch", response_model=APIResponse[list[QuoteOut]])
async def quotes_batch(user: CurrentUser, tokens: str = Query(description="comma-separated tokens")):
    tlist = [t.strip() for t in tokens.split(",") if t.strip()]
    return APIResponse(data=await market_data_service.get_quotes(tlist))


@router.get("/{token}/history", response_model=APIResponse[list[dict]])
async def history(
    token: str,
    user: CurrentUser,
    interval: str = Query(default="5minute"),
    days: int = Query(default=5, ge=1, le=365),
):
    """OHLC candles for a chart. Tries Zerodha first (real exchange data),
    falls back to a synthesised series from the mock LTP feed if Zerodha
    is not connected — keeping the UI working in dev/testing."""
    from app.services import market_data_service as mds
    from app.services.zerodha_service import zerodha

    inst = await _find_or_create_from_zerodha(token)
    if inst is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Instrument {token} not found")
    z_status = await zerodha.get_status()

    if z_status["isConnected"]:
        # After admin subscribes via Zerodha Connect we mirror the Kite
        # instrument_token straight into Instrument.token, so we can pass it
        # to the historical API directly. As a safety net, also try the
        # subscribed list (handles seeded Instruments that pre-date the mirror).
        from app.models.zerodha_settings import ZerodhaSettings
        from datetime import datetime, timedelta, timezone

        kite_token: int | None = None
        try:
            kite_token = int(inst.token)
        except (TypeError, ValueError):
            kite_token = None
        if kite_token is None:
            settings = await ZerodhaSettings.find_one()
            match = next(
                (i for i in (settings.subscribedInstruments if settings else []) if i.symbol == inst.symbol),
                None,
            )
            if match is not None:
                kite_token = match.token

        if kite_token is not None:
            try:
                to_dt = datetime.now(timezone.utc)
                from_dt = to_dt - timedelta(days=days)
                candles = await zerodha.get_historical(kite_token, from_dt, to_dt, interval)
                if candles:
                    return APIResponse(data=candles)
            except Exception:
                pass  # fall through to mock

    # Mock candles: build N candles backwards from current LTP using a tiny
    # random walk so the chart shows something coherent without a feed.
    import random as _rnd
    import time as _time

    secs_per = {"minute": 60, "3minute": 180, "5minute": 300, "15minute": 900,
                "30minute": 1800, "60minute": 3600, "day": 86400}.get(interval, 300)
    count = min(500, days * (86400 // max(60, secs_per)))
    now_sec = int(_time.time())
    quote = await mds.get_quote(token)
    price = float(quote.get("ltp") or 1000.0)

    candles = []
    for i in range(count, 0, -1):
        ts = now_sec - i * secs_per
        drift = price * _rnd.uniform(-0.003, 0.003)
        opn = round(price, 2)
        close = round(max(0.05, price + drift), 2)
        high = round(max(opn, close) * _rnd.uniform(1.0, 1.004), 2)
        low = round(min(opn, close) * _rnd.uniform(0.996, 1.0), 2)
        candles.append(
            {
                "time": ts,
                "open": opn,
                "high": high,
                "low": low,
                "close": close,
                "volume": _rnd.randint(1000, 50000),
            }
        )
        price = close
    return APIResponse(data=candles)
