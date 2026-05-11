"""Admin payin-out — deposit + withdrawal approvals + bank accounts + W/D rules."""

from __future__ import annotations

from typing import Any

from beanie import PydanticObjectId
from fastapi import APIRouter, HTTPException

from app.core.dependencies import CurrentAdmin
from app.models.audit_log import AuditAction
from app.models.bank_account import CompanyBankAccount
from app.models.transaction import (
    DepositRequest,
    DepositStatus,
    TransactionType,
    WdRule,
    WithdrawalRequest,
    WithdrawalStatus,
)
from app.schemas.admin.common import (
    ApproveDepositRequest,
    ApproveWithdrawalRequest,
    RejectDepositRequest,
    RejectWithdrawalRequest,
)
from app.schemas.common import APIResponse
from app.services import wallet_service
from app.services.audit_service import log_event
from app.utils.decimal_utils import to_decimal
from app.utils.time_utils import now_utc

router = APIRouter(tags=["admin-payin-out"])


# ── Deposits ────────────────────────────────────────────────────────
@router.get("/deposits", response_model=APIResponse[list])
async def list_deposits(admin: CurrentAdmin, status: str | None = "PENDING", limit: int = 200):
    q: dict[str, Any] = {}
    if status:
        q["status"] = status
    rows = await DepositRequest.find(q).sort("-created_at").limit(limit).to_list()
    return APIResponse(
        data=[
            {
                "id": str(r.id),
                "user_id": str(r.user_id),
                "amount": str(r.amount),
                "payment_mode": r.payment_mode.value,
                "utr_number": r.utr_number,
                "screenshot_url": r.screenshot_url,
                "status": r.status.value,
                "user_remark": r.user_remark,
                "admin_remark": r.admin_remark,
                "created_at": r.created_at,
                "processed_at": r.processed_at,
            }
            for r in rows
        ]
    )


@router.post("/deposits/{deposit_id}/approve", response_model=APIResponse[dict])
async def approve_deposit(deposit_id: str, payload: ApproveDepositRequest, admin: CurrentAdmin):
    r = await DepositRequest.get(PydanticObjectId(deposit_id))
    if r is None:
        raise HTTPException(status_code=404, detail="Deposit not found")
    if r.status != DepositStatus.PENDING:
        raise HTTPException(status_code=400, detail="Already processed")

    amount = to_decimal(r.amount)
    await wallet_service.adjust(
        r.user_id,
        amount,
        transaction_type=TransactionType.DEPOSIT,
        narration=f"Deposit approved (ref {r.utr_number or r.id})",
        reference_type="DEPOSIT",
        reference_id=str(r.id),
        actor_id=admin.id,
    )

    r.status = DepositStatus.APPROVED
    r.processed_by = admin.id
    r.processed_at = now_utc()
    r.admin_remark = payload.admin_remark
    await r.save()

    await log_event(
        action=AuditAction.APPROVE,
        entity_type="DepositRequest",
        entity_id=r.id,
        actor_id=admin.id,
        target_user_id=r.user_id,
        metadata={"amount": str(amount)},
    )
    return APIResponse(data={"id": str(r.id), "status": r.status.value})


@router.post("/deposits/{deposit_id}/reject", response_model=APIResponse[dict])
async def reject_deposit(deposit_id: str, payload: RejectDepositRequest, admin: CurrentAdmin):
    r = await DepositRequest.get(PydanticObjectId(deposit_id))
    if r is None:
        raise HTTPException(status_code=404, detail="Deposit not found")
    if r.status != DepositStatus.PENDING:
        raise HTTPException(status_code=400, detail="Already processed")
    r.status = DepositStatus.REJECTED
    r.admin_remark = payload.admin_remark
    r.processed_by = admin.id
    r.processed_at = now_utc()
    await r.save()
    await log_event(
        action=AuditAction.REJECT,
        entity_type="DepositRequest",
        entity_id=r.id,
        actor_id=admin.id,
        target_user_id=r.user_id,
    )
    return APIResponse(data={"id": str(r.id), "status": r.status.value})


# ── Withdrawals ─────────────────────────────────────────────────────
@router.get("/withdrawals", response_model=APIResponse[list])
async def list_withdrawals(admin: CurrentAdmin, status: str | None = "PENDING", limit: int = 200):
    q: dict[str, Any] = {}
    if status:
        q["status"] = status
    rows = await WithdrawalRequest.find(q).sort("-created_at").limit(limit).to_list()
    return APIResponse(
        data=[
            {
                "id": str(r.id),
                "user_id": str(r.user_id),
                "amount": str(r.amount),
                "bank": r.bank.model_dump(),
                "status": r.status.value,
                "remarks": r.remarks,
                "utr_number": r.utr_number,
                "rejection_reason": r.rejection_reason,
                "created_at": r.created_at,
                "processed_at": r.processed_at,
            }
            for r in rows
        ]
    )


@router.post("/withdrawals/{withdrawal_id}/approve", response_model=APIResponse[dict])
async def approve_withdrawal(withdrawal_id: str, payload: ApproveWithdrawalRequest, admin: CurrentAdmin):
    r = await WithdrawalRequest.get(PydanticObjectId(withdrawal_id))
    if r is None:
        raise HTTPException(status_code=404, detail="Withdrawal not found")
    if r.status != WithdrawalStatus.PENDING:
        raise HTTPException(status_code=400, detail="Already processed")

    # Debit user wallet
    amount = to_decimal(r.amount)
    await wallet_service.adjust(
        r.user_id,
        -amount,
        transaction_type=TransactionType.WITHDRAWAL,
        narration=f"Withdrawal approved (UTR {payload.utr_number or 'pending'})",
        reference_type="WITHDRAWAL",
        reference_id=str(r.id),
        actor_id=admin.id,
    )

    r.status = WithdrawalStatus.COMPLETED
    r.utr_number = payload.utr_number
    r.processed_by = admin.id
    r.processed_at = now_utc()
    await r.save()

    await log_event(
        action=AuditAction.APPROVE,
        entity_type="WithdrawalRequest",
        entity_id=r.id,
        actor_id=admin.id,
        target_user_id=r.user_id,
    )
    return APIResponse(data={"id": str(r.id), "status": r.status.value})


