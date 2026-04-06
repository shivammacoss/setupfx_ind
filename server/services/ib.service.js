const mongoose = require('mongoose');
const IB = require('../models/IB');
const IBCommission = require('../models/IBCommission');
const Wallet = require('../models/Wallet');
const IBCopySettings = require('../models/IBCopySettings');
const User = require('../models/User');

/**
 * IB (Introducing Broker) Service
 * Handles IB registration, management, and referral tracking
 */
class IBService {
  /**
   * Apply to become an IB
   */
  async applyForIB(userId, applicationData) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Check if already an IB
    const existingIB = await IB.findOne({ userId });
    if (existingIB) {
      if (existingIB.status === 'rejected') {
        // Allow reapplication
        existingIB.status = 'pending';
        existingIB.applicationDetails = applicationData;
        existingIB.appliedAt = new Date();
        existingIB.rejectedReason = '';
        await existingIB.save();
        return existingIB;
      }
      throw new Error('Already applied or active as IB');
    }

    // Get settings
    const settings = await IBCopySettings.getSettings();
    if (!settings.ib.enabled) {
      throw new Error('IB program is currently disabled');
    }

    // Generate referral code
    const referralCode = await IB.generateReferralCode();

    // Check if user was referred by another IB
    let parentIBId = null;
    let parentReferralCode = null;
    let level = 1;

    if (user.referredBy) {
      const parentIB = await IB.findOne({ referralCode: user.referredBy, status: 'active' });
      if (parentIB) {
        parentIBId = parentIB._id;
        parentReferralCode = parentIB.referralCode;
        level = Math.min(parentIB.level + 1, settings.ib.maxLevels);
      }
    }

    // Create IB record
    const ib = await IB.create({
      userId: user._id,
      oderId: user.oderId,
      referralCode,
      status: settings.ib.autoApprove ? 'active' : 'pending',
      parentIBId,
      parentReferralCode,
      level,
      commissionSettings: {
        type: settings.ib.defaultCommission.type,
        perLotAmount: settings.ib.defaultCommission.perLotAmount,
        revenuePercent: settings.ib.defaultCommission.revenuePercent,
        spreadSharePercent: settings.ib.defaultCommission.spreadSharePercent,
        multiLevelRates: settings.ib.defaultMultiLevelRates
      },
      applicationDetails: applicationData,
      approvedAt: settings.ib.autoApprove ? new Date() : null
    });

    // Create IB wallet
    await Wallet.create({
      userId: user._id,
      oderId: user.oderId,
      type: 'ib',
      balance: 0
    });

    // Update parent IB stats if exists
    if (parentIBId) {
      await IB.findByIdAndUpdate(parentIBId, {
        $inc: { 'stats.totalSubIBs': 1 }
      });
    }

