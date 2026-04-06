const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const adminSchema = new mongoose.Schema({
  oderId: { type: String, required: true, unique: true }, // Auto-generated ID
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, trim: true },
  password: { type: String, required: true, minlength: 6 },
  name: { type: String, required: true, trim: true },
  
  // Role hierarchy: super_admin > sub_admin > broker
  role: { 
    type: String, 
    enum: ['super_admin', 'sub_admin', 'broker'], 
    required: true 
  },
  
  // Parent reference for hierarchy
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  parentOderId: { type: String, default: null }, // For easy lookup
  
  // Wallet for sub_admin and broker
  wallet: {
    balance: { type: Number, default: 0 },
    credit: { type: Number, default: 0 },
    totalDeposits: { type: Number, default: 0 },
    totalWithdrawals: { type: Number, default: 0 }
  },
  
  // Permissions (can be customized per admin)
  permissions: {
    // Legacy permissions
    canCreateSubAdmin: { type: Boolean, default: false },
    canCreateBroker: { type: Boolean, default: false },
    canCreateUser: { type: Boolean, default: true },
    canApproveFunds: { type: Boolean, default: true },
    canEditTrades: { type: Boolean, default: true },
    canViewReports: { type: Boolean, default: true },
    canManageSymbols: { type: Boolean, default: false },
    canManageCharges: { type: Boolean, default: false },
    canManageSettings: { type: Boolean, default: false },
    // New granular permissions
    viewUserBankDetails: { type: Boolean, default: false },
    viewUserKyc: { type: Boolean, default: false },
    viewDeposits: { type: Boolean, default: true },
    approveDeposits: { type: Boolean, default: false },
    viewWithdrawals: { type: Boolean, default: true },
    approveWithdrawals: { type: Boolean, default: false },
    viewTrades: { type: Boolean, default: true },
    manageTrades: { type: Boolean, default: false },
    viewUsers: { type: Boolean, default: true },
    createUsers: { type: Boolean, default: true },
    editUsers: { type: Boolean, default: true },
    blockUsers: { type: Boolean, default: false },
    adjustUserWallet: { type: Boolean, default: false },
    exportData: { type: Boolean, default: false }
  },
  
  // Status
  isActive: { type: Boolean, default: true },
  
  // Security
  lastLogin: { type: Date, default: null },
  loginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date, default: null },
  
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null }
}, { timestamps: true });

// Hash password before saving and set default permissions
adminSchema.pre('save', async function() {
  // Hash password if modified
  if (this.isModified('password')) {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
  }
  
  // Set default permissions for new admins (only if permissions not provided)
  if (this.isNew && !this.permissions?.viewUsers) {
    if (this.role === 'super_admin') {
      this.permissions = {
        ...this.permissions,
        canCreateSubAdmin: true,
        canCreateBroker: true,
        canCreateUser: true,
        canApproveFunds: true,
        canEditTrades: true,
        canViewReports: true,
        canManageSymbols: true,
        canManageCharges: true,
        canManageSettings: true,
        viewUserBankDetails: true,
        viewUserKyc: true,
        viewDeposits: true,
        approveDeposits: true,
        viewWithdrawals: true,
        approveWithdrawals: true,
        viewTrades: true,
        manageTrades: true,
        viewUsers: true,
        createUsers: true,
        editUsers: true,
        blockUsers: true,
        adjustUserWallet: true,
        exportData: true
      };
    } else if (this.role === 'sub_admin') {
      this.permissions = {
        ...this.permissions,
        canCreateSubAdmin: false,
        canCreateBroker: true,
        canCreateUser: true,
        canApproveFunds: true,
        canEditTrades: true,
        canViewReports: true,
        canManageSymbols: false,
        canManageCharges: false,
        canManageSettings: false,
        viewUserBankDetails: true,
        viewUserKyc: true,
        viewDeposits: true,
        approveDeposits: true,
        viewWithdrawals: true,
        approveWithdrawals: true,
        viewTrades: true,
        manageTrades: true,
        viewUsers: true,
        createUsers: true,
        editUsers: true,
        blockUsers: true,
        adjustUserWallet: true,
        exportData: true
      };
    } else if (this.role === 'broker') {
      this.permissions = {
        ...this.permissions,
        canCreateSubAdmin: false,
        canCreateBroker: false,
        canCreateUser: true,
        canApproveFunds: true,
        canEditTrades: true,
        canViewReports: true,
        canManageSymbols: false,
        canManageCharges: false,
        canManageSettings: false,
        viewUserBankDetails: false,
        viewUserKyc: false,
        viewDeposits: true,
        approveDeposits: false,
        viewWithdrawals: true,
        approveWithdrawals: false,
        viewTrades: true,
        manageTrades: false,
        viewUsers: true,
        createUsers: true,
        editUsers: false,
        blockUsers: false,
        adjustUserWallet: false,
        exportData: false
      };
    }
  }
});

// Compare password method
adminSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate admin ID based on role
adminSchema.statics.generateAdminId = async function(role) {
  let prefix;
  switch(role) {
    case 'super_admin': prefix = 'SA'; break;
    case 'sub_admin': prefix = 'AD'; break;
    case 'broker': prefix = 'BR'; break;
    default: prefix = 'XX';
  }
  
  let adminId;
  let exists = true;
  
  while (exists) {
    const random = Math.floor(10000 + Math.random() * 90000);
    adminId = `${prefix}${random}`;
    const existing = await this.findOne({ oderId: adminId });
    exists = !!existing;
  }
  
  return adminId;
};

// Get all children (sub-admins, brokers) under this admin
adminSchema.methods.getChildren = async function() {
  return await this.model('Admin').find({ parentId: this._id });
};

// Check if this admin can manage another admin
adminSchema.methods.canManage = function(targetAdmin) {
  if (this.role === 'super_admin') return true;
  if (this.role === 'sub_admin' && targetAdmin.parentId?.toString() === this._id.toString()) return true;
  return false;
};

// Indexes
adminSchema.index({ role: 1, isActive: 1 });
adminSchema.index({ parentId: 1 });
adminSchema.index({ parentOderId: 1 });

const Admin = mongoose.model('Admin', adminSchema);

module.exports = Admin;
