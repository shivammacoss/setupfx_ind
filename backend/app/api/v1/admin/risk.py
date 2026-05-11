"""Admin Risk Management — global default + per-user overrides."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.core.dependencies import CurrentAdmin
from app.schemas.common import APIResponse
from app.services import netting_service as svc

router = APIRouter(prefix="/risk", tags=["admin-risk"])


@router.get("/global", response_model=APIResponse[dict])
async def get_global(admin: CurrentAdmin):
    doc = await svc.get_global_risk()
    return APIResponse(data=doc.model_dump(exclude={"id", "revision_id"}) | {"id": str(doc.id)})


@router.put("/global", response_model=APIResponse[dict])
async def update_global(payload: dict, admin: CurrentAdmin):
    patch = payload.get("patch") or {k: v for k, v in payload.items() if k != "patch"}
    if not isinstance(patch, dict):
        raise HTTPException(status_code=400, detail="patch must be an object")
    doc = await svc.update_global_risk(patch)
    return APIResponse(data=doc.model_dump(exclude={"id", "revision_id"}) | {"id": str(doc.id)})


@router.get("/user/{user_id}", response_model=APIResponse[dict])
async def get_user(user_id: str, admin: CurrentAdmin):
    doc = await svc.get_user_risk(user_id)
    glob = await svc.get_global_risk()
    return APIResponse(
        data={
            "user_settings": (doc.model_dump(exclude={"id", "revision_id", "user_id"}) | {"id": str(doc.id), "user_id": str(doc.user_id)}) if doc else None,
            "global_settings": glob.model_dump(exclude={"id", "revision_id"}) | {"id": str(glob.id)},
        }
    )


@router.put("/user/{user_id}", response_model=APIResponse[dict])
async def upsert_user(user_id: str, payload: dict, admin: CurrentAdmin):
    patch = payload.get("patch") or {k: v for k, v in payload.items() if k != "patch"}
    if not isinstance(patch, dict):
        raise HTTPException(status_code=400, detail="patch must be an object")
    doc = await svc.upsert_user_risk(user_id, patch)
    return APIResponse(data=doc.model_dump(exclude={"id", "revision_id", "user_id"}) | {"id": str(doc.id), "user_id": str(doc.user_id)})


@router.delete("/user/{user_id}", response_model=APIResponse[dict])
async def delete_user(user_id: str, admin: CurrentAdmin):
    await svc.delete_user_risk(user_id)
    return APIResponse(data={"ok": True})


@router.post("/user/{user_id}/copy-from/{source_user_id}", response_model=APIResponse[dict])
async def copy_from(user_id: str, source_user_id: str, admin: CurrentAdmin):
    """Clone source user's risk override onto this user. If source has no
    override (inherits global), the destination's override is removed."""
    try:
        doc = await svc.copy_user_risk(source_user_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return APIResponse(
        data=doc.model_dump(exclude={"id", "revision_id", "user_id"})
        | {"id": str(doc.id) if doc.id else None, "user_id": str(doc.user_id)}
    )


@router.get("/user/{user_id}/effective", response_model=APIResponse[dict])
async def get_effective(user_id: str, admin: CurrentAdmin):
    return APIResponse(data=await svc.get_effective_risk(user_id))


@router.get("/users-with-overrides", response_model=APIResponse[list])
async def list_users_with_overrides(admin: CurrentAdmin):
    """Distinct users with a UserRiskSettings override doc, plus a count of
    how many of the 8 fields they actually customised. Powers the quick-pick
    list on the admin Risk Management page so admins can see at a glance who
    has custom risk rules without having to search."""
    from app.models.netting import UserRiskSettings
    from app.models.user import User
    from app.services.netting_service import RISK_FIELDS

    docs = await UserRiskSettings.find_all().to_list()
    if not docs:
        return APIResponse(data=[])

    by_uid = {str(d.user_id): d for d in docs}
    users = await User.find({"_id": {"$in": [d.user_id for d in docs]}}).to_list()

    out = []
    for u in users:
        d = by_uid.get(str(u.id))
        if d is None:
            continue
        overridden = sum(1 for f in RISK_FIELDS if getattr(d, f, None) is not None)
        out.append(
            {
                "id": str(u.id),
                "user_code": u.user_code,
                "full_name": u.full_name,
                "override_count": overridden,
            }
        )
    return APIResponse(data=out)
