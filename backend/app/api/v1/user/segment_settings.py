"""User-side segment-settings preview.

The order panel calls this when the user picks an instrument so the UI can
show the EXACT lot/quantity/value/margin/brokerage the server is going to
enforce — same numbers the validator and matching engine resolve. Surfacing
them up-front means users see what's enforced before they submit, instead of
discovering it when their order gets rejected.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.core.dependencies import CurrentUser
from app.schemas.common import APIResponse
from app.services import instrument_service, netting_service

router = APIRouter(prefix="/segment-settings", tags=["user-segment-settings"])


@router.get("/effective", response_model=APIResponse[dict])
async def get_effective_for_instrument(
    user: CurrentUser,
    token: str = Query(..., description="Instrument token"),
    action: str = Query(default="BUY", regex="^(BUY|SELL)$"),
    product_type: str = Query(default="MIS", regex="^(MIS|NRML|CNC)$"),
):
    """Resolve the same netting/segment-settings stack the server will apply
    when an order with these inputs is placed. Returns lot limits, the
    margin % that'll actually be charged, the commission scheme, and the
    static caps (per-order qty, per-order value, max-each-lot, etc.)."""
    # Try MongoDB first, then auto-create from Zerodha cache (same helper
    # the instrument-detail endpoint uses).
    from app.api.v1.user.instruments import _find_or_create_from_zerodha

    instrument = await _find_or_create_from_zerodha(token)
    if instrument is None:
        raise HTTPException(status_code=404, detail=f"Instrument {token} not found")

    option_type = (
        instrument.option_type.value
        if instrument.option_type and hasattr(instrument.option_type, "value")
        else None
    )

    resolved: dict[str, Any] = await netting_service.get_effective_settings(
        user.id,  # type: ignore[arg-type]
        instrument.segment,
        action=action,
        option_type=option_type,
        product_type=product_type,
        symbol=instrument.symbol,
    )

    s = resolved["settings"]
    # Trim down to the fields the OrderPanel actually displays — keeps the
    # response payload small for a 3× / second poll.
    out = {
        "segment_type": instrument.segment,
        "lot_size": instrument.lot_size or 1,
        "allow": s.get("allow"),
        # Lot limits
        "min_lot": s.get("min_lot"),
        "max_lot": s.get("max_lot"),
        "order_lot": s.get("order_lot"),
        "intraday_lot_limit": s.get("intraday_lot_limit"),
        "holding_lot_limit": s.get("holding_lot_limit"),
        "max_each_lot": s.get("max_each_lot"),
        "otm_max_each_lot": s.get("otm_max_each_lot"),
        # Quantity caps (mainly for equity)
        "min_qty": s.get("min_qty"),
        "per_order_qty": s.get("per_order_qty"),
        "max_qty_per_script": s.get("max_qty_per_script"),
        # Notional caps
        "max_value": s.get("max_value"),
        # Margin / leverage that'll actually be charged for this side+product
        "margin_percentage": s.get("margin_percentage"),
        "leverage": s.get("leverage"),
        # Commission preview
        "commission_type": s.get("commission_type"),
        "commission_value": s.get("commission_value"),
        "min_brokerage": s.get("min_brokerage"),
        "charge_on": s.get("charge_on"),
        # Risk gates
        "limit_percentage": s.get("limit_percentage"),
        "stop_loss_mandatory": s.get("stop_loss_mandatory"),
        "selling_overnight": s.get("selling_overnight"),
        # Source attribution so the UI can show "Override applied"
        "sources": resolved.get("sources", {}),
    }
    return APIResponse(data=out)
