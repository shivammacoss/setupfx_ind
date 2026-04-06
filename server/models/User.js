const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  oderId: { type: String, required: true, unique: true }, // Auto-generated 6-digit ID starting with 6
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true, minlength: 6 },
  name: { type: String, required: true, trim: true },
  
  // Profile
  profile: {
    avatar: { type: String, default: '' }, // Profile image path/URL
    dateOfBirth: { type: Date, default: null },
    gender: { type: String, enum: ['male', 'female', 'other', ''], default: '' },
    address: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    country: { type: String, default: 'India' },
    pincode: { type: String, default: '' }
  },
  
  // Wallet & Trading Account (Primary - used for trading, always in USD)
  wallet: {
    balance: { type: Number, default: 0 },      // Available balance (free margin) - PRIMARY in USD
    credit: { type: Number, default: 0 },       // Bonus/credit
    equity: { type: Number, default: 0 },       // Balance + unrealized P/L
    margin: { type: Number, default: 0 },       // Used margin
    freeMargin: { type: Number, default: 0 },   // Equity - Margin
    marginLevel: { type: Number, default: 0 },  // (Equity / Margin) * 100
  },
  
  // Multi-Currency Wallet Balances
  walletUSD: {
    balance: { type: Number, default: 0 },      // USD balance
    totalDeposits: { type: Number, default: 0 },
    totalWithdrawals: { type: Number, default: 0 }
  },
  walletINR: {
    balance: { type: Number, default: 0 },      // INR balance
    totalDeposits: { type: Number, default: 0 },
    totalWithdrawals: { type: Number, default: 0 }
  },
  
  // Currency permissions (set by admin)
  allowedCurrencies: {
    USD: { type: Boolean, default: true },
    INR: { type: Boolean, default: true }
  },
  
  // Trading Statistics
  stats: {
    totalTrades: { type: Number, default: 0 },
    winningTrades: { type: Number, default: 0 },
    losingTrades: { type: Number, default: 0 },
    totalProfit: { type: Number, default: 0 },
    totalLoss: { type: Number, default: 0 },
    netPnL: { type: Number, default: 0 }
  },
  
  // Account Settings
  leverage: { type: Number, default: 100 },
  currency: { type: String, default: 'USD' },
  allowedCurrencyDisplay: { type: String, enum: ['USD', 'INR', 'BOTH'], default: 'INR' }, // Admin controls which currencies user can see (default: INR only)
  isActive: { type: Boolean, default: true },
  
  // Trade Mode Settings - which modes this user can access
  allowedTradeModes: {
    hedging: { type: Boolean, default: true },
    netting: { type: Boolean, default: true },
    binary: { type: Boolean, default: true }
  },
  isVerified: { type: Boolean, default: false },
  isEmailVerified: { type: Boolean, default: false },
  isPhoneVerified: { type: Boolean, default: false },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  
  // Security
  passwordChangedAt: { type: Date, default: null },
  passwordResetToken: { type: String, default: null },
  passwordResetExpires: { type: Date, default: null },
  loginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date, default: null },
  
  // Demo account tracking
  isDemo: { type: Boolean, default: false },
  demoCreatedIp: { type: String, default: null },
  demoExpiresAt: { type: Date, default: null },
  demoConvertedToReal: { type: Boolean, default: false },
  demoConvertedAt: { type: Date, default: null },
  
  // KYC Status
  kycVerified: { type: Boolean, default: false },
  kycStatus: { type: String, enum: ['not_submitted', 'pending', 'approved', 'rejected', 'resubmit'], default: 'not_submitted' },
  
  // Saved Bank Accounts for withdrawals
  bankAccounts: [{
    _id: { type: mongoose.Schema.Types.ObjectId, default: () => new mongoose.Types.ObjectId() },
    bankName: { type: String, required: true },
    accountNumber: { type: String, required: true },
    ifsc: { type: String, required: true },
    accountHolder: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  }],
  
  // Saved UPI IDs for withdrawals
  upiAccounts: [{
    _id: { type: mongoose.Schema.Types.ObjectId, default: () => new mongoose.Types.ObjectId() },
    upiId: { type: String, required: true },
    name: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  }],
  
  // IB Referral System
  referredBy: { type: String, default: null }, // Referral code of the IB who referred this user
  referredByIBId: { type: mongoose.Schema.Types.ObjectId, ref: 'IB', default: null },
  
  // Parent Admin/Broker hierarchy
  parentAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  parentAdminOderId: { type: String, default: null }, // For easy lookup (SA/AD/BR prefix)
  
  // User Preferences (moved from localStorage to database)
  preferences: {
    displayCurrency: { type: String, enum: ['USD', 'INR'], default: 'INR' },
    darkMode: { type: Boolean, default: true },
    activePage: { type: String, default: 'home' },
    watchlist: [{ type: String }], // Array of symbol strings
    lastSelectedSymbol: { type: String, default: '' }, // Market chart: last active symbol (persist reload)
    chartTabs: [{ type: String }], // Open chart tabs (same order as UI)
    chartInterval: { type: String, default: '1h' },
    orderPanelSide: { type: String, enum: ['left', 'right'], default: 'right' }
  },
  
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date, default: null }
}, { timestamps: true });


