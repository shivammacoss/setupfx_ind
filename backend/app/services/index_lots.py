"""Canonical lot sizes for Indian index F&O contracts.

NSE / BSE revise these every few quarters. Keep this list in sync with the
current exchange contract specs. We use them in two places:

  • Auto-create of an Instrument from the Zerodha cache, when the CSV row
    is missing / has lotSize=0 (happens for fresh contracts before the
    cache is fully populated).
  • A startup backfill that corrects any rows already saved with the
    wrong value (e.g. seeded as 50 back when NIFTY's lot was 50, before
    the Nov-2024 revision to 75).

Order in INDEX_LOT_SIZES matters: longer prefixes first so "MIDCPNIFTY..."
doesn't get matched as plain "NIFTY", "BANKNIFTY..." doesn't match as
"NIFTY", and so on.
"""

from __future__ import annotations

INDEX_LOT_SIZES: list[tuple[str, int]] = [
    ("MIDCPNIFTY", 120),
    ("FINNIFTY", 65),
    ("NIFTYNXT50", 25),
    ("BANKNIFTY", 35),
    ("BANKEX", 30),
    ("SENSEX50", 25),
    ("SENSEX", 20),
    ("NIFTY", 75),
]


# ── MCX commodity lot sizes ──────────────────────────────────────────
# Zerodha's instruments CSV reports MCX lot_size in *raw units* (kg, g, mmBtu,
# barrels) which does not match how the rest of the platform multiplies into
# notional (`quantity = lots × lot_size`, where lot_size is the price-quote
# multiplier). This table is the source of truth and overrides the CSV for
# every MCX FUT / CE / PE. Same table is used for options because MCX option
# contract sizes mirror the underlying future.
#
# Order matters — longer prefixes first so "GOLDPETAL" doesn't match "GOLD",
# "SILVERMIC" doesn't match "SILVER", "CRUDEOILM" doesn't match "CRUDEOIL".
# Values reviewed against MCX contract specs (current revision). When the
# exchange revises a contract size, update this table — the running
# /admin/instruments/repair-index-lots endpoint will rewrite stale rows.
MCX_LOT_SIZES: list[tuple[str, int]] = [
    # Gold family
    ("GOLDPETAL", 1),
    ("GOLDGUINEA", 1),
    ("GOLDM", 10),
    ("GOLD", 100),
    # Silver family
    ("SILVERMIC", 1),
    ("SILVERM", 5),
    ("SILVER", 30),
    # Crude oil
    ("CRUDEOILM", 10),
    ("CRUDEOIL", 100),
    # Natural gas
    ("NATURALGASMINI", 250),
    ("NATGASMINI", 250),
    ("NATURALGAS", 1250),
    ("NATGAS", 1250),
    # Base metals
    ("ZINCMINI", 1000),
    ("ZINC", 5000),
    ("LEADMINI", 1000),
    ("LEAD", 5000),
    ("ALUMINI", 1000),
    ("ALUMINIUM", 5000),
    ("NICKELM", 250),
    ("NICKEL", 1500),
    ("COPPER", 2500),
    # Soft commodities
    ("MENTHAOIL", 360),
    ("COTTON", 25),
    ("CARDAMOM", 100),
    ("KAPAS", 200),
]


def _match_prefix(table: list[tuple[str, int]], *candidates: str | None) -> int | None:
    for raw in candidates:
        if not raw:
            continue
        s = raw.upper().replace(" ", "")
        for prefix, lot in table:
            if s.startswith(prefix):
                return lot
    return None


def get_index_lot_size(*candidates: str | None) -> int | None:
    """Return the canonical lot size for the first candidate whose
    normalised form starts with a known index prefix. Returns None when
    nothing matches — caller should keep whatever lot size it already has.
    """
    return _match_prefix(INDEX_LOT_SIZES, *candidates)


def get_mcx_lot_size(*candidates: str | None) -> int | None:
    """Return the canonical MCX commodity lot size, or None on no match."""
    return _match_prefix(MCX_LOT_SIZES, *candidates)


def get_canonical_lot_size(
    *candidates: str | None,
    exchange: str | None = None,
    instrument_type: str | None = None,
) -> int | None:
    """Unified canonical-lot lookup.

    Source of truth depends on the exchange:

    • **MCX** — Zerodha's CSV reports lot_size in *raw units* (kg, g,
      mmBtu, barrels) which doesn't match our `qty = lots × lot_size`
      semantics, so the platform owns the MCX table. The exchange
      revises these very rarely; the table is the canonical source.

    • **NSE / BSE F&O (NFO / BFO)** — return ``None`` here so the caller
      uses the **live Zerodha CSV** `lotSize`. The exchange revises
      these every quarter (NIFTY 50/75, BANKNIFTY 30/35, FINNIFTY 40/65,
      …) and the CSV is refreshed on every backend boot, so it's the
      freshest source. The legacy INDEX_LOT_SIZES table is no longer
      consulted for these exchanges.

    • **EQ / INDEX spot** — return ``None``; equity trades 1 share = 1
      lot regardless of any index-prefix coincidence (NIFTYBEES etc.).
    """
    it = (instrument_type or "").upper()
    if it and it not in ("FUT", "CE", "PE"):
        return None
    ex = (exchange or "").upper()
    if ex == "MCX":
        return get_mcx_lot_size(*candidates)
    # NSE / BSE / NFO / BFO derivatives: caller falls back to Zerodha CSV.
    return None