    return ib;
  }

  /**
   * Get IB by user ID
   */
  async getIBByUserId(userId) {
    return await IB.findOne({ userId }).populate('userId', 'name email oderId');
  }

  /**
   * Get IB by referral code
   */
  async getIBByReferralCode(referralCode) {
    return await IB.findOne({ referralCode: referralCode.toUpperCase(), status: 'active' });
  }

  /**
   * Register user under IB referral
   */
  async registerReferral(userId, referralCode) {
    const ib = await IB.findOne({ referralCode: referralCode.toUpperCase(), status: 'active' });
    if (!ib) {
      throw new Error('Invalid or inactive referral code');
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (user.referredBy) {
      throw new Error('User already has a referrer');
    }

    // Update user with referral
    user.referredBy = referralCode.toUpperCase();
    user.referredByIBId = ib._id;
    await user.save();

    // Update IB stats
    ib.stats.totalReferrals += 1;
    ib.stats.activeReferrals += 1;
    ib.lastActivityAt = new Date();
    await ib.save();

    return { user, ib };
  }

  /**
   * Get IB's referrals
   */
  async getReferrals(ibId, options = {}) {
    const { page = 1, limit = 20, status = null } = options;

    const ib = await IB.findById(ibId);
    if (!ib) {
      throw new Error('IB not found');
    }

    const query = { referredBy: ib.referralCode };
    if (status === 'active') {
      query.isActive = true;
    } else if (status === 'inactive') {
      query.isActive = false;
    }

    const total = await User.countDocuments(query);
    const referrals = await User.find(query)
      .select('name email oderId isActive createdAt stats.totalTrades stats.netPnL wallet.balance')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return {
      referrals,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get IB's sub-IBs (downline)
   */
  async getSubIBs(ibId, options = {}) {
    const { page = 1, limit = 20 } = options;

    const query = { parentIBId: ibId };

    const total = await IB.countDocuments(query);
    const subIBs = await IB.find(query)
      .populate('userId', 'name email oderId')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return {
      subIBs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get IB dashboard data
   */
  async getDashboard(ibId) {
    const ib = await IB.findById(ibId).populate('userId', 'name email oderId');
    if (!ib) {
      throw new Error('IB not found');
    }

    // Get wallet
    const wallet = await Wallet.findOne({ userId: ib.userId, type: 'ib' });

    // Get recent commissions
    const recentCommissions = await IBCommission.find({ ibId })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('referredUserId', 'name oderId');

    // Get referral stats
    const referralStats = await User.aggregate([
      { $match: { referredBy: ib.referralCode } },
      {
        $group: {
          _id: null,
          totalReferrals: { $sum: 1 },
          activeReferrals: { $sum: { $cond: ['$isActive', 1, 0] } },
          totalVolume: { $sum: '$stats.totalTrades' },
          totalPnL: { $sum: '$stats.netPnL' }
        }
      }
    ]);

    return {
      ib,
      wallet,
      recentCommissions,
      referralStats: referralStats[0] || {
        totalReferrals: 0,
        activeReferrals: 0,
        totalVolume: 0,
        totalPnL: 0
      }
    };
  }

  /**
   * Request withdrawal from IB wallet
   */
  async requestWithdrawal(ibId, amount, withdrawalDetails) {
    const ib = await IB.findById(ibId);
    if (!ib) {
      throw new Error('IB not found');
    }

    const settings = await IBCopySettings.getSettings();
    if (amount < settings.ib.minWithdrawal) {
      throw new Error(`Minimum withdrawal amount is $${settings.ib.minWithdrawal}`);
    }

    const wallet = await Wallet.findOne({ userId: ib.userId, type: 'ib' });
    if (!wallet || wallet.balance < amount) {
      throw new Error('Insufficient balance');
    }

    // Freeze the amount
    wallet.frozenBalance += amount;
    wallet.pendingWithdrawal += amount;
    await wallet.save();

    // Update IB wallet stats
    ib.wallet.pendingWithdrawal += amount;
    await ib.save();

    // Create withdrawal request (would integrate with your existing withdrawal system)
    return {
      status: 'pending',
      amount,
      message: 'Withdrawal request submitted for admin approval'
    };
  }

  // ===== ADMIN FUNCTIONS =====

  /**
   * Get all IBs (admin)
   */
  async getAllIBs(options = {}) {
    const { page = 1, limit = 20, status = null, search = null } = options;

    const query = {};
    if (status) {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { referralCode: { $regex: search, $options: 'i' } },
        { oderId: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await IB.countDocuments(query);
    const ibs = await IB.find(query)
      .populate('userId', 'name email oderId')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return {
      ibs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get pending IB applications (admin)
   */
  async getPendingApplications(options = {}) {
    return await this.getAllIBs({ ...options, status: 'pending' });
  }

  /**
   * Approve IB application (admin)
   */
  async approveIB(ibId, adminId, commissionSettings = null) {
    const ib = await IB.findById(ibId);
    if (!ib) {
      throw new Error('IB not found');
    }

    if (ib.status !== 'pending') {
      throw new Error('IB is not in pending status');
    }

    ib.status = 'active';
    ib.approvedBy = adminId;
    ib.approvedAt = new Date();

    if (commissionSettings) {
      ib.commissionSettings = { ...ib.commissionSettings, ...commissionSettings };
    }

    await ib.save();
    return ib;
  }

  /**
   * Reject IB application (admin)
   */
  async rejectIB(ibId, adminId, reason) {
    const ib = await IB.findById(ibId);
    if (!ib) {
      throw new Error('IB not found');
    }

    ib.status = 'rejected';
    ib.rejectedReason = reason;
    await ib.save();

    return ib;
  }

  /**
   * Suspend IB (admin)
   */
  async suspendIB(ibId, adminId, reason) {
    const ib = await IB.findById(ibId);
    if (!ib) {
      throw new Error('IB not found');
    }

    ib.status = 'suspended';
    ib.adminNotes = `Suspended: ${reason}`;
    await ib.save();

    return ib;
  }

  /**
   * Reactivate IB (admin)
   */
  async reactivateIB(ibId, adminId) {
    const ib = await IB.findById(ibId);
    if (!ib) {
      throw new Error('IB not found');
    }

    if (ib.status !== 'suspended') {
      throw new Error('IB is not suspended');
    }

    ib.status = 'active';
    ib.adminNotes = '';
    await ib.save();

    return ib;
  }

  /**
   * Update IB commission settings (admin)
   */
  async updateCommissionSettings(ibId, commissionSettings) {
    const ib = await IB.findById(ibId);
    if (!ib) {
      throw new Error('IB not found');
    }

    ib.commissionSettings = { ...ib.commissionSettings, ...commissionSettings };
    await ib.save();

    return ib;
  }

  /**
   * Get IB statistics summary (admin)
   */
  async getIBStatsSummary() {
    const stats = await IB.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalCommission: { $sum: '$stats.totalCommissionEarned' },
          totalReferrals: { $sum: '$stats.totalReferrals' },
          totalLots: { $sum: '$stats.totalLotsTraded' }
        }
      }
    ]);

    const summary = {
      total: 0,
      active: 0,
      pending: 0,
      suspended: 0,
      rejected: 0,
      totalCommissionPaid: 0,
      totalReferrals: 0,
      totalLotsTraded: 0
    };

    stats.forEach(s => {
      summary.total += s.count;
      summary[s._id] = s.count;
      summary.totalCommissionPaid += s.totalCommission;
      summary.totalReferrals += s.totalReferrals;
      summary.totalLotsTraded += s.totalLots;
    });

    return summary;
  }
}

module.exports = new IBService();
