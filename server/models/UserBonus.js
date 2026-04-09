const mongoose = require('mongoose');

const userBonusSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  oderId: { type: String, required: true },
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'BonusTemplate', default: null },
  templateName: { type: String, default: '' },
  type: { type: String, enum: ['first_deposit', 'regular_deposit', 'manual'], required: true },
  bonusType: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
  depositAmountINR: { type: Number, default: 0 },
  bonusAmountINR: { type: Number, required: true, min: 0 },
  bonusAmountUSD: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['active', 'expired', 'revoked'], default: 'active' },
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },
  note: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

userBonusSchema.index({ userId: 1, createdAt: -1 });
userBonusSchema.index({ oderId: 1 });

module.exports = mongoose.model('UserBonus', userBonusSchema);
