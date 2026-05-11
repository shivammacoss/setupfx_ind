"""FastAPI dependencies for auth, role guards, and admin extras.

Two distinct token audiences:
    • USER tokens  → require role in {CLIENT, DEALER, MASTER, ADMIN, SUPER_ADMIN}
    • ADMIN tokens → require role in {ADMIN, SUPER_ADMIN} + API key + IP allow-list

Tokens carry the role inside the JWT, but we *always* re-fetch the user from
DB on every request — a token is meaningless if the account has been blocked.
"""

from __future__ import annotations

from typing import Annotated

from beanie import PydanticObjectId
from fastapi import Depends, Header, Request
from fastapi.security import OAuth2PasswordBearer

from app.core.config import settings
from app.core.exceptions import (
    AccountBlockedError,
    AccountInactiveError,
    InsufficientPermissionsError,
    TokenInvalidError,
)
from app.core.security import decode_token
from app.models.user import User, UserRole, UserStatus

ADMIN_ROLES: set[UserRole] = {UserRole.SUPER_ADMIN, UserRole.ADMIN}

_user_oauth = OAuth2PasswordBearer(tokenUrl="/api/v1/user/auth/login", auto_error=True)
_admin_oauth = OAuth2PasswordBearer(tokenUrl="/api/v1/admin/auth/login", auto_error=True)


# ── Helpers ───────────────────────────────────────────────────────────
async def _resolve_user(token: str) -> User:
    payload = decode_token(token, expected_type="access")
    sub = payload.get("sub")
    if not sub:
        raise TokenInvalidError()
    try:
        oid = PydanticObjectId(sub)
    except Exception as e:  # pragma: no cover
        raise TokenInvalidError() from e
    user = await User.get(oid)
    if user is None:
        raise TokenInvalidError("User not found")
    if user.status == UserStatus.BLOCKED:
        raise AccountBlockedError()
    if user.status != UserStatus.ACTIVE:
        raise AccountInactiveError()
    return user


# ── User-side dependencies ────────────────────────────────────────────
async def get_current_user(
    request: Request,
    token: Annotated[str, Depends(_user_oauth)],
) -> User:
    user = await _resolve_user(token)
    request.state.user = user
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


# ── Admin-side dependencies ───────────────────────────────────────────
def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "0.0.0.0"


async def get_current_admin(
    request: Request,
    token: Annotated[str, Depends(_admin_oauth)],
    x_admin_api_key: Annotated[str | None, Header()] = None,
) -> User:
    # 1) API-key gate
    expected = settings.ADMIN_API_KEY.get_secret_value()
    if not expected or x_admin_api_key != expected:
        raise InsufficientPermissionsError("Admin API key required")

    # 2) IP allow-list (if configured)
    allow = settings.admin_ip_whitelist_set
    if allow and _client_ip(request) not in allow:
        raise InsufficientPermissionsError("Admin IP not allowed")

    # 3) Token
    user = await _resolve_user(token)
    if user.role not in ADMIN_ROLES:
        raise InsufficientPermissionsError("Admin role required")

    request.state.user = user
    return user


CurrentAdmin = Annotated[User, Depends(get_current_admin)]


def require_super_admin(user: CurrentAdmin) -> User:
    if user.role != UserRole.SUPER_ADMIN:
        raise InsufficientPermissionsError("Super admin role required")
    return user


SuperAdmin = Annotated[User, Depends(require_super_admin)]


# ── Optional auth (for endpoints that work with or without a token) ───
async def get_optional_user(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
) -> User | None:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    try:
        return await _resolve_user(authorization[7:])
    except Exception:
        return None
