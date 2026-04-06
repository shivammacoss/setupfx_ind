const mongoose = require('mongoose');

const zerodhaSettingsSchema = new mongoose.Schema({
  apiKey: { type: String, default: '' },
  apiSecret: { type: String, default: '' },
  accessToken: { type: String, default: null },
  refreshToken: { type: String, default: null },
  tokenExpiry: { type: Date, default: null },
  isConnected: { type: Boolean, default: false },
  lastConnected: { type: Date, default: null },
  
  // Segments to subscribe
  enabledSegments: {
    nseEq: { type: Boolean, default: true },
    bseEq: { type: Boolean, default: true },
    nseFut: { type: Boolean, default: true },
    nseOpt: { type: Boolean, default: true },
    mcxFut: { type: Boolean, default: true },
    mcxOpt: { type: Boolean, default: true },
    bseFut: { type: Boolean, default: false },
    bseOpt: { type: Boolean, default: false }
  },
  
  // Subscribed instruments (instrument tokens) - manually subscribed for WebSocket
  subscribedInstruments: [{
    token: { type: Number },
    symbol: { type: String },
    exchange: { type: String },
    segment: { type: String },
    name: { type: String },
    lotSize: { type: Number, default: 1 },
    tickSize: { type: Number, default: 0.05 },
    expiry: { type: Date, default: null },
    strike: { type: Number, default: null },
    instrumentType: { type: String, default: null }
  }],
  
  // Last time instruments were fetched from Zerodha
  instrumentsLastFetched: { type: Date, default: null },
  
  // Auto-sync settings
  autoSyncEnabled: { type: Boolean, default: true },
  autoRemoveExpired: { type: Boolean, default: true },
  
  // WebSocket status
  wsStatus: {
    type: String,
    enum: ['disconnected', 'connecting', 'connected', 'error'],
    default: 'disconnected'
  },
  wsLastError: { type: String, default: null },
  
  // Callback URL for OAuth
  redirectUrl: { type: String, default: process.env.ZERODHA_REDIRECT_URL || (process.env.NODE_ENV === 'production' ? 'https://api.SetupFX.com/api/zerodha/callback' : 'http://localhost:3001/api/zerodha/callback') }
}, { timestamps: true });

// Ensure only one settings document exists (singleton pattern)
zerodhaSettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({
      apiKey: '',
      apiSecret: ''
    });
  }
  return settings;
};

module.exports = mongoose.model('ZerodhaSettings', zerodhaSettingsSchema);
