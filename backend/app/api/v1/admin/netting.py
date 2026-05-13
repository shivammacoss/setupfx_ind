"""Admin Netting Segment Settings — segment matrix, scripts, per-user overrides."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.core.dependencies import CurrentAdmin
from app.schemas.common import APIResponse
from app.services import netting_service as svc

router = APIRouter(prefix="/netting", tags=["admin-netting"])


def _ser_segment(s) -> dict:
    return s.model_dump(exclude={"id", "revision_id"}) | {"id": str(s.id)}


def _ser_script(s) -> dict:
    return s.model_dump(exclude={"id", "revision_id", "segment_id"}) | {
        "id": str(s.id),
        "segment_id": str(s.segment_id),
    }


def _ser_user_override(s) -> dict:
    return s.model_dump(exclude={"id", "revision_id", "user_id"}) | {
        "id": str(s.id),
        "user_id": str(s.user_id),
    }


# ── Segment matrix ────────────────────────────────────────────────
@router.get("/segments", response_model=APIResponse[list])
async def list_segments(admin: CurrentAdmin):
    rows = await svc.list_segments()
    return APIResponse(data=[_ser_segment(r) for r in rows])


@router.get("/segments/{segment_id}", response_model=APIResponse[dict])
async def get_segment(segment_id: str, admin: CurrentAdmin):
    return APIResponse(data=_ser_segment(await svc.get_segment(segment_id)))


@router.put("/segments/{segment_id}", response_model=APIResponse[dict])
async def update_segment(segment_id: str, payload: dict, admin: CurrentAdmin):
    patch = payload.get("patch") or {k: v for k, v in payload.items() if k != "patch"}
    if not isinstance(patch, dict):
        raise HTTPException(status_code=400, detail="patch must be an object")
    return APIResponse(data=_ser_segment(await svc.update_segment(segment_id, patch)))


@router.get("/diagnose", response_model=APIResponse[dict])
async def diagnose_segment(
    admin: CurrentAdmin,
    segment_name: str = Query(..., description="Admin row name e.g. NSE_FUT, MCX_OPT, FOREX"),
    sample_symbol: str | None = Query(default=None, description="Symbol to test resolution (e.g. NIFTY26MAYFUT)"),
):
    """Single-screen diagnostic: shows EXACTLY what the resolver reads
    from DB for a segment, what overrides are applied, and what the
    final resolved settings look like. Compare two segments side-by-
    side (e.g. FOREX which works vs NSE_FUT which doesn't) to spot
    where the chain breaks.
    """
    from app.models.netting import (
        NettingSegment,
        NettingScriptOverride,
        UserSegmentOverride,
    )
    from app.services.netting_service import (
        _SEGMENT_NAME_MAP,
        _to_legacy_dict,
        get_effective_settings,
    )

    seg = await NettingSegment.find_one(NettingSegment.name == segment_name)
    if seg is None:
        return APIResponse(data={
            "error": f"NettingSegment with name='{segment_name}' NOT FOUND in DB",
            "hint": "This means seed_default_segments didn't run, or the admin matrix is editing a different row. The resolver will fall back to permissive defaults (intradayMargin=100, marginCalcMode='percent') for any instrument hitting this segment.",
        })

    # Raw DB dump of the segment row — what the resolver actually sees.
    seg_dump = seg.model_dump(exclude={"id", "revision_id"})
    # Highlight the few fields that drive the OrderPanel display.
    critical = {
        "marginCalcMode": seg_dump.get("marginCalcMode"),
        "intradayMargin": seg_dump.get("intradayMargin"),
        "overnightMargin": seg_dump.get("overnightMargin"),
        "optionBuyIntraday": seg_dump.get("optionBuyIntraday"),
        "optionSellIntraday": seg_dump.get("optionSellIntraday"),
        "isActive": seg_dump.get("isActive"),
        "tradingEnabled": seg_dump.get("tradingEnabled"),
    }

    # Script overrides scoped to this admin row.
    scripts = await NettingScriptOverride.find(
        NettingScriptOverride.segment_name == segment_name
    ).to_list()
    script_summary = [
        {
            "symbol": s.symbol,
            "marginCalcMode": getattr(s, "marginCalcMode", None),
            "intradayMargin": getattr(s, "intradayMargin", None),
        }
        for s in scripts
    ]

    # Resolve a synthetic call against this segment with no user / option
    # context — shows the segment-default path.
    sample_resolved = _to_legacy_dict(seg, None, action="BUY", product_type="MIS")
    sample_summary = {
        "margin_calc_mode": sample_resolved.get("margin_calc_mode"),
        "leverage": sample_resolved.get("leverage"),
        "margin_percentage": sample_resolved.get("margin_percentage"),
        "fixed_margin_per_lot": sample_resolved.get("fixed_margin_per_lot"),
    }

    # Show which SegmentType enum values funnel into this admin row.
    funneled_from = [
        seg_t for seg_t, admin_row in _SEGMENT_NAME_MAP.items()
        if admin_row == segment_name
    ]

    return APIResponse(data={
        "admin_row_name": segment_name,
        "db_row_found": True,
        "critical_fields_in_db": critical,
        "full_db_row": seg_dump,
        "instrument_segment_types_that_map_to_this_row": funneled_from,
        "script_overrides_count": len(scripts),
        "script_overrides_sample": script_summary[:5],
        "resolver_output_for_BUY_MIS": sample_summary,
        "_explanation": (
            "If `critical_fields_in_db.intradayMargin` is NOT what you set in the "
            "admin matrix, then the matrix Save isn't reaching this segment. "
            "If it IS what you set but `resolver_output.leverage` or "
            "`margin_percentage` looks wrong, then a script/user override is "
            "clobbering, or the resolver mode is being chosen wrong."
        ),
    })


@router.post("/segments/repair-margin-mode", response_model=APIResponse[dict])
async def repair_margin_mode(admin: CurrentAdmin):
    """Heal rows that got marginCalcMode='fixed' committed accidentally.

    Background: a self-heal effect in the admin matrix used to pre-stage
    `marginCalcMode = "fixed"` (the first dropdown option) on every row
    whose stored value was null/legacy. When the admin saved any field
    on such a row, that pre-staged "fixed" went into the DB even if
    they intended Times. The resolver then respected "fixed" mode and
    rendered the row as `Fixed · ₹{intradayMargin}/lot` regardless of
    the admin's actual intent.

    This endpoint resets `marginCalcMode` to NULL on rows where
    intradayMargin is still the seed default (100) — almost certainly
    means admin never actually meant Fixed. The defensive inference in
    `_to_legacy_dict` then sniffs intradayMargin on next read and picks
    the right mode (Times if > 100, Fixed otherwise).

    Idempotent. Reports per-segment counts so the admin can verify.
    """
    from app.models.netting import NettingSegment

    SEED_DEFAULT = 100.0
    rows = await NettingSegment.find_all().to_list()
    reset = []
    for seg in rows:
        # Only touch rows that smell like accidental commits:
        # mode == "fixed" but intradayMargin still at seed default →
        # admin never customised the margin number, so the mode was
        # almost certainly auto-staged not chosen.
        if (
            getattr(seg, "marginCalcMode", None) == "fixed"
            and float(getattr(seg, "intradayMargin", 0) or 0) == SEED_DEFAULT
        ):
            seg.marginCalcMode = None
            try:
                await seg.save()
                reset.append(seg.name)
            except Exception:
                pass
    # Wipe the per-user effective-settings cache so the heal takes
    # effect immediately on the user side, not after the next 5-min TTL.
    await svc._wipe_eff_cache_debounced()
    return APIResponse(data={
        "reset_count": len(reset),
        "reset_segments": reset,
        "note": (
            "After this reset, re-open the admin matrix and explicitly "
            "pick Times/Fixed + the intended Intraday value on each row "
            "you want customised. Rows you don't touch will be inferred "
            "by the backend at order time."
        ),
    })


# ── Script overrides ──────────────────────────────────────────────
@router.get("/scripts", response_model=APIResponse[list])
async def list_scripts(admin: CurrentAdmin, segment: str | None = Query(default=None)):
    rows = await svc.list_scripts(segment)
    return APIResponse(data=[_ser_script(r) for r in rows])


@router.post("/scripts", response_model=APIResponse[dict])
async def create_script(payload: dict, admin: CurrentAdmin):
    doc = await svc.create_script(payload)
    return APIResponse(data=_ser_script(doc))


@router.put("/scripts/{script_id}", response_model=APIResponse[dict])
async def update_script(script_id: str, payload: dict, admin: CurrentAdmin):
    patch = payload.get("patch") or {k: v for k, v in payload.items() if k != "patch"}
    if not isinstance(patch, dict):
        raise HTTPException(status_code=400, detail="patch must be an object")
    return APIResponse(data=_ser_script(await svc.update_script(script_id, patch)))


@router.delete("/scripts/{script_id}", response_model=APIResponse[dict])
async def delete_script(script_id: str, admin: CurrentAdmin):
    await svc.delete_script(script_id)
    return APIResponse(data={"ok": True})


# ── Per-user overrides ────────────────────────────────────────────
@router.get("/user/{user_id}", response_model=APIResponse[list])
async def list_user_overrides(user_id: str, admin: CurrentAdmin):
    rows = await svc.list_user_overrides(user_id)
    return APIResponse(data=[_ser_user_override(r) for r in rows])


@router.put("/user/{user_id}/{segment_name}", response_model=APIResponse[dict])
async def upsert_user_override(
    user_id: str,
    segment_name: str,
    payload: dict,
    admin: CurrentAdmin,
    symbol: str | None = Query(default=None),
):
    patch = payload.get("patch") or {k: v for k, v in payload.items() if k not in ("patch", "symbol")}
    sym = symbol or payload.get("symbol")
    if not isinstance(patch, dict):
        raise HTTPException(status_code=400, detail="patch must be an object")
    doc = await svc.upsert_user_override(user_id, segment_name, patch, sym)
    return APIResponse(data=_ser_user_override(doc))


@router.delete("/user/{user_id}/{segment_name}", response_model=APIResponse[dict])
async def delete_user_override(
    user_id: str,
    segment_name: str,
    admin: CurrentAdmin,
    symbol: str | None = Query(default=None),
):
    await svc.delete_user_override(user_id, segment_name, symbol)
    return APIResponse(data={"ok": True})


@router.get("/users-with-overrides", response_model=APIResponse[list])
async def list_users_with_overrides(admin: CurrentAdmin):
    """Distinct users who currently have at least one segment / script
    override doc. Used to render a quick-pick list on the admin Users tab
    so admins don't have to remember names."""
    from app.models.netting import UserSegmentOverride
    from app.models.user import User
    from beanie import PydanticObjectId

    user_ids = await UserSegmentOverride.distinct("user_id")
    if not user_ids:
        return APIResponse(data=[])
    # Count overrides per user so the UI can show "5 overrides".
    pipeline = [
        {"$group": {"_id": "$user_id", "count": {"$sum": 1}}},
    ]
    counts: dict[str, int] = {}
    async for row in UserSegmentOverride.aggregate(pipeline):
        counts[str(row["_id"])] = int(row["count"])
    users = await User.find({"_id": {"$in": [PydanticObjectId(str(u)) for u in user_ids]}}).to_list()
    return APIResponse(
        data=[
            {
                "id": str(u.id),
                "user_code": u.user_code,
                "full_name": u.full_name,
                "override_count": counts.get(str(u.id), 0),
            }
            for u in users
        ]
    )


# ── Diagnostic: trace why a user's order panel shows a particular margin
@router.get("/debug/resolve", response_model=APIResponse[dict])
async def debug_resolve(
    admin: CurrentAdmin,
    token: str,
    user_id: str | None = Query(default=None),
    action: str = Query(default="BUY"),
    product_type: str = Query(default="NRML"),
):
    """One-shot probe: takes an instrument token and shows every value the
    netting resolver uses to compute the order panel's margin / leverage.
    Hit this when "I saved 700× but the panel still shows 100×" — the
    response makes it impossible to guess what's wrong:
      • `instrument.segment`  : what's stored on the Instrument row
      • `mapped_segment_name` : after CRYPTO_SPOT → CRYPTO_PERPETUAL mapping
      • `raw_segment_doc`     : the NettingSegment record verbatim — proves
                                whether `marginCalcMode` saved as "times"
                                and `intradayMargin` is the 700 you set
      • `resolved`            : the final dict the order panel consumes
                                (margin_percentage, leverage, etc.)
      • `_resolver_build`     : sentinel proving the running process is on
                                the times-mode-symmetric patch
    """
    from app.models.instrument import Instrument
    from app.models.netting import NettingSegment
    from app.services import netting_service as svc

    inst = await Instrument.find_one(Instrument.token == token)
    if inst is None:
        raise HTTPException(status_code=404, detail=f"Instrument {token} not found")

    seg_name = svc._SEGMENT_NAME_MAP.get(inst.segment, inst.segment)
    raw_seg = await NettingSegment.find_one(NettingSegment.name == seg_name)

    # Use the admin's own id when caller doesn't pass user_id — just so the
    # resolver has a valid ObjectId for its cache key.
    uid = user_id or str(admin.id)
    resolved = await svc.get_effective_settings(
        uid,
        inst.segment,
        action=action,
        product_type=product_type,
        symbol=inst.symbol,
    )

    return APIResponse(data={
        "_resolver_build": "times_mode_symmetric_leverage_v2",
        "instrument": {
            "token": inst.token,
            "symbol": inst.symbol,
            "segment": inst.segment,
            "instrument_type": str(inst.instrument_type),
            "lot_size": inst.lot_size,
        },
        "mapped_segment_name": seg_name,
        "raw_segment_doc": raw_seg.model_dump(exclude={"id", "revision_id"}) if raw_seg else None,
        "resolved": resolved.get("settings", resolved),
    })


# ── Bulk copy ────────────────────────────────────────────────────
@router.post("/copy", response_model=APIResponse[dict])
async def copy(payload: dict, admin: CurrentAdmin):
    src = payload.get("source_user_id")
    targets = payload.get("target_user_ids") or []
    overwrite = bool(payload.get("overwrite", True))
    if not src:
        raise HTTPException(status_code=400, detail="source_user_id required")
    if not isinstance(targets, list) or not targets:
        raise HTTPException(status_code=400, detail="target_user_ids must be a non-empty list")
    return APIResponse(data=await svc.copy_user_overrides(
        source_user_id=src, target_user_ids=targets, overwrite=overwrite,
    ))