@router.post("/withdrawals/{withdrawal_id}/reject", response_model=APIResponse[dict])
async def reject_withdrawal(withdrawal_id: str, payload: RejectWithdrawalRequest, admin: CurrentAdmin):
    r = await WithdrawalRequest.get(PydanticObjectId(withdrawal_id))
    if r is None:
        raise HTTPException(status_code=404, detail="Withdrawal not found")
    if r.status != WithdrawalStatus.PENDING:
        raise HTTPException(status_code=400, detail="Already processed")
    r.status = WithdrawalStatus.REJECTED
    r.rejection_reason = payload.rejection_reason
    r.processed_by = admin.id
    r.processed_at = now_utc()
    await r.save()
    await log_event(
        action=AuditAction.REJECT,
        entity_type="WithdrawalRequest",
        entity_id=r.id,
        actor_id=admin.id,
        target_user_id=r.user_id,
    )
    return APIResponse(data={"id": str(r.id), "status": r.status.value})


# ── Company bank accounts ───────────────────────────────────────────
@router.get("/bank-accounts", response_model=APIResponse[list])
async def list_bank_accounts(admin: CurrentAdmin):
    rows = await CompanyBankAccount.find_all().to_list()
    return APIResponse(
        data=[
            {
                "id": str(r.id),
                "bank_name": r.bank_name,
                "account_holder": r.account_holder,
                "account_number": r.account_number,
                "ifsc_code": r.ifsc_code,
                "upi_id": r.upi_id,
                "qr_code_url": r.qr_code_url,
                "is_active": r.is_active,
                "is_default": r.is_default,
            }
            for r in rows
        ]
    )


@router.post("/bank-accounts", response_model=APIResponse[dict])
async def create_bank(payload: dict, admin: CurrentAdmin):
    row = CompanyBankAccount(
        bank_name=payload.get("bank_name", ""),
        account_holder=payload.get("account_holder", ""),
        account_number=payload.get("account_number", ""),
        ifsc_code=payload.get("ifsc_code", ""),
        upi_id=payload.get("upi_id"),
        qr_code_url=payload.get("qr_code_url"),
        is_active=bool(payload.get("is_active", True)),
        is_default=bool(payload.get("is_default", False)),
    )
    await row.insert()
    return APIResponse(data={"id": str(row.id)})


@router.put("/bank-accounts/{bank_id}", response_model=APIResponse[dict])
async def update_bank(bank_id: str, payload: dict, admin: CurrentAdmin):
    r = await CompanyBankAccount.get(PydanticObjectId(bank_id))
    if r is None:
        raise HTTPException(status_code=404, detail="Bank account not found")
    for k in ("bank_name", "account_holder", "account_number", "ifsc_code", "upi_id", "qr_code_url", "is_active", "is_default"):
        if k in payload:
            setattr(r, k, payload[k])
    await r.save()
    return APIResponse(data={"id": str(r.id)})


@router.delete("/bank-accounts/{bank_id}", response_model=APIResponse[dict])
async def delete_bank(bank_id: str, admin: CurrentAdmin):
    r = await CompanyBankAccount.get(PydanticObjectId(bank_id))
    if r is None:
        raise HTTPException(status_code=404, detail="Bank account not found")
    await r.delete()
    return APIResponse(data={"ok": True})


# ── W/D rules ───────────────────────────────────────────────────────
@router.get("/wd-rules", response_model=APIResponse[list])
async def list_wd_rules(admin: CurrentAdmin):
    rows = await WdRule.find_all().to_list()
    return APIResponse(
        data=[
            {
                "id": str(r.id),
                "rule_type": r.rule_type,
                "min_amount": str(r.min_amount),
                "max_amount": str(r.max_amount),
                "daily_limit": str(r.daily_limit),
                "allowed_times": [w.model_dump() for w in r.allowed_times],
                "charges_flat": str(r.charges_flat),
                "charges_percent": r.charges_percent,
                "auto_approve_under": str(r.auto_approve_under),
                "mandatory_remark": r.mandatory_remark,
            }
            for r in rows
        ]
    )


@router.put("/wd-rules/{rule_type}", response_model=APIResponse[dict])
async def update_wd_rule(rule_type: str, payload: dict, admin: CurrentAdmin):
    r = await WdRule.find_one(WdRule.rule_type == rule_type)
    if r is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    from bson import Decimal128

    if "min_amount" in payload:
        r.min_amount = Decimal128(str(payload["min_amount"]))
    if "max_amount" in payload:
        r.max_amount = Decimal128(str(payload["max_amount"]))
    if "daily_limit" in payload:
        r.daily_limit = Decimal128(str(payload["daily_limit"]))
    if "charges_flat" in payload:
        r.charges_flat = Decimal128(str(payload["charges_flat"]))
    if "charges_percent" in payload:
        r.charges_percent = float(payload["charges_percent"])
    if "auto_approve_under" in payload:
        r.auto_approve_under = Decimal128(str(payload["auto_approve_under"]))
    if "mandatory_remark" in payload:
        r.mandatory_remark = bool(payload["mandatory_remark"])
    await r.save()
    return APIResponse(data={"ok": True})
