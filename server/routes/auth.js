const express = require('express');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const User = require('../models/User');
const UserActivityLog = require('../models/UserActivityLog');
const emailService = require('../services/email.service');
const emailOtpService = require('../services/emailOtp.service');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET is not set. Refusing to start auth router.');
  process.exit(1);
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Sub-admin / broker panel staff resolver.
 *
 * Historical behavior: accepted an unsigned token of the form `Bearer admin-<MongoId>`,
 * which was a critical auth bypass — anyone with an admin ObjectId could act as that
 * admin without credentials. That backdoor is REMOVED.
 *
 * Now requires a real signed JWT (issued by the admin login flow) whose `id` resolves
 * to an Admin document with role sub_admin or broker.
 */
async function resolveStaffAdminFromAuthHeader(req) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return null;
  const token = h.split(' ')[1];
  if (!token) return null;
  // Hard-block legacy unsigned `admin-<id>` tokens.
  if (token.startsWith('admin-')) return null;
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (_) {
    return null;
  }
  const rawId = decoded.id || decoded.userId || decoded.sub;
  if (!rawId || !mongoose.Types.ObjectId.isValid(String(rawId))) return null;
  const Admin = require('../models/Admin');
  const admin = await Admin.findById(rawId).select('_id role isActive');
  if (!admin || admin.isActive === false) return null;
  if (admin.role !== 'sub_admin' && admin.role !== 'broker') return null;
  return admin;
}

// Parse OS from User-Agent
const parseOS = (userAgent) => {
  if (!userAgent) return 'Unknown';
  if (userAgent.includes('Windows NT 10')) return 'Windows 10';
  if (userAgent.includes('Windows NT 11')) return 'Windows 11';
  if (userAgent.includes('Windows NT 6.3')) return 'Windows 8.1';
  if (userAgent.includes('Windows NT 6.2')) return 'Windows 8';
  if (userAgent.includes('Windows NT 6.1')) return 'Windows 7';
  if (userAgent.includes('Windows')) return 'Windows';
  if (userAgent.includes('Mac OS X')) return 'macOS';
  if (userAgent.includes('Macintosh')) return 'macOS';
  if (userAgent.includes('Linux') && userAgent.includes('Android')) return 'Android';
  if (userAgent.includes('Linux')) return 'Linux';
  if (userAgent.includes('iPhone') || userAgent.includes('iPad')) return 'iOS';
  if (userAgent.includes('Android')) return 'Android';
  if (userAgent.includes('CrOS')) return 'Chrome OS';
  return 'Unknown';
};

// Parse Browser from User-Agent
const parseBrowser = (userAgent) => {
  if (!userAgent) return 'Unknown';
  // Order matters - check specific browsers first
  if (userAgent.includes('Edg/')) return 'Edge';
  if (userAgent.includes('OPR/') || userAgent.includes('Opera')) return 'Opera';
  if (userAgent.includes('Brave')) return 'Brave';
  if (userAgent.includes('Vivaldi')) return 'Vivaldi';
  if (userAgent.includes('YaBrowser')) return 'Yandex';
  if (userAgent.includes('SamsungBrowser')) return 'Samsung Browser';
  if (userAgent.includes('UCBrowser')) return 'UC Browser';
  if (userAgent.includes('Firefox/')) return 'Firefox';
  if (userAgent.includes('Safari/') && !userAgent.includes('Chrome')) return 'Safari';
  if (userAgent.includes('Chrome/')) return 'Chrome';
  return 'Unknown';
};

