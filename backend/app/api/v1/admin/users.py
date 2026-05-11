"""Admin user management — list, detail, create, update, block, wallet adjust, delete."""

from __future__ import annotations

import re
from typing import Any

from beanie import PydanticObjectId
from fastapi import APIRouter, HTTPException, Query

from app.core.dependencies import CurrentAdmin
from app.core.security import hash_password
from app.models.audit_log import AuditAction
from app.models.transaction import TransactionType
from app.models.user import User, UserRole, UserStatus
from app.schemas.admin.common import (
    BlockUserRequest,
    CreateUserRequest,
    WalletAdjustRequest,
)
from app.schemas.common import APIResponse
from app.services import user_service, wallet_service
from app.services.audit_service import log_event
from app.utils.decimal_utils import to_decimal128

router = APIRouter(prefix="/users", tags=["admin-users"])


def _ser(u: User) -> dict:
    return {
        "id": str(u.id),
        "user_code": u.user_code,
        "email": u.email,
        "mobile": u.mobile,
        "full_name": u.full_name,
        "role": u.role.value,
        "status": u.status.value,
        "is_demo": u.is_demo,
        "parent_id": str(u.parent_id) if u.parent_id else None,
        "two_fa_enabled": u.two_fa_enabled,
        "last_login_at": u.last_login_at,
        "created_at": u.created_at,
    }


