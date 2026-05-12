"""Admin instrument management."""

from __future__ import annotations

from datetime import date

from beanie import PydanticObjectId
from bson import Decimal128
from fastapi import APIRouter, HTTPException, Query

from app.core.dependencies import CurrentAdmin
from app.models._base import Exchange, InstrumentType
from app.models.instrument import Instrument
from app.schemas.common import APIResponse
from app.services import instrument_service

router = APIRouter(prefix="/instruments", tags=["admin-instruments"])


def _ser(i: Instrument) -> dict:
    # Self-heal display names for older derivatives rows whose `name` was
    # stored as the bare underlying (Zerodha CSV behaviour). See
    # instrument_service.display_name for the composition rule.
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
        "id": str(i.id),
        "token": i.token,
        "symbol": i.symbol,
        "trading_symbol": i.trading_symbol,
        "name": display,
        "exchange": str(i.exchange),
        "segment": i.segment,
        "instrument_type": it_val,
        "lot_size": i.lot_size,
        "tick_size": str(i.tick_size),
        "expiry": str(i.expiry) if i.expiry else None,
        "strike": str(i.strike) if i.strike else None,
        "option_type": str(i.option_type) if i.option_type else None,
        "is_active": i.is_active,
        "is_tradable": i.is_tradable,
        "is_halted": i.is_halted,
    }


@router.get("", response_model=APIResponse[dict])
async def list_instruments(
    admin: CurrentAdmin,
    q: str | None = None,
    exchange: str | None = None,
    segment: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
):
    items, total = await instrument_service.list_paginated(
        page=page, page_size=page_size, exchange=exchange, segment=segment, q=q
    )
    return APIResponse(
        data={
            "items": [_ser(i) for i in items],
            "meta": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "total_pages": (total + page_size - 1) // page_size,
            },
        }
    )


@router.post("", response_model=APIResponse[dict])
async def create_instrument(payload: dict, admin: CurrentAdmin):
    inst = Instrument(
        token=payload["token"],
        symbol=payload.get("symbol", payload["token"]),
        trading_symbol=payload.get("trading_symbol", payload["token"]),
        name=payload.get("name", payload["token"]),
        exchange=Exchange(payload.get("exchange", "NSE")),
        segment=payload.get("segment", "NSE_EQUITY"),
        instrument_type=InstrumentType(payload.get("instrument_type", "EQ")),
        lot_size=int(payload.get("lot_size", 1)),
        tick_size=Decimal128(str(payload.get("tick_size", "0.05"))),
        is_active=bool(payload.get("is_active", True)),
        is_tradable=bool(payload.get("is_tradable", True)),
    )
    await inst.insert()
    return APIResponse(data={"id": str(inst.id)})


@router.put("/{instrument_id}", response_model=APIResponse[dict])
async def update_instrument(instrument_id: str, payload: dict, admin: CurrentAdmin):
    i = await Instrument.get(PydanticObjectId(instrument_id))
    if i is None:
        raise HTTPException(status_code=404, detail="Instrument not found")
    for k in ("symbol", "trading_symbol", "name", "segment", "lot_size", "is_active", "is_tradable", "is_halted", "halt_reason"):
        if k in payload:
            setattr(i, k, payload[k])
    if "tick_size" in payload:
        i.tick_size = Decimal128(str(payload["tick_size"]))
    await i.save()
    return APIResponse(data={"id": str(i.id)})


@router.post("/{instrument_id}/halt", response_model=APIResponse[dict])
async def halt(instrument_id: str, payload: dict, admin: CurrentAdmin):
    i = await Instrument.get(PydanticObjectId(instrument_id))
    if i is None:
        raise HTTPException(status_code=404, detail="Instrument not found")
    i.is_halted = True
    i.halt_reason = payload.get("reason")
    await i.save()
    return APIResponse(data={"id": str(i.id), "is_halted": True})


@router.post("/{instrument_id}/resume", response_model=APIResponse[dict])
async def resume(instrument_id: str, admin: CurrentAdmin):
    i = await Instrument.get(PydanticObjectId(instrument_id))
    if i is None:
        raise HTTPException(status_code=404, detail="Instrument not found")
    i.is_halted = False
    i.halt_reason = None
    await i.save()
    return APIResponse(data={"id": str(i.id), "is_halted": False})


@router.delete("/{instrument_id}", response_model=APIResponse[dict])
async def delete_instrument(instrument_id: str, admin: CurrentAdmin):
    i = await Instrument.get(PydanticObjectId(instrument_id))
    if i is None:
        raise HTTPException(status_code=404, detail="Instrument not found")
    await i.delete()
    return APIResponse(data={"ok": True})


