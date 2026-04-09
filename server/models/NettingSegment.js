const mongoose = require('mongoose');

// Netting Segment Schema - For Netting trading mode
// Supports ALL markets: Indian (NSE, BSE, MCX) + Forex + Crypto + Commodities + Indices
//
// --- Currency convention (admin-entered values) ---
// • NSE / BSE / MCX (marketType 'indian'): monetary fields are Indian Rupees (₹)—margins, maxValue cap,
//   brokerage (commission), and overnight swap amounts (see NettingEngine.applyOvernightSwap).
// • Forex / international (marketType 'forex'): order notional uses the instrument quote currency; admin
//   still enters fixed margin and brokerage in ₹ INR — engine converts INR → USD for wallet via live rate.
// • spreadPips: always in the symbol’s own price units (pips/points), not rupees.
// • Percentages, leverage, lot/qty limits, “times” margin multiplier: unitless counts or %.
// • usdInrRate: legacy stored default; runtime conversion uses currencyRateService.getCachedUsdInrRate().
const nettingSegmentSchema = new mongoose.Schema({
  // Segment identification
  name: {
    type: String,
    required: true,
    unique: true
  },
  displayName: {
    type: String,
    required: true
  },
  exchange: {
    type: String,
    required: true
  },
  segmentType: {
    type: String,
    required: true
  },
  // Market type: 'indian' or 'forex' (for routing to correct engine)
  marketType: {
    type: String,
    enum: ['indian', 'forex'],
    default: 'indian'
  },
  zerodhaExchange: {
    type: String,
    default: null
  },
  
  // ============== LOT SETTINGS ==============
  limitType: {
    type: String,
    enum: ['lot', 'price'],
    default: 'lot'
  },
  maxValue: {
    type: Number,
    default: 0,
    min: 0
  },
  // Segment-wide cap: sum of open + pending lots across all symbols (netting)
  maxExchangeLots: {
    type: Number,
    default: 100,
    min: 0
  },
  maxLots: {
    type: Number,
    default: 50,
    min: 0
  },
  minLots: {
    type: Number,
    default: 1,
    min: 0
  },
  orderLots: {
    type: Number,
    default: 10,
    min: 0
  },
  
  // ============== BROKERAGE SETTINGS ==============
  commissionType: {
    type: String,
    enum: ['per_lot', 'per_crore'],
    default: 'per_lot'
  },
  commission: {
    type: Number,
    default: 0,
    min: 0
  },
  optionBuyCommission: { type: Number, default: 0, min: 0 },
  optionSellCommission: { type: Number, default: 0, min: 0 },
  chargeOn: {
    type: String,
    enum: ['open', 'close', 'both'],
    default: 'open'
  },
  // Legacy fallback rate (not used by NettingEngine; live USD/INR comes from currencyRateService).
  usdInrRate: {
    type: Number,
    default: 83,
    min: 1
  },
  
  // ============== RISK MANAGEMENT SETTINGS ==============
  // MT5-style margin call and stop out levels
  marginCallLevel: {
    type: Number,
    default: 100,
    min: 0,
    max: 1000
  },
  stopOutLevel: {
    type: Number,
    default: 50,
    min: 0,
    max: 100
  },
  
  // ============== QTY SETTINGS (for NSE_EQ, BSE_EQ only) ==============
  minQty: {
    type: Number,
    default: null,
    min: 0
  },
  perOrderQty: {
    type: Number,
    default: null,
    min: 0
  },
  maxQtyPerScript: {
    type: Number,
    default: null,
    min: 0
  },
  maxQtyPerSegment: {
    type: Number,
    default: null,
    min: 0
  },
  
  // ============== FIXED MARGIN SETTINGS ==============
  intradayMargin: {
    type: Number,
    default: null,
    min: 0
  },
  overnightMargin: {
    type: Number,
    default: null,
    min: 0
  },
  optionBuyIntraday: {
    type: Number,
    default: null,
    min: 0
  },
  optionBuyOvernight: {
    type: Number,
    default: null,
    min: 0
  },
  optionSellIntraday: {
    type: Number,
    default: null,
    min: 0
  },
  optionSellOvernight: {
    type: Number,
    default: null,
    min: 0
  },
  /**
   * How segment-level fixed margin numbers are interpreted:
   * - 'fixed'   : absolute currency per lot (F&O) or per share (EQ) — margin = raw × volume
   * - 'percent' : % of order notional (qty × price) — margin = qty × price × (raw / 100).  Max 100.
   * - 'times'   : multiplier on buying power — margin = (qty × price) / raw.  E.g. 100 → 100× buying power.
   * Script and user margin overrides inherit this mode unless they specify their own.
   */
  marginCalcMode: {
    type: String,
    enum: ['fixed', 'percent', 'times'],
    default: 'fixed'
  },
  /**
   * @deprecated Use marginCalcMode instead. Kept for backward compatibility reads.
   * When true, equivalent to marginCalcMode='percent'. When false, equivalent to marginCalcMode='fixed'.
   */
  fixedMarginAsPercent: {
    type: Boolean,
    default: false
  },
  
  // ============== OPTIONS SETTINGS ==============
  /** Max |strike − underlying| as % of underlying (e.g. 10 → ±10% of spot). Script row uses points only. */
  buyingStrikeFarPercent: {
    type: Number,
    default: null,
    min: 0,
    max: 100
  },
  sellingStrikeFarPercent: {
    type: Number,
    default: null,
    min: 0,
    max: 100
  },
  /** Legacy / script: max |strike − underlying| in price units (₹) */
  buyingStrikeFar: {
    type: Number,
    default: null,
    min: 0
  },
  sellingStrikeFar: {
    type: Number,
    default: null,
    min: 0
  },
  
  // ============== LIMIT AWAY (netting) ==============
  // Segment default: max distance from market as % of price (e.g. 10 → SBI @ ₹100 allows buy limit down to ₹90, sell up to ₹110).
  limitAwayPercent: {
    type: Number,
    default: null,
    min: 0,
    max: 100
  },
  /** Legacy: fixed points from market (ignored when limitAwayPercent is set on segment) */
  limitAwayPoints: {
    type: Number,
    default: null,
    min: 0
  },
  
  // ============== LEVERAGE SETTINGS ==============
  maxLeverage: {
    type: Number,
    default: 100,
    min: 1
  },
  defaultLeverage: {
    type: Number,
    default: 10,
    min: 1
  },
  fixedLeverage: {
    type: Number,
    default: null,
    min: 1
  },
  leverageOptions: {
    type: String,
    default: '1,5,10,20,50,100'
  },
  
  // ============== SPREAD SETTINGS ==============
  spreadType: {
    type: String,
    enum: ['fixed', 'floating'],
    default: 'floating'
  },
  spreadPips: {
    type: Number,
    default: 0,
    min: 0
  },
  swapType: {
    type: String,
    enum: ['points', 'percentage'],
    default: 'points'
  },
  swapLong: {
    type: Number,
    default: 0
  },
  swapShort: {
    type: Number,
    default: 0
  },
  swapTime: { type: String, default: '22:30', validate: /^([01]\d|2[0-3]):[0-5]\d$/ },
  lastSwapAppliedDate: { type: String, default: null },

  // ============== BLOCK SETTINGS ==============
  isActive: {
    type: Boolean,
    default: true
  },
  tradingEnabled: {
    type: Boolean,
    default: true
  },
  
  // ============== RISK MANAGEMENT SETTINGS ==============
  ledgerBalanceClose: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  profitTradeHoldMinSeconds: {
    type: Number,
    default: 0,
    min: 0
  },
  lossTradeHoldMinSeconds: {
    type: Number,
    default: 0,
    min: 0
  },
  /** On IST expiry day only: min seconds before user close when position is in profit (0 = use global risk hold only). */
  expiryProfitHoldMinSeconds: {
    type: Number,
    default: 0,
    min: 0
  },
  /** On IST expiry day only: min seconds before user close when position is in loss (0 = use global risk hold only). */
  expiryLossHoldMinSeconds: {
    type: Number,
    default: 0,
    min: 0
  },
  /**
   * When true, segment-level expiry-day margin numbers below are % of order notional (qty × price).
   * Script/user overrides for those margins are always absolute per lot/share — same rule as fixedMarginAsPercent.
   */
  expiryDayMarginAsPercent: {
    type: Boolean,
    default: false
  },
  /** Single expiry-day margin (IST): futures and options, buy and sell — overrides normal intraday fixed margin when set. */
  expiryDayIntradayMargin: {
    type: Number,
    default: null,
    min: 0
  },
  /** Expiry-day margin for option BUY (IST). Overrides optionBuyIntraday on expiry day. */
  expiryDayOptionBuyMargin: {
    type: Number,
    default: null,
    min: 0
  },
  /** Expiry-day margin for option SELL (IST). Overrides optionSellIntraday on expiry day. */
  expiryDayOptionSellMargin: {
    type: Number,
    default: null,
    min: 0
  },
  blockLimitAboveBelowHighLow: {
    type: Boolean,
    default: false
  },
  blockLimitBetweenHighLow: {
    type: Boolean,
    default: false
  },
  exitOnlyMode: {
    type: Boolean,
    default: false
  },
  /** When false, carry-forward orders are rejected and open carry-forward positions are auto-closed at exchange square-off (P&L realized to wallet). When true, CF is allowed and uses overnight/carry-forward margin rules. */
  allowOvernight: {
    type: Boolean,
    default: true
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update timestamp on save
nettingSegmentSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Static method to seed default segments for Netting mode
// Netting supports ALL markets: Indian + Forex + Crypto
nettingSegmentSchema.statics.seedDefaultSegments = async function() {
  const defaultSegments = [
    // ========== INDIAN MARKET SEGMENTS ==========
    {
      name: 'NSE_EQ',
      displayName: 'NSE EQ',
      exchange: 'NSE',
      segmentType: 'EQUITY',
      marketType: 'indian',
      zerodhaExchange: 'NSE',
      limitType: 'price',
      maxValue: 100000,
      maxExchangeLots: 100,
      maxLots: 50,
      minLots: 1,
      orderLots: 10,
      commissionType: 'per_lot',
      commission: 0
    },
    {
      name: 'NSE_FUT',
      displayName: 'NSE FUT',
      exchange: 'NSE',
      segmentType: 'FUTURES',
      marketType: 'indian',
      zerodhaExchange: 'NFO',
      limitType: 'lot',
      maxValue: 0,
      maxExchangeLots: 100,
      maxLots: 50,
      minLots: 1,
      orderLots: 10,
      commissionType: 'per_lot',
      commission: 0
    },
    {
      name: 'NSE_OPT',
      displayName: 'NSE OPT',
      exchange: 'NSE',
      segmentType: 'OPTIONS',
      marketType: 'indian',
      zerodhaExchange: 'NFO',
      limitType: 'lot',
      maxValue: 0,
      maxExchangeLots: 100,
      maxLots: 50,
      minLots: 1,
      orderLots: 10,
      commissionType: 'per_lot',
      commission: 0
    },
    {
      name: 'BSE_EQ',
      displayName: 'BSE EQ',
      exchange: 'BSE',
      segmentType: 'EQUITY',
      marketType: 'indian',
      zerodhaExchange: 'BSE',
      limitType: 'price',
      maxValue: 100000,
      maxExchangeLots: 100,
      maxLots: 50,
      minLots: 1,
      orderLots: 10,
      commissionType: 'per_lot',
      commission: 0
    },
    {
      name: 'BSE_FUT',
      displayName: 'BSE FUT',
      exchange: 'BSE',
      segmentType: 'FUTURES',
      marketType: 'indian',
      zerodhaExchange: 'BFO',
      limitType: 'lot',
      maxValue: 0,
      maxExchangeLots: 100,
      maxLots: 50,
      minLots: 1,
      orderLots: 10,
      commissionType: 'per_lot',
      commission: 0
    },
    {
      name: 'BSE_OPT',
      displayName: 'BSE OPT',
      exchange: 'BSE',
      segmentType: 'OPTIONS',
      marketType: 'indian',
      zerodhaExchange: 'BFO',
      limitType: 'lot',
      maxValue: 0,
      maxExchangeLots: 100,
      maxLots: 50,
      minLots: 1,
      orderLots: 10,
      commissionType: 'per_lot',
      commission: 0
    },
    {
      name: 'MCX_FUT',
      displayName: 'MCX FUT',
      exchange: 'MCX',
      segmentType: 'FUTURES',
      marketType: 'indian',
      zerodhaExchange: 'MCX',
      limitType: 'lot',
      maxValue: 0,
      maxExchangeLots: 100,
      maxLots: 50,
      minLots: 1,
      orderLots: 10,
      commissionType: 'per_lot',
      commission: 0
    },
    {
      name: 'MCX_OPT',
      displayName: 'MCX OPT',
      exchange: 'MCX',
      segmentType: 'OPTIONS',
      marketType: 'indian',
      zerodhaExchange: 'MCX',
      limitType: 'lot',
      maxValue: 0,
      maxExchangeLots: 100,
      maxLots: 50,
      minLots: 1,
      orderLots: 10,
      commissionType: 'per_lot',
      commission: 0
    },
    
    // ========== FOREX / GLOBAL MARKET SEGMENTS ==========
    {
      name: 'FOREX',
      displayName: 'Forex',
      exchange: 'FOREX',
      segmentType: 'FOREX',
      marketType: 'forex',
      limitType: 'lot',
      maxExchangeLots: 500,
      maxLots: 100,
      minLots: 0.01,
      orderLots: 50,
      commissionType: 'per_lot',
      commission: 0
    },
    {
      name: 'STOCKS',
      displayName: 'Stocks (International)',
      exchange: 'STOCKS',
      segmentType: 'STOCKS',
      marketType: 'forex',
      limitType: 'lot',
      maxExchangeLots: 200,
      maxLots: 50,
      minLots: 0.01,
      orderLots: 25,
      commissionType: 'per_lot',
      commission: 0
    },
    {
      name: 'CRYPTO',
      displayName: 'Crypto (Spot)',
      exchange: 'CRYPTO',
      segmentType: 'CRYPTO',
      marketType: 'forex',
      limitType: 'lot',
      maxExchangeLots: 100,
      maxLots: 10,
      minLots: 0.01,
      orderLots: 5,
      commissionType: 'per_lot',
      commission: 0
    },
    {
      name: 'CRYPTO_PERPETUAL',
      displayName: 'Crypto Perpetual',
      exchange: 'DELTA',
      segmentType: 'PERPETUAL',
      marketType: 'forex',
      limitType: 'lot',
      maxExchangeLots: 100,
      maxLots: 10,
      minLots: 0.01,
      orderLots: 5,
      commissionType: 'per_lot',
      commission: 0
    },
    {
      name: 'CRYPTO_OPTIONS',
      displayName: 'Crypto Options',
      exchange: 'DELTA',
      segmentType: 'OPTIONS',
      marketType: 'forex',
      limitType: 'lot',
      maxExchangeLots: 100,
      maxLots: 10,
      minLots: 0.01,
      orderLots: 5,
      commissionType: 'per_lot',
      commission: 0
    },
    {
      name: 'INDICES',
      displayName: 'Indices',
      exchange: 'INDICES',
      segmentType: 'INDICES',
      marketType: 'forex',
      limitType: 'lot',
      maxExchangeLots: 200,
      maxLots: 50,
      minLots: 0.01,
      orderLots: 25,
      commissionType: 'per_lot',
      commission: 0
    },
    {
      name: 'COMMODITIES',
      displayName: 'Com',
      exchange: 'COMEX',
      segmentType: 'COMMODITIES',
      marketType: 'forex',
      limitType: 'lot',
      maxExchangeLots: 200,
      maxLots: 50,
      minLots: 0.01,
      orderLots: 25,
      commissionType: 'per_lot',
      commission: 0
    },
  ];

  // Upsert segments (only set defaults on insert, preserve user edits)
  for (const segment of defaultSegments) {
    await this.findOneAndUpdate(
      { name: segment.name },
      { $setOnInsert: segment },
      { upsert: true, new: true }
    );
  }

  await this.deleteMany({ name: 'CRYPTO_FUTURES' });

  const { migrateIndianSegmentDisplayNames } = require('../utils/segmentDisplayNames');
  await migrateIndianSegmentDisplayNames(this);

  console.log(`[NettingSegment] Default segments seeded (${defaultSegments.length} segments)`);
};

module.exports = mongoose.model('NettingSegment', nettingSegmentSchema);
