const mongoose = require('mongoose');

/**
 * Introducing Broker (IB) Schema
 * Handles multi-level referral system with customizable commission structures
 */
const ibSchema = new mongoose.Schema({
  // Reference to User
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  oderId: { type: String, required: true, unique: true }, // User's oderId for quick lookup
  
  // IB Identification
  referralCode: { type: String, required: true, unique: true, uppercase: true },
  
  // IB Status
  status: { 
    type: String, 
    enum: ['pending', 'active', 'suspended', 'rejected'], 
    default: 'pending' 
  },
  
  // Parent IB (for multi-level)
  parentIBId: { type: mongoose.Schema.Types.ObjectId, ref: 'IB', default: null },
  parentReferralCode: { type: String, default: null },
  
  // IB Level in hierarchy (1 = direct, 2 = sub-IB, etc.)
  level: { type: Number, default: 1, min: 1, max: 5 },
  
  // Commission Settings (Admin configurable per IB)
  commissionSettings: {
    type: { 
      type: String, 
      enum: ['per_lot', 'revenue_percent', 'spread_share', 'hybrid'], 
      default: 'per_lot' 
    },
    // Per Lot Commission (e.g., $5 per lot traded)
    perLotAmount: { type: Number, default: 0 },
    // Revenue Percent (e.g., 10% of spread/commission revenue)
    revenuePercent: { type: Number, default: 0, min: 0, max: 100 },
    // Spread Share (e.g., 30% of spread markup)
    spreadSharePercent: { type: Number, default: 0, min: 0, max: 100 },
    // Multi-level commission rates (percentage of sub-IB earnings)
    multiLevelRates: {
      level1: { type: Number, default: 0 }, // Direct referral
      level2: { type: Number, default: 0 }, // Sub-IB level 1
      level3: { type: Number, default: 0 }, // Sub-IB level 2
      level4: { type: Number, default: 0 },
      level5: { type: Number, default: 0 }
    }
  },
  
  // Statistics
  stats: {
    totalReferrals: { type: Number, default: 0 },
    activeReferrals: { type: Number, default: 0 },
    totalSubIBs: { type: Number, default: 0 },
    totalLotsTraded: { type: Number, default: 0 },
    totalVolumeUSD: { type: Number, default: 0 },
    totalCommissionEarned: { type: Number, default: 0 },
    totalCommissionPaid: { type: Number, default: 0 },
    pendingCommission: { type: Number, default: 0 },
    thisMonthCommission: { type: Number, default: 0 },
    thisMonthLots: { type: Number, default: 0 }
  },
  
  // Wallet (IB earnings separate from trading wallet)
  wallet: {
    balance: { type: Number, default: 0 },
    totalEarned: { type: Number, default: 0 },
    totalWithdrawn: { type: Number, default: 0 },
    pendingWithdrawal: { type: Number, default: 0 }
  },
  
  // Application Details
  applicationDetails: {
    businessName: { type: String, default: '' },
    website: { type: String, default: '' },
    marketingPlan: { type: String, default: '' },
    expectedMonthlyReferrals: { type: Number, default: 0 },
    experience: { type: String, default: '' }
  },
  
  // Admin Notes
  adminNotes: { type: String, default: '' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },
  rejectedReason: { type: String, default: '' },
  
  // Timestamps
  appliedAt: { type: Date, default: Date.now },
  lastActivityAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Indexes for performance (userId, oderId, referralCode already indexed via unique: true)
ibSchema.index({ parentIBId: 1 });
ibSchema.index({ status: 1 });
ibSchema.index({ 'stats.totalCommissionEarned': -1 });

// Generate unique referral code
ibSchema.statics.generateReferralCode = async function() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  let exists = true;
  
  while (exists) {
    code = 'IB';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const existing = await this.findOne({ referralCode: code });
    exists = !!existing;
  }
  
  return code;
};

// Get all downline IBs recursively
ibSchema.methods.getDownlineIBs = async function(maxDepth = 5) {
  const IB = mongoose.model('IB');
  const downline = [];
  
  const fetchLevel = async (parentId, currentDepth) => {
    if (currentDepth > maxDepth) return;
    
    const children = await IB.find({ parentIBId: parentId, status: 'active' });
    for (const child of children) {
      downline.push({ ib: child, depth: currentDepth });
      await fetchLevel(child._id, currentDepth + 1);
    }
  };
  
  await fetchLevel(this._id, 1);
  return downline;
};

// Credit commission to IB wallet
ibSchema.methods.creditCommission = async function(amount, description, tradeId) {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    this.wallet.balance += amount;
    this.wallet.totalEarned += amount;
    this.stats.totalCommissionEarned += amount;
    this.stats.thisMonthCommission += amount;
    this.lastActivityAt = new Date();
    
    await this.save({ session });
    
    // Create commission record
    const IBCommission = mongoose.model('IBCommission');
    await IBCommission.create([{
      ibId: this._id,
      amount,
      description,
      tradeId,
      status: 'credited'
    }], { session });
    
    await session.commitTransaction();
    return true;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

const IB = mongoose.model('IB', ibSchema);

module.exports = IB;
