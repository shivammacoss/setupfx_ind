const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const ibService = require('../services/ib.service');
const commissionService = require('../services/commission.service');
const walletService = require('../services/wallet.service');
const IB = require('../models/IB');
const IBCopySettings = require('../models/IBCopySettings');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'SetupFX-secret-key-2024';

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

// ===== USER ROUTES =====

/**
 * Apply to become an IB
 * POST /api/ib/apply
 */
router.post('/apply', authMiddleware, async (req, res) => {
  try {
    const ib = await ibService.applyForIB(req.user._id, req.body);
    res.status(201).json({
      success: true,
      message: 'IB application submitted successfully',
      data: ib
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Get current user's IB profile
 * GET /api/ib/profile
 */
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const ib = await ibService.getIBByUserId(req.user._id);
    if (!ib) {
      return res.status(404).json({ success: false, error: 'Not an IB' });
    }
    res.json({ success: true, data: ib });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Get IB dashboard
 * GET /api/ib/dashboard
 */
router.get('/dashboard', authMiddleware, async (req, res) => {
  try {
    const ib = await ibService.getIBByUserId(req.user._id);
    if (!ib) {
      return res.status(404).json({ success: false, error: 'Not an IB' });
    }
    const dashboard = await ibService.getDashboard(ib._id);
    res.json({ success: true, data: dashboard });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Get IB's referrals
 * GET /api/ib/referrals
 */
router.get('/referrals', authMiddleware, async (req, res) => {
  try {
    const ib = await ibService.getIBByUserId(req.user._id);
    if (!ib) {
      return res.status(404).json({ success: false, error: 'Not an IB' });
    }
    const { page, limit, status } = req.query;
    const result = await ibService.getReferrals(ib._id, { page: parseInt(page), limit: parseInt(limit), status });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Get IB's sub-IBs
 * GET /api/ib/sub-ibs
 */
router.get('/sub-ibs', authMiddleware, async (req, res) => {
  try {
    const ib = await ibService.getIBByUserId(req.user._id);
    if (!ib) {
      return res.status(404).json({ success: false, error: 'Not an IB' });
    }
    const { page, limit } = req.query;
    const result = await ibService.getSubIBs(ib._id, { page: parseInt(page), limit: parseInt(limit) });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Get commission history
 * GET /api/ib/commissions
 */
router.get('/commissions', authMiddleware, async (req, res) => {
  try {
    const ib = await ibService.getIBByUserId(req.user._id);
    if (!ib) {
      return res.status(404).json({ success: false, error: 'Not an IB' });
    }
    const { page, limit, type, startDate, endDate } = req.query;
    const result = await commissionService.getCommissionHistory(ib._id, {
      page: parseInt(page),
      limit: parseInt(limit),
      type,
      startDate,
      endDate
    });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Get commission summary
 * GET /api/ib/commission-summary
 */
router.get('/commission-summary', authMiddleware, async (req, res) => {
  try {
    const ib = await ibService.getIBByUserId(req.user._id);
    if (!ib) {
      return res.status(404).json({ success: false, error: 'Not an IB' });
    }
    const summary = await commissionService.getCommissionSummary(ib._id);
    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Request withdrawal from IB wallet
 * POST /api/ib/withdraw
 */
router.post('/withdraw', authMiddleware, async (req, res) => {
  try {
    const ib = await ibService.getIBByUserId(req.user._id);
    if (!ib) {
      return res.status(404).json({ success: false, error: 'Not an IB' });
    }
    const { amount, ...withdrawalDetails } = req.body;
    const result = await ibService.requestWithdrawal(ib._id, amount, withdrawalDetails);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Validate referral code
 * GET /api/ib/validate/:code
 */
router.get('/validate/:code', async (req, res) => {
  try {
    const ib = await ibService.getIBByReferralCode(req.params.code);
    if (!ib) {
      return res.status(404).json({ success: false, error: 'Invalid referral code' });
    }
    res.json({
      success: true,
      data: {
        valid: true,
        referralCode: ib.referralCode,
        ibName: ib.userId?.name || 'IB Partner'
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ===== ADMIN ROUTES =====

/**
 * Get all IBs
 * GET /api/ib/admin/list
 */
router.get('/admin/list', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page, limit, status, search } = req.query;
    const result = await ibService.getAllIBs({
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
 * Get pending IB applications
 * GET /api/ib/admin/pending
 */
router.get('/admin/pending', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { page, limit } = req.query;
    const result = await ibService.getPendingApplications({
      page: parseInt(page),
      limit: parseInt(limit)
    });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Get IB details
 * GET /api/ib/admin/:id
 */
router.get('/admin/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const ib = await IB.findById(req.params.id).populate('userId', 'name email oderId wallet');
    if (!ib) {
      return res.status(404).json({ success: false, error: 'IB not found' });
    }
    const dashboard = await ibService.getDashboard(ib._id);
    res.json({ success: true, data: dashboard });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Approve IB application
 * POST /api/ib/admin/:id/approve
 */
router.post('/admin/:id/approve', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const ib = await ibService.approveIB(req.params.id, req.user._id, req.body.commissionSettings);
    res.json({ success: true, message: 'IB approved successfully', data: ib });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Reject IB application
 * POST /api/ib/admin/:id/reject
 */
router.post('/admin/:id/reject', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const ib = await ibService.rejectIB(req.params.id, req.user._id, req.body.reason);
    res.json({ success: true, message: 'IB rejected', data: ib });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Suspend IB
 * POST /api/ib/admin/:id/suspend
 */
router.post('/admin/:id/suspend', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const ib = await ibService.suspendIB(req.params.id, req.user._id, req.body.reason);
    res.json({ success: true, message: 'IB suspended', data: ib });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Reactivate IB
 * POST /api/ib/admin/:id/reactivate
 */
router.post('/admin/:id/reactivate', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const ib = await ibService.reactivateIB(req.params.id, req.user._id);
    res.json({ success: true, message: 'IB reactivated', data: ib });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Update IB commission settings
 * PUT /api/ib/admin/:id/commission
 */
router.put('/admin/:id/commission', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const ib = await ibService.updateCommissionSettings(req.params.id, req.body);
    res.json({ success: true, message: 'Commission settings updated', data: ib });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Get all commission records for admin
 * GET /api/ib/admin/commissions
 */
router.get('/admin/commissions', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const IBCommission = require('../models/IBCommission');
    const { page = 1, limit = 50, status, ibId, startDate, endDate } = req.query;
    
    const query = {};
    if (status) query.status = status;
    if (ibId) query.ibId = ibId;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    const commissions = await IBCommission.find(query)
      .populate('ibId', 'referralCode userId')
      .populate('referredUserId', 'name email oderId')
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));
    
    const total = await IBCommission.countDocuments(query);
    
    // Get summary stats
    const summaryPipeline = [
      { $match: query },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
          pendingAmount: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0] } },
          creditedAmount: { $sum: { $cond: [{ $eq: ['$status', 'credited'] }, '$amount', 0] } },
          paidAmount: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amount', 0] } },
          count: { $sum: 1 }
        }
      }
    ];
    
    const summaryResult = await IBCommission.aggregate(summaryPipeline);
    const summary = summaryResult[0] || { totalAmount: 0, pendingAmount: 0, creditedAmount: 0, paidAmount: 0, count: 0 };
    
    res.json({ 
      success: true, 
      data: {
        commissions,
        pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
        summary
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Get IB statistics summary
 * GET /api/ib/admin/stats/summary
 */
router.get('/admin/stats/summary', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const summary = await ibService.getIBStatsSummary();
    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * Get/Update IB settings
 * GET/PUT /api/ib/admin/settings
 */
router.get('/admin/settings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const settings = await IBCopySettings.getSettings();
    res.json({ success: true, data: settings.ib });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.put('/admin/settings', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const settings = await IBCopySettings.updateSettings({ ib: req.body }, req.user._id);
    res.json({ success: true, message: 'Settings updated', data: settings.ib });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

module.exports = router;