// Hash password before saving
userSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  this.passwordChangedAt = new Date();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Check if password was changed after token was issued
userSchema.methods.changedPasswordAfter = function(JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

// Generate 6-digit user ID starting with 6
userSchema.statics.generateUserId = async function() {
  let userId;
  let exists = true;
  
  while (exists) {
    // Generate random 5 digits and prepend with 6
    const random = Math.floor(10000 + Math.random() * 90000);
    userId = `6${random}`;
    
    // Check if ID already exists
    const existingUser = await this.findOne({ oderId: userId });
    exists = !!existingUser;
  }
  
  return userId;
};

// Calculate equity based on balance and unrealized P/L
userSchema.methods.updateEquity = function(unrealizedPnL) {
  this.wallet.equity = this.wallet.balance + this.wallet.credit + unrealizedPnL;
  this.wallet.freeMargin = this.wallet.equity - this.wallet.margin;
  if (this.wallet.margin > 0) {
    this.wallet.marginLevel = (this.wallet.equity / this.wallet.margin) * 100;
  } else {
    this.wallet.marginLevel = 0;
  }
};

// Check if user has sufficient margin
userSchema.methods.hasSufficientMargin = function(requiredMargin) {
  return this.wallet.freeMargin >= requiredMargin;
};

// Deduct margin for new position
userSchema.methods.useMargin = function(amount) {
  this.wallet.margin += amount;
  this.wallet.freeMargin = this.wallet.equity - this.wallet.margin;
  if (this.wallet.margin > 0) {
    this.wallet.marginLevel = (this.wallet.equity / this.wallet.margin) * 100;
  }
};

// Release margin when position closed
userSchema.methods.releaseMargin = function(amount) {
  this.wallet.margin = Math.max(0, this.wallet.margin - amount);
  this.wallet.freeMargin = this.wallet.equity - this.wallet.margin;
  if (this.wallet.margin > 0) {
    this.wallet.marginLevel = (this.wallet.equity / this.wallet.margin) * 100;
  } else {
    this.wallet.marginLevel = 0;
  }
};

// Settle P/L to balance
userSchema.methods.settlePnL = function(pnl) {
  this.wallet.balance += pnl;
  this.wallet.equity = this.wallet.balance + this.wallet.credit;
  this.wallet.freeMargin = this.wallet.equity - this.wallet.margin;
  
  // Update stats
  this.stats.totalTrades += 1;
  if (pnl >= 0) {
    this.stats.winningTrades += 1;
    this.stats.totalProfit += pnl;
  } else {
    this.stats.losingTrades += 1;
    this.stats.totalLoss += Math.abs(pnl);
  }
  this.stats.netPnL = this.stats.totalProfit - this.stats.totalLoss;
};

// Indexes for 3000+ users performance
// Note: oderId, email, phone already have indexes via unique: true in schema
userSchema.index({ isActive: 1, role: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ parentAdminId: 1 });
userSchema.index({ parentAdminOderId: 1 });

const User = mongoose.model('User', userSchema);

module.exports = User;
