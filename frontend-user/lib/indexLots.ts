/**
 * Canonical exchange lot sizes for Indian index F&O — mirrored on the
 * client so the order panel can show the correct "1 lot = N units" badge
 * even before the backend self-heals the stored Instrument row.
 *
 * Must stay byte-for-byte in sync with backend/app/services/index_lots.py.
 * Longest prefix first so "MIDCPNIFTY…" doesn't match plain "NIFTY",
 * "BANKNIFTY…" doesn't match "NIFTY", etc.
 */

export const INDEX_LOT_SIZES: ReadonlyArray<[string, number]> = [
  ["MIDCPNIFTY", 120],
  ["FINNIFTY", 65],
  ["BANKNIFTY", 35],
  ["BANKEX", 30],
  ["SENSEX", 20],
  ["NIFTY", 75],
];

/** Resolve the canonical lot from the first candidate that matches a known
 *  index prefix. Returns null when nothing matches — caller should keep
 *  whatever lot it already has. */
export function getIndexLotSize(...candidates: (string | null | undefined)[]): number | null {
  for (const raw of candidates) {
    if (!raw) continue;
    const s = raw.toUpperCase().replace(/\s+/g, "");
    for (const [prefix, lot] of INDEX_LOT_SIZES) {
      if (s.startsWith(prefix)) return lot;
    }
  }
  return null;
}
