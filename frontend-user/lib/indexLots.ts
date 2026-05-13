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
  ["NIFTYNXT50", 25],
  ["BANKNIFTY", 35],
  ["BANKEX", 30],
  ["SENSEX50", 25],
  ["SENSEX", 20],
  ["NIFTY", 75],
];

/** Resolve the canonical lot from the first candidate that matches a known
 *  index prefix. Returns null when nothing matches — caller should keep
 *  whatever lot it already has.
 *
 *  Optional `opts.instrumentType` / `opts.segment` gate the lookup to
 *  F&O rows only. Without the gate, ETFs like NIFTYBEES / BANKBEES /
 *  NIFTYNXT50 ETF would get matched as derivative lots (75 / 35 / 25)
 *  and the order panel would render absurd contract sizes. Equity is
 *  always 1 share = 1 lot. */
export function getIndexLotSize(
  ...args: Array<string | null | undefined | { instrumentType?: string | null; segment?: string | null }>
): number | null {
  // Allow trailing options object: getIndexLotSize(sym, name, {instrumentType, segment})
  let opts: { instrumentType?: string | null; segment?: string | null } = {};
  const last = args[args.length - 1];
  if (last && typeof last === "object") {
    opts = last;
    args = args.slice(0, -1);
  }
  const it = (opts.instrumentType || "").toUpperCase();
  const seg = (opts.segment || "").toUpperCase();
  // When the caller supplied a type/segment hint, apply the F&O gate.
  // No hint → fall through (legacy callsites that already gate themselves).
  if (it && !["CE", "PE", "FUT"].includes(it)) return null;
  if (seg && !seg.includes("OPTION") && !seg.includes("FUTURE")) {
    // Equity / spot — never use derivative canonical lots.
    if (seg.includes("EQUITY") || seg === "NSE_EQ" || seg === "BSE_EQ") {
      return null;
    }
  }
  for (const raw of args as (string | null | undefined)[]) {
    if (!raw) continue;
    const s = raw.toUpperCase().replace(/\s+/g, "");
    for (const [prefix, lot] of INDEX_LOT_SIZES) {
      if (s.startsWith(prefix)) return lot;
    }
  }
  return null;
}
