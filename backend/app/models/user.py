"""User & UserSegment documents.

A single User collection holds clients, dealers, masters, admins, super-admin
— role-based filtering keeps query plans simple. Hierarchical relationships
(master → dealer → client) are modelled via `parent_id`.
"""

from __future__ import annotations

from datetime import date, datetime
from enum import Enum

from beanie import Indexed, Link, PydanticObjectId
from pydantic import BaseModel, EmailStr, Field
from pymongo import ASCENDING, DESCENDING, IndexModel

from app.models._base import StrEnum, TimestampMixin
from app.utils.time_utils import now_utc


class UserRole(StrEnum):
    SUPER_ADMIN = "SUPER_ADMIN"
    ADMIN = "ADMIN"
    MASTER = "MASTER"
    DEALER = "DEALER"
    CLIENT = "CLIENT"


class UserStatus(StrEnum):
    ACTIVE = "ACTIVE"
    BLOCKED = "BLOCKED"
    PENDING = "PENDING"
    CLOSED = "CLOSED"


class AccountType(StrEnum):
    LIVE = "LIVE"
    DEMO = "DEMO"


# ── Embedded sub-documents ──────────────────────────────────────────
class KycInfo(BaseModel):
    pan: str | None = None
    aadhaar: str | None = None  # store hashed/last-4 in production
    dob: date | None = None
    address_line1: str | None = None
    address_line2: str | None = None
    city: str | None = None
    state: str | None = None
    pincode: str | None = None
    country: str = "India"
    is_verified: bool = False
    verified_at: datetime | None = None


class UserPermissions(BaseModel):
    can_place_orders: bool = True
    can_modify_orders: bool = True
    can_cancel_orders: bool = True
    can_withdraw: bool = True
    can_deposit: bool = True
    can_view_charts: bool = True
    api_access: bool = False
    algo_trading: bool = False


class TradingHours(BaseModel):
    login_start: str = "00:00"  # HH:MM, IST
    login_end: str = "23:59"
    ip_whitelist: list[str] = Field(default_factory=list)


class RiskProfile(BaseModel):
    max_daily_loss: float = 0.0  # 0 = no limit
    max_position_value: float = 0.0
    max_open_positions: int = 0
    auto_squareoff_enabled: bool = True
    m2m_squareoff_percent: float = 80.0  # squareoff at -80% of margin


class CommunicationPrefs(BaseModel):
    email_alerts: bool = True
    sms_alerts: bool = True
    whatsapp_alerts: bool = False
    push_alerts: bool = True


# ── User document ───────────────────────────────────────────────────
class User(TimestampMixin):
    user_code: Indexed(str, unique=True)  # type: ignore[valid-type]
    email: Indexed(EmailStr, unique=True)  # type: ignore[valid-type]
    mobile: Indexed(str, unique=True)  # type: ignore[valid-type]
    password_hash: str
    full_name: str
    photo_url: str | None = None

    role: UserRole = UserRole.CLIENT
    status: UserStatus = UserStatus.PENDING
    account_type: AccountType = AccountType.LIVE
    is_demo: bool = False

    parent_id: PydanticObjectId | None = None  # hierarchy

    kyc: KycInfo = Field(default_factory=KycInfo)
    permissions: UserPermissions = Field(default_factory=UserPermissions)
    trading_hours: TradingHours = Field(default_factory=TradingHours)
    risk: RiskProfile = Field(default_factory=RiskProfile)
    communication: CommunicationPrefs = Field(default_factory=CommunicationPrefs)

    # Brokerage plan (FK to brokerage_plans, optional → uses default)
    brokerage_plan_id: PydanticObjectId | None = None

    # 2FA
    two_fa_enabled: bool = False
    two_fa_secret: str | None = None
    two_fa_backup_codes: list[str] = Field(default_factory=list)

    # Login telemetry
    last_login_at: datetime | None = None
    last_login_ip: str | None = None
    failed_login_count: int = 0
    locked_until: datetime | None = None
    password_changed_at: datetime | None = None
    must_change_password: bool = False

    created_by: PydanticObjectId | None = None

    class Settings:
        name = "users"
        use_state_management = True
        indexes = [
            IndexModel([("email", ASCENDING)], unique=True),
            IndexModel([("mobile", ASCENDING)], unique=True),
            IndexModel([("user_code", ASCENDING)], unique=True),
            IndexModel([("parent_id", ASCENDING)]),
            IndexModel([("role", ASCENDING), ("status", ASCENDING)]),
            IndexModel([("created_at", DESCENDING)]),
            IndexModel([("kyc.pan", ASCENDING)]),
        ]

    def is_admin(self) -> bool:
        return self.role in {UserRole.SUPER_ADMIN, UserRole.ADMIN}

    def is_internal(self) -> bool:
        return self.role in {UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MASTER, UserRole.DEALER}

    def record_successful_login(self, ip: str) -> None:
        self.last_login_at = now_utc()
        self.last_login_ip = ip
        self.failed_login_count = 0
        self.locked_until = None


# ── User segment toggle (which segments this user may even *see*) ────
class UserSegment(TimestampMixin):
    user_id: PydanticObjectId
    segment: str  # SegmentType.value
    enabled: bool = True

    class Settings:
        name = "user_segments"
        indexes = [
            IndexModel([("user_id", ASCENDING), ("segment", ASCENDING)], unique=True),
        ]
