const mongoose = require('mongoose');

/**
 * Copy Trade Schema
 * Tracks individual copied trades and their fees
 */
const copyTradeSchema = new mongoose.Schema({
  // Master's original trade
  masterTradeId: { type: String, required: true },
  masterPositionId: { type: String, required: true },
  masterId: { type: mongoose.Schema.Types.ObjectId, ref: 'CopyMaster', required: true },
  masterOderId: { type: String, required: true },
  
  // Follower's copied trade
  followerTradeId: { type: String, default: null },
  followerPositionId: { type: String, default: null },
  followerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  followerOderId: { type: String, required: true },
  copyFollowerId: { type: mongoose.Schema.Types.ObjectId, ref: 'CopyFollower', required: true },
  
  // Trade Details
  symbol: { type: String, required: true },
  side: { type: String, enum: ['buy', 'sell'], required: true },
  
  // Volume
  masterVolume: { type: Number, required: true },
  followerVolume: { type: Number, required: true },
  copyRatio: { type: Number, default: 1 },
  
  // Prices
  masterEntryPrice: { type: Number, required: true },
  followerEntryPrice: { type: Number, default: null },
  masterClosePrice: { type: Number, default: null },
  followerClosePrice: { type: Number, default: null },
  
  // SL/TP
  stopLoss: { type: Number, default: null },
  takeProfit: { type: Number, default: null },
  
  // Status
  status: { 
    type: String, 
    enum: ['pending', 'open', 'closed', 'failed', 'cancelled'], 
    default: 'pending' 
  },
  
  // P/L
  masterProfit: { type: Number, default: 0 },
  followerProfit: { type: Number, default: 0 },
  
  // Fees charged
  fees: {
    performanceFee: { type: Number, default: 0 },
    lotFee: { type: Number, default: 0 },
    totalFee: { type: Number, default: 0 },
    feeStatus: { type: String, enum: ['pending', 'charged', 'waived'], default: 'pending' }
  },
  
  // High Water Mark at time of trade
  hwmAtOpen: { type: Number, default: 0 },
  hwmAtClose: { type: Number, default: 0 },
  
  // Error handling
  errorMessage: { type: String, default: null },
  retryCount: { type: Number, default: 0 },
  
  // Timestamps
  masterOpenedAt: { type: Date, required: true },
  followerOpenedAt: { type: Date, default: null },
  masterClosedAt: { type: Date, default: null },
  followerClosedAt: { type: Date, default: null }
}, { timestamps: true });

// Indexes
copyTradeSchema.index({ masterId: 1, status: 1 });
copyTradeSchema.index({ followerId: 1, status: 1 });
copyTradeSchema.index({ copyFollowerId: 1 });
copyTradeSchema.index({ masterPositionId: 1 });
copyTradeSchema.index({ followerPositionId: 1 });
copyTradeSchema.index({ status: 1, createdAt: -1 });

const CopyTrade = mongoose.model('CopyTrade', copyTradeSchema);

module.exports = CopyTrade;
