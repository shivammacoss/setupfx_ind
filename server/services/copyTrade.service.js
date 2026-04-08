const mongoose = require('mongoose');
const CopyMaster = require('../models/CopyMaster');
const CopyFollower = require('../models/CopyFollower');
const CopyTrade = require('../models/CopyTrade');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const IBCopySettings = require('../models/IBCopySettings');
const User = require('../models/User');

/**
 * Copy Trading Service
 * Handles master registration, follower subscriptions, and trade copying
 */
class CopyTradeService {
  /**
   * Apply to become a Copy Master
   */
  async applyForMaster(userId, applicationData) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Check if already a master
    const existingMaster = await CopyMaster.findOne({ userId });
    if (existingMaster) {
      if (existingMaster.status === 'rejected') {
        // Allow reapplication
        existingMaster.status = 'pending';
        existingMaster.applicationDetails = applicationData;
        existingMaster.displayName = applicationData.displayName || user.name;
        existingMaster.description = applicationData.description || '';
        existingMaster.appliedAt = new Date();
        existingMaster.rejectedReason = '';
        await existingMaster.save();
        return existingMaster;
      }
      throw new Error('Already applied or active as Copy Master');
    }

    // Get settings
    const settings = await IBCopySettings.getSettings();
    if (!settings.copyTrading.enabled) {
      throw new Error('Copy Trading is currently disabled');
    }

    // Check minimum requirements
    if (settings.copyTrading.minTradesToBecomeMaster > 0) {
      if (user.stats.totalTrades < settings.copyTrading.minTradesToBecomeMaster) {
        throw new Error(`Minimum ${settings.copyTrading.minTradesToBecomeMaster} trades required to become a master`);
      }
    }

    // Create master record
    const master = await CopyMaster.create({
      userId: user._id,
      oderId: user.oderId,
      displayName: applicationData.displayName || user.name,
      description: applicationData.description || '',
      status: settings.copyTrading.autoApprove ? 'active' : 'pending',
      feeSettings: {
        performanceFeePercent: Math.min(
          applicationData.performanceFeePercent || settings.copyTrading.defaultFees.performanceFeePercent,
          settings.copyTrading.maxPerformanceFee
        ),
        perLotFee: Math.min(
          applicationData.perLotFee || settings.copyTrading.defaultFees.perLotFee,
          settings.copyTrading.maxPerLotFee
        ),
        subscriptionFee: Math.min(
          applicationData.subscriptionFee || settings.copyTrading.defaultFees.subscriptionFee,
          settings.copyTrading.maxSubscriptionFee
        ),
        minInvestment: applicationData.minInvestment || settings.copyTrading.defaultFees.minInvestment
      },
      followerSettings: {
        maxFollowers: settings.copyTrading.defaultMaxFollowers,
        acceptingNewFollowers: true
      },
      riskSettings: {
        maxDrawdownPercent: settings.copyTrading.defaultMaxDrawdown
      },
      applicationDetails: applicationData,
      approvedAt: settings.copyTrading.autoApprove ? new Date() : null,
      stats: {
        peakEquity: user.wallet.balance
      }
    });

    // Create copy master wallet
    await Wallet.create({
      userId: user._id,
      oderId: user.oderId,
      type: 'copy_master',
      balance: 0
    });

