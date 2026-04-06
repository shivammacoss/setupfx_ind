const mongoose = require('mongoose');
const IB = require('../models/IB');
const CopyMaster = require('../models/CopyMaster');
const CopyFollower = require('../models/CopyFollower');
const Wallet = require('../models/Wallet');
const IBCommission = require('../models/IBCommission');
const IBCopySettings = require('../models/IBCopySettings');

/**
 * Settlement Service
 * Handles daily/periodic settlement tasks
 */
class SettlementService {
  /**
   * Run daily settlement (called by cron)
   */
  async runDailySettlement() {
    console.log('[Settlement] Starting daily settlement...');
    const results = {
      ibMonthlyReset: false,
      subscriptionBilling: 0,
      errors: []
    };

    try {
      // Check if it's the first day of the month - reset monthly stats
      const today = new Date();
      if (today.getDate() === 1) {
        await this.resetMonthlyStats();
        results.ibMonthlyReset = true;
      }

      // Process subscription fees for copy trading
      const billedCount = await this.processSubscriptionFees();
      results.subscriptionBilling = billedCount;

      // Update master statistics
      await this.updateMasterStatistics();

      // Clean up stale data
      await this.cleanupStaleData();

      console.log('[Settlement] Daily settlement completed:', results);
      return results;
    } catch (error) {
      console.error('[Settlement] Error during daily settlement:', error);
      results.errors.push(error.message);
      return results;
    }
  }

  /**
   * Reset monthly statistics for IBs
   */
  async resetMonthlyStats() {
    console.log('[Settlement] Resetting monthly IB stats...');
    
    await IB.updateMany(
      { status: 'active' },
      {
        $set: {
          'stats.thisMonthCommission': 0,
          'stats.thisMonthLots': 0
        }
      }
    );

    console.log('[Settlement] Monthly IB stats reset completed');
  }

  /**
   * Process monthly subscription fees for copy trading
   */
  async processSubscriptionFees() {
    console.log('[Settlement] Processing subscription fees...');
    
    const settings = await IBCopySettings.getSettings();
    let billedCount = 0;

    // Find followers with subscription fees due
    const now = new Date();
    const followers = await CopyFollower.find({
      status: 'active',
      'subscription.nextBillingAt': { $lte: now }
    }).populate('masterId');

    for (const follower of followers) {
      try {
        const master = follower.masterId;
        if (!master || master.feeSettings.subscriptionFee <= 0) {
          // Update next billing date even if no fee
          follower.subscription.lastBilledAt = now;
          follower.subscription.nextBillingAt = this.getNextBillingDate(follower.subscription.billingCycle);
          await follower.save();
          continue;
        }

        const fee = master.feeSettings.subscriptionFee;

        // Check if follower has sufficient balance
        const followerUser = await mongoose.model('User').findById(follower.followerId);
        if (!followerUser || followerUser.wallet.balance < fee) {
          // Pause subscription due to insufficient funds
          follower.status = 'paused';
          follower.pausedAt = now;
          follower.stopReason = 'Insufficient balance for subscription fee';
          await follower.save();
          continue;
        }

        const session = await mongoose.startSession();
        session.startTransaction();

        try {
          // Debit from follower
          followerUser.wallet.balance -= fee;
          await followerUser.save({ session });

          // Credit to master wallet
          let masterWallet = await Wallet.findOne({ 
            userId: master.userId, 
            type: 'copy_master' 
          }).session(session);

          if (masterWallet) {
            masterWallet.balance += fee;
            masterWallet.totalEarned += fee;
            masterWallet.subscriptionFeeEarned = (masterWallet.subscriptionFeeEarned || 0) + fee;
            await masterWallet.save({ session });
          }

          // Update master stats
          master.wallet.balance += fee;
          master.wallet.totalEarned += fee;
          master.wallet.subscriptionFeeEarned += fee;
          await master.save({ session });

          // Update follower
          follower.stats.totalSubscriptionFeePaid += fee;
          follower.stats.totalFeesPaid += fee;
          follower.subscription.lastBilledAt = now;
          follower.subscription.nextBillingAt = this.getNextBillingDate(follower.subscription.billingCycle);
          await follower.save({ session });

          await session.commitTransaction();
          billedCount++;
        } catch (error) {
          await session.abortTransaction();
          console.error(`[Settlement] Error billing follower ${follower._id}:`, error);
        } finally {
          session.endSession();
        }
      } catch (error) {
        console.error(`[Settlement] Error processing follower ${follower._id}:`, error);
      }
    }

    console.log(`[Settlement] Processed ${billedCount} subscription fees`);
    return billedCount;
  }

