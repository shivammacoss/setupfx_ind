const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const copyTradeService = require('../services/copyTrade.service');
const walletService = require('../services/wallet.service');
const CopyMaster = require('../models/CopyMaster');
const CopyFollower = require('../models/CopyFollower');
const IBCopySettings = require('../models/IBCopySettings');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET is not set. Refusing to load copyTrade router.');
  process.exit(1);
}

// Middleware to verify JWT and set req.user
const authMiddleware = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    
    if (!token) {
      return res.status(401).json({ success: false, error: 'Unauthorized - No token provided' });
    }
    
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
};

// Middleware to verify admin
const adminMiddleware = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  next();
};

// ===== PUBLIC ROUTES =====

/**
 * Get list of active masters (public)
 * GET /api/copy-trade/masters
 */
router.get('/masters', async (req, res) => {
  try {
    const { page, limit, sortBy, sortOrder } = req.query;
    const result = await copyTradeService.getActiveMasters({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      sortBy: sortBy || 'stats.netProfitUSD',
      sortOrder: parseInt(sortOrder) || -1
    });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Get master details (public)
 * GET /api/copy-trade/masters/:id
 */
router.get('/masters/:id', async (req, res) => {
  try {
    const master = await CopyMaster.findOne({ 
      _id: req.params.id, 
      status: 'active', 
      isPublic: true 
    })
      .select('-applicationDetails -adminNotes')
      .populate('userId', 'name oderId');
    
    if (!master) {
      return res.status(404).json({ success: false, error: 'Master not found' });
    }
    res.json({ success: true, data: master });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ===== USER ROUTES =====

/**
 * Apply to become a Copy Master
 * POST /api/copy-trade/apply-master
 */
router.post('/apply-master', authMiddleware, async (req, res) => {
  try {
    const master = await copyTradeService.applyForMaster(req.user._id, req.body);
    res.status(201).json({
      success: true,
      message: 'Master application submitted successfully',
      data: master
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Get current user's master profile
 * GET /api/copy-trade/my-master-profile
 */
router.get('/my-master-profile', authMiddleware, async (req, res) => {
  try {
    const master = await copyTradeService.getMasterByUserId(req.user._id);
    if (!master) {
      return res.json({ success: true, data: null, isMaster: false });
    }
    res.json({ success: true, data: master, isMaster: true });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Get master dashboard (for masters)
 * GET /api/copy-trade/master-dashboard
 */
router.get('/master-dashboard', authMiddleware, async (req, res) => {
  try {
    const master = await copyTradeService.getMasterByUserId(req.user._id);
    if (!master) {
      return res.status(404).json({ success: false, error: 'Not a master' });
    }
    const dashboard = await copyTradeService.getMasterDashboard(master._id);
    res.json({ success: true, data: dashboard });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Get master's followers
 * GET /api/copy-trade/my-followers
 */
router.get('/my-followers', authMiddleware, async (req, res) => {
  try {
    const master = await copyTradeService.getMasterByUserId(req.user._id);
    if (!master) {
      return res.status(404).json({ success: false, error: 'Not a master' });
    }
    const { page, limit, status } = req.query;
    const result = await copyTradeService.getMasterFollowers(master._id, {
      page: parseInt(page),
      limit: parseInt(limit),
      status
    });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Update master settings (for masters)
 * PUT /api/copy-trade/master-settings
 */
router.put('/master-settings', authMiddleware, async (req, res) => {
  try {
    const master = await copyTradeService.getMasterByUserId(req.user._id);
    if (!master) {
      return res.status(404).json({ success: false, error: 'Not a master' });
    }

    const { displayName, description, acceptingNewFollowers } = req.body;
    
    if (displayName) master.displayName = displayName;
    if (description !== undefined) master.description = description;
    if (acceptingNewFollowers !== undefined) {
      master.followerSettings.acceptingNewFollowers = acceptingNewFollowers;
    }
    
    await master.save();
    res.json({ success: true, message: 'Settings updated', data: master });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Subscribe to a master (become a follower)
 * POST /api/copy-trade/subscribe/:masterId
 */
router.post('/subscribe/:masterId', authMiddleware, async (req, res) => {
  try {
    const subscription = await copyTradeService.subscribeToMaster(
      req.user._id,
      req.params.masterId,
      req.body
    );
    res.status(201).json({
      success: true,
      message: 'Successfully subscribed to master',
      data: subscription
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Unsubscribe from a master
 * POST /api/copy-trade/unsubscribe/:masterId
 */
router.post('/unsubscribe/:masterId', authMiddleware, async (req, res) => {
  try {
    const result = await copyTradeService.unsubscribeFromMaster(
      req.user._id,
      req.params.masterId,
      req.body.reason || 'User requested'
    );
    res.json({
      success: true,
      message: 'Successfully unsubscribed from master',
      data: result
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Get my subscriptions (as a follower)
 * GET /api/copy-trade/my-subscriptions
 */
router.get('/my-subscriptions', authMiddleware, async (req, res) => {
  try {
    const subscriptions = await copyTradeService.getFollowerSubscriptions(req.user._id);
    res.json({ success: true, data: subscriptions });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Update copy settings for a subscription
 * PUT /api/copy-trade/subscription/:masterId/settings
 */
router.put('/subscription/:masterId/settings', authMiddleware, async (req, res) => {
  try {
    const subscription = await CopyFollower.findOne({
      followerId: req.user._id,
      masterId: req.params.masterId,
      status: 'active'
    });

    if (!subscription) {
      return res.status(404).json({ success: false, error: 'Subscription not found' });
    }

    const allowedUpdates = ['copyRatio', 'fixedLotSize', 'maxLotSize', 'maxLossPercent', 'copySLTP'];
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        subscription.copySettings[field] = req.body[field];
      }
    });

    await subscription.save();
    res.json({ success: true, message: 'Settings updated', data: subscription });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Pause/Resume subscription
 * POST /api/copy-trade/subscription/:masterId/pause
 * POST /api/copy-trade/subscription/:masterId/resume
 */
router.post('/subscription/:masterId/pause', authMiddleware, async (req, res) => {
  try {
    const subscription = await CopyFollower.findOne({
      followerId: req.user._id,
      masterId: req.params.masterId,
      status: 'active'
    });

    if (!subscription) {
      return res.status(404).json({ success: false, error: 'Subscription not found' });
    }

    subscription.status = 'paused';
    subscription.pausedAt = new Date();
    await subscription.save();

    res.json({ success: true, message: 'Subscription paused', data: subscription });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/subscription/:masterId/resume', authMiddleware, async (req, res) => {
  try {
    const subscription = await CopyFollower.findOne({
      followerId: req.user._id,
      masterId: req.params.masterId,
      status: 'paused'
    });

    if (!subscription) {
      return res.status(404).json({ success: false, error: 'Paused subscription not found' });
    }

    subscription.status = 'active';
    subscription.pausedAt = null;
    await subscription.save();

    res.json({ success: true, message: 'Subscription resumed', data: subscription });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ===== ADMIN ROUTES =====

/**
 * Get all masters (admin)
 * GET /api/copy-trade/admin/masters
 */
router.get('/admin/masters', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page, limit, status, search } = req.query;
    const result = await copyTradeService.getAllMasters({
      page: parseInt(page),
      limit: parseInt(limit),
      status,
      search
    });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Get pending master applications (admin)
 * GET /api/copy-trade/admin/pending
 */
router.get('/admin/pending', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page, limit } = req.query;
    const result = await copyTradeService.getAllMasters({
      page: parseInt(page),
      limit: parseInt(limit),
      status: 'pending'
    });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Get master details (admin)
 * GET /api/copy-trade/admin/masters/:id
 */
router.get('/admin/masters/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const dashboard = await copyTradeService.getMasterDashboard(req.params.id);
    res.json({ success: true, data: dashboard });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Approve master application (admin)
 * POST /api/copy-trade/admin/masters/:id/approve
 */
router.post('/admin/masters/:id/approve', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const master = await copyTradeService.approveMaster(
      req.params.id,
      req.user._id,
      req.body.feeSettings
    );
    res.json({ success: true, message: 'Master approved successfully', data: master });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Reject master application (admin)
 * POST /api/copy-trade/admin/masters/:id/reject
 */
router.post('/admin/masters/:id/reject', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const master = await copyTradeService.rejectMaster(
      req.params.id,
      req.user._id,
      req.body.reason
    );
    res.json({ success: true, message: 'Master rejected', data: master });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Suspend master (admin)
 * POST /api/copy-trade/admin/masters/:id/suspend
 */
router.post('/admin/masters/:id/suspend', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const master = await copyTradeService.suspendMaster(
      req.params.id,
      req.user._id,
      req.body.reason
    );
    res.json({ success: true, message: 'Master suspended', data: master });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Update master fee settings (admin)
 * PUT /api/copy-trade/admin/masters/:id/fees
 */
router.put('/admin/masters/:id/fees', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const master = await copyTradeService.updateMasterFeeSettings(req.params.id, req.body);
    res.json({ success: true, message: 'Fee settings updated', data: master });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Get all followers (admin)
 * GET /api/copy-trade/admin/followers
 */
router.get('/admin/followers', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, masterId } = req.query;
    
    const query = {};
    if (status) query.status = status;
    if (masterId) query.masterId = masterId;

    const total = await CopyFollower.countDocuments(query);
    const followers = await CopyFollower.find(query)
      .populate('followerId', 'name email oderId')
      .populate('masterId', 'displayName oderId')
      .sort({ startedAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: {
        followers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Get copy trading statistics (admin)
 * GET /api/copy-trade/admin/stats
 */
router.get('/admin/stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const stats = await copyTradeService.getCopyTradingStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Get/Update copy trading settings (admin)
 * GET/PUT /api/copy-trade/admin/settings
 */
router.get('/admin/settings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const settings = await IBCopySettings.getSettings();
    res.json({ success: true, data: settings.copyTrading });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.put('/admin/settings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const settings = await IBCopySettings.updateSettings({ copyTrading: req.body }, req.user._id);
    res.json({ success: true, message: 'Settings updated', data: settings.copyTrading });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

module.exports = router;
