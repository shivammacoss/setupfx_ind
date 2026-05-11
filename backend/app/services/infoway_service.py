"""Infoway (infoway.io) WebSocket integration.

Infoway covers global markets that Kite Connect does not — forex pairs
(EURUSD, USDJPY…), crypto pairs (BTCUSDT, ETHUSDT…), spot metals
(XAUUSD, XAGUSD…) and energy (USOIL, UKOIL, NATGAS).

Protocol (code-based JSON over WS — different from AllTick):
    Subscribe          → {code: 10003, trace, data: {codes: "BTC,ETH,..."}}
    Unsubscribe        → {code: 10004, trace, data: {codes: "BTC,..."}}
    Server depth push  ← {code: 10005, data: {s, t,
                            a: [[prices], [volumes]],   # asks
                            b: [[prices], [volumes]]}}  # bids

Endpoints — Infoway splits markets onto separate WS channels:
    Crypto                  wss://data.infoway.io/ws?business=crypto&apikey=...
    Forex / metals / energy wss://data.infoway.io/ws?business=common&apikey=...

We hold both connections in parallel and fan-out subscriptions to whichever
channel matches the symbol's class. The public surface (`infoway.ticks`,
`infoway.subscribe`, `infoway.status`, …) is identical to the AllTick
service this replaces so callers don't change.

Every numeric field exposed downstream is `float`. Decimal coercion only
happens at the order / wallet boundary; the live tick path stays float so
it is cheap and JSON-serialisable for Redis fanout.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from typing import Any

import websockets
from websockets.exceptions import ConnectionClosed

from app.core.config import settings
from app.core.redis_client import publish

logger = logging.getLogger(__name__)

WS_BASE = "wss://data.infoway.io/ws"

# Protocol codes
CMD_SUBSCRIBE = 10003
CMD_UNSUBSCRIBE = 10004
CMD_DEPTH_PUSH = 10005

# Market channels — Infoway requires a separate WS per business class.
CHANNEL_CRYPTO = "crypto"
CHANNEL_COMMON = "common"  # forex / metals / energy / futures


def _normalise_symbol(code: str) -> str:
    """`BTCUSD` ↔ `BTCUSDT` map (Infoway lists most cryptos as USDT pairs).
    All other symbols (EURUSD, XAUUSD, USOIL…) pass through unchanged."""
    s = (code or "").strip().upper()
    if not s:
        return s
    if s.endswith("USDT"):
        return s
    crypto_bases = {"BTC", "ETH", "SOL", "XRP", "DOGE", "BNB", "ADA", "MATIC", "LINK", "AVAX"}
    base = s[:-3] if s.endswith("USD") else s
    if s.endswith("USD") and base in crypto_bases:
        return base + "USDT"
    return s


def _channel_for(code: str) -> str:
    """Decide which Infoway business channel owns this symbol.
    Crypto → `crypto`, everything else (forex / metals / energy) → `common`."""
    c = (code or "").strip().upper()
    if c.endswith("USDT") or c.endswith("USDC") or c.endswith("BUSD"):
        return CHANNEL_CRYPTO
    return CHANNEL_COMMON


def _safe_float(v: Any, default: float = 0.0) -> float:
    """Coerce any incoming numeric (str / int / float / None) to a finite
    float without raising. Defends the tick path against malformed feed
    payloads that would otherwise break parsing for a whole frame."""
    if v is None:
        return default
    try:
        f = float(v)
    except (TypeError, ValueError):
        return default
    if f != f or f in (float("inf"), float("-inf")):  # NaN / inf
        return default
    return f


class _Channel:
    """One Infoway WS connection (either `crypto` or `common`).

    The parent `InfowayService` owns two of these and routes symbols by
    `_channel_for(code)`. Each channel handles its own connect / reconnect /
    re-subscribe loop independently — a hiccup on the crypto stream doesn't
    pause forex ticks."""

    def __init__(self, business: str, parent: "InfowayService") -> None:
        self.business = business
        self.parent = parent
        self._ws: websockets.WebSocketClientProtocol | None = None
        self._task: asyncio.Task | None = None
        self._subscribed: set[str] = set()
        self._connected: bool = False
        self._stop_requested: bool = False

    @property
    def is_connected(self) -> bool:
        return self._connected and self._ws is not None and not self._ws.closed  # type: ignore[union-attr]

    async def start(self) -> None:
        if self._task and not self._task.done():
            return
        self._stop_requested = False
        self._task = asyncio.create_task(self._run_loop(), name=f"infoway_ws_{self.business}")

    async def stop(self) -> None:
        self._stop_requested = True
        if self._ws is not None:
            try:
                await self._ws.close()
            except Exception:
                pass
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
        self._task = None
        self._connected = False

    async def _run_loop(self) -> None:
        backoff = 1
        while not self._stop_requested:
            try:
                await self._connect_once()
                backoff = 1
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.parent._last_error = str(e)[:300]
                logger.warning(
                    "infoway_reconnect_in_%ss [%s]: %s",
                    backoff,
                    self.business,
                    str(e)[:200],
                )
            self._connected = False
            if self._stop_requested:
                break
            await asyncio.sleep(min(backoff, 30))
            backoff = min(backoff * 2, 30)

    async def _connect_once(self) -> None:
        token = settings.INFOWAY_API_KEY.get_secret_value()
        url = f"{WS_BASE}?business={self.business}&apikey={token}"
        async with websockets.connect(
            url,
            ping_interval=20,
            ping_timeout=10,
            close_timeout=5,
            max_size=2**20,
        ) as ws:
            self._ws = ws
            self._connected = True
            self.parent._last_error = None
            logger.info("infoway_ws_connected", extra={"channel": self.business})

            # Re-subscribe to anything we had before disconnect
            if self._subscribed:
                await self._send_subscribe(list(self._subscribed))

            async for raw in ws:
                if self._stop_requested:
                    break
                try:
                    msg = json.loads(raw if isinstance(raw, str) else raw.decode("utf-8"))
                except Exception:
                    continue
                self.parent._dispatch(msg)

    async def subscribe(self, codes: list[str]) -> int:
        new = [c for c in codes if c and c not in self._subscribed]
        if not new:
            return 0
        for c in new:
            self._subscribed.add(c)
        if self.is_connected:
            await self._send_subscribe(new)
        return len(new)

    async def unsubscribe(self, codes: list[str]) -> int:
        gone = [c for c in codes if c in self._subscribed]
        for c in gone:
            self._subscribed.discard(c)
        if self.is_connected and gone:
            await self._send_unsubscribe(gone)
        return len(gone)

    async def _send_subscribe(self, codes: list[str]) -> None:
        if self._ws is None:
            return
        payload = {
            "code": CMD_SUBSCRIBE,
            "trace": uuid.uuid4().hex,
            "data": {"codes": ",".join(codes), "includeTy": False},
        }
        try:
            await self._ws.send(json.dumps(payload))
            logger.info(
                "infoway_subscribed",
                extra={"channel": self.business, "count": len(codes)},
            )
        except (ConnectionClosed, Exception) as e:
            logger.warning(
                "infoway_subscribe_failed [%s]: %s",
                self.business,
                str(e)[:200],
            )

    async def _send_unsubscribe(self, codes: list[str]) -> None:
        if self._ws is None:
            return
        payload = {
            "code": CMD_UNSUBSCRIBE,
            "trace": uuid.uuid4().hex,
            "data": {"codes": ",".join(codes)},
        }
        try:
            await self._ws.send(json.dumps(payload))
        except Exception:
            pass


class InfowayService:
    """Public surface kept compatible with the old AllTickService so
    `get_tick / get_all_ticks / subscribe / status / depth` consumers
    don't change."""

    def __init__(self) -> None:
        self.ticks: dict[str, dict[str, Any]] = {}
        self.depth: dict[str, dict[str, Any]] = {}
        self._channels: dict[str, _Channel] = {
            CHANNEL_CRYPTO: _Channel(CHANNEL_CRYPTO, self),
            CHANNEL_COMMON: _Channel(CHANNEL_COMMON, self),
        }
        self._last_error: str | None = None
        self._main_loop: asyncio.AbstractEventLoop | None = None

    @property
    def is_configured(self) -> bool:
        return bool(settings.INFOWAY_API_KEY.get_secret_value())

    @property
    def is_connected(self) -> bool:
        return any(c.is_connected for c in self._channels.values())

    def status(self) -> dict[str, Any]:
        subs: set[str] = set()
        for ch in self._channels.values():
            subs |= ch._subscribed
        return {
            "configured": self.is_configured,
            "connected": self.is_connected,
            "channels": {
                name: {"connected": ch.is_connected, "subscribed": sorted(ch._subscribed)}
                for name, ch in self._channels.items()
            },
            "subscribed_count": len(subs),
            "subscribed": sorted(subs),
            "lastError": self._last_error,
            "tickCount": len(self.ticks),
        }

    def get_tick(self, symbol: str) -> dict[str, Any] | None:
        return self.ticks.get(_normalise_symbol(symbol))

    def get_all_ticks(self) -> dict[str, dict[str, Any]]:
        return dict(self.ticks)

    # ── Lifecycle ────────────────────────────────────────────────────
    async def start(self) -> None:
        if not self.is_configured:
            logger.info("infoway_skipped: INFOWAY_API_KEY not set")
            return
        self._main_loop = asyncio.get_running_loop()
        for ch in self._channels.values():
            await ch.start()
        logger.info("infoway_started")

    async def stop(self) -> None:
        for ch in self._channels.values():
            await ch.stop()

    # ── Subscribe / unsubscribe (routes to the right channel) ────────
    async def subscribe(self, codes: list[str]) -> int:
        # Bucket symbols by channel, then forward.
        buckets: dict[str, list[str]] = {CHANNEL_CRYPTO: [], CHANNEL_COMMON: []}
        for raw in codes:
            c = _normalise_symbol(raw)
            if not c:
                continue
            buckets[_channel_for(c)].append(c)
        total = 0
        for channel, symbols in buckets.items():
            if symbols:
                total += await self._channels[channel].subscribe(symbols)
        return total

    async def unsubscribe(self, codes: list[str]) -> int:
        buckets: dict[str, list[str]] = {CHANNEL_CRYPTO: [], CHANNEL_COMMON: []}
        for raw in codes:
            c = _normalise_symbol(raw)
            if not c:
                continue
            buckets[_channel_for(c)].append(c)
        total = 0
        for channel, symbols in buckets.items():
            if symbols:
                total += await self._channels[channel].unsubscribe(symbols)
                for s in symbols:
                    self.ticks.pop(s, None)
                    self.depth.pop(s, None)
        return total

    # ── Frame dispatch (shared across channels) ──────────────────────
    def _dispatch(self, msg: dict[str, Any]) -> None:
        code = int(msg.get("code") or 0)
        if code != CMD_DEPTH_PUSH:
            # Login/heartbeat/ack frames — Infoway doesn't require explicit
            # auth past the URL apikey, so we just ignore non-tick frames.
            return

        data = msg.get("data") or {}
        sym = (data.get("s") or "").upper()
        if not sym:
            return

        # Infoway depth shape:
        #   a: [[ask_prices...], [ask_volumes...]]
        #   b: [[bid_prices...], [bid_volumes...]]
        # Each top-level array has exactly 2 inner arrays. Top of book is index 0.
        a = data.get("a") or [[], []]
        b = data.get("b") or [[], []]
        ask_prices = a[0] if len(a) > 0 else []
        ask_vols = a[1] if len(a) > 1 else []
        bid_prices = b[0] if len(b) > 0 else []
        bid_vols = b[1] if len(b) > 1 else []

        best_ask = _safe_float(ask_prices[0] if ask_prices else 0.0)
        best_bid = _safe_float(bid_prices[0] if bid_prices else 0.0)

        if best_bid > 0 and best_ask > 0:
            price = (best_bid + best_ask) / 2.0
        else:
            price = best_bid or best_ask
        if price <= 0:
            return  # malformed frame — don't pollute the cache

        # Rough running volume = sum of top-5 levels on both sides.
        book_vol = 0.0
        for v in list(ask_vols)[:5] + list(bid_vols)[:5]:
            book_vol += _safe_float(v)

        tick_time = int(_safe_float(data.get("t"), int(time.time() * 1000)))

        prev = self.ticks.get(sym) or {}
        prev_close = _safe_float(prev.get("close_24h") or prev.get("ltp") or price)
        change = price - prev_close
        change_pct = (change / prev_close * 100.0) if prev_close else 0.0

        self.ticks[sym] = {
            "symbol": sym,
            "ltp": price,
            "bid": best_bid,
            "ask": best_ask,
            "volume": book_vol or _safe_float(prev.get("volume")),
            "ts": tick_time,
            "close_24h": prev_close,
            "change": round(change, 6),
            "change_pct": round(change_pct, 4),
        }

        # Stash the book too — at most top-10 levels per side.
        bids_book = [
            {"price": _safe_float(p), "qty": _safe_float(v)}
            for p, v in zip(list(bid_prices)[:10], list(bid_vols)[:10])
        ]
        asks_book = [
            {"price": _safe_float(p), "qty": _safe_float(v)}
            for p, v in zip(list(ask_prices)[:10], list(ask_vols)[:10])
        ]
        if bids_book or asks_book:
            self.depth[sym] = {"bids": bids_book, "asks": asks_book, "ts": tick_time}

        # Publish to Redis so user-side WS clients can fan out.
        if self._main_loop is not None:
            try:
                asyncio.run_coroutine_threadsafe(
                    publish(f"infoway:tick:{sym}", self.ticks[sym]),
                    self._main_loop,
                )
            except Exception:
                pass