@router.post("/repair-index-lots", response_model=APIResponse[dict])
async def repair_index_lots(admin: CurrentAdmin):
    """One-click "kya backend ne new code load kiya?" probe.

    Re-runs the canonical-lot backfill across every option / future row in
    the catalogue and returns:
      • canonical_table — the constants the running backend has compiled in
      • rows_scanned    — how many F&O instruments were checked
      • rows_fixed      — how many actually got their lot_size rewritten
      • sample          — first 8 rows that were stale before the fix

    If `canonical_table` shows old NIFTY=50 numbers the deploy hasn't
    landed; if `rows_fixed` is 0 but `canonical_table` is current, the DB
    is already healthy. Either way the response answers "is the running
    process on the right build?" without needing shell access.
    """
    from app.seed.instruments import backfill_index_lot_sizes
    from app.services.index_lots import (
        INDEX_LOT_SIZES,
        MCX_LOT_SIZES,
        get_canonical_lot_size,
    )

    rows = await Instrument.find(
        {"instrument_type": {"$in": [InstrumentType.CE.value, InstrumentType.PE.value, InstrumentType.FUT.value]}}
    ).limit(2000).to_list()
    sample_before: list[dict] = []
    for inst in rows:
        ex_val = inst.exchange.value if hasattr(inst.exchange, "value") else str(inst.exchange)
        canonical = get_canonical_lot_size(inst.symbol, inst.name, exchange=ex_val)
        if canonical and int(inst.lot_size or 0) != canonical:
            sample_before.append({
                "symbol": inst.symbol,
                "exchange": ex_val,
                "current_lot": inst.lot_size,
                "canonical_lot": canonical,
            })
            if len(sample_before) >= 8:
                break

    fixed = await backfill_index_lot_sizes()
    return APIResponse(data={
        "index_canonical_table": [{"prefix": p, "lot": l} for p, l in INDEX_LOT_SIZES],
        "mcx_canonical_table": [{"prefix": p, "lot": l} for p, l in MCX_LOT_SIZES],
        "rows_scanned": len(rows),
        "rows_fixed": fixed,
        "sample_before_fix": sample_before,
    })


# ── F&O underlyings dedupe ──────────────────────────────────────────
# Cache the deduped underlyings per exchange for 5 min. The Zerodha cache
# itself doesn't change intraday, so a 5 min TTL is plenty and avoids
# rescanning ~50k NFO rows on every keystroke of the script-add typeahead.
import time as _time

_UNDERLYINGS_CACHE: dict[str, tuple[list[str], float]] = {}
_UNDERLYINGS_TTL = 300.0


def _extract_underlying(symbol: str) -> str | None:
    """Strip the expiry / strike / type suffix from a derivative trading
    symbol and return just the underlying name.

    Rule: take everything before the first digit. Works because every
    real Indian derivative symbol encodes the expiry (or strike) as a
    digit chunk right after the underlying (NIFTY26MAYFUT,
    BANKNIFTY26MAY52500CE, M&M26MAYFUT, GOLD26MAYFUT). Returns None for
    symbols that don't contain a digit at all — those aren't derivatives.
    """
    s = (symbol or "").upper()
    for i, c in enumerate(s):
        if c.isdigit():
            return s[:i] if i > 0 else None
    return None


@router.get("/underlyings", response_model=APIResponse[list[str]])
async def list_underlyings(
    admin: CurrentAdmin,
    exchange: str = Query(..., description="NFO / BFO / MCX"),
    contract_type: str | None = Query(
        default=None, description="FUT | CE | PE — restrict to futures or one option side"
    ),
    q: str | None = Query(default=None, description="Prefix filter, case-insensitive"),
    limit: int = Query(default=20, ge=1, le=100),
):
    """Deduped list of derivative underlyings for the segment matrix's
    script-add typeahead.

    Returns underlying names (NIFTY, BANKNIFTY, SBIN, …) — never
    individual contracts. Combined with the resolver's pattern matching,
    one selection here applies the override to every contract of that
    underlying.

    For OPT segments the frontend asks for both `contract_type=CE` and
    `contract_type=PE` and renders the underlying twice (once per side).
    """
    ex = exchange.strip().upper()
    cache_key = f"{ex}|{(contract_type or '').upper()}"
    now = _time.time()
    cached = _UNDERLYINGS_CACHE.get(cache_key)
    if cached and (now - cached[1]) < _UNDERLYINGS_TTL:
        names = cached[0]
    else:
        from app.services.zerodha_service import zerodha as _zerodha

        try:
            rows = await _zerodha.fetch_instruments(ex)
        except Exception:
            rows = _zerodha._instruments_cache.get(ex, [])

        ct = (contract_type or "").upper()
        seen: set[str] = set()
        names_list: list[str] = []
        for row in rows:
            it = (row.get("instrumentType") or "").upper()
            if ct and it != ct:
                continue
            if not ct and it not in ("FUT", "CE", "PE"):
                continue
            und = _extract_underlying(row.get("symbol"))
            if not und or und in seen:
                continue
            seen.add(und)
            names_list.append(und)
        names_list.sort()
        _UNDERLYINGS_CACHE[cache_key] = (names_list, now)
        names = names_list

    if q:
        qu = q.strip().upper()
        names = [n for n in names if n.startswith(qu)]
    return APIResponse(data=names[:limit])
