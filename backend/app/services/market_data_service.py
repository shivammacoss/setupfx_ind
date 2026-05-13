"""Mock market-data service.

Phase 1 ships a deterministic random-walk LTP generator so the entire trading
flow (validator, matching, position P&L, charts) can be tested without an
external feed. Phase 3 will swap this for an Angel One / Zerodha provider.

The service exposes:
    • get_ltp(token) → current price (Decimal)
    • get_quote(token) → full {ltp, bid, ask, high, low, open, prev_close, volume, change, change_pct, depth}
    • subscribe(tokens) / unsubscribe(tokens) — simple in-memory tracking
    • a background tick loop that publishes ticks to Redis pub/sub channel
      `market:tick` and `market:tick:{token}` for WS fanout.
"""

from __future__ import annotations

import asyncio
import logging
import random
from decimal import Decimal
from typing import Any

from app.core.redis_client import publish
from app.models._base import Exchange
from app.models.instrument import Instrument
from app.utils.decimal_utils import quantize_money, to_decimal

logger = logging.getLogger(__name__)

# In-memory state: token → quote dict
_state: dict[str, dict[str, Any]] = {}
_subscribed: set[str] = set()
_running: bool = False


def _seed_quote(token: str, base_price: float = 1000.0) -> dict[str, Any]:
    open_p = round(base_price * random.uniform(0.97, 1.03), 2)
    ltp = round(open_p * random.uniform(0.99, 1.01), 2)
    high = round(max(open_p, ltp) * random.uniform(1.0, 1.02), 2)
    low = round(min(open_p, ltp) * random.uniform(0.98, 1.0), 2)
    prev_close = round(base_price, 2)
    return {
        "token": token,
        "ltp": ltp,
        "open": open_p,
        "high": high,
        "low": low,
        "prev_close": prev_close,
        "change": round(ltp - prev_close, 2),
        "change_pct": round(((ltp - prev_close) / prev_close) * 100, 2),
        "volume": random.randint(10_000, 5_000_000),
        "bid": round(ltp - 0.05, 2),
        "ask": round(ltp + 0.05, 2),
        "depth": _generate_depth(ltp),
        "ts": 0,
    }


def _generate_depth(ltp: float) -> dict[str, list[dict[str, Any]]]:
    bids = []
    asks = []
    for i in range(5):
        bids.append({"price": round(ltp - 0.05 * (i + 1), 2), "qty": random.randint(50, 5000), "orders": random.randint(1, 50)})
        asks.append({"price": round(ltp + 0.05 * (i + 1), 2), "qty": random.randint(50, 5000), "orders": random.randint(1, 50)})
    return {"bids": bids, "asks": asks}


def _step_quote(q: dict[str, Any]) -> dict[str, Any]:
    """Random-walk LTP, refresh derived fields."""
    ltp = q["ltp"]
    drift = ltp * random.uniform(-0.0015, 0.0015)
    new_ltp = round(max(0.05, ltp + drift), 2)
    q["ltp"] = new_ltp
    q["high"] = max(q["high"], new_ltp)
    q["low"] = min(q["low"], new_ltp)
    q["change"] = round(new_ltp - q["prev_close"], 2)
    q["change_pct"] = round((q["change"] / q["prev_close"]) * 100, 2) if q["prev_close"] else 0.0
    q["volume"] = q["volume"] + random.randint(0, 5000)
    q["bid"] = round(new_ltp - 0.05, 2)
    q["ask"] = round(new_ltp + 0.05, 2)
    q["depth"] = _generate_depth(new_ltp)
    return q


async def _ensure_quote(token: str) -> dict[str, Any]:
    if token in _state:
        return _state[token]
    # If instrument exists in DB, derive a sensible base price by exchange/segment
    instr = await Instrument.find_one(Instrument.token == token)
    base = 1000.0
    if instr is not None:
        if instr.exchange == Exchange.MCX:
            base = random.uniform(40_000, 75_000)
        elif "OPTION" in (instr.segment or "") or "OPT" in (instr.segment or ""):
            base = random.uniform(50, 800)
        elif "FUTURE" in (instr.segment or "") or "FUT" in (instr.segment or ""):
            base = random.uniform(500, 50_000)
        elif "CRYPTO" in (instr.segment or ""):
            base = random.uniform(20, 100_000)
    _state[token] = _seed_quote(token, base)
    return _state[token]


