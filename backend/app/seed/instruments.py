"""Seed a sensible Indian instrument set for development.

Includes:
  • 4 indices (NIFTY 50, BANK NIFTY, SENSEX, FIN NIFTY)
  • Top 30 NIFTY-50 stocks (cash equity)
  • A handful of MCX commodities
  • A few crypto symbols

Real-world deployment ingests the daily exchange contract files instead.
"""

from __future__ import annotations

import logging

from app.models._base import Exchange, InstrumentType
from app.models.instrument import Instrument

logger = logging.getLogger(__name__)


_NIFTY50_TOP_STOCKS = [
    ("RELIANCE", "Reliance Industries Ltd"),
    ("TCS", "Tata Consultancy Services Ltd"),
    ("HDFCBANK", "HDFC Bank Ltd"),
    ("INFY", "Infosys Ltd"),
    ("ICICIBANK", "ICICI Bank Ltd"),
    ("HINDUNILVR", "Hindustan Unilever Ltd"),
    ("ITC", "ITC Ltd"),
    ("LT", "Larsen & Toubro Ltd"),
    ("SBIN", "State Bank of India"),
    ("BHARTIARTL", "Bharti Airtel Ltd"),
    ("KOTAKBANK", "Kotak Mahindra Bank Ltd"),
    ("AXISBANK", "Axis Bank Ltd"),
    ("BAJFINANCE", "Bajaj Finance Ltd"),
    ("MARUTI", "Maruti Suzuki India Ltd"),
    ("ASIANPAINT", "Asian Paints Ltd"),
    ("HCLTECH", "HCL Technologies Ltd"),
    ("SUNPHARMA", "Sun Pharmaceutical Industries"),
    ("NTPC", "NTPC Ltd"),
    ("TITAN", "Titan Company Ltd"),
    ("ULTRACEMCO", "UltraTech Cement Ltd"),
    ("WIPRO", "Wipro Ltd"),
    ("NESTLEIND", "Nestle India Ltd"),
    ("POWERGRID", "Power Grid Corporation"),
    ("ONGC", "Oil & Natural Gas Corp"),
    ("COALINDIA", "Coal India Ltd"),
    ("ADANIENT", "Adani Enterprises Ltd"),
    ("M&M", "Mahindra & Mahindra Ltd"),
    ("TATAMOTORS", "Tata Motors Ltd"),
    ("BAJAJFINSV", "Bajaj Finserv Ltd"),
    ("JSWSTEEL", "JSW Steel Ltd"),
]

_INDICES = [
    ("NIFTY", "NIFTY 50", Exchange.NSE, InstrumentType.INDEX),
    ("BANKNIFTY", "BANK NIFTY", Exchange.NSE, InstrumentType.INDEX),
    ("SENSEX", "BSE SENSEX", Exchange.BSE, InstrumentType.INDEX),
    ("FINNIFTY", "FIN NIFTY", Exchange.NSE, InstrumentType.INDEX),
]

_MCX = [
    ("MCXGOLD", "Gold (1 kg)", 100),
    ("MCXSILVER", "Silver (30 kg)", 30),
    ("MCXCRUDE", "Crude Oil (100 bbl)", 100),
    ("MCXNATGAS", "Natural Gas (1250 mmBtu)", 1250),
    ("MCXCOPPER", "Copper (2.5 MT)", 2500),
]

_CRYPTO = [
    ("BTCUSD", "Bitcoin / USD"),
    ("ETHUSD", "Ethereum / USD"),
    ("SOLUSD", "Solana / USD"),
    ("XRPUSD", "Ripple / USD"),
    ("DOGEUSD", "Dogecoin / USD"),
    ("BNBUSD", "Binance Coin / USD"),
    ("ADAUSD", "Cardano / USD"),
    ("MATICUSD", "Polygon / USD"),
]

_FOREX = [
    ("EURUSD", "Euro / US Dollar"),
    ("GBPUSD", "Pound / US Dollar"),
    ("USDJPY", "US Dollar / Yen"),
    ("AUDUSD", "Aussie / US Dollar"),
    ("USDCAD", "US Dollar / Canadian Dollar"),
    ("USDCHF", "US Dollar / Swiss Franc"),
    ("NZDUSD", "Kiwi / US Dollar"),
    ("USDINR", "US Dollar / Indian Rupee"),
]


