const mongoose = require('mongoose');

/**
 * Copy Follower Schema
 * Tracks users following copy trading masters
 */
const copyFollowerSchema = new mongoose.Schema({
  // Follower (User)
  followerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  followerOderId: { type: String, required: true },
  
  // Master being followed
  masterId: { type: mongoose.Schema.Types.ObjectId, ref: 'CopyMaster', required: true },
  masterOderId: { type: String, required: true },
  
  // Subscription Status
  status: { 
    type: String, 
    enum: ['active', 'paused', 'stopped', 'suspended'], 
    default: 'active' 
  },
  
  // Copy Settings
  copySettings: {
    // Copy Mode
    mode: { 
      type: String, 
      enum: ['fixed_lot', 'proportional', 'fixed_amount'], 
      default: 'proportional' 
    },
    // Fixed lot size (if mode = fixed_lot)
    fixedLotSize: { type: Number, default: 0.01 },
    // Copy ratio (if mode = proportional, e.g., 0.5 = 50% of master's size)
    copyRatio: { type: Number, default: 1, min: 0.01, max: 10 },
    // Fixed amount per trade (if mode = fixed_amount)
    fixedAmount: { type: Number, default: 100 },
    // Max lot size per trade
    maxLotSize: { type: Number, default: 1 },
    // Investment amount allocated for copying
    investmentAmount: { type: Number, default: 0 },
    // Stop copying if loss exceeds this amount
    maxLossAmount: { type: Number, default: null },
    // Stop copying if loss exceeds this percent
    maxLossPercent: { type: Number, default: 30 },
    // Copy SL/TP from master
    copySLTP: { type: Boolean, default: true },
    // Reverse copy (opposite direction)
    reverseCopy: { type: Boolean, default: false }
  },
  
  // High Water Mark (for performance fee calculation)
  highWaterMark: {
    value: { type: Number, default: 0 }, // Highest equity achieved
    lastUpdated: { type: Date, default: Date.now },
    // Track profit since last HWM for fee calculation
    profitSinceHWM: { type: Number, default: 0 }
  },
  
  // Statistics
  stats: {
    totalTradesCopied: { type: Number, default: 0 },
    winningTrades: { type: Number, default: 0 },
    losingTrades: { type: Number, default: 0 },
    totalProfitUSD: { type: Number, default: 0 },
    totalLossUSD: { type: Number, default: 0 },
    netProfitUSD: { type: Number, default: 0 },
    totalLotsTraded: { type: Number, default: 0 },
    // Fees paid
    totalPerformanceFeePaid: { type: Number, default: 0 },
    totalLotFeePaid: { type: Number, default: 0 },
    totalSubscriptionFeePaid: { type: Number, default: 0 },
    totalFeesPaid: { type: Number, default: 0 },
    // Current state
    currentEquity: { type: Number, default: 0 },
    peakEquity: { type: Number, default: 0 },
    currentDrawdown: { type: Number, default: 0 },
    currentDrawdownPercent: { type: Number, default: 0 }
  },
  
  // Active copied positions (references to follower's positions)
  activePositions: [{
    masterPositionId: String,
    followerPositionId: String,
    symbol: String,
    side: String,
    volume: Number,
    entryPrice: Number,
    openedAt: Date
  }],
  
  // Subscription billing
  subscription: {
    lastBilledAt: { type: Date, default: null },
    nextBillingAt: { type: Date, default: null },
    billingCycle: { type: String, enum: ['monthly', 'weekly'], default: 'monthly' }
  },
  
  // Stop reasons
  stopReason: { type: String, default: null },
  stoppedAt: { type: Date, default: null },
  
  // Timestamps
  startedAt: { type: Date, default: Date.now },
  pausedAt: { type: Date, default: null }
}, { timestamps: true });

// Compound index for unique follower-master pair
copyFollowerSchema.index({ followerId: 1, masterId: 1 }, { unique: true });
copyFollowerSchema.index({ masterId: 1, status: 1 });
copyFollowerSchema.index({ followerId: 1, status: 1 });
copyFollowerSchema.index({ status: 1 });

// Update High Water Mark
copyFollowerSchema.methods.updateHighWaterMark = function(currentEquity) {
  if (currentEquity > this.highWaterMark.value) {
    this.highWaterMark.value = currentEquity;
    this.highWaterMark.lastUpdated = new Date();
    this.highWaterMark.profitSinceHWM = 0;
  }
  
  this.stats.currentEquity = currentEquity;
  if (currentEquity > this.stats.peakEquity) {
    this.stats.peakEquity = currentEquity;
  }
  
  const drawdown = this.stats.peakEquity - currentEquity;
  this.stats.currentDrawdown = drawdown;
  this.stats.currentDrawdownPercent = this.stats.peakEquity > 0 
    ? (drawdown / this.stats.peakEquity) * 100 
    : 0;
};

// Calculate performance fee (only on profits above HWM)
copyFollowerSchema.methods.calculatePerformanceFee = async function(profit, feePercent) {
  if (profit <= 0) return 0;
  
  const currentEquity = this.stats.currentEquity + profit;
  
  // Only charge fee on profit above high water mark
  if (currentEquity <= this.highWaterMark.value) {
    return 0;
  }
  
  // Profit above HWM
  const profitAboveHWM = currentEquity - this.highWaterMark.value;
  const fee = (profitAboveHWM * feePercent) / 100;
  
  return Math.max(0, fee);
};

// Check if should stop copying due to risk limits
copyFollowerSchema.methods.shouldStopCopying = function() {
  const { maxLossAmount, maxLossPercent, investmentAmount } = this.copySettings;
  const { netProfitUSD } = this.stats;
  
  // Check absolute loss limit
  if (maxLossAmount && netProfitUSD < -maxLossAmount) {
    return { stop: true, reason: `Loss exceeded max amount: $${maxLossAmount}` };
  }
  
  // Check percentage loss limit
  if (maxLossPercent && investmentAmount > 0) {
    const lossPercent = (Math.abs(netProfitUSD) / investmentAmount) * 100;
    if (netProfitUSD < 0 && lossPercent >= maxLossPercent) {
      return { stop: true, reason: `Loss exceeded ${maxLossPercent}% of investment` };
    }
  }
  
  return { stop: false, reason: null };
};

const CopyFollower = mongoose.model('CopyFollower', copyFollowerSchema);

module.exports = CopyFollower;
