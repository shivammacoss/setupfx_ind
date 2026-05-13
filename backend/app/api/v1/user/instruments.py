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
    # Self-heal display names for derivatives — older rows were stored with
    # Zerodha's raw `name` (just the underlying), so build a friendly variant
    # on the fly when the stored name isn't already in the composed form.
    stored_name = i.name or ""
    it_val = i.instrument_type.value if hasattr(i.instrument_type, "value") else str(i.instrument_type)
    if (it_val or "").upper() in ("FUT", "CE", "PE") and " " not in stored_name:
        display = instrument_service.display_name(
            instrument_type=i.instrument_type,
            underlying=stored_name,
            expiry=i.expiry,
            strike=i.strike,
        )
    else:
        display = stored_name
    return {
        "token": i.token,
        "symbol": i.symbol,
        "trading_symbol": i.trading_symbol,
        "name": display,
        "exchange": i.exchange.value if hasattr(i.exchange, "value") else str(i.exchange),
        "segment": i.segment,
        "instrument_type": it_val,
        "lot_size": i.lot_size,
        "tick_size": str(i.tick_size),
        "expiry": str(i.expiry) if i.expiry else None,
        "strike": str(i.strike) if i.strike else None,
        "option_type": i.option_type.value if i.option_type and hasattr(i.option_type, "value") else None,
        "is_active": i.is_active,
        "is_tradable": i.is_tradable,
    }


# Maps UI segment values (NSE_FUTURE, MCX_OPTION_BUY, …) onto Zerodha cache
# rows. NSE futures live on Kite's `NFO` exchange — that's why filtering the
# admin /instruments page by exchange=NSE returns no futures, and why the
# user side panel's NSE FUT chip can't find anything without this mapping.
def _segment_matches_kite_row(segment_value: str, row: dict) -> bool:
    ex = (row.get("exchange") or "").upper()
    it = (row.get("instrumentType") or "").upper()
    s = segment_value
    if s == "NSE_EQUITY":
        return ex == "NSE" and it in ("EQ", "")
    if s == "BSE_EQUITY":
        return ex == "BSE" and it in ("EQ", "")
    if s in ("NSE_FUTURE", "NSE_INDEX_FUTURE"):
        return ex == "NFO" and it == "FUT"
    if s in (
        "NSE_INDEX_OPTION_BUY",
        "NSE_INDEX_OPTION_SELL",
        "NSE_STOCK_OPTION_BUY",
        "NSE_STOCK_OPTION_SELL",
    ):
        return ex == "NFO" and it in ("CE", "PE")
    if s in ("BSE_FUTURE", "BSE_INDEX_FUTURE"):
        return ex == "BFO" and it == "FUT"
    if s in ("BSE_OPTION_BUY", "BSE_OPTION_SELL"):
        return ex == "BFO" and it in ("CE", "PE")
    if s == "MCX_FUTURE":
        return ex == "MCX" and it == "FUT"
    if s in ("MCX_OPTION_BUY", "MCX_OPTION_SELL"):
        return ex == "MCX" and it in ("CE", "PE")
    # COMMODITIES / STOCKS / INDICES / FOREX never have a Zerodha-cache
    # counterpart — those segments exist only on Infoway-mirrored rows in
    # the local Instrument collection. Returning False here is correct;
    # the search endpoint then falls through to MongoDB which finds the
    # Infoway-tagged rows. Without this, the COMMODITIES chip used to
    # leak every Indian MCX symbol into the user's Infoway view.
    return False