async def seed_instruments() -> None:
    existing = await Instrument.find_one()
    if existing is not None:
        # Bulk equity / index / MCX / crypto already seeded; ensure the
        # NIFTY option chain + forex/crypto rows exist (added later).
        await _seed_nifty_options_if_missing()
        await _seed_infoway_pairs_if_missing()
        logger.info("seed_instruments_skipped (already populated, extras ensured)")
        return

    docs: list[Instrument] = []
    for symbol, name in _NIFTY50_TOP_STOCKS:
        docs.append(
            Instrument(
                token=f"NSE_EQ_{symbol}",
                symbol=symbol,
                trading_symbol=f"{symbol}-EQ",
                name=name,
                exchange=Exchange.NSE,
                segment="NSE_EQUITY",
                instrument_type=InstrumentType.EQ,
                lot_size=1,
            )
        )

    for symbol, name, ex, it in _INDICES:
        docs.append(
            Instrument(
                token=f"{ex.value}_IDX_{symbol}",
                symbol=symbol,
                trading_symbol=symbol,
                name=name,
                exchange=ex,
                segment="NSE_EQUITY" if ex == Exchange.NSE else "BSE_EQUITY",
                instrument_type=it,
                lot_size=1,
                is_tradable=False,  # spot index — tradeable via futures/options
            )
        )

    for symbol, name, lot in _MCX:
        docs.append(
            Instrument(
                token=f"MCX_FUT_{symbol}",
                symbol=symbol,
                trading_symbol=symbol,
                name=name,
                exchange=Exchange.MCX,
                segment="MCX_FUTURE",
                instrument_type=InstrumentType.FUT,
                lot_size=lot,
            )
        )

    # ── Sample NIFTY option chain (strikes 24500–25100 step 100) ───
    # Real options come from Zerodha once admin connects; this seed gives
    # the option-chain UI something to render in dev.
    from datetime import date, timedelta
    from bson import Decimal128
    from app.models._base import OptionType

    expiry = date.today() + timedelta(days=14)
    strikes = list(range(24500, 25101, 100))
    for strike in strikes:
        for opt_type in ("CE", "PE"):
            sym = f"NIFTY{expiry.strftime('%y%b').upper()}{strike}{opt_type}"
            docs.append(
                Instrument(
                    token=f"NSE_OPT_NIFTY_{strike}_{opt_type}_{expiry.isoformat()}",
                    symbol=sym,
                    trading_symbol=sym,
                    name=f"NIFTY {expiry.strftime('%d %b %Y')} {strike} {opt_type}",
                    exchange=Exchange.NFO,
                    segment="NSE_INDEX_OPTION_BUY" if opt_type == "CE" else "NSE_INDEX_OPTION_SELL",
                    instrument_type=InstrumentType.CE if opt_type == "CE" else InstrumentType.PE,
                    lot_size=75,  # NIFTY post-Nov-2024 revision; backfill keeps this current
                    expiry=expiry,
                    strike=Decimal128(str(strike)),
                    option_type=OptionType.CE if opt_type == "CE" else OptionType.PE,
                    underlying_token="NSE_IDX_NIFTY",
                )
            )

    for symbol, name in _CRYPTO:
        docs.append(
            Instrument(
                token=f"CRYPTO_{symbol}",
                symbol=symbol,
                trading_symbol=symbol,
                name=name,
                exchange=Exchange.CRYPTO,
                segment="CRYPTO_SPOT",
                instrument_type=InstrumentType.SPOT,
                lot_size=1,
            )
        )

    for symbol, name in _FOREX:
        docs.append(
            Instrument(
                token=f"FX_{symbol}",
                symbol=symbol,
                trading_symbol=symbol,
                name=name,
                exchange=Exchange.CDS,
                segment="CDS_FUTURE",
                instrument_type=InstrumentType.SPOT,
                lot_size=1,
            )
        )

    if docs:
        await Instrument.insert_many(docs)
        logger.info("seed_instruments_done", extra={"count": len(docs)})


async def _seed_nifty_options_if_missing() -> None:
    """Idempotent option-chain seed — runs even when other instruments already
    exist, so dev DBs from before the option-chain feature pick up the rows."""
    from datetime import date, timedelta

    from bson import Decimal128

    from app.models._base import OptionType

    existing = await Instrument.find_one(Instrument.option_type == OptionType.CE)
    if existing is not None:
        return

    expiry = date.today() + timedelta(days=14)
    strikes = list(range(24500, 25101, 100))
    docs: list[Instrument] = []
    for strike in strikes:
        for opt_type in ("CE", "PE"):
            sym = f"NIFTY{expiry.strftime('%y%b').upper()}{strike}{opt_type}"
            docs.append(
                Instrument(
                    token=f"NSE_OPT_NIFTY_{strike}_{opt_type}_{expiry.isoformat()}",
                    symbol=sym,
                    trading_symbol=sym,
                    name=f"NIFTY {expiry.strftime('%d %b %Y')} {strike} {opt_type}",
                    exchange=Exchange.NFO,
                    segment="NSE_INDEX_OPTION_BUY" if opt_type == "CE" else "NSE_INDEX_OPTION_SELL",
                    instrument_type=InstrumentType.CE if opt_type == "CE" else InstrumentType.PE,
                    lot_size=75,  # NIFTY post-Nov-2024 revision; backfill keeps this current
                    expiry=expiry,
                    strike=Decimal128(str(strike)),
                    option_type=OptionType.CE if opt_type == "CE" else OptionType.PE,
                    underlying_token="NSE_IDX_NIFTY",
                )
            )
    if docs:
        await Instrument.insert_many(docs)
        logger.info("seeded_nifty_options", extra={"count": len(docs)})