@router.get("", response_model=APIResponse[dict])
async def list_users(
    admin: CurrentAdmin,
    q: str | None = None,
    role: str | None = None,
    status: str | None = None,
    parent_id: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=200),
):
    query: dict[str, Any] = {}
    if role:
        query["role"] = role
    if status:
        query["status"] = status
    if parent_id:
        query["parent_id"] = PydanticObjectId(parent_id)
    if q:
        regex = re.compile(re.escape(q.strip()), re.IGNORECASE)
        query["$or"] = [
            {"email": regex},
            {"mobile": regex},
            {"user_code": regex},
            {"full_name": regex},
        ]

    total = await User.find(query).count()
    rows = (
        await User.find(query)
        .sort("-created_at")
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list()
    )
    return APIResponse(
        data={
            "items": [_ser(u) for u in rows],
            "meta": {"page": page, "page_size": page_size, "total": total, "total_pages": (total + page_size - 1) // page_size},
        }
    )


@router.get("/{user_id}", response_model=APIResponse[dict])
async def get_user(user_id: str, admin: CurrentAdmin):
    u = await user_service.get_user_or_404(user_id)
    detail = _ser(u)
    detail.update(
        {
            "kyc": u.kyc.model_dump() if u.kyc else None,
            "permissions": u.permissions.model_dump() if u.permissions else None,
            "trading_hours": u.trading_hours.model_dump() if u.trading_hours else None,
            "risk": u.risk.model_dump() if u.risk else None,
            "communication": u.communication.model_dump() if u.communication else None,
            "wallet": await wallet_service.summary(u.id),
        }
    )
    return APIResponse(data=detail)


@router.post("", response_model=APIResponse[dict])
async def create_user(payload: CreateUserRequest, admin: CurrentAdmin):
    user = await user_service.create_user(
        email=payload.email,
        mobile=payload.mobile,
        password=payload.password,
        full_name=payload.full_name,
        role=UserRole(payload.role),
        status=UserStatus.ACTIVE,
        parent_id=PydanticObjectId(payload.parent_id) if payload.parent_id else None,
        is_demo=payload.is_demo,
        created_by=admin.id,
    )
    if payload.initial_balance:
        await wallet_service.adjust(
            user.id,
            payload.initial_balance,
            transaction_type=TransactionType.ADJUSTMENT,
            narration=f"Initial balance credit by {admin.user_code}",
            actor_id=admin.id,
        )
    if payload.credit_limit:
        from app.services import wallet_service as ws
        wallet = await ws.get(user.id)
        wallet.credit_limit = to_decimal128(payload.credit_limit)
        await wallet.save()

    await log_event(
        action=AuditAction.CREATE,
        entity_type="User",
        entity_id=user.id,
        actor_id=admin.id,
        target_user_id=user.id,
    )
    return APIResponse(data=_ser(user))


@router.put("/{user_id}", response_model=APIResponse[dict])
async def update_user(user_id: str, payload: dict, admin: CurrentAdmin):
    u = await user_service.get_user_or_404(user_id)
    for k in ("full_name", "photo_url", "is_demo"):
        if k in payload and payload[k] is not None:
            setattr(u, k, payload[k])
    if "permissions" in payload and payload["permissions"]:
        for k, v in payload["permissions"].items():
            if hasattr(u.permissions, k):
                setattr(u.permissions, k, v)
    if "risk" in payload and payload["risk"]:
        for k, v in payload["risk"].items():
            if hasattr(u.risk, k):
                setattr(u.risk, k, v)
    await u.save()
    await log_event(
        action=AuditAction.UPDATE, entity_type="User", entity_id=u.id, actor_id=admin.id, target_user_id=u.id
    )
    return APIResponse(data=_ser(u))


@router.post("/{user_id}/block", response_model=APIResponse[dict])
async def block(user_id: str, payload: BlockUserRequest, admin: CurrentAdmin):
    u = await user_service.get_user_or_404(user_id)
    u.status = UserStatus.BLOCKED
    await u.save()
    await log_event(
        action=AuditAction.BLOCK,
        entity_type="User",
        entity_id=u.id,
        actor_id=admin.id,
        target_user_id=u.id,
        metadata={"reason": payload.reason},
    )
    return APIResponse(data=_ser(u))


@router.post("/{user_id}/unblock", response_model=APIResponse[dict])
async def unblock(user_id: str, admin: CurrentAdmin):
    u = await user_service.get_user_or_404(user_id)
    u.status = UserStatus.ACTIVE
    u.failed_login_count = 0
    u.locked_until = None
    await u.save()
    await log_event(
        action=AuditAction.UNBLOCK, entity_type="User", entity_id=u.id, actor_id=admin.id, target_user_id=u.id
    )
    return APIResponse(data=_ser(u))


@router.post("/{user_id}/reset-password", response_model=APIResponse[dict])
async def admin_reset_password(user_id: str, payload: dict, admin: CurrentAdmin):
    new_pw = payload.get("new_password") or ""
    if len(new_pw) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    u = await user_service.get_user_or_404(user_id)
    u.password_hash = hash_password(new_pw)
    u.must_change_password = True
    u.failed_login_count = 0
    await u.save()
    await log_event(
        action=AuditAction.PASSWORD_RESET,
        entity_type="User",
        entity_id=u.id,
        actor_id=admin.id,
        target_user_id=u.id,
    )
    return APIResponse(data={"ok": True})


@router.post("/{user_id}/wallet-adjust", response_model=APIResponse[dict])
async def wallet_adjust(user_id: str, payload: WalletAdjustRequest, admin: CurrentAdmin):
    txn = await wallet_service.adjust(
        user_id,
        payload.amount,
        transaction_type=TransactionType(payload.transaction_type),
        narration=payload.narration,
        actor_id=admin.id,
    )
    await log_event(
        action=AuditAction.WALLET_ADJUST,
        entity_type="Wallet",
        entity_id=str(txn.id),
        actor_id=admin.id,
        target_user_id=user_id,
        metadata={"amount": str(payload.amount), "type": payload.transaction_type},
    )
    return APIResponse(data={"transaction_id": str(txn.id), "amount": str(txn.amount)})


@router.delete("/{user_id}", response_model=APIResponse[dict])
async def delete_user(user_id: str, admin: CurrentAdmin):
    u = await user_service.get_user_or_404(user_id)
    if u.role == UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=400, detail="Super admin cannot be deleted")
    u.status = UserStatus.CLOSED
    await u.save()
    await log_event(
        action=AuditAction.DELETE, entity_type="User", entity_id=u.id, actor_id=admin.id, target_user_id=u.id
    )
    return APIResponse(data={"ok": True, "status": u.status.value})


