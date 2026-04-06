const mongoose = require('mongoose');

// Trade History Schema - All executed trades
const tradeSchema = new mongoose.Schema({
  tradeId: { type: String, required: true, unique: true },
  oderId: { type: String, index: true }, // Reference to position
  userId: { type: String, required: true, index: true },
  mode: { type: String, enum: ['hedging', 'netting', 'binary'], required: true },
  symbol: { type: String, required: true },
  side: { type: String, enum: ['buy', 'sell', 'up', 'down'], required: true },
  
  // Volume/Quantity
  volume: { type: Number, default: null }, // For hedging (lots)
  quantity: { type: Number, default: null }, // For netting (units)
  amount: { type: Number, default: null }, // For binary ($)
  
  // Prices
  entryPrice: { type: Number, required: true },
  closePrice: { type: Number, default: null },
  originalPrice: { type: Number, default: null }, // Original price before reorder delay
  
  // Reorder (delayed execution)
  reorderDelay: { type: Number, default: 0 }, // Delay in seconds applied
  
  // SL/TP
  stopLoss: { type: Number, default: null },
  takeProfit: { type: Number, default: null },
  
  // Trade details
  leverage: { type: Number, default: null },
  session: { type: String, default: null }, // For netting: intraday/carryforward
  lotSize: { type: Number, default: 1 }, // Exchange lot size for F&O
  exchange: { type: String, default: null }, // NSE, NFO, MCX, BFO
  segment: { type: String, default: null }, // NSE, NFO-FUT, NFO-OPT, etc.
  expiry: { type: Number, default: null }, // For binary
  
  // Type of trade action
  type: { 
    type: String, 
    enum: ['open', 'close', 'partial_close', 'modify', 'binary', 'cancelled'], 
    required: true 
  },
  
  // Results
  profit: { type: Number, default: 0 },
  commission: { type: Number, default: 0 },
  commissionInr: { type: Number, default: 0 }, // Original INR amount for display
  charges: { type: Number, default: 0 },
  swap: { type: Number, default: 0 },
  result: { type: String, default: null }, // For binary: win/lose/tie
  
  // Who closed the trade
  closedBy: { type: String, enum: ['user', 'admin', 'system', 'sl', 'tp', 'stop_out', null], default: null },
  remark: { type: String, default: null }, // Close reason label: 'User', 'Admin', 'SL', 'TP', 'Stop Out', 'Auto Square-Off', 'Expiry'
  
  // Timestamps
  executedAt: { type: Date, default: Date.now },
  closedAt: { type: Date, default: null }
}, { timestamps: true });

// Indexes for efficient queries
tradeSchema.index({ userId: 1, executedAt: -1 });
tradeSchema.index({ userId: 1, mode: 1 });
tradeSchema.index({ symbol: 1, executedAt: -1 });

const Trade = mongoose.model('Trade', tradeSchema);

module.exports = Trade;