async def _zerodha_overlay(token: str, base_quote: dict[str, Any]) -> dict[str, Any]:
    """If Zerodha is streaming this instrument, replace the mock LTP / bid /
    ask / OHLC / volume / depth with live exchange data. Falls through silently
    on any error so the UI stays usable in dev."""
    try:
        from app.services.zerodha_service import zerodha

        # 1) Direct token lookup — mirrored Zerodha subscriptions store the
        #    Kite instrument_token as Instrument.token, so this is the fast path.
        live: dict[str, Any] | None = None
        try:
            live = zerodha.ticks_by_token.get(int(token))
        except (TypeError, ValueError):
            live = None

        # 2) Resolve symbol + exchange so we can hit symbol cache and REST fallback.
        instr = None
        sym: str | None = None
        ex_str: str | None = None
        if live is None:
            instr = await Instrument.find_one(Instrument.token == token)
            if instr is not None and instr.symbol:
                sym = instr.symbol
                ex_attr = getattr(instr, "exchange", None)
                if ex_attr is not None:
                    ex_str = ex_attr.value if hasattr(ex_attr, "value") else str(ex_attr)

            # If the local Instrument is missing (option contracts subscribed
            # before mirror existed, etc.), look the same token up in the
            # Zerodha subscribed list — it carries symbol + exchange too.
            if sym is None:
                from app.models.zerodha_settings import ZerodhaSettings

                zsettings = await ZerodhaSettings.find_one()
                if zsettings is not None:
                    try:
                        token_int = int(token)
                    except (TypeError, ValueError):
                        token_int = None
                    sub = None
                    if token_int is not None:
                        sub = next((i for i in zsettings.subscribedInstruments if i.token == token_int), None)
                    if sub is None:
                        sub = next(
                            (i for i in zsettings.subscribedInstruments if str(i.token) == token),
                            None,
                        )
                    if sub is not None:
                        sym = sub.symbol
                        ex_str = sub.exchange

            # Last-resort lookup: scan the Zerodha in-memory instruments
            # cache itself. This unlocks live data for EVERY Kite-listed
            # symbol the user can see in the instruments panel — without
            # needing an explicit admin subscribe or a MongoDB mirror. The
            # cache is keyed per exchange and is warmed at startup, so the
            # scan is in-process and fast. With sym + ex_str resolved here,
            # `get_quote_snapshot` (REST) and `subscribe_tokens_on_demand`
            # (WS) downstream do the rest.
            if sym is None:
                try:
                    token_int = int(token)
                except (TypeError, ValueError):
                    token_int = None
                if token_int is not None:
                    for ex_key, cache in zerodha._instruments_cache.items():
                        match = next(
                            (r for r in cache if int(r.get("token") or 0) == token_int),
                            None,
                        )
                        if match is not None:
                            sym = match.get("symbol")
                            ex_str = (match.get("exchange") or ex_key).upper()
                            break

        # 3) Symbol-keyed live tick (covers seeded NSE_EQ_RELIANCE-style tokens
        #    where the local token is text but the live tick is keyed by symbol).
        if live is None and sym:
            live = zerodha.ticks_by_symbol.get(sym)

        # 4) REST `/quote` fallback — when the ticker has no recent push for
        #    this instrument (weekends, pre-open, fresh subscribe before the
        #    first tick arrives) we still want real exchange data, not mock.
        if not live and sym and ex_str:
            snap = await zerodha.get_quote_snapshot(ex_str, sym)
            if snap:
                live = snap

        if not live:
            return base_quote

        merged = dict(base_quote)
        merged["ltp"] = live.get("ltp", merged["ltp"])
        merged["open"] = live.get("open", merged["open"])
        merged["high"] = live.get("high", merged["high"])
        merged["low"] = live.get("low", merged["low"])
        merged["prev_close"] = live.get("close", merged["prev_close"])
        merged["volume"] = live.get("volume", merged["volume"])

        # 5-level depth — Kite ticks expose depth.buy/depth.sell when
        # subscribed in MODE_FULL. Translate to our schema (bids/asks) and
        # ALSO derive top-of-book bid/ask from it.
        depth = live.get("depth")
        best_bid_from_depth: float | None = None
        best_ask_from_depth: float | None = None
        if isinstance(depth, dict):
            bids = depth.get("buy") or []
            asks = depth.get("sell") or []
            if bids or asks:
                merged["depth"] = {
                    "bids": [
                        {
                            "price": float(b.get("price") or 0),
                            "qty": int(b.get("quantity") or 0),
                            "orders": int(b.get("orders") or 0),
                        }
                        for b in bids[:5]
                    ],
                    "asks": [
                        {
                            "price": float(a.get("price") or 0),
                            "qty": int(a.get("quantity") or 0),
                            "orders": int(a.get("orders") or 0),
                        }
                        for a in asks[:5]
                    ],
                }
                try:
                    if bids and float(bids[0].get("price") or 0) > 0:
                        best_bid_from_depth = float(bids[0]["price"])
                    if asks and float(asks[0].get("price") or 0) > 0:
                        best_ask_from_depth = float(asks[0]["price"])
                except (TypeError, ValueError, KeyError):
                    pass

        # Bid / ask resolution order:
        #   1. Explicit `live.bid` / `live.ask` (rare for Kite — only set
        #      by REST snapshot or some MODE_FULL pushes)
        #   2. Top of Kite depth book (MODE_FULL ticks)
        #   3. Synthesised micro-spread around the real LTP — used when
        #      we're streaming in MODE_QUOTE (no depth) so we never let
        #      the mock random-walk's ₹1000-ish bid leak through.
        live_bid = float(live.get("bid") or 0)
        live_ask = float(live.get("ask") or 0)
        ltp_f = float(merged.get("ltp") or 0)
        if live_bid > 0:
            merged["bid"] = live_bid
        elif best_bid_from_depth and best_bid_from_depth > 0:
            merged["bid"] = best_bid_from_depth
        elif ltp_f > 0:
            spread = max(0.05, round(ltp_f * 0.0002, 4))
            merged["bid"] = round(ltp_f - spread, 4)
        if live_ask > 0:
            merged["ask"] = live_ask
        elif best_ask_from_depth and best_ask_from_depth > 0:
            merged["ask"] = best_ask_from_depth
        elif ltp_f > 0:
            spread = max(0.05, round(ltp_f * 0.0002, 4))
            merged["ask"] = round(ltp_f + spread, 4)

        if merged["prev_close"]:
            merged["change"] = round(merged["ltp"] - merged["prev_close"], 2)
            merged["change_pct"] = round((merged["change"] / merged["prev_close"]) * 100, 2)
        merged["source"] = "zerodha"
        return merged
    except Exception:
        return base_quote