// Multer config for profile image upload — hardened against type-confusion XSS
// (e.g. uploading an SVG with embedded <script> and serving it from same origin).
const ALLOWED_AVATAR_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
]);
const MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif'
};
const cryptoRandom = require('crypto');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/avatars');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Never trust file.originalname — derive extension from validated mimetype.
    // Random UUID prevents path traversal and predictable filename guessing.
    const ext = MIME_TO_EXT[file.mimetype] || '.bin';
    const id = cryptoRandom.randomUUID();
    cb(null, `avatar-${id}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }, // 5MB, single file
  fileFilter: (req, file, cb) => {
    // Strict mimetype allowlist — exact match, not regex substring.
    if (!ALLOWED_AVATAR_MIME.has(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG, WEBP, or GIF images are allowed'));
    }
    cb(null, true);
  }
});

// Generate JWT token
const signToken = (userId) => {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

// Middleware to verify JWT token
const protect = async (req, res, next) => {
  try {
    let token;
    
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated. Please login.' });
    }
    
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({ error: 'User no longer exists.' });
    }
    
    if (user.changedPasswordAfter(decoded.iat)) {
      return res.status(401).json({ error: 'Password changed. Please login again.' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token. Please login again.' });
  }
};

// Public: whether signup needs email OTP (for registration UI)
router.get('/email-config', async (req, res) => {
  res.json({
    signupOtpRequired: await emailOtpService.requireSignupOtp(),
    smtpConfigured: emailService.isSmtpConfigured()
  });
});

// ============== EMAIL OTP (signup) ==============
router.post('/send-signup-otp', async (req, res) => {
  try {
    if (!(await emailOtpService.requireSignupOtp())) {
      return res.status(503).json({ error: 'Email verification is not enabled on the server.' });
    }
    const { email } = req.body;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    const normalized = email.toLowerCase().trim();
    const taken = await User.findOne({ email: normalized });
    if (taken) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    await emailOtpService.sendSignupOtp(normalized);
    res.json({ success: true, message: 'Verification code sent to your email.' });
  } catch (error) {
    console.error('send-signup-otp:', error);
    const code = error.statusCode || 500;
    res.status(code).json({ error: error.message || 'Failed to send verification email' });
  }
});

// ============== FORGOT PASSWORD (OTP) ==============
router.post('/forgot-password', async (req, res) => {
  try {
    if (!emailService.isSmtpConfigured()) {
      return res.status(503).json({ error: 'Password reset by email is not available.' });
    }
    const { email } = req.body;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    const normalized = email.toLowerCase().trim();
    try {
      emailOtpService.rateLimitPasswordResetEmail(normalized);
    } catch (e) {
      const code = e.statusCode || 429;
      return res.status(code).json({ error: e.message });
    }
    const user = await User.findOne({ email: normalized, isDemo: { $ne: true } });
    try {
      if (user && user.isActive !== false) {
        await emailOtpService.sendPasswordResetOtp(normalized);
      }
    } catch (e) {
      console.error('forgot-password send:', e);
    }
    res.json({
      success: true,
      message: 'If an account exists for this email, a reset code has been sent.'
    });
  } catch (error) {
    console.error('forgot-password:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    if (!emailService.isSmtpConfigured()) {
      return res.status(503).json({ error: 'Password reset by email is not available.' });
    }
    const { email, otp, newPassword, confirmPassword } = req.body;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (!otp) {
      return res.status(400).json({ error: 'Reset code is required' });
    }
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }
    const normalized = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalized, isDemo: { $ne: true } });
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset code' });
    }
    const check = await emailOtpService.verifyAndConsumePasswordResetOtp(normalized, otp);
    if (!check.ok) {
      return res.status(400).json({ error: check.error });
    }
    user.password = newPassword;
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await user.save();
    res.json({ success: true, message: 'Password updated. You can log in now.' });
  } catch (error) {
    console.error('reset-password:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============== REGISTRATION ==============
router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, countryCode = '+91', city, state, password, confirmPassword, parentAdminId, emailOtp } = req.body;
    
    // Validation
    if (!name || !email || !phone || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    // Phone validation - extract digits only, allow 7-15 digits for international
    const phoneDigits = phone.replace(/[^0-9]/g, '');
    if (phoneDigits.length < 7 || phoneDigits.length > 15) {
      return res.status(400).json({ error: 'Invalid phone number' });
    }
    
    // Full phone with country code
    const fullPhone = `${countryCode}${phoneDigits}`;
    
    // Check if email already exists
    const existingEmail = await User.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const staff = await resolveStaffAdminFromAuthHeader(req);
    const needEmailOtp = (await emailOtpService.requireSignupOtp()) && !staff;
    if (needEmailOtp) {
      const otp = emailOtp || req.body.otp;
      if (!otp) {
        return res.status(400).json({ error: 'Email verification code is required' });
      }
      const verified = await emailOtpService.verifyAndConsumeSignupOtp(email, otp);
      if (!verified.ok) {
        return res.status(400).json({ error: verified.error });
      }
    }
    
    // Check if phone already exists
    const existingPhone = await User.findOne({ phone: fullPhone });
    if (existingPhone) {
      return res.status(400).json({ error: 'Phone number already registered' });
    }
    
    // Generate unique 6-digit user ID
    const userId = await User.generateUserId();
    
    // Get parent admin info if provided (can be _id or oderId)
    let parentAdminOderId = null;
    let resolvedParentAdminId = null;
    if (parentAdminId) {
      const Admin = require('../models/Admin');
      // Try to find by _id first, then by oderId
      let parentAdmin = await Admin.findById(parentAdminId).catch(() => null);
      if (!parentAdmin) {
        parentAdmin = await Admin.findOne({ oderId: parentAdminId });
      }
      if (parentAdmin) {
        resolvedParentAdminId = parentAdmin._id;
        parentAdminOderId = parentAdmin.oderId;
      }
    }

    // Create user
    const user = new User({
      oderId: userId,
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: fullPhone,
      password,
      parentAdminId: resolvedParentAdminId || null,
      parentAdminOderId: parentAdminOderId,
      profile: {
        city: city?.trim() || '',
        state: state?.trim() || '',
        country: countryCode === '+91' ? 'India' : 'Other'
      },
      wallet: {
        balance: 0,
        credit: 0,
        equity: 0,
        margin: 0,
        freeMargin: 0,
        marginLevel: 0
      },
      isEmailVerified: needEmailOtp || !!staff
    });
    
    await user.save();
    
    // Generate token
    const token = signToken(user._id);
    
    // Log registration activity
    const userAgent = req.get('User-Agent') || '';
    await UserActivityLog.logActivity({
      userId: user._id.toString(),
      oderId: user.oderId,
      activityType: 'register',
      description: `New user registered: ${user.name}`,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: userAgent,
      device: userAgent.includes('Mobile') ? 'mobile' : 'desktop',
      os: parseOS(userAgent),
      browser: parseBrowser(userAgent),
      status: 'success'
    });
    
    res.status(201).json({
      success: true,
      message: 'Registration successful',
      token,
      user: {
        id: user.oderId,
        oderId: user.oderId,
        name: user.name,
        email: user.email,
        phone: user.phone,
        avatar: user.profile?.avatar || '',
        profile: user.profile,
        wallet: user.wallet,
        role: user.role,
        allowedTradeModes: user.allowedTradeModes || { hedging: true, netting: true, binary: true }
      }
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============== DEMO REGISTRATION ==============
router.post('/demo-register', async (req, res) => {
  try {
    const { name, email, phone, countryCode = '+91', password, confirmPassword } = req.body;
    const DemoSettings = require('../models/DemoSettings');
    
    // Get demo settings
    const demoSettings = await DemoSettings.getSettings();
    
    if (!demoSettings.demoRegistrationEnabled) {
      return res.status(400).json({ error: 'Demo registration is currently disabled' });
    }
    
    // Validation
    if (!name || !email || !phone || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    // Phone validation
    const phoneDigits = phone.replace(/[^0-9]/g, '');
    if (phoneDigits.length < 7 || phoneDigits.length > 15) {
      return res.status(400).json({ error: 'Invalid phone number' });
    }
    
    const fullPhone = `${countryCode}${phoneDigits}`;
    const clientIp = req.ip || req.connection?.remoteAddress || 'unknown';
    
    // Check max demo accounts per IP
    const existingDemoCount = await User.countDocuments({ 
      isDemo: true, 
      demoCreatedIp: clientIp 
    });
    
    if (existingDemoCount >= demoSettings.maxDemoAccountsPerIp) {
      return res.status(400).json({ 
        error: `Maximum ${demoSettings.maxDemoAccountsPerIp} demo accounts allowed per device` 
      });
    }
    
    // Check if email already exists
    const existingEmail = await User.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    // Check if phone already exists
    const existingPhone = await User.findOne({ phone: fullPhone });
    if (existingPhone) {
      return res.status(400).json({ error: 'Phone number already registered' });
    }

    const needDemoEmailOtp = await emailOtpService.requireSignupOtp();
    if (needDemoEmailOtp) {
      const otp = req.body.emailOtp || req.body.otp;
      if (!otp) {
        return res.status(400).json({ error: 'Email verification code is required for demo signup' });
      }
      const verified = await emailOtpService.verifyAndConsumeSignupOtp(email, otp);
      if (!verified.ok) {
        return res.status(400).json({ error: verified.error });
      }
    }
    
    // Generate unique 6-digit user ID
    const userId = await User.generateUserId();
    
    // Calculate demo expiry date
    const demoExpiresAt = new Date();
    demoExpiresAt.setDate(demoExpiresAt.getDate() + demoSettings.demoValidityDays);
    
    // Create demo user
    const user = new User({
      oderId: userId,
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: fullPhone,
      password,
      isEmailVerified: needDemoEmailOtp,
      isDemo: true,
      demoCreatedIp: clientIp,
      demoExpiresAt: demoExpiresAt,
      wallet: {
        balance: demoSettings.demoWalletAmount,
        credit: 0,
        equity: demoSettings.demoWalletAmount,
        margin: 0,
        freeMargin: demoSettings.demoWalletAmount,
        marginLevel: 0
      }
    });
    
    await user.save();
    
    // Generate token
    const token = signToken(user._id);
    
    // Log registration activity (demo accounts don't save activity logs)
    const userAgent = req.get('User-Agent') || '';
    
    res.status(201).json({
      success: true,
      message: 'Demo account created successfully',
      token,
      user: {
        id: user.oderId,
        oderId: user.oderId,
        name: user.name,
        email: user.email,
        phone: user.phone,
        avatar: user.profile?.avatar || '',
        profile: user.profile,
        wallet: user.wallet,
        role: user.role,
        isDemo: true,
        demoExpiresAt: user.demoExpiresAt,
        allowedTradeModes: user.allowedTradeModes || { hedging: true, netting: true, binary: true }
      }
    });
    
  } catch (error) {
    console.error('Demo registration error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============== LOGIN ==============
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    // Find user by email, phone, or user ID
    const user = await User.findOne({
      $or: [
        { email: username.toLowerCase() },
        { phone: username.replace(/[^0-9]/g, '') },
        { oderId: username }
      ]
    });
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Check if account is locked
    if (user.lockUntil && user.lockUntil > Date.now()) {
      const waitMinutes = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(423).json({ 
        error: `Account locked. Try again in ${waitMinutes} minutes.` 
      });
    }
    
    // Check if account is active
    if (!user.isActive) {
      return res.status(403).json({ error: 'Account is deactivated. Contact support.' });
    }
    
    // Check if demo account has expired
    if (user.isDemo && user.demoExpiresAt && new Date() > new Date(user.demoExpiresAt)) {
      return res.status(403).json({ 
        error: 'Demo account has expired. Please register for a real account.',
        demoExpired: true
      });
    }
    
    // Verify password
    const isMatch = await user.comparePassword(password);
    
    if (!isMatch) {
      // Increment login attempts
      user.loginAttempts += 1;
      
      // Lock account after 5 failed attempts
      if (user.loginAttempts >= 5) {
        user.lockUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
        user.loginAttempts = 0;
        await user.save();
        return res.status(423).json({ 
          error: 'Too many failed attempts. Account locked for 30 minutes.' 
        });
      }
      
      await user.save();
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Reset login attempts on successful login
    user.loginAttempts = 0;
    user.lockUntil = null;
    user.lastLogin = new Date();
    await user.save();
    
    // Generate token
    const token = signToken(user._id);
    
    // Generate session ID for tracking session duration
    const sessionId = `${user._id}-${Date.now()}`;
    
    // Log login activity
    const userAgent = req.get('User-Agent') || '';
    await UserActivityLog.logActivity({
      userId: user._id.toString(),
      oderId: user.oderId,
      activityType: 'login',
      description: `User logged in successfully`,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: userAgent,
      device: userAgent.includes('Mobile') ? 'mobile' : 'desktop',
      os: parseOS(userAgent),
      browser: parseBrowser(userAgent),
      status: 'success',
      sessionId: sessionId
    });
    
    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.oderId,
        oderId: user.oderId,
        name: user.name,
        email: user.email,
        phone: user.phone,
        avatar: user.profile?.avatar || '',
        profile: user.profile,
        wallet: user.wallet,
        stats: user.stats,
        role: user.role,
        isVerified: user.isVerified,
        isDemo: user.isDemo || false,
        demoExpiresAt: user.demoExpiresAt || null,
        allowedTradeModes: user.allowedTradeModes || { hedging: true, netting: true, binary: true },
        sessionId: sessionId
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============== CONVERT DEMO TO REAL ACCOUNT ==============
router.post('/convert-to-real', protect, async (req, res) => {
  try {
    const user = req.user;
    
    if (!user.isDemo) {
      return res.status(400).json({ error: 'This is already a real account' });
    }
    
    // Convert demo to real account
    user.isDemo = false;
    user.demoConvertedToReal = true;
    user.demoConvertedAt = new Date();
    user.demoExpiresAt = null;
    
    // Reset wallet to zero
    user.wallet = {
      balance: 0,
      credit: 0,
      equity: 0,
      margin: 0,
      freeMargin: 0,
      marginLevel: 0
    };
    
    // Reset stats
    user.stats = {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      totalProfit: 0,
      totalLoss: 0,
      netPnL: 0
    };
    
    await user.save();
    
    // Log conversion activity
    const userAgent = req.get('User-Agent') || '';
    const UserActivityLog = require('../models/UserActivityLog');
    await UserActivityLog.logActivity({
      userId: user._id.toString(),
      oderId: user.oderId,
      activityType: 'profile_update',
      description: 'Demo account converted to real account',
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: userAgent,
      device: userAgent.includes('Mobile') ? 'mobile' : 'desktop',
      os: parseOS(userAgent),
      browser: parseBrowser(userAgent),
      status: 'success'
    });
    
    res.json({
      success: true,
      message: 'Account converted to real account successfully. Your wallet has been reset to zero.',
      user: {
        id: user.oderId,
        oderId: user.oderId,
        name: user.name,
        email: user.email,
        phone: user.phone,
        wallet: user.wallet,
        stats: user.stats,
        isDemo: false,
        demoConvertedToReal: true
      }
    });
    
  } catch (error) {
    console.error('Convert to real error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============== LOGOUT ==============
router.post('/logout', protect, async (req, res) => {
  try {
    const user = req.user;
    const { sessionId } = req.body;
    
    // Calculate session duration if sessionId provided
    let sessionDuration = null;
    if (sessionId) {
      const loginLog = await UserActivityLog.findOne({ 
        userId: user._id.toString(), 
        activityType: 'login',
        sessionId: sessionId 
      });
      if (loginLog) {
        sessionDuration = Math.floor((Date.now() - new Date(loginLog.timestamp).getTime()) / 1000);
        // Update the login log with session duration
        await UserActivityLog.updateOne({ _id: loginLog._id }, { sessionDuration });
      }
    }
    
    // Log logout activity
    const userAgent = req.get('User-Agent') || '';
    await UserActivityLog.logActivity({
      userId: user._id.toString(),
      oderId: user.oderId,
      activityType: 'logout',
      description: `User logged out${sessionDuration ? ` (Session: ${Math.floor(sessionDuration / 60)}m ${sessionDuration % 60}s)` : ''}`,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: userAgent,
      device: userAgent.includes('Mobile') ? 'mobile' : 'desktop',
      os: parseOS(userAgent),
      browser: parseBrowser(userAgent),
      status: 'success',
      sessionId: sessionId,
      sessionDuration: sessionDuration
    });
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============== GET PROFILE ==============
router.get('/profile', protect, async (req, res) => {
  try {
    const user = req.user;
    
    res.json({
      success: true,
      user: {
        id: user.oderId,
        oderId: user.oderId,
        name: user.name,
        email: user.email,
        phone: user.phone,
        profile: user.profile,
        wallet: user.wallet,
        stats: user.stats,
        leverage: user.leverage,
        currency: user.currency,
        role: user.role,
        isVerified: user.isVerified,
        isEmailVerified: user.isEmailVerified,
        isPhoneVerified: user.isPhoneVerified,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============== UPDATE PROFILE ==============
router.put('/profile', protect, async (req, res) => {
  try {
    const { name, email, phone, dateOfBirth, gender, address, city, state, country, pincode } = req.body;
    const user = req.user;

    if (email && user.role === 'admin') {
      return res.status(400).json({
        error: 'Admins must change login email from Admin → Settings → My account (password required).'
      });
    }
    
    if (name) user.name = name.trim();
    if (email) user.email = email.trim().toLowerCase();
    if (phone) user.phone = phone.trim();
    if (dateOfBirth) user.profile.dateOfBirth = new Date(dateOfBirth);
    if (gender) user.profile.gender = gender;
    if (address !== undefined) user.profile.address = address;
    if (city !== undefined) user.profile.city = city;
    if (state !== undefined) user.profile.state = state;
    if (country !== undefined) user.profile.country = country;
    if (pincode !== undefined) user.profile.pincode = pincode;
    
    await user.save();
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user.oderId,
        oderId: user.oderId,
        name: user.name,
        email: user.email,
        phone: user.phone,
        profile: user.profile
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============== UPLOAD AVATAR ==============
router.post('/avatar', protect, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }
    
    const user = req.user;
    
    // Delete old avatar if exists
    if (user.profile.avatar) {
      const oldPath = path.join(__dirname, '..', user.profile.avatar);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }
    
    // Save new avatar path
    user.profile.avatar = `/uploads/avatars/${req.file.filename}`;
    await user.save();
    
    res.json({
      success: true,
      message: 'Avatar uploaded successfully',
      avatar: user.profile.avatar
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============== CHANGE PASSWORD ==============
router.put('/change-password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const user = req.user;
    
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }
    
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'New passwords do not match' });
    }
    
    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    // Update password
    user.password = newPassword;
    await user.save();
    
    // Generate new token
    const token = signToken(user._id);
    
    res.json({
      success: true,
      message: 'Password changed successfully',
      token
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============== UPDATE EMAIL ==============
router.put('/update-email', protect, async (req, res) => {
  try {
    const { newEmail, password } = req.body;
    const user = req.user;
    
    if (!newEmail || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Password is incorrect' });
    }
    
    // Check if email already exists
    const existingEmail = await User.findOne({ 
      email: newEmail.toLowerCase(), 
      _id: { $ne: user._id } 
    });
    if (existingEmail) {
      return res.status(400).json({ error: 'Email already in use' });
    }
    
    user.email = newEmail.toLowerCase();
    user.isEmailVerified = false;
    await user.save();
    
    res.json({
      success: true,
      message: 'Email updated successfully',
      email: user.email
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============== UPDATE PHONE ==============
router.put('/update-phone', protect, async (req, res) => {
  try {
    const { newPhone, password } = req.body;
    const user = req.user;
    
    if (!newPhone || !password) {
      return res.status(400).json({ error: 'Phone and password are required' });
    }
    
    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Password is incorrect' });
    }
    
    const cleanPhone = newPhone.replace(/[^0-9]/g, '');
    
    // Check if phone already exists
    const existingPhone = await User.findOne({ 
      phone: cleanPhone, 
      _id: { $ne: user._id } 
    });
    if (existingPhone) {
      return res.status(400).json({ error: 'Phone number already in use' });
    }
    
    user.phone = cleanPhone;
    user.isPhoneVerified = false;
    await user.save();
    
    res.json({
      success: true,
      message: 'Phone updated successfully',
      phone: user.phone
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============== VERIFY TOKEN ==============
router.get('/verify', protect, async (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user.oderId,
      oderId: req.user.oderId,
      name: req.user.name,
      email: req.user.email,
      phone: req.user.phone,
      avatar: req.user.profile?.avatar || '',
      profile: req.user.profile,
      wallet: req.user.wallet,
      role: req.user.role,
      isDemo: req.user.isDemo || false,
      demoExpiresAt: req.user.demoExpiresAt || null,
      allowedTradeModes: req.user.allowedTradeModes || { hedging: true, netting: true, binary: true }
    }
  });
});

// Middleware to check admin role (use after protect)
const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Admin only.' });
  }
  next();
};

// ============== ADMIN LOGIN ==============
router.post('/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    // Find user by email, phone, or user ID
    const user = await User.findOne({
      $or: [
        { email: username.toLowerCase() },
        { phone: username.replace(/[^0-9]/g, '') },
        { oderId: username }
      ]
    });
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Check admin role
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Not an admin account.' });
    }
    
    // Check if account is locked
    if (user.lockUntil && user.lockUntil > Date.now()) {
      const waitMinutes = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(423).json({ 
        error: `Account locked. Try again in ${waitMinutes} minutes.` 
      });
    }
    
    // Check if account is active
    if (!user.isActive) {
      return res.status(403).json({ error: 'Account is deactivated. Contact support.' });
    }
    
    // Verify password
    const isMatch = await user.comparePassword(password);
    
    if (!isMatch) {
      user.loginAttempts += 1;
      if (user.loginAttempts >= 5) {
        user.lockUntil = new Date(Date.now() + 30 * 60 * 1000);
        user.loginAttempts = 0;
        await user.save();
        return res.status(423).json({ 
          error: 'Too many failed attempts. Account locked for 30 minutes.' 
        });
      }
      await user.save();
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Reset login attempts
    user.loginAttempts = 0;
    user.lockUntil = null;
    user.lastLogin = new Date();
    await user.save();
    
    const token = signToken(user._id);
    
    res.json({
      success: true,
      message: 'Admin login successful',
      token,
      user: {
        _id: user._id,
        id: user.oderId,
        oderId: user.oderId,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
    
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============== ADMIN VERIFY (check if token is still valid admin) ==============
// Supports both Admin model (super_admin/sub_admin/broker) and legacy User model (role=admin)
router.get('/admin/verify', async (req, res) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (!token) {
      return res.status(401).json({ success: false, error: 'No token' });
    }
    const decoded = jwt.verify(token, JWT_SECRET);

    // Try Admin model first (primary admin panel)
    const Admin = require('../models/Admin');
    const admin = await Admin.findById(decoded.id).select('-password');
    if (admin && admin.isActive) {
      return res.json({
        success: true,
        user: {
          _id: admin._id,
          id: admin.oderId,
          oderId: admin.oderId,
          name: admin.name,
          email: admin.email,
          phone: admin.phone || '',
          role: admin.role,
          permissions: admin.permissions,
          wallet: admin.wallet,
          parentId: admin.parentId,
          parentOderId: admin.parentOderId
        }
      });
    }

    // Fallback: legacy User model with role=admin
    const user = await User.findById(decoded.id);
    if (user && user.role === 'admin') {
      return res.json({
        success: true,
        user: {
          _id: user._id,
          id: user.oderId,
          oderId: user.oderId,
          name: user.name,
          email: user.email,
          phone: user.phone || '',
          role: user.role
        }
      });
    }

    return res.status(401).json({ success: false, error: 'Invalid session' });
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
});

// ============== SUPER ADMIN: CHANGE ADMIN ID (oderId) ==============
router.put('/admin/oder-id', protect, adminOnly, async (req, res) => {
  try {
    const { newOderId, password } = req.body;
    if (!newOderId || !password) {
      return res.status(400).json({ error: 'New admin ID and current password are required' });
    }
    const trimmed = String(newOderId).trim();
    if (trimmed.length < 3 || trimmed.length > 32) {
      return res.status(400).json({ error: 'Admin ID must be between 3 and 32 characters' });
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      return res.status(400).json({
        error: 'Admin ID may only contain letters, numbers, underscores, and hyphens'
      });
    }
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    const exists = await User.findOne({ oderId: trimmed, _id: { $ne: user._id } });
    if (exists) {
      return res.status(400).json({ error: 'This admin ID is already in use' });
    }
    user.oderId = trimmed;
    await user.save();
    res.json({
      success: true,
      message: 'Admin ID updated. Use the new ID when signing in with username/ID.',
      oderId: user.oderId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============== USER PREFERENCES ==============

// Get user preferences
router.get('/preferences', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('preferences');
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Auto-remove expired F&O instruments from watchlist
    const watchlist = Array.isArray(user.preferences?.watchlist) ? user.preferences.watchlist : [];
    if (watchlist.length > 0) {
      try {
        const ZerodhaSettings = require('../models/ZerodhaSettings');
        const settings = await ZerodhaSettings.getSettings();
        const subs = settings.subscribedInstruments || [];
        const subBySym = new Map(subs.map((s) => [String(s.symbol || '').toUpperCase(), s]));
        
        // Get current date in IST
        const now = new Date();
        const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        const todayStart = new Date(istNow.getFullYear(), istNow.getMonth(), istNow.getDate()).getTime();
        
        const expiredSymbols = new Set();
        for (const sym of watchlist) {
          const sub = subBySym.get(String(sym).toUpperCase());
          if (!sub?.expiry) continue;
          const expDate = new Date(sub.expiry);
          if (isNaN(expDate.getTime())) continue;
          const istExp = new Date(expDate.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
          const expStart = new Date(istExp.getFullYear(), istExp.getMonth(), istExp.getDate()).getTime();
          if (expStart < todayStart) {
            expiredSymbols.add(String(sym).toUpperCase());
          }
        }
        
        if (expiredSymbols.size > 0) {
          const newWatchlist = watchlist.filter((s) => !expiredSymbols.has(String(s).toUpperCase()));
          await User.updateOne({ _id: req.user._id }, { $set: { 'preferences.watchlist': newWatchlist } });
          user.preferences.watchlist = newWatchlist;
          console.log(`[Preferences] Auto-removed ${expiredSymbols.size} expired instruments from watchlist for user ${req.user._id}`);
        }
      } catch (e) {
        console.warn('[Preferences] Error checking expired watchlist items:', e.message);
      }
    }
    
    res.json({ success: true, preferences: user.preferences || {} });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update user preferences
router.put('/preferences', protect, async (req, res) => {
  try {
    const {
      displayCurrency,
      darkMode,
      activePage,
      watchlist,
      chartInterval,
      orderPanelSide,
      lastSelectedSymbol,
      chartTabs
    } = req.body;
    
    const updateFields = {};
    if (displayCurrency !== undefined) updateFields['preferences.displayCurrency'] = displayCurrency;
    if (darkMode !== undefined) updateFields['preferences.darkMode'] = darkMode;
    if (activePage !== undefined) updateFields['preferences.activePage'] = activePage;
    if (watchlist !== undefined) updateFields['preferences.watchlist'] = watchlist;
    if (chartInterval !== undefined) updateFields['preferences.chartInterval'] = chartInterval;
    if (orderPanelSide !== undefined) updateFields['preferences.orderPanelSide'] = orderPanelSide;
    if (lastSelectedSymbol !== undefined) {
      updateFields['preferences.lastSelectedSymbol'] =
        typeof lastSelectedSymbol === 'string' ? lastSelectedSymbol.slice(0, 120) : '';
    }
    if (chartTabs !== undefined) {
      updateFields['preferences.chartTabs'] = Array.isArray(chartTabs)
        ? chartTabs.map((t) => String(t).slice(0, 120)).filter(Boolean).slice(0, 20)
        : [];
    }
    
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updateFields },
      { new: true, runValidators: true }
    ).select('preferences');
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    res.json({ success: true, preferences: user.preferences });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update watchlist only
router.put('/preferences/watchlist', protect, async (req, res) => {
  try {
    const { watchlist } = req.body;
    
    if (!Array.isArray(watchlist)) {
      return res.status(400).json({ success: false, error: 'Watchlist must be an array' });
    }
    
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { 'preferences.watchlist': watchlist } },
      { new: true }
    ).select('preferences.watchlist');
    
    res.json({ success: true, watchlist: user.preferences?.watchlist || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add symbol to watchlist
router.post('/preferences/watchlist/:symbol', protect, async (req, res) => {
  try {
    const { symbol } = req.params;
    
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $addToSet: { 'preferences.watchlist': symbol } },
      { new: true }
    ).select('preferences.watchlist');
    
    res.json({ success: true, watchlist: user.preferences?.watchlist || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Remove symbol from watchlist
router.delete('/preferences/watchlist/:symbol', protect, async (req, res) => {
  try {
    const { symbol } = req.params;
    
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $pull: { 'preferences.watchlist': symbol } },
      { new: true }
    ).select('preferences.watchlist');
    
    res.json({ success: true, watchlist: user.preferences?.watchlist || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== SEED ADMIN (one-time setup) ==============
// HARDENED: this was previously a public endpoint that:
//   1. Created a super-admin User if none existed (using the User collection,
//      ignoring the separate Admin collection — so an attacker on a real
//      deploy could mint themselves a User-admin even after legitimate setup).
//   2. Returned the password in the HTTP response body.
//   3. Fell back to a hardcoded password 'admin@SetupFX2024' if env was unset.
//
// New behavior:
//   - Disabled entirely in production (NODE_ENV === 'production').
//   - Requires a SEED_TOKEN env var that must match a header on every call.
//   - Refuses to use the hardcoded fallback password.
//   - Does NOT return the password in the response.
//   - Use scripts/seedUserAdmin.js for production seeding instead.
router.post('/admin/seed', async (req, res) => {
  try {
    if ((process.env.NODE_ENV || 'development') === 'production') {
      return res.status(404).json({ error: 'Not found' });
    }
    const requiredToken = process.env.SEED_TOKEN;
    const providedToken = req.headers['x-seed-token'];
    if (!requiredToken || providedToken !== requiredToken) {
      return res.status(404).json({ error: 'Not found' });
    }

    // Check both User and Admin collections — previously only User was checked.
    const existingUserAdmin = await User.findOne({ role: 'admin' });
    if (existingUserAdmin) {
      return res.status(400).json({ error: 'Admin already exists. Use admin login.' });
    }
    const Admin = require('../models/Admin');
    const existingSuperAdmin = await Admin.findOne({ role: 'super_admin' });
    if (existingSuperAdmin) {
      return res.status(400).json({ error: 'Super admin already exists in Admin collection. Use admin login.' });
    }

    const adminPassword = process.env.ADMIN_DEFAULT_PASSWORD;
    if (!adminPassword || adminPassword.length < 12) {
      return res.status(400).json({
        error: 'ADMIN_DEFAULT_PASSWORD env var must be set and at least 12 characters.'
      });
    }
    const userId = await User.generateUserId();

    const admin = new User({
      oderId: userId,
      name: 'Super Admin',
      email: 'admin@SetupFX.com',
      phone: '+919999000001',
      password: adminPassword,
      role: 'admin',
      isActive: true,
      isVerified: true,
      isEmailVerified: true,
      isPhoneVerified: true,
      wallet: { balance: 0, credit: 0, equity: 0, margin: 0, freeMargin: 0, marginLevel: 0 }
    });

    await admin.save();

    // Do NOT return the password in the response. The operator already knows
    // it (they set the env var) — echoing it just creates audit-log leaks.
    res.status(201).json({
      success: true,
      message: 'Admin account created successfully. Password is the value of ADMIN_DEFAULT_PASSWORD env var.',
      userId
    });

  } catch (error) {
    console.error('Admin seed error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = { router, protect, adminOnly };
