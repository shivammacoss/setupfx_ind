/**
 * Shared P/L helpers used by UserLayout, MarketPage and OrdersPage.
 *
 * Indian instrument detection:
 *   1. Check position.exchange first (NSE/BSE/NFO/BFO/MCX/CDS are Indian)
 *   2. Then check suffix patterns (CE/PE) and known index names
 *   3. NEVER use symbol.length as a heuristic — long F&O symbols like
 *      BANKNIFTY26MAR54000CE (21 chars) would fail a <= 15 check
 */

const INDIAN_EXCHANGES = new Set(['NSE', 'BSE', 'NFO', 'BFO', 'MCX', 'CDS']);

const INDIAN_INDEX_NAMES = ['NIFTY', 'BANKNIFTY', 'SENSEX', 'FINNIFTY'];

const GLOBAL_SYMBOL_MARKERS = [
  '/', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD',
  'BTC', 'ETH', 'XAU', 'XAG', 'US30', 'US100', 'US500', 'UK100',
];

/**
 * Determine whether a *position object* should use the Indian P/L formula
 * (priceDiff × quantity) rather than the global contract-size formula.
 */
export const isIndianPositionPnl = (pos) => {
  const symbol = pos?.symbol || '';
  const posExchange = (pos?.exchange || '').toUpperCase();

  // 1. Exchange — most reliable
  if (INDIAN_EXCHANGES.has(posExchange)) return true;

  // 2. Known Indian index / option patterns
  if (INDIAN_INDEX_NAMES.some((n) => symbol.includes(n))) return true;
  if (symbol.endsWith('CE') || symbol.endsWith('PE')) return true;

  // 3. Fallback: not a recognisable global symbol
  if (GLOBAL_SYMBOL_MARKERS.some((m) => symbol.includes(m))) return false;

  // If none of the global markers matched, treat as Indian
  return true;
};

/**
 * Contract-size map for global (non-Indian) instruments.
 */
export const CONTRACT_SIZE_MAP = {
  // Forex majors: standard lot = 100,000
  DEFAULT_FOREX: 100000,
  // Metals
  XAUUSD: 100,
  XAGUSD: 5000,
  GOLD: 100,
  SILVER: 5000,
  XPTUSD: 100,
  // Indices: 1 per point
  DEFAULT_INDEX: 1,
  // Crypto: 1 unit
  DEFAULT_CRYPTO: 1,
  // Oil
  BRENT: 1000,
};

/**
 * Return the contract size for a global (non-Indian) symbol.
 */
export const getGlobalContractSize = (symbol) => {
  if (!symbol) return CONTRACT_SIZE_MAP.DEFAULT_FOREX;

  // Exact match first
  if (CONTRACT_SIZE_MAP[symbol] !== undefined) return CONTRACT_SIZE_MAP[symbol];

  // Crypto
  if (symbol.includes('BTC') || symbol.includes('ETH')) return CONTRACT_SIZE_MAP.DEFAULT_CRYPTO;
  if (symbol.includes('ADA')) return 1000;

  // Metals
  if (symbol === 'XAUUSD' || symbol === 'XPTUSD' || symbol === 'GOLD') return 100;
  if (symbol === 'XAGUSD' || symbol === 'SILVER') return 5000;

  // Indices
  if (symbol === 'US100' || symbol === 'US30' || symbol === 'US2000') return CONTRACT_SIZE_MAP.DEFAULT_INDEX;

  // Oil
  if (symbol === 'BRENT' || symbol.includes('OIL')) return 1000;

  // Default: Forex
  return CONTRACT_SIZE_MAP.DEFAULT_FOREX;
};
