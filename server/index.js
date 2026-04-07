require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');
const { connectDB } = require('./config/database');
const TradeModeSettings = require('./models/Settings');
const Trade = require('./models/Trade');
const User = require('./models/User');
const Banner = require('./models/Banner');
const Transaction = require('./models/Transaction');
const PaymentMethod = require('./models/PaymentMethod');
const { SpreadSetting, CommissionSetting, SwapSetting, MarginSetting, LeverageSetting, FeeSetting } = require('./models/ChargeSettings');
const { HedgingPosition, NettingPosition, BinaryTrade } = require('./models/Position');
const KYC = require('./models/KYC');
const UserActivityLog = require('./models/UserActivityLog');
const AdminActivityLog = require('./models/AdminActivityLog');
const Admin = require('./models/Admin');
const Segment = require('./models/Segment');
const ScriptOverride = require('./models/ScriptOverride');
const UserSegmentSettings = require('./models/UserSegmentSettings');
const HedgingSegment = require('./models/HedgingSegment');
const HedgingScriptOverride = require('./models/HedgingScriptOverride');
const AdminPaymentDetail = require('./models/AdminPaymentDetail');
const ZerodhaSettings = require('./models/ZerodhaSettings');
const zerodhaService = require('./services/zerodha.service');
const {
  filterZerodhaInstrumentsByExpirySettings,
  mapAdminSegmentToExpirySettingsKey,
  inferExpiryKeyFromExchangeAndType
} = require('./services/indianFnOExpiryFilter');
const MarketControl = require('./models/MarketControl');
const UserInstruments = require('./models/UserInstruments');
const ReorderSettings = require('./models/ReorderSettings');
const Notification = require('./models/Notification');
const RiskSettings = require('./models/RiskSettings');
const UserRiskSettings = require('./models/UserRiskSettings');
const ExpirySettings = require('./models/ExpirySettings');
const mongoose = require('mongoose');
const { saveAdminTradeEditLog } = require('./utils/tradeEditLog');

const { router: authRouter } = require('./routes/auth');
const adminEmailTemplatesRouter = require('./routes/adminEmailTemplates');
const metaApiProxyRouter = require('./routes/metaApiProxy');

// Redis for scaling (optional - falls back to memory if not available)
let redisClient = null;
let RedisStore = null;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const NODE_ENV = process.env.NODE_ENV || 'development';
const DEMO_MODE_ENABLED = process.env.DEMO_MODE_ENABLED !== 'false'; // Disable in production

/** Local Vite / CRA-style dev servers (always merged so local + prod both work when env lists production). */
const LOCAL_DEV_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

/** Used when CORS_ORIGIN is unset and NODE_ENV is production. */
const DEFAULT_PRODUCTION_ORIGINS = [
  'https://setupfx.io',
  'https://www.setupfx.io',
  'https://admin.setupfx.io'
];

const parsedCorsOrigins = String(process.env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const baseCorsOrigins =
  parsedCorsOrigins.length > 0
    ? parsedCorsOrigins
    : NODE_ENV === 'production'
      ? DEFAULT_PRODUCTION_ORIGINS
      : ['http://localhost:5173'];

const ALLOWED_CORS_ORIGINS = [...new Set([...baseCorsOrigins, ...LOCAL_DEV_ORIGINS])];

/** Zerodha OAuth redirects to /admin/... — prefer admin host when present. Override with FRONTEND_URL. */
const PRIMARY_FRONTEND_URL =
  process.env.FRONTEND_URL ||
  (() => {
    const adminOrigin = baseCorsOrigins.find((o) => /admin\./i.test(o));
    if (adminOrigin) return adminOrigin;
    if (baseCorsOrigins[0]) return baseCorsOrigins[0];
    return NODE_ENV === 'production' ? 'https://admin.setupfx.io' : 'http://localhost:5173';
  })();

const app = express();
const server = http.createServer(app);

// Socket.IO optimized for 3000+ concurrent users
const io = new Server(server, {
  cors: {
    origin: ALLOWED_CORS_ORIGINS,
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  },
  // Performance optimizations for high concurrency
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
  allowUpgrades: true,
  perMessageDeflate: {
    threshold: 1024 // Only compress messages > 1KB
  },
  maxHttpBufferSize: 1e6 // 1MB max message size
});

// ============== SECURITY MIDDLEWARE ==============

// Set security HTTP headers (configured for Cloudflare proxy)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false,
  // Disable HSTS as Cloudflare handles SSL
  strictTransportSecurity: false,
  // Disable upgrade-insecure-requests as Cloudflare handles this
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https:", "wss:"],
      fontSrc: ["'self'", "https:", "data:"],
      objectSrc: ["'none'"],
      frameSrc: ["'self'"],
      upgradeInsecureRequests: null // Disable upgrade-insecure-requests
    }
  }
}));

// Trust Cloudflare proxy
app.set('trust proxy', true);

// Rate limiting - General API (very high limit for trading app with many users)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100000, // 100k requests per 15 min (supports 3000+ concurrent users)
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiting - Auth endpoints (disabled)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 0, // 0 = unlimited
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiting - Admin login (disabled)
const adminAuthLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 0, // 0 = unlimited
  standardHeaders: true,
  legacyHeaders: false
});

// CORS with specific origin - MUST be before rate limiting so 429 responses include CORS headers
app.use(cors({
  origin: ALLOWED_CORS_ORIGINS,
  credentials: true
}));

// Apply general rate limiting to all routes (after CORS)
app.use('/api/', generalLimiter);

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Data sanitization against NoSQL injection (custom middleware for Express 5.x compatibility)
const sanitizeInput = (obj) => {
  if (obj && typeof obj === 'object') {
    for (const key in obj) {
      if (key.startsWith('$') || key.includes('.')) {
        delete obj[key];
      } else if (typeof obj[key] === 'object') {
        sanitizeInput(obj[key]);
      }
    }
  }
  return obj;
};

app.use((req, res, next) => {
  if (req.body) sanitizeInput(req.body);
  if (req.params) sanitizeInput(req.params);
  next();
});

// Prevent HTTP Parameter Pollution
app.use(hpp());

// Trust proxy for accurate IP detection behind reverse proxies
app.set('trust proxy', 1);

// Serve static files (avatars)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Auth routes (no rate limiting)
app.use('/api/auth', authRouter);
app.use('/api/admin/email-templates', adminEmailTemplatesRouter);

// MetaAPI proxy routes (hides token from client)
app.use('/api/metaapi', metaApiProxyRouter);

// IB, Copy Trading, and Wallet routes
const ibRouter = require('./routes/ib');
const copyTradeRouter = require('./routes/copyTrade');
const walletRouter = require('./routes/wallet');

app.use('/api/ib', ibRouter);
app.use('/api/copy-trade', copyTradeRouter);
app.use('/api/wallet', walletRouter);

// Import execution engines
const HedgingEngine = require('./engines/HedgingEngine');
const NettingEngine = require('./engines/NettingEngine');
const BinaryEngine = require('./engines/BinaryEngine');
const MetaApiStreamingService = require('./services/metaApiStreaming');
const DeltaExchangeStreamingService = require('./services/deltaExchangeStreaming');

// Import IB/Copy Trading services for trade hooks
const commissionService = require('./services/commission.service');
const copyTradeService = require('./services/copyTrade.service');
const { initializeCronJobs, setSocketIO: setCronSocketIO, triggerOptionExpirySettlement } = require('./cron/settlement.cron');
const riskManagement = require('./services/riskManagement.service');
const { refreshRate: refreshUsdInrRate } = require('./services/currencyRateService');

// Initialize engines (will be set after DB connection)
let hedgingEngine = null;
let nettingEngine = null;
let binaryEngine = null;
let metaApiStreaming = null;
let deltaExchangeStreaming = null;

// Connect to MongoDB and initialize engines
connectDB().then(async () => {
  hedgingEngine = new HedgingEngine();
  nettingEngine = new NettingEngine();
  binaryEngine = new BinaryEngine(io);
  riskManagement.setRiskEngines(hedgingEngine, nettingEngine);
  console.log('⚙️ Trade mode settings initialized');

  // Initialize MetaAPI streaming for real-time prices (non-blocking)
  metaApiStreaming = new MetaApiStreamingService(io);
  metaApiStreaming.initialize().catch(err => console.error('MetaAPI init error:', err.message));
  
  // Initialize Delta Exchange streaming for crypto futures & options
  deltaExchangeStreaming = new DeltaExchangeStreamingService(io);
  nettingEngine.setDeltaExchangeStreaming(deltaExchangeStreaming);
  deltaExchangeStreaming.initialize().catch(err => console.error('Delta Exchange init error:', err.message));

  metaApiStreaming.setTradeEngines(hedgingEngine, nettingEngine, deltaExchangeStreaming);
  
  // Initialize IB/Copy Trading cron jobs with Socket.IO for notifications
  setCronSocketIO(io);
  initializeCronJobs();
  console.log('📅 Settlement cron jobs initialized');
  
  // Initialize live USD/INR rate (for INR commission/swap conversion)
  refreshUsdInrRate().then(rate => console.log(`💱 Live USD/INR rate initialized: ${rate}`));

  try {
    const emailTemplateService = require('./services/emailTemplate.service');
    const n = await emailTemplateService.seedMissingTemplates();
    if (n) console.log(`📧 Seeded ${n} default email template(s)`);
  } catch (err) {
    console.error('Email template seed:', err.message);
  }
});

// ============== API ROUTES ==============

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get current live prices (for debugging)
app.get('/api/live-prices', (req, res) => {
  if (metaApiStreaming && metaApiStreaming.prices) {
    const prices = metaApiStreaming.prices;
    const symbols = Object.keys(prices);
    res.json({ 
      success: true, 
      count: symbols.length,
      symbols: symbols
    });
  } else {
    res.json({ success: false, error: 'MetaAPI not initialized' });
  }
});

/** MetaAPI may expose both XAUUSD and XAUUSD.c with the same quotes; keep one row per underlying. */
function brokerInstrumentBaseKey(symbol) {
  return String(symbol || '').replace(/\.[a-zA-Z0-9]+$/, '').toUpperCase();
}
function brokerInstrumentPreferenceRank(sym) {
  const s = String(sym);
  const hasSuffix = /\.[a-zA-Z0-9]+$/.test(s);
  return (hasSuffix ? 1 << 20 : 0) + s.length;
}
function pickBetterBrokerInstrumentSymbol(a, b) {
  const ra = brokerInstrumentPreferenceRank(a);
  const rb = brokerInstrumentPreferenceRank(b);
  if (ra !== rb) return ra < rb ? a : b;
  return a <= b ? a : b;
}
function dedupeMetaInstrumentsByBrokerBase(instruments) {
  const map = new Map();
  for (const inst of instruments) {
    const base = brokerInstrumentBaseKey(inst.symbol);
    const prev = map.get(base);
    if (!prev) map.set(base, inst);
    else {
      const chosenSym = pickBetterBrokerInstrumentSymbol(prev.symbol, inst.symbol);
      map.set(base, chosenSym === prev.symbol ? prev : inst);
    }
  }
  return Array.from(map.values());
}

// Get all available instruments from broker with live prices
app.get('/api/instruments', (req, res) => {
  if (metaApiStreaming && metaApiStreaming.prices) {
    const prices = metaApiStreaming.prices;
    const { search, category } = req.query;
    
    // Build instruments list from all available prices
    let instruments = Object.entries(prices).map(([symbol, priceData]) => {
      // Determine category based on symbol pattern
      let cat = 'other';
      const sym = symbol.toUpperCase();
      const baseSym = sym.replace(/\.[A-Z0-9]+$/i, '');
      
      // Crypto — check BEFORE forex so BTCUSD/ETHUSD (6 chars) don't match forex pattern
      if (baseSym.includes('BTC') || baseSym.includes('ETH') || baseSym.includes('LTC') || baseSym.includes('XRP') || 
               baseSym.includes('ADA') || baseSym.includes('DOT') || baseSym.includes('SOL') || baseSym.includes('DOGE') ||
               baseSym.includes('LINK') || baseSym.includes('MATIC') || baseSym.includes('AVAX') || baseSym.includes('BCH') ||
               baseSym.includes('BNB') || baseSym.includes('SHIB') || baseSym.includes('PEPE') || baseSym.includes('APT') ||
               baseSym.includes('ARB') || baseSym.includes('OP') || baseSym.includes('NEAR') || baseSym.includes('ATOM')) {
        cat = 'crypto_perpetual';
      }
      // Metals
      else if (baseSym.startsWith('XAU') || baseSym.startsWith('XAG') || baseSym.startsWith('XPT') || baseSym.startsWith('XPD')) {
        cat = 'metals';
      }
      // Forex pairs (6 chars, both parts are currencies)
      else if (/^[A-Z]{6}$/.test(baseSym)) {
        if (baseSym.includes('JPY')) cat = 'forex_yen';
        else cat = 'forex';
      }
      // International equities (broker suffix .US, .DE, …)
      else if (
        /^[A-Z]{1,5}$/.test(baseSym) &&
        (sym.includes('.US') || sym.includes('.DE') || sym.includes('.UK') || sym.includes('.EU') || sym.includes('.FR'))
      ) {
        cat = 'stocks';
      }
      // Indices
      else if (baseSym.startsWith('US') || baseSym.startsWith('UK') || baseSym.startsWith('DE') || baseSym.startsWith('JP') ||
               baseSym.startsWith('HK') || baseSym.startsWith('AU') || baseSym.startsWith('CN') || baseSym.startsWith('EU') ||
               baseSym.includes('100') || baseSym.includes('500') || baseSym.includes('30') || baseSym.includes('225') ||
               baseSym.includes('DAX') || baseSym.includes('FTSE') || baseSym.includes('NIKKEI') || baseSym.includes('STOXX')) {
        cat = 'indices';
      }
      // Energy/Commodities
      else if (baseSym.includes('OIL') || baseSym.includes('GAS') || baseSym.includes('BRENT') || baseSym.includes('WTI') ||
               baseSym.includes('XTI') || baseSym.includes('XBR') || baseSym.includes('NGAS')) {
        cat = 'energy';
      }
      
      return {
        symbol,
        name: getInstrumentName(baseSym),
        category: cat,
        exchange: cat === 'forex' || cat === 'forex_yen' ? 'FOREX'
                : cat === 'stocks' ? 'STOCKS'
                : cat === 'indices' ? 'INDICES'
                : cat === 'metals' || cat === 'energy' ? 'COMMODITIES'
                : '',
        bid: priceData.bid || 0,
        ask: priceData.ask || 0,
        low: priceData.low || 0,
        high: priceData.high || 0,
        change: priceData.change || 0,
        spread: priceData.spread || 0,
        time: priceData.time
      };
    });

    instruments = dedupeMetaInstrumentsByBrokerBase(instruments);

    // Filter by search query (base-aware so e.g. XAUUSD.c still finds the canonical XAUUSD row)
    if (search) {
      const searchLower = search.toLowerCase();
      const searchBase = searchLower.replace(/\.[a-zA-Z0-9]+$/, '');
      instruments = instruments.filter(inst => {
        const sym = inst.symbol.toLowerCase();
        const base = brokerInstrumentBaseKey(inst.symbol).toLowerCase();
        return (
          sym.includes(searchLower) ||
          base.includes(searchBase) ||
          sym.includes(searchBase) ||
          (inst.name && inst.name.toLowerCase().includes(searchLower))
        );
      });
    }
    
    // Filter by category (UI: Com = metals+energy, Forex = majors+crosses incl. JPY)
    if (category && category !== 'all') {
      if (category === 'com') {
        instruments = instruments.filter(inst => inst.category === 'metals' || inst.category === 'energy');
      } else if (category === 'forex') {
        instruments = instruments.filter(inst => inst.category === 'forex' || inst.category === 'forex_yen');
      } else if (category === 'crypto_spot') {
        instruments = instruments.filter(() => false);
      } else {
        instruments = instruments.filter(inst => inst.category === category);
      }
    }
    
    // Sort alphabetically
    instruments.sort((a, b) => a.symbol.localeCompare(b.symbol));
    
    res.json({ 
      success: true, 
      count: instruments.length,
      instruments: instruments
    });
  } else {
    res.json({ success: false, error: 'MetaAPI not initialized', instruments: [] });
  }
});

// Batch: live bid/ask from MetaAPI streaming cache + REST alias fallback (broker symbols like EURUSD.c)
app.post('/api/instruments/prices', async (req, res) => {
  try {
    const symbols = req.body?.symbols;
    if (!Array.isArray(symbols)) {
      return res.status(400).json({ success: false, error: 'symbols array required' });
    }
    const cache = metaApiStreaming?.prices || {};
    const prices = {};
    for (const raw of symbols) {
      if (!raw) continue;
      const upper = String(raw).toUpperCase();
      let p = cache[upper] || cache[raw];
      if (!p) {
        const hit = Object.keys(cache).find(
          (k) => k.replace(/\.[a-zA-Z0-9]+$/, '').toUpperCase() === upper
        );
        if (hit) p = cache[hit];
      }
      if (p && (Number(p.bid) > 0 || Number(p.ask) > 0)) {
        prices[raw] = {
          bid: p.bid,
          ask: p.ask,
          low: p.low,
          high: p.high,
          change: p.change,
          pointChange: p.pointChange,
          sessionOpen: p.sessionOpen,
          previousClose: p.previousClose,
          open: p.sessionOpen,
          close: p.previousClose
        };
      }
    }

    const needRest = symbols.filter((raw) => {
      if (!raw) return false;
      const got = prices[raw];
      return !got || (Number(got.bid) <= 0 && Number(got.ask) <= 0);
    });
    const restFn = MetaApiStreamingService.restPriceForSymbol;
    if (needRest.length > 0 && typeof restFn === 'function') {
      await Promise.all(
        needRest.map(async (raw) => {
          try {
            const r = await restFn(raw);
            if (!r) return;
            prices[raw] = {
              bid: r.bid,
              ask: r.ask,
              low: r.low,
              high: r.high,
              change: 0,
              pointChange: 0,
              sessionOpen: r.sessionOpen,
              previousClose: r.previousClose,
              open: r.sessionOpen,
              close: r.previousClose
            };
            const upper = String(raw).toUpperCase();
            if (metaApiStreaming?.prices) {
              metaApiStreaming.prices[upper] = {
                symbol: upper,
                bid: r.bid,
                ask: r.ask,
                low: r.low,
                high: r.high,
                change: 0,
                pointChange: 0,
                sessionOpen: r.sessionOpen,
                previousClose: r.previousClose,
                time: new Date().toISOString()
              };
            }
          } catch (_) {
            /* ignore per symbol */
          }
        })
      );
    }

    const diskPrices =
      typeof MetaApiStreamingService.loadDiskCacheForFallback === 'function'
        ? MetaApiStreamingService.loadDiskCacheForFallback()
        : {};
    const pickDiskPrice = (sym) => {
      if (!sym || !diskPrices || typeof diskPrices !== 'object') return null;
      const upper = String(sym).toUpperCase();
      let p = diskPrices[upper] || diskPrices[sym];
      if (p && (Number(p.bid) > 0 || Number(p.ask) > 0)) return p;
      const hit = Object.keys(diskPrices).find(
        (k) => k.replace(/\.[a-zA-Z0-9]+$/, '').toUpperCase() === upper
      );
      return hit ? diskPrices[hit] : null;
    };
    for (const raw of symbols) {
      if (!raw) continue;
      const got = prices[raw];
      if (got && Number(got.bid) > 0 && Number(got.ask) > 0) continue;
      const d = pickDiskPrice(raw);
      if (d && (Number(d.bid) > 0 || Number(d.ask) > 0)) {
        prices[raw] = {
          bid: d.bid,
          ask: d.ask,
          low: d.low,
          high: d.high,
          change: d.change ?? 0,
          pointChange: d.pointChange,
          sessionOpen: d.sessionOpen,
          previousClose: d.previousClose,
          open: d.sessionOpen,
          close: d.previousClose
        };
      }
    }

    res.json({ success: true, prices });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Helper function to get human-readable instrument name
function getInstrumentName(symbol) {
  const names = {
    // Forex Majors
    'EURUSD': 'Euro / US Dollar', 'GBPUSD': 'British Pound / US Dollar', 'USDJPY': 'US Dollar / Japanese Yen',
    'USDCHF': 'US Dollar / Swiss Franc', 'AUDUSD': 'Australian Dollar / US Dollar', 'USDCAD': 'US Dollar / Canadian Dollar',
    'NZDUSD': 'New Zealand Dollar / US Dollar',
    // Forex Cross
    'EURGBP': 'Euro / British Pound', 'EURJPY': 'Euro / Japanese Yen', 'GBPJPY': 'British Pound / Japanese Yen',
    'EURCHF': 'Euro / Swiss Franc', 'EURAUD': 'Euro / Australian Dollar', 'GBPAUD': 'British Pound / Australian Dollar',
    'AUDNZD': 'Australian Dollar / New Zealand Dollar', 'CADJPY': 'Canadian Dollar / Japanese Yen',
    'CHFJPY': 'Swiss Franc / Japanese Yen', 'NZDJPY': 'New Zealand Dollar / Japanese Yen',
    // Metals
    'XAUUSD': 'Gold / US Dollar', 'XAGUSD': 'Silver / US Dollar', 'XPTUSD': 'Platinum / US Dollar', 'XPDUSD': 'Palladium / US Dollar',
    'XAUEUR': 'Gold / Euro', 'XAUGBP': 'Gold / British Pound',
    // Crypto
    'BTCUSD': 'Bitcoin / US Dollar', 'ETHUSD': 'Ethereum / US Dollar', 'LTCUSD': 'Litecoin / US Dollar',
    'XRPUSD': 'Ripple / US Dollar', 'ADAUSD': 'Cardano / US Dollar', 'SOLUSD': 'Solana / US Dollar',
    'DOGEUSD': 'Dogecoin / US Dollar', 'DOTUSD': 'Polkadot / US Dollar',
    // Indices
    'US30': 'Dow Jones 30', 'US100': 'Nasdaq 100', 'US500': 'S&P 500', 'US2000': 'Russell 2000',
    'UK100': 'FTSE 100', 'DE40': 'DAX 40', 'JP225': 'Nikkei 225', 'HK50': 'Hang Seng 50',
    'AUS200': 'ASX 200', 'EU50': 'Euro Stoxx 50',
    // Energy
    'USOIL': 'WTI Crude Oil', 'UKOIL': 'Brent Crude Oil', 'XTIUSD': 'WTI Oil', 'XBRUSD': 'Brent Oil',
    'NATGAS': 'Natural Gas', 'NGAS': 'Natural Gas',
    // US equity CFDs (MetaAPI)
    'AAPL': 'Apple Inc', 'MSFT': 'Microsoft', 'GOOGL': 'Alphabet Inc', 'GOOG': 'Alphabet Inc',
    'AMZN': 'Amazon', 'META': 'Meta Platforms', 'TSLA': 'Tesla', 'NVDA': 'NVIDIA', 'AMD': 'AMD',
    'NFLX': 'Netflix', 'DIS': 'Walt Disney', 'BA': 'Boeing', 'JPM': 'JPMorgan Chase',
    'V': 'Visa', 'MA': 'Mastercard', 'WMT': 'Walmart', 'PFE': 'Pfizer', 'JNJ': 'Johnson & Johnson',
    'INTC': 'Intel', 'CSCO': 'Cisco', 'ORCL': 'Oracle', 'IBM': 'IBM', 'CRM': 'Salesforce',
    'PYPL': 'PayPal', 'SQ': 'Block (Square)', 'COIN': 'Coinbase'
  };
  
  if (names[symbol]) return names[symbol];
  
  // Generate name from symbol
  if (symbol.length === 6) {
    const base = symbol.substring(0, 3);
    const quote = symbol.substring(3, 6);
    return `${base} / ${quote}`;
  }
  
  return symbol;
}

// Get Delta Exchange instruments (Crypto Futures & Options)
app.get('/api/delta/instruments', (req, res) => {
  if (deltaExchangeStreaming) {
    const { search, category } = req.query;
    
    let instruments = [];
    
    if (category && category !== 'all') {
      instruments = deltaExchangeStreaming.getInstrumentsByCategory(category);
    } else {
      instruments = deltaExchangeStreaming.getAllInstruments();
    }
    
    // Filter by search query
    if (search) {
      const searchLower = search.toLowerCase();
      instruments = instruments.filter(inst => 
        inst.symbol.toLowerCase().includes(searchLower) ||
        inst.name.toLowerCase().includes(searchLower) ||
        (inst.underlying && inst.underlying.toLowerCase().includes(searchLower))
      );
    }
    
    // Sort by symbol
    instruments.sort((a, b) => a.symbol.localeCompare(b.symbol));
    
    res.json({ 
      success: true, 
      count: instruments.length,
      instruments: instruments
    });
  } else {
    res.json({ success: false, error: 'Delta Exchange not initialized', instruments: [] });
  }
});

// Get Delta Exchange status
app.get('/api/delta/status', (req, res) => {
  if (deltaExchangeStreaming) {
    res.json({ 
      success: true, 
      ...deltaExchangeStreaming.getStatus()
    });
  } else {
    res.json({ success: false, error: 'Delta Exchange not initialized' });
  }
});

// Get Delta Exchange live prices
app.get('/api/delta/prices', (req, res) => {
  if (deltaExchangeStreaming) {
    const prices = deltaExchangeStreaming.getPrices();
    res.json({ 
      success: true, 
      count: Object.keys(prices).length,
      prices: prices
    });
  } else {
    res.json({ success: false, error: 'Delta Exchange not initialized', prices: {} });
  }
});

app.get('/api/delta/history/:symbol', async (req, res) => {
  try {
    const axios = require('axios');
    const DELTA_API_URL = process.env.DELTA_API_URL || 'https://api.india.delta.exchange';
    const { symbol } = req.params;
    const resolution = req.query.resolution || '5m';
    const end = Math.floor(Date.now() / 1000);
    const lookbackSec = Math.min(86400 * 400, Math.max(300, parseInt(req.query.lookbackSec || '604800', 10)));
    const start = end - lookbackSec;

    const url = `${DELTA_API_URL.replace(/\/$/, '')}/v2/history/candles`;
    const response = await axios.get(url, {
      params: { symbol, resolution, start, end },
      headers: { Accept: 'application/json' },
      timeout: 20000
    });

    const result = response.data?.result;
    if (!Array.isArray(result)) {
      return res.json({ success: true, candles: [] });
    }
    const candles = [...result]
      .sort((a, b) => a.time - b.time)
      .map((c) => ({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume != null ? c.volume : 0
      }));
    res.json({ success: true, candles });
  } catch (error) {
    const msg = error.response?.data?.error || error.message;
    console.error('Delta history error:', msg);
    res.status(502).json({ success: false, error: String(msg || 'Delta history failed') });
  }
});

// Get trade mode settings
app.get('/api/settings/trade-modes', async (req, res) => {
  try {
    const settings = await TradeModeSettings.find({});
    const result = {};
    settings.forEach(s => { result[s.mode] = s.toObject(); });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update trade mode settings
app.put('/api/settings/trade-modes/:mode', async (req, res) => {
  try {
    const { mode } = req.params;
    const settings = await TradeModeSettings.findOneAndUpdate(
      { mode },
      { ...req.body },
      { new: true, upsert: true }
    );
    res.json({ success: true, settings: settings.toObject() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============== DEMO ACCOUNT SETTINGS ==============
const DemoSettings = require('./models/DemoSettings');

// Get demo settings
app.get('/api/settings/demo', async (req, res) => {
  try {
    const settings = await DemoSettings.getSettings();
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update demo settings
app.put('/api/settings/demo', async (req, res) => {
  try {
    let settings = await DemoSettings.findOne();
    if (!settings) {
      settings = new DemoSettings(req.body);
    } else {
      Object.assign(settings, req.body);
    }
    await settings.save();
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete expired demo accounts (can be called by cron job or admin)
app.delete('/api/admin/demo-accounts/cleanup', async (req, res) => {
  try {
    const now = new Date();
    const expiredDemoUsers = await User.find({
      isDemo: true,
      demoExpiresAt: { $lt: now }
    });
    
    const deletedCount = expiredDemoUsers.length;
    
    // Delete expired demo accounts and their related data
    for (const user of expiredDemoUsers) {
      // Delete trades
      await Trade.deleteMany({ oderId: user.oderId });
      // Delete user
      await User.deleteOne({ _id: user._id });
    }
    
    res.json({ 
      success: true, 
      message: `Deleted ${deletedCount} expired demo accounts`,
      deletedCount 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============== ORDER EXECUTION ==============

// Place order (unified endpoint)
app.post('/api/orders', async (req, res) => {
  try {
    const { mode, userId, ...orderData } = req.body;

    if (!mode || !userId) {
      return res.status(400).json({ error: 'Mode and userId are required' });
    }

    if (!hedgingEngine || !nettingEngine || !binaryEngine) {
      return res.status(503).json({ error: 'Server initializing, please try again' });
    }

    let result;

    // Create getCurrentPrice callback for reorder functionality
    const getCurrentPriceCallback = async () => {
      try {
        const symbol = orderData.symbol;
        console.log(`[Reorder Callback] Getting current price for ${symbol}`);
        // Try to get current price from MetaAPI streaming service
        if (metaApiStreaming) {
          const price = metaApiStreaming.getPrice(symbol);
          console.log(`[Reorder Callback] MetaAPI price for ${symbol}:`, price);
          if (price && price.bid) {
            const resultPrice = orderData.side === 'buy' ? price.ask : price.bid;
            console.log(`[Reorder Callback] Returning price: ${resultPrice} for side: ${orderData.side}`);
            return resultPrice;
          }
        }
        // Fallback to the price from order data
        console.log(`[Reorder Callback] Using fallback price: ${orderData.price}`);
        return orderData.price;
      } catch (error) {
        console.error('[Reorder] Error getting current price:', error);
        return orderData.price;
      }
    };

    console.log(`[Order API] Placing order - mode: ${mode}, symbol: ${orderData.symbol}, side: ${orderData.side}, price: ${orderData.price}`);

    switch (mode) {
      case 'hedging':
        console.log(`[Order API] Calling hedgingEngine.executeOrder with getCurrentPriceCallback`);
        result = await hedgingEngine.executeOrder(userId, orderData, orderData.marketData, getCurrentPriceCallback);
        break;
      case 'netting':
        console.log(`[Order API] Calling nettingEngine.executeOrder with getCurrentPriceCallback`);
        result = await nettingEngine.executeOrder(userId, orderData, orderData.marketData, getCurrentPriceCallback);
        break;
      case 'binary':
        result = await binaryEngine.executeOrder(userId, orderData);
        break;
      default:
        return res.status(400).json({ error: 'Invalid trading mode' });
    }

    // Log order placed activity
    const user = await User.findOne({ oderId: userId });
    if (user && result.position) {
      const pos = result.position;
      const isPending = pos.status === 'pending' || orderData.orderType === 'limit' || orderData.orderType === 'stop';
      const orderUserAgent = req.get('User-Agent') || '';
      await UserActivityLog.logActivity({
        userId: user._id.toString(),
        oderId: userId,
        activityType: isPending ? 'order_placed' : 'trade_open',
        description: isPending 
          ? `Placed ${orderData.orderType?.toUpperCase() || 'LIMIT'} order: ${orderData.side?.toUpperCase()} ${orderData.volume} lot(s) ${orderData.symbol} @ ${orderData.price}`
          : `Opened ${orderData.side?.toUpperCase()} position: ${orderData.volume} lot(s) ${orderData.symbol} @ ${pos.entryPrice || orderData.price}`,
        metadata: { 
          positionId: pos._id || pos.id, 
          symbol: orderData.symbol, 
          side: orderData.side, 
          volume: orderData.volume, 
          price: pos.entryPrice || orderData.price,
          orderType: orderData.orderType,
          mode 
        },
        ipAddress: req.ip,
        userAgent: orderUserAgent,
        device: orderUserAgent.includes('Mobile') ? 'mobile' : 'desktop',
        os: parseOS(orderUserAgent),
        browser: parseBrowser(orderUserAgent),
        status: 'success'
      });
    }

    // Emit position update via Socket.IO
    io.to(userId).emit('positionUpdate', { mode, positions: result.positions });

    res.json(result);
  } catch (error) {
    console.error('Order execution error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Close position
app.post('/api/positions/close', async (req, res) => {
  try {
    const { mode, userId, positionId, volume, currentPrice, symbol } = req.body;

    let result;
    let closedPosition = null;

    switch (mode) {
      case 'hedging':
        // Get position details before closing for activity log
        const { HedgingPosition } = require('./models/Position');
        const mongoose = require('mongoose');
        // Try by _id first, then by oderId
        if (mongoose.Types.ObjectId.isValid(positionId)) {
          closedPosition = await HedgingPosition.findById(positionId);
        }
        if (!closedPosition) {
          closedPosition = await HedgingPosition.findOne({ oderId: positionId });
        }
        result = await hedgingEngine.closePosition(userId, positionId, volume, currentPrice);
        break;
      case 'netting':
        // NettingEngine.closePosition expects (userId, symbol, quantity, currentPrice)
        // Get symbol from request or lookup from positionId
        let nettingSymbol = symbol;
        if (!nettingSymbol && positionId) {
          const { NettingPosition } = require('./models/Position');
          const pos = await NettingPosition.findOne({ oderId: positionId });
          nettingSymbol = pos?.symbol;
          closedPosition = pos;
        }
        if (!nettingSymbol) {
          return res.status(400).json({ error: 'Symbol required for netting close' });
        }
        result = await nettingEngine.closePosition(userId, nettingSymbol, volume, currentPrice);
        break;
      default:
        return res.status(400).json({ error: 'Invalid mode for close' });
    }

    // Log trade close activity
    if (closedPosition) {
      const user = await User.findOne({ oderId: userId });
      if (user) {
        const pnl = result.profit || result.pnl || 0;
        const closeUserAgent = req.get('User-Agent') || '';
        await UserActivityLog.logActivity({
          userId: user._id.toString(),
          oderId: userId,
          activityType: 'trade_close',
          description: `Closed ${closedPosition.side?.toUpperCase() || 'N/A'} position: ${volume || closedPosition.volume} lot(s) ${closedPosition.symbol} @ ${currentPrice} | P/L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`,
          metadata: { positionId, symbol: closedPosition.symbol, side: closedPosition.side, volume: volume || closedPosition.volume, closePrice: currentPrice, pnl },
          ipAddress: req.ip,
          userAgent: closeUserAgent,
          device: closeUserAgent.includes('Mobile') ? 'mobile' : 'desktop',
          os: parseOS(closeUserAgent),
          browser: parseBrowser(closeUserAgent),
          status: 'success'
        });
      }
    }

    io.to(userId).emit('positionUpdate', { mode, positions: result.positions });
    res.json(result);
  } catch (error) {
    const msg = error.message || '';
    if (msg.includes('must be held at least')) {
      return res.status(400).json({ error: msg });
    }
    res.status(500).json({ error: msg });
  }
});

// Cancel pending order
app.post('/api/orders/cancel', async (req, res) => {
  try {
    const { mode, userId, orderId } = req.body;

    if (!mode || !userId || !orderId) {
      return res.status(400).json({ error: 'Mode, userId, and orderId are required' });
    }

    let result;
    switch (mode) {
      case 'hedging':
        result = await hedgingEngine.cancelPendingOrder(userId, orderId);
        break;
      case 'netting':
        result = await nettingEngine.cancelPendingOrder(userId, orderId);
        break;
      default:
        return res.status(400).json({ error: 'Cancel pending order only supported for hedging and netting modes' });
    }

    io.to(userId).emit('pendingOrderUpdate', { mode, pendingOrders: result.pendingOrders });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Partial close position
app.post('/api/positions/partial-close', async (req, res) => {
  try {
    const { mode, userId, positionId, volume, currentPrice } = req.body;

    if (mode !== 'hedging') {
      return res.status(400).json({ error: 'Partial close only supported for hedging mode' });
    }

    const result = await hedgingEngine.closePosition(userId, positionId, volume, currentPrice);
    io.to(userId).emit('positionUpdate', { mode, positions: result.positions });
    res.json(result);
  } catch (error) {
    const msg = error.message || '';
    if (msg.includes('must be held at least')) {
      return res.status(400).json({ error: msg });
    }
    res.status(500).json({ error: msg });
  }
});

// Modify position (SL/TP)
app.put('/api/positions/modify', async (req, res) => {
  try {
    const { mode, userId, positionId, stopLoss, takeProfit } = req.body;

    let result;

    switch (mode) {
      case 'hedging':
        result = await hedgingEngine.modifyPosition(userId, positionId, { stopLoss, takeProfit });
        break;
      case 'netting':
        result = await nettingEngine.modifyPosition(userId, positionId, { stopLoss, takeProfit });
        break;
      default:
        return res.status(400).json({ error: 'Invalid mode for modify' });
    }

    io.to(userId).emit('positionUpdate', { mode, positions: result.positions });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Modify pending order (price, SL, TP)
app.put('/api/orders/modify', async (req, res) => {
  try {
    const { mode, userId, orderId, price, stopLoss, takeProfit } = req.body;

    if (!mode || !userId || !orderId) {
      return res.status(400).json({ error: 'Mode, userId, and orderId are required' });
    }

    const { HedgingPosition, NettingPosition } = require('./models/Position');
    const mongoose = require('mongoose');
    
    let order;
    let Position;
    
    if (mode === 'hedging') {
      Position = HedgingPosition;
    } else if (mode === 'netting') {
      Position = NettingPosition;
    } else {
      return res.status(400).json({ error: 'Invalid mode for modify pending order' });
    }

    // Find pending order
    if (mongoose.Types.ObjectId.isValid(orderId)) {
      order = await Position.findOne({ _id: orderId, userId, status: 'pending' });
    }
    if (!order) {
      order = await Position.findOne({ oderId: orderId, userId, status: 'pending' });
    }
    
    if (!order) {
      return res.status(404).json({ error: 'Pending order not found' });
    }

    // Update fields
    if (price !== undefined && price !== null) {
      if (mode === 'hedging') {
        order.entryPrice = price;
        order.triggerPrice = price;
      } else {
        order.avgPrice = price;
        order.triggerPrice = price;
      }
    }
    if (stopLoss !== undefined) {
      order.stopLoss = stopLoss;
    }
    if (takeProfit !== undefined) {
      order.takeProfit = takeProfit;
    }

    await order.save();

    // Get updated pending orders
    const pendingOrders = await Position.find({ userId, status: 'pending' });

    io.to(userId).emit('pendingOrderUpdate', { mode, pendingOrders: pendingOrders.map(p => ({ ...p.toObject(), mode })) });
    
    res.json({
      success: true,
      order: order.toObject(),
      pendingOrders: pendingOrders.map(p => ({ ...p.toObject(), mode })),
      message: 'Pending order modified successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all positions across all modes for a user (must be before /:mode/:userId)
app.get('/api/positions/all/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!hedgingEngine || !nettingEngine || !binaryEngine) {
      return res.status(503).json({ error: 'Server initializing', positions: [] });
    }

    const hedgingPositions = await hedgingEngine.getPositions(userId);
    const nettingPositions = await nettingEngine.getPositions(userId);
    const binaryPositions = await binaryEngine.getPositions(userId);

    const allPositions = [
      ...hedgingPositions,
      ...nettingPositions,
      ...binaryPositions
    ];

    res.json({ positions: allPositions });
  } catch (error) {
    console.error('Error fetching positions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get positions by mode
app.get('/api/positions/:mode/:userId', async (req, res) => {
  try {
    const { mode, userId } = req.params;

    if (!hedgingEngine || !nettingEngine || !binaryEngine) {
      return res.status(503).json({ error: 'Server initializing', positions: [] });
    }

    let positions = [];

    switch (mode) {
      case 'hedging':
        positions = await hedgingEngine.getPositions(userId);
        break;
      case 'netting':
        positions = await nettingEngine.getPositions(userId);
        break;
      case 'binary':
        positions = await binaryEngine.getPositions(userId);
        break;
    }

    res.json({ positions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get trade history (closed trades) with pagination
app.get('/api/trades/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Get total count for pagination info (exclude admin-closed trades from user view)
    const totalCount = await Trade.countDocuments({ userId, type: { $in: ['close', 'partial_close', 'binary'] }, closedBy: { $ne: 'admin' } });
    
    const trades = await Trade.find({ userId, type: { $in: ['close', 'partial_close', 'binary'] }, closedBy: { $ne: 'admin' } })
      .sort({ executedAt: -1 })
      .skip(skip)
      .limit(limitNum);
    
    res.json({ 
      trades: trades.map(t => ({ ...t.toObject(), mode: t.mode })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
        hasMore: skip + trades.length < totalCount
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get individual entry legs for a netting position (all open + partial_close trades with same orderId)
app.get('/api/trades/legs/:userId/:orderId', async (req, res) => {
  try {
    const { userId, orderId } = req.params;
    const legs = await Trade.find({
      userId,
      oderId: orderId,
      type: { $in: ['open', 'partial_close'] },
      mode: 'netting'
    }).sort({ executedAt: 1 });
    res.json({ legs: legs.map(t => t.toObject()) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get pending orders (limit/stop orders not yet executed)
app.get('/api/orders/pending/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { HedgingPosition, NettingPosition } = require('./models/Position');
    
    // Fetch pending orders from both hedging and netting
    const hedgingPending = await HedgingPosition.find({ userId, status: 'pending' });
    const nettingPending = await NettingPosition.find({ userId, status: 'pending' });
    
    const allPendingOrders = [
      ...hedgingPending.map(o => ({ ...o.toObject(), mode: 'hedging' })),
      ...nettingPending.map(o => ({ ...o.toObject(), mode: 'netting' }))
    ];
    
    res.json({ orders: allPendingOrders });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get cancelled/rejected orders
app.get('/api/orders/cancelled/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const trades = await Trade.find({ userId, type: 'cancelled' }).sort({ executedAt: -1 }).limit(50);
    res.json({ orders: trades.map(t => ({ ...t.toObject(), mode: t.mode })) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============== USER BANK ACCOUNTS MANAGEMENT ==============

// Get user's saved bank accounts
app.get('/api/user/bank-accounts/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findOne({ 
      $or: [{ oderId: userId }, { _id: userId.match(/^[0-9a-fA-F]{24}$/) ? userId : null }]
    });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({ success: true, bankAccounts: user.bankAccounts || [] });
  } catch (error) {
    console.error('Error fetching bank accounts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add a new bank account for user
app.post('/api/user/bank-accounts/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { bankName, accountNumber, ifsc, accountHolder, upiId } = req.body;
    
    if (!bankName || !accountNumber || !ifsc || !accountHolder) {
      return res.status(400).json({ success: false, error: 'All fields are required' });
    }
    
    const user = await User.findOne({ 
      $or: [{ oderId: userId }, { _id: userId.match(/^[0-9a-fA-F]{24}$/) ? userId : null }]
    });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Initialize bankAccounts array if not exists
    if (!user.bankAccounts) {
      user.bankAccounts = [];
    }
    
    // Check for duplicate account number
    const exists = user.bankAccounts.find(b => b.accountNumber === accountNumber);
    if (exists) {
      return res.status(400).json({ success: false, error: 'This account number is already saved' });
    }
    
    // Add new bank account with optional UPI ID
    user.bankAccounts.push({
      _id: new mongoose.Types.ObjectId(),
      bankName,
      accountNumber,
      ifsc: ifsc.toUpperCase(),
      accountHolder,
      upiId: upiId || null,
      createdAt: new Date()
    });
    
    await user.save();
    res.json({ success: true, bankAccounts: user.bankAccounts, message: 'Bank account added successfully' });
  } catch (error) {
    console.error('Error adding bank account:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a bank account
app.delete('/api/user/bank-accounts/:userId/:bankId', async (req, res) => {
  try {
    const { userId, bankId } = req.params;
    
    const user = await User.findOne({ 
      $or: [{ oderId: userId }, { _id: userId.match(/^[0-9a-fA-F]{24}$/) ? userId : null }]
    });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    if (!user.bankAccounts || user.bankAccounts.length === 0) {
      return res.status(404).json({ success: false, error: 'No bank accounts found' });
    }
    
    user.bankAccounts = user.bankAccounts.filter(b => b._id.toString() !== bankId);
    await user.save();
    
    res.json({ success: true, bankAccounts: user.bankAccounts, message: 'Bank account deleted' });
  } catch (error) {
    console.error('Error deleting bank account:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== USER UPI ACCOUNTS MANAGEMENT ==============

// Get user's saved UPI accounts
app.get('/api/user/upi-accounts/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findOne({ 
      $or: [{ oderId: userId }, { _id: userId.match(/^[0-9a-fA-F]{24}$/) ? userId : null }]
    });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({ success: true, upiAccounts: user.upiAccounts || [] });
  } catch (error) {
    console.error('Error fetching UPI accounts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add a new UPI account for user
app.post('/api/user/upi-accounts/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { upiId, name } = req.body;
    
    if (!upiId || !name) {
      return res.status(400).json({ success: false, error: 'UPI ID and Name are required' });
    }
    
    const user = await User.findOne({ 
      $or: [{ oderId: userId }, { _id: userId.match(/^[0-9a-fA-F]{24}$/) ? userId : null }]
    });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    if (!user.upiAccounts) {
      user.upiAccounts = [];
    }
    
    const exists = user.upiAccounts.find(u => u.upiId === upiId);
    if (exists) {
      return res.status(400).json({ success: false, error: 'This UPI ID is already saved' });
    }
    
    user.upiAccounts.push({
      _id: new mongoose.Types.ObjectId(),
      upiId,
      name,
      createdAt: new Date()
    });
    
    await user.save();
    res.json({ success: true, upiAccounts: user.upiAccounts, message: 'UPI account added successfully' });
  } catch (error) {
    console.error('Error adding UPI account:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete a UPI account
app.delete('/api/user/upi-accounts/:userId/:upiId', async (req, res) => {
  try {
    const { userId, upiId } = req.params;
    
    const user = await User.findOne({ 
      $or: [{ oderId: userId }, { _id: userId.match(/^[0-9a-fA-F]{24}$/) ? userId : null }]
    });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    if (!user.upiAccounts || user.upiAccounts.length === 0) {
      return res.status(404).json({ success: false, error: 'No UPI accounts found' });
    }
    
    user.upiAccounts = user.upiAccounts.filter(u => u._id.toString() !== upiId);
    await user.save();
    
    res.json({ success: true, upiAccounts: user.upiAccounts, message: 'UPI account deleted' });
  } catch (error) {
    console.error('Error deleting UPI account:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== WALLET MANAGEMENT ==============

// Get user wallet by userId (before wallet router to avoid conflict)
app.get('/api/user/wallet/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findOne({ 
      $or: [{ oderId: userId }, { _id: userId.match(/^[0-9a-fA-F]{24}$/) ? userId : null }]
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Calculate live margin from active positions for accurate freeMargin
    const userIdStr = user._id.toString();
    const userOderId = user.oderId;
    const [hedgingPositions, nettingPositions] = await Promise.all([
      HedgingPosition.find({ userId: userIdStr, status: 'open' }).lean(),
      NettingPosition.find({ oderId: userOderId, status: 'open' }).lean()
    ]);

    let liveMargin = 0;
    for (const pos of hedgingPositions) {
      liveMargin += Number(pos.marginUsed || pos.margin || 0);
    }
    for (const pos of nettingPositions) {
      liveMargin += Number(pos.marginUsed || pos.margin || 0);
    }

    const balance = Number(user.wallet.balance) || 0;
    const credit = Number(user.wallet.credit) || 0;
    const equity = balance + credit;
    const liveFreeMargin = Math.max(0, equity - liveMargin);

    const wallet = {
      ...user.wallet.toObject ? user.wallet.toObject() : { ...user.wallet },
      margin: liveMargin,
      equity,
      freeMargin: liveFreeMargin,
      marginLevel: liveMargin > 0 ? (equity / liveMargin) * 100 : 0
    };

    res.json({ 
      success: true, 
      wallet, 
      stats: user.stats,
      walletUSD: user.walletUSD || { balance: 0, totalDeposits: 0, totalWithdrawals: 0 },
      walletINR: user.walletINR || { balance: 0, totalDeposits: 0, totalWithdrawals: 0 },
      allowedCurrencies: user.allowedCurrencies || { USD: true, INR: true }
    });
  } catch (error) {
    console.error('Error fetching user wallet:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get user wallet (legacy endpoint)
// Rate limiter for demo account creation (uses default IP-based key generator)

app.get('/api/wallet/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log('Wallet request for userId:', userId);
    
    // Search by oderId first, then by _id
    let user = await User.findOne({ 
      $or: [{ oderId: userId }, { _id: userId.match(/^[0-9a-fA-F]{24}$/) ? userId : null }]
    });
    
    console.log('User found:', user ? { oderId: user.oderId, wallet: user.wallet } : 'NOT FOUND');

    if (!user) {
      // Check if demo mode is enabled
      if (!DEMO_MODE_ENABLED) {
        return res.status(403).json({ error: 'Demo mode is disabled. Please register for an account.' });
      }

      // Apply rate limiting for new demo account creation
      // This is checked inline since we only want to limit new creations
      const clientIp = req.ip || req.connection.remoteAddress;

      // Create new user with demo balance
      user = new User({
        oderId: userId,
        email: `${userId}@guest.SetupFX.com`,
        phone: `9999${userId}`,
        password: process.env.GUEST_DEFAULT_PASSWORD || 'guestpass123',
        name: 'Guest User',
        isDemo: true, // Mark as demo account
        demoCreatedIp: clientIp, // Track IP for abuse prevention
        wallet: {
          balance: parseInt(process.env.GUEST_DEFAULT_BALANCE) || 10000,
          credit: 0,
          equity: parseInt(process.env.GUEST_DEFAULT_BALANCE) || 10000,
          margin: 0,
          freeMargin: parseInt(process.env.GUEST_DEFAULT_BALANCE) || 10000,
          marginLevel: 0
        }
      });
      await user.save();
      console.log(`Demo account created: ${userId} from IP: ${clientIp}`);
    }

    res.json({ wallet: user.wallet, stats: user.stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user wallet (admin deposit/withdrawal)
app.post('/api/wallet/:userId/update', async (req, res) => {
  try {
    const { userId } = req.params;
    const { amount, type, description } = req.body; // type: 'deposit' or 'withdrawal'

    let user = await User.findOne({ oderId: userId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (type === 'deposit') {
      user.wallet.balance += amount;
    } else if (type === 'withdrawal') {
      if (user.wallet.balance < amount) {
        return res.status(400).json({ error: 'Insufficient balance' });
      }
      user.wallet.balance -= amount;
    }

    user.wallet.equity = user.wallet.balance + user.wallet.credit;
    user.wallet.freeMargin = user.wallet.equity - user.wallet.margin;
    await user.save();

    res.json({ success: true, wallet: user.wallet });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reset user wallet to default balance (admin only)
app.post('/api/wallet/:userId/reset', async (req, res) => {
  try {
    const { userId } = req.params;
    const { balance = 10000 } = req.body; // Default reset balance

    let user = await User.findOne({ oderId: userId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Reset wallet to specified balance
    user.wallet = {
      balance: balance,
      credit: 0,
      equity: balance,
      margin: 0,
      freeMargin: balance,
      marginLevel: 0
    };
    await user.save();

    // Also close all open positions for this user to prevent further issues
    const { NettingPosition, HedgingPosition } = require('./models/Position');
    await NettingPosition.updateMany(
      { userId, status: 'open' },
      { status: 'closed', closeTime: new Date(), profit: 0 }
    );
    await HedgingPosition.updateMany(
      { oderId: userId, status: 'open' },
      { status: 'closed', closeTime: new Date(), profit: 0 }
    );

    res.json({ 
      success: true, 
      wallet: user.wallet,
      message: `Wallet reset to $${balance}. All open positions closed.`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============== TRANSACTION MANAGEMENT ==============

// Get user transactions
app.get('/api/transactions/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { type, status } = req.query;

    const query = { oderId: userId };
    if (type) query.type = type;
    if (status) query.status = status;

    const transactions = await Transaction.find(query).sort({ createdAt: -1 });
    res.json({ transactions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generic create transaction (used by user wallet page)
app.post('/api/transactions', async (req, res) => {
  try {
    const { oderId, userId, userName, type, amount, currency = 'USD', method, proofImage, withdrawalInfo } = req.body;
    
    const userOderId = oderId || userId;
    if (!userOderId || !amount || !type) {
      return res.status(400).json({ error: 'oderId, amount, and type are required' });
    }

    // For withdrawals, calculate LIVE free margin from active positions
    if (type === 'withdrawal') {
      const user = await User.findOne({ oderId: userOderId });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Calculate live margin used from all active positions
      const userIdStr = user._id.toString();
      const [hedgingPositions, nettingPositions] = await Promise.all([
        HedgingPosition.find({ userId: userIdStr, status: 'open' }).lean(),
        NettingPosition.find({ oderId: userOderId, status: 'open' }).lean()
      ]);

      let totalMarginUsed = 0;
      for (const pos of hedgingPositions) {
        totalMarginUsed += Number(pos.marginUsed || pos.margin || 0);
      }
      for (const pos of nettingPositions) {
        totalMarginUsed += Number(pos.marginUsed || pos.margin || 0);
      }

      const balance = Number(user.wallet.balance) || 0;
      const credit = Number(user.wallet.credit) || 0;
      const liveFreeMargin = Math.max(0, balance + credit - totalMarginUsed);

      if (amount > liveFreeMargin) {
        return res.status(400).json({
          error: `Insufficient free margin. Available: $${liveFreeMargin.toFixed(2)}${totalMarginUsed > 0 ? ` (Margin in use: $${totalMarginUsed.toFixed(2)})` : ''}`
        });
      }
    }

    // Map method to valid paymentMethod enum value
    let paymentMethodValue = 'bank_transfer';
    if (method) {
      // Check if method is already a valid enum value
      const validMethods = ['bank_transfer', 'upi', 'crypto', 'card', 'wallet', 'admin_transfer'];
      if (validMethods.includes(method)) {
        paymentMethodValue = method;
      } else if (withdrawalInfo?.method) {
        // For withdrawals, use the method from withdrawalInfo
        const methodMap = { 'bank': 'bank_transfer', 'upi': 'upi', 'crypto': 'crypto' };
        paymentMethodValue = methodMap[withdrawalInfo.method] || 'bank_transfer';
      }
      // If method is an ObjectId (payment method ID), we keep default 'bank_transfer'
      // The actual payment details are stored in paymentDetails or withdrawalInfo
    }

    const transaction = new Transaction({
      oderId: userOderId,
      userName: userName || '',
      type,
      amount,
      currency: currency || 'USD',
      paymentMethod: paymentMethodValue,
      proofImage: proofImage || '',
      withdrawalInfo: withdrawalInfo || null,
      status: 'pending'
    });

    await transaction.save();
    
    // Log activity
    const user = await User.findOne({ oderId: userOderId });
    if (user) {
      await UserActivityLog.logActivity({
        userId: user._id.toString(),
        oderId: userOderId,
        activityType: type === 'deposit' ? 'deposit_request' : 'withdrawal_request',
        description: `${type === 'deposit' ? 'Deposit' : 'Withdrawal'} request of $${amount}`,
        metadata: { transactionId: transaction._id, amount, method },
        ipAddress: req.ip,
        status: 'success'
      });
    }
    
    res.json({ success: true, transaction });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Exchange rate (can be made configurable via admin settings)
const EXCHANGE_RATE = {
  USD_TO_INR: 83.50,
  INR_TO_USD: 1 / 83.50
};

// Get exchange rate API
app.get('/api/exchange-rate', (req, res) => {
  res.json({ 
    success: true, 
    rates: EXCHANGE_RATE,
    USD_TO_INR: EXCHANGE_RATE.USD_TO_INR,
    INR_TO_USD: EXCHANGE_RATE.INR_TO_USD
  });
});

// Create deposit request
app.post('/api/transactions/deposit', async (req, res) => {
  try {
    const { userId, amount, currency = 'USD', paymentMethod, paymentDetails, proofImage, userNote } = req.body;

    if (!userId || !amount || !paymentMethod) {
      return res.status(400).json({ error: 'userId, amount, and paymentMethod are required' });
    }

    // Check if user has permission for this currency
    const user = await User.findOne({ oderId: userId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check currency permission
    const allowedCurrencies = user.allowedCurrencies || { USD: true, INR: true };
    if (currency === 'USD' && !allowedCurrencies.USD) {
      return res.status(403).json({ error: 'USD deposits are not allowed for your account' });
    }
    if (currency === 'INR' && !allowedCurrencies.INR) {
      return res.status(403).json({ error: 'INR deposits are not allowed for your account' });
    }

    const transaction = new Transaction({
      oderId: userId,
      type: 'deposit',
      amount,
      currency: currency || 'USD',
      paymentMethod,
      paymentDetails: paymentDetails || {},
      proofImage: proofImage || '',
      userNote: userNote || '',
      status: 'pending'
    });

    await transaction.save();
    
    // Log deposit request activity
    const currencySymbol = currency === 'INR' ? '₹' : '$';
    await UserActivityLog.logActivity({
      userId: user._id.toString(),
      oderId: userId,
      activityType: 'deposit_request',
      description: `Deposit request of ${currencySymbol}${amount} (${currency}) via ${paymentMethod}`,
      metadata: { transactionId: transaction._id, amount, currency, paymentMethod },
      ipAddress: req.ip,
      status: 'success'
    });
    
    res.json({ success: true, transaction });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create withdrawal request
app.post('/api/transactions/withdraw', async (req, res) => {
  try {
    const { userId, amount, currency = 'USD', paymentMethod, paymentDetails, userNote } = req.body;

    if (!userId || !amount || !paymentMethod) {
      return res.status(400).json({ error: 'userId, amount, and paymentMethod are required' });
    }

    // Check user balance
    const user = await User.findOne({ oderId: userId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check currency permission
    const allowedCurrencies = user.allowedCurrencies || { USD: true, INR: true };
    if (currency === 'USD' && !allowedCurrencies.USD) {
      return res.status(403).json({ error: 'USD withdrawals are not allowed for your account' });
    }
    if (currency === 'INR' && !allowedCurrencies.INR) {
      return res.status(403).json({ error: 'INR withdrawals are not allowed for your account' });
    }

    // Check balance based on currency
    let availableBalance;
    if (currency === 'USD') {
      availableBalance = user.walletUSD?.balance || user.wallet.freeMargin || 0;
    } else {
      availableBalance = user.walletINR?.balance || 0;
    }

    if (availableBalance < amount) {
      return res.status(400).json({ error: `Insufficient ${currency} balance. Available: ${availableBalance}` });
    }

    const transaction = new Transaction({
      oderId: userId,
      type: 'withdrawal',
      amount,
      currency: currency || 'USD',
      paymentMethod,
      paymentDetails: paymentDetails || {},
      userNote: userNote || '',
      status: 'pending'
    });

    await transaction.save();
    
    // Log withdrawal request activity
    const currencySymbol = currency === 'INR' ? '₹' : '$';
    await UserActivityLog.logActivity({
      userId: user._id.toString(),
      oderId: userId,
      activityType: 'withdrawal_request',
      description: `Withdrawal request of ${currencySymbol}${amount} (${currency}) via ${paymentMethod}`,
      metadata: { transactionId: transaction._id, amount, currency, paymentMethod },
      ipAddress: req.ip,
      status: 'success'
    });
    
    res.json({ success: true, transaction });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get all transactions (enhanced with pagination, search, date range)
app.get('/api/admin/transactions', async (req, res) => {
  try {
    const { type, status, limit = 50, page = 1, search, paymentMethod, dateFrom, dateTo, includeAdminRequests } = req.query;

    const query = {};
    if (type) query.type = type;
    if (status) query.status = status;
    if (paymentMethod) query.paymentMethod = paymentMethod;
    if (search) query.oderId = { $regex: search, $options: 'i' };
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo + 'T23:59:59.999Z');
    }
    
    // By default, exclude admin_fund_request type unless specifically requested
    // This ensures user deposit/withdrawal requests are shown
    if (!includeAdminRequests && !type) {
      query.type = { $in: ['deposit', 'withdrawal'] };
    }

    console.log('[Admin Transactions] Query:', JSON.stringify(query));
    const total = await Transaction.countDocuments(query);
    console.log('[Admin Transactions] Total found:', total);
    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean();

    // Enrich transactions with user's parent hierarchy info
    const userIds = [...new Set(transactions.map(t => t.oderId))];
    const users = await User.find({ oderId: { $in: userIds } })
      .select('oderId parentAdminId parentAdminOderId')
      .populate('parentAdminId', 'name oderId role')
      .lean();
    
    const userMap = {};
    users.forEach(u => {
      userMap[u.oderId] = u;
    });

    // Add parent info to each transaction
    transactions.forEach(tx => {
      const user = userMap[tx.oderId];
      if (user && user.parentAdminId) {
        tx.parentType = user.parentAdminId.role === 'broker' ? 'BROKER' : 
                        user.parentAdminId.role === 'subadmin' ? 'SUBADMIN' : 'ADMIN';
        tx.parentName = user.parentAdminId.name || user.parentAdminOderId || 'Unknown';
        tx.parentOderId = user.parentAdminId.oderId || user.parentAdminOderId;
      } else {
        tx.parentType = 'ADMIN';
        tx.parentName = 'Superadmin';
        tx.parentOderId = null;
      }
    });

    // Summary stats (all rows matching query — can be heavy; same as before)
    const allMatching = await Transaction.find(query).select('type status amount').lean();
    const approvedStatus = (s) => s === 'approved' || s === 'completed';
    const pendingStatus = (s) => s === 'pending' || s === 'processing';
    const depApproved = allMatching.filter((t) => t.type === 'deposit' && approvedStatus(t.status));
    const wdlApproved = allMatching.filter((t) => t.type === 'withdrawal' && approvedStatus(t.status));
    const totalDepositsApproved = depApproved.reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const totalWithdrawalsApproved = wdlApproved.reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const pendingRequestsCount = allMatching.filter((t) => pendingStatus(t.status)).length;

    const summary = {
      total: allMatching.length,
      totalDeposits: allMatching.filter(t => t.type === 'deposit').reduce((s, t) => s + (Number(t.amount) || 0), 0),
      totalWithdrawals: allMatching.filter(t => t.type === 'withdrawal').reduce((s, t) => s + (Number(t.amount) || 0), 0),
      totalDepositsApproved,
      totalWithdrawalsApproved,
      netBalance: totalDepositsApproved - totalWithdrawalsApproved,
      pendingRequestsCount,
      depositCount: allMatching.filter(t => t.type === 'deposit').length,
      withdrawalCount: allMatching.filter(t => t.type === 'withdrawal').length,
      pendingCount: allMatching.filter(t => t.status === 'pending').length,
      approvedCount: allMatching.filter(t => approvedStatus(t.status)).length,
      rejectedCount: allMatching.filter(t => t.status === 'rejected').length,
      pendingAmount: allMatching.filter(t => pendingStatus(t.status)).reduce((s, t) => s + (Number(t.amount) || 0), 0)
    };

    res.json({
      success: true,
      transactions,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
      summary
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Reconciliation data
app.get('/api/admin/transactions/reconciliation', async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const query = {};
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo + 'T23:59:59.999Z');
    }

    const allTx = await Transaction.find(query).sort({ createdAt: -1 });

    // Overall stats
    const deposits = allTx.filter(t => t.type === 'deposit');
    const withdrawals = allTx.filter(t => t.type === 'withdrawal');
    const approvedDeposits = deposits.filter(t => t.status === 'approved' || t.status === 'completed');
    const approvedWithdrawals = withdrawals.filter(t => t.status === 'approved' || t.status === 'completed');
    const pendingTx = allTx.filter(t => t.status === 'pending');

    const totalDepositsApproved = approvedDeposits.reduce((s, t) => s + t.amount, 0);
    const totalWithdrawalsApproved = approvedWithdrawals.reduce((s, t) => s + t.amount, 0);
    const totalPending = pendingTx.reduce((s, t) => s + t.amount, 0);

    // Daily breakdown
    const dailyMap = {};
    allTx.forEach(t => {
      const day = new Date(t.createdAt).toISOString().split('T')[0];
      if (!dailyMap[day]) dailyMap[day] = { date: day, deposits: 0, withdrawals: 0, depositCount: 0, withdrawalCount: 0, pending: 0 };
      if (t.type === 'deposit') { dailyMap[day].deposits += t.amount; dailyMap[day].depositCount++; }
      else { dailyMap[day].withdrawals += t.amount; dailyMap[day].withdrawalCount++; }
      if (t.status === 'pending') dailyMap[day].pending += t.amount;
    });
    const dailyBreakdown = Object.values(dailyMap).sort((a, b) => b.date.localeCompare(a.date));

    // By payment method
    const methodMap = {};
    allTx.forEach(t => {
      if (!methodMap[t.paymentMethod]) methodMap[t.paymentMethod] = { method: t.paymentMethod, count: 0, amount: 0 };
      methodMap[t.paymentMethod].count++;
      methodMap[t.paymentMethod].amount += t.amount;
    });
    const byMethod = Object.values(methodMap).sort((a, b) => b.count - a.count);

    // Status distribution
    const statusMap = {};
    allTx.forEach(t => {
      if (!statusMap[t.status]) statusMap[t.status] = { status: t.status, count: 0, amount: 0 };
      statusMap[t.status].count++;
      statusMap[t.status].amount += t.amount;
    });
    const statusDistribution = Object.values(statusMap);

    res.json({
      success: true,
      summary: {
        totalTransactions: allTx.length,
        totalDepositsApproved,
        totalWithdrawalsApproved,
        netFlow: totalDepositsApproved - totalWithdrawalsApproved,
        totalPending,
        pendingCount: pendingTx.length
      },
      dailyBreakdown,
      byMethod,
      statusDistribution
    });
  } catch (error) {
    console.error('Error fetching reconciliation:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin: Process transaction (approve/reject)
app.put('/api/admin/transactions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNote, rejectionReason, processedBy } = req.body;

    const transaction = await Transaction.findById(id);
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Update transaction
    transaction.status = status;
    transaction.adminNote = adminNote || '';
    transaction.rejectionReason = rejectionReason || '';
    transaction.processedBy = processedBy || 'admin';
    transaction.processedAt = new Date();

    // Find user for wallet update and activity logging
    const user = await User.findOne({ oderId: transaction.oderId });

    // If approved, update user wallet with multi-currency support
    if (status === 'approved' || status === 'completed') {
      if (user) {
        const txCurrency = transaction.currency || 'USD';
        const amount = transaction.amount;
        
        // Initialize wallet objects if they don't exist
        if (!user.walletUSD) user.walletUSD = { balance: 0, totalDeposits: 0, totalWithdrawals: 0 };
        if (!user.walletINR) user.walletINR = { balance: 0, totalDeposits: 0, totalWithdrawals: 0 };
        
        if (transaction.type === 'deposit') {
          // Update currency-specific wallet
          if (txCurrency === 'USD') {
            user.walletUSD.balance += amount;
            user.walletUSD.totalDeposits += amount;
            // Also update INR equivalent
            const inrEquivalent = amount * EXCHANGE_RATE.USD_TO_INR;
            user.walletINR.balance += inrEquivalent;
          } else if (txCurrency === 'INR') {
            user.walletINR.balance += amount;
            user.walletINR.totalDeposits += amount;
            // Also update USD equivalent
            const usdEquivalent = amount * EXCHANGE_RATE.INR_TO_USD;
            user.walletUSD.balance += usdEquivalent;
          }
          // Update main trading wallet (always in USD for trading)
          const usdAmount = txCurrency === 'USD' ? amount : amount * EXCHANGE_RATE.INR_TO_USD;
          user.wallet.balance += usdAmount;
        } else if (transaction.type === 'withdrawal') {
          // Check and deduct from currency-specific wallet
          if (txCurrency === 'USD') {
            if (user.walletUSD.balance >= amount) {
              user.walletUSD.balance -= amount;
              user.walletUSD.totalWithdrawals += amount;
              // Also update INR equivalent
              const inrEquivalent = amount * EXCHANGE_RATE.USD_TO_INR;
              user.walletINR.balance = Math.max(0, user.walletINR.balance - inrEquivalent);
            } else {
              return res.status(400).json({ error: 'Insufficient USD balance for withdrawal' });
            }
          } else if (txCurrency === 'INR') {
            if (user.walletINR.balance >= amount) {
              user.walletINR.balance -= amount;
              user.walletINR.totalWithdrawals += amount;
              // Also update USD equivalent
              const usdEquivalent = amount * EXCHANGE_RATE.INR_TO_USD;
              user.walletUSD.balance = Math.max(0, user.walletUSD.balance - usdEquivalent);
            } else {
              return res.status(400).json({ error: 'Insufficient INR balance for withdrawal' });
            }
          }
          // Update main trading wallet
          const usdAmount = txCurrency === 'USD' ? amount : amount * EXCHANGE_RATE.INR_TO_USD;
          if (user.wallet.balance >= usdAmount) {
            user.wallet.balance -= usdAmount;
          } else {
            return res.status(400).json({ error: 'Insufficient balance for withdrawal' });
          }
        }
        user.wallet.equity = user.wallet.balance + user.wallet.credit;
        user.wallet.freeMargin = user.wallet.equity - user.wallet.margin;
        await user.save();
      }
    }

    await transaction.save();

    // Log activity for deposit/withdrawal approval or rejection
    if (user) {
      const isApproved = status === 'approved' || status === 'completed';
      const isRejected = status === 'rejected';
      
      if (isApproved || isRejected) {
        const activityType = transaction.type === 'deposit' 
          ? (isApproved ? 'deposit_approved' : 'deposit_rejected')
          : (isApproved ? 'withdrawal_approved' : 'withdrawal_rejected');
        
        const description = isApproved
          ? `${transaction.type === 'deposit' ? 'Deposit' : 'Withdrawal'} of $${transaction.amount} approved`
          : `${transaction.type === 'deposit' ? 'Deposit' : 'Withdrawal'} of $${transaction.amount} rejected${rejectionReason ? ': ' + rejectionReason : ''}`;
        
        await UserActivityLog.logActivity({
          userId: user._id.toString(),
          oderId: transaction.oderId,
          activityType,
          description,
          metadata: { 
            transactionId: transaction._id, 
            amount: transaction.amount, 
            status,
            adminNote: adminNote || '',
            rejectionReason: rejectionReason || ''
          },
          ipAddress: req.ip,
          status: isApproved ? 'success' : 'failed'
        });
      }
    }

    res.json({ success: true, transaction });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============== PAYMENT METHODS ==============

// Get active payment methods (for users)
app.get('/api/payment-methods', async (req, res) => {
  try {
    const { type } = req.query; // 'deposit' or 'withdrawal'

    const query = { isActive: true };
    if (type === 'deposit') query.allowDeposit = true;
    if (type === 'withdrawal') query.allowWithdraw = true;

    const methods = await PaymentMethod.find(query).sort({ displayOrder: 1 });
    res.json({ methods });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get all payment methods
app.get('/api/admin/payment-methods', async (req, res) => {
  try {
    const methods = await PaymentMethod.find({}).sort({ displayOrder: 1 });
    res.json({ methods });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Create payment method
app.post('/api/admin/payment-methods', async (req, res) => {
  try {
    const method = new PaymentMethod(req.body);
    await method.save();
    res.json({ success: true, method });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Update payment method
app.put('/api/admin/payment-methods/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const method = await PaymentMethod.findByIdAndUpdate(id, req.body, { new: true });
    if (!method) {
      return res.status(404).json({ error: 'Payment method not found' });
    }
    res.json({ success: true, method });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Delete payment method
app.delete('/api/admin/payment-methods/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await PaymentMethod.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============== ADMIN PAYMENT DETAILS (Bank Accounts, UPI, Crypto) ==============

// Get payment details for a user based on their parent admin hierarchy
// Users see their broker's payment details, or subadmin's, or superadmin's (fallback)
app.get('/api/admin-payment-details', async (req, res) => {
  try {
    // Default: get SuperAdmin payment details (adminId = null)
    const details = await AdminPaymentDetail.find({ isActive: true, adminId: null }).sort({ createdAt: -1 });
    const bankAccounts = details.filter(d => d.type === 'bank');
    const upiIds = details.filter(d => d.type === 'upi');
    const cryptoWallets = details.filter(d => d.type === 'crypto');
    res.json({ success: true, bankAccounts, upiIds, cryptoWallets });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get payment details for a specific user based on their parent admin
app.get('/api/admin-payment-details/for-user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Check if userId is a valid ObjectId
    const isObjectId = mongoose.Types.ObjectId.isValid(userId) && String(new mongoose.Types.ObjectId(userId)) === userId;
    
    let user;
    if (isObjectId) {
      user = await User.findById(userId);
    }
    if (!user) {
      user = await User.findOne({ oderId: userId });
    }
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Check if user has a parent admin (broker or subadmin)
    let adminId = user.parentAdminId || null;
    let details = [];
    let useParentDetails = false;
    
    // Try to get payment details from parent admin hierarchy
    if (adminId) {
      const parentAdmin = await Admin.findById(adminId);
      
      // Check if parent admin has permission to show their bank details to users
      // viewUserBankDetails controls whether users see this admin's bank details or super admin's
      // If viewUserBankDetails is explicitly set to false, users should see super admin's bank details instead
      // For backward compatibility: if permission is undefined, check if admin has any payment details set up
      const permissionValue = parentAdmin?.permissions?.viewUserBankDetails;
      const hasPermission = permissionValue === true || (permissionValue === undefined && parentAdmin?.role === 'sub_admin');
      
      console.log(`[Payment Details] User: ${userId}, Parent Admin: ${parentAdmin?.oderId}, Role: ${parentAdmin?.role}, viewUserBankDetails: ${parentAdmin?.permissions?.viewUserBankDetails}, hasPermission: ${hasPermission}`);
      
      if (hasPermission) {
        details = await AdminPaymentDetail.find({ isActive: true, adminId }).sort({ createdAt: -1 });
        console.log(`[Payment Details] Found ${details.length} payment details for admin ${parentAdmin?.oderId}`);
        
        // If no details found for this admin, check parent's parent (broker -> subadmin -> superadmin)
        if (details.length === 0 && parentAdmin && parentAdmin.parentId) {
          // Check parent's parent permission too
          const grandParentAdmin = await Admin.findById(parentAdmin.parentId);
          const grandParentPermissionValue = grandParentAdmin?.permissions?.viewUserBankDetails;
          const grandParentHasPermission = grandParentPermissionValue === true || (grandParentPermissionValue === undefined && grandParentAdmin?.role === 'sub_admin');
          
          console.log(`[Payment Details] Checking grandparent: ${grandParentAdmin?.oderId}, hasPermission: ${grandParentHasPermission}`);
          
          if (grandParentHasPermission) {
            details = await AdminPaymentDetail.find({ isActive: true, adminId: parentAdmin.parentId }).sort({ createdAt: -1 });
            console.log(`[Payment Details] Found ${details.length} payment details for grandparent ${grandParentAdmin?.oderId}`);
          }
        }
        
        if (details.length > 0) {
          useParentDetails = true;
        }
      } else {
        console.log(`[Payment Details] Admin ${parentAdmin?.oderId} does not have viewUserBankDetails permission, falling back to super admin`);
      }
    }
    
    // Fallback to SuperAdmin payment details if:
    // 1. No parent admin
    // 2. Parent admin doesn't have viewUserBankDetails permission
    // 3. No payment details found in hierarchy
    if (!useParentDetails || details.length === 0) {
      details = await AdminPaymentDetail.find({ isActive: true, adminId: null }).sort({ createdAt: -1 });
    }
    
    const bankAccounts = details.filter(d => d.type === 'bank');
    const upiIds = details.filter(d => d.type === 'upi');
    const cryptoWallets = details.filter(d => d.type === 'crypto');
    res.json({ success: true, bankAccounts, upiIds, cryptoWallets });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin/SubAdmin/Broker: Get their own payment details
app.get('/api/admin/payment-details', async (req, res) => {
  try {
    const { adminId } = req.query;
    const query = adminId ? { adminId } : { adminId: null };
    const details = await AdminPaymentDetail.find(query).sort({ createdAt: -1 });
    const bankAccounts = details.filter(d => d.type === 'bank');
    const upiIds = details.filter(d => d.type === 'upi');
    const cryptoWallets = details.filter(d => d.type === 'crypto');
    res.json({ success: true, bankAccounts, upiIds, cryptoWallets });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin/SubAdmin/Broker: Add bank account
app.post('/api/admin/payment-details/bank', async (req, res) => {
  try {
    const { bankName, accountNumber, ifsc, accountHolder, isActive, adminId } = req.body;
    if (!bankName || !accountNumber || !ifsc || !accountHolder) {
      return res.status(400).json({ success: false, error: 'All fields are required' });
    }
    const detail = new AdminPaymentDetail({
      type: 'bank',
      adminId: adminId || null,
      bankName,
      accountNumber,
      ifsc,
      accountHolder,
      isActive: isActive !== false
    });
    await detail.save();
    res.json({ success: true, detail });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin/SubAdmin/Broker: Add UPI
app.post('/api/admin/payment-details/upi', async (req, res) => {
  try {
    const { upiId, name, qrImage, isActive, adminId } = req.body;
    if (!upiId || !name) {
      return res.status(400).json({ success: false, error: 'UPI ID and name are required' });
    }
    const detail = new AdminPaymentDetail({
      type: 'upi',
      adminId: adminId || null,
      upiId,
      name,
      qrImage,
      isActive: isActive !== false
    });
    await detail.save();
    res.json({ success: true, detail });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin/SubAdmin/Broker: Add Crypto Wallet
app.post('/api/admin/payment-details/crypto', async (req, res) => {
  try {
    const { network, address, qrImage, isActive, adminId } = req.body;
    if (!network || !address) {
      return res.status(400).json({ success: false, error: 'Network and address are required' });
    }
    const detail = new AdminPaymentDetail({
      type: 'crypto',
      adminId: adminId || null,
      network,
      address,
      qrImage,
      isActive: isActive !== false
    });
    await detail.save();
    res.json({ success: true, detail });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: Update payment detail
app.put('/api/admin/payment-details/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const detail = await AdminPaymentDetail.findByIdAndUpdate(id, { ...req.body, updatedAt: new Date() }, { new: true });
    if (!detail) {
      return res.status(404).json({ success: false, error: 'Payment detail not found' });
    }
    res.json({ success: true, detail });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: Delete payment detail
app.delete('/api/admin/payment-details/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await AdminPaymentDetail.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== ZERODHA INTEGRATION ==============

// Get Zerodha settings and status
app.get('/api/zerodha/status', async (req, res) => {
  try {
    const status = await zerodhaService.getStatus();
    res.json({ success: true, ...status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get Zerodha settings (admin only)
app.get('/api/zerodha/settings', async (req, res) => {
  try {
    const settings = await ZerodhaSettings.getSettings();
    
    // Generate redirect URL dynamically based on environment
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.get('host') || 'api.SetupFX.com';
    const isProduction = process.env.NODE_ENV === 'production' || !host.includes('localhost');
    const dynamicRedirectUrl = isProduction 
      ? `https://api.SetupFX.com/api/zerodha/callback`
      : `http://${host}/api/zerodha/callback`;
    
    // Check if token is expired
    const isTokenExpired = settings.tokenExpiry ? new Date() >= new Date(settings.tokenExpiry) : true;
    
    // If token is expired, mark as disconnected
    if (isTokenExpired && settings.isConnected) {
      settings.isConnected = false;
      settings.wsStatus = 'disconnected';
      await settings.save();
    }
    
    res.json({
      success: true,
      settings: {
        apiKey: settings.apiKey,
        apiSecret: settings.apiSecret ? '********' : '',
        isConnected: settings.isConnected && !isTokenExpired,
        lastConnected: settings.lastConnected,
        tokenExpiry: settings.tokenExpiry,
        isTokenExpired: isTokenExpired,
        wsStatus: settings.wsStatus,
        enabledSegments: settings.enabledSegments,
        subscribedInstruments: settings.subscribedInstruments,
        redirectUrl: dynamicRedirectUrl
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update Zerodha API credentials
app.post('/api/zerodha/settings', async (req, res) => {
  try {
    const { apiKey, apiSecret, enabledSegments, redirectUrl } = req.body;
    const settings = await ZerodhaSettings.getSettings();
    
    if (apiKey !== undefined) settings.apiKey = apiKey;
    if (apiSecret !== undefined && apiSecret !== '********') settings.apiSecret = apiSecret;
    if (enabledSegments !== undefined) settings.enabledSegments = { ...settings.enabledSegments, ...enabledSegments };
    if (redirectUrl !== undefined) settings.redirectUrl = redirectUrl;
    
    await settings.save();
    res.json({ success: true, message: 'Settings updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get Zerodha login URL
app.get('/api/zerodha/login-url', async (req, res) => {
  try {
    const loginUrl = await zerodhaService.getLoginUrl();
    res.json({ success: true, loginUrl });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Zerodha OAuth callback
app.get('/api/zerodha/callback', async (req, res) => {
  const frontendUrl = PRIMARY_FRONTEND_URL;
  try {
    const { request_token, status } = req.query;
    
    if (status === 'cancelled') {
      return res.redirect(`${frontendUrl}/admin/zerodha?error=cancelled`);
    }
    
    if (!request_token) {
      return res.redirect(`${frontendUrl}/admin/zerodha?error=no_token`);
    }
    
    await zerodhaService.generateSession(request_token);
    
    // Auto-connect WebSocket after successful authentication
    try {
      await zerodhaService.connectWebSocket();
      console.log('Zerodha WebSocket auto-connected after authentication');
    } catch (wsError) {
      console.log('WebSocket auto-connect failed:', wsError.message);
    }
    
    res.redirect(`${frontendUrl}/admin/zerodha?success=true`);
  } catch (error) {
    console.error('Zerodha callback error:', error);
    res.redirect(`${frontendUrl}/admin/zerodha?error=${encodeURIComponent(error.message)}`);
  }
});

// Connect Zerodha WebSocket
app.post('/api/zerodha/connect-ws', async (req, res) => {
  try {
    await zerodhaService.connectWebSocket();
    res.json({ success: true, message: 'WebSocket connected' });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Disconnect Zerodha WebSocket
app.post('/api/zerodha/disconnect-ws', async (req, res) => {
  try {
    zerodhaService.disconnect();
    const settings = await ZerodhaSettings.getSettings();
    settings.wsStatus = 'disconnected';
    await settings.save();
    res.json({ success: true, message: 'WebSocket disconnected' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Search instruments (uses cached all instruments - no subscription needed)
app.get('/api/zerodha/instruments/search', async (req, res) => {
  try {
    const { query, segment } = req.query;
    if (!query) {
      return res.json({ success: true, instruments: [] });
    }
    const raw = segment != null ? String(segment).trim() : '';
    const ZERODHA_API_CODES = new Set([
      'nseEq', 'bseEq', 'nseFut', 'nseOpt', 'mcxFut', 'mcxOpt', 'bseFut', 'bseOpt'
    ]);
    const DISPLAY_OR_CODE_TO_API = {
      'NSE EQ': 'nseEq',
      'BSE EQ': 'bseEq',
      'NSE FUT': 'nseFut',
      'NSE OPT': 'nseOpt',
      'MCX FUT': 'mcxFut',
      'MCX OPT': 'mcxOpt',
      'BSE FUT': 'bseFut',
      'BSE OPT': 'bseOpt',
      NSE_EQ: 'nseEq',
      BSE_EQ: 'bseEq',
      NSE_FUT: 'nseFut',
      NSE_OPT: 'nseOpt',
      MCX_FUT: 'mcxFut',
      MCX_OPT: 'mcxOpt',
      BSE_FUT: 'bseFut',
      BSE_OPT: 'bseOpt'
    };
    const normalizedSegment =
      !raw
        ? null
        : ZERODHA_API_CODES.has(raw)
          ? raw
          : DISPLAY_OR_CODE_TO_API[raw] || null;

    const instruments = await zerodhaService.searchAllInstruments(query, normalizedSegment);
    
    // Filter out expired F&O instruments (expiry date before today in IST)
    const now = new Date();
    const istNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const todayStart = new Date(istNow.getFullYear(), istNow.getMonth(), istNow.getDate()).getTime();
    
    const filteredInstruments = instruments.filter(inst => {
      // If no expiry, keep the instrument (equity, forex, etc.)
      if (!inst.expiry) return true;
      
      const expDate = new Date(inst.expiry);
      if (isNaN(expDate.getTime())) return true;
      
      // Convert expiry to IST and get start of day
      const istExp = new Date(expDate.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      const expStart = new Date(istExp.getFullYear(), istExp.getMonth(), istExp.getDate()).getTime();
      
      // Keep only if expiry is today or in the future
      return expStart >= todayStart;
    });
    
    // Format expiry dates for display
    const formattedInstruments = filteredInstruments.map(inst => {
      let expiryStr = '';
      if (inst.expiry) {
        const expDate = new Date(inst.expiry);
        expiryStr = expDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      }
      return {
        ...inst,
        expiry: expiryStr
      };
    });
    
    if (query && query.length >= 2 && req.query.isAdmin === 'true') {
      const searchUpper = query.toUpperCase();
      const prefixCount = filteredInstruments.filter(inst => {
         const symbol = inst.tradingsymbol || inst.symbol || '';
         return symbol.toUpperCase().startsWith(searchUpper);
      }).length;
      
      if (prefixCount > 0) {
        formattedInstruments.unshift({
          symbol: searchUpper,
          tradingsymbol: searchUpper,
          tradingSymbol: searchUpper,
          name: `${searchUpper} (Base Prefix) - Applies to ~${prefixCount} active scripts`,
          lotSize: 1,
          exchange: normalizedSegment || 'NFO'
        });
      }
    }
    
    res.json({ success: true, instruments: formattedInstruments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Clear all subscribed instruments and resync fresh
app.post('/api/zerodha/instruments/clear', async (req, res) => {
  try {
    const settings = await ZerodhaSettings.getSettings();
    const previousCount = settings.subscribedInstruments?.length || 0;
    settings.subscribedInstruments = [];
    settings.instrumentsLastFetched = null;
    await settings.save();
    
    // Clear cache
    zerodhaService.allInstrumentsCache = {};
    zerodhaService.instrumentsCacheTime = null;
    
    res.json({ success: true, message: `Cleared ${previousCount} subscribed instruments` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Debug: Get raw CSV sample from Zerodha
app.get('/api/zerodha/debug-csv', async (req, res) => {
  try {
    const settings = await ZerodhaSettings.getSettings();
    if (!settings.accessToken) {
      return res.json({ error: 'Not connected to Zerodha' });
    }
    
    const axios = require('axios');
    const response = await axios.get('https://api.kite.trade/instruments/MCX', {
      headers: {
        'X-Kite-Version': '3',
        'Authorization': `token ${settings.apiKey}:${settings.accessToken}`
      }
    });
    
    const lines = response.data.split('\n');
    const headers = lines[0];
    const sampleRow = lines.find(l => l.includes('GOLD') && l.includes('FUT'));
    
    res.json({
      headers: headers,
      sampleGoldRow: sampleRow,
      headersSplit: headers.split(','),
      lotSizeIndex: headers.split(',').indexOf('lot_size')
    });
  } catch (error) {
    res.json({ error: error.message });
  }
});

// Clear instrument cache (lightweight operation)
app.post('/api/zerodha/instruments/sync', async (req, res) => {
  try {
    // Just clear cache and remove expired - don't pre-load all instruments
    zerodhaService.allInstrumentsCache = {};
    zerodhaService.instrumentsCacheTime = null;
    const expired = await zerodhaService.removeExpiredInstruments();
    res.json({ success: true, message: 'Cache cleared. Instruments will be fetched on-demand when searched.', expiredRemoved: expired || 0 });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get cached instruments count (lightweight - doesn't load all)
app.get('/api/zerodha/instruments/all', async (req, res) => {
  try {
    const { exchange } = req.query;
    // Return only cached count, don't fetch all
    const cached = exchange 
      ? (zerodhaService.allInstrumentsCache[exchange] || [])
      : Object.values(zerodhaService.allInstrumentsCache).flat();
    res.json({ success: true, count: cached.length, cached: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get subscribed instruments - MUST be before :exchange route
app.get('/api/zerodha/instruments/subscribed', async (req, res) => {
  try {
    const settings = await ZerodhaSettings.getSettings();
    res.json({ success: true, instruments: settings?.subscribedInstruments || [] });
  } catch (error) {
    console.error('Error fetching subscribed instruments:', error);
    // Return empty array instead of 500 to prevent frontend crash
    res.json({ success: true, instruments: [], error: error.message });
  }
});

// Get instruments by segment (parameterized route - must be AFTER specific routes)
app.get('/api/zerodha/instruments/:exchange', async (req, res) => {
  try {
    const { exchange } = req.params;
    const instruments = await zerodhaService.getInstruments(exchange);
    res.json({ success: true, instruments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get historical data for charting
app.get('/api/zerodha/historical/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { interval = 'minute', from, to } = req.query;
    const fromUnix = from != null && from !== '' ? parseInt(from, 10) : null;
    const toUnix = to != null && to !== '' ? parseInt(to, 10) : null;

    // Get instrument token from symbol
    const token = await zerodhaService.getInstrumentToken(symbol);
    if (!token) {
      return res.status(404).json({ success: false, error: 'Instrument not found', candles: [] });
    }

    const candles = await zerodhaService.getHistoricalData(
      token,
      interval,
      Number.isFinite(fromUnix) ? fromUnix : null,
      Number.isFinite(toUnix) ? toUnix : null
    );
    res.json({ success: true, candles });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, candles: [] });
  }
});

// Add instrument to subscription
app.post('/api/zerodha/instruments/subscribe', async (req, res) => {
  try {
    const { instrument } = req.body;
    if (!instrument || !instrument.token) {
      return res.status(400).json({ success: false, error: 'Invalid instrument' });
    }
    const result = await zerodhaService.addInstrument(instrument);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Re-subscribe by tradingsymbol only (e.g. user opens SBIN after admin cleared subscriptions/cache)
app.post('/api/zerodha/instruments/subscribe-by-symbol', async (req, res) => {
  try {
    const { symbol } = req.body || {};
    if (!symbol || String(symbol).trim() === '') {
      return res.status(400).json({ success: false, error: 'symbol required' });
    }
    const inst = await zerodhaService.findInstrumentBySymbol(String(symbol).trim());
    if (!inst || !inst.token) {
      return res.status(404).json({ success: false, error: 'Instrument not found for symbol' });
    }
    const result = await zerodhaService.addInstrument(inst);
    res.json({ ...result, token: inst.token, symbol: inst.symbol });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Remove instrument from subscription
app.delete('/api/zerodha/instruments/subscribe/:token', async (req, res) => {
  try {
    const token = parseInt(req.params.token);
    const result = await zerodhaService.removeInstrument(token);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get LTP (Last Traded Price) for subscribed instruments - works even when market is closed
app.get('/api/zerodha/ltp', async (req, res) => {
  try {
    const ticks = await zerodhaService.fetchAndBroadcastLTP();
    res.json({ success: true, ticks });
  } catch (error) {
    // Return empty ticks instead of 500 to prevent frontend crash
    console.error('Zerodha LTP error:', error.message);
    res.json({ success: true, ticks: [], error: error.message });
  }
});

// Bulk subscribe to instruments
app.post('/api/zerodha/instruments/subscribe-bulk', async (req, res) => {
  try {
    const { instruments } = req.body;
    if (!instruments || !Array.isArray(instruments) || instruments.length === 0) {
      return res.status(400).json({ success: false, error: 'No instruments provided' });
    }

    const settings = await ZerodhaSettings.getSettings();
    let addedCount = 0;
    const tokensToSubscribe = [];

    for (const instrument of instruments) {
      if (!instrument.token) continue;
      
      // Check if already subscribed
      const exists = settings.subscribedInstruments.find(i => i.token === instrument.token);
      if (!exists) {
        settings.subscribedInstruments.push(instrument);
        tokensToSubscribe.push(instrument.token);
        addedCount++;
      }
    }

    await settings.save();

    // Subscribe via WebSocket if connected
    if (tokensToSubscribe.length > 0) {
      zerodhaService.subscribe(tokensToSubscribe);
    }

    res.json({ success: true, count: addedCount, message: `Subscribed to ${addedCount} instruments` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Logout / Disconnect Zerodha
app.post('/api/zerodha/logout', async (req, res) => {
  try {
    zerodhaService.disconnect();
    const settings = await ZerodhaSettings.getSettings();
    settings.accessToken = null;
    settings.refreshToken = null;
    settings.isConnected = false;
    settings.wsStatus = 'disconnected';
    await settings.save();
    res.json({ success: true, message: 'Logged out from Zerodha' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Initialize default payment methods if none exist
const initializePaymentMethods = async () => {
  try {
    const count = await PaymentMethod.countDocuments();
    if (count === 0) {
      const defaultMethods = [
        {
          type: 'bank_transfer',
          name: 'Bank Transfer (IMPS/NEFT)',
          isActive: true,
          allowDeposit: true,
          allowWithdraw: true,
          minAmount: 500,
          maxAmount: 500000,
          processingTime: '1-24 hours',
          feeType: 'fixed',
          feeAmount: 0,
          instructions: 'Transfer to our bank account and upload payment proof',
          displayOrder: 1
        },
        {
          type: 'upi',
          name: 'UPI Payment',
          isActive: true,
          allowDeposit: true,
          allowWithdraw: true,
          minAmount: 100,
          maxAmount: 100000,
          processingTime: 'Instant - 1 hour',
          feeType: 'fixed',
          feeAmount: 0,
          instructions: 'Pay via UPI and enter UTR number',
          displayOrder: 2
        },
        {
          type: 'crypto',
          name: 'USDT (TRC20)',
          isActive: true,
          allowDeposit: true,
          allowWithdraw: true,
          minAmount: 10,
          maxAmount: 1000000,
          processingTime: '10-30 minutes',
          feeType: 'percentage',
          feeAmount: 1,
          cryptoDetails: {
            cryptoType: 'USDT',
            network: 'TRC20'
          },
          instructions: 'Send USDT to wallet address and enter transaction hash',
          displayOrder: 3
        }
      ];

      await PaymentMethod.insertMany(defaultMethods);
      console.log('✅ Default payment methods initialized');
    }
  } catch (error) {
    console.error('Error initializing payment methods:', error);
  }
};

// Initialize payment methods after first DB connection (called from the initial connectDB above)
initializePaymentMethods();

// ============== BANNER MANAGEMENT ==============

// Get all banners (admin)
app.get('/api/banners', async (req, res) => {
  try {
    const banners = await Banner.find({}).sort({ createdAt: -1 });
    res.json({ banners });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get active banners (for home page)
app.get('/api/banners/active', async (req, res) => {
  try {
    const banners = await Banner.find({ isActive: true }).sort({ createdAt: -1 });
    res.json({ banners });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create banner
app.post('/api/banners', async (req, res) => {
  try {
    const { title, subtitle, imageData, link, isActive } = req.body;
    const banner = new Banner({ title, subtitle, imageData, link, isActive });
    await banner.save();
    res.json({ success: true, banner });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update banner
app.put('/api/banners/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const banner = await Banner.findByIdAndUpdate(id, req.body, { new: true });
    if (!banner) {
      return res.status(404).json({ error: 'Banner not found' });
    }
    res.json({ success: true, banner });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete banner
app.delete('/api/banners/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const banner = await Banner.findByIdAndDelete(id);
    if (!banner) {
      return res.status(404).json({ error: 'Banner not found' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============== ADMIN DASHBOARD & USER MANAGEMENT ==============

// Admin: Get dashboard stats
app.get('/api/admin/dashboard/stats', async (req, res) => {
  try {
    // Only count actual users (role: 'user'), exclude admins
    const totalUsers = await User.countDocuments({ role: { $ne: 'admin' } });
    const activeUsers = await User.countDocuments({ role: { $ne: 'admin' }, isActive: { $ne: false } });
    const blockedUsers = await User.countDocuments({ role: { $ne: 'admin' }, isActive: false });
    const demoUsers = await User.countDocuments({ role: { $ne: 'admin' }, isDemo: true });

    // Count SubAdmins and Brokers from Admin model
    const totalSubAdmins = await Admin.countDocuments({ role: 'sub_admin' });
    const totalBrokers = await Admin.countDocuments({ role: 'broker' });

    const totalTrades = await Trade.countDocuments();
    const openPositions = await HedgingPosition.countDocuments({ status: 'open' });
    const closedTrades = await Trade.countDocuments();

    const transactions = await Transaction.find({ status: 'approved' });
    const totalDeposits = transactions
      .filter(t => t.type === 'deposit')
      .reduce((sum, t) => sum + t.amount, 0);
    const totalWithdrawals = transactions
      .filter(t => t.type === 'withdrawal')
      .reduce((sum, t) => sum + t.amount, 0);

    const pendingDeposits = await Transaction.countDocuments({ type: 'deposit', status: 'pending' });
    const pendingWithdrawals = await Transaction.countDocuments({ type: 'withdrawal', status: 'pending' });

    // Get recent users (last 10) - only actual users, not admins
    const recentUsers = await User.find({ role: { $ne: 'admin' } })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('oderId name email isActive createdAt isDemo wallet');

    // Get recent trades (last 10)
    const recentTrades = await Trade.find({})
      .sort({ executedAt: -1 })
      .limit(10)
      .select('userId symbol side volume entryPrice profit type executedAt');

    res.json({
      success: true,
      stats: {
        totalUsers,
        activeUsers,
        blockedUsers,
        demoUsers,
        totalSubAdmins,
        totalBrokers,
        totalTrades,
        openPositions,
        closedTrades,
        totalDeposits,
        totalWithdrawals,
        pendingDeposits,
        pendingWithdrawals
      },
      recentUsers,
      recentTrades
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get all users with pagination and filters
app.get('/api/admin/users', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      search,
      city,
      state,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = { role: { $nin: ['admin', 'subadmin', 'broker'] } }; // Only show regular users

    // Use isActive (boolean) instead of status (string) - matches User model
    // By default, exclude demo accounts unless specifically filtering for them
    if (status === 'active') {
      query.isActive = true;
      query.isDemo = { $ne: true }; // Exclude demo from active
    } else if (status === 'blocked') {
      query.isActive = false;
      query.isDemo = { $ne: true }; // Exclude demo from blocked
    } else if (status === 'demo') {
      query.isDemo = true;
    } else {
      // Default: show all non-demo users
      query.isDemo = { $ne: true };
    }

    // City and State filters
    if (city) {
      query['profile.city'] = { $regex: city, $options: 'i' };
    }
    if (state) {
      query['profile.state'] = { $regex: state, $options: 'i' };
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { oderId: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .select('-password');

    res.json({
      success: true,
      users,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Search users by name, email, or order ID
app.get('/api/admin/users/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) return res.json({ success: true, users: [] });
    const regex = new RegExp(q.trim(), 'i');
    const users = await User.find({
      $or: [
        { name: regex },
        { email: regex },
        { oderId: regex },
        { phone: regex }
      ]
    })
      .select('_id name email oderId phone wallet isActive')
      .limit(20)
      .lean();
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: Get single user details
app.get('/api/admin/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const mongoose = require('mongoose');
    const isValidObjectId = mongoose.Types.ObjectId.isValid(userId);
    
    let query;
    if (isValidObjectId) {
      query = { $or: [{ _id: userId }, { oderId: userId }] };
    } else {
      query = { oderId: userId };
    }
    
    const user = await User.findOne(query).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get user's trades
    const trades = await Trade.find({ userId: user.oderId || user._id })
      .sort({ executedAt: -1 })
      .limit(50);

    // Get user's transactions
    const transactions = await Transaction.find({ userId: user.oderId || user._id })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      success: true,
      user,
      trades,
      transactions
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Update user
app.put('/api/admin/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, email, phone, isActive, wallet, isDemo, allowedTradeModes } = req.body;

    const user = await User.findOne({
      $or: [{ _id: userId }, { oderId: userId }]
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (name) user.name = name;
    if (email) user.email = email;
    if (phone) user.phone = phone;
    if (typeof isActive === 'boolean') user.isActive = isActive;
    if (typeof isDemo === 'boolean') user.isDemo = isDemo;
    if (wallet) {
      user.wallet = { ...user.wallet.toObject(), ...wallet };
    }
    if (allowedTradeModes) {
      user.allowedTradeModes = { ...user.allowedTradeModes, ...allowedTradeModes };
    }

    await user.save();

    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Update user trade mode settings
app.put('/api/admin/users/:userId/trade-modes', async (req, res) => {
  try {
    const { userId } = req.params;
    const { hedging, netting, binary, allowedCurrencyDisplay } = req.body;

    const user = await User.findOne({
      $or: [{ _id: userId }, { oderId: userId }]
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Initialize if not exists
    if (!user.allowedTradeModes) {
      user.allowedTradeModes = { hedging: true, netting: true, binary: true };
    }

    if (typeof hedging === 'boolean') user.allowedTradeModes.hedging = hedging;
    if (typeof netting === 'boolean') user.allowedTradeModes.netting = netting;
    if (typeof binary === 'boolean') user.allowedTradeModes.binary = binary;
    
    // Update currency display setting
    if (allowedCurrencyDisplay && ['USD', 'INR', 'BOTH'].includes(allowedCurrencyDisplay)) {
      user.allowedCurrencyDisplay = allowedCurrencyDisplay;
    }

    await user.save();

    res.json({ 
      success: true, 
      user: {
        _id: user._id,
        oderId: user.oderId,
        name: user.name,
        email: user.email,
        allowedTradeModes: user.allowedTradeModes
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: Update user currency permissions
app.put('/api/admin/users/:userId/currency-permissions', async (req, res) => {
  try {
    const { userId } = req.params;
    const { allowUSD, allowINR } = req.body;

    const user = await User.findOne({
      $or: [{ _id: userId }, { oderId: userId }]
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Initialize if not exists
    if (!user.allowedCurrencies) {
      user.allowedCurrencies = { USD: true, INR: true };
    }

    if (typeof allowUSD === 'boolean') user.allowedCurrencies.USD = allowUSD;
    if (typeof allowINR === 'boolean') user.allowedCurrencies.INR = allowINR;

    await user.save();

    res.json({ 
      success: true, 
      user: {
        _id: user._id,
        oderId: user.oderId,
        name: user.name,
        allowedCurrencies: user.allowedCurrencies,
        walletUSD: user.walletUSD,
        walletINR: user.walletINR
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: Block/Unblock user
app.patch('/api/admin/users/:userId/status', async (req, res) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;

    const user = await User.findOne({
      $or: [{ _id: userId }, { oderId: userId }]
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Use isActive boolean instead of status string
    user.isActive = status !== 'blocked';
    await user.save();

    res.json({ success: true, user, message: `User ${status === 'blocked' ? 'blocked' : 'activated'} successfully` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Delete user
app.delete('/api/admin/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findOne({
      $or: [{ _id: userId }, { oderId: userId }]
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete user's trades
    await Trade.deleteMany({ userId: user.oderId || user._id });

    // Delete user's transactions
    await Transaction.deleteMany({ userId: user.oderId || user._id });

    // Delete user
    await User.deleteOne({ _id: user._id });

    res.json({ success: true, message: 'User and all related data deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Change user password
app.put('/api/admin/users/:userId/password', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findOne({
      $or: [{ _id: userId }, { oderId: userId }]
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    // Accept both 'password' and 'newPassword' from request body
    const password = req.body.newPassword || req.body.password;
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    user.password = password; // Will be hashed by pre-save hook
    await user.save();
    
    // Log password change activity
    await UserActivityLog.logActivity({
      userId: user._id.toString(),
      oderId: user.oderId,
      activityType: 'password_change',
      description: 'Password changed by admin',
      metadata: { changedBy: 'admin' },
      ipAddress: req.ip,
      status: 'success'
    });
    
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Login as user (impersonate)
app.post('/api/admin/users/:userId/login-as', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findOne({
      $or: [{ _id: userId }, { oderId: userId }]
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Generate JWT token for the user
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'SetupFX-secret-key-2024';
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        oderId: user.oderId,
        name: user.name,
        email: user.email,
        phone: user.phone,
        wallet: user.wallet,
        isDemo: user.isDemo,
        role: user.role,
        allowedTradeModes: user.allowedTradeModes || { hedging: true, netting: true, binary: true }
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Download user report (CSV)
app.post('/api/admin/users/:userId/download-report', async (req, res) => {
  try {
    const { userId } = req.params;
    const { allTime, fromDate, toDate, reportTypes } = req.body;
    
    if (!reportTypes || reportTypes.length === 0) {
      return res.status(400).json({ error: 'Report types are required' });
    }
    
    if (!allTime && (!fromDate || !toDate)) {
      return res.status(400).json({ error: 'Date range is required when not using All Time' });
    }
    
    const user = await User.findOne({
      $or: [{ _id: userId }, { oderId: userId }]
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // For allTime, use user creation date as start and now as end
    let startDate, endDate;
    if (allTime) {
      startDate = new Date(user.createdAt || '2020-01-01');
      endDate = new Date();
    } else {
      startDate = new Date(fromDate);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(toDate);
    }
    endDate.setHours(23, 59, 59, 999);
    
    const dateRangeStr = allTime ? 'All Time' : `${fromDate} to ${toDate}`;
    
    let csvContent = '';
    const userInfo = `User Report: ${user.name || 'N/A'} (${user.oderId})\nEmail: ${user.email}\nPhone: ${user.phone || 'N/A'}\nDate Range: ${dateRangeStr}\nGenerated: ${new Date().toISOString()}\n\n`;
    csvContent += userInfo;
    
    // Login Activity
    if (reportTypes.includes('loginActivity')) {
      csvContent += '=== LOGIN/LOGOUT ACTIVITY ===\n';
      csvContent += 'Date,Time,Activity,IP Address,Device\n';
      
      const loginLogs = await UserActivityLog.find({
        userId: user._id.toString(),
        activityType: { $in: ['login', 'logout'] },
        timestamp: { $gte: startDate, $lte: endDate }
      }).sort({ timestamp: -1 });
      
      if (loginLogs.length > 0) {
        loginLogs.forEach(log => {
          const date = new Date(log.timestamp);
          const deviceStr = [log.browser, log.os, log.device].filter(Boolean).join(' / ') || log.userAgent || 'N/A';
          csvContent += `${date.toLocaleDateString()},${date.toLocaleTimeString()},${log.activityType},${log.ipAddress || 'N/A'},${String(deviceStr).replace(/,/g, ';')}\n`;
        });
      } else {
        csvContent += 'No login activity found in this date range\n';
      }
      csvContent += '\n';
    }
    
    // Trade History (Trade.userId stores the user's oderId, same as HedgingEngine)
    if (reportTypes.includes('trades')) {
      csvContent += '=== TRADE HISTORY ===\n';
      csvContent += 'Date,Time,Symbol,Side,Quantity,Price,P&L,Type\n';
      
      const trades = await Trade.find({
        userId: user.oderId,
        createdAt: { $gte: startDate, $lte: endDate }
      }).sort({ createdAt: -1 });
      
      if (trades.length > 0) {
        trades.forEach(trade => {
          const date = new Date(trade.createdAt || trade.executedAt);
          const qty = trade.quantity ?? trade.volume ?? trade.amount ?? '';
          const price = trade.closePrice != null ? trade.closePrice : trade.entryPrice;
          csvContent += `${date.toLocaleDateString()},${date.toLocaleTimeString()},${trade.symbol},${trade.side},${qty},${price},${trade.profit ?? 0},${trade.type || 'N/A'}\n`;
        });
      } else {
        csvContent += 'No trades found in this date range\n';
      }
      csvContent += '\n';
    }
    
    // Deposit / withdrawal requests (retail users use Transaction, not FundRequest)
    if (reportTypes.includes('funds')) {
      csvContent += '=== DEPOSIT/WITHDRAWAL HISTORY ===\n';
      csvContent += 'Date,Time,Type,Amount,Currency,Status,Method\n';
      
      const fundTxs = await Transaction.find({
        oderId: user.oderId,
        type: { $in: ['deposit', 'withdrawal'] },
        createdAt: { $gte: startDate, $lte: endDate }
      }).sort({ createdAt: -1 });
      
      if (fundTxs.length > 0) {
        fundTxs.forEach(t => {
          const date = new Date(t.createdAt);
          csvContent += `${date.toLocaleDateString()},${date.toLocaleTimeString()},${t.type},${t.amount},${t.currency || 'USD'},${t.status},${t.paymentMethod || 'N/A'}\n`;
        });
      } else {
        csvContent += 'No fund transactions found in this date range\n';
      }
      csvContent += '\n';
    }
    
    // Position History (Position.userId is user's oderId; times are openTime / closeTime)
    if (reportTypes.includes('positions')) {
      csvContent += '=== POSITION HISTORY ===\n';
      csvContent += 'Date,Symbol,Side,Volume,Entry Price,Exit Price,P&L,Status\n';
      
      const positionDateOr = [
        { openTime: { $gte: startDate, $lte: endDate } },
        { closeTime: { $gte: startDate, $lte: endDate } }
      ];
      
      const hedgingPositions = await HedgingPosition.find({
        userId: user.oderId,
        $or: positionDateOr
      }).sort({ openTime: -1 });
      
      const nettingPositions = await NettingPosition.find({
        userId: user.oderId,
        $or: positionDateOr
      }).sort({ openTime: -1 });
      
      const allPositions = [...hedgingPositions, ...nettingPositions];
      
      if (allPositions.length > 0) {
        allPositions.forEach(pos => {
          const date = new Date(pos.openTime || pos.createdAt);
          const entry = pos.entryPrice ?? pos.avgPrice ?? '';
          const exitPx = pos.closePrice != null ? pos.closePrice : 'Open';
          const pnl = pos.profit ?? 0;
          csvContent += `${date.toLocaleDateString()},${pos.symbol},${pos.side},${pos.volume},${entry},${exitPx},${pnl},${pos.status}\n`;
        });
      } else {
        csvContent += 'No positions found in this date range\n';
      }
      csvContent += '\n';
    }
    
    // Transaction History (Wallet Transactions)
    if (reportTypes.includes('ledger')) {
      csvContent += '=== TRANSACTION HISTORY ===\n';
      csvContent += 'Date,Time,Type,Description,Amount,Balance After\n';
      
      const WalletTransaction = require('./models/WalletTransaction');
      const ledgerEntries = await WalletTransaction.find({
        oderId: user.oderId,
        createdAt: { $gte: startDate, $lte: endDate }
      }).sort({ createdAt: -1 });
      
      if (ledgerEntries.length > 0) {
        ledgerEntries.forEach(entry => {
          const date = new Date(entry.createdAt);
          csvContent += `${date.toLocaleDateString()},${date.toLocaleTimeString()},${entry.type},${(entry.description || '').replace(/,/g, ';')},${entry.amount},${entry.balanceAfter || 'N/A'}\n`;
        });
      } else {
        csvContent += 'No ledger entries found in this date range\n';
      }
      csvContent += '\n';
    }
    
    const safeBase = String(user.name || user.oderId || 'user').replace(/[^\w\-]+/g, '_');
    const fileRange = allTime ? 'all_time' : `${fromDate}_to_${toDate}`;
    const filename = `${safeBase}_report_${fileRange}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
    
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin: Login as Sub-Admin (impersonate)
app.post('/api/admin/subadmins/:adminId/login-as', async (req, res) => {
  try {
    const { adminId } = req.params;
    const admin = await Admin.findOne({
      $or: [{ _id: adminId }, { oderId: adminId }],
      role: 'sub_admin'
    });
    
    if (!admin) {
      return res.status(404).json({ error: 'Sub-Admin not found' });
    }
    
    // Generate JWT token for the sub-admin
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'SetupFX-secret-key-2024';
    const token = jwt.sign({ id: admin._id, role: admin.role }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({
      success: true,
      token,
      admin: {
        _id: admin._id,
        id: admin._id,
        oderId: admin.oderId,
        name: admin.name,
        email: admin.email,
        phone: admin.phone,
        role: admin.role,
        wallet: admin.wallet,
        permissions: admin.permissions
      },
      redirectUrl: '/subadmin'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Login as Broker (impersonate)
app.post('/api/admin/brokers/:brokerId/login-as', async (req, res) => {
  try {
    const { brokerId } = req.params;
    const broker = await Admin.findOne({
      $or: [{ _id: brokerId }, { oderId: brokerId }],
      role: 'broker'
    });
    
    if (!broker) {
      return res.status(404).json({ error: 'Broker not found' });
    }
    
    // Generate JWT token for the broker
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'SetupFX-secret-key-2024';
    const token = jwt.sign({ id: broker._id, role: broker.role }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({
      success: true,
      token,
      admin: {
        _id: broker._id,
        id: broker._id,
        oderId: broker.oderId,
        name: broker.name,
        email: broker.email,
        phone: broker.phone,
        role: broker.role,
        wallet: broker.wallet,
        permissions: broker.permissions
      },
      redirectUrl: '/broker'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Adjust user wallet balance
app.post('/api/admin/users/:userId/wallet', async (req, res) => {
  try {
    const { userId } = req.params;
    const { type, amount, reason, currency: currencyRaw = 'USD' } = req.body;

    const user = await User.findOne({
      $or: [{ _id: userId }, { oderId: userId }]
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const typeNorm = String(type || '').toLowerCase();
    if (!['add', 'subtract', 'set'].includes(typeNorm)) {
      return res.status(400).json({ error: 'type must be add, subtract, or set' });
    }

    const currency = String(currencyRaw || 'USD').toUpperCase();
    if (currency !== 'USD' && currency !== 'INR') {
      return res.status(400).json({ error: 'currency must be USD or INR' });
    }

    const adjustAmount = parseFloat(amount);
    if (isNaN(adjustAmount) || adjustAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // Initialize multi-currency wallets if not exists
    if (!user.walletUSD) user.walletUSD = { balance: 0, totalDeposits: 0, totalWithdrawals: 0 };
    if (!user.walletINR) user.walletINR = { balance: 0, totalDeposits: 0, totalWithdrawals: 0 };

    // Use live USD/INR rate for conversion
    const { getCachedUsdInrRate } = require('./services/currencyRateService');
    const liveUsdInrRate = getCachedUsdInrRate();
    
    // Calculate USD equivalent for main trading wallet (always USD)
    const usdAmount = currency === 'INR' ? adjustAmount / liveUsdInrRate : adjustAmount;
    const inrAmount = currency === 'USD' ? adjustAmount * liveUsdInrRate : adjustAmount;

    if (typeNorm === 'add') {
      // Update main trading wallet (always in USD)
      user.wallet.balance += usdAmount;
      user.wallet.equity += usdAmount;
      user.wallet.freeMargin += usdAmount;
      
      // Update currency-specific wallets
      if (currency === 'USD') {
        user.walletUSD.balance += adjustAmount;
        user.walletUSD.totalDeposits += adjustAmount;
        user.walletINR.balance += inrAmount;
      } else {
        user.walletINR.balance += adjustAmount;
        user.walletINR.totalDeposits += adjustAmount;
        user.walletUSD.balance += usdAmount;
      }
    } else if (typeNorm === 'subtract') {
      // Trading wallet is USD-equivalent; block if not enough overall balance
      const avail = Number(user.wallet?.balance || 0);
      if (avail < usdAmount) {
        // Show error in INR (all transactions work in INR, USD is converted)
        const availInINR = avail * liveUsdInrRate;
        const needInINR = currency === 'INR' ? adjustAmount : adjustAmount * liveUsdInrRate;
        return res.status(400).json({
          error: `Insufficient balance. Available: ₹${availInINR.toFixed(2)}, Required: ₹${needInINR.toFixed(2)}`
        });
      }

      // Update main trading wallet
      user.wallet.balance -= usdAmount;
      user.wallet.equity -= usdAmount;
      user.wallet.freeMargin -= usdAmount;

      // Update currency-specific wallets (mirror add logic)
      if (currency === 'USD') {
        user.walletUSD.balance = Math.max(0, user.walletUSD.balance - adjustAmount);
        user.walletUSD.totalWithdrawals += adjustAmount;
        user.walletINR.balance = Math.max(0, user.walletINR.balance - inrAmount);
      } else {
        user.walletINR.balance = Math.max(0, user.walletINR.balance - adjustAmount);
        user.walletINR.totalWithdrawals += adjustAmount;
        user.walletUSD.balance = Math.max(0, user.walletUSD.balance - usdAmount);
      }
    } else if (typeNorm === 'set') {
      user.wallet.balance = usdAmount;
      user.wallet.equity = usdAmount;
      user.wallet.freeMargin = usdAmount;
    }

    await user.save();

    // Create admin transaction record
    const currencySymbol = currency === 'INR' ? '₹' : '$';
    const transaction = new Transaction({
      oderId: user.oderId || user._id,
      type: typeNorm === 'subtract' ? 'withdrawal' : 'deposit',
      amount: adjustAmount,
      currency: currency,
      paymentMethod: 'admin_transfer',
      status: 'approved',
      adminNote: reason || 'Admin wallet adjustment',
      processedBy: 'admin',
      processedAt: new Date()
    });
    await transaction.save();

    // Log wallet adjustment activity
    await UserActivityLog.logActivity({
      userId: user._id.toString(),
      oderId: user.oderId,
      activityType: typeNorm === 'add' ? 'wallet_credit' : 'wallet_debit',
      description: `Admin ${typeNorm === 'add' ? 'credited' : 'debited'} ${currencySymbol}${adjustAmount} (${currency}) ${reason ? `(${reason})` : ''}`,
      metadata: { amount: adjustAmount, currency, type: typeNorm, reason, transactionId: transaction._id },
      status: 'success'
    });

    const verb =
      typeNorm === 'add' ? 'credited' : typeNorm === 'subtract' ? 'debited' : 'set to';
    const msg =
      typeNorm === 'set'
        ? `Trading wallet set to $${usdAmount.toFixed(2)} USD`
        : `${verb} ${currencySymbol}${adjustAmount} ${currency} (~$${usdAmount.toFixed(2)} USD in trading wallet)`;

    res.json({
      success: true,
      user,
      wallet: user.wallet,
      message: msg
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============== ADMIN TRADE MANAGEMENT ==============

// Admin: Place trade on behalf of a user
app.post('/api/admin/trades/place', async (req, res) => {
  try {
    const { userId, symbol, side, type, volume, price, tradeMode, instrument } = req.body;
    
    if (!userId || !symbol || !side || !volume) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // Find the user
    const user = await User.findOne({
      $or: [{ _id: userId }, { oderId: userId }]
    });
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const { HedgingPosition, NettingPosition } = require('./models/Position');
    const entryPrice = price || 0;
    const lotSize = instrument?.lotSize || 1;
    // Volume is already in lots from admin, don't multiply by lotSize
    const actualVolume = parseFloat(volume);
    
    // Calculate required margin
    const leverage = instrument?.leverage || 100;
    const tradeValue = actualVolume * lotSize * entryPrice;
    const requiredMargin = tradeValue / leverage;
    
    // Check if user has sufficient wallet balance
    const userBalance = user.wallet?.balance || 0;
    if (userBalance < requiredMargin) {
      return res.status(400).json({ 
        success: false, 
        error: `Insufficient funds. Required margin: $${requiredMargin.toFixed(2)}, Available: $${userBalance.toFixed(2)}` 
      });
    }

    if (tradeMode === 'netting') {
      // Netting mode - check for existing position
      let position = await NettingPosition.findOne({
        userId: user.oderId || user._id.toString(),
        symbol,
        status: 'open'
      });

      if (position) {
        // Update existing position
        const oldVolume = position.volume;
        const oldSide = position.side;
        
        if (oldSide === side) {
          // Same direction - add to position
          const totalCost = (position.avgPrice * oldVolume) + (entryPrice * actualVolume);
          position.volume = oldVolume + actualVolume;
          position.quantity = position.volume;
          position.avgPrice = totalCost / position.volume;
          position.entryPrice = position.avgPrice;
          // Update marginUsed
          const leverage = position.leverage || instrument?.leverage || 100;
          position.marginUsed = (position.volume * position.avgPrice) / leverage;
        } else {
          // Opposite direction - reduce or flip
          if (actualVolume >= oldVolume) {
            // Close and possibly flip
            const pnl = oldSide === 'buy' 
              ? (entryPrice - position.avgPrice) * oldVolume
              : (position.avgPrice - entryPrice) * oldVolume;
            
            if (actualVolume > oldVolume) {
              // Flip position
              position.side = side;
              position.volume = actualVolume - oldVolume;
              position.quantity = position.volume;
              position.avgPrice = entryPrice;
              position.entryPrice = entryPrice;
              // Update marginUsed for flipped position
              const leverage = position.leverage || instrument?.leverage || 100;
              position.marginUsed = (position.volume * position.avgPrice) / leverage;
            } else {
              // Close position
              position.status = 'closed';
              position.closePrice = entryPrice;
              position.closeTime = new Date();
              position.pnl = pnl;
            }
            
            // Update user wallet
            user.wallet.balance += pnl;
            user.wallet.equity = user.wallet.balance;
            await user.save();
          } else {
            // Reduce position
            position.volume = oldVolume - actualVolume;
            position.quantity = position.volume;
            // Update marginUsed for reduced position
            const leverage = position.leverage || instrument?.leverage || 100;
            position.marginUsed = (position.volume * position.avgPrice) / leverage;
          }
        }
        await position.save();
        return res.json({ success: true, position, message: 'Position updated' });
      } else {
        // Create new netting position
        const positionOderId = `NT${Date.now()}`;
        
        // Calculate commission from segment settings for Indian instruments
        let commissionAmount = 0;
        const category = instrument?.category || '';
        let segmentName = null;
        if (category.startsWith('nse_')) segmentName = category.includes('fut') ? 'NSE_FUT' : (category.includes('opt') ? 'NSE_OPT' : 'NSE_EQ');
        else if (category.startsWith('bse_')) segmentName = category.includes('fut') ? 'BSE_FUT' : 'BSE_OPT';
        else if (category.startsWith('mcx_')) segmentName = category.includes('fut') ? 'MCX_FUT' : 'MCX_OPT';
        
        if (segmentName) {
          const segment = await Segment.findOne({ name: segmentName });
          if (segment && segment.commission > 0) {
            const lots = parseFloat(volume) || 1;
            if (segment.commissionType === 'per_lot') {
              commissionAmount = segment.commission * lots;
            } else if (segment.commissionType === 'per_crore') {
              const tradeValue = actualVolume * entryPrice;
              commissionAmount = (segment.commission * tradeValue) / 10000000;
            } else if (segment.commissionType === 'percentage') {
              const tradeValue = actualVolume * entryPrice;
              commissionAmount = (segment.commission / 100) * tradeValue;
            } else {
              commissionAmount = segment.commission;
            }
          }
        }
        
        // Deduct commission from user if applicable
        if (commissionAmount > 0) {
          user.wallet.balance -= commissionAmount;
          await user.save();
        }
        
        // Calculate margin used (value / leverage) - use lotSize for proper calculation
        const posLeverage = instrument?.leverage || leverage;
        const posTradeValue = actualVolume * lotSize * entryPrice;
        const marginUsed = posTradeValue / posLeverage;
        
        position = new NettingPosition({
          oderId: positionOderId,
          userId: user.oderId || user._id.toString(),
          symbol,
          side,
          volume: actualVolume,
          quantity: actualVolume,
          lotSize: lotSize,
          entryPrice,
          avgPrice: entryPrice,
          currentPrice: entryPrice,
          openTime: new Date(),
          status: 'open',
          pnl: 0,
          marginUsed: marginUsed,
          leverage: leverage,
          commission: commissionAmount,
          exchange: instrument?.exchange || '',
          segment: instrument?.segment || '',
          instrument
        });
        await position.save();
        
        return res.json({ success: true, position, commission: commissionAmount, message: 'Position opened' });
      }
    } else {
      // Hedging mode - always create new position
      const position = new HedgingPosition({
        oderId: `HG${Date.now()}`,
        oderId: `HG${Date.now()}`,
        userId: user.oderId || user._id.toString(),
        symbol,
        side,
        type: type || 'market',
        volume: actualVolume,
        entryPrice,
        currentPrice: entryPrice,
        openTime: new Date(),
        status: type === 'limit' || type === 'stop' ? 'pending' : 'open',
        pnl: 0,
        instrument
      });
      await position.save();
      return res.json({ success: true, position, message: 'Position opened' });
    }
  } catch (error) {
    console.error('Admin place trade error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: Get all active trades/positions across all users
app.get('/api/admin/trades/active', async (req, res) => {
  try {
    const { search, symbol, mode } = req.query;
    const { HedgingPosition, NettingPosition, BinaryTrade } = require('./models/Position');

    // Get list of demo user IDs to exclude
    const demoUsers = await User.find({ isDemo: true }).select('oderId');
    const demoUserIds = demoUsers.map(u => u.oderId);

    let allPositions = [];

    // Fetch hedging positions (exclude demo users)
    if (!mode || mode === 'hedging' || mode === 'all') {
      const hedgingQuery = { status: 'open', userId: { $nin: demoUserIds } };
      if (symbol) hedgingQuery.symbol = { $regex: symbol, $options: 'i' };
      if (search) hedgingQuery.userId = { $regex: search, $options: 'i', $nin: demoUserIds };
      const hedging = await HedgingPosition.find(hedgingQuery).sort({ openTime: -1 }).limit(200);
      allPositions.push(...hedging.map(p => ({ ...p.toObject(), mode: 'hedging', positionType: 'HedgingPosition' })));
    }

    // Fetch netting positions (exclude demo users)
    if (!mode || mode === 'netting' || mode === 'all') {
      const nettingQuery = { status: 'open', userId: { $nin: demoUserIds } };
      if (symbol) nettingQuery.symbol = { $regex: symbol, $options: 'i' };
      if (search) nettingQuery.userId = { $regex: search, $options: 'i', $nin: demoUserIds };
      const netting = await NettingPosition.find(nettingQuery).sort({ openTime: -1 }).limit(200);
      allPositions.push(...netting.map(p => ({ ...p.toObject(), mode: 'netting', entryPrice: p.avgPrice, positionType: 'NettingPosition' })));
    }

    // Fetch binary trades (exclude demo users)
    if (!mode || mode === 'binary' || mode === 'all') {
      const binaryQuery = { status: 'active', userId: { $nin: demoUserIds } };
      if (symbol) binaryQuery.symbol = { $regex: symbol, $options: 'i' };
      if (search) binaryQuery.userId = { $regex: search, $options: 'i', $nin: demoUserIds };
      const binary = await BinaryTrade.find(binaryQuery).sort({ createdAt: -1 }).limit(200);
      allPositions.push(...binary.map(p => ({ ...p.toObject(), mode: 'binary', side: p.direction, volume: p.amount, entryPrice: p.entryPrice, positionType: 'BinaryTrade' })));
    }

    // Calculate summary
    const totalUnrealizedPnL = allPositions.reduce((sum, p) => sum + (p.profit || 0), 0);

    res.json({
      success: true,
      positions: allPositions,
      summary: {
        total: allPositions.length,
        hedging: allPositions.filter(p => p.mode === 'hedging').length,
        netting: allPositions.filter(p => p.mode === 'netting').length,
        binary: allPositions.filter(p => p.mode === 'binary').length,
        totalUnrealizedPnL
      }
    });
  } catch (error) {
    console.error('Error fetching active trades:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get composed/aggregated positions by symbol
app.get('/api/admin/trades/composed', async (req, res) => {
  try {
    const { mode, includeDemo } = req.query;
    const { HedgingPosition, NettingPosition, BinaryTrade } = require('./models/Position');

    // Get list of demo user IDs to exclude (unless includeDemo is true)
    let demoUserIds = [];
    if (includeDemo !== 'true') {
      const demoUsers = await User.find({ isDemo: true }).select('oderId');
      demoUserIds = demoUsers.map(u => u.oderId).filter(Boolean);
    }

    // Aggregation results by symbol
    const composedData = {};

    // Helper to add position to composed data
    const addToComposed = (symbol, side, volume, entryPrice, pnl, userId, tradeMode) => {
      if (!composedData[symbol]) {
        composedData[symbol] = {
          symbol,
          totalBuyLots: 0,
          totalSellLots: 0,
          netLots: 0,
          buyCount: 0,
          sellCount: 0,
          totalCount: 0,
          uniqueUsers: new Set(),
          avgBuyPrice: 0,
          avgSellPrice: 0,
          totalBuyValue: 0,
          totalSellValue: 0,
          totalPnL: 0,
          byMode: {
            hedging: { buyLots: 0, sellLots: 0, count: 0, pnl: 0 },
            netting: { buyLots: 0, sellLots: 0, count: 0, pnl: 0 },
            binary: { upAmount: 0, downAmount: 0, count: 0, pnl: 0 }
          }
        };
      }

      const data = composedData[symbol];
      data.uniqueUsers.add(userId);
      data.totalCount++;
      data.totalPnL += pnl || 0;

      if (tradeMode === 'binary') {
        if (side === 'up') {
          data.byMode.binary.upAmount += volume;
        } else {
          data.byMode.binary.downAmount += volume;
        }
        data.byMode.binary.count++;
        data.byMode.binary.pnl += pnl || 0;
      } else {
        if (side === 'buy') {
          data.totalBuyLots += volume;
          data.buyCount++;
          data.totalBuyValue += volume * entryPrice;
          data.byMode[tradeMode].buyLots += volume;
        } else {
          data.totalSellLots += volume;
          data.sellCount++;
          data.totalSellValue += volume * entryPrice;
          data.byMode[tradeMode].sellLots += volume;
        }
        data.byMode[tradeMode].count++;
        data.byMode[tradeMode].pnl += pnl || 0;
      }
    };

    // Fetch hedging positions - check all statuses first for debugging
    if (!mode || mode === 'hedging' || mode === 'all') {
      // Debug: Check what statuses exist
      const allHedging = await HedgingPosition.find({});
      const statusCounts = {};
      allHedging.forEach(p => {
        statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
      });
      console.log(`Composed: Hedging status counts:`, statusCounts);
      
      const hedgingQuery = { status: 'open' };
      if (demoUserIds.length > 0) {
        hedgingQuery.userId = { $nin: demoUserIds };
      }
      const hedging = await HedgingPosition.find(hedgingQuery);
      console.log(`Composed: Found ${hedging.length} hedging positions with status 'open'`);
      hedging.forEach(p => {
        addToComposed(p.symbol, p.side, p.volume || 0.01, p.entryPrice || 0, p.profit || 0, p.userId, 'hedging');
      });
    }

    // Fetch netting positions
    if (!mode || mode === 'netting' || mode === 'all') {
      // Debug: Check what statuses exist
      const allNetting = await NettingPosition.find({});
      const statusCounts = {};
      allNetting.forEach(p => {
        statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
      });
      console.log(`Composed: Netting status counts:`, statusCounts);
      
      const nettingQuery = { status: 'open' };
      if (demoUserIds.length > 0) {
        nettingQuery.userId = { $nin: demoUserIds };
      }
      const netting = await NettingPosition.find(nettingQuery);
      console.log(`Composed: Found ${netting.length} netting positions with status 'open'`);
      netting.forEach(p => {
        addToComposed(p.symbol, p.side, p.volume || p.quantity || 1, p.avgPrice || 0, p.profit || 0, p.userId, 'netting');
      });
    }

    // Fetch binary trades
    if (!mode || mode === 'binary' || mode === 'all') {
      const binaryQuery = { status: 'active' };
      if (demoUserIds.length > 0) {
        binaryQuery.userId = { $nin: demoUserIds };
      }
      const binary = await BinaryTrade.find(binaryQuery);
      console.log(`Composed: Found ${binary.length} binary trades`);
      binary.forEach(p => {
        addToComposed(p.symbol, p.direction, p.amount || 0, p.entryPrice || 0, 0, p.userId, 'binary');
      });
    }

    // Calculate averages and convert Sets to counts
    const result = Object.values(composedData).map(data => {
      return {
        ...data,
        uniqueUsers: data.uniqueUsers.size,
        netLots: data.totalBuyLots - data.totalSellLots,
        avgBuyPrice: data.buyCount > 0 ? data.totalBuyValue / data.totalBuyLots : 0,
        avgSellPrice: data.sellCount > 0 ? data.totalSellValue / data.totalSellLots : 0
      };
    });

    // Sort by total count descending
    result.sort((a, b) => b.totalCount - a.totalCount);

    // Calculate totals
    const totals = {
      totalSymbols: result.length,
      totalPositions: result.reduce((sum, r) => sum + r.totalCount, 0),
      totalBuyLots: result.reduce((sum, r) => sum + r.totalBuyLots, 0),
      totalSellLots: result.reduce((sum, r) => sum + r.totalSellLots, 0),
      totalPnL: result.reduce((sum, r) => sum + r.totalPnL, 0),
      totalUniqueUsers: result.reduce((sum, r) => sum + (r.uniqueUsers || 0), 0)
    };

    res.json({
      success: true,
      composed: result,
      totals
    });
  } catch (error) {
    console.error('Error fetching composed positions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get all pending orders across all users
app.get('/api/admin/trades/pending', async (req, res) => {
  try {
    const { search, symbol } = req.query;
    const { HedgingPosition } = require('./models/Position');

    // Get list of demo user IDs to exclude
    const demoUsers = await User.find({ isDemo: true }).select('oderId');
    const demoUserIds = demoUsers.map(u => u.oderId);

    const query = { status: 'pending', userId: { $nin: demoUserIds } };
    if (symbol) query.symbol = { $regex: symbol, $options: 'i' };
    if (search) query.userId = { $regex: search, $options: 'i', $nin: demoUserIds };

    const pendingOrders = await HedgingPosition.find(query).sort({ createdAt: -1 }).limit(200);

    res.json({
      success: true,
      orders: pendingOrders.map(o => ({ ...o.toObject(), mode: 'hedging' })),
      total: pendingOrders.length
    });
  } catch (error) {
    console.error('Error fetching pending orders:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get trade history (all closed trades) with pagination
app.get('/api/admin/trades/history', async (req, res) => {
  try {
    const { page = 1, limit = 50, search, symbol, mode, dateFrom, dateTo } = req.query;

    // Get list of demo user IDs to exclude
    const demoUsers = await User.find({ isDemo: true }).select('oderId');
    const demoUserIds = demoUsers.map(u => u.oderId);

    const query = { type: { $in: ['close', 'partial_close', 'binary'] }, userId: { $nin: demoUserIds } };
    if (symbol) query.symbol = { $regex: symbol, $options: 'i' };
    if (search) query.userId = { $regex: search, $options: 'i', $nin: demoUserIds };
    if (mode && mode !== 'all') query.mode = mode;
    if (dateFrom || dateTo) {
      query.executedAt = {};
      if (dateFrom) query.executedAt.$gte = new Date(dateFrom);
      if (dateTo) query.executedAt.$lte = new Date(dateTo + 'T23:59:59.999Z');
    }

    const total = await Trade.countDocuments(query);
    const trades = await Trade.find(query)
      .sort({ executedAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    // Summary stats
    const allMatchingTrades = await Trade.find(query).select('profit mode symbol volume');
    const totalPnL = allMatchingTrades.reduce((sum, t) => sum + (t.profit || 0), 0);
    const winningTrades = allMatchingTrades.filter(t => (t.profit || 0) > 0).length;
    const losingTrades = allMatchingTrades.filter(t => (t.profit || 0) < 0).length;

    // Top symbols
    const symbolMap = {};
    allMatchingTrades.forEach(t => {
      if (!symbolMap[t.symbol]) symbolMap[t.symbol] = { count: 0, pnl: 0 };
      symbolMap[t.symbol].count++;
      symbolMap[t.symbol].pnl += t.profit || 0;
    });
    const topSymbols = Object.entries(symbolMap)
      .map(([sym, data]) => ({ symbol: sym, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    res.json({
      success: true,
      trades: trades.map(t => ({ ...t.toObject() })),
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      },
      summary: {
        totalTrades: allMatchingTrades.length,
        totalPnL,
        winningTrades,
        losingTrades,
        winRate: allMatchingTrades.length > 0 ? ((winningTrades / allMatchingTrades.length) * 100).toFixed(1) : 0,
        topSymbols
      }
    });
  } catch (error) {
    console.error('Error fetching trade history:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin: Force close a position
app.post('/api/admin/trades/:id/close', async (req, res) => {
  try {
    const { id } = req.params;
    const { positionType, currentPrice } = req.body;
    const { HedgingPosition, NettingPosition, BinaryTrade } = require('./models/Position');

    let position;
    let Model;

    if (positionType === 'HedgingPosition') {
      Model = HedgingPosition;
      position = await HedgingPosition.findById(id);
    } else if (positionType === 'NettingPosition') {
      Model = NettingPosition;
      position = await NettingPosition.findById(id);
    } else if (positionType === 'BinaryTrade') {
      Model = BinaryTrade;
      position = await BinaryTrade.findById(id);
    }

    if (!position) {
      return res.status(404).json({ error: 'Position not found' });
    }

    const closeP = currentPrice || position.currentPrice || position.entryPrice;

    // Calculate profit
    let profit = 0;
    if (positionType === 'BinaryTrade') {
      position.status = 'completed';
      position.result = 'lose';
      position.exitPrice = closeP;
      position.completedAt = new Date();
    } else {
      const priceDiff = position.side === 'buy'
        ? closeP - position.entryPrice
        : position.entryPrice - closeP;
      const sym = position.symbol || '';
      const vol = position.volume || 0;
      if (sym.includes('BTC') || sym.includes('ETH')) {
        profit = priceDiff * vol;
      } else if (sym === 'XAUUSD' || sym === 'XAGUSD') {
        profit = priceDiff * vol * 100;
      } else if (sym.includes('JPY')) {
        profit = (priceDiff / 0.01) * vol * 1000;
      } else {
        profit = (priceDiff / 0.0001) * vol * 10;
      }

      position.status = 'closed';
      position.closePrice = closeP;
      position.closeTime = new Date();
      position.profit = profit;
      position.closedBy = 'admin';
    }

    await position.save();

    // Record in trade history
    const trade = new Trade({
      tradeId: `ADM-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      oderId: position.oderId || position.tradeId,
      userId: position.userId,
      mode: positionType === 'HedgingPosition' ? 'hedging' : positionType === 'NettingPosition' ? 'netting' : 'binary',
      symbol: position.symbol,
      side: position.side || position.direction,
      volume: position.volume || position.amount,
      entryPrice: position.entryPrice || position.avgPrice,
      closePrice: closeP,
      type: 'close',
      profit: profit,
      commission: position.commission || 0,
      swap: position.swap || 0,
      closedBy: 'admin',
      remark: 'Admin',
      executedAt: new Date(),
      closedAt: new Date()
    });
    await trade.save();

    // Update user wallet
    const user = await User.findOne({ oderId: position.userId });
    if (user) {
      user.settlePnL(profit);
      if (position.marginUsed) user.releaseMargin(position.marginUsed);
      await user.save();
    }

    await saveAdminTradeEditLog(req, {
      userDoc: user,
      tradeUserId: position.userId,
      tradeId: position.oderId || position.tradeId || id,
      action: 'FORCE_CLOSE',
      remark: `Forced close position with exit price ${closeP}`
    });

    res.json({ success: true, message: 'Position closed by admin', profit });
  } catch (error) {
    console.error('Error force closing position:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin: Run netting F&O option expiry settlement (intrinsic value + cancel expired pending)
app.post('/api/admin/netting/option-expiry-settlement', async (req, res) => {
  try {
    const result = await triggerOptionExpirySettlement();
    res.json({ success: true, result });
  } catch (error) {
    console.error('[Admin] Option expiry settlement:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: Cancel a pending order
app.post('/api/admin/trades/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const { HedgingPosition } = require('./models/Position');

    const order = await HedgingPosition.findById(id);
    if (!order || order.status !== 'pending') {
      return res.status(404).json({ error: 'Pending order not found' });
    }

    // Find user for margin release and activity logging
    const user = await User.findOne({ oderId: order.userId });

    // Release margin if held
    if (order.marginUsed && user) {
      user.releaseMargin(order.marginUsed);
      await user.save();
    }

    // Record cancellation
    const trade = new Trade({
      tradeId: `CAN-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      oderId: order.oderId,
      userId: order.userId,
      mode: 'hedging',
      symbol: order.symbol,
      side: order.side,
      volume: order.volume,
      entryPrice: order.entryPrice,
      type: 'cancelled',
      profit: 0,
      executedAt: new Date()
    });
    await trade.save();

    await HedgingPosition.findByIdAndDelete(id);

    // Log activity for order cancellation
    if (user) {
      const cancelUserAgent = req.get('User-Agent') || '';
      await UserActivityLog.logActivity({
        userId: user._id.toString(),
        oderId: order.userId,
        activityType: 'order_cancelled',
        description: `Pending ${order.side.toUpperCase()} order cancelled: ${order.volume} lot(s) ${order.symbol} @ ${order.entryPrice}`,
        metadata: { orderId: order._id, symbol: order.symbol, side: order.side, volume: order.volume, entryPrice: order.entryPrice },
        ipAddress: req.ip,
        userAgent: cancelUserAgent,
        device: cancelUserAgent.includes('Mobile') ? 'mobile' : 'desktop',
        os: parseOS(cancelUserAgent),
        browser: parseBrowser(cancelUserAgent),
        status: 'success'
      });
    }

    await saveAdminTradeEditLog(req, {
      userDoc: user,
      tradeUserId: order.userId,
      tradeId: order.oderId || id,
      action: 'CANCEL_PENDING',
      remark: `Cancelled pending order (Sym: ${order.symbol}, Vol: ${order.volume})`
    });

    res.json({ success: true, message: 'Order cancelled by admin' });
  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin: Reopen a closed trade and reverse P/L from wallet
app.post('/api/admin/trades/:id/reopen', async (req, res) => {
  try {
    const { id } = req.params;
    const { mode, userId, pnl } = req.body;
    const TradeModel = require('./models/Trade');

    let position = null;
    let historyTrade = null;

    if (mode === 'hedging' || !mode) {
      position = await HedgingPosition.findById(id);
    }
    if (!position && (mode === 'netting' || !mode)) {
      position = await NettingPosition.findById(id);
    }
    if (!position && (mode === 'binary' || !mode)) {
      position = await BinaryTrade.findById(id);
    }

    // Closed Positions / Trade History list uses Trade _id — resolve real position via oderId
    if (!position) {
      historyTrade = await TradeModel.findById(id);
      if (historyTrade && ['close', 'partial_close'].includes(historyTrade.type)) {
        const tMode = historyTrade.mode || mode;
        if (tMode === 'hedging') {
          position = await HedgingPosition.findOne({
            oderId: historyTrade.oderId,
            userId: historyTrade.userId,
            status: 'closed'
          });
        } else if (tMode === 'netting') {
          position = await NettingPosition.findOne({
            oderId: historyTrade.oderId,
            userId: historyTrade.userId,
            status: 'closed'
          });
        }
      } else if (historyTrade && historyTrade.mode === 'binary' && historyTrade.type === 'binary') {
        position = await BinaryTrade.findOne({
          tradeId: historyTrade.oderId,
          userId: historyTrade.userId,
          status: 'completed'
        });
      }
    }

    if (!position) {
      return res.status(404).json({
        success: false,
        error:
          'Position not found. For history rows, the original closed position must still exist (same oderId).'
      });
    }

    const uid = String(position.userId || userId || '');
    const userOr = [{ oderId: uid }];
    if (mongoose.Types.ObjectId.isValid(uid)) {
      try {
        userOr.push({ _id: new mongoose.Types.ObjectId(uid) });
      } catch (_) {
        /* ignore */
      }
    }
    const user = await User.findOne({ $or: userOr });

    const oldPnL = historyTrade
      ? Number(historyTrade.profit ?? pnl ?? 0)
      : Number(position.profit ?? position.pnl ?? pnl ?? 0);

    if (user && oldPnL !== 0) {
      user.wallet.balance -= oldPnL;
      user.wallet.equity = user.wallet.balance + user.wallet.credit;
      user.wallet.freeMargin = user.wallet.equity - user.wallet.margin;

      if (oldPnL > 0) {
        user.stats.totalProfit = Math.max(0, (user.stats.totalProfit || 0) - oldPnL);
        user.stats.winningTrades = Math.max(0, (user.stats.winningTrades || 0) - 1);
      } else if (oldPnL < 0) {
        user.stats.totalLoss = Math.max(0, (user.stats.totalLoss || 0) - Math.abs(oldPnL));
        user.stats.losingTrades = Math.max(0, (user.stats.losingTrades || 0) - 1);
      }
      user.stats.totalTrades = Math.max(0, (user.stats.totalTrades || 0) - 1);
      user.stats.netPnL = (user.stats.totalProfit || 0) - (user.stats.totalLoss || 0);
    }

    const marginToRestore = Number(position.marginUsed) || 0;
    if (user && marginToRestore > 0) {
      user.useMargin(marginToRestore);
    }

    if (user) await user.save();

    const modelName = position.constructor?.modelName;
    if (modelName === 'BinaryTrade') {
      position.status = 'active';
      position.result = null;
      position.exitPrice = null;
      position.payout = 0;
      position.completedAt = null;
    } else {
      position.status = 'open';
      position.closePrice = null;
      position.closeTime = null;
      position.profit = 0;
    }

    await position.save();

    await saveAdminTradeEditLog(req, {
      userDoc: user,
      tradeUserId: uid,
      tradeId: position.oderId || position.tradeId || id,
      action: 'REOPEN',
      remark: `Reopened closed position (reversed P/L: ${oldPnL})`
    });

    res.json({
      success: true,
      message: 'Trade reopened and P/L reversed from wallet',
      reversedPnL: oldPnL,
      newWalletBalance: user?.wallet?.balance,
      positionId: position._id
    });
  } catch (error) {
    console.error('Error reopening trade:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: Delete trade permanently (no wallet impact)
app.delete('/api/admin/trades/:id/delete', async (req, res) => {
  try {
    const { id } = req.params;
    const { tradeType } = req.body;
    const { HedgingPosition, NettingPosition, BinaryTrade } = require('./models/Position');
    const Trade = require('./models/Trade');

    let doc = null;

    if (tradeType === 'open' || !tradeType) {
      doc = await HedgingPosition.findById(id);
      if (!doc) doc = await NettingPosition.findById(id);
      if (!doc) doc = await BinaryTrade.findById(id);
    }
    if ((tradeType === 'pending' || !tradeType) && !doc) {
      doc = await HedgingPosition.findOne({ _id: id, status: 'pending' });
    }
    if ((tradeType === 'history' || !tradeType) && !doc) {
      doc = await Trade.findById(id);
    }

    if (!doc) {
      return res.status(404).json({ error: 'Trade not found' });
    }

    const tradeUserId = doc.userId;
    const tradeIdForLog = doc.oderId || doc.tradeId || id;

    await doc.deleteOne();

    await saveAdminTradeEditLog(req, {
      userDoc: null,
      tradeUserId,
      tradeId: tradeIdForLog,
      action: 'DELETE_TRADE',
      remark: `Permanently deleted trade (list: ${tradeType || 'auto'}, symbol: ${doc.symbol || 'n/a'})`
    });

    res.json({ success: true, message: 'Trade deleted permanently' });
  } catch (error) {
    console.error('Error deleting trade:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin: Close trade with custom P/L and sync with user wallet
app.post('/api/admin/trades/:id/close-with-pnl', async (req, res) => {
  try {
    const { id } = req.params;
    const { entryPrice, closePrice, volume, pnl, mode, userId } = req.body;
    const { HedgingPosition, NettingPosition, BinaryTrade } = require('./models/Position');
    const Trade = require('./models/Trade');

    let position;

    // Try to find position in different collections based on mode
    if (mode === 'hedging' || !mode) {
      position = await HedgingPosition.findById(id);
    }
    if (!position && (mode === 'netting' || !mode)) {
      position = await NettingPosition.findById(id);
    }
    if (!position && (mode === 'binary' || !mode)) {
      position = await BinaryTrade.findById(id);
    }

    if (!position) {
      return res.status(404).json({ error: 'Position not found' });
    }

    // Update position with new values and close it
    if (entryPrice !== undefined) {
      position.entryPrice = entryPrice;
      if (position.avgPrice !== undefined) position.avgPrice = entryPrice;
    }
    if (closePrice !== undefined) {
      position.closePrice = closePrice;
    }
    if (volume !== undefined) {
      position.volume = volume;
      if (position.lotSize !== undefined) position.lotSize = volume;
    }
    
    position.profit = pnl || 0;
    position.pnl = pnl || 0;
    position.status = 'closed';
    position.closeTime = new Date();
    position.closedAt = new Date();

    await position.save();

    // Update user wallet with P/L
    const userOderId = position.userId || userId;
    const user = await User.findOne({ 
      $or: [{ oderId: userOderId }, { _id: userOderId.match?.(/^[0-9a-fA-F]{24}$/) ? userOderId : null }]
    });
    
    if (user) {
      // Add P/L to wallet balance
      user.wallet.balance += (pnl || 0);
      user.wallet.equity = user.wallet.balance + user.wallet.credit;
      
      // Release margin
      const marginUsed = position.marginUsed || position.margin || 0;
      user.wallet.margin = Math.max(0, (user.wallet.margin || 0) - marginUsed);
      user.wallet.freeMargin = user.wallet.equity - user.wallet.margin;
      
      // Update stats
      user.stats.totalTrades = (user.stats.totalTrades || 0) + 1;
      if (pnl > 0) {
        user.stats.winningTrades = (user.stats.winningTrades || 0) + 1;
        user.stats.totalProfit = (user.stats.totalProfit || 0) + pnl;
      } else if (pnl < 0) {
        user.stats.losingTrades = (user.stats.losingTrades || 0) + 1;
        user.stats.totalLoss = (user.stats.totalLoss || 0) + Math.abs(pnl);
      }
      
      await user.save();
    }

    // Record in trade history
    const trade = new Trade({
      tradeId: `ADM-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      oderId: position.oderId || position.tradeId,
      userId: position.userId,
      mode: mode || 'hedging',
      symbol: position.symbol,
      side: position.side || position.direction,
      volume: volume || position.volume,
      entryPrice: entryPrice || position.entryPrice,
      closePrice: closePrice,
      type: 'close',
      profit: pnl || 0,
      closedBy: 'admin',
      remark: 'Admin',
      executedAt: new Date(),
      closedAt: new Date()
    });
    await trade.save();

    await saveAdminTradeEditLog(req, {
      userDoc: user,
      tradeUserId: position.userId || userId,
      tradeId: position.oderId || position.tradeId || id,
      action: 'FORCE_CLOSE',
      remark: `Closed position with custom P/L ${pnl} (entry ${entryPrice ?? position.entryPrice}, close ${closePrice}, vol ${volume ?? position.volume})`
    });

    res.json({ 
      success: true, 
      message: 'Trade closed and wallet synced',
      profit: pnl,
      newWalletBalance: user?.wallet?.balance
    });
  } catch (error) {
    console.error('Error closing trade with P/L:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin: Edit trade (entry price, close price, P/L) and sync with user wallet
app.put('/api/admin/trades/:id/edit', async (req, res) => {
  try {
    const { id } = req.params;
    const { entryPrice, closePrice, volume, pnl, mode, userId } = req.body;
    const { HedgingPosition, NettingPosition, BinaryTrade } = require('./models/Position');
    const Trade = require('./models/Trade');

    let position;
    let Model;
    let oldPnL = 0;
    let isTradeHistory = false;

    // Try to find position in different collections based on mode
    if (mode === 'hedging' || !mode) {
      position = await HedgingPosition.findById(id);
      Model = HedgingPosition;
    }
    if (!position && (mode === 'netting' || !mode)) {
      position = await NettingPosition.findById(id);
      Model = NettingPosition;
    }
    if (!position && (mode === 'binary' || !mode)) {
      position = await BinaryTrade.findById(id);
      Model = BinaryTrade;
    }
    
    // Also check Trade history collection
    if (!position) {
      position = await Trade.findById(id);
      Model = Trade;
      isTradeHistory = true;
    }

    if (!position) {
      return res.status(404).json({ error: 'Position not found' });
    }

    // Determine if the trade is closed (only sync wallet for closed trades)
    const isClosed = position.status === 'closed' || isTradeHistory;

    // Store old P/L for wallet adjustment (only relevant for closed trades)
    oldPnL = position.profit || position.pnl || 0;

    // Update position fields
    if (entryPrice !== undefined) {
      position.entryPrice = entryPrice;
      if (position.avgPrice !== undefined) position.avgPrice = entryPrice;
      if (position.openPrice !== undefined) position.openPrice = entryPrice;
    }
    if (closePrice !== undefined) {
      position.closePrice = closePrice;
      position.currentPrice = closePrice;
    }
    if (volume !== undefined) {
      position.volume = volume;
      if (position.lotSize !== undefined) position.lotSize = volume;
    }
    if (pnl !== undefined) {
      position.profit = pnl;
      position.pnl = pnl;
      // Only set unrealizedPnL for open trades; for closed trades P/L is realized
      if (!isClosed) {
        position.unrealizedPnL = pnl;
      }
    }

    await position.save();

    // Only sync P/L to wallet for CLOSED trades
    // Open trades should NOT affect wallet balance — their P/L is unrealized
    let pnlDiff = 0;
    let walletSynced = false;
    const userOderId = position.userId || userId;
    const user = await User.findOne({ 
      $or: [{ oderId: userOderId }, { _id: userOderId.match?.(/^[0-9a-fA-F]{24}$/) ? userOderId : null }]
    });

    if (isClosed && user) {
      // Calculate P/L difference for wallet sync
      pnlDiff = (pnl || 0) - oldPnL;

      if (pnlDiff !== 0) {
        // Adjust wallet balance with P/L difference
        user.wallet.balance += pnlDiff;
        user.wallet.equity = user.wallet.balance + user.wallet.credit;
        user.wallet.freeMargin = user.wallet.equity - user.wallet.margin;
        
        // Update stats
        if (pnl > 0) {
          user.stats.totalProfit = (user.stats.totalProfit || 0) + Math.max(0, pnlDiff);
        } else if (pnl < 0) {
          user.stats.totalLoss = (user.stats.totalLoss || 0) + Math.abs(Math.min(0, pnlDiff));
        }
        
        await user.save();
        walletSynced = true;
      }
    }

    // Also update Trade history if exists (Trade already required above)
    await Trade.updateMany(
      { $or: [{ tradeId: position.tradeId }, { oderId: position.oderId }] },
      { 
        $set: { 
          entryPrice: entryPrice || position.entryPrice,
          closePrice: closePrice || position.closePrice,
          profit: pnl || 0
        }
      }
    );

    await saveAdminTradeEditLog(req, {
      userDoc: user,
      tradeUserId: position.userId || userId,
      tradeId: position.oderId || position.tradeId || id,
      action: 'EDIT_PRICE_VOLUME',
      remark: `Updated trade — entry: ${entryPrice ?? '-'}, close: ${closePrice ?? '-'}, volume: ${volume ?? '-'}, P/L: ${pnl ?? '-'}, symbol: ${position.symbol || 'n/a'}, ${isClosed ? 'closed' : 'open'}`
    });

    res.json({ 
      success: true, 
      message: isClosed 
        ? 'Trade updated and wallet synced' 
        : 'Trade updated (wallet not affected — trade is still open)',
      position: position.toObject(),
      walletSynced,
      walletAdjustment: pnlDiff,
      newWalletBalance: user?.wallet?.balance
    });
  } catch (error) {
    console.error('Error editing trade:', error);
    res.status(500).json({ error: error.message });
  }
});

// Fetch admin trade edit logs
app.get('/api/admin/trade-edit-logs', async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    if (search) {
      query = {
        $or: [
          { adminName: { $regex: search, $options: 'i' } },
          { userName: { $regex: search, $options: 'i' } },
          { action: { $regex: search, $options: 'i' } },
          { remark: { $regex: search, $options: 'i' } }
        ]
      };
    }

    const AdminTradeEditLog = require('./models/AdminTradeEditLog');
    const logs = await AdminTradeEditLog.find(query)
      .sort({ timestamp: -1 })
      .skip(Number(skip))
      .limit(Number(limit));
    const total = await AdminTradeEditLog.countDocuments(query);

    res.json({ success: true, logs, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (error) {
    console.error('Error fetching trade edit logs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== KYC MANAGEMENT ENDPOINTS ==============

// User: Submit KYC
app.post('/api/kyc/submit', async (req, res) => {
  try {
    const { userId, oderId, documentType, documentNumber, frontImage, backImage, selfieImage, fullName, dateOfBirth, address } = req.body;
    
    // Check if user already has pending/approved KYC
    const existingKyc = await KYC.findOne({ userId, status: { $in: ['pending', 'approved'] } });
    if (existingKyc) {
      if (existingKyc.status === 'approved') {
        return res.status(400).json({ error: 'KYC already approved' });
      }
      return res.status(400).json({ error: 'KYC verification already pending' });
    }
    
    const kyc = new KYC({
      userId,
      oderId,
      documentType,
      documentNumber,
      frontImage,
      backImage,
      selfieImage,
      fullName,
      dateOfBirth,
      address,
      status: 'pending',
      submittedAt: new Date()
    });
    
    await kyc.save();
    
    // Log activity
    await UserActivityLog.logActivity({
      userId,
      oderId,
      activityType: 'kyc_submitted',
      description: `KYC submitted with ${documentType}`,
      metadata: { kycId: kyc._id, documentType },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    res.json({ success: true, message: 'KYC submitted successfully', kyc });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// User: Get KYC status
app.get('/api/kyc/status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const kyc = await KYC.findOne({ $or: [{ userId }, { oderId: userId }] }).sort({ submittedAt: -1 });
    
    if (!kyc) {
      return res.json({ success: true, status: 'not_submitted', kyc: null });
    }
    
    res.json({ success: true, status: kyc.status, kyc });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get all KYC submissions with pagination
app.get('/api/admin/kyc', async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const query = {};
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    if (search) {
      query.$or = [
        { oderId: { $regex: search, $options: 'i' } },
        { fullName: { $regex: search, $options: 'i' } },
        { documentNumber: { $regex: search, $options: 'i' } }
      ];
    }
    
    const total = await KYC.countDocuments(query);
    const kycs = await KYC.find(query)
      .sort({ submittedAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));
    
    // Get user details for each KYC - query by oderId only to avoid ObjectId cast errors
    const kycWithUsers = await Promise.all(kycs.map(async (kyc) => {
      let user = null;
      try {
        user = await User.findOne({ oderId: kyc.oderId }).select('name email phone oderId');
      } catch (err) {
        console.error('Error fetching user for KYC:', err.message);
      }
      return { ...kyc.toObject(), user };
    }));
    
    res.json({
      success: true,
      kycs: kycWithUsers,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get pending KYC count
app.get('/api/admin/kyc/pending-count', async (req, res) => {
  try {
    const count = await KYC.countDocuments({ status: 'pending' });
    res.json({ success: true, count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Approve KYC
app.put('/api/admin/kyc/:kycId/approve', async (req, res) => {
  try {
    const { kycId } = req.params;
    const { adminNotes, reviewedBy } = req.body;
    
    const kyc = await KYC.findById(kycId);
    if (!kyc) {
      return res.status(404).json({ error: 'KYC not found' });
    }
    
    kyc.status = 'approved';
    kyc.reviewedBy = reviewedBy || 'Admin';
    kyc.reviewedAt = new Date();
    kyc.adminNotes = adminNotes;
    await kyc.save();
    
    // Update user's KYC status
    await User.findOneAndUpdate(
      { $or: [{ _id: kyc.userId }, { oderId: kyc.oderId }] },
      { kycVerified: true, kycStatus: 'approved' }
    );
    
    // Log activity
    await UserActivityLog.logActivity({
      userId: kyc.userId,
      oderId: kyc.oderId,
      activityType: 'kyc_approved',
      description: 'KYC verification approved',
      metadata: { kycId: kyc._id, reviewedBy }
    });
    
    res.json({ success: true, message: 'KYC approved', kyc });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Reject KYC
app.put('/api/admin/kyc/:kycId/reject', async (req, res) => {
  try {
    const { kycId } = req.params;
    const { rejectionReason, adminNotes, reviewedBy } = req.body;
    
    const kyc = await KYC.findById(kycId);
    if (!kyc) {
      return res.status(404).json({ error: 'KYC not found' });
    }
    
    kyc.status = 'rejected';
    kyc.rejectionReason = rejectionReason;
    kyc.reviewedBy = reviewedBy || 'Admin';
    kyc.reviewedAt = new Date();
    kyc.adminNotes = adminNotes;
    await kyc.save();
    
    // Update user's KYC status
    await User.findOneAndUpdate(
      { $or: [{ _id: kyc.userId }, { oderId: kyc.oderId }] },
      { kycVerified: false, kycStatus: 'rejected' }
    );
    
    // Log activity
    await UserActivityLog.logActivity({
      userId: kyc.userId,
      oderId: kyc.oderId,
      activityType: 'kyc_rejected',
      description: `KYC verification rejected: ${rejectionReason}`,
      metadata: { kycId: kyc._id, rejectionReason, reviewedBy }
    });
    
    res.json({ success: true, message: 'KYC rejected', kyc });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Request KYC resubmission
app.put('/api/admin/kyc/:kycId/resubmit', async (req, res) => {
  try {
    const { kycId } = req.params;
    const { rejectionReason, adminNotes, reviewedBy } = req.body;
    
    const kyc = await KYC.findById(kycId);
    if (!kyc) {
      return res.status(404).json({ error: 'KYC not found' });
    }
    
    kyc.status = 'resubmit';
    kyc.rejectionReason = rejectionReason;
    kyc.reviewedBy = reviewedBy || 'Admin';
    kyc.reviewedAt = new Date();
    kyc.adminNotes = adminNotes;
    await kyc.save();
    
    // Update user's KYC status
    await User.findOneAndUpdate(
      { $or: [{ _id: kyc.userId }, { oderId: kyc.oderId }] },
      { kycVerified: false, kycStatus: 'resubmit' }
    );
    
    res.json({ success: true, message: 'KYC resubmission requested', kyc });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get user's KYC documents
app.get('/api/admin/kyc/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const kycs = await KYC.find({ $or: [{ userId }, { oderId: userId }] }).sort({ submittedAt: -1 });
    res.json({ success: true, kycs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============== ADMIN WATCHLIST ENDPOINTS ==============

const AdminWatchlist = require('./models/AdminWatchlist');

// Admin: Get watchlist for a segment
app.get('/api/admin/watchlist/:segment', async (req, res) => {
  try {
    const { segment } = req.params;
    const watchlist = await AdminWatchlist.findOne({ segment });
    res.json({ success: true, instruments: watchlist?.instruments || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: Add instrument to watchlist
app.post('/api/admin/watchlist', async (req, res) => {
  try {
    const { segment, instrument } = req.body;
    if (!segment || !instrument) {
      return res.status(400).json({ success: false, error: 'Segment and instrument required' });
    }
    
    let watchlist = await AdminWatchlist.findOne({ segment });
    
    if (!watchlist) {
      watchlist = new AdminWatchlist({ segment, instruments: [] });
    }
    
    const key = instrument.token || instrument.symbol;
    const exists = watchlist.instruments.some(w => (w.token || w.symbol) === key);
    if (!exists) {
      watchlist.instruments.push(instrument);
      await watchlist.save();
    }
    
    res.json({ success: true, instruments: watchlist.instruments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: Remove instrument from watchlist
app.delete('/api/admin/watchlist', async (req, res) => {
  try {
    const { segment, symbol } = req.body;
    if (!segment || !symbol) {
      return res.status(400).json({ success: false, error: 'Segment and symbol required' });
    }
    
    const watchlist = await AdminWatchlist.findOne({ segment });
    if (watchlist) {
      watchlist.instruments = watchlist.instruments.filter(w => w.symbol !== symbol);
      await watchlist.save();
    }
    
    res.json({ success: true, instruments: watchlist?.instruments || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== USER ACTIVITY LOG ENDPOINTS ==============

// Admin: Get all activity logs with pagination
app.get('/api/admin/activity-logs', async (req, res) => {
  try {
    const { userId, activityType, search, page = 1, limit = 20, startDate, endDate } = req.query;
    const query = {};
    
    if (userId && userId !== 'all') {
      query.$or = [{ userId }, { oderId: userId }];
    }
    
    if (activityType && activityType !== 'all') {
      query.activityType = activityType;
    }
    
    // Date filter
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) {
        query.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.timestamp.$lte = end;
      }
    }
    
    if (search) {
      const searchQuery = [
        { oderId: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: searchQuery }];
        delete query.$or;
      } else {
        query.$or = searchQuery;
      }
    }
    
    const total = await UserActivityLog.countDocuments(query);
    const logs = await UserActivityLog.find(query)
      .sort({ timestamp: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));
    
    // Get user details for each log (including isDemo flag)
    const logsWithUsers = await Promise.all(logs.map(async (log) => {
      const user = await User.findOne({ $or: [{ _id: log.userId }, { oderId: log.oderId }] })
        .select('name email phone oderId isDemo');
      return { ...log.toObject(), user };
    }));
    
    res.json({
      success: true,
      logs: logsWithUsers,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Export activity logs as CSV/Excel
app.get('/api/admin/activity-logs/export', async (req, res) => {
  try {
    const { userId, activityType, startDate, endDate, format = 'csv' } = req.query;
    const query = {};
    
    if (userId && userId !== 'all') {
      query.$or = [{ userId }, { oderId: userId }];
    }
    
    if (activityType && activityType !== 'all') {
      query.activityType = activityType;
    }
    
    // Date filter
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) {
        query.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.timestamp.$lte = end;
      }
    }
    
    const logs = await UserActivityLog.find(query).sort({ timestamp: -1 }).limit(10000);
    
    // Get user details for each log
    const logsWithUsers = await Promise.all(logs.map(async (log) => {
      const user = await User.findOne({ $or: [{ _id: log.userId }, { oderId: log.oderId }] })
        .select('name email phone oderId');
      return { ...log.toObject(), user };
    }));
    
    // Generate CSV
    const headers = ['Date', 'Time', 'User ID', 'User Name', 'Email', 'Activity Type', 'Description', 'Status', 'IP Address', 'OS', 'Browser', 'Device'];
    const rows = logsWithUsers.map(log => {
      const date = new Date(log.timestamp);
      return [
        date.toLocaleDateString(),
        date.toLocaleTimeString(),
        log.oderId || log.userId,
        log.user?.name || '-',
        log.user?.email || '-',
        log.activityType?.replace(/_/g, ' '),
        `"${(log.description || '').replace(/"/g, '""')}"`,
        log.status || '-',
        log.ipAddress || '-',
        log.os || '-',
        log.browser || '-',
        log.device || '-'
      ].join(',');
    });
    
    const csv = [headers.join(','), ...rows].join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=activity-logs-${Date.now()}.csv`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get user's activity logs with pagination
app.get('/api/admin/activity-logs/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { activityType, page = 1, limit = 20 } = req.query;
    
    const query = { $or: [{ userId }, { oderId: userId }] };
    
    if (activityType && activityType !== 'all') {
      query.activityType = activityType;
    }
    
    const total = await UserActivityLog.countDocuments(query);
    const logs = await UserActivityLog.find(query)
      .sort({ timestamp: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));
    
    res.json({
      success: true,
      logs,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get activity stats
app.get('/api/admin/activity-logs/stats', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayLogins = await UserActivityLog.countDocuments({ activityType: 'login', timestamp: { $gte: today } });
    const todayTrades = await UserActivityLog.countDocuments({ activityType: { $in: ['trade_open', 'trade_close'] }, timestamp: { $gte: today } });
    const todayDeposits = await UserActivityLog.countDocuments({ activityType: 'deposit_request', timestamp: { $gte: today } });
    const todayWithdrawals = await UserActivityLog.countDocuments({ activityType: 'withdrawal_request', timestamp: { $gte: today } });
    
    res.json({
      success: true,
      stats: {
        todayLogins,
        todayTrades,
        todayDeposits,
        todayWithdrawals
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function to log user activity (can be called from other routes)
const logUserActivity = async (data) => {
  try {
    await UserActivityLog.logActivity(data);
  } catch (error) {
    console.error('Error logging activity:', error);
  }
};

// ============== ADMIN ACTIVITY LOG ENDPOINTS ==============

// Parse OS from User-Agent
const parseOS = (userAgent) => {
  if (!userAgent) return 'Unknown';
  if (userAgent.includes('Windows NT 10')) return 'Windows 10';
  if (userAgent.includes('Windows NT 11')) return 'Windows 11';
  if (userAgent.includes('Windows')) return 'Windows';
  if (userAgent.includes('Mac OS X') || userAgent.includes('Macintosh')) return 'macOS';
  if (userAgent.includes('Linux') && userAgent.includes('Android')) return 'Android';
  if (userAgent.includes('Linux')) return 'Linux';
  if (userAgent.includes('iPhone') || userAgent.includes('iPad')) return 'iOS';
  if (userAgent.includes('Android')) return 'Android';
  return 'Unknown';
};

// Parse Browser from User-Agent
const parseBrowser = (userAgent) => {
  if (!userAgent) return 'Unknown';
  if (userAgent.includes('Edg/')) return 'Edge';
  if (userAgent.includes('OPR/') || userAgent.includes('Opera')) return 'Opera';
  if (userAgent.includes('Brave')) return 'Brave';
  if (userAgent.includes('Vivaldi')) return 'Vivaldi';
  if (userAgent.includes('Firefox/')) return 'Firefox';
  if (userAgent.includes('Safari/') && !userAgent.includes('Chrome')) return 'Safari';
  if (userAgent.includes('Chrome/')) return 'Chrome';
  return 'Unknown';
};

// Admin: Get SubAdmin activity logs
app.get('/api/admin/subadmin-activity-logs', async (req, res) => {
  try {
    const { adminId, activityType, search, page = 1, limit = 20, startDate, endDate } = req.query;
    const query = { role: 'sub_admin' };
    
    if (adminId && adminId !== 'all') {
      query.$or = [{ adminId }, { oderId: adminId }];
    }
    
    if (activityType && activityType !== 'all') {
      query.activityType = activityType;
    }
    
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.timestamp.$lte = end;
      }
    }
    
    if (search) {
      const searchQuery = [
        { oderId: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: searchQuery }];
        delete query.$or;
      } else {
        query.$or = searchQuery;
      }
    }
    
    const total = await AdminActivityLog.countDocuments(query);
    const logs = await AdminActivityLog.find(query)
      .sort({ timestamp: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));
    
    // Get admin details for each log
    const logsWithAdmins = await Promise.all(logs.map(async (log) => {
      const admin = await Admin.findOne({ $or: [{ _id: log.adminId }, { oderId: log.oderId }] })
        .select('name email phone oderId role');
      return { ...log.toObject(), admin };
    }));
    
    res.json({
      success: true,
      logs: logsWithAdmins,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get Broker activity logs
app.get('/api/admin/broker-activity-logs', async (req, res) => {
  try {
    const { adminId, activityType, search, page = 1, limit = 20, startDate, endDate } = req.query;
    const query = { role: 'broker' };
    
    if (adminId && adminId !== 'all') {
      query.$or = [{ adminId }, { oderId: adminId }];
    }
    
    if (activityType && activityType !== 'all') {
      query.activityType = activityType;
    }
    
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.timestamp.$lte = end;
      }
    }
    
    if (search) {
      const searchQuery = [
        { oderId: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: searchQuery }];
        delete query.$or;
      } else {
        query.$or = searchQuery;
      }
    }
    
    const total = await AdminActivityLog.countDocuments(query);
    const logs = await AdminActivityLog.find(query)
      .sort({ timestamp: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));
    
    // Get admin details for each log
    const logsWithAdmins = await Promise.all(logs.map(async (log) => {
      const admin = await Admin.findOne({ $or: [{ _id: log.adminId }, { oderId: log.oderId }] })
        .select('name email phone oderId role');
      return { ...log.toObject(), admin };
    }));
    
    res.json({
      success: true,
      logs: logsWithAdmins,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Export SubAdmin/Broker activity logs as CSV
app.get('/api/admin/admin-activity-logs/export', async (req, res) => {
  try {
    const { role, adminId, activityType, startDate, endDate } = req.query;
    const query = {};
    
    if (role && role !== 'all') {
      query.role = role;
    }
    
    if (adminId && adminId !== 'all') {
      query.$or = [{ adminId }, { oderId: adminId }];
    }
    
    if (activityType && activityType !== 'all') {
      query.activityType = activityType;
    }
    
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.timestamp.$lte = end;
      }
    }
    
    const logs = await AdminActivityLog.find(query).sort({ timestamp: -1 }).limit(10000);
    
    const logsWithAdmins = await Promise.all(logs.map(async (log) => {
      const admin = await Admin.findOne({ $or: [{ _id: log.adminId }, { oderId: log.oderId }] })
        .select('name email phone oderId role');
      return { ...log.toObject(), admin };
    }));
    
    const headers = ['Date', 'Time', 'Admin ID', 'Name', 'Email', 'Role', 'Activity Type', 'Description', 'Status', 'IP Address', 'OS', 'Browser', 'Device'];
    const rows = logsWithAdmins.map(log => {
      const date = new Date(log.timestamp);
      return [
        date.toLocaleDateString(),
        date.toLocaleTimeString(),
        log.oderId || log.adminId,
        log.admin?.name || '-',
        log.admin?.email || '-',
        log.role || '-',
        log.activityType?.replace(/_/g, ' '),
        `"${(log.description || '').replace(/"/g, '""')}"`,
        log.status || '-',
        log.ipAddress || '-',
        log.os || '-',
        log.browser || '-',
        log.device || '-'
      ].join(',');
    });
    
    const csv = [headers.join(','), ...rows].join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=admin-activity-logs-${Date.now()}.csv`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function to log admin activity
const logAdminActivity = async (data) => {
  try {
    await AdminActivityLog.logActivity(data);
  } catch (error) {
    console.error('Error logging admin activity:', error);
  }
};

// ============== CHARGE MANAGEMENT ENDPOINTS ==============

// Helper: generic CRUD for charge settings
const createChargeCRUD = (path, Model) => {
  // GET all
  app.get(`/api/admin/charges/${path}`, async (req, res) => {
    try {
      const items = await Model.find({}).sort({ createdAt: -1 });
      res.json({ success: true, items });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST create
  app.post(`/api/admin/charges/${path}`, async (req, res) => {
    try {
      const item = new Model(req.body);
      await item.save();
      res.json({ success: true, item });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({ error: 'A setting with this symbol/name already exists' });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // PUT update
  app.put(`/api/admin/charges/${path}/:id`, async (req, res) => {
    try {
      const item = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
      if (!item) return res.status(404).json({ error: 'Setting not found' });
      res.json({ success: true, item });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({ error: 'A setting with this symbol/name already exists' });
      }
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE
  app.delete(`/api/admin/charges/${path}/:id`, async (req, res) => {
    try {
      const item = await Model.findByIdAndDelete(req.params.id);
      if (!item) return res.status(404).json({ error: 'Setting not found' });
      res.json({ success: true, message: 'Deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
};

createChargeCRUD('spreads', SpreadSetting);
createChargeCRUD('commissions', CommissionSetting);
createChargeCRUD('swaps', SwapSetting);
createChargeCRUD('margins', MarginSetting);
createChargeCRUD('leverages', LeverageSetting);
createChargeCRUD('fees', FeeSetting);

// Public: Get all charges for a symbol (used by OrderPanel before placing trade)
app.get('/api/charges/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const [spread, commission, swap, margin] = await Promise.all([
      SpreadSetting.findOne({ symbol, isActive: true }),
      CommissionSetting.findOne({ symbol, isActive: true }),
      SwapSetting.findOne({ symbol, isActive: true }),
      MarginSetting.findOne({ symbol, isActive: true })
    ]);
    // Get default leverage group or any active
    const leverage = await LeverageSetting.findOne({ isActive: true, isDefault: true }) ||
      await LeverageSetting.findOne({ isActive: true });
    // Check for symbol-specific leverage override
    let maxLeverage = leverage?.maxLeverage || 100;
    if (leverage?.symbolOverrides?.length > 0) {
      const override = leverage.symbolOverrides.find(o => o.symbol === symbol);
      if (override) maxLeverage = override.maxLeverage;
    }
    // Get active fees
    const fees = await FeeSetting.find({ isActive: true });

    res.json({
      success: true,
      symbol,
      spread: spread ? {
        type: spread.spreadType,
        pips: spread.spreadPips,
        markup: spread.markupPips,
        totalPips: spread.spreadPips + spread.markupPips,
        min: spread.minSpread,
        max: spread.maxSpread
      } : null,
      commission: commission ? {
        type: commission.commissionType,
        open: commission.openCommission,
        close: commission.closeCommission,
        min: commission.minCommission,
        max: commission.maxCommission,
        currency: commission.currency
      } : null,
      swap: swap ? {
        type: swap.swapType,
        long: swap.swapLong,
        short: swap.swapShort,
        tripleDay: swap.tripleSwapDay,
        swapFree: swap.swapFreeEnabled
      } : null,
      margin: margin ? {
        mode: margin.marginMode,
        initial: margin.initialMarginRate,
        maintenance: margin.maintenanceMarginRate,
        hedged: margin.hedgedMarginRate,
        callLevel: margin.marginCallLevel,
        stopOut: margin.stopOutLevel
      } : null,
      leverage: { max: maxLeverage, group: leverage?.groupName || 'Default' },
      fees: fees.map(f => ({ name: f.feeName, type: f.feeType, charge: f.chargeType, amount: f.amount, rate: f.percentageRate, frequency: f.frequency }))
    });
  } catch (error) {
    console.error('Error fetching charges:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============== MT5-STYLE TRADE EXECUTION ==============

// Helper: Get contract size for a symbol
function getContractSize(symbol) {
  const sym = symbol.toUpperCase();
  if (sym.includes('XAU')) return 100;       // 1 lot gold = 100 oz
  if (sym.includes('XAG')) return 5000;      // 1 lot silver = 5000 oz
  if (sym.includes('BTC')) return 1;          // 1 lot BTC = 1 BTC
  if (sym.includes('ETH')) return 1;          // 1 lot ETH = 1 ETH
  if (sym.includes('SOL') || sym.includes('BNB') || sym.includes('XRP')) return 1;
  if (sym.endsWith('JPY')) return 100000;     // Forex JPY pairs
  if (sym.length <= 7 && /^[A-Z]{6}$/.test(sym)) return 100000; // Forex standard = 100K
  return 1; // Default for crypto / others
}

// Helper: Get pip value for P/L calculation
function getPipValueForPL(symbol) {
  const sym = symbol.toUpperCase();
  if (sym.includes('XAU')) return 0.01;
  if (sym.includes('XAG')) return 0.001;
  if (sym.includes('JPY')) return 0.01;
  return 0.0001;
}

// POST /api/trade/open - Open a new position with MT5 margin check
app.post('/api/trade/open', async (req, res) => {
  try {
    const { userId, symbol, side, volume, leverage, orderType, stopLoss, takeProfit, session, mode: tradeOpenMode } = req.body;

    if (!userId || !symbol || !side || !volume) {
      return res.status(400).json({ error: 'userId, symbol, side, and volume are required' });
    }

    // 1. Get user
    const user = await User.findOne({ oderId: userId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.isActive) return res.status(403).json({ error: 'Account is suspended' });

    // Check if this is a Delta Exchange instrument (crypto futures/options)
    const isDeltaInstrument = deltaExchangeStreaming && deltaExchangeStreaming.isDeltaSymbol(symbol);
    
    // Check if this is an Indian instrument (no "/" in symbol, not a forex pair, not Delta)
    const isIndianInstrument = !isDeltaInstrument && !symbol.includes('/') && !symbol.match(/^[A-Z]{6}$/);
    
    // 2. Get current price
    let entryPrice;
    
    if (isDeltaInstrument) {
      // For Delta Exchange instruments (crypto futures/options)
      const deltaPrice = deltaExchangeStreaming.getPrice(symbol);
      if (deltaPrice) {
        entryPrice = side === 'buy' ? deltaPrice.ask : deltaPrice.bid;
        // Fallback to last/mark price if bid/ask not available
        if (!entryPrice || entryPrice <= 0) {
          entryPrice = deltaPrice.lastPrice || deltaPrice.mark_price || deltaPrice.last;
        }
      }
      console.log(`[Trade] Delta Exchange price for ${symbol}: ${entryPrice}`);
    } else if (isIndianInstrument) {
      // For Indian instruments, get price from Zerodha cache
      const zerodhaPrice = zerodhaService.getPrice(symbol);
      if (zerodhaPrice) {
        entryPrice = zerodhaPrice.lastPrice;
      }
    } else {
      // For Forex/Crypto, try MetaAPI streaming cache first
      if (metaApiStreaming) {
        const cachedPrice = metaApiStreaming.getPrice(symbol);
        if (cachedPrice) {
          entryPrice = side === 'buy' ? cachedPrice.ask : cachedPrice.bid;
        }
      }
      
      // Fallback to MetaAPI REST API if no cached price
      if (!entryPrice || entryPrice <= 0) {
        const METAAPI_ACCOUNT_ID = process.env.METAAPI_ACCOUNT_ID || '';
        const METAAPI_AUTH_TOKEN = process.env.METAAPI_AUTH_TOKEN || '';
        const METAAPI_BASE_URL = process.env.METAAPI_BASE_URL || 'https://mt-client-api-v1.new-york.agiliumtrade.ai';
        
        try {
          const priceRes = await fetch(
            `${METAAPI_BASE_URL}/users/current/accounts/${METAAPI_ACCOUNT_ID}/symbols/${symbol}/current-price`,
            { headers: { 'auth-token': METAAPI_AUTH_TOKEN, 'Content-Type': 'application/json' } }
          );
          const priceData = await priceRes.json();
          entryPrice = side === 'buy' ? priceData.ask : priceData.bid;
        } catch (err) {
          console.warn('MetaAPI price fetch failed, using cached prices only');
        }
      }
    }

    if (!entryPrice || entryPrice <= 0) {
      return res.status(400).json({ error: 'Could not get valid price for ' + symbol });
    }
    
    // Indian segment (NSE/BSE/MCX-style symbols): netting only — ignore requested mode
    if (isIndianInstrument && nettingEngine) {
      try {
        const priceSnapshot = entryPrice;
        const getCurrentPriceCallback = async () => {
          const zp = zerodhaService.getPrice(symbol);
          const lp = zp && (zp.lastPrice > 0 || zp.last_price > 0)
            ? Number(zp.lastPrice || zp.last_price)
            : null;
          return lp != null && lp > 0 ? lp : priceSnapshot;
        };
        const result = await nettingEngine.executeOrder(
          userId,
          {
            symbol,
            side,
            volume: parseFloat(volume),
            price: entryPrice,
            orderType: orderType || 'market',
            session: session || 'intraday',
            leverage: leverage || 100,
            stopLoss,
            takeProfit
          },
          { lastPrice: entryPrice, ltp: entryPrice },
          getCurrentPriceCallback
        );
        
        return res.json({
          success: true,
          position: result.position,
          orderId: result.position?.oderId || result.orderId,
          entryPrice,
          mode: 'netting'
        });
      } catch (nettingErr) {
        return res.status(400).json({ error: nettingErr.message });
      }
    }

    const requestedTradeMode =
      tradeOpenMode === 'netting' || tradeOpenMode === 'hedging' ? tradeOpenMode : 'hedging';

    // Forex / crypto / Delta one-click when UI is in netting mode → NettingEngine (same as POST /api/orders netting)
    if (!isIndianInstrument && requestedTradeMode === 'netting' && nettingEngine) {
      try {
        const priceSnapshot = entryPrice;
        const getCurrentPriceCallback = async () => {
          if (isDeltaInstrument && deltaExchangeStreaming) {
            const dp = deltaExchangeStreaming.getPrice(symbol);
            if (dp) {
              let p = side === 'buy' ? dp.ask : dp.bid;
              if (!p || p <= 0) p = dp.lastPrice || dp.mark_price || dp.last;
              if (p > 0) return Number(p);
            }
          } else if (metaApiStreaming) {
            const pr = metaApiStreaming.getPrice(symbol);
            if (pr && (Number(pr.bid) > 0 || Number(pr.ask) > 0)) {
              return side === 'buy' ? Number(pr.ask) : Number(pr.bid);
            }
          }
          try {
            const METAAPI_ACCOUNT_ID = process.env.METAAPI_ACCOUNT_ID || '';
            const METAAPI_AUTH_TOKEN = process.env.METAAPI_AUTH_TOKEN || '';
            const METAAPI_BASE_URL =
              process.env.METAAPI_BASE_URL || 'https://mt-client-api-v1.new-york.agiliumtrade.ai';
            const priceRes = await fetch(
              `${METAAPI_BASE_URL}/users/current/accounts/${METAAPI_ACCOUNT_ID}/symbols/${encodeURIComponent(symbol)}/current-price`,
              { headers: { 'auth-token': METAAPI_AUTH_TOKEN, 'Content-Type': 'application/json' } }
            );
            if (priceRes.ok) {
              const priceData = await priceRes.json();
              const p = side === 'buy' ? Number(priceData.ask) : Number(priceData.bid);
              if (p > 0) return p;
            }
          } catch (_) {
            /* keep snapshot */
          }
          return priceSnapshot;
        };
        const result = await nettingEngine.executeOrder(
          userId,
          {
            symbol,
            side,
            volume: parseFloat(volume),
            price: entryPrice,
            orderType: orderType || 'market',
            session: session || 'intraday',
            leverage: leverage || 100,
            stopLoss,
            takeProfit,
            isMarketOpen: true
          },
          null,
          getCurrentPriceCallback
        );
        const pos = result.position;
        return res.json({
          success: true,
          position: pos,
          orderId: pos?.oderId || result.orderId,
          entryPrice: pos?.avgPrice ?? pos?.entryPrice ?? entryPrice,
          mode: 'netting'
        });
      } catch (nettingErr) {
        return res.status(400).json({ error: nettingErr.message });
      }
    }

    // 2b. Reorder delay for one-click /trade/open (matches POST /api/orders + HedgingEngine)
    if (hedgingEngine) {
      const segmentName = hedgingEngine.getSegmentNameForInstrument(null, '', '', symbol);
      const baseForReorder = entryPrice;
      const getCurrentPriceCallback = async () => {
        if (isDeltaInstrument && deltaExchangeStreaming) {
          const dp = deltaExchangeStreaming.getPrice(symbol);
          if (dp) {
            let p = side === 'buy' ? dp.ask : dp.bid;
            if (!p || p <= 0) p = dp.lastPrice || dp.mark_price || dp.last;
            if (p > 0) return Number(p);
          }
        } else if (metaApiStreaming) {
          const pr = metaApiStreaming.getPrice(symbol);
          if (pr && (Number(pr.bid) > 0 || Number(pr.ask) > 0)) {
            return side === 'buy' ? Number(pr.ask) : Number(pr.bid);
          }
        }
        try {
          const METAAPI_ACCOUNT_ID = process.env.METAAPI_ACCOUNT_ID || '';
          const METAAPI_AUTH_TOKEN = process.env.METAAPI_AUTH_TOKEN || '';
          const METAAPI_BASE_URL =
            process.env.METAAPI_BASE_URL || 'https://mt-client-api-v1.new-york.agiliumtrade.ai';
          const priceRes = await fetch(
            `${METAAPI_BASE_URL}/users/current/accounts/${METAAPI_ACCOUNT_ID}/symbols/${encodeURIComponent(symbol)}/current-price`,
            { headers: { 'auth-token': METAAPI_AUTH_TOKEN, 'Content-Type': 'application/json' } }
          );
          if (priceRes.ok) {
            const priceData = await priceRes.json();
            const p = side === 'buy' ? Number(priceData.ask) : Number(priceData.bid);
            if (p > 0) return p;
          }
        } catch (_) {
          /* keep snapshot */
        }
        return baseForReorder;
      };
      const userMongoId = user._id ? user._id.toString() : String(userId);
      const reorderOut = await hedgingEngine.applyReorderDelay(
        userMongoId,
        segmentName,
        baseForReorder,
        side,
        getCurrentPriceCallback
      );
      entryPrice = reorderOut.executionPrice;
    }

    // 3. Apply spread from admin settings
    const spreadSetting = await SpreadSetting.findOne({ symbol: symbol.toUpperCase(), isActive: true });
    if (spreadSetting) {
      const pipSize = getPipValueForPL(symbol);
      const totalSpread = (spreadSetting.spreadPips + spreadSetting.markupPips) * pipSize;
      if (side === 'buy') {
        entryPrice += totalSpread / 2;  // Widen ask up
      } else {
        entryPrice -= totalSpread / 2;  // Widen bid down
      }
      entryPrice = parseFloat(entryPrice.toFixed(6));
    }

    // 4. Look up leverage setting from admin (override user's requested leverage)
    const leverageSetting = await LeverageSetting.findOne({ isActive: true, isDefault: true }) ||
      await LeverageSetting.findOne({ isActive: true });
    let maxLeverage = leverageSetting?.maxLeverage || 100;
    if (leverageSetting?.symbolOverrides?.length > 0) {
      const override = leverageSetting.symbolOverrides.find(o => o.symbol === symbol.toUpperCase());
      if (override) maxLeverage = override.maxLeverage;
    }
    const useLeverage = Math.min(leverage || user.leverage || 100, maxLeverage);

    // 5. Calculate margin required (MT5 formula)
    const contractSize = getContractSize(symbol);
    const notionalValue = volume * contractSize * entryPrice;
    const marginRequired = notionalValue / useLeverage;

    // 6. Look up commission from admin settings
    let commissionAmount = 0;
    const commSetting = await CommissionSetting.findOne({ symbol: symbol.toUpperCase(), isActive: true });
    if (commSetting) {
      if (commSetting.commissionType === 'per-lot') {
        commissionAmount = (commSetting.openCommission + commSetting.closeCommission) * volume;
      } else if (commSetting.commissionType === 'per-trade') {
        commissionAmount = commSetting.openCommission + commSetting.closeCommission;
      } else if (commSetting.commissionType === 'percentage') {
        commissionAmount = (commSetting.openCommission / 100) * notionalValue;
      }
      if (commSetting.minCommission > 0 && commissionAmount < commSetting.minCommission) {
        commissionAmount = commSetting.minCommission;
      }
      if (commSetting.maxCommission > 0 && commissionAmount > commSetting.maxCommission) {
        commissionAmount = commSetting.maxCommission;
      }
      commissionAmount = parseFloat(commissionAmount.toFixed(2));
    }

    // 7. Check margin + commission against free margin
    const totalRequired = marginRequired + commissionAmount;

    // Recalculate unrealized P/L for accurate equity
    const openPositions = await HedgingPosition.find({ userId, status: 'open' });
    let unrealizedPnL = 0;
    for (const pos of openPositions) {
      unrealizedPnL += pos.profit || 0;
    }
    user.updateEquity(unrealizedPnL);

    if (!user.hasSufficientMargin(totalRequired)) {
      return res.status(400).json({
        error: 'Insufficient margin',
        details: {
          freeMargin: parseFloat(user.wallet.freeMargin.toFixed(2)),
          marginRequired: parseFloat(marginRequired.toFixed(2)),
          commission: commissionAmount,
          totalRequired: parseFloat(totalRequired.toFixed(2))
        }
      });
    }

    // 8. Check margin level after trade (MT5: reject if would drop below margin call level)
    const marginSetting = await MarginSetting.findOne({ symbol: symbol.toUpperCase(), isActive: true });
    const marginCallLevel = marginSetting?.marginCallLevel || 100; // Default 100%
    const newTotalMargin = user.wallet.margin + marginRequired;
    const newMarginLevel = newTotalMargin > 0 ? (user.wallet.equity / newTotalMargin) * 100 : 0;
    if (newTotalMargin > 0 && newMarginLevel < marginCallLevel) {
      return res.status(400).json({
        error: `Trade would trigger margin call (level would be ${newMarginLevel.toFixed(1)}%, minimum ${marginCallLevel}%)`,
        details: { currentMarginLevel: user.wallet.marginLevel, projectedMarginLevel: newMarginLevel }
      });
    }

    // 9. Deduct commission from balance & lock margin
    user.wallet.balance -= commissionAmount;
    user.useMargin(marginRequired);
    await user.save();

    // 10. Create position in DB
    const orderId = `ORD${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const position = new HedgingPosition({
      oderId: orderId,
      userId,
      symbol: symbol.toUpperCase(),
      side,
      volume,
      entryPrice,
      currentPrice: entryPrice,
      stopLoss: stopLoss || null,
      takeProfit: takeProfit || null,
      leverage: useLeverage,
      marginUsed: parseFloat(marginRequired.toFixed(2)),
      commission: commissionAmount,
      swap: 0,
      profit: 0,
      orderType: orderType || 'market',
      status: 'open',
      openTime: new Date()
    });
    await position.save();

    // 11. MetaAPI trade mirroring disabled - using MetaAPI only for price feed
    // Trades are handled locally in database only
    // try {
    //   const actionType = side === 'buy' ? 'ORDER_TYPE_BUY' : 'ORDER_TYPE_SELL';
    //   const metaRes = await fetch(
    //     `${METAAPI_BASE_URL}/users/current/accounts/${METAAPI_ACCOUNT_ID}/trade`,
    //     {
    //       method: 'POST',
    //       headers: { 'auth-token': METAAPI_AUTH_TOKEN, 'Content-Type': 'application/json' },
    //       body: JSON.stringify({ symbol, actionType, volume, comment: `SetupFX ${orderId}` })
    //     }
    //   );
    //   const metaData = await metaRes.json();
    //   if (metaData.positionId) {
    //     position.metaApiPositionId = metaData.positionId;
    //     await position.save();
    //   }
    // } catch (metaErr) {
    //   console.warn('MetaAPI mirror trade failed (position still saved locally):', metaErr.message);
    // }

    // Log trade open activity
    const tradeUserAgent = req.get('User-Agent') || '';
    await UserActivityLog.logActivity({
      userId: user._id.toString(),
      oderId: userId,
      activityType: 'trade_open',
      description: `Opened ${side.toUpperCase()} position: ${volume} lot(s) ${symbol} @ ${entryPrice}`,
      metadata: { positionId: position._id, orderId, symbol, side, volume, entryPrice, leverage: useLeverage },
      ipAddress: req.ip,
      userAgent: tradeUserAgent,
      device: tradeUserAgent.includes('Mobile') ? 'mobile' : 'desktop',
      os: parseOS(tradeUserAgent),
      browser: parseBrowser(tradeUserAgent),
      status: 'success'
    });

    res.json({
      success: true,
      position: {
        id: position._id,
        orderId,
        symbol: position.symbol,
        side, volume,
        entryPrice: position.entryPrice,
        leverage: useLeverage,
        marginUsed: position.marginUsed,
        commission: position.commission,
        status: 'open'
      },
      wallet: {
        balance: parseFloat(user.wallet.balance.toFixed(2)),
        equity: parseFloat(user.wallet.equity.toFixed(2)),
        margin: parseFloat(user.wallet.margin.toFixed(2)),
        freeMargin: parseFloat(user.wallet.freeMargin.toFixed(2)),
        marginLevel: parseFloat(user.wallet.marginLevel.toFixed(2))
      }
    });

  } catch (error) {
    console.error('Trade open error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/trade/close - Close a position with P/L settlement
app.post('/api/trade/close', async (req, res) => {
  try {
    const { userId, positionId } = req.body;

    if (!userId || !positionId) {
      return res.status(400).json({ error: 'userId and positionId are required' });
    }

    // 1. Find position - try by _id first, then by oderId
    let position;
    const mongoose = require('mongoose');
    if (mongoose.Types.ObjectId.isValid(positionId)) {
      position = await HedgingPosition.findOne({ _id: positionId, userId, status: 'open' });
    }
    if (!position) {
      // Try finding by oderId (HED-* format)
      position = await HedgingPosition.findOne({ oderId: positionId, userId, status: 'open' });
    }
    if (!position) return res.status(404).json({ error: 'Open position not found' });

    // 2. Get current price
    const METAAPI_ACCOUNT_ID = process.env.METAAPI_ACCOUNT_ID || '';
    const METAAPI_AUTH_TOKEN = process.env.METAAPI_AUTH_TOKEN || '';
    const METAAPI_BASE_URL = process.env.METAAPI_BASE_URL || 'https://mt-client-api-v1.new-york.agiliumtrade.ai';

    let closePrice;
    try {
      const priceRes = await fetch(
        `${METAAPI_BASE_URL}/users/current/accounts/${METAAPI_ACCOUNT_ID}/symbols/${position.symbol}/current-price`,
        { headers: { 'auth-token': METAAPI_AUTH_TOKEN, 'Content-Type': 'application/json' } }
      );
      const priceData = await priceRes.json();
      // Close at opposite price: buy position closes at bid, sell closes at ask
      closePrice = position.side === 'buy' ? priceData.bid : priceData.ask;
    } catch (err) {
      return res.status(500).json({ error: 'Failed to fetch current price' });
    }

    if (!closePrice || closePrice <= 0) {
      return res.status(400).json({ error: 'Could not get valid close price' });
    }

    // Apply spread to close price
    const spreadSetting = await SpreadSetting.findOne({ symbol: position.symbol, isActive: true });
    if (spreadSetting) {
      const pipSize = getPipValueForPL(position.symbol);
      const totalSpread = (spreadSetting.spreadPips + spreadSetting.markupPips) * pipSize;
      if (position.side === 'buy') {
        closePrice -= totalSpread / 2;  // Buy closes at bid (lowered)
      } else {
        closePrice += totalSpread / 2;  // Sell closes at ask (raised)
      }
      closePrice = parseFloat(closePrice.toFixed(6));
    }

    // 3. Calculate P/L
    const contractSize = getContractSize(position.symbol);
    const direction = position.side === 'buy' ? 1 : -1;
    const priceDiff = closePrice - position.entryPrice;
    const pnl = parseFloat((priceDiff * direction * position.volume * contractSize).toFixed(2));

    try {
      await riskManagement.assertTradeHoldAllowed(userId, position.openTime, pnl);
    } catch (holdErr) {
      return res.status(400).json({ error: holdErr.message });
    }

    // 4. Get user and settle
    const user = await User.findOne({ oderId: userId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Release margin
    user.releaseMargin(position.marginUsed);

    // Settle P/L to balance (balance + pnl, can go up or down but reflects real P/L)
    user.settlePnL(pnl);

    // Recalculate equity
    const remainingPositions = await HedgingPosition.find({ userId, status: 'open', _id: { $ne: positionId } });
    let unrealizedPnL = 0;
    for (const pos of remainingPositions) {
      unrealizedPnL += pos.profit || 0;
    }
    user.updateEquity(unrealizedPnL);
    await user.save();

    // 5. Update position
    position.status = 'closed';
    position.closePrice = closePrice;
    position.closeTime = new Date();
    position.profit = pnl;
    position.currentPrice = closePrice;
    await position.save();

    // 6. MetaAPI close disabled - using MetaAPI only for price feed
    // if (position.metaApiPositionId) {
    //   try {
    //     const closeAction = position.side === 'buy' ? 'ORDER_TYPE_SELL' : 'ORDER_TYPE_BUY';
    //     await fetch(
    //       `${METAAPI_BASE_URL}/users/current/accounts/${METAAPI_ACCOUNT_ID}/trade`,
    //       {
    //         method: 'POST',
    //         headers: { 'auth-token': METAAPI_AUTH_TOKEN, 'Content-Type': 'application/json' },
    //         body: JSON.stringify({ symbol: position.symbol, actionType: closeAction, volume: position.volume, comment: `Close ${position.oderId}` })
    //       }
    //     );
    //   } catch (metaErr) {
    //     console.warn('MetaAPI close failed:', metaErr.message);
    //   }
    // }

    // Log trade close activity
    const closeTradeUserAgent = req.get('User-Agent') || '';
    await UserActivityLog.logActivity({
      userId: user._id.toString(),
      oderId: userId,
      activityType: 'trade_close',
      description: `Closed ${position.side.toUpperCase()} position: ${position.volume} lot(s) ${position.symbol} @ ${closePrice} | P/L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`,
      metadata: { positionId: position._id, symbol: position.symbol, side: position.side, volume: position.volume, entryPrice: position.entryPrice, closePrice, pnl },
      ipAddress: req.ip,
      userAgent: closeTradeUserAgent,
      device: closeTradeUserAgent.includes('Mobile') ? 'mobile' : 'desktop',
      os: parseOS(closeTradeUserAgent),
      browser: parseBrowser(closeTradeUserAgent),
      status: 'success'
    });

    res.json({
      success: true,
      closedPosition: {
        id: position._id,
        orderId: position.oderId,
        symbol: position.symbol,
        side: position.side,
        volume: position.volume,
        entryPrice: position.entryPrice,
        closePrice,
        pnl,
        commission: position.commission,
        swap: position.swap
      },
      wallet: {
        balance: parseFloat(user.wallet.balance.toFixed(2)),
        equity: parseFloat(user.wallet.equity.toFixed(2)),
        margin: parseFloat(user.wallet.margin.toFixed(2)),
        freeMargin: parseFloat(user.wallet.freeMargin.toFixed(2)),
        marginLevel: parseFloat(user.wallet.marginLevel.toFixed(2))
      }
    });

  } catch (error) {
    console.error('Trade close error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/trade/positions/:userId - Get open positions + wallet
app.get('/api/trade/positions/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findOne({ oderId: userId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const positions = await HedgingPosition.find({ userId, status: 'open' }).sort({ openTime: -1 });

    // Recalculate unrealized P/L for all positions
    let totalUnrealizedPnL = 0;
    for (const pos of positions) {
      totalUnrealizedPnL += pos.profit || 0;
    }
    user.updateEquity(totalUnrealizedPnL);
    await user.save();

    res.json({
      success: true,
      positions: positions.map(p => ({
        id: p._id,
        orderId: p.oderId,
        symbol: p.symbol,
        side: p.side,
        volume: p.volume,
        entryPrice: p.entryPrice,
        currentPrice: p.currentPrice,
        leverage: p.leverage,
        marginUsed: p.marginUsed,
        commission: p.commission,
        swap: p.swap,
        profit: p.profit,
        stopLoss: p.stopLoss,
        takeProfit: p.takeProfit,
        openTime: p.openTime
      })),
      wallet: {
        balance: parseFloat(user.wallet.balance.toFixed(2)),
        credit: parseFloat(user.wallet.credit.toFixed(2)),
        equity: parseFloat(user.wallet.equity.toFixed(2)),
        margin: parseFloat(user.wallet.margin.toFixed(2)),
        freeMargin: parseFloat(user.wallet.freeMargin.toFixed(2)),
        marginLevel: parseFloat(user.wallet.marginLevel.toFixed(2))
      },
      totalPositions: positions.length,
      totalUnrealizedPnL: parseFloat(totalUnrealizedPnL.toFixed(2))
    });

  } catch (error) {
    console.error('Positions fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/trade/history/:userId - Get closed positions (trade history)
app.get('/api/trade/history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50, page = 1 } = req.query;
    const total = await HedgingPosition.countDocuments({ userId, status: 'closed' });
    const positions = await HedgingPosition.find({ userId, status: 'closed' })
      .sort({ closeTime: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    res.json({
      success: true,
      positions: positions.map(p => ({
        id: p._id, orderId: p.oderId, symbol: p.symbol, side: p.side,
        volume: p.volume, entryPrice: p.entryPrice, closePrice: p.closePrice,
        leverage: p.leverage, commission: p.commission, swap: p.swap,
        profit: p.profit, openTime: p.openTime, closeTime: p.closeTime
      })),
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============== SYMBOL MANAGEMENT ==============

const Symbol = require('./models/Symbol');

// Get all symbols with filters
app.get('/api/admin/symbols', async (req, res) => {
  try {
    const { category, search, isActive } = req.query;
    const query = {};
    
    if (category && category !== 'all') query.category = category;
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (search) {
      query.$or = [
        { symbol: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } }
      ];
    }
    
    const symbols = await Symbol.find(query).sort({ category: 1, symbol: 1 });
    res.json({ success: true, symbols });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single symbol
app.get('/api/admin/symbols/:symbol', async (req, res) => {
  try {
    const symbol = await Symbol.findOne({ symbol: req.params.symbol.toUpperCase() });
    if (!symbol) return res.status(404).json({ success: false, error: 'Symbol not found' });
    res.json({ success: true, symbol });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create/Update symbol
app.post('/api/admin/symbols', async (req, res) => {
  try {
    const { symbol, ...data } = req.body;
    if (!symbol) return res.status(400).json({ success: false, error: 'Symbol is required' });
    
    const updated = await Symbol.findOneAndUpdate(
      { symbol: symbol.toUpperCase() },
      { symbol: symbol.toUpperCase(), ...data },
      { upsert: true, new: true }
    );
    res.json({ success: true, symbol: updated, message: 'Symbol saved successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update symbol settings
app.put('/api/admin/symbols/:symbol', async (req, res) => {
  try {
    const symbol = await Symbol.findOneAndUpdate(
      { symbol: req.params.symbol.toUpperCase() },
      req.body,
      { new: true }
    );
    if (!symbol) return res.status(404).json({ success: false, error: 'Symbol not found' });
    res.json({ success: true, symbol, message: 'Symbol updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete symbol
app.delete('/api/admin/symbols/:symbol', async (req, res) => {
  try {
    const symbol = await Symbol.findOneAndDelete({ symbol: req.params.symbol.toUpperCase() });
    if (!symbol) return res.status(404).json({ success: false, error: 'Symbol not found' });
    res.json({ success: true, message: 'Symbol deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Sync symbols from MetaAPI
app.post('/api/admin/symbols/sync', async (req, res) => {
  try {
    const METAAPI_ACCOUNT_ID = process.env.METAAPI_ACCOUNT_ID;
    const METAAPI_AUTH_TOKEN = process.env.METAAPI_AUTH_TOKEN;
    const METAAPI_BASE_URL = process.env.METAAPI_BASE_URL || 'https://mt-client-api-v1.new-york.agiliumtrade.ai';
    
    if (!METAAPI_ACCOUNT_ID || !METAAPI_AUTH_TOKEN) {
      return res.status(400).json({ success: false, error: 'MetaAPI credentials not configured' });
    }
    
    // Fetch symbols from MetaAPI
    const response = await fetch(
      `${METAAPI_BASE_URL}/users/current/accounts/${METAAPI_ACCOUNT_ID}/symbols`,
      { headers: { 'auth-token': METAAPI_AUTH_TOKEN } }
    );
    
    if (!response.ok) {
      return res.status(400).json({ success: false, error: 'Failed to fetch symbols from MetaAPI' });
    }
    
    const apiSymbols = await response.json();
    let synced = 0;
    let updated = 0;
    
    for (const apiSym of apiSymbols) {
      const symbolName = apiSym.symbol || apiSym.name;
      if (!symbolName) continue;
      
      // Determine category
      let category = 'other';
      const sym = symbolName.toUpperCase();
      if (sym.includes('XAU') || sym.includes('XAG') || sym.includes('OIL') || sym.includes('BRENT') || sym.includes('GAS')) {
        category = 'commodities';
      } else if (sym.includes('BTC') || sym.includes('ETH') || sym.includes('LTC') || sym.includes('XRP') || sym.includes('DOGE')) {
        category = 'crypto';
      } else if (sym.includes('US30') || sym.includes('US500') || sym.includes('NAS') || sym.includes('DAX') || sym.includes('FTSE')) {
        category = 'indices';
      } else if (sym.length === 6 && /^[A-Z]{6}$/.test(sym)) {
        category = 'forex';
      } else if (sym.endsWith('USD') || sym.endsWith('EUR') || sym.endsWith('GBP') || sym.endsWith('JPY')) {
        category = 'forex';
      }
      
      // Determine contract size and pip size
      let contractSize = 100000;
      let pipSize = 0.0001;
      let digits = 5;
      
      if (category === 'crypto') {
        contractSize = 1;
        pipSize = 0.01;
        digits = 2;
      } else if (sym.includes('XAU')) {
        contractSize = 100;
        pipSize = 0.01;
        digits = 2;
      } else if (sym.includes('XAG')) {
        contractSize = 5000;
        pipSize = 0.001;
        digits = 3;
      } else if (sym.includes('JPY')) {
        pipSize = 0.01;
        digits = 3;
      }
      
      const existing = await Symbol.findOne({ symbol: symbolName.toUpperCase() });
      
      if (existing) {
        existing.lastSyncAt = new Date();
        existing.syncedFromApi = true;
        existing.externalSymbol = apiSym.symbol;
        if (apiSym.description) existing.description = apiSym.description;
        await existing.save();
        updated++;
      } else {
        await Symbol.create({
          symbol: symbolName.toUpperCase(),
          name: apiSym.description || symbolName,
          description: apiSym.description || '',
          category,
          contractSize,
          pipSize,
          digits,
          externalSymbol: apiSym.symbol,
          syncedFromApi: true,
          lastSyncAt: new Date(),
          isActive: true
        });
        synced++;
      }
    }
    
    res.json({ 
      success: true, 
      message: `Synced ${synced} new symbols, updated ${updated} existing symbols`,
      total: apiSymbols.length,
      synced,
      updated
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Bulk update symbols
app.post('/api/admin/symbols/bulk-update', async (req, res) => {
  try {
    const { symbols, updates } = req.body;
    if (!symbols || !Array.isArray(symbols)) {
      return res.status(400).json({ success: false, error: 'Symbols array required' });
    }
    
    const result = await Symbol.updateMany(
      { symbol: { $in: symbols.map(s => s.toUpperCase()) } },
      updates
    );
    
    res.json({ success: true, message: `Updated ${result.modifiedCount} symbols` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== SEGMENT MANAGEMENT (Indian Market - Netting Mode Only) ==============

// Seed default segments on startup (for all trading modes)
const seedSegments = async () => {
  try {
    // Seed Netting mode segments (all markets: Indian + Forex + Crypto) - uses Segment model
    await Segment.seedDefaultSegments();
    // Seed Hedging mode segments (only Forex + Crypto)
    await HedgingSegment.seedDefaultSegments();
    await ExpirySettings.seedDefaultsIfMissing();
  } catch (error) {
    console.error('Error seeding segments:', error.message);
  }
};
seedSegments();

// Get all segments
app.get('/api/admin/segments', async (req, res) => {
  try {
    const segments = await Segment.find().sort({ marketType: 1, exchange: 1, segmentType: 1 });
    res.json({ success: true, segments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Force re-seed segments (useful if segments are missing)
app.post('/api/admin/segments/reseed', async (req, res) => {
  try {
    await Segment.seedDefaultSegments();
    const segments = await Segment.find().sort({ marketType: 1, exchange: 1, segmentType: 1 });
    res.json({ success: true, message: `Seeded segments. Total: ${segments.length}`, segments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Search instruments from Zerodha for adding to segment (MUST be before /:id route)
app.get('/api/admin/segments/search-instruments', async (req, res) => {
  try {
    const { exchange, search = '', segmentName } = req.query;
    if (!exchange) {
      return res.status(400).json({ success: false, error: 'Exchange required' });
    }

    const exchangeUpper = exchange.toUpperCase();
    const segmentUpper = (segmentName || '').toUpperCase();

    // Full instrument map for all hedging segment types
    const instrumentMap = {
      'FOREX':        ['EURUSD','GBPUSD','USDJPY','USDCHF','AUDUSD','USDCAD','NZDUSD','EURGBP','EURJPY','GBPJPY','AUDCAD','AUDCHF','AUDJPY','AUDNZD','CADCHF','CADJPY','CHFJPY','EURAUD','EURCAD','EURCHF','EURNZD','GBPAUD','GBPCAD','GBPCHF','GBPNZD','NZDCAD','NZDCHF','NZDJPY','USDSGD','USDHKD','USDMXN','USDZAR','USDSEK','USDNOK','USDDKK','USDPLN','USDCZK','USDHUF','USDTRY'],
      'FOREX_MAJOR':  ['EURUSD','GBPUSD','USDJPY','USDCHF','AUDUSD','USDCAD','NZDUSD'],
      'FOREX_MINOR':  ['EURGBP','EURJPY','GBPJPY','AUDCAD','AUDCHF','AUDJPY','AUDNZD','CADCHF','CADJPY','CHFJPY','EURAUD','EURCAD','EURCHF','EURNZD','GBPAUD','GBPCAD','GBPCHF','GBPNZD','NZDCAD','NZDCHF','NZDJPY'],
      'CRYPTO':       ['BTCUSD','ETHUSD','XRPUSD','LTCUSD','BCHUSD','ADAUSD','DOTUSD','LINKUSD','UNIUSD','DOGEUSD','SOLUSD','MATICUSD','AVAXUSD','ATOMUSD','XLMUSD','BNBUSD','SHIBUSD','TRXUSD','NEARUSD','ALGOUSD'],
      'COMMODITIES':  ['XAUUSD','XAGUSD','XPTUSD','XPDUSD','USOIL','UKOIL','BRENT','WTI','NGAS','COPPER','WHEAT','CORN','SUGAR','COFFEE','COTTON'],
      'COMEX':        ['XAUUSD','XAGUSD','XPTUSD','XPDUSD','USOIL','UKOIL','BRENT','WTI','NGAS','COPPER','WHEAT','CORN','SUGAR','COFFEE','COTTON'],
      'INDICES':      ['US30','US100','US500','UK100','DE30','FR40','JP225','AU200','HK50','CHINA50','ES35','IT40','NL25','SG30','IN50'],
      'STOCKS':       ['AAPL','GOOGL','MSFT','AMZN','META','TSLA','NVDA','AMD','NFLX','DIS','BA','JPM','V','MA','PYPL','BABA','TSM','ORCL','CRM','INTC'],
      // Delta Exchange segments (CRYPTO_PERPETUAL and CRYPTO_OPTIONS)
      'CRYPTO_PERPETUAL': null, // handled via Delta streaming below
      'PERPETUAL':        null,
      'DELTA':            null,
      'CRYPTO_OPTIONS':   null,
      'OPTIONS':          null,
    };

    // Determine which instrument list to use
    // Priority: segmentName > exchange
    const isDeltaSegment = ['DELTA','CRYPTO_PERPETUAL','PERPETUAL','CRYPTO_OPTIONS','OPTIONS'].includes(exchangeUpper)
      || ['DELTA','CRYPTO_PERPETUAL','PERPETUAL','CRYPTO_OPTIONS','OPTIONS'].includes(segmentUpper);

    if (isDeltaSegment) {
      // Use live Delta Exchange instruments if available, fall back to hardcoded list
      if (deltaExchangeStreaming) {
        const isPerpetual = ['CRYPTO_PERPETUAL','PERPETUAL'].includes(segmentUpper) || ['CRYPTO_PERPETUAL','PERPETUAL'].includes(exchangeUpper);
        const category = isPerpetual ? 'perpetual_futures' : 'all';
        let instruments = category !== 'all'
          ? deltaExchangeStreaming.getInstrumentsByCategory(category)
          : deltaExchangeStreaming.getAllInstruments();
        if (search) {
          const sl = search.toLowerCase();
          instruments = instruments.filter(i =>
            i.symbol.toLowerCase().includes(sl) ||
            (i.name && i.name.toLowerCase().includes(sl)) ||
            (i.underlying && i.underlying.toLowerCase().includes(sl))
          );
        }
        return res.json({
          success: true,
          instruments: instruments.slice(0, 100).map(i => ({
            symbol: i.symbol, tradingSymbol: i.symbol, name: i.name || i.symbol,
            contract_type: i.contract_type, underlying: i.underlying, exchange: 'DELTA'
          }))
        });
      }
      // Fallback hardcoded Delta perpetuals
      const deltaFallback = [
        'BTCUSDT','ETHUSDT','XRPUSDT','SOLUSDT','BNBUSDT','ADAUSDT','DOGEUSDT',
        'AVAXUSDT','DOTUSDT','MATICUSDT','LINKUSDT','LTCUSDT','ATOMUSDT','NEARUSDT',
        'UNIUSDT','XLMUSDT','ALGOUSDT','VETUSDT','FTMUSDT','SANDUSDT','MANAUSDT',
        'BTCUSD','ETHUSD','XRPUSD','SOLUSD','BNBUSD'
      ];
      const sl = (search || '').toLowerCase();
      const filtered = deltaFallback
        .filter(s => !sl || s.toLowerCase().includes(sl))
        .map(s => ({ symbol: s, tradingSymbol: s, name: s, exchange: 'DELTA' }));
      return res.json({ success: true, instruments: filtered });
    }

    const knownSegments = Object.keys(instrumentMap).filter(k => instrumentMap[k] !== null);
    const segmentKey = knownSegments.includes(segmentUpper) ? segmentUpper
      : knownSegments.includes(exchangeUpper) ? exchangeUpper
      : null;

    if (segmentKey) {
      const availableInstruments = instrumentMap[segmentKey];
      const searchLower = (search || '').toLowerCase();
      const filtered = availableInstruments
        .filter(symbol => !searchLower || symbol.toLowerCase().includes(searchLower))
        .slice(0, 100)
        .map(symbol => ({
          symbol,
          tradingSymbol: symbol,
          tradingsymbol: symbol,
          name: symbol,
          lotSize: symbol.includes('BTC') || symbol.includes('ETH') ? 1 : (symbol.includes('XAU') ? 100 : 100000),
          exchange: segmentKey
        }));
        
      if (search && search.length >= 2) {
        const searchUpper = search.toUpperCase();
        const prefixCount = availableInstruments.filter(sym => sym.toUpperCase().startsWith(searchUpper)).length;
        if (prefixCount > 0) {
          filtered.unshift({
            symbol: searchUpper,
            tradingSymbol: searchUpper,
            tradingsymbol: searchUpper,
            name: `${searchUpper} (Base Prefix) - Applies to ~${prefixCount} active scripts`,
            lotSize: searchUpper.includes('BTC') || searchUpper.includes('ETH') ? 1 : 100000,
            exchange: segmentKey
          });
        }
      }
        
      return res.json({ success: true, instruments: filtered });
    }
    
    // Use exchange directly if it's a Zerodha exchange code (NSE, NFO, BFO, MCX)
    // Otherwise map segment name to Zerodha exchange
    const zerodhaExchanges = ['NSE', 'NFO', 'BFO', 'MCX', 'BSE'];
    let zerodhaExchange = exchangeUpper;
    
    if (!zerodhaExchanges.includes(zerodhaExchange)) {
      // Map segment name to Zerodha exchange
      const exchangeMap = {
        'NSE_EQ': 'NSE',
        'NSE_FUT': 'NFO',
        'NSE_OPT': 'NFO',
        'BSE_FUT': 'BFO',
        'BSE_OPT': 'BFO',
        'MCX_FUT': 'MCX',
        'MCX_OPT': 'MCX'
      };
      zerodhaExchange = exchangeMap[exchangeUpper];
    }
    
    if (!zerodhaExchange) {
      return res.status(400).json({ success: false, error: 'Invalid exchange' });
    }
    
    // Filter by instrument type based on segment name
    const filterSegment = segmentName || exchange;
    const instrumentTypeFilter = {
      'NSE_FUT': 'FUT',
      'NSE_OPT': ['CE', 'PE'],
      'BSE_FUT': 'FUT',
      'BSE_OPT': ['CE', 'PE'],
      'MCX_FUT': 'FUT',
      'MCX_OPT': ['CE', 'PE']
    };
    
    const typeFilter = instrumentTypeFilter[filterSegment.toUpperCase()];
    
    // Fetch instruments from Zerodha
    const allInstruments = await zerodhaService.getInstruments(zerodhaExchange);
    if (!allInstruments || allInstruments.length === 0) {
      return res.json({ success: true, instruments: [] });
    }
    
    // Filter by search term and instrument type
    const searchLower = search.toLowerCase();
    let working = allInstruments.filter(inst => {
      // Match search term
      const matchesSearch = inst.tradingsymbol?.toLowerCase().includes(searchLower) ||
        inst.name?.toLowerCase().includes(searchLower);

      if (!matchesSearch) return false;

      // Filter by instrument type if specified
      if (typeFilter) {
        const instType = inst.instrumentType || inst.instrument_type;
        if (Array.isArray(typeFilter)) {
          return typeFilter.includes(instType);
        }
        return instType === typeFilter;
      }

      return true;
    });

    const nowInstruments = new Date();
    working = working.filter(inst => {
      if (!inst.expiry) return true;
      return new Date(inst.expiry) > nowInstruments;
    });

    let expiryKey = mapAdminSegmentToExpirySettingsKey(filterSegment);
    if (!expiryKey) {
      expiryKey = inferExpiryKeyFromExchangeAndType(zerodhaExchange, typeFilter);
    }
    if (expiryKey) {
      working = await filterZerodhaInstrumentsByExpirySettings(working, expiryKey);
    }

    const filtered = working
      .slice(0, 50)
      .map(inst => {
        // Format expiry date if available
        let expiryStr = '';
        if (inst.expiry) {
          const expDate = new Date(inst.expiry);
          expiryStr = expDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        }
        
        // Zerodha uses 'tradingsymbol' (lowercase) - handle both cases
        const tradingSymbol = inst.tradingsymbol || inst.trading_symbol || inst.symbol || '';
        
        return {
          symbol: tradingSymbol,
          tradingSymbol: tradingSymbol,
          name: inst.name || '',
          instrumentToken: inst.instrument_token || inst.instrumentToken,
          lotSize: inst.lot_size || inst.lotSize || 1,
          exchange: inst.exchange,
          instrumentType: inst.instrument_type || inst.instrumentType,
          expiry: expiryStr,
          strike: inst.strike,
          segment: inst.segment
        };
      });
      
    if (search && search.length >= 2) {
      const searchUpper = search.toUpperCase();
      const prefixCount = working.filter(inst => {
        const symbol = inst.tradingsymbol || inst.trading_symbol || inst.symbol || '';
        return symbol.toUpperCase().startsWith(searchUpper);
      }).length;

      if (prefixCount > 0) {
        filtered.unshift({
          symbol: searchUpper,
          tradingSymbol: searchUpper,
          name: `${searchUpper} (Base Prefix) - Applies to ~${prefixCount} active scripts`,
          lotSize: 1,
          exchange: zerodhaExchange
        });
      }
    }
    
    res.json({ success: true, instruments: filtered });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single segment
app.get('/api/admin/segments/:id', async (req, res) => {
  try {
    const segment = await Segment.findById(req.params.id);
    if (!segment) return res.status(404).json({ success: false, error: 'Segment not found' });
    res.json({ success: true, segment });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update segment settings
app.put('/api/admin/segments/:id', async (req, res) => {
  try {
    const {
      // Lot Settings
      limitType, maxValue, maxLots, minLots, orderLots,
      // Brokerage Settings
      commissionType, commission, exposureIntraday, exposureCarryForward,
      // Qty Settings
      maxQtyHolding, perOrderQty,
      // Fixed Margin Settings
      intradayHolding, overnightHolding, optionBuyIntraday, optionBuyOvernight, optionSellIntraday, optionSellOvernight,
      // Options Settings
      buyingStrikeFar, sellingStrikeFar,
      buyingStrikeFarPercent, sellingStrikeFarPercent,
      // Limit away (netting)
      limitAwayPoints,
      limitAwayPercent,
      // Spread Settings
      spreadType, spreadPips, markupPips,
      // Commission Settings (open/close)
      openCommission, closeCommission,
      // Swap Settings
      swapType, swapLong, swapShort, tripleSwapDay,
      // Margin/Leverage Settings
      maxLeverage, defaultLeverage, fixedLeverage, leverageOptions, marginMode, marginRate, hedgedMarginRate,
      // Contract Specs
      contractSize, digits, pipSize, pipValue, lotStep,
      // Block Settings
      isActive, tradingEnabled, blockOptions, blockFractionLot, allowOvernight
    } = req.body;
    
    const segment = await Segment.findByIdAndUpdate(
      req.params.id,
      {
        limitType, maxValue, maxLots, minLots, orderLots,
        commissionType, commission, exposureIntraday, exposureCarryForward,
        maxQtyHolding, perOrderQty,
        intradayHolding, overnightHolding, optionBuyIntraday, optionBuyOvernight, optionSellIntraday, optionSellOvernight,
        buyingStrikeFar, sellingStrikeFar,
        buyingStrikeFarPercent, sellingStrikeFarPercent,
        limitAwayPoints,
        limitAwayPercent,
        spreadType, spreadPips, markupPips,
        openCommission, closeCommission,
        swapType, swapLong, swapShort, tripleSwapDay,
        maxLeverage, defaultLeverage, fixedLeverage, leverageOptions, marginMode, marginRate, hedgedMarginRate,
        contractSize, digits, pipSize, pipValue, lotStep,
        isActive, tradingEnabled, blockOptions, blockFractionLot, allowOvernight,
        updatedAt: Date.now()
      },
      { new: true }
    );
    
    if (!segment) return res.status(404).json({ success: false, error: 'Segment not found' });

    // Netting mode reads NettingSegment for lot/risk fields; main admin UI only updates Segment.
    // Keep the parallel NettingSegment row in sync so minLots / maxLots / etc. apply on the client.
    try {
      const NettingSegment = require('./models/NettingSegment');
      const syncKeys = [
        'limitType', 'maxValue', 'maxExchangeLots', 'maxLots', 'minLots', 'orderLots',
        'commissionType', 'commission', 'openCommission', 'closeCommission',
        'exposureIntraday', 'exposureCarryForward',
        'maxQtyHolding', 'perOrderQty',
        'intradayHolding', 'overnightHolding',
        'optionBuyIntraday', 'optionBuyOvernight', 'optionSellIntraday', 'optionSellOvernight',
        'buyingStrikeFar', 'sellingStrikeFar',
        'buyingStrikeFarPercent', 'sellingStrikeFarPercent',
        'limitAwayPoints', 'limitAwayPercent',
        'isActive', 'tradingEnabled', 'blockOptions', 'blockFractionLot',
        'ledgerBalanceClose', 'profitTradeHoldMinSeconds', 'lossTradeHoldMinSeconds',
        'blockLimitAboveBelowHighLow', 'blockLimitBetweenHighLow', 'exitOnlyMode', 'allowOvernight'
      ];
      const $set = { updatedAt: Date.now() };
      for (const k of syncKeys) {
        if (segment[k] !== undefined) $set[k] = segment[k];
      }
      await NettingSegment.findOneAndUpdate({ name: segment.name }, { $set });
    } catch (syncErr) {
      console.error('[admin/segments] NettingSegment sync failed:', segment.name, syncErr.message);
    }

    res.json({ success: true, segment, message: 'Segment settings updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== HEDGING MODE SEGMENT MANAGEMENT ==============

// Get all Hedging segments
app.get('/api/admin/hedging/segments', async (req, res) => {
  try {
    const segments = await HedgingSegment.find().sort({ exchange: 1, segmentType: 1 });
    res.json({ success: true, segments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single Hedging segment
app.get('/api/admin/hedging/segments/:id', async (req, res) => {
  try {
    const segment = await HedgingSegment.findById(req.params.id);
    if (!segment) return res.status(404).json({ success: false, error: 'Hedging segment not found' });
    res.json({ success: true, segment });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update Hedging segment settings
app.put('/api/admin/hedging/segments/:id', async (req, res) => {
  try {
    const updateData = { ...req.body, updatedAt: Date.now() };
    delete updateData._id;
    delete updateData.name;
    delete updateData.displayName;
    delete updateData.exchange;
    delete updateData.segmentType;
    delete updateData.marketType;
    
    const segment = await HedgingSegment.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!segment) return res.status(404).json({ success: false, error: 'Hedging segment not found' });
    res.json({ success: true, segment, message: 'Hedging segment settings updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Reseed Hedging segments
app.post('/api/admin/hedging/segments/reseed', async (req, res) => {
  try {
    await HedgingSegment.seedDefaultSegments();
    const segments = await HedgingSegment.find().sort({ exchange: 1, segmentType: 1 });
    res.json({ success: true, message: `Seeded Hedging segments. Total: ${segments.length}`, segments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== NETTING SEGMENT SETTINGS API ==============

// Get all Netting segments
app.get('/api/admin/netting-segments', async (req, res) => {
  try {
    const NettingSegment = require('./models/NettingSegment');
    // Ensure segments are seeded
    await NettingSegment.seedDefaultSegments();
    const segments = await NettingSegment.find().sort({ name: 1 });
    res.json({ success: true, segments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single Netting segment
app.get('/api/admin/netting-segments/:id', async (req, res) => {
  try {
    const NettingSegment = require('./models/NettingSegment');
    const segment = await NettingSegment.findById(req.params.id);
    if (!segment) return res.status(404).json({ success: false, error: 'Netting segment not found' });
    res.json({ success: true, segment });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update Netting segment settings
app.put('/api/admin/netting-segments/:id', async (req, res) => {
  try {
    const NettingSegment = require('./models/NettingSegment');
    const updateData = { ...req.body, updatedAt: Date.now() };
    // Don't allow changing immutable fields
    delete updateData._id;
    delete updateData.name;
    delete updateData.displayName;
    delete updateData.exchange;
    delete updateData.segmentType;
    delete updateData.marketType;
    
    const segment = await NettingSegment.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!segment) return res.status(404).json({ success: false, error: 'Netting segment not found' });
    res.json({ success: true, segment, message: 'Netting segment settings updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Reseed Netting segments
app.post('/api/admin/netting-segments/reseed', async (req, res) => {
  try {
    const NettingSegment = require('./models/NettingSegment');
    await NettingSegment.seedDefaultSegments();
    const segments = await NettingSegment.find().sort({ name: 1 });
    res.json({ success: true, message: `Seeded Netting segments. Total: ${segments.length}`, segments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get Netting script overrides
app.get('/api/admin/netting-scripts', async (req, res) => {
  try {
    const NettingScriptOverride = require('./models/NettingScriptOverride');
    const { search, segment, allSegments, page = 1, limit = 100 } = req.query;

    const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    const query = {};
    const searchTrim = search != null ? String(search).trim() : '';
    if (searchTrim) {
      query.symbol = { $regex: escapeRegExp(searchTrim), $options: 'i' };
    }
    const searchAll = allSegments === '1' || allSegments === 'true';
    if (segment && !(searchTrim && searchAll)) {
      const NettingSegment = require('./models/NettingSegment');
      const segDoc = await NettingSegment.findOne({ name: segment });
      if (segDoc) {
        query.segmentId = segDoc._id;
      }
    }
    
    const scripts = await NettingScriptOverride.find(query)
      .populate('segmentId', 'name displayName')
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .sort({ symbol: 1 });
    
    const total = await NettingScriptOverride.countDocuments(query);
    
    res.json({
      success: true,
      scripts: scripts.map(s => ({
        ...s.toObject(),
        segmentName: s.segmentId?.displayName || s.segmentId?.name,
        segment: s.segmentId?.name
      })),
      pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create/Update Netting script override
app.post('/api/admin/netting-scripts', async (req, res) => {
  try {
    const NettingScriptOverride = require('./models/NettingScriptOverride');
    const NettingSegment = require('./models/NettingSegment');
    const { symbol, segmentId, ...settings } = req.body;
    delete settings.maxExchangeLots;

    if (!symbol || !segmentId) {
      return res.status(400).json({ success: false, error: 'Symbol and segmentId are required' });
    }

    const segment = await NettingSegment.findById(segmentId);
    if (!segment) {
      return res.status(400).json({ success: false, error: 'Invalid segmentId' });
    }

    const normSymbol = String(symbol).trim().toUpperCase();
    const segmentLabel = segment.displayName || segment.name;

    const script = await NettingScriptOverride.findOneAndUpdate(
      { symbol: normSymbol, segmentId },
      {
        $set: {
          symbol: normSymbol,
          segmentId,
          segmentName: segmentLabel,
          tradingSymbol: normSymbol,
          ...settings,
          updatedAt: Date.now()
        }
      },
      { upsert: true, new: true }
    );
    
    res.json({ success: true, script, message: 'Script override saved' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update Netting script override
app.put('/api/admin/netting-scripts/:id', async (req, res) => {
  try {
    const NettingScriptOverride = require('./models/NettingScriptOverride');
    const updateData = { ...req.body, updatedAt: Date.now() };
    delete updateData._id;
    delete updateData.maxExchangeLots;

    const script = await NettingScriptOverride.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!script) return res.status(404).json({ success: false, error: 'Script override not found' });
    res.json({ success: true, script, message: 'Script override updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete Netting script override
app.delete('/api/admin/netting-scripts/:id', async (req, res) => {
  try {
    const NettingScriptOverride = require('./models/NettingScriptOverride');
    const script = await NettingScriptOverride.findByIdAndDelete(req.params.id);
    if (!script) return res.status(404).json({ success: false, error: 'Script override not found' });
    res.json({ success: true, message: 'Script override deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Copy netting segment settings from one user to others
app.post('/api/admin/user-segment-settings/copy', async (req, res) => {
  try {
    const UserSegmentSettings = require('./models/UserSegmentSettings');
    const { sourceUserId, targetUserIds, tradeMode = 'netting' } = req.body;
    
    if (!sourceUserId || !targetUserIds || targetUserIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Source user and target users are required' });
    }
    
    // Get source user's settings — netting includes null-mode (legacy) rows, hedging is strict
    const sourceModeQuery = tradeMode === 'hedging'
      ? { tradeMode: 'hedging' }
      : { $or: [{ tradeMode: null }, { tradeMode: { $exists: false } }, { tradeMode: 'netting' }] };
    const sourceSettings = await UserSegmentSettings.find({ userId: sourceUserId, ...sourceModeQuery }).lean();
    
    if (sourceSettings.length === 0) {
      return res.status(404).json({ success: false, error: 'No settings found for source user' });
    }
    
    let copiedCount = 0;
    for (const targetUserId of targetUserIds) {
      for (const setting of sourceSettings) {
        const { _id, userId, createdAt, updatedAt, ...settingData } = setting;
        await UserSegmentSettings.findOneAndUpdate(
          { userId: targetUserId, segmentId: setting.segmentId, tradeMode },
          { $set: { ...settingData, userId: targetUserId, updatedAt: Date.now() } },
          { upsert: true }
        );
        copiedCount++;
      }
    }
    
    res.json({ success: true, message: `Copied ${copiedCount} settings to ${targetUserIds.length} user(s)` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Verify segment settings separation: hedging uses HedgingSegment, netting uses Segment (no mix-up)
app.get('/api/admin/segment-settings-verify', async (req, res) => {
  try {
    const { segmentName = 'FOREX' } = req.query;
    const hedgingDoc = await HedgingSegment.findOne({ name: segmentName }).lean();
    const segmentDoc = await Segment.findOne({ name: segmentName }).lean();
    res.json({
      success: true,
      segmentName,
      hedging: {
        source: 'HedgingSegment',
        usedBy: 'HedgingEngine (hedging mode trades)',
        found: !!hedgingDoc,
        ...(hedgingDoc && {
          contractSize: hedgingDoc.contractSize,
          digits: hedgingDoc.digits,
          pipSize: hedgingDoc.pipSize,
          pipValue: hedgingDoc.pipValue,
          lotStep: hedgingDoc.lotStep,
          maxLots: hedgingDoc.maxLots,
          minLots: hedgingDoc.minLots,
          maxPositionsPerSymbol: hedgingDoc.maxPositionsPerSymbol,
          maxTotalPositions: hedgingDoc.maxTotalPositions,
          marginMode: hedgingDoc.marginMode,
          marginRate: hedgingDoc.marginRate,
          hedgedMarginRate: hedgingDoc.hedgedMarginRate,
          spreadType: hedgingDoc.spreadType,
          spreadPips: hedgingDoc.spreadPips,
          markupPips: hedgingDoc.markupPips,
          openCommission: hedgingDoc.openCommission,
          closeCommission: hedgingDoc.closeCommission,
          commissionType: hedgingDoc.commissionType,
          swapType: hedgingDoc.swapType,
          swapLong: hedgingDoc.swapLong,
          swapShort: hedgingDoc.swapShort,
          tripleSwapDay: hedgingDoc.tripleSwapDay,
          limitType: hedgingDoc.limitType,
          maxValue: hedgingDoc.maxValue,
          isActive: hedgingDoc.isActive,
          tradingEnabled: hedgingDoc.tradingEnabled
        })
      },
      netting: {
        source: 'Segment',
        usedBy: 'NettingEngine (netting mode / Indian trades)',
        found: !!segmentDoc,
        ...(segmentDoc && {
          maxLots: segmentDoc.maxLots,
          minLots: segmentDoc.minLots,
          limitType: segmentDoc.limitType,
          maxValue: segmentDoc.maxValue,
          isActive: segmentDoc.isActive,
          tradingEnabled: segmentDoc.tradingEnabled
        })
      },
      message: 'Hedging and netting use separate segment collections; changing one does not affect the other.'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== HEDGING SCRIPT OVERRIDE MANAGEMENT ==============

// Get all Hedging script overrides
app.get('/api/admin/hedging/scripts', async (req, res) => {
  try {
    const { segmentId, search, page = 1, limit = 50 } = req.query;
    const query = {};
    if (segmentId) query.segmentId = segmentId;
    if (search) {
      query.$or = [
        { symbol: { $regex: search, $options: 'i' } },
        { tradingSymbol: { $regex: search, $options: 'i' } }
      ];
    }
    
    const total = await HedgingScriptOverride.countDocuments(query);
    const scripts = await HedgingScriptOverride.find(query)
      .sort({ segmentName: 1, symbol: 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    res.json({ success: true, scripts, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create Hedging script override
app.post('/api/admin/hedging/scripts', async (req, res) => {
  try {
    const { symbol, segmentId } = req.body;
    if (!symbol || !segmentId) {
      return res.status(400).json({ success: false, error: 'Symbol and segmentId are required' });
    }
    
    const existing = await HedgingScriptOverride.findOne({ symbol: symbol.toUpperCase(), segmentId });
    if (existing) {
      return res.status(400).json({ success: false, error: 'Script override already exists' });
    }
    
    const segment = await HedgingSegment.findById(segmentId);
    if (!segment) {
      return res.status(404).json({ success: false, error: 'Hedging segment not found' });
    }
    
    const scriptOverride = new HedgingScriptOverride({
      symbol: symbol.toUpperCase(),
      tradingSymbol: symbol.toUpperCase(),
      segmentId,
      segmentName: segment.name,
      isActive: true
    });
    
    await scriptOverride.save();
    res.json({ success: true, script: scriptOverride, message: 'Hedging script override created' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update Hedging script override
app.put('/api/admin/hedging/scripts/:id', async (req, res) => {
  try {
    const updateData = { ...req.body, updatedAt: Date.now() };
    delete updateData._id;
    delete updateData.symbol;
    delete updateData.segmentId;
    delete updateData.segmentName;
    
    const script = await HedgingScriptOverride.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!script) return res.status(404).json({ success: false, error: 'Hedging script override not found' });
    res.json({ success: true, script, message: 'Hedging script override updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete Hedging script override
app.delete('/api/admin/hedging/scripts/:id', async (req, res) => {
  try {
    const script = await HedgingScriptOverride.findByIdAndDelete(req.params.id);
    if (!script) return res.status(404).json({ success: false, error: 'Hedging script override not found' });
    res.json({ success: true, message: 'Hedging script override deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new script override
app.post('/api/admin/scripts', async (req, res) => {
  try {
    const { symbol, segmentId } = req.body;
    
    console.log('[Create Script] Request body:', JSON.stringify(req.body));

    if (!symbol || !segmentId) {
      return res.status(400).json({ success: false, error: 'Symbol and segmentId are required' });
    }

    // Check if script override already exists
    const existing = await ScriptOverride.findOne({ symbol: symbol.toUpperCase(), segmentId });
    if (existing) {
      return res.status(400).json({ success: false, error: 'Script override already exists for this symbol in this segment' });
    }

    // Get segment info
    const segment = await Segment.findById(segmentId);
    if (!segment) {
      return res.status(404).json({ success: false, error: 'Segment not found' });
    }
    
    console.log('[Create Script] Segment found:', segment.name);

    // Create with only required fields and let defaults handle the rest
    const scriptData = {
      symbol: symbol.toUpperCase(),
      tradingSymbol: symbol.toUpperCase(),
      segmentId,
      segmentName: segment.name || segment.displayName || 'Unknown',
      lotSize: 1,
      isActive: true
    };
    
    console.log('[Create Script] Creating with data:', JSON.stringify(scriptData));

    const scriptOverride = new ScriptOverride(scriptData);
    await scriptOverride.save();
    
    console.log('[Create Script] Success:', scriptOverride._id);
    res.json({ success: true, scriptOverride });
  } catch (error) {
    console.error('[Create Script] Error:', error.message, error.stack);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== GLOBAL RISK SETTINGS ==============

// Get global risk settings
app.get('/api/admin/risk-settings', async (req, res) => {
  try {
    const settings = await RiskSettings.getGlobalSettings();
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update global risk settings
app.put('/api/admin/risk-settings', async (req, res) => {
  try {
    const {
      ledgerBalanceClose,
      profitTradeHoldMinSeconds,
      lossTradeHoldMinSeconds,
      blockLimitAboveBelowHighLow,
      blockLimitBetweenHighLow,
      exitOnlyMode,
      marginCallLevel,
      stopOutLevel
    } = req.body;
    
    let settings = await RiskSettings.findOne({ type: 'global' });
    if (!settings) {
      settings = new RiskSettings({ type: 'global' });
    }
    
    if (ledgerBalanceClose !== undefined) settings.ledgerBalanceClose = ledgerBalanceClose;
    if (profitTradeHoldMinSeconds !== undefined) settings.profitTradeHoldMinSeconds = profitTradeHoldMinSeconds;
    if (lossTradeHoldMinSeconds !== undefined) settings.lossTradeHoldMinSeconds = lossTradeHoldMinSeconds;
    if (blockLimitAboveBelowHighLow !== undefined) settings.blockLimitAboveBelowHighLow = blockLimitAboveBelowHighLow;
    if (blockLimitBetweenHighLow !== undefined) settings.blockLimitBetweenHighLow = blockLimitBetweenHighLow;
    if (exitOnlyMode !== undefined) settings.exitOnlyMode = exitOnlyMode;
    if (marginCallLevel !== undefined) settings.marginCallLevel = marginCallLevel;
    if (stopOutLevel !== undefined) settings.stopOutLevel = stopOutLevel;
    
    await settings.save();
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get user-specific risk settings
app.get('/api/admin/user-risk-settings/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const settings = await UserRiskSettings.findOne({ userId });
    const globalSettings = await RiskSettings.getGlobalSettings();
    res.json({ success: true, settings, globalSettings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update user-specific risk settings
app.post('/api/admin/user-risk-settings', async (req, res) => {
  try {
    const {
      userId,
      oderId,
      ledgerBalanceClose,
      profitTradeHoldMinSeconds,
      lossTradeHoldMinSeconds,
      blockLimitAboveBelowHighLow,
      blockLimitBetweenHighLow,
      exitOnlyMode,
      marginCallLevel,
      stopOutLevel
    } = req.body;
    
    if (!userId || !oderId) {
      return res.status(400).json({ success: false, error: 'userId and oderId required' });
    }
    
    const settings = await UserRiskSettings.findOneAndUpdate(
      { userId },
      {
        userId,
        oderId,
        ledgerBalanceClose: ledgerBalanceClose ?? null,
        profitTradeHoldMinSeconds: profitTradeHoldMinSeconds ?? null,
        lossTradeHoldMinSeconds: lossTradeHoldMinSeconds ?? null,
        blockLimitAboveBelowHighLow: blockLimitAboveBelowHighLow ?? null,
        blockLimitBetweenHighLow: blockLimitBetweenHighLow ?? null,
        exitOnlyMode: exitOnlyMode ?? null,
        marginCallLevel: marginCallLevel ?? null,
        stopOutLevel: stopOutLevel ?? null
      },
      { upsert: true, new: true }
    );
    
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete user-specific risk settings (revert to global)
app.delete('/api/admin/user-risk-settings/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    await UserRiskSettings.deleteOne({ userId });
    res.json({ success: true, message: 'User risk settings deleted, will use global defaults' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get effective risk settings for a user (merged global + user)
app.get('/api/admin/user-risk-settings/:userId/effective', async (req, res) => {
  try {
    const { userId } = req.params;
    const effectiveSettings = await UserRiskSettings.getEffectiveSettings(userId);
    res.json({ success: true, settings: effectiveSettings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== EXPIRY SETTINGS ==============

// Get all expiry settings
app.get('/api/admin/expiry-settings', async (req, res) => {
  try {
    const settings = await ExpirySettings.find().sort({ segmentName: 1 });
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get expiry settings for a segment
app.get('/api/admin/expiry-settings/:segmentName', async (req, res) => {
  try {
    const { segmentName } = req.params;
    const settings = await ExpirySettings.getSettingsForSegment(segmentName);
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update expiry settings for a segment
app.put('/api/admin/expiry-settings/:segmentName', async (req, res) => {
  try {
    const { segmentName } = req.params;
    const { show, openNextBeforeDays, scriptSettings } = req.body;
    
    const settings = await ExpirySettings.findOneAndUpdate(
      { segmentName },
      { 
        segmentName,
        show: show ?? 1,
        openNextBeforeDays: openNextBeforeDays ?? 5,
        scriptSettings: scriptSettings || []
      },
      { upsert: true, new: true }
    );
    
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add script to segment expiry settings
app.post('/api/admin/expiry-settings/:segmentName/scripts', async (req, res) => {
  try {
    const { segmentName } = req.params;
    const { scriptName, show, openNextBeforeDays } = req.body;
    
    if (!scriptName) {
      return res.status(400).json({ success: false, error: 'Script name required' });
    }
    
    let settings = await ExpirySettings.findOne({ segmentName });
    if (!settings) {
      settings = new ExpirySettings({ segmentName });
    }
    
    // Check if script already exists
    const existingIndex = settings.scriptSettings.findIndex(s => s.scriptName === scriptName);
    if (existingIndex >= 0) {
      settings.scriptSettings[existingIndex] = { scriptName, show: show ?? 1, openNextBeforeDays: openNextBeforeDays ?? 5 };
    } else {
      settings.scriptSettings.push({ scriptName, show: show ?? 1, openNextBeforeDays: openNextBeforeDays ?? 5 });
    }
    
    await settings.save();
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Remove script from segment expiry settings
app.delete('/api/admin/expiry-settings/:segmentName/scripts/:scriptName', async (req, res) => {
  try {
    const { segmentName, scriptName } = req.params;
    
    const settings = await ExpirySettings.findOne({ segmentName });
    if (settings) {
      settings.scriptSettings = settings.scriptSettings.filter(s => s.scriptName !== scriptName);
      await settings.save();
    }
    
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all script overrides across all segments
app.get('/api/admin/scripts/all', async (req, res) => {
  try {
    const { search, page = 1, limit = 100 } = req.query;
    
    const query = {};
    if (search) {
      query.symbol = { $regex: search, $options: 'i' };
    }
    
    const total = await ScriptOverride.countDocuments(query);
    const scripts = await ScriptOverride.find(query)
      .populate('segmentId', 'displayName name exchange segmentType marketType')
      .sort({ segmentName: 1, symbol: 1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));
    
    res.json({
      success: true,
      scripts,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get script overrides for a segment
app.get('/api/admin/segments/:segmentId/scripts', async (req, res) => {
  try {
    const { segmentId } = req.params;
    const { search, page = 1, limit = 50 } = req.query;
    
    const query = { segmentId };
    if (search) {
      query.$or = [
        { symbol: { $regex: search, $options: 'i' } },
        { tradingSymbol: { $regex: search, $options: 'i' } }
      ];
    }
    
    const total = await ScriptOverride.countDocuments(query);
    const scripts = await ScriptOverride.find(query)
      .sort({ symbol: 1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    res.json({
      success: true,
      scripts,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add script override
app.post('/api/admin/segments/:segmentId/scripts', async (req, res) => {
  try {
    const { segmentId } = req.params;
    const segment = await Segment.findById(segmentId);
    if (!segment) return res.status(404).json({ success: false, error: 'Segment not found' });
    
    const {
      symbol, tradingSymbol, instrumentToken, lotSize,
      // Lot Settings
      limitType, maxValue, maxLots, minLots, orderLots,
      // Brokerage Settings
      commissionType, commission, exposureIntraday, exposureCarryForward,
      // Qty Settings
      maxQtyHolding, perOrderQty,
      // Fixed Margin Settings
      intradayHolding, overnightHolding, optionBuyIntraday, optionBuyOvernight, optionSellIntraday, optionSellOvernight,
      // Options Settings
      buyingStrikeFar, sellingStrikeFar,
      // Limit Points Settings
      limitAwayPoints,
      spreadType, spreadPips, markupPips,
      openCommission, closeCommission,
      swapType, swapLong, swapShort, tripleSwapDay,
      // Block Settings
      isActive, tradingEnabled, blockOptions, blockFractionLot,
      // Risk
      ledgerBalanceClose, profitTradeHoldMinSeconds, lossTradeHoldMinSeconds,
      blockLimitAboveBelowHighLow, blockLimitBetweenHighLow, exitOnlyMode
    } = req.body;
    
    if (!symbol || !tradingSymbol) {
      return res.status(400).json({ success: false, error: 'Symbol and trading symbol required' });
    }
    
    const scriptOverride = await ScriptOverride.findOneAndUpdate(
      { segmentId, symbol: symbol.toUpperCase() },
      {
        segmentId,
        segmentName: segment.name,
        symbol: symbol.toUpperCase(),
        tradingSymbol,
        instrumentToken,
        lotSize: lotSize || 1,
        limitType, maxValue, maxLots, minLots, orderLots,
        commissionType, commission, exposureIntraday, exposureCarryForward,
        maxQtyHolding, perOrderQty,
        intradayHolding, overnightHolding, optionBuyIntraday, optionBuyOvernight, optionSellIntraday, optionSellOvernight,
        buyingStrikeFar, sellingStrikeFar,
        limitAwayPoints,
        spreadType, spreadPips, markupPips,
        openCommission, closeCommission,
        swapType, swapLong, swapShort, tripleSwapDay,
        isActive: isActive !== false,
        tradingEnabled: tradingEnabled !== false,
        blockOptions, blockFractionLot,
        ledgerBalanceClose, profitTradeHoldMinSeconds, lossTradeHoldMinSeconds,
        blockLimitAboveBelowHighLow, blockLimitBetweenHighLow, exitOnlyMode,
        updatedAt: Date.now()
      },
      { upsert: true, new: true }
    );
    
    res.json({ success: true, scriptOverride, message: 'Script override saved' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update script override
app.put('/api/admin/scripts/:id', async (req, res) => {
  try {
    const {
      lotSize,
      // Lot Settings
      limitType, maxValue, maxLots, minLots, orderLots,
      // Brokerage Settings
      commissionType, commission, exposureIntraday, exposureCarryForward,
      // Qty Settings
      maxQtyHolding, perOrderQty,
      // Fixed Margin Settings
      intradayHolding, overnightHolding, optionBuyIntraday, optionBuyOvernight, optionSellIntraday, optionSellOvernight,
      // Options Settings
      buyingStrikeFar, sellingStrikeFar,
      // Limit Points Settings
      limitAwayPoints,
      spreadType, spreadPips, markupPips,
      openCommission, closeCommission,
      swapType, swapLong, swapShort, tripleSwapDay,
      // Block Settings
      isActive, tradingEnabled, blockOptions, blockFractionLot,
      ledgerBalanceClose, profitTradeHoldMinSeconds, lossTradeHoldMinSeconds,
      blockLimitAboveBelowHighLow, blockLimitBetweenHighLow, exitOnlyMode
    } = req.body;
    
    const scriptOverride = await ScriptOverride.findByIdAndUpdate(
      req.params.id,
      {
        lotSize, limitType, maxValue, maxLots, minLots, orderLots,
        commissionType, commission, exposureIntraday, exposureCarryForward,
        maxQtyHolding, perOrderQty,
        intradayHolding, overnightHolding, optionBuyIntraday, optionBuyOvernight, optionSellIntraday, optionSellOvernight,
        buyingStrikeFar, sellingStrikeFar,
        limitAwayPoints,
        spreadType, spreadPips, markupPips,
        openCommission, closeCommission,
        swapType, swapLong, swapShort, tripleSwapDay,
        isActive, tradingEnabled, blockOptions, blockFractionLot,
        ledgerBalanceClose, profitTradeHoldMinSeconds, lossTradeHoldMinSeconds,
        blockLimitAboveBelowHighLow, blockLimitBetweenHighLow, exitOnlyMode,
        updatedAt: Date.now()
      },
      { new: true }
    );
    
    if (!scriptOverride) return res.status(404).json({ success: false, error: 'Script override not found' });
    res.json({ success: true, scriptOverride, message: 'Script override updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete script override
app.delete('/api/admin/scripts/:id', async (req, res) => {
  try {
    const scriptOverride = await ScriptOverride.findByIdAndDelete(req.params.id);
    if (!scriptOverride) return res.status(404).json({ success: false, error: 'Script override not found' });
    res.json({ success: true, message: 'Script override deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get effective settings for a symbol (merges segment + override)
app.get('/api/admin/scripts/effective/:segmentId/:symbol', async (req, res) => {
  try {
    const { segmentId, symbol } = req.params;
    const effectiveSettings = await ScriptOverride.getEffectiveSettings(segmentId, symbol.toUpperCase());
    res.json({ success: true, settings: effectiveSettings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Sync lot sizes from Zerodha API for Indian instruments
app.post('/api/admin/segments/sync-lot-sizes', async (req, res) => {
  try {
    const { segmentName } = req.body;
    
    // Get Zerodha settings
    const zerodhaSettings = await ZerodhaSettings.findOne({ isActive: true });
    if (!zerodhaSettings) {
      return res.status(400).json({ success: false, error: 'Zerodha not configured' });
    }
    
    // Map segment to Zerodha exchange
    const exchangeMap = {
      'NSE_EQ': 'NSE',
      'NSE_FUT': 'NFO',
      'NSE_OPT': 'NFO',
      'BSE_FUT': 'BFO',
      'BSE_OPT': 'BFO',
      'MCX_FUT': 'MCX',
      'MCX_OPT': 'MCX'
    };
    
    const exchange = exchangeMap[segmentName];
    if (!exchange) {
      return res.status(400).json({ success: false, error: 'Invalid segment' });
    }
    
    // Get segment
    const segment = await Segment.findOne({ name: segmentName });
    if (!segment) {
      return res.status(404).json({ success: false, error: 'Segment not found' });
    }
    
    // Fetch instruments from Zerodha
    const instruments = await zerodhaService.getInstruments(exchange);
    if (!instruments || instruments.length === 0) {
      return res.status(400).json({ success: false, error: 'No instruments found from Zerodha' });
    }
    
    // Update or create script overrides with lot sizes
    let synced = 0;
    for (const inst of instruments) {
      if (inst.lot_size && inst.lot_size > 0) {
        await ScriptOverride.findOneAndUpdate(
          { segmentId: segment._id, symbol: inst.tradingsymbol },
          {
            segmentId: segment._id,
            segmentName: segment.name,
            symbol: inst.tradingsymbol,
            tradingSymbol: inst.tradingsymbol,
            instrumentToken: inst.instrument_token,
            lotSize: inst.lot_size,
            updatedAt: Date.now()
          },
          { upsert: true }
        );
        synced++;
      }
    }
    
    res.json({
      success: true,
      message: `Synced ${synced} instruments from ${exchange}`,
      synced
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== REORDER SETTINGS (Delayed Trade Execution) ==============

// Get reorder settings
app.get('/api/admin/reorder-settings', async (req, res) => {
  try {
    const settings = await ReorderSettings.getSettings();
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update reorder settings
app.put('/api/admin/reorder-settings', async (req, res) => {
  try {
    const { globalDelaySeconds, isEnabled, priceMode, segmentDelays, userDelays } = req.body;
    const settings = await ReorderSettings.getSettings();
    
    if (globalDelaySeconds !== undefined) settings.globalDelaySeconds = globalDelaySeconds;
    if (isEnabled !== undefined) settings.isEnabled = isEnabled;
    if (priceMode !== undefined) settings.priceMode = priceMode;
    if (segmentDelays !== undefined) settings.segmentDelays = segmentDelays;
    if (userDelays !== undefined) settings.userDelays = userDelays;
    
    await settings.save();
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get/Set user-specific delay
app.get('/api/admin/reorder-settings/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const settings = await ReorderSettings.getSettings();
    const userDelay = settings.userDelays.find(u => u.userId?.toString() === userId);
    res.json({ success: true, userDelay: userDelay || null });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/admin/reorder-settings/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { delaySeconds, isEnabled, segmentOverrides } = req.body;
    const settings = await ReorderSettings.getSettings();
    
    const existingIndex = settings.userDelays.findIndex(u => u.userId?.toString() === userId);
    if (existingIndex >= 0) {
      settings.userDelays[existingIndex].delaySeconds = delaySeconds;
      settings.userDelays[existingIndex].isEnabled = isEnabled;
      if (segmentOverrides !== undefined) {
        settings.userDelays[existingIndex].segmentOverrides = segmentOverrides;
      }
    } else {
      settings.userDelays.push({ userId, delaySeconds, isEnabled, segmentOverrides: segmentOverrides || [] });
    }
    
    await settings.save();
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update user-segment specific delay
app.put('/api/admin/reorder-settings/user/:userId/segment/:segmentName', async (req, res) => {
  try {
    const { userId, segmentName } = req.params;
    const { delaySeconds, isEnabled } = req.body;
    const settings = await ReorderSettings.getSettings();
    
    let userIndex = settings.userDelays.findIndex(u => u.userId?.toString() === userId);
    if (userIndex < 0) {
      // Create user entry if doesn't exist
      settings.userDelays.push({ userId, delaySeconds: 0, isEnabled: true, segmentOverrides: [] });
      userIndex = settings.userDelays.length - 1;
    }
    
    const userDelay = settings.userDelays[userIndex];
    if (!userDelay.segmentOverrides) {
      userDelay.segmentOverrides = [];
    }
    
    const segmentIndex = userDelay.segmentOverrides.findIndex(s => s.segmentName === segmentName);
    if (segmentIndex >= 0) {
      userDelay.segmentOverrides[segmentIndex].delaySeconds = delaySeconds;
      userDelay.segmentOverrides[segmentIndex].isEnabled = isEnabled;
    } else {
      userDelay.segmentOverrides.push({ segmentName, delaySeconds, isEnabled });
    }
    
    await settings.save();
    res.json({ success: true, settings, userDelay });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Remove user-segment specific delay
app.delete('/api/admin/reorder-settings/user/:userId/segment/:segmentName', async (req, res) => {
  try {
    const { userId, segmentName } = req.params;
    const settings = await ReorderSettings.getSettings();
    
    const userIndex = settings.userDelays.findIndex(u => u.userId?.toString() === userId);
    if (userIndex >= 0 && settings.userDelays[userIndex].segmentOverrides) {
      settings.userDelays[userIndex].segmentOverrides = 
        settings.userDelays[userIndex].segmentOverrides.filter(s => s.segmentName !== segmentName);
      await settings.save();
    }
    
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Remove user-specific delay
app.delete('/api/admin/reorder-settings/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const settings = await ReorderSettings.getSettings();
    settings.userDelays = settings.userDelays.filter(u => u.userId?.toString() !== userId);
    await settings.save();
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== PNL SHARING (Profit/Loss Sharing between Admin Hierarchy) ==============
const pnlSharingService = require('./services/pnlSharing.service');
const { PnlSharingSettings, PnlDistributionLog } = require('./models/PnlSharing');

// Get PnL sharing settings for an admin (Super Admin can view all, others can view own)
app.get('/api/admin/pnl-sharing/settings/:adminOderId', async (req, res) => {
  try {
    const { adminOderId } = req.params;
    const settings = await pnlSharingService.getSettings(adminOderId);
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update PnL sharing settings for an admin (Super Admin or parent can update)
app.put('/api/admin/pnl-sharing/settings/:adminOderId', async (req, res) => {
  try {
    const { adminOderId } = req.params;
    const { configuredByOderId, lossSharePercent, profitSharePercent, segmentOverrides, settlementMode } = req.body;
    
    if (!configuredByOderId) {
      return res.status(400).json({ success: false, error: 'configuredByOderId is required' });
    }
    
    // Verify the configurer has permission (super_admin or parent of target admin)
    // Check Admin model first, then User model for super admin
    let configurer = await Admin.findOne({ oderId: configuredByOderId });
    const target = await Admin.findOne({ oderId: adminOderId });
    
    // If not found in Admin model, check User model (for super admin)
    if (!configurer) {
      const userConfigurer = await User.findOne({ oderId: configuredByOderId, role: 'admin' });
      if (userConfigurer) {
        configurer = { role: 'super_admin', oderId: configuredByOderId };
      }
    }
    
    if (!configurer || !target) {
      return res.status(404).json({ success: false, error: 'Admin not found' });
    }
    
    // Check permission: super_admin can configure anyone, sub_admin can configure their brokers
    const canConfigure = configurer.role === 'super_admin' || configurer.role === 'admin' ||
      (configurer.role === 'sub_admin' && target.parentOderId === configuredByOderId);
    
    if (!canConfigure) {
      return res.status(403).json({ success: false, error: 'No permission to configure this admin' });
    }
    
    const settings = await pnlSharingService.updateSettings(adminOderId, {
      lossSharePercent,
      profitSharePercent,
      segmentOverrides,
      settlementMode
    }, configuredByOderId);
    
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all children with their PnL sharing settings (for super admin or sub-admin)
app.get('/api/admin/pnl-sharing/children/:adminOderId', async (req, res) => {
  try {
    const { adminOderId } = req.params;
    const children = await pnlSharingService.getChildrenWithSettings(adminOderId);
    res.json({ success: true, children });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get my PnL earnings list
app.get('/api/admin/pnl-sharing/earnings/:adminOderId', async (req, res) => {
  try {
    const { adminOderId } = req.params;
    const { dateFrom, dateTo, segment, limit, skip } = req.query;
    
    const result = await pnlSharingService.getEarnings(adminOderId, {
      dateFrom,
      dateTo,
      segment,
      limit: parseInt(limit) || 50,
      skip: parseInt(skip) || 0
    });
    
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get my PnL summary
app.get('/api/admin/pnl-sharing/summary/:adminOderId', async (req, res) => {
  try {
    const { adminOderId } = req.params;
    const { dateFrom, dateTo } = req.query;
    
    const [summary, segmentSummary, userSummary] = await Promise.all([
      pnlSharingService.getSummary(adminOderId, dateFrom, dateTo),
      pnlSharingService.getSegmentSummary(adminOderId, dateFrom, dateTo),
      pnlSharingService.getUserSummary(adminOderId, dateFrom, dateTo)
    ]);
    
    res.json({ success: true, summary, segmentSummary, userSummary });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Download my PnL report as CSV
app.get('/api/admin/pnl-sharing/download/:adminOderId', async (req, res) => {
  try {
    const { adminOderId } = req.params;
    const { dateFrom, dateTo, segment } = req.query;
    
    const csv = await pnlSharingService.generateCSV(adminOderId, { dateFrom, dateTo, segment });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=pnl-report-${adminOderId}-${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Download all distributions CSV (Super Admin only)
app.get('/api/admin/pnl-sharing/download-all', async (req, res) => {
  try {
    const { dateFrom, dateTo, segment, adminOderId } = req.query;
    
    const csv = await pnlSharingService.generateAllDistributionsCSV({ dateFrom, dateTo, segment, adminOderId });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=all-pnl-distributions-${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all admins with their PnL sharing settings (Super Admin only)
app.get('/api/admin/pnl-sharing/all-admins', async (req, res) => {
  try {
    const admins = await Admin.find({ role: { $in: ['sub_admin', 'broker'] } }).select('-password');
    
    const adminsWithSettings = await Promise.all(
      admins.map(async (admin) => {
        const settings = await pnlSharingService.getSettings(admin.oderId);
        const summary = await pnlSharingService.getSummary(admin.oderId);
        return {
          ...admin.toObject(),
          pnlSharingSettings: settings,
          pnlSummary: summary
        };
      })
    );
    
    res.json({ success: true, admins: adminsWithSettings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== USER SEGMENT SETTINGS (Leverage, etc.) ==============

// Batch endpoint: get spreadType + spreadPips for ALL segments in a mode (netting or hedging)
// Used by client to apply spread to displayed bid/ask for every watchlist instrument
app.get('/api/user/segment-spreads', async (req, res) => {
  try {
    const mode = String(req.query.mode || 'netting').toLowerCase();
    const result = {};
    const scriptSpreads = {}; // Per-symbol spread overrides

    if (mode === 'hedging') {
      const HedgingSegment = require('./models/HedgingSegment');
      const HedgingScriptOverride = require('./models/HedgingScriptOverride');
      const segments = await HedgingSegment.find({ isActive: true }).select('name spreadType spreadPips').lean();
      segments.forEach(s => {
        result[s.name] = {
          spreadType: s.spreadType || 'fixed',
          spreadPips: Number(s.spreadPips) || 0
        };
      });
      // Fetch script-level spread overrides
      const scriptOverrides = await HedgingScriptOverride.find({
        $or: [
          { spreadPips: { $ne: null, $gt: 0 } },
          { spreadType: { $ne: null } }
        ]
      }).select('symbol segmentName spreadType spreadPips').lean();
      scriptOverrides.forEach(so => {
        scriptSpreads[so.symbol] = {
          spreadType: so.spreadType || result[so.segmentName]?.spreadType || 'fixed',
          spreadPips: so.spreadPips != null ? Number(so.spreadPips) : (result[so.segmentName]?.spreadPips || 0),
          segmentName: so.segmentName
        };
      });
    } else {
      const NettingSegment = require('./models/NettingSegment');
      const NettingScriptOverride = require('./models/NettingScriptOverride');
      const segments = await NettingSegment.find({ isActive: true }).select('name spreadType spreadPips').lean();
      segments.forEach(s => {
        result[s.name] = {
          spreadType: s.spreadType || 'fixed',
          spreadPips: Number(s.spreadPips) || 0
        };
      });
      // Fetch script-level spread overrides
      const scriptOverrides = await NettingScriptOverride.find({
        $or: [
          { spreadPips: { $ne: null, $gt: 0 } },
          { spreadType: { $ne: null } }
        ]
      }).select('symbol segmentName spreadType spreadPips').lean();
      scriptOverrides.forEach(so => {
        scriptSpreads[so.symbol] = {
          spreadType: so.spreadType || result[so.segmentName]?.spreadType || 'fixed',
          spreadPips: so.spreadPips != null ? Number(so.spreadPips) : (result[so.segmentName]?.spreadPips || 0),
          segmentName: so.segmentName
        };
      });
    }

    res.json({ success: true, spreads: result, scriptSpreads });
  } catch (error) {
    console.error('Error fetching segment spreads:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get segment settings for user (leverage, etc.)
// Optional ?symbol=EURUSD merges NettingScriptOverride (+ user overrides) for block flags like segment-settings on the engine.
app.get('/api/user/segment-settings/:segmentName', async (req, res) => {
  try {
    const { segmentName } = req.params;
    const NettingSegment = require('./models/NettingSegment');
    const jwt = require('jsonwebtoken');

    const symbolRaw = req.query.symbol;
    const symbolParam =
      symbolRaw != null && String(symbolRaw).trim() !== ''
        ? String(symbolRaw).toUpperCase().trim()
        : null;

    let rawUserId = req.query.userId ? String(req.query.userId) : null;
    try {
      const h = req.headers.authorization;
      if (h && h.startsWith('Bearer ')) {
        const decoded = jwt.verify(h.split(' ')[1], process.env.JWT_SECRET);
        const u = await User.findById(decoded.id).select('oderId').lean();
        if (u?.oderId != null && String(u.oderId).trim() !== '') {
          rawUserId = String(u.oderId);
        }
      }
    } catch (e) {
      /* optional auth */
    }

    // Try NettingSegment first (primary for netting mode)
    let segment = await NettingSegment.findOne({ name: segmentName }).lean();

    // Fallback to legacy Segment if not found
    if (!segment) {
      segment = await Segment.findOne({ name: segmentName }).lean();
    }

    if (!segment) {
      // Return default settings if segment not found
      return res.json({
        success: true,
        settings: {
          isActive: true,
          tradingEnabled: true,
          exitOnlyMode: false,
          minLots: 0.01,
          orderLots: null,
          maxLots: null,
          minQty: 1,
          perOrderQty: null,
          maxQtyPerScript: null,
          intradayMargin: null,
          overnightMargin: null,
          maxLeverage: 500,
          defaultLeverage: 100,
          fixedLeverage: null,
          leverageOptions: [1, 5, 10, 20, 50, 100, 200, 500],
          limitAwayPoints: null,
          limitAwayPercent: null,
          buyingStrikeFar: null,
          buyingStrikeFarPercent: null,
          sellingStrikeFar: null,
          sellingStrikeFarPercent: null,
          marginCalcMode: 'fixed',
          fixedMarginAsPercent: false,
          fixedMarginIntradayAsPercent: false,
          fixedMarginOvernightAsPercent: false,
          fixedMarginOptionBuyIntradayAsPercent: false,
          fixedMarginOptionBuyOvernightAsPercent: false,
          fixedMarginOptionSellIntradayAsPercent: false,
          fixedMarginOptionSellOvernightAsPercent: false,
          allowOvernight: true
        }
      });
    }
    
    // Parse leverage options
    let leverageOptions = [1, 5, 10, 20, 50, 100, 200, 500];
    if (segment.leverageOptions) {
      try {
        leverageOptions = segment.leverageOptions.split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v));
      } catch (e) {}
    }

    let mergedRow = null;
    if (symbolParam && segment._id) {
      try {
        mergedRow = await UserSegmentSettings.getEffectiveSettingsForUser(
          rawUserId,
          segment._id,
          symbolParam,
          'netting'
        );
      } catch (mergeErr) {
        console.error('[segment-settings] script/user merge', segmentName, symbolParam, mergeErr.message);
      }
    }

    const pick = (effVal, segKey, fallback = null) => {
      if (effVal !== undefined && effVal !== null) return effVal;
      const sv = segment[segKey];
      if (sv !== undefined && sv !== null) return sv;
      return fallback;
    };

    let outLeverageOptions = leverageOptions;
    const loSrc = mergedRow?.leverageOptions ?? segment.leverageOptions;
    if (loSrc) {
      try {
        if (typeof loSrc === 'string') {
          outLeverageOptions = loSrc.split(',').map((v) => parseInt(v.trim(), 10)).filter((v) => !isNaN(v));
        } else if (Array.isArray(loSrc) && loSrc.length) {
          outLeverageOptions = loSrc;
        }
      } catch (e) {
        /* keep parsed segment default */
      }
    }

    // When ?symbol= is present, return full effective settings (user > script > segment) so the trade
    // ticket matches NettingEngine — previously only block flags used mergedRow and lots/margins stayed segment-only.
    if (mergedRow) {
      return res.json({
        success: true,
        settings: {
          isActive: mergedRow.isActive !== false,
          tradingEnabled: mergedRow.tradingEnabled !== false,
          exitOnlyMode: mergedRow.exitOnlyMode === true,
          minLots: pick(mergedRow.minLots, 'minLots', 0.01),
          orderLots: pick(mergedRow.orderLots, 'orderLots', null),
          maxLots: pick(mergedRow.maxLots, 'maxLots', null),
          limitType: pick(mergedRow.limitType, 'limitType', 'lot'),
          maxValue: pick(mergedRow.maxValue, 'maxValue', 0),
          minQty: pick(mergedRow.minQty, 'minQty', 1),
          perOrderQty: pick(mergedRow.perOrderQty, 'perOrderQty', null),
          maxQtyPerScript: pick(mergedRow.maxQtyPerScript, 'maxQtyPerScript', null),
          maxQtyHolding: mergedRow.maxQtyHolding != null ? mergedRow.maxQtyHolding : null,
          intradayMargin:
            mergedRow.intradayHolding != null ? mergedRow.intradayHolding : segment.intradayMargin || null,
          overnightMargin:
            mergedRow.overnightHolding != null ? mergedRow.overnightHolding : segment.overnightMargin || null,
          optionBuyIntraday: pick(mergedRow.optionBuyIntraday, 'optionBuyIntraday', null),
          optionBuyOvernight: pick(mergedRow.optionBuyOvernight, 'optionBuyOvernight', null),
          optionSellIntraday: pick(mergedRow.optionSellIntraday, 'optionSellIntraday', null),
          optionSellOvernight: pick(mergedRow.optionSellOvernight, 'optionSellOvernight', null),
          // Do not pick() fallback to raw segment for these: merged row uses null to mean "not in use"
          // (e.g. segment % active with legacy limitAwayPoints still on the document would wrongly revive points).
          limitAwayPoints: mergedRow.limitAwayPoints ?? null,
          limitAwayPercent: mergedRow.limitAwayPercent ?? null,
          buyingStrikeFar: mergedRow.buyingStrikeFar ?? null,
          buyingStrikeFarPercent: mergedRow.buyingStrikeFarPercent ?? null,
          sellingStrikeFar: mergedRow.sellingStrikeFar ?? null,
          sellingStrikeFarPercent: mergedRow.sellingStrikeFarPercent ?? null,
          // Use merged row only — pick() would revive NettingSegment 0 / defaults when effective merge left field unset.
          spreadType: mergedRow.spreadType ?? null,
          spreadPips: mergedRow.spreadPips ?? null,
          markupPips: mergedRow.markupPips ?? null,
          swapType: mergedRow.swapType ?? null,
          swapLong: mergedRow.swapLong ?? null,
          swapShort: mergedRow.swapShort ?? null,
          tripleSwapDay: mergedRow.tripleSwapDay ?? null,
          commissionType: pick(mergedRow.commissionType, 'commissionType', null),
          commission: pick(mergedRow.commission, 'commission', null),
          chargeOn: mergedRow.chargeOn != null ? mergedRow.chargeOn : segment.chargeOn || 'open',
          hasScriptOverride: !!mergedRow.hasScriptOverride,
          marginCalcMode: mergedRow.marginCalcMode || segment.marginCalcMode || (segment.fixedMarginAsPercent === true ? 'percent' : 'fixed'),
          fixedMarginAsPercent: segment.fixedMarginAsPercent === true,
          fixedMarginIntradayAsPercent: mergedRow.fixedMarginIntradayAsPercent === true,
          fixedMarginOvernightAsPercent: mergedRow.fixedMarginOvernightAsPercent === true,
          fixedMarginOptionBuyIntradayAsPercent: mergedRow.fixedMarginOptionBuyIntradayAsPercent === true,
          fixedMarginOptionBuyOvernightAsPercent: mergedRow.fixedMarginOptionBuyOvernightAsPercent === true,
          fixedMarginOptionSellIntradayAsPercent: mergedRow.fixedMarginOptionSellIntradayAsPercent === true,
          fixedMarginOptionSellOvernightAsPercent: mergedRow.fixedMarginOptionSellOvernightAsPercent === true,
          allowOvernight: mergedRow.allowOvernight !== false
        }
      });
    }

    // Derive marginCalcMode from the new field first, fall back to deprecated boolean
    const resolvedMarginCalcMode = segment.marginCalcMode || (segment.fixedMarginAsPercent === true ? 'percent' : 'fixed');
    const segFmPct = resolvedMarginCalcMode === 'percent';
    res.json({
      success: true,
      settings: {
        isActive: segment.isActive !== false,
        tradingEnabled: segment.tradingEnabled !== false,
        exitOnlyMode: segment.exitOnlyMode === true,
        minLots: segment.minLots ?? 0.01,
        orderLots: segment.orderLots || null,
        maxLots: segment.maxLots || null,
        limitType: segment.limitType || 'lot',
        maxValue: segment.maxValue ?? 0,
        minQty: segment.minQty || 1,
        perOrderQty: segment.perOrderQty || null,
        maxQtyPerScript: segment.maxQtyPerScript || null,
        maxQtyHolding: null,
        intradayMargin: segment.intradayMargin || null,
        overnightMargin: segment.overnightMargin || null,
        optionBuyIntraday: segment.optionBuyIntraday || null,
        optionBuyOvernight: segment.optionBuyOvernight || null,
        optionSellIntraday: segment.optionSellIntraday || null,
        optionSellOvernight: segment.optionSellOvernight || null,
        limitAwayPoints: segment.limitAwayPoints || null,
        limitAwayPercent: segment.limitAwayPercent ?? null,
        buyingStrikeFar: segment.buyingStrikeFar || null,
        buyingStrikeFarPercent: segment.buyingStrikeFarPercent ?? null,
        sellingStrikeFar: segment.sellingStrikeFar || null,
        sellingStrikeFarPercent: segment.sellingStrikeFarPercent ?? null,
        spreadType: segment.spreadType || null,
        spreadPips: segment.spreadPips ?? null,
        commissionType: segment.commissionType || null,
        commission: segment.commission ?? null,
        chargeOn: segment.chargeOn || 'open',
        hasScriptOverride: false,
        marginCalcMode: resolvedMarginCalcMode,
        fixedMarginAsPercent: segFmPct,
        fixedMarginIntradayAsPercent: !!(segFmPct && segment.intradayMargin != null && segment.intradayMargin > 0),
        fixedMarginOvernightAsPercent: !!(segFmPct && segment.overnightMargin != null && segment.overnightMargin > 0),
        fixedMarginOptionBuyIntradayAsPercent: !!(segFmPct && segment.optionBuyIntraday != null && segment.optionBuyIntraday > 0),
        fixedMarginOptionBuyOvernightAsPercent: !!(segFmPct && segment.optionBuyOvernight != null && segment.optionBuyOvernight > 0),
        fixedMarginOptionSellIntradayAsPercent: !!(segFmPct && segment.optionSellIntraday != null && segment.optionSellIntraday > 0),
        fixedMarginOptionSellOvernightAsPercent: !!(segFmPct && segment.optionSellOvernight != null && segment.optionSellOvernight > 0),
        allowOvernight: segment.allowOvernight !== false
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all segments settings for user (for caching). Optional ?userId=oderId merges UserSegmentSettings like NettingEngine.
// Includes isActive / tradingEnabled per segment for user UI (hide inactive; show but block trades when trading off).
app.get('/api/user/all-segment-settings', async (req, res) => {
  try {
    const NettingSegment = require('./models/NettingSegment');
    const jwt = require('jsonwebtoken');
    let rawUserId = req.query.userId ? String(req.query.userId) : null;
    try {
      const h = req.headers.authorization;
      if (h && h.startsWith('Bearer ')) {
        const token = h.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const u = await User.findById(decoded.id).select('oderId').lean();
        if (u && u.oderId != null && String(u.oderId).trim() !== '') {
          rawUserId = String(u.oderId);
        }
      }
    } catch (e) {
      /* optional auth — keep query userId or null */
    }

    const activeSegments = await Segment.find({ isActive: true }).lean();
    const nettingRows = await NettingSegment.find().lean();
    const nameSet = new Set([
      ...activeSegments.map((x) => x.name),
      ...nettingRows.map((x) => x.name)
    ]);

    const settings = {};

    for (const name of nameSet) {
      const segment = activeSegments.find((x) => x.name === name) || (await Segment.findOne({ name }).lean());
      const netting = nettingRows.find((x) => x.name === name) || (await NettingSegment.findOne({ name }).lean());
      if (!segment && !netting) continue;

      const segmentIdForNetting = netting?._id || segment?._id;
      if (!segmentIdForNetting) continue;

      let row;
      try {
        row = await UserSegmentSettings.getEffectiveSettingsForUser(
          rawUserId,
          segmentIdForNetting,
          null,
          'netting'
        );
      } catch (e) {
        console.error('[all-segment-settings] effective for', name, e.message);
        const lotSrc = netting || segment;
        row = {
          maxLots: lotSrc?.maxLots,
          minLots: lotSrc?.minLots,
          orderLots: lotSrc?.orderLots,
          maxQtyHolding: lotSrc?.maxQtyHolding,
          perOrderQty: lotSrc?.perOrderQty,
          limitType: lotSrc?.limitType,
          maxValue: lotSrc?.maxValue,
          lotStep: lotSrc?.lotStep ?? 0.01,
          isActive: lotSrc?.isActive,
          tradingEnabled: lotSrc?.tradingEnabled
        };
      }

      let leverageOptions = [1, 5, 10, 20, 50, 100, 200, 500];
      const lo = row.leverageOptions ?? segment?.leverageOptions;
      if (lo && typeof lo === 'string') {
        try {
          leverageOptions = lo.split(',').map((v) => parseInt(v.trim(), 10)).filter((v) => !isNaN(v));
        } catch (e) {
          /* keep default */
        }
      } else if (Array.isArray(lo) && lo.length) {
        leverageOptions = lo;
      }

      settings[name] = {
        isActive: row.isActive !== false,
        tradingEnabled: row.tradingEnabled !== false,
        maxLots: row.maxLots,
        minLots: row.minLots,
        orderLots: row.orderLots,
        maxQtyHolding: row.maxQtyHolding,
        perOrderQty: row.perOrderQty,
        limitType: row.limitType,
        maxValue: row.maxValue,
        lotStep: row.lotStep ?? segment?.lotStep ?? netting?.lotStep ?? 0.01
      };
    }

    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== USER INSTRUMENTS (Persist user's added instruments) ==============

// Get all instruments for a user (grouped by category)
app.get('/api/user/instruments/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    let user = await User.findOne({ oderId: userId });
    if (!user) user = await User.findById(userId).catch(() => null);
    if (!user) return res.json({ success: true, instruments: {} });
    
    const { grouped, watchlistPruned } = await UserInstruments.getInstrumentsForUser(user._id);
    res.json({ success: true, instruments: grouped, watchlistPruned });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add instrument for a user
app.post('/api/user/instruments/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { category, instrument } = req.body;
    if (!category || !instrument?.symbol) {
      return res.status(400).json({ success: false, error: 'Category and instrument required' });
    }
    
    let user = await User.findOne({ oderId: userId });
    if (!user) user = await User.findById(userId).catch(() => null);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    
    const result = await UserInstruments.addInstrument(user._id, user.oderId, category, instrument);
    res.json({ success: true, instrument: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Remove instrument for a user
app.delete('/api/user/instruments/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { category, symbol } = req.body;
    if (!category || !symbol) {
      return res.status(400).json({ success: false, error: 'Category and symbol required' });
    }
    
    let user = await User.findOne({ oderId: userId });
    if (!user) user = await User.findById(userId).catch(() => null);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    
    await UserInstruments.removeInstrument(user._id, category, symbol);
    res.json({ success: true, message: 'Instrument removed' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== USER SEGMENT SETTINGS (Per-User Overrides) ==============

// Get users with custom segment settings
app.get('/api/admin/user-segment-settings', async (req, res) => {
  try {
    const { segmentId, search, page = 1, limit = 50 } = req.query;
    
    const query = {};
    if (segmentId) query.segmentId = segmentId;
    
    // Get unique users with settings
    const pipeline = [
      { $match: query },
      { $group: { 
        _id: '$userId',
        oderId: { $first: '$oderId' },
        settingsCount: { $sum: 1 },
        segments: { $addToSet: '$segmentName' }
      }},
      { $sort: { oderId: 1 } },
      { $skip: (parseInt(page) - 1) * parseInt(limit) },
      { $limit: parseInt(limit) }
    ];
    
    const usersWithSettings = await UserSegmentSettings.aggregate(pipeline);
    
    // Get user details
    const userIds = usersWithSettings.map(u => u._id);
    const users = await User.find({ _id: { $in: userIds } }).select('oderId name email phone');
    const userMap = {};
    users.forEach(u => { userMap[u._id.toString()] = u; });
    
    const result = usersWithSettings.map(u => ({
      userId: u._id,
      oderId: u.oderId,
      user: userMap[u._id.toString()] || null,
      settingsCount: u.settingsCount,
      segments: u.segments
    }));
    
    // Get total count
    const totalPipeline = [
      { $match: query },
      { $group: { _id: '$userId' } },
      { $count: 'total' }
    ];
    const totalResult = await UserSegmentSettings.aggregate(totalPipeline);
    const total = totalResult[0]?.total || 0;
    
    res.json({
      success: true,
      users: result,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Search users for applying settings (MUST be before :userId route)
app.get('/api/admin/user-segment-settings/search-users', async (req, res) => {
  try {
    const { search, limit = 20 } = req.query;
    
    if (!search || search.length < 2) {
      return res.json({ success: true, users: [] });
    }
    
    const users = await User.find({
      $or: [
        { oderId: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ],
      role: { $ne: 'admin' }
    })
    .select('_id oderId name email phone status')
    .limit(parseInt(limit))
    .sort({ oderId: 1 });
    
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// All segment override rows for a user (must be before :userId — avoids "user" being parsed as id)
app.get('/api/admin/user-segment-settings/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { tradeMode } = req.query;
    const query = { userId };
    if (tradeMode === 'hedging') {
      query.tradeMode = 'hedging';
    } else if (tradeMode === 'netting') {
      query.$or = [
        { tradeMode: null },
        { tradeMode: { $exists: false } },
        { tradeMode: 'netting' }
      ];
    }
    const settings = await UserSegmentSettings.find(query)
      .populate('segmentId', 'name displayName exchange segmentType')
      .sort({ segmentName: 1, symbol: 1 });
    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get segment settings for a specific user
app.get('/api/admin/user-segment-settings/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { segmentId, tradeMode } = req.query;
    
    const query = { userId };
    if (segmentId) query.segmentId = segmentId;
    if (tradeMode === 'hedging') {
      query.tradeMode = 'hedging';
    } else if (tradeMode === 'netting') {
      query.$or = [
        { tradeMode: null },
        { tradeMode: { $exists: false } },
        { tradeMode: 'netting' }
      ];
    }
    
    const settings = await UserSegmentSettings.find(query)
      .populate('segmentId', 'name displayName exchange segmentType')
      .sort({ segmentName: 1, symbol: 1 });
    
    // Get user info
    const user = await User.findById(userId).select('oderId name email phone');
    
    res.json({ success: true, user, settings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Apply segment settings to multiple users
app.post('/api/admin/user-segment-settings/bulk', async (req, res) => {
  try {
    const { userIds, segmentId, segmentName, settings, symbol, tradeMode } = req.body;
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ success: false, error: 'User IDs required' });
    }
    if (!segmentId || !segmentName) {
      return res.status(400).json({ success: false, error: 'Segment required' });
    }
    
    const results = await UserSegmentSettings.applyToMultipleUsers(
      userIds, segmentId, segmentName, settings, symbol, tradeMode
    );
    
    res.json({
      success: true,
      message: `Applied settings to ${results.length} users for ${tradeMode || 'all'} mode`,
      count: results.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Copy all segment overrides from one user to many (netting or hedging)
app.post('/api/admin/user-segment-settings/copy-from-user', async (req, res) => {
  try {
    const { sourceUserId, targetUserIds, tradeMode } = req.body;
    if (!sourceUserId) {
      return res.status(400).json({ success: false, error: 'sourceUserId required' });
    }
    if (!targetUserIds || !Array.isArray(targetUserIds) || targetUserIds.length === 0) {
      return res.status(400).json({ success: false, error: 'targetUserIds (non-empty array) required' });
    }
    const mode = tradeMode === 'hedging' ? 'hedging' : 'netting';
    const summary = await UserSegmentSettings.copyFromUserToUsers(sourceUserId, targetUserIds, mode);
    res.json({
      success: true,
      message: `Copied ${summary.sourceRowCount} setting row(s) to ${summary.targetUserCount} user(s) (${summary.upserts} upserts)`,
      ...summary
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update single user segment setting
app.put('/api/admin/user-segment-settings/:id', async (req, res) => {
  try {
    const {
      // Lot Settings
      limitType, maxValue, maxLots, minLots, orderLots, maxExchangeLots, lotSize,
      maxPositionsPerSymbol, maxTotalPositions,
      contractSize, digits, pipSize, pipValue, lotStep,
      // Brokerage Settings
      commissionType, commission, chargeOn, exposureIntraday, exposureCarryForward,
      // Qty Settings
      maxQtyHolding, perOrderQty, minQty, maxQtyPerScript,
      // Fixed Margin Settings
      intradayHolding, overnightHolding, optionBuyIntraday, optionBuyOvernight, optionSellIntraday, optionSellOvernight,
      // Options Settings
      buyingStrikeFar, sellingStrikeFar,
      buyingStrikeFarPercent, sellingStrikeFarPercent,
      // Limit away (netting)
      limitAwayPoints,
      limitAwayPercent,
      // Spread Settings
      spreadType, spreadPips, markupPips,
      // Commission Settings
      openCommission, closeCommission,
      // Swap Settings
      swapType, swapLong, swapShort, tripleSwapDay,
      // Leverage / margin
      maxLeverage, defaultLeverage, fixedLeverage, leverageOptions,
      marginMode, marginRate, hedgedMarginRate,
      // Risk
      ledgerBalanceClose, profitTradeHoldMinSeconds, lossTradeHoldMinSeconds,
      expiryProfitHoldMinSeconds, expiryLossHoldMinSeconds, expiryDayIntradayMargin,
      blockLimitAboveBelowHighLow, blockLimitBetweenHighLow, exitOnlyMode,
      // Block Settings
      isActive, tradingEnabled, blockOptions, blockFractionLot, allowOvernight
    } = req.body;

    const setting = await UserSegmentSettings.findByIdAndUpdate(
      req.params.id,
      {
        limitType, maxValue, maxLots, minLots, orderLots, maxExchangeLots, lotSize,
        maxPositionsPerSymbol, maxTotalPositions,
        contractSize, digits, pipSize, pipValue, lotStep,
        commissionType, commission, chargeOn, exposureIntraday, exposureCarryForward,
        maxQtyHolding, perOrderQty, minQty, maxQtyPerScript,
        intradayHolding, overnightHolding, optionBuyIntraday, optionBuyOvernight, optionSellIntraday, optionSellOvernight,
        buyingStrikeFar, sellingStrikeFar,
        buyingStrikeFarPercent, sellingStrikeFarPercent,
        limitAwayPoints,
        limitAwayPercent,
        spreadType, spreadPips, markupPips,
        openCommission, closeCommission,
        swapType, swapLong, swapShort, tripleSwapDay,
        maxLeverage, defaultLeverage, fixedLeverage, leverageOptions,
        marginMode, marginRate, hedgedMarginRate,
        ledgerBalanceClose, profitTradeHoldMinSeconds, lossTradeHoldMinSeconds,
        expiryProfitHoldMinSeconds, expiryLossHoldMinSeconds, expiryDayIntradayMargin,
        blockLimitAboveBelowHighLow, blockLimitBetweenHighLow, exitOnlyMode,
        isActive, tradingEnabled, blockOptions, blockFractionLot, allowOvernight,
        updatedAt: Date.now()
      },
      { new: true }
    );
    
    if (!setting) return res.status(404).json({ success: false, error: 'Setting not found' });
    res.json({ success: true, setting, message: 'User setting updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete user segment setting
app.delete('/api/admin/user-segment-settings/:id', async (req, res) => {
  try {
    const setting = await UserSegmentSettings.findByIdAndDelete(req.params.id);
    if (!setting) return res.status(404).json({ success: false, error: 'Setting not found' });
    res.json({ success: true, message: 'User setting deleted (will use defaults)' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete all settings for a user
app.delete('/api/admin/user-segment-settings/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { segmentId, tradeMode } = req.query;

    const query = { userId };
    if (segmentId) query.segmentId = segmentId;
    // Scope deletion to the correct mode — never delete across modes
    if (tradeMode === 'hedging') {
      query.tradeMode = 'hedging';
    } else if (tradeMode === 'netting') {
      query.$or = [
        { tradeMode: null },
        { tradeMode: { $exists: false } },
        { tradeMode: 'netting' }
      ];
    }
    // If no tradeMode passed, delete all (e.g. full user reset from admin)

    const result = await UserSegmentSettings.deleteMany(query);
    res.json({ 
      success: true, 
      message: `Deleted ${result.deletedCount} settings for user`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get effective settings for a user (for trading)
app.get('/api/admin/user-segment-settings/effective/:userId/:segmentId', async (req, res) => {
  try {
    const { userId, segmentId } = req.params;
    const { symbol } = req.query;
    
    const effectiveSettings = await UserSegmentSettings.getEffectiveSettingsForUser(
      userId, segmentId, symbol
    );
    
    res.json({ success: true, settings: effectiveSettings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


// ============== MARKET CONTROL (Indian Market Timing) ==============

// Seed default market configurations on startup
const seedMarketControls = async () => {
  try {
    await MarketControl.seedDefaults();
  } catch (error) {
    console.error('Error seeding market controls:', error.message);
  }
};
seedMarketControls();

// Get all market controls
app.get('/api/admin/market-control', async (req, res) => {
  try {
    const markets = await MarketControl.find().sort({ market: 1 });
    res.json({ success: true, markets });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single market control
app.get('/api/admin/market-control/:market', async (req, res) => {
  try {
    const market = await MarketControl.findOne({ market: req.params.market });
    if (!market) return res.status(404).json({ success: false, error: 'Market not found' });
    res.json({ success: true, market });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update market control settings
app.put('/api/admin/market-control/:market', async (req, res) => {
  try {
    const {
      isActive, tradingHours, tradingDays, autoSquareOff,
      bufferTime, closedMessage
    } = req.body;
    
    const market = await MarketControl.findOneAndUpdate(
      { market: req.params.market },
      {
        ...(isActive !== undefined && { isActive }),
        ...(tradingHours && { tradingHours }),
        ...(tradingDays && { tradingDays }),
        ...(autoSquareOff && { autoSquareOff }),
        ...(bufferTime && { bufferTime }),
        ...(closedMessage && { closedMessage }),
        updatedAt: Date.now()
      },
      { new: true }
    );
    
    if (!market) return res.status(404).json({ success: false, error: 'Market not found' });
    res.json({ success: true, market, message: 'Market settings updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add holiday
app.post('/api/admin/market-control/:market/holidays', async (req, res) => {
  try {
    const { date, description } = req.body;
    if (!date) return res.status(400).json({ success: false, error: 'Date is required' });
    
    const market = await MarketControl.findOne({ market: req.params.market });
    if (!market) return res.status(404).json({ success: false, error: 'Market not found' });
    
    market.holidays.push({ date: new Date(date), description });
    await market.save();
    
    res.json({ success: true, market, message: 'Holiday added' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Remove holiday
app.delete('/api/admin/market-control/:market/holidays/:holidayId', async (req, res) => {
  try {
    const market = await MarketControl.findOne({ market: req.params.market });
    if (!market) return res.status(404).json({ success: false, error: 'Market not found' });
    
    market.holidays = market.holidays.filter(h => h._id.toString() !== req.params.holidayId);
    await market.save();
    
    res.json({ success: true, market, message: 'Holiday removed' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add special session
app.post('/api/admin/market-control/:market/special-sessions', async (req, res) => {
  try {
    const { date, openTime, closeTime, description } = req.body;
    if (!date || !openTime || !closeTime) {
      return res.status(400).json({ success: false, error: 'Date, openTime, and closeTime are required' });
    }
    
    const market = await MarketControl.findOne({ market: req.params.market });
    if (!market) return res.status(404).json({ success: false, error: 'Market not found' });
    
    market.specialSessions.push({ date: new Date(date), openTime, closeTime, description });
    await market.save();
    
    res.json({ success: true, market, message: 'Special session added' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Remove special session
app.delete('/api/admin/market-control/:market/special-sessions/:sessionId', async (req, res) => {
  try {
    const market = await MarketControl.findOne({ market: req.params.market });
    if (!market) return res.status(404).json({ success: false, error: 'Market not found' });
    
    market.specialSessions = market.specialSessions.filter(s => s._id.toString() !== req.params.sessionId);
    await market.save();
    
    res.json({ success: true, market, message: 'Special session removed' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Check if market is open (public endpoint for trading)
app.get('/api/market-status/:market', async (req, res) => {
  try {
    const status = await MarketControl.getMarketStatus(req.params.market);
    res.json({ success: true, ...status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Check all markets status
app.get('/api/market-status', async (req, res) => {
  try {
    const markets = await MarketControl.find();
    const statuses = await Promise.all(
      markets.map(async (m) => ({
        market: m.market,
        displayName: m.displayName,
        ...(await MarketControl.getMarketStatus(m.market))
      }))
    );
    res.json({ success: true, markets: statuses });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== REPORTS & ANALYTICS ==============

// Financial Reports
app.get('/api/admin/reports/financial-reports', async (req, res) => {
  try {
    const { from, to } = req.query;
    const dateQuery = {};
    if (from) dateQuery.$gte = new Date(from);
    if (to) dateQuery.$lte = new Date(to);
    
    const Transaction = require('./models/Transaction');
    const User = require('./models/User');
    
    // Get deposits
    const depositQuery = { type: 'deposit', status: 'approved' };
    if (from || to) depositQuery.createdAt = dateQuery;
    const deposits = await Transaction.aggregate([
      { $match: depositQuery },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]);
    
    // Get withdrawals
    const withdrawalQuery = { type: 'withdrawal', status: 'approved' };
    if (from || to) withdrawalQuery.createdAt = dateQuery;
    const withdrawals = await Transaction.aggregate([
      { $match: withdrawalQuery },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]);
    
    // Get total user balances
    const userBalances = await User.aggregate([
      { $group: { _id: null, totalBalance: { $sum: '$wallet.balance' } } }
    ]);
    
    // Get trade P/L
    const HedgingPosition = require('./models/Position').HedgingPosition;
    const NettingPosition = require('./models/Position').NettingPosition;
    const BinaryTrade = require('./models/Position').BinaryTrade;
    
    const tradeQuery = { status: 'closed' };
    if (from || to) tradeQuery.closeTime = dateQuery;
    
    const hedgingPnL = await HedgingPosition.aggregate([
      { $match: tradeQuery },
      { $group: { _id: null, total: { $sum: '$profit' } } }
    ]);
    
    const nettingPnL = await NettingPosition.aggregate([
      { $match: tradeQuery },
      { $group: { _id: null, total: { $sum: '$profit' } } }
    ]);
    
    const binaryPnL = await BinaryTrade.aggregate([
      { $match: { ...tradeQuery, result: { $exists: true } } },
      { $group: { _id: null, total: { $sum: '$profit' } } }
    ]);
    
    const totalDeposits = deposits[0]?.total || 0;
    const totalWithdrawals = withdrawals[0]?.total || 0;
    const netPnL = (hedgingPnL[0]?.total || 0) + (nettingPnL[0]?.total || 0) + (binaryPnL[0]?.total || 0);
    
    res.json({
      success: true,
      report: {
        totalRevenue: totalDeposits - totalWithdrawals,
        totalDeposits,
        totalWithdrawals,
        depositCount: deposits[0]?.count || 0,
        withdrawalCount: withdrawals[0]?.count || 0,
        netPnL,
        totalUserBalance: userBalances[0]?.totalBalance || 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// User Reports
app.get('/api/admin/reports/user-reports', async (req, res) => {
  try {
    const { from, to } = req.query;
    const User = require('./models/User');
    
    const dateQuery = {};
    if (from) dateQuery.$gte = new Date(from);
    if (to) dateQuery.$lte = new Date(to);
    
    // Total users
    const totalUsers = await User.countDocuments({ role: { $ne: 'admin' } });
    
    // Active users (logged in within last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const activeUsers = await User.countDocuments({ 
      role: { $ne: 'admin' },
      lastLogin: { $gte: thirtyDaysAgo }
    });
    
    // New users in period
    const newUsersQuery = { role: { $ne: 'admin' } };
    if (from || to) newUsersQuery.createdAt = dateQuery;
    const newUsers = await User.countDocuments(newUsersQuery);
    
    // KYC verified
    const kycVerified = await User.countDocuments({ 
      role: { $ne: 'admin' },
      'kyc.status': 'verified'
    });
    
    // Users by status
    const blockedUsers = await User.countDocuments({ 
      role: { $ne: 'admin' },
      status: 'blocked'
    });
    
    // Users with balance
    const usersWithBalance = await User.countDocuments({
      role: { $ne: 'admin' },
      'wallet.balance': { $gt: 0 }
    });
    
    // Top depositors
    const topDepositors = await User.find({ role: { $ne: 'admin' } })
      .sort({ 'wallet.balance': -1 })
      .limit(10)
      .select('name email oderId wallet.balance');
    
    res.json({
      success: true,
      report: {
        totalUsers,
        activeUsers,
        newUsers: from || to ? newUsers : totalUsers,
        kycVerified,
        blockedUsers,
        usersWithBalance,
        topDepositors
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Trade Reports
app.get('/api/admin/reports/trade-reports', async (req, res) => {
  try {
    const { from, to } = req.query;
    const HedgingPosition = require('./models/Position').HedgingPosition;
    const NettingPosition = require('./models/Position').NettingPosition;
    const BinaryTrade = require('./models/Position').BinaryTrade;
    
    const dateQuery = {};
    if (from) dateQuery.$gte = new Date(from);
    if (to) dateQuery.$lte = new Date(to);
    
    // Hedging trades
    const hedgingQuery = {};
    if (from || to) hedgingQuery.openTime = dateQuery;
    const hedgingTrades = await HedgingPosition.find(hedgingQuery);
    
    // Netting trades
    const nettingQuery = {};
    if (from || to) nettingQuery.openTime = dateQuery;
    const nettingTrades = await NettingPosition.find(nettingQuery);
    
    // Binary trades
    const binaryQuery = {};
    if (from || to) binaryQuery.createdAt = dateQuery;
    const binaryTrades = await BinaryTrade.find(binaryQuery);
    
    const allTrades = [...hedgingTrades, ...nettingTrades, ...binaryTrades];
    const closedTrades = allTrades.filter(t => t.status === 'closed' || t.result);
    
    const totalVolume = allTrades.reduce((sum, t) => sum + (t.volume || t.amount || 0), 0);
    const totalPnL = closedTrades.reduce((sum, t) => sum + (t.profit || 0), 0);
    const winningTrades = closedTrades.filter(t => (t.profit || 0) > 0).length;
    const losingTrades = closedTrades.filter(t => (t.profit || 0) < 0).length;
    
    // Top symbols
    const symbolStats = {};
    allTrades.forEach(t => {
      const sym = t.symbol || 'UNKNOWN';
      if (!symbolStats[sym]) symbolStats[sym] = { count: 0, volume: 0, pnl: 0 };
      symbolStats[sym].count++;
      symbolStats[sym].volume += t.volume || t.amount || 0;
      symbolStats[sym].pnl += t.profit || 0;
    });
    
    const topSymbols = Object.entries(symbolStats)
      .map(([symbol, stats]) => ({ symbol, ...stats }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    res.json({
      success: true,
      report: {
        totalTrades: allTrades.length,
        openTrades: allTrades.filter(t => t.status === 'open').length,
        closedTrades: closedTrades.length,
        totalVolume,
        totalPnL,
        winningTrades,
        losingTrades,
        winRate: closedTrades.length > 0 ? ((winningTrades / closedTrades.length) * 100).toFixed(1) : 0,
        topSymbols,
        byMode: {
          hedging: hedgingTrades.length,
          netting: nettingTrades.length,
          binary: binaryTrades.length
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Commission Reports
app.get('/api/admin/reports/commission-reports', async (req, res) => {
  try {
    const { from, to } = req.query;

    const dateQuery = {};
    if (from) dateQuery.$gte = new Date(from);
    if (to) dateQuery.$lte = new Date(to + 'T23:59:59');

    const tradeQuery = {};
    if (from || to) tradeQuery.createdAt = dateQuery;

    // Platform commission + swap from Trade records
    const totals = await Trade.aggregate([
      { $match: tradeQuery },
      { $group: {
        _id: null,
        totalCommission: { $sum: '$commission' },
        totalSwap: { $sum: '$swap' },
        count: { $sum: 1 }
      }}
    ]);

    // By mode breakdown
    const byMode = await Trade.aggregate([
      { $match: tradeQuery },
      { $group: {
        _id: '$mode',
        commission: { $sum: '$commission' },
        swap: { $sum: '$swap' },
        count: { $sum: 1 }
      }}
    ]);

    // Top users by commission paid
    const topUsers = await Trade.aggregate([
      { $match: { ...tradeQuery, $or: [{ commission: { $gt: 0 } }, { swap: { $gt: 0 } }] } },
      { $group: {
        _id: '$userId',
        totalCommission: { $sum: '$commission' },
        totalSwap: { $sum: '$swap' },
        tradeCount: { $sum: 1 }
      }},
      { $sort: { totalCommission: -1 } },
      { $limit: 10 }
    ]);

    // Enrich top users with name/email
    const userIds = topUsers.map(u => u._id);
    const userDocs = await User.find({ oderId: { $in: userIds } }).select('oderId name email').lean();
    const userMap = {};
    userDocs.forEach(u => { userMap[u.oderId] = u; });

    // IB commission payouts (what platform owes IBs)
    const IBCommission = require('./models/IBCommission');
    const ibTotals = await IBCommission.aggregate([
      { $match: from || to ? { createdAt: dateQuery } : {} },
      { $group: {
        _id: '$status',
        total: { $sum: '$amount' },
        count: { $sum: 1 }
      }}
    ]);
    const ibByStatus = ibTotals.reduce((acc, s) => ({ ...acc, [s._id]: { total: s.total, count: s.count } }), {});

    const data = totals[0] || { totalCommission: 0, totalSwap: 0, count: 0 };
    const byModeMap = {};
    byMode.forEach(m => { byModeMap[m._id] = { commission: m.commission, swap: m.swap, count: m.count }; });

    res.json({
      success: true,
      report: {
        totalCommission: data.totalCommission,
        totalSwap: data.totalSwap,
        totalRevenue: data.totalCommission + data.totalSwap,
        tradeCount: data.count,
        byMode: byModeMap,
        ibPending: ibByStatus['pending']?.total || 0,
        ibCredited: ibByStatus['credited']?.total || 0,
        ibPaid: ibByStatus['paid']?.total || 0,
        ibTotal: Object.values(ibByStatus).reduce((s, v) => s + (v.total || 0), 0),
        topUsers: topUsers.map(u => {
          const user = userMap[u._id] || {};
          return {
            oderId: u._id,
            name: user.name || u._id,
            email: user.email || '',
            totalCommission: u.totalCommission,
            totalSwap: u.totalSwap,
            tradeCount: u.tradeCount
          };
        })
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// User commission trade details — drill-down for commission reports
app.get('/api/admin/reports/user-commission-trades/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { from, to } = req.query;

    const query = { userId, $or: [{ commission: { $gt: 0 } }, { swap: { $gt: 0 } }] };
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) query.createdAt.$lte = new Date(to + 'T23:59:59');
    }

    const trades = await Trade.find(query)
      .sort({ createdAt: -1 })
      .limit(200)
      .select('tradeId oderId symbol side mode type volume quantity amount entryPrice closePrice profit commission commissionInr swap leverage session exchange segment closedBy remark executedAt closedAt createdAt')
      .lean();

    res.json({ success: true, trades });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Broker Reports
app.get('/api/admin/reports/broker-reports', async (req, res) => {
  try {
    const { from, to } = req.query;
    const dateQuery = {};
    if (from) dateQuery.$gte = new Date(from);
    if (to) dateQuery.$lte = new Date(to + 'T23:59:59');

    // All brokers
    const brokers = await Admin.find({ role: 'broker' }).select('_id oderId name email isActive createdAt wallet').lean();

    const brokerIds = brokers.map(b => b._id);

    // Users per broker
    const usersByBroker = await User.aggregate([
      { $match: { parentAdminId: { $in: brokerIds } } },
      { $group: {
        _id: '$parentAdminId',
        userCount: { $sum: 1 },
        totalBalance: { $sum: '$wallet.balance' },
        totalDeposits: { $sum: '$wallet.totalDeposits' },
        totalWithdrawals: { $sum: '$wallet.totalWithdrawals' }
      }}
    ]);

    // Trades per broker (via their users)
    const usersByBrokerMap = {};
    usersByBroker.forEach(u => { usersByBrokerMap[u._id.toString()] = u; });

    // Get user IDs per broker
    const allBrokerUsers = await User.find({ parentAdminId: { $in: brokerIds } }).select('_id parentAdminId').lean();
    const userIdsByBroker = {};
    allBrokerUsers.forEach(u => {
      const bid = u.parentAdminId?.toString();
      if (bid) {
        if (!userIdsByBroker[bid]) userIdsByBroker[bid] = [];
        userIdsByBroker[bid].push(u._id);
      }
    });

    // Trade counts per broker
    const tradeQuery = {};
    if (from || to) tradeQuery.createdAt = dateQuery;
    const allUserIds = allBrokerUsers.map(u => u._id);
    const tradesByUser = await Trade.aggregate([
      { $match: { ...tradeQuery, userId: { $in: allUserIds } } },
      { $group: { _id: '$userId', tradeCount: { $sum: 1 }, totalPnL: { $sum: '$profit' } } }
    ]);
    const tradesByUserId = {};
    tradesByUser.forEach(t => { tradesByUserId[t._id.toString()] = t; });

    const tradesByBroker = {};
    allBrokerUsers.forEach(u => {
      const bid = u.parentAdminId?.toString();
      const td = tradesByUserId[u._id.toString()];
      if (bid && td) {
        if (!tradesByBroker[bid]) tradesByBroker[bid] = { tradeCount: 0, totalPnL: 0 };
        tradesByBroker[bid].tradeCount += td.tradeCount;
        tradesByBroker[bid].totalPnL += td.totalPnL;
      }
    });

    const totalBrokers = brokers.length;
    const activeBrokers = brokers.filter(b => b.isActive).length;

    const brokerList = brokers.map(b => {
      const bid = b._id.toString();
      const uData = usersByBrokerMap[bid] || {};
      const tData = tradesByBroker[bid] || {};
      return {
        _id: b._id,
        oderId: b.oderId,
        name: b.name,
        email: b.email,
        isActive: b.isActive,
        createdAt: b.createdAt,
        walletBalance: b.wallet?.balance || 0,
        userCount: uData.userCount || 0,
        totalBalance: uData.totalBalance || 0,
        totalDeposits: uData.totalDeposits || 0,
        totalWithdrawals: uData.totalWithdrawals || 0,
        tradeCount: tData.tradeCount || 0,
        totalPnL: tData.totalPnL || 0
      };
    }).sort((a, b) => b.userCount - a.userCount);

    res.json({
      success: true,
      report: {
        totalBrokers,
        activeBrokers,
        inactiveBrokers: totalBrokers - activeBrokers,
        totalUsers: usersByBroker.reduce((s, u) => s + u.userCount, 0),
        totalBalance: usersByBroker.reduce((s, u) => s + u.totalBalance, 0),
        totalDeposits: usersByBroker.reduce((s, u) => s + u.totalDeposits, 0),
        totalWithdrawals: usersByBroker.reduce((s, u) => s + u.totalWithdrawals, 0),
        totalTrades: Object.values(tradesByBroker).reduce((s, t) => s + t.tradeCount, 0),
        brokerList
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Sub-Admin Reports
app.get('/api/admin/reports/subadmin-reports', async (req, res) => {
  try {
    const { from, to } = req.query;
    const dateQuery = {};
    if (from) dateQuery.$gte = new Date(from);
    if (to) dateQuery.$lte = new Date(to + 'T23:59:59');

    // All sub-admins
    const subAdmins = await Admin.find({ role: 'sub_admin' }).select('_id oderId name email isActive createdAt wallet').lean();
    const subAdminIds = subAdmins.map(s => s._id);

    // Brokers per sub-admin
    const brokersBySubAdmin = await Admin.aggregate([
      { $match: { role: 'broker', parentId: { $in: subAdminIds } } },
      { $group: { _id: '$parentId', brokerCount: { $sum: 1 } } }
    ]);
    const brokersBySubAdminMap = {};
    brokersBySubAdmin.forEach(b => { brokersBySubAdminMap[b._id.toString()] = b.brokerCount; });

    // Get all broker IDs under each sub-admin
    const allBrokers = await Admin.find({ role: 'broker', parentId: { $in: subAdminIds } }).select('_id parentId').lean();
    const brokerIdsBySubAdmin = {};
    allBrokers.forEach(b => {
      const sid = b.parentId?.toString();
      if (sid) {
        if (!brokerIdsBySubAdmin[sid]) brokerIdsBySubAdmin[sid] = [];
        brokerIdsBySubAdmin[sid].push(b._id);
      }
    });

    // Users: direct (parentAdminId = sub-admin) + via brokers
    const allBrokerIds = allBrokers.map(b => b._id);

    const usersBySubAdmin = await User.aggregate([
      { $match: { parentAdminId: { $in: [...subAdminIds, ...allBrokerIds] } } },
      {
        $lookup: {
          from: 'admins',
          localField: 'parentAdminId',
          foreignField: '_id',
          as: 'parentAdmin'
        }
      },
      { $unwind: { path: '$parentAdmin', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          effectiveSubAdminId: {
            $cond: [
              { $eq: ['$parentAdmin.role', 'sub_admin'] },
              '$parentAdminId',
              '$parentAdmin.parentId'
            ]
          }
        }
      },
      {
        $group: {
          _id: '$effectiveSubAdminId',
          userCount: { $sum: 1 },
          totalBalance: { $sum: '$wallet.balance' },
          totalDeposits: { $sum: '$wallet.totalDeposits' }
        }
      }
    ]);
    const usersBySubAdminMap = {};
    usersBySubAdmin.forEach(u => { usersBySubAdminMap[u._id?.toString()] = u; });

    const totalSubAdmins = subAdmins.length;
    const activeSubAdmins = subAdmins.filter(s => s.isActive).length;

    const subAdminList = subAdmins.map(s => {
      const sid = s._id.toString();
      const uData = usersBySubAdminMap[sid] || {};
      return {
        _id: s._id,
        oderId: s.oderId,
        name: s.name,
        email: s.email,
        isActive: s.isActive,
        createdAt: s.createdAt,
        walletBalance: s.wallet?.balance || 0,
        brokerCount: brokersBySubAdminMap[sid] || 0,
        userCount: uData.userCount || 0,
        totalBalance: uData.totalBalance || 0,
        totalDeposits: uData.totalDeposits || 0
      };
    }).sort((a, b) => b.userCount - a.userCount);

    res.json({
      success: true,
      report: {
        totalSubAdmins,
        activeSubAdmins,
        inactiveSubAdmins: totalSubAdmins - activeSubAdmins,
        totalBrokers: allBrokers.length,
        totalUsers: usersBySubAdmin.reduce((s, u) => s + u.userCount, 0),
        totalBalance: usersBySubAdmin.reduce((s, u) => s + u.totalBalance, 0),
        subAdminList
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== ADMIN HIERARCHY MANAGEMENT ==============

// Admin Login
app.post('/api/admin/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const admin = await Admin.findOne({ email: email.toLowerCase() });
    if (!admin) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
    
    if (!admin.isActive) {
      return res.status(401).json({ success: false, error: 'Account is disabled' });
    }
    
    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      // Log failed login
      const userAgent = req.get('User-Agent') || '';
      await AdminActivityLog.logActivity({
        adminId: admin._id.toString(),
        oderId: admin.oderId,
        role: admin.role,
        activityType: 'failed_login',
        description: `Failed login attempt for ${admin.name}`,
        ipAddress: req.ip || req.connection?.remoteAddress,
        userAgent: userAgent,
        device: userAgent.includes('Mobile') ? 'mobile' : 'desktop',
        os: parseOS(userAgent),
        browser: parseBrowser(userAgent),
        status: 'failed'
      });
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
    
    admin.lastLogin = new Date();
    await admin.save();
    
    // Generate session ID for tracking session duration
    const sessionId = `${admin._id}-${Date.now()}`;
    
    // Log successful login
    const userAgent = req.get('User-Agent') || '';
    await AdminActivityLog.logActivity({
      adminId: admin._id.toString(),
      oderId: admin.oderId,
      role: admin.role,
      activityType: 'login',
      description: `${admin.role === 'sub_admin' ? 'Sub-Admin' : 'Broker'} logged in successfully`,
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
      admin: {
        _id: admin._id,
        oderId: admin.oderId,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        permissions: admin.permissions,
        wallet: admin.wallet,
        parentId: admin.parentId,
        parentOderId: admin.parentOderId,
        sessionId: sessionId
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin Logout (SubAdmin/Broker)
app.post('/api/admin/auth/logout', async (req, res) => {
  try {
    const { adminId, sessionId } = req.body;
    
    if (!adminId) {
      return res.status(400).json({ success: false, error: 'Admin ID required' });
    }
    
    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({ success: false, error: 'Admin not found' });
    }
    
    // Calculate session duration if sessionId provided
    let sessionDuration = null;
    if (sessionId) {
      const loginLog = await AdminActivityLog.findOne({ 
        adminId: admin._id.toString(), 
        activityType: 'login',
        sessionId: sessionId 
      });
      if (loginLog) {
        sessionDuration = Math.floor((Date.now() - new Date(loginLog.timestamp).getTime()) / 1000);
        // Update the login log with session duration
        await AdminActivityLog.updateOne({ _id: loginLog._id }, { sessionDuration });
      }
    }
    
    // Log logout activity
    const userAgent = req.get('User-Agent') || '';
    await AdminActivityLog.logActivity({
      adminId: admin._id.toString(),
      oderId: admin.oderId,
      role: admin.role,
      activityType: 'logout',
      description: `${admin.role === 'sub_admin' ? 'Sub-Admin' : 'Broker'} logged out${sessionDuration ? ` (Session: ${Math.floor(sessionDuration / 60)}m ${sessionDuration % 60}s)` : ''}`,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: userAgent,
      device: userAgent.includes('Mobile') ? 'mobile' : 'desktop',
      os: parseOS(userAgent),
      browser: parseBrowser(userAgent),
      status: 'success',
      sessionId: sessionId,
      sessionDuration: sessionDuration
    });
    
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all admins (for super admin - full hierarchy)
app.get('/api/admin/hierarchy', async (req, res) => {
  try {
    const { adminId } = req.query;
    
    let query = {};
    
    // If adminId provided, get that admin's children
    if (adminId) {
      const requestingAdmin = await Admin.findById(adminId);
      if (!requestingAdmin) {
        return res.status(404).json({ success: false, error: 'Admin not found' });
      }
      
      if (requestingAdmin.role === 'super_admin') {
        // Super admin sees all
        query = {};
      } else if (requestingAdmin.role === 'sub_admin') {
        // Sub admin sees their brokers
        query = { parentId: adminId };
      } else {
        // Broker sees nothing
        query = { _id: null };
      }
    }
    
    const admins = await Admin.find(query).select('-password').sort({ role: 1, createdAt: -1 });
    
    // Get user counts for each admin/broker
    const adminData = await Promise.all(admins.map(async (admin) => {
      const userCount = await User.countDocuments({ parentAdminId: admin._id });
      const childCount = await Admin.countDocuments({ parentId: admin._id });
      return {
        ...admin.toObject(),
        userCount,
        childCount
      };
    }));
    
    res.json({ success: true, admins: adminData });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get hierarchy tree (for visualization)
app.get('/api/admin/hierarchy/tree', async (req, res) => {
  try {
    // Get all admins
    const allAdmins = await Admin.find().select('-password').lean();
    
    // Get all users with their parent admin
    const allUsers = await User.find({ parentAdminId: { $ne: null } })
      .select('oderId name email wallet.balance isActive parentAdminId parentAdminOderId')
      .lean();
    
    // Build tree structure
    const buildTree = (parentId = null) => {
      const children = allAdmins.filter(a => 
        parentId === null ? a.parentId === null : a.parentId?.toString() === parentId?.toString()
      );
      
      return children.map(admin => {
        const users = allUsers.filter(u => u.parentAdminId?.toString() === admin._id.toString());
        return {
          ...admin,
          children: buildTree(admin._id),
          users: users
        };
      });
    };
    
    const tree = buildTree();
    
    // Also get users without parent (direct super admin users)
    const directUsers = await User.find({ parentAdminId: null })
      .select('oderId name email wallet.balance isActive')
      .lean();
    
    res.json({ 
      success: true, 
      tree,
      directUsers,
      stats: {
        totalAdmins: allAdmins.length,
        superAdmins: allAdmins.filter(a => a.role === 'super_admin').length,
        subAdmins: allAdmins.filter(a => a.role === 'sub_admin').length,
        brokers: allAdmins.filter(a => a.role === 'broker').length,
        totalUsers: allUsers.length + directUsers.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all subadmins and brokers for user assignment
app.get('/api/admin/hierarchy/subadmins', async (req, res) => {
  try {
    const subadmins = await Admin.find({ 
      role: { $in: ['sub_admin', 'broker'] },
      isActive: true 
    }).select('_id name email role phone').lean();
    
    res.json({ success: true, subadmins });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin: Create new user
app.post('/api/admin/users/create', async (req, res) => {
  try {
    const { name, email, phone, password, initialBalance, parentAdminId, isDemo } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Name, email, and password are required' });
    }
    
    // Check if email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ success: false, error: 'Email already registered' });
    }
    
    // Generate unique order ID
    const generateOrderId = () => {
      return Math.floor(100000 + Math.random() * 900000).toString();
    };
    
    let oderId = generateOrderId();
    while (await User.findOne({ oderId })) {
      oderId = generateOrderId();
    }
    
    // Hash password
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const newUser = new User({
      name,
      email: email.toLowerCase(),
      phone: phone || '',
      password: hashedPassword,
      oderId,
      isActive: true,
      isDemo: isDemo || false,
      parentAdminId: parentAdminId || null,
      wallet: {
        balance: parseFloat(initialBalance) || 0,
        credit: 0
      },
      allowedTradeModes: { hedging: true, netting: true, binary: true },
      allowedCurrencyDisplay: 'BOTH',
      createdAt: new Date()
    });
    
    await newUser.save();
    
    res.json({ 
      success: true, 
      message: 'User created successfully',
      user: {
        _id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        oderId: newUser.oderId
      }
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new admin (sub_admin or broker)
app.post('/api/admin/hierarchy/create', async (req, res) => {
  try {
    const { name, email, phone, password, role, parentId, createdBy } = req.body;
    
    if (!name || !email || !password || !role) {
      return res.status(400).json({ success: false, error: 'Name, email, password, and role are required' });
    }
    
    if (!['sub_admin', 'broker'].includes(role)) {
      return res.status(400).json({ success: false, error: 'Invalid role. Must be sub_admin or broker' });
    }
    
    // Check if email already exists
    const existingAdmin = await Admin.findOne({ email: email.toLowerCase() });
    if (existingAdmin) {
      return res.status(400).json({ success: false, error: 'Email already exists' });
    }
    
    // Generate admin ID
    const oderId = await Admin.generateAdminId(role);
    
    // Get parent info if provided
    let parentOderId = null;
    if (parentId) {
      const parent = await Admin.findById(parentId);
      if (parent) {
        parentOderId = parent.oderId;
      }
    }
    
    const admin = new Admin({
      oderId,
      name,
      email: email.toLowerCase(),
      phone,
      password,
      role,
      parentId: parentId || null,
      parentOderId,
      createdBy
    });
    
    await admin.save();
    
    res.json({
      success: true,
      admin: {
        _id: admin._id,
        oderId: admin.oderId,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        parentId: admin.parentId,
        parentOderId: admin.parentOderId,
        wallet: admin.wallet,
        permissions: admin.permissions,
        isActive: admin.isActive
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update admin
app.put('/api/admin/hierarchy/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, isActive, permissions, wallet, password } = req.body;
    
    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ success: false, error: 'Admin not found' });
    }
    
    if (name) admin.name = name;
    if (email) admin.email = email.toLowerCase();
    if (phone) admin.phone = phone;
    if (typeof isActive === 'boolean') admin.isActive = isActive;
    if (permissions) admin.permissions = { ...admin.permissions, ...permissions };
    if (wallet) admin.wallet = { ...admin.wallet, ...wallet };
    
    // Update password if provided (min 6 characters)
    if (password && password.length >= 6) {
      admin.password = password; // Will be hashed by pre-save hook
    }
    
    await admin.save();
    
    res.json({ success: true, admin });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete admin
app.delete('/api/admin/hierarchy/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ success: false, error: 'Admin not found' });
    }
    
    if (admin.role === 'super_admin') {
      return res.status(400).json({ success: false, error: 'Cannot delete super admin' });
    }
    
    // Check if admin has children
    const childCount = await Admin.countDocuments({ parentId: id });
    if (childCount > 0) {
      return res.status(400).json({ success: false, error: 'Cannot delete admin with sub-admins/brokers. Reassign them first.' });
    }
    
    // Check if admin has users
    const userCount = await User.countDocuments({ parentAdminId: id });
    if (userCount > 0) {
      return res.status(400).json({ success: false, error: 'Cannot delete admin with users. Reassign users first.' });
    }
    
    await Admin.findByIdAndDelete(id);
    
    res.json({ success: true, message: 'Admin deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get users under an admin/broker
app.get('/api/admin/hierarchy/:id/users', async (req, res) => {
  try {
    const { id } = req.params;
    
    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ success: false, error: 'Admin not found' });
    }
    
    let userQuery = {};
    
    if (admin.role === 'super_admin') {
      // Super admin sees all users
      userQuery = {};
    } else if (admin.role === 'sub_admin') {
      // Sub admin sees users under them and their brokers
      const brokerIds = await Admin.find({ parentId: id }).select('_id');
      const brokerIdList = brokerIds.map(b => b._id);
      userQuery = { 
        $or: [
          { parentAdminId: id },
          { parentAdminId: { $in: brokerIdList } }
        ]
      };
    } else {
      // Broker sees only their users
      userQuery = { parentAdminId: id };
    }
    
    const users = await User.find(userQuery)
      .select('oderId name email phone wallet isActive kycStatus parentAdminId parentAdminOderId createdAt')
      .sort({ createdAt: -1 });
    
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Assign user to admin/broker
app.post('/api/admin/hierarchy/assign-user', async (req, res) => {
  try {
    const { userId, adminId } = req.body;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    if (adminId) {
      const admin = await Admin.findById(adminId);
      if (!admin) {
        return res.status(404).json({ success: false, error: 'Admin not found' });
      }
      user.parentAdminId = admin._id;
      user.parentAdminOderId = admin.oderId;
    } else {
      user.parentAdminId = null;
      user.parentAdminOderId = null;
    }
    
    await user.save();
    
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Admin wallet fund request (to parent)
app.post('/api/admin/hierarchy/fund-request', async (req, res) => {
  try {
    const { adminId, amount, type, note } = req.body;
    
    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({ success: false, error: 'Admin not found' });
    }
    
    if (admin.role === 'super_admin') {
      return res.status(400).json({ success: false, error: 'Super admin cannot request funds' });
    }
    
    // Create fund request transaction
    const transaction = new Transaction({
      oderId: admin.oderId,
      userName: admin.name,
      type: type || 'deposit',
      amount,
      paymentMethod: 'wallet',
      status: 'pending',
      userNote: note || '',
      withdrawalInfo: {
        method: 'internal',
        requestedBy: admin.role,
        parentId: admin.parentId,
        parentOderId: admin.parentOderId
      }
    });
    
    await transaction.save();
    
    res.json({ success: true, transaction });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Approve fund request (deduct from parent wallet)
app.post('/api/admin/hierarchy/approve-fund', async (req, res) => {
  try {
    const { transactionId, approverId } = req.body;
    
    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }
    
    if (transaction.status !== 'pending') {
      return res.status(400).json({ success: false, error: 'Transaction already processed' });
    }
    
    // Find the requester (admin/broker or user)
    let requester = null;
    let isAdminRequest = false;
    
    // Check if this is an admin fund request (has adminRequesterId)
    if (transaction.adminRequesterId) {
      requester = await Admin.findById(transaction.adminRequesterId);
      isAdminRequest = true;
    } else {
      // Legacy: find by oderId
      requester = await Admin.findOne({ oderId: transaction.oderId });
      isAdminRequest = !!requester;
      
      if (!requester) {
        requester = await User.findOne({ oderId: transaction.oderId });
      }
    }
    
    if (!requester) {
      return res.status(404).json({ success: false, error: 'Requester not found' });
    }
    
    // Find the parent to deduct from
    let parent = null;
    if (transaction.adminParentId) {
      // For admin fund requests, use the stored parent ID
      parent = await Admin.findById(transaction.adminParentId);
      // If not found in Admin, check User model (legacy super admin)
      if (!parent && transaction.parentType === 'user') {
        parent = await User.findById(transaction.adminParentId);
      }
    } else if (isAdminRequest) {
      parent = await Admin.findById(requester.parentId);
    } else {
      parent = await Admin.findById(requester.parentAdminId);
    }
    
    // If no parent, check if approver is super admin
    let approver = await Admin.findById(approverId);
    let approverIsSuperAdmin = approver?.role === 'super_admin';
    
    // If approver not found in Admin, check User model (legacy super admin)
    if (!approver) {
      const approverUser = await User.findById(approverId);
      if (approverUser && approverUser.role === 'admin') {
        approver = approverUser;
        approverIsSuperAdmin = true;
      } else {
        return res.status(404).json({ success: false, error: 'Approver not found' });
      }
    }
    
    // Determine who pays - for legacy super admin (User model), they don't have wallet deduction
    let payer = parent || approver;
    let payerIsSuperAdmin = approverIsSuperAdmin || payer?.role === 'super_admin' || payer?.role === 'admin';
    
    if (!payerIsSuperAdmin && payer.wallet.balance < transaction.amount) {
      return res.status(400).json({ success: false, error: 'Insufficient balance in parent wallet' });
    }
    
    // Deduct from payer (unless super admin with unlimited)
    if (!payerIsSuperAdmin && payer.wallet) {
      payer.wallet.balance -= transaction.amount;
      payer.wallet.totalWithdrawals = (payer.wallet.totalWithdrawals || 0) + transaction.amount;
      await payer.save();
    }
    
    // Add to requester
    if (isAdminRequest) {
      requester.wallet.balance += transaction.amount;
      requester.wallet.totalDeposits += transaction.amount;
      await requester.save();
    } else {
      requester.wallet.balance += transaction.amount;
      requester.wallet.equity = requester.wallet.balance + requester.wallet.credit;
      requester.wallet.freeMargin = requester.wallet.equity - requester.wallet.margin;
      await requester.save();
    }
    
    // Update transaction
    transaction.status = 'approved';
    transaction.processedBy = approverId;
    transaction.processedAt = new Date();
    await transaction.save();
    
    res.json({ 
      success: true, 
      transaction,
      message: `Approved $${transaction.amount} for ${transaction.oderId}. Deducted from ${payer.oderId}`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get fund requests for an admin (requests from sub-admins and brokers ONLY - not users)
app.get('/api/admin/hierarchy/:id/fund-requests', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.query;
    
    // Check if id is a valid ObjectId or an oderId
    const isObjectId = mongoose.Types.ObjectId.isValid(id) && String(new mongoose.Types.ObjectId(id)) === id;
    
    // First check if this is a super_admin in Admin model
    let admin = null;
    let isSuperAdmin = false;
    let adminUser = null;
    
    if (isObjectId) {
      admin = await Admin.findById(id);
      isSuperAdmin = admin?.role === 'super_admin';
      
      // If not found in Admin model, check User model for legacy super admin
      if (!admin) {
        adminUser = await User.findById(id);
        if (adminUser && adminUser.role === 'admin') {
          isSuperAdmin = true;
        }
      }
    } else {
      // Try to find by oderId
      admin = await Admin.findOne({ oderId: id });
      isSuperAdmin = admin?.role === 'super_admin';
      
      if (!admin) {
        adminUser = await User.findOne({ oderId: id, role: 'admin' });
        if (adminUser) {
          isSuperAdmin = true;
        }
      }
    }
    
    if (!admin && !adminUser) {
      return res.status(404).json({ success: false, error: 'Admin not found' });
    }
    
    // Get the actual MongoDB _id for queries
    const adminMongoId = admin?._id || adminUser?._id;
    
    // This endpoint is for SUB-ADMIN and BROKER fund requests ONLY
    // User deposit/withdrawal requests are handled by /api/admin/transactions
    let adminFundRequestQuery = { type: 'admin_fund_request' };
    
    if (isSuperAdmin) {
      // SuperAdmin sees ALL admin fund requests (from sub-admins and brokers)
      // No additional filter needed
    } else if (admin?.role === 'sub_admin') {
      // Sub-admin sees fund requests from their brokers only
      adminFundRequestQuery.adminParentId = adminMongoId;
    } else {
      // Broker - brokers don't have children who can make fund requests
      // Return empty
      return res.json({ success: true, transactions: [] });
    }
    
    if (status) adminFundRequestQuery.status = status;
    
    // Fetch only admin fund requests (sub-admin and broker requests)
    let transactions = await Transaction.find(adminFundRequestQuery).sort({ createdAt: -1 });
    
    // Populate requester info for admin fund requests
    for (let req of transactions) {
      if (req.adminRequesterId) {
        const requester = await Admin.findById(req.adminRequesterId).select('name oderId role');
        if (requester) {
          req._doc.requesterName = requester.name;
          req._doc.requesterOderId = requester.oderId;
          req._doc.requesterRole = requester.role;
        }
      }
    }
    
    res.json({ success: true, transactions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create super admin (one-time setup)
app.post('/api/admin/setup-super-admin', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    // Check if super admin already exists
    const existingSuperAdmin = await Admin.findOne({ role: 'super_admin' });
    if (existingSuperAdmin) {
      return res.status(400).json({ success: false, error: 'Super admin already exists' });
    }
    
    const oderId = await Admin.generateAdminId('super_admin');
    
    const superAdmin = new Admin({
      oderId,
      email: email.toLowerCase(),
      password,
      name,
      role: 'super_admin'
    });
    
    await superAdmin.save();
    
    res.json({
      success: true,
      admin: {
        _id: superAdmin._id,
        oderId: superAdmin.oderId,
        email: superAdmin.email,
        name: superAdmin.name,
        role: superAdmin.role
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Adjust admin/broker wallet (add or deduct funds)
app.post('/api/admin/hierarchy/:id/wallet', async (req, res) => {
  try {
    const { id } = req.params;
    const { type, amount } = req.body;
    
    if (!type || !amount || amount <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid type or amount' });
    }
    
    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ success: false, error: 'Admin not found' });
    }
    
    const currentBalance = admin.wallet?.balance || 0;
    let newBalance;
    
    if (type === 'add') {
      newBalance = currentBalance + parseFloat(amount);
    } else if (type === 'subtract') {
      if (currentBalance < amount) {
        return res.status(400).json({ success: false, error: 'Insufficient balance' });
      }
      newBalance = currentBalance - parseFloat(amount);
    } else {
      return res.status(400).json({ success: false, error: 'Invalid type. Use "add" or "subtract"' });
    }
    
    admin.wallet = admin.wallet || {};
    admin.wallet.balance = newBalance;
    await admin.save();
    
    res.json({ 
      success: true, 
      message: `Successfully ${type === 'add' ? 'added' : 'deducted'} ₹${amount} ${type === 'add' ? 'to' : 'from'} wallet`,
      newBalance 
    });
  } catch (error) {
    console.error('Error adjusting admin wallet:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get brokers under a sub-admin
app.get('/api/admin/hierarchy/:id/brokers', async (req, res) => {
  try {
    const { id } = req.params;
    
    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ success: false, error: 'Admin not found' });
    }
    
    let brokers = [];
    
    if (admin.role === 'super_admin') {
      // Super admin sees all brokers
      brokers = await Admin.find({ role: 'broker' }).sort({ createdAt: -1 });
    } else if (admin.role === 'sub_admin') {
      // Sub admin sees only their brokers
      brokers = await Admin.find({ role: 'broker', parentId: id }).sort({ createdAt: -1 });
    }
    
    res.json({ success: true, brokers });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get trades under an admin/broker's users
app.get('/api/admin/hierarchy/:id/trades', async (req, res) => {
  try {
    const { id } = req.params;
    const { HedgingPosition, NettingPosition, BinaryTrade } = require('./models/Position');
    
    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ success: false, error: 'Admin not found' });
    }
    
    // Get user IDs under this admin
    let userQuery = {};
    if (admin.role === 'super_admin') {
      userQuery = {};
    } else if (admin.role === 'sub_admin') {
      const brokerIds = await Admin.find({ parentId: id }).select('_id');
      const brokerIdList = brokerIds.map(b => b._id);
      userQuery = { 
        $or: [
          { parentAdminId: id },
          { parentAdminId: { $in: brokerIdList } }
        ]
      };
    } else {
      userQuery = { parentAdminId: id };
    }
    
    const users = await User.find(userQuery).select('oderId');
    const userOderIds = users.map(u => u.oderId);
    
    if (userOderIds.length === 0) {
      return res.json({ success: true, trades: [] });
    }
    
    let allTrades = [];
    
    // Fetch hedging positions
    const hedging = await HedgingPosition.find({ userId: { $in: userOderIds } })
      .sort({ openTime: -1 })
      .limit(100);
    allTrades.push(...hedging.map(p => ({ 
      ...p.toObject(), 
      oderId: p.userId,
      mode: 'hedging',
      profit: p.profit || 0
    })));
    
    // Fetch netting positions
    const netting = await NettingPosition.find({ userId: { $in: userOderIds } })
      .sort({ openTime: -1 })
      .limit(100);
    allTrades.push(...netting.map(p => ({ 
      ...p.toObject(), 
      oderId: p.userId,
      mode: 'netting',
      openPrice: p.avgPrice,
      profit: p.profit || 0
    })));
    
    // Fetch binary trades
    const binary = await BinaryTrade.find({ userId: { $in: userOderIds } })
      .sort({ createdAt: -1 })
      .limit(100);
    allTrades.push(...binary.map(p => ({ 
      ...p.toObject(), 
      oderId: p.userId,
      mode: 'binary',
      side: p.direction,
      volume: p.amount,
      openPrice: p.entryPrice,
      profit: p.profit || 0
    })));
    
    // Sort all trades by openTime descending
    allTrades.sort((a, b) => new Date(b.openTime || b.createdAt) - new Date(a.openTime || a.createdAt));
    
    res.json({ success: true, trades: allTrades.slice(0, 200) });
  } catch (error) {
    console.error('Error fetching hierarchy trades:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all transactions (deposits + withdrawals) under an admin/broker's users
app.get('/api/admin/hierarchy/:id/all-transactions', async (req, res) => {
  try {
    const { id } = req.params;
    
    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ success: false, error: 'Admin not found' });
    }
    
    // Get user IDs under this admin
    let userQuery = {};
    if (admin.role === 'super_admin') {
      userQuery = {};
    } else if (admin.role === 'sub_admin') {
      const brokerIds = await Admin.find({ parentId: id }).select('_id');
      const brokerIdList = brokerIds.map(b => b._id);
      userQuery = { 
        $or: [
          { parentAdminId: id },
          { parentAdminId: { $in: brokerIdList } }
        ]
      };
    } else {
      userQuery = { parentAdminId: id };
    }
    
    const users = await User.find(userQuery).select('oderId');
    const userOderIds = users.map(u => u.oderId);
    
    const transactions = await Transaction.find({ 
      oderId: { $in: userOderIds }
    }).sort({ createdAt: -1 }).limit(200);
    
    res.json({ success: true, transactions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get deposits under an admin/broker's users
app.get('/api/admin/hierarchy/:id/deposits', async (req, res) => {
  try {
    const { id } = req.params;
    
    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ success: false, error: 'Admin not found' });
    }
    
    // Get user IDs under this admin
    let userQuery = {};
    if (admin.role === 'super_admin') {
      userQuery = {};
    } else if (admin.role === 'sub_admin') {
      const brokerIds = await Admin.find({ parentId: id }).select('_id');
      const brokerIdList = brokerIds.map(b => b._id);
      userQuery = { 
        $or: [
          { parentAdminId: id },
          { parentAdminId: { $in: brokerIdList } }
        ]
      };
    } else {
      userQuery = { parentAdminId: id };
    }
    
    const users = await User.find(userQuery).select('oderId');
    const userOderIds = users.map(u => u.oderId);
    
    const transactions = await Transaction.find({ 
      oderId: { $in: userOderIds },
      type: 'deposit'
    }).sort({ createdAt: -1 }).limit(100);
    
    res.json({ success: true, transactions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Assign user to admin/broker
app.put('/api/admin/users/:userId/assign-admin', async (req, res) => {
  try {
    const { userId } = req.params;
    const { parentAdminId } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    let parentAdminOderId = null;
    if (parentAdminId) {
      const parentAdmin = await Admin.findById(parentAdminId);
      if (parentAdmin) {
        parentAdminOderId = parentAdmin.oderId;
      }
    }

    user.parentAdminId = parentAdminId || null;
    user.parentAdminOderId = parentAdminOderId;
    await user.save();

    res.json({ 
      success: true, 
      message: 'User admin assignment updated',
      user: { parentAdminId: user.parentAdminId, parentAdminOderId: user.parentAdminOderId }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single admin details
app.get('/api/admin/hierarchy/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const admin = await Admin.findById(id).select('-password');
    
    if (!admin) {
      return res.status(404).json({ success: false, error: 'Admin not found' });
    }
    
    res.json({ success: true, admin });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get my fund requests (for sub-admin/broker)
app.get('/api/admin/hierarchy/:id/my-fund-requests', async (req, res) => {
  try {
    const { id } = req.params;
    
    const transactions = await Transaction.find({
      adminRequesterId: id,
      type: 'admin_fund_request'
    }).sort({ createdAt: -1 });
    
    res.json({ success: true, transactions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Request funds from parent admin
app.post('/api/admin/hierarchy/request-fund', async (req, res) => {
  try {
    const { requesterId, amount } = req.body;
    
    const requester = await Admin.findById(requesterId);
    if (!requester) {
      return res.status(404).json({ success: false, error: 'Requester not found' });
    }
    
    // Determine the parent to request from
    let parentAdminId = requester.parentId;
    let parentType = 'admin'; // Track if parent is in Admin or User model
    
    // If no parentId, SubAdmins request from SuperAdmin
    if (!parentAdminId && requester.role === 'sub_admin') {
      // First try to find super_admin in Admin model
      const superAdmin = await Admin.findOne({ role: 'super_admin' });
      if (superAdmin) {
        parentAdminId = superAdmin._id;
      } else {
        // Fall back to finding admin user in User model (legacy super admin)
        const adminUser = await User.findOne({ role: 'admin' });
        if (adminUser) {
          parentAdminId = adminUser._id;
          parentType = 'user';
        }
      }
    }
    
    // If still no parent found, return error
    if (!parentAdminId) {
      return res.status(400).json({ success: false, error: 'No parent admin to request from' });
    }
    
    const transaction = new Transaction({
      oderId: requester.oderId,
      type: 'admin_fund_request',
      amount,
      status: 'pending',
      adminRequesterId: requester._id,
      adminParentId: parentAdminId,
      parentType: parentType // Track which model the parent is in
    });
    
    await transaction.save();
    
    res.json({ success: true, transaction });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============== SOCKET.IO ==============

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Join user room for targeted updates
  socket.on('join', (userId) => {
    socket.join(userId);
    console.log(`User ${userId} joined room`);
  });

  // Subscribe to price updates
  socket.on('subscribePrices', (symbols) => {
    socket.join('prices');
  });

  // Subscribe to Zerodha live ticks
  socket.on('subscribeZerodhaTicks', async () => {
    socket.join('zerodha-ticks');
    console.log(`Client ${socket.id} subscribed to Zerodha ticks`);
    
    // Immediately fetch and send LTP for all subscribed instruments
    // This ensures prices are shown even when market is closed
    try {
      const ticks = await zerodhaService.fetchAndBroadcastLTP();
      if (ticks && ticks.length > 0) {
        socket.emit('zerodha-tick', ticks);
      }
    } catch (error) {
      // Silently ignore - WebSocket will provide live data when market opens
    }
  });

  socket.on('unsubscribeZerodhaTicks', () => {
    socket.leave('zerodha-ticks');
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Cache for spread settings to avoid DB query on every tick
let spreadSettingsCache = {};
let spreadCacheTime = 0;
const SPREAD_CACHE_DURATION = 60000; // Refresh cache every 60 seconds

// Function to get spread settings with caching
async function getSpreadSettingsForSymbol(symbol) {
  const now = Date.now();
  // Refresh cache if expired
  if (now - spreadCacheTime > SPREAD_CACHE_DURATION) {
    try {
      const allSpreads = await SpreadSetting.find({ isActive: true });
      spreadSettingsCache = {};
      allSpreads.forEach(s => {
        spreadSettingsCache[s.symbol.toUpperCase()] = s;
      });
      spreadCacheTime = now;
    } catch (error) {
      console.error('Error fetching spread settings:', error);
    }
  }
  return spreadSettingsCache[symbol?.toUpperCase()] || null;
}

// Helper to get pip size for a symbol
function getPipSizeForSymbol(symbol) {
  if (!symbol) return 0.01;
  const sym = symbol.toUpperCase();
  // Forex pairs
  if (sym.includes('JPY')) return 0.01;
  if (sym.includes('XAU') || sym.includes('GOLD')) return 0.01; // Gold
  if (sym.includes('XAG') || sym.includes('SILVER')) return 0.001; // Silver
  if (sym.includes('BTC') || sym.includes('ETH')) return 0.01; // Crypto
  if (sym.includes('USD') || sym.includes('EUR') || sym.includes('GBP')) return 0.0001; // Forex
  // Indian stocks - pips are in rupees
  return 0.05; // Default for Indian stocks
}

// ============== ADMIN SETTINGS ==============

// Admin settings model (in-memory for now, can be moved to DB)
let adminSettings = {
  siteName: 'SetupFX',
  siteUrl: 'https://SetupFX.com',
  supportEmail: 'support@SetupFX.com',
  maintenanceMode: false,
  registrationEnabled: true,
  demoAccountEnabled: true,
  minDeposit: 100,
  maxWithdrawal: 100000
};

// Get admin settings
app.get('/api/admin/settings', async (req, res) => {
  try {
    res.json({ success: true, settings: adminSettings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update admin settings
app.put('/api/admin/settings', async (req, res) => {
  try {
    const updates = req.body;
    adminSettings = { ...adminSettings, ...updates };
    res.json({ success: true, settings: adminSettings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Register Zerodha tick callback to broadcast raw ticks to clients
// Spread is applied client-side via segment settings (unified spread system)
zerodhaService.onTick(async (ticks) => {
  if (ticks && ticks.length > 0) {
    io.to('zerodha-ticks').emit('zerodha-tick', ticks);
  }
});

// ==================== NOTIFICATION ENDPOINTS ====================

// Get all notifications (admin)
app.get('/api/admin/notifications', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (page - 1) * limit;
    
    const notifications = await Notification.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('createdBy', 'name email')
      .lean();
    
    const total = await Notification.countDocuments();
    
    res.json({
      success: true,
      notifications,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send notification to all users (admin)
app.post('/api/admin/notifications/send', async (req, res) => {
  try {
    const { title, message, type = 'info', priority = 'normal', actionUrl, actionLabel, expiresAt, targetUsers } = req.body;
    
    if (!title || !message) {
      return res.status(400).json({ success: false, error: 'Title and message are required' });
    }
    
    const notification = new Notification({
      title,
      message,
      type,
      priority,
      actionUrl,
      actionLabel,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      targetType: targetUsers && targetUsers.length > 0 ? 'specific' : 'all',
      targetUsers: targetUsers || [],
      isActive: true
    });
    
    await notification.save();
    
    // Emit real-time notification via Socket.IO
    io.emit('new-notification', {
      _id: notification._id,
      title: notification.title,
      message: notification.message,
      type: notification.type,
      priority: notification.priority,
      createdAt: notification.createdAt
    });
    
    res.json({ success: true, notification, message: 'Notification sent successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete notification (admin)
app.delete('/api/admin/notifications/:id', async (req, res) => {
  try {
    const notification = await Notification.findByIdAndDelete(req.params.id);
    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }
    res.json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Toggle notification active status (admin)
app.patch('/api/admin/notifications/:id/toggle', async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }
    notification.isActive = !notification.isActive;
    await notification.save();
    res.json({ success: true, notification });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== USER NOTIFICATION ENDPOINTS ====================

// Get notifications for a user
app.get('/api/user/notifications/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50, unreadOnly = false } = req.query;
    
    const notifications = await Notification.getForUser(userId, { 
      limit: parseInt(limit),
      unreadOnly: unreadOnly === 'true'
    });
    
    res.json({ success: true, notifications });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get unread notification count for a user
app.get('/api/user/notifications/:userId/unread-count', async (req, res) => {
  try {
    const { userId } = req.params;
    const count = await Notification.getUnreadCount(userId);
    res.json({ success: true, count });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Mark notification as read
app.post('/api/user/notifications/:notificationId/read', async (req, res) => {
  try {
    const { notificationId } = req.params;
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ success: false, error: 'User ID required' });
    }
    
    await Notification.markAsRead(notificationId, userId);
    res.json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Mark all notifications as read for a user
app.post('/api/user/notifications/:userId/read-all', async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await Notification.markAllAsRead(userId);
    res.json({ success: true, message: `Marked ${result.count} notifications as read` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Auto-cleanup expired demo accounts
const cleanupExpiredDemoAccounts = async () => {
  try {
    const now = new Date();
    const expiredDemoUsers = await User.find({
      isDemo: true,
      demoExpiresAt: { $lt: now }
    });
    
    if (expiredDemoUsers.length > 0) {
      console.log(`[Demo Cleanup] Found ${expiredDemoUsers.length} expired demo accounts`);
      
      for (const user of expiredDemoUsers) {
        // Delete trades
        await Trade.deleteMany({ oderId: user.oderId });
        // Delete positions
        await HedgingPosition.deleteMany({ oderId: user.oderId });
        await NettingPosition.deleteMany({ oderId: user.oderId });
        await BinaryTrade.deleteMany({ oderId: user.oderId });
        // Delete user
        await User.deleteOne({ _id: user._id });
        console.log(`[Demo Cleanup] Deleted expired demo account: ${user.oderId} (${user.email})`);
      }
      
      console.log(`[Demo Cleanup] Cleaned up ${expiredDemoUsers.length} expired demo accounts`);
    }
  } catch (error) {
    console.error('[Demo Cleanup] Error:', error.message);
  }
};

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, async () => {
  console.log(`🚀 SetupFX Server running on port ${PORT}`);
  console.log(`📊 Trading Engines: Hedging, Netting, Binary`);
  
  // Initialize Zerodha service - auto-fetch instruments
  try {
    await zerodhaService.initialize();
    console.log(`📈 Zerodha: Instruments auto-synced`);
  } catch (error) {
    console.log(`📈 Zerodha: Will sync instruments when connected`);
  }
  
  // Run demo cleanup on startup
  await cleanupExpiredDemoAccounts();
  
  // Schedule demo cleanup every hour
  setInterval(cleanupExpiredDemoAccounts, 60 * 60 * 1000); // Every 1 hour
  console.log(`🧹 Demo Cleanup: Scheduled every hour`);
});

module.exports = { app, io };