# ── Credit limit (Give / Take Credit) ───────────────────────────────
@router.patch("/{user_id}/credit-limit", response_model=APIResponse[dict])
async def update_credit_limit(user_id: str, payload: dict, admin: CurrentAdmin):
    """Adjust the user's credit_limit by `delta` (positive = give credit,
    negative = take credit). The new total cannot go below 0."""
    from bson import Decimal128
    from decimal import Decimal

    from app.utils.decimal_utils import to_decimal

    delta_raw = payload.get("delta")
    if delta_raw is None:
        raise HTTPException(status_code=400, detail="delta is required")
    try:
        delta = to_decimal(delta_raw)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid delta value")
    narration = (payload.get("narration") or "").strip() or "credit limit adjust"

    wallet = await wallet_service.get_or_create(user_id)
    new_limit = to_decimal(wallet.credit_limit) + delta
    if new_limit < Decimal("0"):
        raise HTTPException(
            status_code=400,
            detail=f"Resulting credit limit would be negative (current ₹{wallet.credit_limit}, delta ₹{delta})",
        )
    wallet.credit_limit = Decimal128(str(new_limit))
    wallet.version += 1
    await wallet.save()

    await log_event(
        action=AuditAction.WALLET_ADJUST,
        entity_type="Wallet",
        entity_id=str(wallet.id),
        actor_id=admin.id,
        target_user_id=user_id,
        metadata={"delta": str(delta), "new_credit_limit": str(new_limit), "narration": narration, "kind": "CREDIT_LIMIT"},
    )
    return APIResponse(
        data={
            "credit_limit": str(new_limit),
            "delta": str(delta),
            "narration": narration,
        }
    )


# ── Kill Switch ─────────────────────────────────────────────────────
@router.post("/{user_id}/kill-switch", response_model=APIResponse[dict])
async def kill_switch(user_id: str, payload: dict, admin: CurrentAdmin):
    """Emergency stop for a user account:
        1. Cancel all pending / open orders
        2. Square off all open positions at market
        3. Block the account (status = BLOCKED)

    Idempotent — running it twice on a stopped user is a no-op.
    """
    from beanie import PydanticObjectId

    from app.models._base import OrderAction, OrderType, ProductType
    from app.models.order import Order, OrderStatus
    from app.models.position import Position, PositionStatus
    from app.services import order_service

    u = await user_service.get_user_or_404(user_id)
    reason = (payload.get("reason") or "kill switch").strip()

    # 1) Cancel pending orders — use a raw Mongo $in expression because
    # Beanie's `Order.status.in_(...)` chain isn't supported on enum fields.
    cancelled_count = 0
    pending = await Order.find(
        {
            "user_id": PydanticObjectId(user_id),
            "status": {
                "$in": [
                    OrderStatus.OPEN.value,
                    OrderStatus.PENDING.value,
                    OrderStatus.PARTIAL.value,
                ]
            },
        }
    ).to_list()
    for o in pending:
        try:
            await order_service.admin_force_cancel(str(o.id), reason="KILL_SWITCH")
            cancelled_count += 1
        except Exception:
            continue

    # 2) Square off all open positions at market
    open_positions = await Position.find(
        Position.user_id == PydanticObjectId(user_id),
        Position.status == PositionStatus.OPEN,
    ).to_list()
    squared_off = 0
    for p in open_positions:
        if p.quantity == 0:
            continue
        action = OrderAction.SELL if p.quantity > 0 else OrderAction.BUY
        qty = abs(p.quantity)
        lots = max(0.01, qty / max(1, p.instrument.lot_size or 1))
        try:
            await order_service.place_order(
                user=u,
                payload={
                    "token": p.instrument.token,
                    "action": action.value,
                    "order_type": OrderType.MARKET.value,
                    "product_type": p.product_type.value,
                    "lots": lots,
                    "placed_from": "ADMIN_KILL_SWITCH",
                },
            )
            squared_off += 1
        except Exception:
            continue

    # 3) Block the user
    u.status = UserStatus.BLOCKED
    await u.save()

    await log_event(
        action=AuditAction.SQUAREOFF_FORCE,
        entity_type="User",
        entity_id=u.id,
        actor_id=admin.id,
        target_user_id=u.id,
        metadata={
            "kind": "KILL_SWITCH",
            "reason": reason,
            "orders_cancelled": cancelled_count,
            "positions_squared_off": squared_off,
        },
    )
    return APIResponse(
        data={
            "ok": True,
            "orders_cancelled": cancelled_count,
            "positions_squared_off": squared_off,
            "user_status": u.status.value,
        }
    )