async def _infoway_overlay(token: str, base_quote: dict[str, Any]) -> dict[str, Any]:
    """Overlay live Infoway tick (forex / crypto / metals / energy). Infoway
    is keyed by SYMBOL (BTCUSDT, EURUSD, XAUUSD…); we resolve via the
    Instrument doc.

    Don't gate on `infoway.is_connected` — that property reaches into the
    websockets client object whose API changed between library versions and
    can throw / return False even while ticks are still in the cache. The
    cache itself is the source of truth: if there's a fresh tick keyed by
    this symbol, use it.
    """
    try:
        from app.services.infoway_service import infoway

        instr = await Instrument.find_one(Instrument.token == token)
        if instr is None or not instr.symbol:
            return base_quote
        sym = instr.symbol.upper()
        live = infoway.get_tick(sym) or infoway.get_tick(sym + "T")
        if not live:
            return base_quote
        ltp = float(live.get("ltp") or 0)
        if ltp <= 0:
            return base_quote
        merged = dict(base_quote)
        merged["ltp"] = ltp
        # Prefer real best-bid / best-ask from Infoway depth book — fallback to
        # synthesised micro-spread when only a flat tick is available.
        live_bid = float(live.get("bid") or 0)
        live_ask = float(live.get("ask") or 0)
        if live_bid > 0 and live_ask > 0:
            merged["bid"] = live_bid
            merged["ask"] = live_ask
        else:
            spread = max(0.0001, round(ltp * 0.0002, 6))
            merged["bid"] = round(ltp - spread, 6)
            merged["ask"] = round(ltp + spread, 6)
        merged["volume"] = float(live.get("volume") or merged.get("volume") or 0)
        if live.get("close_24h"):
            merged["prev_close"] = float(live["close_24h"])
        merged["change"] = float(live.get("change") or merged.get("change") or 0)
        merged["change_pct"] = float(live.get("change_pct") or merged.get("change_pct") or 0)
        # Overlay real depth too if Infoway has a book for this symbol
        depth = infoway.depth.get(sym) or infoway.depth.get(sym + "T")
        if depth and depth.get("bids") and depth.get("asks"):
            merged["depth"] = {"bids": depth["bids"], "asks": depth["asks"]}
        merged["source"] = "infoway"
        # USD/INR snapshot so the frontend can show margin in real INR
        # rather than displaying the USD number with a ₹ symbol (which is
        # how users end up trying to place orders worth 80× their wallet).
        merged["fx_rate"] = get_usd_inr_rate()
        return merged
    except Exception:
        logger.exception("infoway_overlay_failed token=%s", token)
        return base_quote