def _kite_row_to_payload(r: dict) -> dict:
    """Shape a Zerodha cache row into the public /instruments/search response
    payload, applying the friendly-name helper for derivatives so listings
    don't show the bare underlying for FUT/CE/PE."""
    from app.services.index_lots import get_canonical_lot_size

    it = (r.get("instrumentType") or "EQ").upper()
    sym = r.get("symbol") or ""
    underlying = r.get("name") or sym
    ex = (r.get("exchange") or "").upper()
    display = instrument_service.display_name(
        instrument_type=it,
        underlying=underlying,
        expiry=r.get("expiry"),
        strike=r.get("strike"),
    )

    if it in ("CE", "PE", "FUT"):
        canonical = get_canonical_lot_size(
            sym, underlying, exchange=ex, instrument_type=it
        )
        lot = canonical or int(r.get("lotSize") or 1)
    else:
        # Equity / indices / ETFs trade 1 share = 1 lot. Kite's CSV
        # occasionally reports `lotSize` > 1 for ETFs as a "marketlot"
        # convention, but our order pipeline treats lot as the F&O
        # multiplier, so for EQ we want it strictly 1.
        lot = 1

    return {
        "token": str(r.get("token") or ""),
        "symbol": sym,
        "trading_symbol": r.get("tradingSymbol") or sym,
        "name": display,
        "exchange": r.get("exchange") or "",
        "segment": r.get("segment") or "",
        "instrument_type": it,
        "lot_size": lot,
        "tick_size": str(r.get("tickSize") or "0.05"),
        "expiry": r.get("expiry"),
        "strike": r.get("strike"),
        "option_type": it if it in ("CE", "PE") else None,
        "is_active": True,
        "is_tradable": True,
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
    from app.services.netting_service import (
        _SEGMENT_NAME_MAP,
        inactive_admin_rows,
        inactive_instrument_segments,
    )

    # Admin-side "Block → isActive = No" → segment is hidden from user
    # search entirely. Resolved once per request; the netting service
    # caches the set for 30 s so this is cheap.
    inactive_admin = await inactive_admin_rows()
    inactive_segs = await inactive_instrument_segments()

    def _kite_row_admin_row(row: dict) -> str | None:
        ex = (row.get("exchange") or "").upper()
        it = (row.get("instrumentType") or "").upper()
        if ex == "NSE":
            return "NSE_EQ"
        if ex == "BSE":
            return "BSE_EQ"
        if ex == "NFO":
            return "NSE_FUT" if it == "FUT" else ("NSE_OPT" if it in ("CE", "PE") else None)
        if ex == "BFO":
            return "BSE_FUT" if it == "FUT" else ("BSE_OPT" if it in ("CE", "PE") else None)
        if ex == "MCX":
            return "MCX_FUT" if it == "FUT" else ("MCX_OPT" if it in ("CE", "PE") else None)
        return None

    def _kite_row_active(row: dict) -> bool:
        admin_row = _kite_row_admin_row(row)
        return admin_row is None or admin_row not in inactive_admin

    def _mongo_inst_active(inst) -> bool:
        seg_val = inst.segment.value if hasattr(inst.segment, "value") else str(inst.segment)
        if seg_val in inactive_segs:
            return False
        admin_row = _SEGMENT_NAME_MAP.get(seg_val, seg_val)
        return admin_row not in inactive_admin

    # Fast path: scan the Zerodha in-memory cache. Two modes:
    #   1) No segment/type filter → defer to search_instruments_fast which
    #      handles scoring (exact > prefix > contains).
    #   2) With segment/type filter → scan cache ourselves, applying the
    #      UI's segment values via _segment_matches_kite_row so the side
    #      panel's NSE FUT / MCX FUT chips return data without needing
    #      pre-mirrored rows in MongoDB.
    if q and q.strip() and not seg_list and not it_list:
        try:
            fast_results = await _zerodha.search_instruments_fast(q, exchange=exchange, limit=limit)
            fast_results = [r for r in (fast_results or []) if _kite_row_active(r)]
            if fast_results:
                return APIResponse(data=[_kite_row_to_payload(r) for r in fast_results])
        except Exception:
            pass  # fall through to MongoDB

    if seg_list or it_list:
        try:
            # Ensure cache is warm before scanning.
            if not _zerodha._instruments_cache:
                for ex in ("NSE", "NFO", "MCX", "BFO", "BSE"):
                    try:
                        await _zerodha.fetch_instruments(ex)
                    except Exception:
                        pass

            q_upper = (q or "").strip().upper()
            collected: list[dict] = []
            for ex_key, cache in _zerodha._instruments_cache.items():
                if exchange and ex_key.upper() != exchange.upper():
                    continue
                for inst in cache:
                    if exchange and (inst.get("exchange") or "").upper() != exchange.upper():
                        continue
                    if seg_list and not any(_segment_matches_kite_row(s, inst) for s in seg_list):
                        continue
                    if it_list:
                        kite_it = (inst.get("instrumentType") or "").upper()
                        if kite_it not in it_list:
                            continue
                    # Hide instruments whose admin row is currently isActive=false.
                    if not _kite_row_active(inst):
                        continue
                    if q_upper:
                        sym = (inst.get("symbol") or "").upper()
                        name = (inst.get("name") or "").upper()
                        if q_upper not in sym and q_upper not in name:
                            continue
                    # Drop expired contracts so the browse chips don't show
                    # stale options/futures dated last month.
                    exp_raw = inst.get("expiry")
                    if exp_raw:
                        try:
                            from datetime import datetime as _dt, timezone as _tz

                            exp_d = _dt.fromisoformat(str(exp_raw).replace("Z", "+00:00")).date()
                            if exp_d < _dt.now(_tz.utc).date():
                                continue
                        except Exception:
                            pass
                    collected.append(inst)
                    if len(collected) >= limit:
                        break
                if len(collected) >= limit:
                    break
            if collected:
                return APIResponse(data=[_kite_row_to_payload(r) for r in collected])
        except Exception:
            logger.exception("instruments_fast_path_with_filter_failed")

    # Slow path: MongoDB
    results = await instrument_service.search(
        q,
        exchange=exchange,
        segment=seg_arg,
        instrument_type=it_arg,
        limit=limit,
    )
    # Final filter: drop instruments whose admin row is currently disabled.
    # Done post-fetch (after `limit`) so the filter is cheap; if it ever
    # noticeably trims a 100-row page we can push it into the Mongo query.
    results = [i for i in results if _mongo_inst_active(i)]
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
        from app.services.index_lots import get_canonical_lot_size

        if inst.instrument_type in (InstrumentType.CE, InstrumentType.PE, InstrumentType.FUT):
            ex_val = inst.exchange.value if hasattr(inst.exchange, "value") else str(inst.exchange)
            canonical_lot = get_canonical_lot_size(inst.symbol, inst.name, exchange=ex_val)
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

    # Symbol-suffix safety net. Zerodha's CSV cache sometimes returns an empty
    # `instrumentType` for fresh F&O contracts; without this, the symbol
    # `NIFTY2651223250CE` would be persisted as `EQ` and become invisible to
    # every option filter / option-chain view downstream.
    sym_up = sym.upper()
    if sym_up.endswith("CE") and it_str not in ("CE", "PE", "FUT"):
        it_str = "CE"
    elif sym_up.endswith("PE") and it_str not in ("CE", "PE", "FUT"):
        it_str = "PE"
    elif sym_up.endswith("FUT") and it_str not in ("CE", "PE", "FUT"):
        it_str = "FUT"

    # Map exchange string → enum
    exch = getattr(Exchange, exch_str, None) or Exchange.NSE

    # Map instrument type
    it_map = {"CE": InstrumentType.CE, "PE": InstrumentType.PE, "FUT": InstrumentType.FUT,
              "EQ": InstrumentType.EQ, "INDEX": InstrumentType.INDEX}
    instr_type = it_map.get(it_str, InstrumentType.EQ)

    # Underlying detection so an NFO row routes to INDEX_OPTION_* vs
    # STOCK_OPTION_* correctly. Anything whose symbol starts with one of
    # the canonical index names is an index contract.
    _idx_prefixes = ("NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "SENSEX", "BANKEX")
    is_index_underlying = sym_up.startswith(_idx_prefixes)

    # Derive segment
    seg_map: dict[str, dict[str, str]] = {
        "NFO": {
            "CE": "NSE_INDEX_OPTION_BUY" if is_index_underlying else "NSE_STOCK_OPTION_BUY",
            "PE": "NSE_INDEX_OPTION_SELL" if is_index_underlying else "NSE_STOCK_OPTION_SELL",
            "FUT": "NSE_INDEX_FUTURE" if is_index_underlying else "NSE_FUTURE",
            "EQ": "NSE_EQUITY",
        },
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

    # Lot size: trust the canonical table over the Zerodha CSV.
    # Index F&O — CSV cache may return 0 / stale for fresh contracts.
    # MCX — CSV returns raw units (kg/g/mmBtu/barrels) which doesn't match
    # `quantity = lots × lot_size` semantics used throughout the platform.
    from app.services.index_lots import get_canonical_lot_size

    canonical_lot = (
        get_canonical_lot_size(sym, name, exchange=exch_str)
        if instr_type in (InstrumentType.CE, InstrumentType.PE, InstrumentType.FUT)
        else None
    )
    csv_lot = int(z.get("lotSize") or 0)
    lot_size_final = canonical_lot or csv_lot or 1

    friendly_name = instrument_service.display_name(
        instrument_type=instr_type, underlying=name, expiry=expiry, strike=z.get("strike")
    )
    doc = Instrument(
        token=tok,
        symbol=sym,
        trading_symbol=sym,
        name=friendly_name,
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
