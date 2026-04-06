const mongoose = require('mongoose');

const demoSettingsSchema = new mongoose.Schema({
  // Demo account wallet balance
  demoWalletAmount: { type: Number, default: 10000 },
  
  // Demo account validity in days
  demoValidityDays: { type: Number, default: 7 },
  
  // Allow demo registration
  demoRegistrationEnabled: { type: Boolean, default: true },
  
  // Max demo accounts per IP
  maxDemoAccountsPerIp: { type: Number, default: 3 },
  
  // Show demo badge on user profile
  showDemoBadge: { type: Boolean, default: true },
  
  // Allow demo users to see trading history (won't be saved)
  showTradingHistory: { type: Boolean, default: false }
}, { timestamps: true });

// Ensure only one settings document exists
demoSettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

module.exports = mongoose.model('DemoSettings', demoSettingsSchema);