async def _overlay_all(token: str, base: dict[str, Any]) -> dict[str, Any]:
    """Apply Infoway first (forex/crypto/metals/energy), then Zerodha (Indian).
    Whichever provider has live data wins.

    Both overlays may hit external services — Infoway reads from a local
    in-memory tick map (fast) but the Zerodha fallback issues a Kite REST
    `/quote` call that can stall when Kite is slow / TCP RST'd. We hard-cap
    each overlay at 2 seconds so a hung external service can NEVER freeze
    callers like `order_service.place_order` → `matching_engine.execute_market_order`
    → `get_ltp`. On timeout the overlay falls back to the cached base quote
    (mock or last-known) so the order still goes through.

    After both feed overlays run, the admin's per-segment spread (Fixed /
    Floating + spread_pips) is applied as the final pass. This is the
    "money changer" markup — bid moves down half-spread, ask moves up
    half-spread, around the live LTP. Cached resolution per
    `(segment, symbol)` for 30 s so the 250 ms WS pump doesn't go to
    Mongo on every tick.
    """
    try:
        after_infoway = await asyncio.wait_for(_infoway_overlay(token, base), timeout=2.0)
    except asyncio.TimeoutError:
        logger.warning("infoway_overlay_timeout", extra={"token": token})
        after_infoway = base
    except Exception:
        logger.exception("infoway_overlay_failed", extra={"token": token})
        after_infoway = base
    if after_infoway.get("source") == "infoway":
        return await _apply_admin_spread(token, after_infoway)
    try:
        zerodha_quote = await asyncio.wait_for(_zerodha_overlay(token, base), timeout=2.0)
    except asyncio.TimeoutError:
        logger.warning("zerodha_overlay_timeout", extra={"token": token})
        zerodha_quote = base
    except Exception:
        logger.exception("zerodha_overlay_failed", extra={"token": token})
        zerodha_quote = base
    return await _apply_admin_spread(token, zerodha_quote)


# Token → segment cache so the spread step doesn't re-fetch the Instrument
# doc on every tick. Segment is essentially immutable for a token (changes
# only via admin edit), so a 5-min TTL is plenty. Misses fall through to
# Mongo and re-cache. Falsy values aren't cached (an instrument that doesn't
# exist yet might be mirrored on the next call).
_SEGMENT_FOR_TOKEN_TTL = 300
_SEGMENT_FOR_TOKEN_PREFIX = "spread_seg:"


async def _segment_for_token(token: str) -> tuple[str, str] | None:
    """Return `(segment_type, symbol_upper)` for a token, or None if the
    instrument isn't in our collection."""
    cache_key = f"{_SEGMENT_FOR_TOKEN_PREFIX}{token}"
    try:
        from app.core.redis_client import cache_get, cache_set

        cached = await cache_get(cache_key)
        if cached is not None:
            return (cached.get("seg") or "", cached.get("sym") or "")
    except Exception:
        cache_set = None  # type: ignore[assignment]

    instr = await Instrument.find_one(Instrument.token == token)
    if instr is None:
        return None
    seg_value = getattr(instr.segment, "value", instr.segment)
    sym = (instr.symbol or "").upper()
    payload = {"seg": str(seg_value), "sym": sym}
    try:
        if cache_set is not None:
            await cache_set(cache_key, payload, ttl_sec=_SEGMENT_FOR_TOKEN_TTL)
    except Exception:
        pass
    return (str(seg_value), sym)


