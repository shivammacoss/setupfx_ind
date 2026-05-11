"""WebSocket endpoints — user channel + market data."""

from fastapi import APIRouter

from app.api.ws import market_ws, user_ws

router = APIRouter()
router.include_router(market_ws.router)
router.include_router(user_ws.router)