    return master;
  }

  /**
   * Get master by user ID
   */
  async getMasterByUserId(userId) {
    return await CopyMaster.findOne({ userId }).populate('userId', 'name email oderId wallet');
  }

  /**
   * Get all active masters (public list)
   */
  async getActiveMasters(options = {}) {
    const { page = 1, limit = 20, sortBy = 'stats.netProfitUSD', sortOrder = -1 } = options;

    const query = { status: 'active', isPublic: true };

    const total = await CopyMaster.countDocuments(query);
    const masters = await CopyMaster.find(query)
      .select('-applicationDetails -adminNotes')
      .populate('userId', 'name oderId')
      .sort({ [sortBy]: sortOrder })
      .skip((page - 1) * limit)
      .limit(limit);

    return {
      masters,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Subscribe to a master (become a follower)
   */
  async subscribeToMaster(followerId, masterId, copySettings) {
    const follower = await User.findById(followerId);
    if (!follower) {
      throw new Error('User not found');
    }

    const master = await CopyMaster.findById(masterId);
    if (!master) {
      throw new Error('Master not found');
    }

    if (master.status !== 'active') {
      throw new Error('Master is not active');
    }

    if (!master.canAcceptFollowers()) {
      throw new Error('Master is not accepting new followers');
    }

    // Check if already following
    const existingFollow = await CopyFollower.findOne({ followerId, masterId });
    if (existingFollow && existingFollow.status === 'active') {
      throw new Error('Already following this master');
    }

    // Check minimum investment
    if (copySettings.investmentAmount < master.feeSettings.minInvestment) {
      throw new Error(`Minimum investment is $${master.feeSettings.minInvestment}`);
    }

    // Check user has sufficient balance
    if (follower.wallet.balance < copySettings.investmentAmount) {
      throw new Error('Insufficient balance for investment');
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Create or update follower record
      let copyFollower;
      if (existingFollow) {
        existingFollow.status = 'active';
        existingFollow.copySettings = {
          ...existingFollow.copySettings,
          ...copySettings
        };
        existingFollow.startedAt = new Date();
        existingFollow.stoppedAt = null;
        existingFollow.stopReason = null;
        await existingFollow.save({ session });
        copyFollower = existingFollow;
      } else {
        copyFollower = await CopyFollower.create([{
          followerId: follower._id,
          followerOderId: follower.oderId,
          masterId: master._id,
          masterOderId: master.oderId,
          status: 'active',
          copySettings: {
            mode: copySettings.mode || 'proportional',
            fixedLotSize: copySettings.fixedLotSize || 0.01,
            copyRatio: copySettings.copyRatio || 1,
            fixedAmount: copySettings.fixedAmount || 100,
            maxLotSize: copySettings.maxLotSize || 1,
            investmentAmount: copySettings.investmentAmount,
            maxLossPercent: copySettings.maxLossPercent || 30,
            copySLTP: copySettings.copySLTP !== false,
            reverseCopy: copySettings.reverseCopy || false
          },
          highWaterMark: {
            value: copySettings.investmentAmount,
            lastUpdated: new Date()
          },
          stats: {
            currentEquity: copySettings.investmentAmount,
            peakEquity: copySettings.investmentAmount
          }
        }], { session });
        copyFollower = copyFollower[0];
      }

      // Update master follower count
      master.followerSettings.currentFollowers += 1;
      master.followerSettings.totalFollowersAllTime += 1;
      await master.save({ session });

      await session.commitTransaction();
      return copyFollower;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Unsubscribe from a master
   */
  async unsubscribeFromMaster(followerId, masterId, reason = 'User requested') {
    const copyFollower = await CopyFollower.findOne({ followerId, masterId, status: 'active' });
    if (!copyFollower) {
      throw new Error('Not following this master');
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Close all active copied positions (would integrate with trading engine)
      // For now, just mark them as closed
      copyFollower.status = 'stopped';
      copyFollower.stopReason = reason;
      copyFollower.stoppedAt = new Date();
      copyFollower.activePositions = [];
      await copyFollower.save({ session });

      // Update master follower count
      await CopyMaster.findByIdAndUpdate(masterId, {
        $inc: { 'followerSettings.currentFollowers': -1 }
      }, { session });

      await session.commitTransaction();
      return copyFollower;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Process master's trade open - copy to all followers
   */
  async processMasterTradeOpen(masterUserId, tradeData) {
    const master = await CopyMaster.findOne({ userId: masterUserId, status: 'active' });
    if (!master) {
      return []; // Not a master or not active
    }

    const {
      tradeId,
      positionId,
      symbol,
      side,
      volume,
      entryPrice,
      stopLoss,
      takeProfit
    } = tradeData;

    // Get all active followers
    const followers = await CopyFollower.find({
      masterId: master._id,
      status: 'active'
    }).populate('followerId');

    const copyTrades = [];

    for (const follower of followers) {
      try {
        // Check if should stop copying due to risk limits
        const riskCheck = follower.shouldStopCopying();
        if (riskCheck.stop) {
          await this.unsubscribeFromMaster(follower.followerId, master._id, riskCheck.reason);
          continue;
        }

        // Calculate follower's volume based on copy settings
        const followerVolume = this.calculateFollowerVolume(follower, volume, master);

        if (followerVolume <= 0) {
          continue;
        }

        // Create copy trade record
        const copyTrade = await CopyTrade.create({
          masterTradeId: tradeId,
          masterPositionId: positionId,
          masterId: master._id,
          masterOderId: master.oderId,
          followerId: follower.followerId._id,
          followerOderId: follower.followerOderId,
          copyFollowerId: follower._id,
          symbol,
          side: follower.copySettings.reverseCopy ? (side === 'buy' ? 'sell' : 'buy') : side,
          masterVolume: volume,
          followerVolume,
          copyRatio: follower.copySettings.copyRatio,
          masterEntryPrice: entryPrice,
          stopLoss: follower.copySettings.copySLTP ? stopLoss : null,
          takeProfit: follower.copySettings.copySLTP ? takeProfit : null,
          status: 'pending',
          hwmAtOpen: follower.highWaterMark.value,
          masterOpenedAt: new Date()
        });

        // Add to follower's active positions
        follower.activePositions.push({
          masterPositionId: positionId,
          followerPositionId: null, // Will be set when trade executes
          symbol,
          side: copyTrade.side,
          volume: followerVolume,
          entryPrice: null,
          openedAt: new Date()
        });
        await follower.save();

        copyTrades.push(copyTrade);

        // Here you would integrate with your trading engine to actually execute the trade
        // For now, we just create the record
        // await tradingEngine.executeTrade(follower.followerId, copyTrade);

      } catch (error) {
        console.error(`Error copying trade for follower ${follower.followerOderId}:`, error);
      }
    }

    // Update master stats
    master.stats.totalTrades += 1;
    master.stats.totalLotsTraded += volume;
    master.lastTradeAt = new Date();
    await master.save();

    return copyTrades;
  }

  /**
   * Process master's trade close - close copied trades and calculate fees
   */
  async processMasterTradeClose(masterUserId, tradeData) {
    const master = await CopyMaster.findOne({ userId: masterUserId, status: 'active' });
    if (!master) {
      return [];
    }

    const {
      tradeId,
      positionId,
      closePrice,
      profit
    } = tradeData;

    // Find all copy trades for this master position
    const copyTrades = await CopyTrade.find({
      masterPositionId: positionId,
      status: { $in: ['pending', 'open'] }
    }).populate('copyFollowerId');

    const results = [];

    for (const copyTrade of copyTrades) {
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        const follower = copyTrade.copyFollowerId;
        
        // Calculate follower's profit (proportional to volume ratio)
        const volumeRatio = copyTrade.followerVolume / copyTrade.masterVolume;
        const followerProfit = profit * volumeRatio;

        // Update copy trade
        copyTrade.masterClosePrice = closePrice;
        copyTrade.followerClosePrice = closePrice; // Assuming same price
        copyTrade.masterProfit = profit;
        copyTrade.followerProfit = followerProfit;
        copyTrade.status = 'closed';
        copyTrade.masterClosedAt = new Date();
        copyTrade.followerClosedAt = new Date();
        copyTrade.hwmAtClose = follower.highWaterMark.value;

        // Calculate fees
        const fees = await this.calculateFees(master, follower, copyTrade, followerProfit);
        copyTrade.fees = fees;

        await copyTrade.save({ session });

        // Update follower stats
        follower.stats.totalTradesCopied += 1;
        if (followerProfit >= 0) {
          follower.stats.winningTrades += 1;
          follower.stats.totalProfitUSD += followerProfit;
        } else {
          follower.stats.losingTrades += 1;
          follower.stats.totalLossUSD += Math.abs(followerProfit);
        }
        follower.stats.netProfitUSD = follower.stats.totalProfitUSD - follower.stats.totalLossUSD;
        follower.stats.totalLotsTraded += copyTrade.followerVolume;
        follower.stats.totalFeesPaid += fees.totalFee;
        follower.stats.totalPerformanceFeePaid += fees.performanceFee;
        follower.stats.totalLotFeePaid += fees.lotFee;

        // Update follower's equity and HWM
        const newEquity = follower.stats.currentEquity + followerProfit - fees.totalFee;
        follower.updateHighWaterMark(newEquity);

        // Remove from active positions
        follower.activePositions = follower.activePositions.filter(
          p => p.masterPositionId !== positionId
        );

        await follower.save({ session });

        // Credit fees to master wallet if any
        if (fees.totalFee > 0) {
          let masterWallet = await Wallet.findOne({ 
            userId: master.userId, 
            type: 'copy_master' 
          }).session(session);

          if (masterWallet) {
            masterWallet.balance += fees.totalFee;
            masterWallet.totalEarned += fees.totalFee;
            masterWallet.lastTransactionAt = new Date();

            if (fees.performanceFee > 0) {
              masterWallet.performanceFeeEarned = (masterWallet.performanceFeeEarned || 0) + fees.performanceFee;
            }
            if (fees.lotFee > 0) {
              masterWallet.lotFeeEarned = (masterWallet.lotFeeEarned || 0) + fees.lotFee;
            }

            await masterWallet.save({ session });

            // Create wallet transaction
            await WalletTransaction.create([{
              walletId: masterWallet._id,
              userId: master.userId,
              oderId: master.oderId,
              walletType: 'copy_master',
              type: 'commission',
              amount: fees.totalFee,
              balanceAfter: masterWallet.balance,
              relatedTradeId: tradeId,
              relatedCopyMasterId: master._id,
              description: `Copy trading fee from ${follower.followerOderId}`,
              status: 'completed',
              metadata: { fees }
            }], { session });
          }

          // Update master wallet stats
          master.wallet.balance += fees.totalFee;
          master.wallet.totalEarned += fees.totalFee;
          master.wallet.performanceFeeEarned += fees.performanceFee;
          master.wallet.lotFeeEarned += fees.lotFee;
        }

        await session.commitTransaction();
        results.push({ copyTrade, fees });

      } catch (error) {
        await session.abortTransaction();
        console.error(`Error processing copy trade close:`, error);
      } finally {
        session.endSession();
      }
    }

    // Update master stats
    if (profit >= 0) {
      master.stats.winningTrades += 1;
      master.stats.totalProfitUSD += profit;
    } else {
      master.stats.losingTrades += 1;
      master.stats.totalLossUSD += Math.abs(profit);
    }
    master.stats.netProfitUSD = master.stats.totalProfitUSD - master.stats.totalLossUSD;
    master.updateStats();
    await master.save();

    return results;
  }

  /**
   * Calculate follower's volume based on copy settings
   */
  calculateFollowerVolume(follower, masterVolume, master) {
    const settings = follower.copySettings;

    let volume;
    switch (settings.mode) {
      case 'fixed_lot':
        volume = settings.fixedLotSize;
        break;

      case 'proportional':
        volume = masterVolume * settings.copyRatio;
        break;

      case 'fixed_amount':
        // Calculate lots based on fixed amount (simplified)
        volume = settings.fixedAmount / 10000; // Rough conversion
        break;

      default:
        volume = masterVolume * settings.copyRatio;
    }

    // Apply max lot size limit
    volume = Math.min(volume, settings.maxLotSize);

    // Round to 2 decimal places
    return Math.round(volume * 100) / 100;
  }

  /**
   * Calculate fees for a copy trade
   * Implements High Water Mark logic for performance fees
   */
  async calculateFees(master, follower, copyTrade, profit) {
    const fees = {
      performanceFee: 0,
      lotFee: 0,
      totalFee: 0,
      feeStatus: 'charged'
    };

    // Per lot fee (always charged)
    if (master.feeSettings.perLotFee > 0) {
      fees.lotFee = copyTrade.followerVolume * master.feeSettings.perLotFee;
    }

    // Performance fee (only on profits above HWM)
    if (profit > 0 && master.feeSettings.performanceFeePercent > 0) {
      const settings = await IBCopySettings.getSettings();
      
      if (settings.copyTrading.enforceHighWaterMark) {
        // High Water Mark logic
        const currentEquity = follower.stats.currentEquity + profit;
        const hwm = follower.highWaterMark.value;

        if (currentEquity > hwm) {
          // Only charge on profit above HWM
          const profitAboveHWM = currentEquity - hwm;
          fees.performanceFee = (profitAboveHWM * master.feeSettings.performanceFeePercent) / 100;
        }
      } else {
        // Simple percentage of profit
        fees.performanceFee = (profit * master.feeSettings.performanceFeePercent) / 100;
      }
    }

    fees.totalFee = fees.performanceFee + fees.lotFee;

    // Round to 2 decimal places
    fees.performanceFee = Math.round(fees.performanceFee * 100) / 100;
    fees.lotFee = Math.round(fees.lotFee * 100) / 100;
    fees.totalFee = Math.round(fees.totalFee * 100) / 100;

    return fees;
  }

  /**
   * Get follower's subscriptions
   */
  async getFollowerSubscriptions(followerId) {
    return await CopyFollower.find({ followerId })
      .populate('masterId', 'displayName stats feeSettings')
      .sort({ startedAt: -1 });
  }

  /**
   * Get master's followers
   */
  async getMasterFollowers(masterId, options = {}) {
    const { page = 1, limit = 20, status = 'active' } = options;

    const query = { masterId };
    if (status) {
      query.status = status;
    }

    const total = await CopyFollower.countDocuments(query);
    const followers = await CopyFollower.find(query)
      .populate('followerId', 'name oderId')
      .sort({ startedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return {
      followers,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get master dashboard
   */
  async getMasterDashboard(masterId) {
    const master = await CopyMaster.findById(masterId).populate('userId', 'name email oderId wallet');
    if (!master) {
      throw new Error('Master not found');
    }

    const wallet = await Wallet.findOne({ userId: master.userId, type: 'copy_master' });

    const recentTrades = await CopyTrade.find({ masterId })
      .sort({ createdAt: -1 })
      .limit(10);

    const followerStats = await CopyFollower.aggregate([
      { $match: { masterId: new mongoose.Types.ObjectId(masterId) } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalInvested: { $sum: '$copySettings.investmentAmount' }
        }
      }
    ]);

    return {
      master,
      wallet,
      recentTrades,
      followerStats
    };
  }

  // ===== ADMIN FUNCTIONS =====

  /**
   * Get all masters (admin)
   */
  async getAllMasters(options = {}) {
    const { page = 1, limit = 20, status = null, search = null } = options;

    const query = {};
    if (status) {
      query.status = status;
    }

    if (search) {
      const safeSearch = String(search).slice(0, 64).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { displayName: { $regex: safeSearch, $options: 'i' } },
        { oderId: { $regex: safeSearch, $options: 'i' } }
      ];
    }

    const total = await CopyMaster.countDocuments(query);
    const masters = await CopyMaster.find(query)
      .populate('userId', 'name email oderId')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    return {
      masters,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Approve master application (admin)
   */
  async approveMaster(masterId, adminId, feeSettings = null) {
    const master = await CopyMaster.findById(masterId);
    if (!master) {
      throw new Error('Master not found');
    }

    if (master.status !== 'pending') {
      throw new Error('Master is not in pending status');
    }

    master.status = 'active';
    master.approvedBy = adminId;
    master.approvedAt = new Date();

    if (feeSettings) {
      master.feeSettings = { ...master.feeSettings, ...feeSettings };
    }

    await master.save();
    return master;
  }

  /**
   * Reject master application (admin)
   */
  async rejectMaster(masterId, adminId, reason) {
    const master = await CopyMaster.findById(masterId);
    if (!master) {
      throw new Error('Master not found');
    }

    master.status = 'rejected';
    master.rejectedReason = reason;
    await master.save();

    return master;
  }

  /**
   * Suspend master (admin)
   */
  async suspendMaster(masterId, adminId, reason) {
    const master = await CopyMaster.findById(masterId);
    if (!master) {
      throw new Error('Master not found');
    }

    master.status = 'suspended';
    master.adminNotes = `Suspended: ${reason}`;
    await master.save();

    // Stop all followers
    await CopyFollower.updateMany(
      { masterId, status: 'active' },
      { status: 'stopped', stopReason: 'Master suspended', stoppedAt: new Date() }
    );

    return master;
  }

  /**
   * Update master fee settings (admin)
   */
  async updateMasterFeeSettings(masterId, feeSettings) {
    const master = await CopyMaster.findById(masterId);
    if (!master) {
      throw new Error('Master not found');
    }

    master.feeSettings = { ...master.feeSettings, ...feeSettings };
    await master.save();

    return master;
  }

  /**
   * Get copy trading statistics (admin)
   */
  async getCopyTradingStats() {
    const masterStats = await CopyMaster.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalEarned: { $sum: '$wallet.totalEarned' }
        }
      }
    ]);

    const followerStats = await CopyFollower.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalInvested: { $sum: '$copySettings.investmentAmount' },
          totalProfit: { $sum: '$stats.netProfitUSD' },
          totalFeesPaid: { $sum: '$stats.totalFeesPaid' }
        }
      }
    ]);

    return {
      masters: masterStats,
      followers: followerStats
    };
  }
}

module.exports = new CopyTradeService();