# Singleton
infoway = InfowayService()


def default_symbols() -> list[str]:
    """Merged set of forex + crypto + metals + energy defaults from settings,
    deduplicated and uppercased."""
    sources = [
        settings.INFOWAY_DEFAULT_CRYPTO or "",
        settings.INFOWAY_DEFAULT_FOREX or "",
        getattr(settings, "INFOWAY_DEFAULT_METALS", "") or "",
        getattr(settings, "INFOWAY_DEFAULT_ENERGY", "") or "",
    ]
    seen: set[str] = set()
    out: list[str] = []
    for src in sources:
        for s in src.split(","):
            t = s.strip().upper()
            if t and t not in seen:
                seen.add(t)
                out.append(t)
    return out


_ENERGY_NAMES = {
    "USOIL": "WTI Crude / USD",
    "UKOIL": "Brent Crude / USD",
    "BRENT": "Brent Crude / USD",
    "NATGAS": "Natural Gas / USD",
    "XBRUSD": "Brent Crude / USD",
    "XTIUSD": "WTI Crude / USD",
    "XNGUSD": "Natural Gas / USD",
}


def _classify_infoway_code(code: str) -> dict[str, Any]:
    """Map an Infoway code to local catalogue fields (segment, exchange,
    instrument_type, name). Heuristic — handles crypto, metals (XAU/XAG/
    XPT/XPD), energy (USOIL/UKOIL/NATGAS); anything else falls into FOREX."""
    c = (code or "").strip().upper()
    is_crypto = c.endswith("USDT") or c.endswith("USDC") or c.endswith("BUSD")
    is_metal = c.startswith(("XAU", "XAG", "XPT", "XPD"))
    is_energy = c in _ENERGY_NAMES
    if is_crypto:
        return {
            "segment": "CRYPTO_PERPETUAL",
            "exchange": "CRYPTO",
            "instrument_type": "PERP",
            "name": c.replace("USDT", "/USDT").replace("USDC", "/USDC").replace("BUSD", "/BUSD"),
        }
    if is_metal:
        return {
            "segment": "COMMODITIES",
            "exchange": "CDS",
            "instrument_type": "SPOT",
            "name": f"{c[:3]}/{c[3:] or 'USD'}",
        }
    if is_energy:
        return {
            "segment": "COMMODITIES",
            "exchange": "CDS",
            "instrument_type": "SPOT",
            "name": _ENERGY_NAMES[c],
        }
    return {
        "segment": "FOREX",
        "exchange": "CDS",
        "instrument_type": "SPOT",
        "name": f"{c[:3]}/{c[3:]}" if len(c) >= 6 else c,
    }


