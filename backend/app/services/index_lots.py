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
    ("BANKNIFTY", 35),
    ("BANKEX", 30),
    ("SENSEX", 20),
    ("NIFTY", 75),
]


def get_index_lot_size(*candidates: str | None) -> int | None:
    """Return the canonical lot size for the first candidate whose
    normalised form starts with a known index prefix. Returns None when
    nothing matches — caller should keep whatever lot size it already has.
    """
    for raw in candidates:
        if not raw:
            continue
        s = raw.upper().replace(" ", "")
        for prefix, lot in INDEX_LOT_SIZES:
            if s.startswith(prefix):
                return lot
    return None
