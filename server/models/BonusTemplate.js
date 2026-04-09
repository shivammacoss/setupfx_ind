const mongoose = require('mongoose');

const bonusTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  type: {
    type: String,
    enum: ['first_deposit', 'regular_deposit'],
    required: true
  },
  bonusType: {
    type: String,
    enum: ['percentage', 'fixed'],
    default: 'percentage'
  },
  value: { type: Number, required: true, min: 0 },  // % or fixed amount in INR
  maxBonus: { type: Number, default: null, min: 0 }, // cap in INR (null = unlimited)
  minimumDeposit: { type: Number, default: 0, min: 0 }, // min INR deposit to qualify
  isActive: { type: Boolean, default: true },
  description: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

bonusTemplateSchema.index({ type: 1, isActive: 1 });

module.exports = mongoose.model('BonusTemplate', bonusTemplateSchema);
