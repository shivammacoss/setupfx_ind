const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  oderId: { type: String, required: true }, // User ID
  
  // Transaction Type
  type: { 
    type: String, 
    enum: ['deposit', 'withdrawal', 'admin_fund_request', 'admin_wallet_adjustment'], 
    required: true 
  },
  
  // Amount
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'USD' },
  
  // Payment Method (optional for admin fund requests)
  paymentMethod: {
    type: String,
    enum: ['bank_transfer', 'upi', 'crypto', 'card', 'wallet', 'admin_transfer'],
    required: false,
    default: null
  },
  
  // Admin Fund Request fields
  adminRequesterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  adminParentId: { type: mongoose.Schema.Types.ObjectId, default: null },
  parentType: { type: String, enum: ['admin', 'user'], default: 'admin' },
  
  // Payment Details (varies by method)
  paymentDetails: {
    // Bank Transfer
    bankName: { type: String },
    accountNumber: { type: String },
    ifscCode: { type: String },
    accountHolderName: { type: String },
    
    // UPI
    upiId: { type: String },
    
    // Crypto
    cryptoType: { type: String }, // BTC, ETH, USDT
    walletAddress: { type: String },
    txHash: { type: String },
    
    // Card
    cardLast4: { type: String },
    cardType: { type: String }, // visa, mastercard
    
    // Reference/UTR
    referenceNumber: { type: String },
    utrNumber: { type: String }
  },
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'processing', 'approved', 'rejected', 'completed', 'failed'],
    default: 'pending'
  },
  
  // Admin Processing
  processedBy: { type: String, default: null }, // Admin user ID
  processedAt: { type: Date, default: null },
  adminNote: { type: String, default: '' },
  rejectionReason: { type: String, default: '' },
  
  // User Notes
  userNote: { type: String, default: '' },
  
  // Proof/Screenshot
  proofImage: { type: String, default: '' },
  
  // User name (for display)
  userName: { type: String, default: '' },
  
  // Withdrawal Info (structured details from user)
  withdrawalInfo: {
    method: { type: String }, // 'bank', 'upi', 'crypto'
    bankDetails: {
      bankName: { type: String },
      accountNumber: { type: String },
      ifsc: { type: String },
      accountHolder: { type: String }
    },
    upiDetails: {
      upiId: { type: String },
      name: { type: String }
    },
    cryptoDetails: {
      network: { type: String },
      address: { type: String }
    }
  },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Index for faster queries
transactionSchema.index({ oderId: 1, type: 1, status: 1 });
transactionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
