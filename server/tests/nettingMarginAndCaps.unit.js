/**
 * Unit tests (no DB): expiry-day margin math + segment-wide lot projection.
 * Run: node tests/nettingMarginAndCaps.unit.js
 */

const NettingEngine = require('../engines/NettingEngine');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function run() {
  const eng = new NettingEngine();

  // --- Expiry day margin (fixed per lot) ---
  let m = eng.resolveExpiryDayMarginAmount(
    { expiryDayIntradayMargin: 500, fixedExpiryDayIntradayAsPercent: false },
    { volume: 2, quantity: 100, price: 10 }
  );
  assert(m === 1000, `expiry fixed margin: expected 1000, got ${m}`);

  m = eng.resolveExpiryDayMarginAmount(
    { expiryDayIntradayMargin: 10, fixedExpiryDayIntradayAsPercent: true },
    { volume: 2, quantity: 100, price: 10 }
  );
  assert(m === 100, `expiry % margin: expected 10% of 1000 = 100, got ${m}`);

  assert(
    eng.resolveExpiryDayMarginAmount(
      { expiryDayIntradayMargin: 0, fixedExpiryDayIntradayAsPercent: false },
      { volume: 1, quantity: 1, price: 1 }
    ) === null,
    'expiry margin 0 should not apply'
  );

  // --- Max exchange lots projection (segment total lots after order) ---
  const projected = eng.projectedSegmentVolumeTotal(
    [],
    'NSE_FUT',
    'NIFTY24JANFUT',
    null,
    5,
    'buy',
    false
  );
  assert(projected === 5, `empty book + 5 lots: expected 5, got ${projected}`);

  const pendingRows = [
    { symbol: 'ABC', volume: 3, status: 'pending', exchange: 'NFO', segment: 'FUT' }
  ];
  const withPending = eng.projectedSegmentVolumeTotal(
    pendingRows,
    'NSE_FUT',
    'XYZ',
    null,
    2,
    'buy',
    false
  );
  assert(withPending === 5, `pending 3 + new 2 on new symbol: expected 5, got ${withPending}`);

  console.log('nettingMarginAndCaps.unit.js — all checks passed');
}

try {
  run();
  process.exit(0);
} catch (e) {
  console.error('FAILED:', e.message);
  process.exit(1);
}