async def _apply_admin_spread(token: str, quote: dict[str, Any]) -> dict[str, Any]:
    """Final overlay: apply the admin-configured spread to the live quote.

    Fixed mode  → bid = ltp − pips/2, ask = ltp + pips/2 every tick. The
                  exchange spread is ignored entirely (broker-set markup).
    Floating    → keep the live (ask − bid), but widen symmetrically around
                  ltp when it falls below `spread_pips`. Implements the
                  "real spread, but never less than minimum" rule.

    `spread_pips` is interpreted as PRICE UNITS for that instrument (admin
    sees the same units they'd see on the chart — 0.0002 for EURUSD,
    0.50 for XAUUSD, 5 for NIFTY). Zero or negative → no spread mod.

    Skipped when `spread_pips <= 0` so admin can opt out by leaving the
    field blank.
    """
    try:
        ltp = float(quote.get("ltp") or 0)
        if ltp <= 0:
            return quote

        seg_sym = await _segment_for_token(token)
        if seg_sym is None:
            return quote
        seg_type, symbol = seg_sym

        # Translate instrument segment → admin row name (NSE_EQ / FOREX /
        # CRYPTO / …) the way the rest of the resolver stack does.
        from app.services.netting_service import _SEGMENT_NAME_MAP, resolve_spread

        admin_row = _SEGMENT_NAME_MAP.get(seg_type, seg_type)
        cfg = await resolve_spread(admin_row, symbol)
        pips = float(cfg.get("spread_pips") or 0)
        if pips <= 0:
            return quote
        mode = str(cfg.get("spread_type") or "fixed").lower()

        half = pips / 2.0
        live_bid = float(quote.get("bid") or 0)
        live_ask = float(quote.get("ask") or 0)
        live_spread = (live_ask - live_bid) if (live_bid > 0 and live_ask > 0) else 0.0

        if mode == "fixed":
            merged = dict(quote)
            merged["bid"] = ltp - half
            merged["ask"] = ltp + half
            return merged

        # Floating: keep market spread until it's tighter than the minimum,
        # then widen to the minimum around the LTP midpoint.
        if live_spread < pips:
            merged = dict(quote)
            merged["bid"] = ltp - half
            merged["ask"] = ltp + half
            return merged
        return quote
    except Exception:
        logger.exception("admin_spread_overlay_failed", extra={"token": token})
        return quote


# ── USD → INR conversion (forex / crypto P&L is reported in INR) ─────
USD_INR_FALLBACK = 83.0  # used only if Infoway hasn't pushed a USDINR tick yet


def get_usd_inr_rate() -> float:
    """Live USD/INR conversion rate. Infoway subscribes to USDINR by default,
    so this is the rate at which crypto / forex P&L gets translated for
    Indian wallets. Falls back to a sensible constant on a cold start."""
    try:
        from app.services.infoway_service import infoway

        for sym in ("USDINR", "USDINR=X", "USD/INR"):
            tick = infoway.get_tick(sym)
            if tick:
                ltp = float(tick.get("ltp") or 0)
                if ltp > 0:
                    return ltp
    except Exception:  # noqa: BLE001
        pass
    return USD_INR_FALLBACK


