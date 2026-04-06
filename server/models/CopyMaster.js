const mongoose = require('mongoose');

/**
 * Copy Trading Master Schema
 * Users who provide trading signals for followers to copy
 */
const copyMasterSchema = new mongoose.Schema({
  // Reference to User
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  oderId: { type: String, required: true, unique: true },
  
  // Master Profile
  displayName: { type: String, required: true },
  description: { type: String, default: '' },
  avatar: { type: String, default: '' },
  
  // Status
  status: { 
    type: String, 
    enum: ['pending', 'active', 'suspended', 'rejected'], 
    default: 'pending' 
  },
  
  // Fee Structure (Admin configurable)
  feeSettings: {
    // Performance Fee (only charged on profits)
    performanceFeePercent: { type: Number, default: 20, min: 0, max: 50 },
    // Per Lot Fee (charged on every trade)
    perLotFee: { type: Number, default: 0 },
    // Monthly Subscription Fee
    subscriptionFee: { type: Number, default: 0 },
    // Minimum investment to follow
    minInvestment: { type: Number, default: 100 }
  },
  
  // High Water Mark for Performance Fee
  // Performance fee only charged when equity exceeds previous high
  highWaterMark: {
    enabled: { type: Boolean, default: true },
    // Track per follower in CopyFollower model
  },
  
  // Risk Management Settings
  riskSettings: {
    maxDrawdownPercent: { type: Number, default: 30 }, // Stop copying if drawdown > X%
    maxDailyLossPercent: { type: Number, default: 10 },
    maxPositionSize: { type: Number, default: 10 }, // Max lots per position
    maxOpenPositions: { type: Number, default: 20 }
  },
  
  // Follower Limits
  followerSettings: {
    maxFollowers: { type: Number, default: 100 },
    currentFollowers: { type: Number, default: 0 },
    totalFollowersAllTime: { type: Number, default: 0 },
    acceptingNewFollowers: { type: Boolean, default: true }
  },
  
  // Performance Statistics
  stats: {
    totalTrades: { type: Number, default: 0 },
    winningTrades: { type: Number, default: 0 },
    losingTrades: { type: Number, default: 0 },
    winRate: { type: Number, default: 0 },
    totalProfitUSD: { type: Number, default: 0 },
    totalLossUSD: { type: Number, default: 0 },
    netProfitUSD: { type: Number, default: 0 },
    totalLotsTraded: { type: Number, default: 0 },
    averageProfit: { type: Number, default: 0 },
    averageLoss: { type: Number, default: 0 },
    profitFactor: { type: Number, default: 0 }, // Gross Profit / Gross Loss
    sharpeRatio: { type: Number, default: 0 },
    maxDrawdown: { type: Number, default: 0 },
    maxDrawdownPercent: { type: Number, default: 0 },
    currentDrawdown: { type: Number, default: 0 },
    currentDrawdownPercent: { type: Number, default: 0 },
    peakEquity: { type: Number, default: 0 },
    // Monthly performance
    monthlyReturns: [{ 
      month: String, // YYYY-MM
      returnPercent: Number,
      profit: Number
    }]
  },
  
  // Wallet (Master earnings from copy trading)
  wallet: {
    balance: { type: Number, default: 0 },
    totalEarned: { type: Number, default: 0 },
    totalWithdrawn: { type: Number, default: 0 },
    pendingWithdrawal: { type: Number, default: 0 },
    // Breakdown
    performanceFeeEarned: { type: Number, default: 0 },
    lotFeeEarned: { type: Number, default: 0 },
    subscriptionFeeEarned: { type: Number, default: 0 }
  },
  
  // Application Details
  applicationDetails: {
    tradingExperience: { type: String, default: '' },
    tradingStrategy: { type: String, default: '' },
    riskManagement: { type: String, default: '' },
    expectedReturns: { type: String, default: '' }
  },
  
  // Admin Controls
  adminNotes: { type: String, default: '' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },
  rejectedReason: { type: String, default: '' },
  
  // Visibility
  isPublic: { type: Boolean, default: true }, // Show in master list
  isFeatured: { type: Boolean, default: false }, // Featured master
  
  // Timestamps
  appliedAt: { type: Date, default: Date.now },
  lastTradeAt: { type: Date, default: null }
}, { timestamps: true });

// Indexes (userId, oderId already indexed via unique: true)
copyMasterSchema.index({ status: 1 });
copyMasterSchema.index({ isPublic: 1, status: 1 });
copyMasterSchema.index({ 'stats.winRate': -1 });
copyMasterSchema.index({ 'stats.netProfitUSD': -1 });
copyMasterSchema.index({ 'followerSettings.currentFollowers': -1 });

// Update win rate
copyMasterSchema.methods.updateStats = function() {
  const total = this.stats.winningTrades + this.stats.losingTrades;
  if (total > 0) {
    this.stats.winRate = (this.stats.winningTrades / total) * 100;
  }
  
  if (this.stats.totalLossUSD > 0) {
    this.stats.profitFactor = this.stats.totalProfitUSD / this.stats.totalLossUSD;
  }
  
  if (this.stats.winningTrades > 0) {
    this.stats.averageProfit = this.stats.totalProfitUSD / this.stats.winningTrades;
  }
  
  if (this.stats.losingTrades > 0) {
    this.stats.averageLoss = this.stats.totalLossUSD / this.stats.losingTrades;
  }
};

// Update drawdown
copyMasterSchema.methods.updateDrawdown = function(currentEquity) {
  if (currentEquity > this.stats.peakEquity) {
    this.stats.peakEquity = currentEquity;
  }
  
  const drawdown = this.stats.peakEquity - currentEquity;
  const drawdownPercent = this.stats.peakEquity > 0 
    ? (drawdown / this.stats.peakEquity) * 100 
    : 0;
  
  this.stats.currentDrawdown = drawdown;
  this.stats.currentDrawdownPercent = drawdownPercent;
  
  if (drawdown > this.stats.maxDrawdown) {
    this.stats.maxDrawdown = drawdown;
    this.stats.maxDrawdownPercent = drawdownPercent;
  }
};

// Check if can accept new followers
copyMasterSchema.methods.canAcceptFollowers = function() {
  return this.status === 'active' && 
         this.followerSettings.acceptingNewFollowers &&
         this.followerSettings.currentFollowers < this.followerSettings.maxFollowers;
};

const CopyMaster = mongoose.model('CopyMaster', copyMasterSchema);

module.exports = CopyMaster;