async def backfill_index_lot_sizes() -> int:
    """Idempotent — walk every Instrument row and self-heal two things:

    1) `instrument_type` — Zerodha admin-subscribe payloads sometimes omit
       the instrumentType field and we'd persist the row as EQ even though
       the tradingsymbol is clearly a derivative (e.g. `GOLD26JUNFUT`).
       That mis-type then prevents the canonical-lot lookup from running.
    2) `lot_size` — rewrite to the canonical exchange value when the
       symbol matches a known index (NIFTY/BANKNIFTY/SENSEX/FINNIFTY/
       MIDCPNIFTY/BANKEX) or a known MCX commodity (GOLD/SILVER/
       CRUDEOIL/NATURALGAS/COPPER/ZINC/LEAD/ALUMINIUM/NICKEL/MENTHAOIL/
       COTTON/CARDAMOM/KAPAS — including MINI/MIC variants).

    Returns the number of rows updated. Safe to run on every startup.
    """
    from app.models._base import InstrumentType, OptionType
    from app.services.index_lots import get_canonical_lot_size
    from app.services.instrument_service import (
        display_name,
        infer_instrument_type_from_symbol,
    )

    # First pass: heal misclassified derivatives sitting in the EQ bucket.
    # Scope by symbol suffix (FUT / digit+CE / digit+PE) so we don't touch
    # legitimate equity rows.
    misclassified = 0
    eq_rows = await Instrument.find(
        {
            "instrument_type": InstrumentType.EQ.value,
            "$or": [
                {"symbol": {"$regex": "FUT$"}},
                {"symbol": {"$regex": "[0-9]CE$"}},
                {"symbol": {"$regex": "[0-9]PE$"}},
            ],
        }
    ).to_list()
    for inst in eq_rows:
        inferred = infer_instrument_type_from_symbol(inst.symbol)
        if inferred not in ("FUT", "CE", "PE"):
            continue
        inst.instrument_type = InstrumentType(inferred)
        if inferred == "CE":
            inst.option_type = OptionType.CE
        elif inferred == "PE":
            inst.option_type = OptionType.PE
        # Recompute the friendly name now that we know the real type.
        inst.name = display_name(
            instrument_type=inst.instrument_type,
            underlying=(inst.name or inst.symbol).split(" ")[0],
            expiry=inst.expiry,
            strike=inst.strike,
        )
        # Patch segment from "<EX>_EQUITY" → "<EX>_FUTURE" / "<EX>_OPTION"
        ex_val = inst.exchange.value if hasattr(inst.exchange, "value") else str(inst.exchange)
        if inferred == "FUT":
            inst.segment = f"{ex_val}_FUTURE"
        else:
            inst.segment = f"{ex_val}_OPTION"
        try:
            await inst.save()
            misclassified += 1
        except Exception:
            logger.exception("backfill_type_save_failed", extra={"token": inst.token})

    # Second pass: rewrite lot_size to the canonical value across every
    # derivative row (including the ones we just reclassified).
    fixed = 0
    rows = await Instrument.find(
        {"instrument_type": {"$in": [InstrumentType.CE.value, InstrumentType.PE.value, InstrumentType.FUT.value]}}
    ).to_list()
    for inst in rows:
        ex_val = inst.exchange.value if hasattr(inst.exchange, "value") else str(inst.exchange)
        canonical = get_canonical_lot_size(inst.symbol, inst.name, exchange=ex_val)
        if canonical is None:
            continue
        if int(inst.lot_size or 0) == canonical:
            continue
        inst.lot_size = canonical
        try:
            await inst.save()
            fixed += 1
        except Exception:
            logger.exception("backfill_lot_save_failed", extra={"token": inst.token})

    if misclassified or fixed:
        logger.info(
            "backfilled_canonical_lot_sizes",
            extra={"types_fixed": misclassified, "lots_fixed": fixed},
        )
    return misclassified + fixed


async def _seed_infoway_pairs_if_missing() -> None:
    """Ensure forex + USD-quoted crypto pairs exist. Pre-existing INR-quoted
    crypto rows (BTCINR etc.) were replaced by USD pairs once we wired Infoway;
    this helper backfills idempotently."""
    docs: list[Instrument] = []

    # Crypto (USD)
    for symbol, name in _CRYPTO:
        token = f"CRYPTO_{symbol}"
        existing = await Instrument.find_one(Instrument.token == token)
        if existing is not None:
            continue
        docs.append(
            Instrument(
                token=token,
                symbol=symbol,
                trading_symbol=symbol,
                name=name,
                exchange=Exchange.CRYPTO,
                segment="CRYPTO_SPOT",
                instrument_type=InstrumentType.SPOT,
                lot_size=1,
            )
        )

    # Forex
    for symbol, name in _FOREX:
        token = f"FX_{symbol}"
        existing = await Instrument.find_one(Instrument.token == token)
        if existing is not None:
            continue
        docs.append(
            Instrument(
                token=token,
                symbol=symbol,
                trading_symbol=symbol,
                name=name,
                exchange=Exchange.CDS,
                segment="CDS_FUTURE",
                instrument_type=InstrumentType.SPOT,
                lot_size=1,
            )
        )

    if docs:
        await Instrument.insert_many(docs)
        logger.info("seeded_infoway_pairs", extra={"count": len(docs)})