def is_usd_quoted_segment(segment: str | None) -> bool:
    """The source feed for crypto, forex, spot metals (XAUUSD/XAGUSD…) and
    energy (USOIL/UKOIL/NATGAS) quotes prices in USD; everything else
    (NSE / BSE / MCX / NFO / BFO) is already INR.

    Note: Indian MCX commodities use segment `MCX_FUTURE` — they hit the
    `MCX` branch (priced in INR), NOT the `COMMODITIES` branch here.
    `COMMODITIES` is reserved for Infoway-mirrored spot metals/energy
    which are USD-quoted internationally.
    """
    s = (segment or "").upper()
    # Two name patterns count here:
    #   1. Exact admin-row names from the Infoway-fed segment matrix —
    #      STOCKS / INDICES (international equities + indices, priced in USD
    #      by Infoway).
    #   2. Substring matches for everything else (CRYPTO / FOREX / FX / CDS /
    #      COMMODITIES). The CDS substring also catches Indian currency
    #      derivatives, which is correct — they settle in INR but quote
    #      the cross in USD terms so the wallet still needs the conversion.
    if s in ("STOCKS", "INDICES"):
        return True
    return (
        "CRYPTO" in s
        or "FOREX" in s
        or "FX" in s
        or "CDS" in s  # currency derivatives
        or "COMMODITIES" in s  # Infoway spot metals (XAU/XAG/XPT) + energy (USOIL/UKOIL/NATGAS)
    )


# Short in-process overlay cache (token → (timestamp_ms, payload)). The
# overlay pipeline blocks on Zerodha + Infoway sequentially with a 2 s
# timeout each — when the chart datafeed, the OrderPanel, the
# MobileQuickTradeBar, and the positions overlay all call get_quote for
# the same token within ~500 ms, the user paid for that overlay 4 times.
# A 700 ms TTL is short enough that a stale price never lingers visibly
# (the WS pump runs every 1 s anyway) but kills the duplicate-fanout cost.
import time as _t

_QUOTE_CACHE_TTL_MS = 700
_quote_cache: dict[str, tuple[int, dict[str, Any]]] = {}


async def get_quote(token: str) -> dict[str, Any]:
    now_ms = int(_t.time() * 1000)
    cached = _quote_cache.get(token)
    if cached and (now_ms - cached[0]) < _QUOTE_CACHE_TTL_MS:
        return cached[1]
    q = await _ensure_quote(token)
    out = await _overlay_all(token, q)
    _quote_cache[token] = (now_ms, out)
    return out


async def get_ltp(token: str) -> Decimal:
    q = await get_quote(token)
    return quantize_money(to_decimal(q["ltp"]))


async def get_quotes(tokens: list[str]) -> list[dict[str, Any]]:
    # Previously this looped serially — each token's `_overlay_all` blocked
    # on Zerodha + Infoway timeouts (~2 s each) BEFORE moving to the next
    # token. With 5 instruments on the OrderPanel that was a ~10 s worst-
    # case for a single batch request. asyncio.gather fans them out in
    # parallel so the total wait drops to the slowest single overlay.
    async def _one(t: str) -> dict[str, Any]:
        q = await _ensure_quote(t)
        return await _overlay_all(t, q)

    return list(await asyncio.gather(*[_one(t) for t in tokens]))


def subscribe(tokens: list[str]) -> None:
    _subscribed.update(tokens)


def unsubscribe(tokens: list[str]) -> None:
    for t in tokens:
        _subscribed.discard(t)


# ── Background tick loop ────────────────────────────────────────────
async def tick_loop(interval_sec: float = 1.0) -> None:
    """Publishes price ticks to Redis pub/sub. Started by FastAPI lifespan."""
    global _running
    if _running:
        return
    _running = True
    logger.info("market_tick_loop_started")
    try:
        import time

        while _running:
            try:
                # Step every state token (subscribed or not — keep cache fresh)
                for token, q in list(_state.items()):
                    _step_quote(q)
                    q["ts"] = int(time.time() * 1000)
                    if token in _subscribed:
                        await publish(
                            f"market:tick:{token}",
                            {
                                "token": token,
                                "ltp": q["ltp"],
                                "change": q["change"],
                                "change_pct": q["change_pct"],
                                "volume": q["volume"],
                                "bid": q["bid"],
                                "ask": q["ask"],
                                "ts": q["ts"],
                            },
                        )
                await asyncio.sleep(interval_sec)
            except Exception as e:  # pragma: no cover
                logger.exception("market_tick_loop_iter_failed", extra={"error": str(e)})
                await asyncio.sleep(2.0)
    finally:
        _running = False
        logger.info("market_tick_loop_stopped")


def stop_tick_loop() -> None:
    global _running
    _running = False
