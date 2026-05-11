"""Watchlist CRUD."""

from __future__ import annotations

import logging

from beanie import PydanticObjectId
from fastapi import APIRouter, HTTPException

from app.core.dependencies import CurrentUser
from app.models._base import Exchange
from app.models.watchlist import Watchlist, WatchlistItem
from app.schemas.common import APIResponse
from app.schemas.trading import WatchlistAddItem, WatchlistCreate
from app.services import instrument_service, market_data_service

logger = logging.getLogger(__name__)


async def _zerodha_subscribe(token: str, symbol: str, exchange: str) -> None:
    """Best-effort: subscribe one instrument to the live Zerodha ticker. Only
    runs for numeric Kite tokens (Indian segments); skips Infoway-mirrored
    forex/crypto/metal tokens which are handled separately."""
    try:
        token_int = int(token)
    except (TypeError, ValueError):
        return  # Infoway / synthetic token — Zerodha doesn't know it
    try:
        from app.services.zerodha_service import zerodha
        await zerodha.subscribe_tokens_on_demand(
            [token_int],
            symbols={token_int: {"symbol": symbol, "exchange": exchange}},
        )
    except Exception:
        logger.warning("watchlist_zerodha_subscribe_failed", extra={"token": token})


async def _zerodha_unsubscribe_if_orphan(token: str) -> None:
    """Unsubscribe from Zerodha only if NO user has this instrument in any
    watchlist anymore — saves WS slots without breaking other traders."""
    try:
        token_int = int(token)
    except (TypeError, ValueError):
        return
    still_used = await WatchlistItem.find_one(WatchlistItem.instrument_token == token)
    if still_used is not None:
        return  # someone else still wants ticks for this instrument
    try:
        from app.services.zerodha_service import zerodha
        await zerodha.unsubscribe_tokens_on_demand([token_int])
    except Exception:
        logger.warning("watchlist_zerodha_unsubscribe_failed", extra={"token": token})

router = APIRouter(prefix="/marketwatch", tags=["user-marketwatch"])

MAX_WATCHLISTS = 10


@router.get("", response_model=APIResponse[list])
async def list_watchlists(user: CurrentUser):
    wls = await Watchlist.find(Watchlist.user_id == user.id).sort("sort_order", "name").to_list()
    if not wls:
        # Auto-create a default
        wl = Watchlist(user_id=user.id, name="My Watchlist", sort_order=0, is_default=True)
        await wl.insert()
        wls = [wl]
    out = []
    for wl in wls:
        items = await WatchlistItem.find(WatchlistItem.watchlist_id == wl.id).sort("sort_order").to_list()
        out.append(
            {
                "id": str(wl.id),
                "name": wl.name,
                "sort_order": wl.sort_order,
                "is_default": wl.is_default,
                "items": [
                    {
                        "id": str(it.id),
                        "instrument_token": it.instrument_token,
                        "symbol": it.symbol,
                        "exchange": str(it.exchange),
                    }
                    for it in items
                ],
            }
        )
    return APIResponse(data=out)


@router.post("", response_model=APIResponse[dict])
async def create(payload: WatchlistCreate, user: CurrentUser):
    count = await Watchlist.find(Watchlist.user_id == user.id).count()
    if count >= MAX_WATCHLISTS:
        raise HTTPException(status_code=400, detail=f"Limit of {MAX_WATCHLISTS} watchlists reached")
    wl = Watchlist(user_id=user.id, name=payload.name.strip(), sort_order=count)
    await wl.insert()
    return APIResponse(data={"id": str(wl.id), "name": wl.name})


@router.delete("/{watchlist_id}", response_model=APIResponse[dict])
async def delete(watchlist_id: str, user: CurrentUser):
    wl = await Watchlist.get(PydanticObjectId(watchlist_id))
    if wl is None or wl.user_id != user.id:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    items = await WatchlistItem.find(WatchlistItem.watchlist_id == wl.id).to_list()
    tokens = [it.instrument_token for it in items]
    await WatchlistItem.find(WatchlistItem.watchlist_id == wl.id).delete()
    await wl.delete()
    # Try to free WS slots for every removed instrument that nobody else holds.
    for tok in tokens:
        await _zerodha_unsubscribe_if_orphan(tok)
    return APIResponse(data={"ok": True})


@router.post("/{watchlist_id}/items", response_model=APIResponse[dict])
async def add_item(watchlist_id: str, payload: WatchlistAddItem, user: CurrentUser):
    wl = await Watchlist.get(PydanticObjectId(watchlist_id))
    if wl is None or wl.user_id != user.id:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    inst = await instrument_service.get_by_token(payload.token)
    existing = await WatchlistItem.find_one(
        WatchlistItem.watchlist_id == wl.id, WatchlistItem.instrument_token == inst.token
    )
    if existing is not None:
        return APIResponse(data={"id": str(existing.id), "duplicate": True})
    count = await WatchlistItem.find(WatchlistItem.watchlist_id == wl.id).count()
    item = WatchlistItem(
        watchlist_id=wl.id,
        instrument_token=inst.token,
        symbol=inst.symbol,
        exchange=Exchange(inst.exchange),
        sort_order=count,
    )
    await item.insert()
    # On-demand Zerodha subscribe — fire ticks for this instrument now that
    # someone wants them. No-op for Infoway-quoted symbols.
    await _zerodha_subscribe(inst.token, inst.symbol, str(inst.exchange))
    return APIResponse(data={"id": str(item.id)})


@router.delete("/{watchlist_id}/items/{item_id}", response_model=APIResponse[dict])
async def remove_item(watchlist_id: str, item_id: str, user: CurrentUser):
    wl = await Watchlist.get(PydanticObjectId(watchlist_id))
    if wl is None or wl.user_id != user.id:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    item = await WatchlistItem.get(PydanticObjectId(item_id))
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")
    token = item.instrument_token
    await item.delete()
    # If no other user still has this instrument in any watchlist, free up
    # the Zerodha WS slot.
    await _zerodha_unsubscribe_if_orphan(token)
    return APIResponse(data={"ok": True})


@router.get("/{watchlist_id}/quotes", response_model=APIResponse[list])
async def quotes(watchlist_id: str, user: CurrentUser):
    wl = await Watchlist.get(PydanticObjectId(watchlist_id))
    if wl is None or wl.user_id != user.id:
        raise HTTPException(status_code=404, detail="Watchlist not found")
    items = await WatchlistItem.find(WatchlistItem.watchlist_id == wl.id).to_list()
    quotes = await market_data_service.get_quotes([it.instrument_token for it in items])
    return APIResponse(
        data=[
            {
                "instrument_token": it.instrument_token,
                "symbol": it.symbol,
                "exchange": str(it.exchange),
                **q,
            }
            for it, q in zip(items, quotes)
        ]
    )
