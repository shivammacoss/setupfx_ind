"""Company bank accounts (where users deposit) + per-user bank accounts (where withdrawals go)."""

from __future__ import annotations

from beanie import PydanticObjectId
from pydantic import Field
from pymongo import ASCENDING, IndexModel

from app.models._base import TimestampMixin


# ── 19. company_bank_accounts ─────────────────────────────────────────
class CompanyBankAccount(TimestampMixin):
    bank_name: str
    account_holder: str
    account_number: str
    ifsc_code: str
    branch: str | None = None
    account_type: str = "CURRENT"

    upi_id: str | None = None
    qr_code_url: str | None = None

    daily_limit_inr: float = 0.0  # 0 = no limit
    today_received: float = 0.0  # reset by EOD

    is_active: bool = True
    is_default: bool = False
    sort_order: int = 0

    class Settings:
        name = "company_bank_accounts"
        indexes = [
            IndexModel([("is_active", ASCENDING), ("is_default", ASCENDING)]),
            IndexModel([("account_number", ASCENDING)], unique=True),
        ]


# ── 20. user_bank_accounts ────────────────────────────────────────────
class UserBankAccount(TimestampMixin):
    user_id: PydanticObjectId
    bank_name: str
    account_holder: str
    account_number: str
    ifsc_code: str
    branch: str | None = None
    account_type: str = "SAVINGS"

    is_default: bool = False
    is_verified: bool = False
    verification_method: str | None = None  # PENNY_DROP / MANUAL
    nickname: str | None = None

    class Settings:
        name = "user_bank_accounts"
        indexes = [
            IndexModel(
                [("user_id", ASCENDING), ("account_number", ASCENDING)], unique=True
            ),
            IndexModel([("user_id", ASCENDING), ("is_default", ASCENDING)]),
        ]
