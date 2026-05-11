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