async def mirror_subscribed_to_instruments() -> int:
    """Idempotent: insert/update an `Instrument` row for every Infoway code
    we have subscribed to. User-side `/instruments/search` then finds
    forex/crypto/metals/energy symbols just like Indian instruments."""
    from bson import Decimal128

    from app.models._base import Exchange, InstrumentType
    from app.models.instrument import Instrument

    subs: set[str] = set()
    for ch in infoway._channels.values():
        subs |= ch._subscribed
    codes = sorted(subs)

    mirrored = 0
    for code in codes:
        meta = _classify_infoway_code(code)
        try:
            ex = Exchange(meta["exchange"])
        except ValueError:
            continue
        try:
            it = InstrumentType(meta["instrument_type"])
        except ValueError:
            it = InstrumentType.SPOT

        existing = await Instrument.find_one(Instrument.token == code)
        if existing is None:
            await Instrument(
                token=code,
                symbol=code,
                trading_symbol=code,
                name=meta["name"],
                exchange=ex,
                segment=meta["segment"],
                instrument_type=it,
                lot_size=1,
                tick_size=Decimal128("0.0001"),
                is_active=True,
                is_tradable=True,
            ).insert()
            mirrored += 1
        else:
            existing.exchange = ex
            existing.segment = meta["segment"]
            existing.instrument_type = it
            existing.is_active = True
            existing.is_tradable = True
            await existing.save()
    if mirrored:
        logger.info("infoway_mirror_done", extra={"count": mirrored})
    return mirrored
