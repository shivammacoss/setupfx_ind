const mongoose = require('mongoose');

const trueDataSettingsSchema = new mongoose.Schema({
  username: { type: String, default: '' },
  password: { type: String, default: '' },
  port: { type: Number, default: 8086 },
  isEnabled: { type: Boolean, default: false },
  isConnected: { type: Boolean, default: false },
  lastConnected: { type: Date, default: null },
  wsStatus: {
    type: String,
    enum: ['disconnected', 'connecting', 'connected', 'error'],
    default: 'disconnected'
  },
  wsLastError: { type: String, default: null },
  isPrimaryForIndian: { type: Boolean, default: false },
  subscribedSymbols: [{
    symbol: { type: String, required: true },
    exchange: { type: String, default: 'NSE' },
    segment: { type: String, default: '' },
    name: { type: String, default: '' },
    lotSize: { type: Number, default: 1 },
    expiry: { type: Date, default: null },
    strike: { type: Number, default: null },
    instrumentType: { type: String, default: null }
  }],
  maxSymbols: { type: Number, default: 50 },
  trialExpiry: { type: Date, default: new Date('2026-04-19') }
}, { timestamps: true });

// Singleton pattern
trueDataSettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({
      username: process.env.TRUEDATA_USERNAME || '',
      password: process.env.TRUEDATA_PASSWORD || '',
      port: parseInt(process.env.TRUEDATA_PORT) || 8086
    });
  }
  return settings;
};

module.exports = mongoose.model('TrueDataSettings', trueDataSettingsSchema);
