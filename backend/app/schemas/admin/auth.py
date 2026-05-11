"""Admin-side auth schemas — intentionally separate from user-side schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field


class AdminLoginRequest(BaseModel):
    identifier: str = Field(description="admin email or user_code")
    password: str = Field(min_length=8, max_length=128)
    two_fa_code: str | None = Field(
        default=None,
        min_length=6,
        max_length=6,
        description="TOTP code — only required if the admin has 2FA enabled on their account",
    )


class AdminTokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    admin: "AdminUserOut"


class AdminUserOut(BaseModel):
    id: str
    user_code: str
    email: str
    full_name: str
    role: str
    last_login_at: str | None = None


AdminTokenPair.model_rebuild()
