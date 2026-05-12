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
    return {
        "id": str(i.id),
        "token": i.token,
        "symbol": i.symbol,
        "trading_symbol": i.trading_symbol,
        "name": i.name,
        "exchange": str(i.exchange),
        "segment": i.segment,
        "instrument_type": str(i.instrument_type),
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
    from app.services.index_lots import INDEX_LOT_SIZES, get_index_lot_size

    rows = await Instrument.find(
        {"instrument_type": {"$in": [InstrumentType.CE.value, InstrumentType.PE.value, InstrumentType.FUT.value]}}
    ).limit(2000).to_list()
    sample_before: list[dict] = []
    for inst in rows:
        canonical = get_index_lot_size(inst.symbol, inst.name)
        if canonical and int(inst.lot_size or 0) != canonical:
            sample_before.append({
                "symbol": inst.symbol,
                "current_lot": inst.lot_size,
                "canonical_lot": canonical,
            })
            if len(sample_before) >= 8:
                break

    fixed = await backfill_index_lot_sizes()
    return APIResponse(data={
        "canonical_table": [{"prefix": p, "lot": l} for p, l in INDEX_LOT_SIZES],
        "rows_scanned": len(rows),
        "rows_fixed": fixed,
        "sample_before_fix": sample_before,
    })