  /**
   * Get next billing date based on cycle
   */
  getNextBillingDate(cycle) {
    const now = new Date();
    if (cycle === 'weekly') {
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    }
    // Default monthly
    const nextMonth = new Date(now);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    return nextMonth;
  }

  /**
   * Update master statistics (win rate, profit factor, etc.)
   */
  async updateMasterStatistics() {
    console.log('[Settlement] Updating master statistics...');

    const masters = await CopyMaster.find({ status: 'active' });

    for (const master of masters) {
      try {
        master.updateStats();
        
        // Calculate monthly returns
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        
        // Find or create monthly return entry
        let monthlyReturn = master.stats.monthlyReturns.find(m => m.month === monthKey);
        if (!monthlyReturn) {
          master.stats.monthlyReturns.push({
            month: monthKey,
            returnPercent: 0,
            profit: 0
          });
        }

        await master.save();
      } catch (error) {
        console.error(`[Settlement] Error updating master ${master._id}:`, error);
      }
    }

    console.log('[Settlement] Master statistics updated');
  }

  /**
   * Clean up stale data
   */
  async cleanupStaleData() {
    console.log('[Settlement] Cleaning up stale data...');

    // Remove old pending commissions (older than 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    await IBCommission.deleteMany({
      status: 'pending',
      createdAt: { $lt: thirtyDaysAgo }
    });

    console.log('[Settlement] Stale data cleanup completed');
  }

  /**
   * Process end-of-day settlement for copy trading
   * Called when market closes
   */
  async processEndOfDaySettlement() {
    console.log('[Settlement] Processing end-of-day settlement...');

    // Update all follower equity and HWM
    const followers = await CopyFollower.find({ status: 'active' });

    for (const follower of followers) {
      try {
        // Get follower's current equity from their trading account
        const followerUser = await mongoose.model('User').findById(follower.followerId);
        if (followerUser) {
          const currentEquity = followerUser.wallet.equity || followerUser.wallet.balance;
          follower.updateHighWaterMark(currentEquity);
          await follower.save();
        }
      } catch (error) {
        console.error(`[Settlement] Error updating follower ${follower._id}:`, error);
      }
    }

    console.log('[Settlement] End-of-day settlement completed');
  }

  /**
   * Generate settlement report
   */
  async generateSettlementReport(startDate, endDate) {
    const report = {
      period: { startDate, endDate },
      ib: {
        totalCommissionsPaid: 0,
        commissionsByType: {},
        topIBs: []
      },
      copyTrading: {
        totalFeesPaid: 0,
        performanceFees: 0,
        lotFees: 0,
        subscriptionFees: 0,
        topMasters: []
      }
    };

    // IB Commissions
    const ibCommissions = await IBCommission.aggregate([
      {
        $match: {
          status: 'credited',
          createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) }
        }
      },
      {
        $group: {
          _id: '$commissionType',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    ibCommissions.forEach(c => {
      report.ib.commissionsByType[c._id] = { total: c.total, count: c.count };
      report.ib.totalCommissionsPaid += c.total;
    });

    // Top IBs
    report.ib.topIBs = await IB.find({ status: 'active' })
      .sort({ 'stats.totalCommissionEarned': -1 })
      .limit(10)
      .populate('userId', 'name oderId');

    // Copy Trading fees
    const copyFees = await CopyFollower.aggregate([
      {
        $group: {
          _id: null,
          totalPerformanceFee: { $sum: '$stats.totalPerformanceFeePaid' },
          totalLotFee: { $sum: '$stats.totalLotFeePaid' },
          totalSubscriptionFee: { $sum: '$stats.totalSubscriptionFeePaid' }
        }
      }
    ]);

    if (copyFees.length > 0) {
      report.copyTrading.performanceFees = copyFees[0].totalPerformanceFee;
      report.copyTrading.lotFees = copyFees[0].totalLotFee;
      report.copyTrading.subscriptionFees = copyFees[0].totalSubscriptionFee;
      report.copyTrading.totalFeesPaid = 
        copyFees[0].totalPerformanceFee + 
        copyFees[0].totalLotFee + 
        copyFees[0].totalSubscriptionFee;
    }

    // Top Masters
    report.copyTrading.topMasters = await CopyMaster.find({ status: 'active' })
      .sort({ 'wallet.totalEarned': -1 })
      .limit(10)
      .populate('userId', 'name oderId');

    return report;
  }
}

module.exports = new SettlementService();