# ── Login As (impersonate) ──────────────────────────────────────────
@router.post("/{user_id}/impersonate", response_model=APIResponse[dict])
async def impersonate(user_id: str, admin: CurrentAdmin):
    """Mint a user-side JWT pair for the target user. Admin-only.

    The returned tokens hit the user app's /api/v1/user routes — admin pastes
    them into the user app's localStorage (or the admin UI does it for them
    with `window.open(...)`) and operates the user app as that user.
    """
    from app.core.config import settings as cfg
    from app.core.redis_client import cache_set
    from app.core.security import (
        create_access_token,
        create_refresh_token,
        refresh_jti_key,
        session_key,
    )
    from app.models.user import UserRole

    target = await user_service.get_user_or_404(user_id)
    if target.role == UserRole.SUPER_ADMIN and admin.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Cannot impersonate a super admin")

    target_id = str(target.id)  # always present after get_user_or_404
    access = create_access_token(
        user_id=target_id, role=target.role.value, extra={"impersonator": str(admin.id)}
    )
    refresh, jti = create_refresh_token(user_id=target_id, role=target.role.value)
    await cache_set(
        refresh_jti_key(str(target.id), jti),
        {
            "user_id": str(target.id),
            "audience": "user",
            "impersonator": str(admin.id),
        },
        ttl_sec=cfg.JWT_REFRESH_TTL_DAYS * 86400,
    )
    await cache_set(
        session_key(str(target.id), jti),
        {"audience": "user", "impersonator": str(admin.id)},
        ttl_sec=cfg.JWT_REFRESH_TTL_DAYS * 86400,
    )

    await log_event(
        action=AuditAction.IMPERSONATE,
        entity_type="User",
        entity_id=target.id,
        actor_id=admin.id,
        target_user_id=target.id,
        metadata={"as_role": target.role.value},
    )

    return APIResponse(
        data={
            "access_token": access,
            "refresh_token": refresh,
            "expires_in": cfg.JWT_ACCESS_TTL_MIN * 60,
            "user": {
                "id": str(target.id),
                "user_code": target.user_code,
                "email": target.email,
                "mobile": target.mobile,
                "full_name": target.full_name,
                "role": target.role.value,
                "status": target.status.value,
                "is_demo": target.is_demo,
                "two_fa_enabled": target.two_fa_enabled,
                "must_change_password": target.must_change_password,
            },
            # CORS_USER_ORIGIN may hold comma-separated origins (e.g.
            # "https://setupfx.io,https://www.setupfx.io") — for the
            # impersonation redirect we want the FIRST canonical origin
            # only, otherwise the comma lands in the URL and the browser
            # tries to resolve "setupfx.io,https://www.setupfx.io" as a
            # hostname (DNS_PROBE_FINISHED_NXDOMAIN).
            "user_app_url": cfg.CORS_USER_ORIGIN.split(",")[0].strip(),
        }
    )
