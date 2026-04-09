const mongoose = require('mongoose');

// User-specific Risk Settings Schema - Override global settings per user
const userRiskSettingsSchema = new mongoose.Schema({
  // User reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  oderId: {
    type: String,
    required: true
  },
  
  // ============== RISK MANAGEMENT SETTINGS ==============
  // If null, use global default
  ledgerBalanceClose: {
    type: Number,
    default: null,
    min: 0,
    max: 100
  },
  profitTradeHoldMinSeconds: {
    type: Number,
    default: null,
    min: 0
  },
  lossTradeHoldMinSeconds: {
    type: Number,
    default: null,
    min: 0
  },
  blockLimitAboveBelowHighLow: {
    type: Boolean,
    default: null
  },
  blockLimitBetweenHighLow: {
    type: Boolean,
    default: null
  },
  exitOnlyMode: {
    type: Boolean,
    default: null
  },
  
  // ============== MT5-STYLE MARGIN CONTROL ==============
  marginCallLevel: {
    type: Number,
    default: null,
    min: 0,
    max: 1000
  },
  stopOutLevel: {
    type: Number,
    default: null,
    min: 0,
    max: 100
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
userRiskSettingsSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  if (typeof next === 'function') next();
});

// Static method to get effective settings for a user (Mongo userId or User.oderId string)
userRiskSettingsSchema.statics.getEffectiveSettings = async function(userIdOrOderId) {
  const RiskSettings = mongoose.model('RiskSettings');
  const User = mongoose.model('User');

  const globalSettings = await RiskSettings.getGlobalSettings();

  const merge = (userSettings) => ({
    ledgerBalanceClose: userSettings?.ledgerBalanceClose ?? globalSettings.ledgerBalanceClose ?? 0,
    profitTradeHoldMinSeconds: userSettings?.profitTradeHoldMinSeconds ?? globalSettings.profitTradeHoldMinSeconds ?? 0,
    lossTradeHoldMinSeconds: userSettings?.lossTradeHoldMinSeconds ?? globalSettings.lossTradeHoldMinSeconds ?? 0,
    marginCallLevel: userSettings?.marginCallLevel ?? globalSettings.marginCallLevel ?? 100,
    stopOutLevel: userSettings?.stopOutLevel ?? globalSettings.stopOutLevel ?? 50,
    blockLimitAboveBelowHighLow: userSettings?.blockLimitAboveBelowHighLow ?? globalSettings.blockLimitAboveBelowHighLow ?? false,
    blockLimitBetweenHighLow: userSettings?.blockLimitBetweenHighLow ?? globalSettings.blockLimitBetweenHighLow ?? false,
    exitOnlyMode: userSettings?.exitOnlyMode ?? globalSettings.exitOnlyMode ?? false,
    hasUserOverride: !!userSettings
  });

  if (userIdOrOderId == null || userIdOrOderId === '') {
    return merge(null);
  }

  let user = await User.findOne({ oderId: userIdOrOderId });
  if (!user && mongoose.Types.ObjectId.isValid(userIdOrOderId)) {
    user = await User.findById(userIdOrOderId);
  }
  if (!user) {
    return merge(null);
  }

  const userSettings = await this.findOne({ userId: user._id });
  return merge(userSettings);
};

module.exports = mongoose.model('UserRiskSettings', userRiskSettingsSchema);
