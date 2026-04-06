import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useMetaApiPrices } from '../../hooks/useMetaApiPrices';
import { useZerodhaTicks } from '../../hooks/useZerodhaTicks';
import { useUserPreferences } from '../../hooks/useUserPreferences';
import { useBrokerInstruments } from '../../hooks/useBrokerInstruments';
import { API_URL, instrumentsByCategory as defaultInstrumentsByCategory, allInstruments as defaultAllInstruments, DEFAULT_WATCHLIST, getTVSymbol } from './userConfig';
import { WATCHLIST_CATEGORY_TO_SEGMENT_CODE } from '../../constants/nettingSegmentUi';
import tradingSounds from '../../utils/sounds';
import socketService from '../../services/socketService';
import { mergeQuoteObject, resolveMetaapiLiveQuote } from '../../utils/pricePersistence';

const MARKET_STATE_LS = 'SetupFX-market-state';

function readMarketStateFromLS() {
  try {
    const raw = localStorage.getItem(MARKET_STATE_LS);
    if (raw) {
      const o = JSON.parse(raw);
      const tabs = Array.isArray(o.chartTabs) && o.chartTabs.length ? o.chartTabs.map(String).slice(0, 20) : null;
      const sym = typeof o.selectedSymbol === 'string' && o.selectedSymbol.trim() ? String(o.selectedSymbol).trim() : null;
      if (tabs && sym && tabs.includes(sym)) return { selectedSymbol: sym, chartTabs: tabs };
      if (tabs?.length) return { selectedSymbol: tabs[tabs.length - 1], chartTabs: tabs };
      if (sym) return { selectedSymbol: sym, chartTabs: [sym] };
    }
  } catch (_) {
    /* ignore */
  }
  return { selectedSymbol: 'XAUUSD', chartTabs: ['XAUUSD'] };
}

const FNO_CATEGORIES_FOR_EXPIRY = new Set([
  'NSE FUT',
  'NSE OPT',
  'MCX FUT',
  'MCX OPT',
  'BSE FUT',
  'BSE OPT'
]);

/** Hide Indian F&O whose expiry date is before today in IST (matches server UserInstruments cleanup). */
function isExpiredFnOInstrument(category, expiryRaw) {
  if (!FNO_CATEGORIES_FOR_EXPIRY.has(category) || expiryRaw == null || expiryRaw === '') return false;
  const d = new Date(expiryRaw);
  if (Number.isNaN(d.getTime())) return false;
  const istExp = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const istNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const exp0 = new Date(istExp.getFullYear(), istExp.getMonth(), istExp.getDate()).getTime();
  const now0 = new Date(istNow.getFullYear(), istNow.getMonth(), istNow.getDate()).getTime();
  return exp0 < now0;
}

function UserLayout({ user, onLogout }) {
  const location = useLocation();
  const navigate = useNavigate();

  // User preferences from database (with localStorage fallback)
  const { 
    preferences: userPrefs, 
    updatePreference,
    updatePreferences,
    addToWatchlist: addToWatchlistDb, 
    removeFromWatchlist: removeFromWatchlistDb,
    isInWatchlist,
    refreshPreferences,
    loading: preferencesLoading,
    synced: preferencesSynced
  } = useUserPreferences(user);

  // Theme state - synced with database preferences
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('SetupFX-dark-mode');
    const dark = saved === null ? true : saved === 'true';
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    return dark;
  });

  // Sync dark mode with database preferences
  useEffect(() => {
    if (userPrefs.darkMode !== undefined) {
      setIsDark(userPrefs.darkMode);
      document.documentElement.setAttribute('data-theme', userPrefs.darkMode ? 'dark' : 'light');
    }
  }, [userPrefs.darkMode]);

  // Active page state
  const [activePage, setActivePage] = useState(() => {
    const path = location.pathname;
    if (path.includes('/market')) return 'market';
    if (path.includes('/orders')) return 'orders';
    if (path.includes('/wallet')) return 'wallet';
    if (path.includes('/business')) return 'business';
    if (path.includes('/masters')) return 'masters';
    if (path.includes('/settings')) return 'settings';
    return 'home';
  });

  // System Notification State (from admin)
  const [systemNotifications, setSystemNotifications] = useState([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [showNotificationPanel, setShowNotificationPanel] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);

  // Trade Notification State (expiry, margin call, stop out)
  const [tradeNotifications, setTradeNotifications] = useState([]);

  // KYC State
  const [kycStatus, setKycStatus] = useState({ status: 'not_submitted', kyc: null });
  const [kycForm, setKycForm] = useState({
    documentType: 'aadhaar',
    documentNumber: '',
    fullName: '',
    dateOfBirth: '',
    address: '',
    frontImage: '',
    backImage: '',
    selfieImage: ''
  });
  const [kycSubmitting, setKycSubmitting] = useState(false);

  // Chart and trading state (restore from localStorage immediately; then DB prefs when synced)
  const lsMarket = readMarketStateFromLS();
  const [selectedSymbol, setSelectedSymbol] = useState(lsMarket.selectedSymbol);
  const [chartTabs, setChartTabs] = useState(lsMarket.chartTabs);
  const marketHydratedFromDbRef = useRef(false);
  const [activeTab, setActiveTab] = useState('positions');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState('FAVOURITES');
  const [instrumentsPanelCollapsed, setInstrumentsPanelCollapsed] = useState(false);
  const [expandedSegments, setExpandedSegments] = useState({});
  
  // Mobile menu state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileMarketTab, setMobileMarketTab] = useState('instruments'); // 'instruments', 'chart', 'history'
  const [mobileShowChartBelow, setMobileShowChartBelow] = useState(false);
  const [mobileStatusOpen, setMobileStatusOpen] = useState(false);

  useEffect(() => {
    marketHydratedFromDbRef.current = false;
  }, [user?.oderId, user?.id]);

  // Listen for trade notifications (expiry, margin call, stop out)
  useEffect(() => {
    const handleTradeNotification = (event) => {
      const { message, type } = event.detail;
      const id = Date.now();
      setTradeNotifications(prev => [...prev, { id, message, type }]);
      // Auto-remove after 10 seconds
      setTimeout(() => {
        setTradeNotifications(prev => prev.filter(n => n.id !== id));
      }, 10000);
    };
    window.addEventListener('tradeNotification', handleTradeNotification);
    return () => window.removeEventListener('tradeNotification', handleTradeNotification);
  }, []);

  // After preferences sync from API: apply saved market symbol/tabs (overrides localStorage when DB has data)
  useEffect(() => {
    if (preferencesLoading || !preferencesSynced) return;
    if (marketHydratedFromDbRef.current) return;
    const s = userPrefs.lastSelectedSymbol;
    const tabs = Array.isArray(userPrefs.chartTabs) ? userPrefs.chartTabs.filter(Boolean) : [];
    if ((!s || !String(s).trim()) && tabs.length === 0) {
      marketHydratedFromDbRef.current = true;
      return;
    }
    marketHydratedFromDbRef.current = true;
    let nextTabs = tabs.length ? [...new Set(tabs.map(String))].slice(0, 20) : [];
    const sym = s && String(s).trim();
    if (sym && !nextTabs.includes(sym)) nextTabs = [...nextTabs, sym];
    if (nextTabs.length === 0) nextTabs = ['XAUUSD'];
    const sel = sym && nextTabs.includes(sym) ? sym : nextTabs[nextTabs.length - 1];
    setChartTabs(nextTabs);
    setSelectedSymbol(sel);
    try {
      localStorage.setItem(MARKET_STATE_LS, JSON.stringify({ selectedSymbol: sel, chartTabs: nextTabs }));
    } catch (_) {
      /* ignore */
    }
  }, [
    preferencesLoading,
    preferencesSynced,
    userPrefs.lastSelectedSymbol,
    userPrefs.chartTabs
  ]);

  useEffect(() => {
    if (!selectedSymbol) return;
    setChartTabs((prev) => (prev.includes(selectedSymbol) ? prev : [...prev, selectedSymbol]));
  }, [selectedSymbol]);

  useEffect(() => {
    try {
      localStorage.setItem(MARKET_STATE_LS, JSON.stringify({ selectedSymbol, chartTabs }));
    } catch (_) {
      /* ignore */
    }
    const loggedIn = !!(user?.oderId || user?.id || localStorage.getItem('SetupFX-token'));
    if (!loggedIn || !preferencesSynced) return;
    const t = setTimeout(() => {
      updatePreferences({
        lastSelectedSymbol: selectedSymbol,
        chartTabs: chartTabs.slice(0, 20)
      });
    }, 600);
    return () => clearTimeout(t);
  }, [selectedSymbol, chartTabs, user?.oderId, user?.id, preferencesSynced, updatePreferences]);

  // Instruments state - loaded from database for persistence across devices
  const [instrumentsByCategory, setInstrumentsByCategory] = useState(defaultInstrumentsByCategory);
  const [instrumentsLoaded, setInstrumentsLoaded] = useState(false);
  /** null = not loaded yet; object maps netting segment code → { isActive, tradingEnabled } */
  const [nettingSegmentBlockByCode, setNettingSegmentBlockByCode] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const loadSegmentBlocks = async () => {
      try {
        const headers = {};
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('SetupFX-token') : null;
        if (token) headers.Authorization = `Bearer ${token}`;
        const uid = user?.oderId || user?.id;
        const q = uid ? `?userId=${encodeURIComponent(uid)}` : '';
        const res = await fetch(`${API_URL}/api/user/all-segment-settings${q}`, { headers });
        const data = await res.json();
        if (cancelled) return;
        if (data.success && data.settings && typeof data.settings === 'object') {
          const map = {};
          for (const [name, s] of Object.entries(data.settings)) {
            map[name] = {
              isActive: s.isActive !== false,
              tradingEnabled: s.tradingEnabled !== false
            };
          }
          setNettingSegmentBlockByCode(map);
        } else {
          setNettingSegmentBlockByCode({});
        }
      } catch {
        if (!cancelled) setNettingSegmentBlockByCode({});
      }
    };
    loadSegmentBlocks();
    const t = setInterval(loadSegmentBlocks, 60000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [user?.oderId, user?.id]);

  // International categories — instruments must NOT have Zerodha tokens or Indian categories
  // to prevent getInstrumentWithLivePrice from using INR price sources
  const INTERNATIONAL_CATEGORIES = new Set([
    'Forex', 'Indices', 'Commodities', 'Crypto Perpetual', 'Stocks (International)', 'Crypto Options'
  ]);
  // Map watchlist category name → correct instrument category for price resolution
  const INTL_CATEGORY_MAP = {
    'Forex': 'forex',
    'Indices': 'indices',
    'Commodities': 'commodity',
    'Crypto Perpetual': 'crypto_perpetual',
    'Stocks (International)': 'stocks',
    'Crypto Options': 'crypto_options'
  };

  const visibleInstrumentsByCategory = useMemo(() => {
    const stripExpired = (cat, list) =>
      (list || []).filter((inst) => !isExpiredFnOInstrument(cat, inst.expiry));

    /** For international categories, strip token and set proper category so
     *  getInstrumentWithLivePrice uses MetaAPI/Delta (USD) not Zerodha (INR) */
    const sanitizeInternational = (cat, list) => {
      if (!INTERNATIONAL_CATEGORIES.has(cat)) return list;
      const resolvedCat = INTL_CATEGORY_MAP[cat] || cat.toLowerCase().replace(/ /g, '_');
      return (list || []).map((inst) => {
        if (!inst.token && inst.category === resolvedCat) return inst;
        // Strip token and fix category
        const { token, ...rest } = inst;
        return { ...rest, category: resolvedCat };
      });
    };

    if (nettingSegmentBlockByCode == null) {
      const out = {};
      for (const [cat, list] of Object.entries(instrumentsByCategory)) {
        out[cat] = sanitizeInternational(cat, stripExpired(cat, list));
      }
      return out;
    }
    const out = {};
    for (const [cat, list] of Object.entries(instrumentsByCategory)) {
      const code = WATCHLIST_CATEGORY_TO_SEGMENT_CODE[cat];
      if (!code) {
        out[cat] = sanitizeInternational(cat, stripExpired(cat, list));
        continue;
      }
      const b = nettingSegmentBlockByCode[code];
      if (b && b.isActive === false) continue;
      out[cat] = sanitizeInternational(cat, stripExpired(cat, list));
    }
    return out;
  }, [instrumentsByCategory, nettingSegmentBlockByCode]);

  // Load user instruments from database on mount
  useEffect(() => {
    const loadUserInstruments = async () => {
      if (!user?.id && !user?.oderId) {
        setInstrumentsLoaded(true);
        return;
      }
      
      try {
        const userId = user.oderId || user.id;
        const res = await fetch(`${API_URL}/api/user/instruments/${userId}`);
        const data = await res.json();
        
        if (data.success && data.instruments) {
          if (data.watchlistPruned) {
            refreshPreferences();
          }
          // Merge DB instruments with defaults; fold legacy keys into canonical categories
          setInstrumentsByCategory(prev => {
            const db = { ...data.instruments };
            const merged = { ...prev };
            delete merged.Crypto;

            // Merge DB Commodities with default Commodities (deduplicate by symbol)
            {
              const comKey = 'Commodities';
              const dbCom = db[comKey] || [];
              const defaultCom = merged[comKey] || [];
              const allCom = [...dbCom];
              const seen = new Set(allCom.map((i) => i.symbol));
              for (const i of defaultCom) {
                if (!seen.has(i.symbol)) {
                  seen.add(i.symbol);
                  allCom.push(i);
                }
              }
              merged[comKey] = allCom;
              delete db[comKey]; // Already handled; skip in the general loop below
            }

            const perpKey = 'Crypto Perpetual';
            const legacyCrypto = db.Crypto || [];
            const hasPerpInDb = Object.prototype.hasOwnProperty.call(db, perpKey);
            let cryptoPerp = hasPerpInDb ? [...(db[perpKey] || [])] : [...(merged[perpKey] || [])];
            const seenPerp = new Set(cryptoPerp.map((i) => i.symbol));
            for (const i of legacyCrypto) {
              if (!seenPerp.has(i.symbol)) {
                seenPerp.add(i.symbol);
                cryptoPerp.push(i);
              }
            }
            merged[perpKey] = cryptoPerp;

            Object.keys(db).forEach((category) => {
              if (category === 'Crypto' || category === 'Crypto Perpetual') return;
              if (merged[category] !== undefined) {
                merged[category] = db[category];
              }
            });
            return merged;
          });
        }
      } catch (error) {
        console.error('Error loading user instruments:', error);
      } finally {
        setInstrumentsLoaded(true);
      }
    };
    
    loadUserInstruments();
  }, [user?.id, user?.oderId, refreshPreferences]);

  // Flat list for search / resolution: use visible lists (segment blocks + expired F&O stripped)
  const allInstruments = Object.entries(visibleInstrumentsByCategory).flatMap(([category, instruments]) =>
    instruments.map((inst) => ({ ...inst, category: category.toLowerCase().replace(/ /g, '_') }))
  );

  // Add instrument to category (saves to database for persistence)
  const addInstrumentToCategory = async (instrument, categoryKey) => {
    // Map segment key to category name
    const segmentToCategory = {
      'nseEq': 'NSE EQ',
      'bseEq': 'BSE EQ',
      'nseFut': 'NSE FUT',
      'nseOpt': 'NSE OPT',
      'mcxFut': 'MCX FUT',
      'mcxOpt': 'MCX OPT',
      'bseFut': 'BSE FUT',
      'bseOpt': 'BSE OPT',
      // Crypto segments (Delta Exchange)
      'cryptoPerpetual': 'Crypto Perpetual',
      'cryptoFutures': 'Crypto Perpetual',
      'cryptoOptions': 'Crypto Options'
    };
    const category = segmentToCategory[categoryKey] || categoryKey;
    
    console.log('Adding instrument to category:', instrument.symbol, '->', category);
    
    const instrumentData = {
      symbol: instrument.symbol,
      name: instrument.name || instrument.symbol,
      lotSize: instrument.lotSize || 1,
      tickSize: instrument.tickSize || 0.05,
      token: instrument.token,
      exchange: instrument.exchange,
      expiry: instrument.expiry,
      instrumentType: instrument.instrumentType || ''
    };
    
    // Update local state immediately (create category if it doesn't exist)
    setInstrumentsByCategory(prev => {
      const existingInstruments = prev[category] || [];
      // Check if already exists
      if (existingInstruments.some(i => i.symbol === instrument.symbol)) {
        console.log('Instrument already exists in category:', instrument.symbol);
        return prev;
      }
      return {
        ...prev,
        [category]: [...existingInstruments, instrumentData]
      };
    });
    
    // Save to database for persistence across devices
    if (user?.id || user?.oderId) {
      try {
        const userId = user.oderId || user.id;
        await fetch(`${API_URL}/api/user/instruments/${userId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category, instrument: instrumentData })
        });
      } catch (error) {
        console.error('Error saving instrument to DB:', error);
      }
    }
  };

  // Remove instrument from category (removes from database)
  const removeInstrumentFromCategory = async (symbol, categoryKey) => {
    const segmentToCategory = {
      'nseEq': 'NSE EQ',
      'bseEq': 'BSE EQ',
      'nseFut': 'NSE FUT',
      'nseOpt': 'NSE OPT',
      'mcxFut': 'MCX FUT',
      'mcxOpt': 'MCX OPT',
      'bseFut': 'BSE FUT',
      'bseOpt': 'BSE OPT'
    };
    const category = segmentToCategory[categoryKey] || categoryKey;
    
    // Update local state immediately
    setInstrumentsByCategory(prev => ({
      ...prev,
      [category]: prev[category].filter(i => i.symbol !== symbol)
    }));
    
    // Remove from database
    if (user?.id || user?.oderId) {
      try {
        const userId = user.oderId || user.id;
        await fetch(`${API_URL}/api/user/instruments/${userId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category, symbol })
        });
      } catch (error) {
        console.error('Error removing instrument from DB:', error);
      }
    }
  };

  // Watchlist - synced with database preferences
  // Use userPrefs.watchlist directly as the source of truth
  const watchlist = userPrefs.watchlist || DEFAULT_WATCHLIST;
  
  // Setter that updates both local display and database
  const setWatchlist = useCallback((updater) => {
    // This is a no-op since we use userPrefs.watchlist directly
    // All updates go through addToWatchlistDb/removeFromWatchlistDb
    console.log('setWatchlist called - use addToWatchlist/removeFromWatchlist instead');
  }, []);

  // Delta Exchange prices (for crypto futures & options)
  const [deltaPrices, setDeltaPrices] = useState({});

  // Subscribe to Delta Exchange price updates
  useEffect(() => {
    const socket = socketService.getSocket();
    if (!socket) return;

    const handleDeltaPricesBatch = (prices) => {
      setDeltaPrices((prev) => {
        const next = { ...prev };
        for (const [sym, p] of Object.entries(prices)) {
          next[sym] = mergeQuoteObject(prev[sym], p);
        }
        return next;
      });
    };

    const handleDeltaPriceTick = (priceData) => {
      if (priceData && priceData.symbol) {
        const sym = priceData.symbol;
        setDeltaPrices((prev) => ({
          ...prev,
          [sym]: mergeQuoteObject(prev[sym], priceData)
        }));
      }
    };

    socket.on('delta_prices_batch', handleDeltaPricesBatch);
    socket.on('delta_price_tick', handleDeltaPriceTick);

    return () => {
      socket.off('delta_prices_batch', handleDeltaPricesBatch);
      socket.off('delta_price_tick', handleDeltaPriceTick);
    };
  }, []);

  // Trading state
  const [oneClickMode, setOneClickMode] = useState(false);
  const [oneClickLotSize, setOneClickLotSize] = useState('0.01');
  const [hoveredInstrument, setHoveredInstrument] = useState(null);
  const [tradingMode, setTradingMode] = useState('netting'); // Default to netting (required for Indian instruments)
  const [allowedTradeModes, setAllowedTradeModes] = useState({ hedging: false, netting: true, binary: false }); // Default: only Netting for regular users
  const [hedgingSettings, setHedgingSettings] = useState({ allowIndianInstruments: false });
  const [binarySettings, setBinarySettings] = useState({ 
    allowedExpiries: [60, 300, 900, 3600, 14400, 86400],
    minTradeAmount: 100,
    maxTradeAmount: 1000000,
    payoutPercent: 85
  });
  
  // Segment spread settings (keyed by segment name, e.g. { FOREX: { spreadType: 'fixed', spreadPips: 5 } })
  const [segmentSpreads, setSegmentSpreads] = useState({});
  const [scriptSpreads, setScriptSpreads] = useState({}); // Per-symbol spread overrides

  // Fetch segment + script spread settings when trading mode changes
  useEffect(() => {
    const fetchSpreads = async () => {
      try {
        const res = await fetch(`${API_URL}/api/user/segment-spreads?mode=${tradingMode}`);
        const data = await res.json();
        if (data.success) {
          setSegmentSpreads(data.spreads || {});
          setScriptSpreads(data.scriptSpreads || {});
        }
      } catch (err) {
        console.error('Error fetching segment spreads:', err);
      }
    };
    if (tradingMode === 'netting' || tradingMode === 'hedging') fetchSpreads();
  }, [tradingMode]);

  // Indian exchanges list
  const indianExchanges = ['NSE', 'BSE', 'NFO', 'BFO', 'MCX', 'CDS'];
  
  // Allowed currency display setting from admin
  const [allowedCurrencyDisplay, setAllowedCurrencyDisplay] = useState('BOTH'); // USD, INR, BOTH
  
  // Fetch user's allowed trade modes from server
  useEffect(() => {
    const fetchAllowedTradeModes = async () => {
      if (!user?.id && !user?.oderId) return;
      try {
        const userId = user.oderId || user.id;
        const res = await fetch(`${API_URL}/api/admin/users/${userId}`);
        const data = await res.json();
        if (data.success && data.user) {
          let modes;
          
          // Check if user is demo account
          const isDemo = data.user.isDemo || user?.isDemo;
          
          if (isDemo) {
            // Demo accounts: show all trade modes (Hedging + Netting + Binary)
            modes = { hedging: true, netting: true, binary: true };
          } else {
            // Regular users: only show Netting mode by default
            // Admin can override this via allowedTradeModes setting
            modes = data.user.allowedTradeModes || { hedging: false, netting: true, binary: false };
          }
          
          // Netting is always enabled (compulsory for Indian instruments)
          modes.netting = true;
          setAllowedTradeModes(modes);
          // Set trading mode to netting by default
          setTradingMode('netting');
          
          // Set allowed currency display
          const currencyDisplay = data.user.allowedCurrencyDisplay || 'BOTH';
          setAllowedCurrencyDisplay(currencyDisplay);
          // If user's current display currency is not allowed, switch to allowed one
          if (currencyDisplay === 'USD' && displayCurrency === 'INR') {
            handleCurrencyChange('USD');
          } else if (currencyDisplay === 'INR' && displayCurrency === 'USD') {
            handleCurrencyChange('INR');
          }
        }
      } catch (error) {
        console.error('Error fetching trade modes:', error);
      }
    };
    fetchAllowedTradeModes();
  }, [user?.id, user?.oderId]);
  
  // Fetch trade mode settings from API (database)
  useEffect(() => {
    const fetchTradeModeSettings = async () => {
      try {
        const res = await fetch(`${API_URL}/api/settings/trade-modes`);
        const data = await res.json();
        
        if (data.hedging) {
          setHedgingSettings(data.hedging);
        }
        if (data.binary) {
          // Parse expiryOptions
          let expiries = data.binary.expiryOptions || data.binary.allowedExpiries;
          if (typeof expiries === 'string') {
            expiries = expiries.split(',').map(e => parseInt(e.trim())).filter(e => !isNaN(e));
          }
          setBinarySettings({
            allowedExpiries: Array.isArray(expiries) && expiries.length > 0 ? expiries : [60, 300, 900, 3600, 14400, 86400],
            minTradeAmount: typeof data.binary.minTradeAmount === 'number' ? data.binary.minTradeAmount : 100,
            maxTradeAmount: typeof data.binary.maxTradeAmount === 'number' ? data.binary.maxTradeAmount : 1000000,
            payoutPercent: data.binary.payoutPercent ?? 85
          });
        }
      } catch (error) {
        console.error('Error fetching trade mode settings:', error);
      }
    };
    fetchTradeModeSettings();
  }, []);

  // Currency state - synced with database preferences
  const [usdInrRate, setUsdInrRate] = useState(83);
  const [usdMarkup, setUsdMarkup] = useState(0);
  const [displayCurrency, setDisplayCurrency] = useState('INR');

  // Sync display currency with database preferences
  useEffect(() => {
    if (userPrefs.displayCurrency) {
      setDisplayCurrency(userPrefs.displayCurrency);
    }
  }, [userPrefs.displayCurrency]);

  // Netting mode state
  const [orderSession, setOrderSession] = useState('intraday');

  // Binary mode state
  const [binaryDirection, setBinaryDirection] = useState('up');
  const [binaryAmount, setBinaryAmount] = useState(100);
  const [binaryExpiry, setBinaryExpiry] = useState(300);

  // Clamp stake when admin INR limits or display currency / rate change (limits are always in ₹)
  useEffect(() => {
    const minInr = Number(binarySettings?.minTradeAmount);
    const maxInr = Number(binarySettings?.maxTradeAmount);
    if (!Number.isFinite(minInr) || minInr <= 0 || !Number.isFinite(maxInr) || maxInr < minInr) return;
    const rate = (Number(usdInrRate) || 83) + (Number(usdMarkup) || 0);
    setBinaryAmount((prev) => {
      const stakeInr = displayCurrency === 'INR' ? prev : prev * rate;
      const clampedInr = Math.min(maxInr, Math.max(minInr, stakeInr));
      if (displayCurrency === 'INR') return Math.round(clampedInr);
      return Math.round((clampedInr / rate) * 10000) / 10000;
    });
  }, [binarySettings.minTradeAmount, binarySettings.maxTradeAmount, displayCurrency, usdInrRate, usdMarkup]);

  // Positions state
  const [positions, setPositions] = useState([]);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [tradeHistory, setTradeHistory] = useState([]);
  const [cancelledOrders, setCancelledOrders] = useState([]);
  const [totalPnL, setTotalPnL] = useState(0);

  // Orders page state
  const [ordersActiveTab, setOrdersActiveTab] = useState('open');
  const [orderDateFrom, setOrderDateFrom] = useState('');
  const [orderDateTo, setOrderDateTo] = useState('');

  // Notifications
  const [notifications, setNotifications] = useState([]);

  // Wallet state
  const [walletData, setWalletData] = useState({
    balance: 0,
    credit: 0,
    equity: 0,
    margin: 0,
    freeMargin: 0,
    marginLevel: 0
  });

  // Modal states
  const [showEditModal, setShowEditModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState(null);
  const [editSL, setEditSL] = useState('');
  const [editTP, setEditTP] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [closeVolume, setCloseVolume] = useState('');

  // Order state
  const [orderSide, setOrderSide] = useState('buy');
  const [orderType, setOrderType] = useState('market');
  const [volume, setVolume] = useState(0.01);
  const [marginPercent, setMarginPercent] = useState(25);
  const [limitPrice, setLimitPrice] = useState('');
  const [stopPrice, setStopPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [slPips, setSlPips] = useState(50);
  const [tpPips, setTpPips] = useState(100);

  // Timer tick for binary countdown
  const [timerTick, setTimerTick] = useState(0);

  // Refs
  const lastGoodWalletRef = useRef(null);
  const lastGoodMarginRef = useRef(0); // Track last known good margin to prevent flickering
  const positionsRef = useRef([]);
  const positionsEmptyMarginClearTimerRef = useRef(null);
  const prevOpenPositionCountRef = useRef(-1);
  const prevBinaryPositionsRef = useRef([]);
  const isInitialLoadRef = useRef(true);

  useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);

  // MetaAPI prices (for Forex/Crypto)
  const { prices: livePrices, isConnected: isMetaApiConnected, executeOrder, oneClickPending } =
    useMetaApiPrices();

  // Zerodha prices (for Indian markets)
  const {
    ticks: zerodhaTicks,
    isConnected: isZerodhaConnected,
    zerodhaStatus,
    getTickByToken,
    subscribedInstruments,
    getTickBySymbolAuto,
    refreshStatus: zerodhaRefreshStatus
  } = useZerodhaTicks();

  // All broker instruments (480+ symbols from MetaAPI) - MT5 style search
  const { 
    allInstruments: brokerInstruments, 
    searchResults: brokerSearchResults,
    isLoading: brokerInstrumentsLoading,
    categories: brokerCategories,
    categoryNames: brokerCategoryNames,
    searchInstruments: searchBrokerInstruments,
    getByCategory: getBrokerByCategory,
    getInstrument: getBrokerInstrument
  } = useBrokerInstruments();

  // Save active page to database (debounced via useUserPreferences)
  useEffect(() => {
    if (activePage) {
      updatePreference('activePage', activePage);
    }
  }, [activePage, updatePreference]);

  // Save watchlist to database when it changes locally
  useEffect(() => {
    if (watchlist && watchlist.length > 0) {
      updatePreference('watchlist', watchlist);
    }
  }, [watchlist, updatePreference]);

  // Handle currency change - saves to database
  const handleCurrencyChange = (currency) => {
    setDisplayCurrency(currency);
    updatePreference('displayCurrency', currency);
  };

  // Format instrument quotes in native currency only (toggle does not change bid/ask — see formatMargin on Market for wallet-style amounts)
  const formatPrice = (price, symbol, _forceConvert = true) => {
    if (price === '' || price === null || price === undefined) return '-';
    const n = Number(price);
    if (Number.isNaN(n)) return '-';

    // If no symbol provided, default to USD
    if (!symbol) return '$' + n.toFixed(4);

    const symU = String(symbol).toUpperCase();

    // 1. Precise Category Coordination: Ensure Indian symbols unambiguously receive ₹
    // This runs before anything else to prevent false positive substring collisions (e.g. 'CRUDEOIL' matching 'OIL')
    if (isIndianMarketSymbol(symbol)) {
      return '₹' + n.toFixed(2);
    }

    // 2. Known Forex pairs - always show $ with 4/2 decimals
    const forexPairs = new Set([
      'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD',
      'EURGBP', 'EURJPY', 'GBPJPY', 'EURCHF', 'EURAUD', 'GBPAUD', 'AUDNZD',
      'CADJPY', 'AUDCAD', 'EURNZD', 'GBPNZD', 'CHFJPY', 'AUDCHF', 'AUDJPY',
      'CADCHF', 'EURCAD', 'GBPCAD', 'GBPCHF', 'NZDCAD', 'NZDCHF', 'NZDJPY'
    ]);
    if (forexPairs.has(symU)) {
      if (symU.includes('JPY')) return '$' + n.toFixed(2);
      return '$' + n.toFixed(4);
    }

    // 3. Commodities (Gold, Silver, Oil) - always show $
    if (symU.includes('XAU') || symU.includes('XAG') || symU.includes('OIL')) {
      return '$' + n.toFixed(2);
    }

    // 4. Indices - always show $
    if (symU.includes('US30') || symU.includes('US100') || symU.includes('US500') ||
        symU.includes('UK100') || symU.includes('DE30') || symU.includes('JP225')) {
      return '$' + n.toFixed(2);
    }

    // 5. Crypto perpetuals (BTCUSD, ETHUSD, etc.) - always show $
    const isPerpetual = symU.endsWith('USD') && symU.length > 6 &&
                        !symU.includes('/') && !symU.includes('XAU') && !symU.includes('XAG');
    const isDeltaExchangeInstrument = symU.startsWith('C-') || symU.startsWith('P-') || isPerpetual;
    if (isDeltaExchangeInstrument) {
      return '$' + n.toFixed(2);
    }

    // 6. International stocks - always show $
    const intlStocks = ['AAPL', 'TSLA', 'GOOGL', 'AMZN', 'META', 'MSFT', 'NVDA', 'NFLX'];
    if (intlStocks.some(s => symU.includes(s))) {
      return '$' + n.toFixed(2);
    }

    // 7. Default to USD for anything else that fell through
    return '$' + n.toFixed(4);
  };

  // Show notification (toast)
  const showNotification = (message, type = 'info', duration = 4000, title = null) => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, message, type, title }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, duration);
  };

  // Fetch system notifications from admin
  const fetchSystemNotifications = async () => {
    if (!user?.id) return;
    setNotificationsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/user/notifications/${user.id}`);
      const data = await res.json();
      if (data.success) {
        setSystemNotifications(data.notifications || []);
        const unread = (data.notifications || []).filter(n => !n.isRead).length;
        setUnreadNotifCount(unread);
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setNotificationsLoading(false);
    }
  };

  // Mark notification as read
  const markNotificationAsRead = async (notificationId) => {
    if (!user?.id) return;
    try {
      await fetch(`${API_URL}/api/user/notifications/${notificationId}/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id })
      });
      setSystemNotifications(prev => prev.map(n => 
        n._id === notificationId ? { ...n, isRead: true } : n
      ));
      setUnreadNotifCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  // Mark all notifications as read
  const markAllNotificationsAsRead = async () => {
    if (!user?.id) return;
    try {
      await fetch(`${API_URL}/api/user/notifications/${user.id}/read-all`, {
        method: 'POST'
      });
      setSystemNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadNotifCount(0);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  // Fetch notifications on mount and periodically
  useEffect(() => {
    if (user?.id) {
      fetchSystemNotifications();
      const interval = setInterval(fetchSystemNotifications, 60000); // Refresh every minute
      return () => clearInterval(interval);
    }
  }, [user?.id]);

  // Toggle theme - saves to database and localStorage immediately
  const toggleTheme = () => {
    const newDark = !isDark;
    setIsDark(newDark);
    document.documentElement.setAttribute('data-theme', newDark ? 'dark' : 'light');
    localStorage.setItem('SetupFX-dark-mode', String(newDark));
    updatePreference('darkMode', newDark);
  };

  // Fetch USD/INR rate - use live price if available, fallback to API
  useEffect(() => {
    const currencySettings = JSON.parse(localStorage.getItem('SetupFX-currency-settings') || '{"usdMarkup":0}');
    setUsdMarkup(currencySettings.usdMarkup || 0);

    const fetchUsdRate = async () => {
      try {
        const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
        const data = await response.json();
        if (data.rates && data.rates.INR) {
          setUsdInrRate(data.rates.INR);
        }
      } catch (error) {
        console.log('Using fallback USD rate');
      }
    };
    fetchUsdRate();
    // Fallback API update every 30 seconds
    const interval = setInterval(fetchUsdRate, 30000);
    return () => clearInterval(interval);
  }, []);

  // Use live USDINR price for real-time updates (every tick)
  useEffect(() => {
    const usdinrPrice = livePrices['USDINR'];
    if (usdinrPrice && usdinrPrice.bid > 0) {
      setUsdInrRate(usdinrPrice.bid);
    }
  }, [livePrices]);

  // Fetch KYC status
  const fetchKycStatus = async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`${API_URL}/api/kyc/status/${user.id}`);
      const data = await res.json();
      if (data.success) {
        setKycStatus({ status: data.status, kyc: data.kyc });
        if (data.kyc) {
          setKycForm(prev => ({
            ...prev,
            fullName: data.kyc.fullName || user?.name || '',
            documentType: data.kyc.documentType || 'aadhaar'
          }));
        }
      }
    } catch (error) {
      console.error('Error fetching KYC status:', error);
    }
  };

  useEffect(() => {
    if (user?.id && activePage === 'settings') {
      fetchKycStatus();
    }
  }, [user?.id, activePage]);

  // Handle KYC image upload
  const handleKycImageUpload = (field) => (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('Image size must be less than 5MB');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setKycForm(prev => ({ ...prev, [field]: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  // Submit KYC
  const submitKyc = async (e) => {
    e.preventDefault();
    if (!kycForm.documentNumber || !kycForm.fullName || !kycForm.frontImage) {
      alert('Please fill all required fields and upload front image');
      return;
    }
    setKycSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/kyc/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user._id || user.id,
          oderId: user.oderId || user.id,
          ...kycForm
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('KYC submitted successfully! It will be reviewed shortly.');
        fetchKycStatus();
      } else {
        alert(data.error || 'Failed to submit KYC');
      }
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      setKycSubmitting(false);
    }
  };

  // Fetch wallet
  const fetchWallet = async () => {
    try {
      // Use the direct user wallet endpoint that reads from User.wallet
      const userId = user?.oderId || user?.id;
      if (!userId) return;
      
      const response = await fetch(`${API_URL}/api/user/wallet/${userId}`);
      if (!response.ok) {
        if (lastGoodWalletRef.current) {
          setWalletData(lastGoodWalletRef.current);
        }
        return;
      }

      const data = await response.json();
      if (!data.success || !data.wallet) {
        if (lastGoodWalletRef.current) {
          setWalletData(lastGoodWalletRef.current);
        }
        return;
      }

      const balance = Number(data.wallet.balance) || 0;
      const credit = 0;
      const pos = positionsRef.current;

      // Avoid zeroing margin on stale/empty position snapshots while the HTTP request was in flight
      if (pos.length === 0) {
        setWalletData((prev) => {
          if (balance === 0 && prev.balance > 0 && positionsRef.current.length === 0) return prev;
          const next = { ...prev, balance, credit: 0 };
          lastGoodWalletRef.current = next;
          return next;
        });
        return;
      }

      const serverMargin = 0;
      let totalPnL = 0;
      let totalMargin = serverMargin;

      if (pos.length > 0) {
        // Calculate total margin from positions - use stored marginUsed
        pos.forEach((position) => {
          if (position.status === 'closed') return;
          totalMargin += position.marginUsed || position.margin || 0;
        });
        
        // Calculate P/L for each position
        pos.forEach((position) => {
          if (position.status === 'closed') return;
          const symbol = position.symbol || '';

          // Check MetaAPI prices first (Forex/Crypto)
          let livePrice = livePrices[position.symbol];
          let hasLivePrice = livePrice && (livePrice.bid > 0 || livePrice.ask > 0);

          // If no MetaAPI price, check Zerodha ticks (Indian instruments)
          if (!hasLivePrice && getTickBySymbolAuto) {
            const zerodhaTick = getTickBySymbolAuto(position.symbol);
            const zLp = zerodhaTick?.lastPrice || zerodhaTick?.last_price || 0;
            if (zerodhaTick && zLp > 0) {
              livePrice = {
                bid: zerodhaTick.bid || zLp,
                ask: zerodhaTick.ask || zLp
              };
              hasLivePrice = true;
            }
          }

          if (!hasLivePrice) return;

          const currentPrice = position.side === 'buy' ? livePrice.bid : livePrice.ask;
          const entryPrice = position.entryPrice || position.avgPrice || 0;
          const priceDiff = position.side === 'buy' ? currentPrice - entryPrice : entryPrice - currentPrice;

          // Detect Indian instruments using exchange field (most reliable) + symbol patterns
          const posExchange = (position.exchange || '').toUpperCase();
          const isIndianPos = posExchange === 'NSE' || posExchange === 'BSE' || posExchange === 'NFO' ||
            posExchange === 'BFO' || posExchange === 'MCX' ||
            symbol.includes('NIFTY') || symbol.includes('BANKNIFTY') || symbol.includes('SENSEX') ||
            symbol.includes('FINNIFTY') || symbol.endsWith('CE') || symbol.endsWith('PE') ||
            (!symbol.includes('/') && !symbol.includes('USD') && !symbol.includes('EUR') &&
             !symbol.includes('GBP') && !symbol.includes('JPY') && !symbol.includes('AUD') &&
             !symbol.includes('CAD') && !symbol.includes('CHF') && !symbol.includes('NZD') &&
             !symbol.includes('BTC') && !symbol.includes('ETH') && !symbol.includes('XAU') &&
             !symbol.includes('XAG') && !symbol.includes('US30') && !symbol.includes('US100') &&
             !symbol.includes('US500') && !symbol.includes('UK100'));

          let pnl;
          if (isIndianPos) {
            // Indian: use quantity (= lots × lotSize) directly — mirrors server NettingEngine P/L formula
            const quantity = position.quantity || (position.volume * (position.lotSize || 1)) || 0;
            pnl = priceDiff * quantity;
          } else {
            // Forex/Crypto/Indices: use contract size × lots
            const vol = position.volume || 0;
            let contractSize = 100000; // Default for Forex
            if (symbol.includes('BTC') || symbol.includes('ETH')) contractSize = 1;
            else if (symbol.includes('ADA')) contractSize = 1000;
            else if (symbol === 'XAUUSD' || symbol === 'XPTUSD') contractSize = 100;
            else if (symbol === 'XAGUSD') contractSize = 5000;
            else if (symbol === 'US100' || symbol === 'US30' || symbol === 'US2000') contractSize = 1;
            else if (symbol === 'BRENT' || symbol.includes('OIL')) contractSize = 1000;
            pnl = symbol.includes('JPY') ? (priceDiff * 100000 * vol) / 100 : priceDiff * contractSize * vol;
          }
          totalPnL += pnl;
        });
      }

      // Use lastGoodMarginRef to prevent margin flickering
      // If we calculated a valid margin, store it
      if (totalMargin > 0) {
        lastGoodMarginRef.current = totalMargin;
      }
      // If margin is 0 but we have positions, use last known good margin
      const effectiveMargin = (totalMargin === 0 && pos.length > 0 && lastGoodMarginRef.current > 0) 
        ? lastGoodMarginRef.current 
        : totalMargin;

      const equity = balance + credit + totalPnL;
      const freeMargin = equity - effectiveMargin;
      const marginLevel = effectiveMargin > 0 ? (equity / effectiveMargin) * 100 : 0;

      setWalletData(prev => {
        // Anti-flicker guard: only block if balance drops to 0 AND no open positions
        // (indicates a transient API error, not a real state change)
        // Allow balance=0 when positions ARE open — equity may legitimately be negative
        if (balance === 0 && prev.balance > 0 && positionsRef.current.length === 0) return prev;
        
        // Use previous margin if new margin is 0 but we have positions (prevent flickering)
        const finalMargin = (effectiveMargin === 0 && pos.length > 0 && prev.margin > 0) 
          ? prev.margin 
          : effectiveMargin;
        
        if (finalMargin > 0) {
          lastGoodMarginRef.current = finalMargin;
        }
        
        const finalEquity = balance + credit + totalPnL;
        const finalFreeMargin = finalEquity - finalMargin;
        const finalMarginLevel = finalMargin > 0 ? (finalEquity / finalMargin) * 100 : 0;
        
        const newWalletData = { balance, credit, equity: finalEquity, margin: finalMargin, freeMargin: finalFreeMargin, marginLevel: finalMarginLevel };
        lastGoodWalletRef.current = newWalletData;
        return newWalletData;
      });
    } catch (error) {
      if (lastGoodWalletRef.current) {
        setWalletData(lastGoodWalletRef.current);
      }
    }
  };

  // Fetch positions
  const fetchPositions = async () => {
    try {
      const userId = user?.id || 'guest';
      const response = await fetch(`${API_URL}/api/positions/all/${userId}`);
      const data = await response.json();
      if (data.positions) {
        const openPositions = data.positions.filter(p => p.status === 'open' || p.status === 'active' || !p.status);
        setPositions(openPositions);
        // Don't set totalPnL from stored values - let real-time calculation handle it
      }
    } catch (error) {
      console.log('Server not running, using local positions');
    }
  };

  // Fetch pending orders
  const fetchPendingOrders = async () => {
    try {
      const userId = user?.id || 'guest';
      const response = await fetch(`${API_URL}/api/orders/pending/${userId}`);
      const data = await response.json();
      if (data.orders) {
        setPendingOrders(data.orders);
      }
    } catch (error) {
      console.log('Error fetching pending orders');
    }
  };

  // Fetch trade history with pagination (fetches all trades)
  const fetchTradeHistory = async () => {
    try {
      const userId = user?.id || 'guest';
      let allTrades = [];
      let page = 1;
      let hasMore = true;
      
      // Fetch all pages
      while (hasMore) {
        const response = await fetch(`${API_URL}/api/trades/${userId}?page=${page}&limit=100`);
        const data = await response.json();
        if (data.trades && data.trades.length > 0) {
          allTrades = [...allTrades, ...data.trades];
          hasMore = data.pagination?.hasMore || false;
          page++;
        } else {
          hasMore = false;
        }
      }
      
      setTradeHistory(allTrades);
    } catch (error) {
      console.log('Error fetching trade history');
    }
  };

  // Fetch cancelled orders
  const fetchCancelledOrders = async () => {
    try {
      const userId = user?.id || 'guest';
      const response = await fetch(`${API_URL}/api/orders/cancelled/${userId}`);
      const data = await response.json();
      if (data.orders) {
        setCancelledOrders(data.orders);
      }
    } catch (error) {
      console.log('Error fetching cancelled orders');
    }
  };

  // Check binary completions
  const checkBinaryCompletions = async () => {
    try {
      const userId = user?.id || 'guest';
      const response = await fetch(`${API_URL}/api/trades/${userId}`);
      const data = await response.json();
      if (data.trades) {
        const completedBinaryIds = data.trades.filter(t => t.mode === 'binary' && t.result).map(t => t.tradeId);

        if (isInitialLoadRef.current) {
          prevBinaryPositionsRef.current = completedBinaryIds;
          isInitialLoadRef.current = false;
          return;
        }

        const prevIds = prevBinaryPositionsRef.current;
        const newCompletedBinary = data.trades.filter(t => t.mode === 'binary' && t.result && !prevIds.includes(t.tradeId));

        newCompletedBinary.forEach(trade => {
          const isWin = trade.result === 'win';
          const profit = trade.profit || 0;
          showNotification(
            `Binary ${trade.symbol} ${trade.result.toUpperCase()}! P/L: ${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}`,
            isWin ? 'success' : 'error',
            6000
          );
        });

        prevBinaryPositionsRef.current = completedBinaryIds;
        if (newCompletedBinary.length > 0) {
          fetchTradeHistory();
        }
      }
    } catch (error) {
      console.log('Error checking binary completions');
    }
  };

  // Initial data fetch and intervals
  useEffect(() => {
    fetchPositions();
    fetchPendingOrders();
    fetchTradeHistory();
    fetchCancelledOrders();
    fetchWallet();
    const posInterval = setInterval(fetchPositions, 5000);
    const pendingInterval = setInterval(fetchPendingOrders, 5000);
    const binaryCheckInterval = setInterval(checkBinaryCompletions, 3000);
    const walletInterval = setInterval(fetchWallet, 3000);
    const timerInterval = setInterval(() => setTimerTick(t => t + 1), 1000);
    return () => {
      clearInterval(posInterval);
      clearInterval(pendingInterval);
      clearInterval(binaryCheckInterval);
      clearInterval(walletInterval);
      clearInterval(timerInterval);
    };
  }, [user]);

  // Check if symbol is an Indian instrument
  const isIndianSymbol = (symbol) => {
    if (!symbol) return false;
    return !symbol.includes('/') && !symbol.includes('USD') && !symbol.includes('EUR') &&
           !symbol.includes('GBP') && !symbol.includes('JPY') && !symbol.includes('AUD') &&
           !symbol.includes('CAD') && !symbol.includes('CHF') && !symbol.includes('NZD') &&
           !symbol.includes('BTC') && !symbol.includes('ETH') && !symbol.includes('XAU') &&
           !symbol.includes('XAG') && !symbol.includes('US30') && !symbol.includes('US100') &&
           !symbol.includes('US500') && !symbol.includes('UK100');
    // Note: no length limit — BANKNIFTY options like BANKNIFTY26MAR54000CE are 21+ chars
  };

  // After all positions are gone, debounce margin reset (avoids 0↔real flicker when /positions briefly returns [])
  useEffect(() => {
    const n = positions.length;
    const prevN = prevOpenPositionCountRef.current;

    const clearEmptyTimer = () => {
      if (positionsEmptyMarginClearTimerRef.current) {
        clearTimeout(positionsEmptyMarginClearTimerRef.current);
        positionsEmptyMarginClearTimerRef.current = null;
      }
    };

    if (n > 0) {
      clearEmptyTimer();
      prevOpenPositionCountRef.current = n;
      return clearEmptyTimer;
    }

    if (prevN < 0 || (prevN === 0 && n === 0)) {
      prevOpenPositionCountRef.current = 0;
      return clearEmptyTimer;
    }

    prevOpenPositionCountRef.current = 0;
    clearEmptyTimer();
    positionsEmptyMarginClearTimerRef.current = setTimeout(() => {
      positionsEmptyMarginClearTimerRef.current = null;
      if (positionsRef.current.length > 0) return;
      setTotalPnL(0);
      lastGoodMarginRef.current = 0;
      setWalletData((prev) => {
        const eq = prev.balance + prev.credit;
        return { ...prev, margin: 0, freeMargin: eq, equity: eq, marginLevel: 0 };
      });
    }, 450);

    return clearEmptyTimer;
  }, [positions]);

  // Update wallet P/L in real-time
  useEffect(() => {
    if (positions.length === 0) {
      return;
    }

    let totalPnLInUSD = 0; // Normalize all P/L to USD
    let totalMargin = 0;
    const rate = usdInrRate + usdMarkup;

    positions.forEach(pos => {
      if (pos.status === 'closed') return;
      const vol = pos.volume || pos.quantity || 0;
      const symbol = pos.symbol || '';
      totalMargin += pos.marginUsed || pos.margin || 0;
      
      // Check MetaAPI prices first (Forex/Crypto)
      let livePrice = livePrices[pos.symbol];
      let hasLivePrice = livePrice && (livePrice.bid > 0 || livePrice.ask > 0);
      
      // If no MetaAPI price, check Zerodha ticks (Indian instruments)
      if (!hasLivePrice && getTickBySymbolAuto) {
        const zerodhaTick = getTickBySymbolAuto(pos.symbol);
        const zLp = zerodhaTick?.lastPrice || zerodhaTick?.last_price || 0;
        if (zerodhaTick && zLp > 0) {
          livePrice = {
            bid: zerodhaTick.bid || zLp,
            ask: zerodhaTick.ask || zLp
          };
          hasLivePrice = true;
        }
      }

      if (!hasLivePrice && pos.currentPrice && Number(pos.currentPrice) > 0) {
        const cp = Number(pos.currentPrice);
        livePrice = { bid: cp, ask: cp };
        hasLivePrice = true;
      }

      if (!hasLivePrice) return;

      const currentPrice = pos.side === 'buy' ? livePrice.bid : livePrice.ask;
      const entryPrice = pos.entryPrice || pos.avgPrice || 0;
      const priceDiff = pos.side === 'buy' ? currentPrice - entryPrice : entryPrice - currentPrice;

      const isIndian = isIndianSymbol(symbol);
      let pnl = 0;

      if (isIndian) {
        // Indian instruments — use quantity (= lots × lotSize) directly, mirrors server formula
        const quantity = pos.quantity || (pos.volume * (pos.lotSize || 1)) || 0;
        pnl = (priceDiff * quantity) / rate; // Convert INR → USD for normalised totaling
      } else {
        // Forex/Crypto - P/L is in USD
        let contractSize = 100000; // Default for Forex
        if (symbol.includes('BTC') || symbol.includes('ETH')) contractSize = 1;
        else if (symbol.includes('ADA')) contractSize = 1000;
        else if (symbol === 'XAUUSD' || symbol === 'XPTUSD') contractSize = 100;
        else if (symbol === 'XAGUSD') contractSize = 5000;
        else if (symbol === 'US100' || symbol === 'US30' || symbol === 'US2000') contractSize = 1;
        else if (symbol === 'BRENT' || symbol.includes('OIL')) contractSize = 1000;
        
        pnl = symbol.includes('JPY') ? (priceDiff * 100000 * vol) / 100 : priceDiff * contractSize * vol;
      }

      totalPnLInUSD += pnl;
    });

    // Update totalPnL state (stored in USD, formatPnL will convert to display currency)
    setTotalPnL(totalPnLInUSD);

    // Use lastGoodMarginRef to prevent margin flickering
    if (totalMargin > 0) {
      lastGoodMarginRef.current = totalMargin;
    }
    const effectiveMargin = (totalMargin === 0 && positions.length > 0 && lastGoodMarginRef.current > 0) 
      ? lastGoodMarginRef.current 
      : totalMargin;

    setWalletData(prev => {
      if (!prev.balance && prev.balance !== 0) return prev;

      // Use previous margin if new margin is 0 but we have positions (prevent flickering)
      const finalMargin = (effectiveMargin === 0 && positions.length > 0 && prev.margin > 0) 
        ? prev.margin 
        : effectiveMargin;
      
      if (finalMargin > 0) {
        lastGoodMarginRef.current = finalMargin;
      }

      const equity = prev.balance + prev.credit + totalPnLInUSD;
      const freeMargin = equity - finalMargin;
      const marginLevel = finalMargin > 0 ? (equity / finalMargin) * 100 : 0;

      return { ...prev, equity, margin: finalMargin, freeMargin, marginLevel };
    });
  }, [livePrices, positions, zerodhaTicks, getTickBySymbolAuto, usdInrRate, usdMarkup]);

  // Filter orders by date
  const filterOrdersByDate = (orders) => {
    if (!orderDateFrom && !orderDateTo) return orders;
    return orders.filter(order => {
      const orderDate = new Date(order.openTime || order.createdAt || order.closeTime);
      const fromDate = orderDateFrom ? new Date(orderDateFrom) : null;
      const toDate = orderDateTo ? new Date(orderDateTo + 'T23:59:59') : null;
      if (fromDate && orderDate < fromDate) return false;
      if (toDate && orderDate > toDate) return false;
      return true;
    });
  };

  // Handle position close
  const handleClosePosition = async (position, volumeToClose = null) => {
    try {
      const userId = user?.id || 'guest';
      
      // Check MetaAPI prices first (Forex/Crypto)
      let livePrice = livePrices[position.symbol];
      let hasLivePrice = livePrice && (livePrice.bid > 0 || livePrice.ask > 0);
      
      // If no MetaAPI price, check Zerodha ticks (Indian instruments)
      if (!hasLivePrice && getTickBySymbolAuto) {
        const zerodhaTick = getTickBySymbolAuto(position.symbol);
        const zLp = zerodhaTick?.lastPrice || zerodhaTick?.last_price || 0;
        if (zerodhaTick && zLp > 0) {
          livePrice = {
            bid: zerodhaTick.bid || zLp,
            ask: zerodhaTick.ask || zLp
          };
          hasLivePrice = true;
        }
      }

      // Fallback to position's current price if available
      if (!hasLivePrice && position.currentPrice && position.currentPrice > 0) {
        livePrice = {
          bid: position.currentPrice,
          ask: position.currentPrice
        };
        hasLivePrice = true;
      }
      
      // Last fallback - use entry price (for demo/testing purposes)
      if (!hasLivePrice && position.entryPrice && position.entryPrice > 0) {
        livePrice = {
          bid: position.entryPrice,
          ask: position.entryPrice
        };
        hasLivePrice = true;
        console.warn(`[ClosePosition] Using entry price as fallback for ${position.symbol}`);
      }

      if (!hasLivePrice) {
        showNotification('Market closed. Cannot close without live price.', 'error');
        return;
      }

      const currentPrice = position.side === 'buy' ? livePrice.bid : livePrice.ask;

      const response = await fetch(`${API_URL}/api/positions/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: position.mode || tradingMode,
          userId,
          positionId: position.oderId || position.tradeId,
          symbol: position.symbol,
          volume: volumeToClose || position.volume || position.quantity,
          currentPrice
        })
      });

      const result = await response.json();
      if (result.success) {
        if (result.wallet) {
          setWalletData(prev => {
            // Use server's balance (realized P&L settled) but keep client-computed floating equity.
            // Server equity = balance + credit only (no floating P&L from remaining positions).
            // Adjust prev.equity by the balance change so floating P&L is preserved.
            const newBalance = result.wallet.balance ?? prev.balance;
            const balanceDelta = newBalance - prev.balance;
            const newMargin = result.wallet.margin || 0;
            const effectiveMargin = (newMargin === 0 && prev.margin > 0) ? prev.margin : newMargin;
            if (effectiveMargin > 0) lastGoodMarginRef.current = effectiveMargin;
            const adjustedEquity = prev.equity + balanceDelta;
            return {
              ...prev,
              balance: newBalance,
              credit: result.wallet.credit ?? prev.credit,
              equity: adjustedEquity,
              margin: effectiveMargin,
              freeMargin: adjustedEquity - effectiveMargin,
              marginLevel: effectiveMargin > 0 ? (adjustedEquity / effectiveMargin) * 100 : 0
            };
          });
        }
        // Play trade closed sound
        tradingSounds.playTradeClosed();
        
        const profit = result.profit || 0;
        showNotification(`Position closed! P/L: ${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}`, 'success');
        fetchPositions();
        fetchTradeHistory();
        fetchWallet();
        setShowCloseModal(false);
      } else {
        tradingSounds.playError();
        showNotification(`Close failed: ${result.error}`, 'error');
      }
    } catch (error) {
      showNotification(`Error: ${error.message}`, 'error');
    }
  };

  // Handle cancel pending order
  const handleCancelPendingOrder = async (order) => {
    try {
      const userId = user?.id || 'guest';
      const response = await fetch(`${API_URL}/api/orders/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: order.mode || tradingMode,
          userId,
          orderId: order.oderId || order._id
        })
      });

      const result = await response.json();
      if (result.success) {
        if (result.wallet) {
          setWalletData(prev => ({ ...prev, ...result.wallet }));
        }
        showNotification('Pending order cancelled', 'success');
        fetchPositions();
        fetchPendingOrders();
        fetchWallet();
      } else {
        showNotification(`Cancel failed: ${result.error}`, 'error');
      }
    } catch (error) {
      showNotification(`Error: ${error.message}`, 'error');
    }
  };

  // Handle position modify
  const handleModifyPosition = async () => {
    if (!selectedPosition) return;
    try {
      const userId = user?.id || 'guest';
      const isPendingOrder = selectedPosition.status === 'pending';
      
      // Use different endpoint for pending orders vs open positions
      const endpoint = isPendingOrder ? `${API_URL}/api/orders/modify` : `${API_URL}/api/positions/modify`;
      const body = isPendingOrder ? {
        mode: selectedPosition.mode || tradingMode,
        userId,
        orderId: selectedPosition.oderId || selectedPosition._id,
        price: editPrice ? parseFloat(editPrice) : null,
        stopLoss: editSL ? parseFloat(editSL) : null,
        takeProfit: editTP ? parseFloat(editTP) : null
      } : {
        mode: selectedPosition.mode || tradingMode,
        userId,
        positionId: selectedPosition.oderId || selectedPosition.tradeId,
        stopLoss: editSL ? parseFloat(editSL) : null,
        takeProfit: editTP ? parseFloat(editTP) : null
      };

      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const result = await response.json();
      if (result.success) {
        showNotification(isPendingOrder ? 'Pending order modified!' : 'Position modified successfully!', 'success');
        fetchPositions();
        fetchPendingOrders();
        setShowEditModal(false);
      } else {
        showNotification(`Modify failed: ${result.error}`, 'error');
      }
    } catch (error) {
      showNotification(`Error: ${error.message}`, 'error');
    }
  };

  // Open edit modal
  const openEditModal = (position) => {
    setSelectedPosition(position);
    setEditSL(position.stopLoss || '');
    setEditTP(position.takeProfit || '');
    setEditPrice(position.entryPrice || position.avgPrice || position.triggerPrice || '');
    setShowEditModal(true);
  };

  // Open close modal
  const openCloseModal = (position) => {
    setSelectedPosition(position);
    setCloseVolume(position.volume || position.quantity || '');
    setShowCloseModal(true);
  };

  // Handle one-click order (mode matches order panel: hedging vs netting; Indian symbols → netting only)
  const handleExecuteOrder = async (symbol, side) => {
    if (!oneClickMode) return;
    const effectiveMode = isIndianMarketSymbol(symbol)
      ? 'netting'
      : tradingMode === 'hedging'
        ? 'hedging'
        : 'netting';
    try {
      const result = await executeOrder(symbol, side, oneClickLotSize, {
        mode: effectiveMode,
        session: orderSession,
        leverage: marginPercent
      });
      if (result.success) {
        tradingSounds.playTradeExecuted();
        showNotification(`${side.toUpperCase()} ${oneClickLotSize} lots ${symbol}`, 'success');
        fetchPositions();
      } else {
        tradingSounds.playError();
        showNotification(`Order failed: ${result.error}`, 'error');
        alert(`Order failed: ${result.error}`);
      }
    } catch (err) {
      tradingSounds.playError();
      showNotification(`Trade error: ${err.message}`, 'error');
      alert(`Trade error: ${err.message}`);
    }
  };

  // Resolve segment name for an instrument (lightweight version for spread lookup)
  const resolveSegmentForInst = useCallback((inst) => {
    if (!inst?.symbol) return null;
    const sym = String(inst.symbol).toUpperCase();
    const ex = String(inst.exchange || '').toUpperCase();
    const cat = String(inst.category || '').toLowerCase();

    // Delta Exchange
    if (inst.source === 'delta_exchange' || ex === 'DELTA' || sym.startsWith('C-') || sym.startsWith('P-')) {
      const ct = String(inst.contract_type || '').toLowerCase();
      if (ct.includes('call_options') || ct.includes('put_options')) return 'CRYPTO_OPTIONS';
      return 'CRYPTO_PERPETUAL';
    }
    // Crypto perpetual (ends with USD, not forex)
    const forexSix = new Set(['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY']);
    if (sym.endsWith('USD') && !sym.includes('/') && !forexSix.has(sym) && !sym.includes('XAU') && !sym.includes('XAG')) {
      return 'CRYPTO_PERPETUAL';
    }
    // Indian exchanges
    if (ex === 'NSE' || cat.startsWith('nse_eq')) return 'NSE_EQ';
    if (ex === 'NFO' || cat.startsWith('nse_fut')) return /[CP]E$/i.test(sym) ? 'NSE_OPT' : 'NSE_FUT';
    if (ex === 'MCX' || cat.startsWith('mcx')) return /[CP]E$/i.test(sym) ? 'MCX_OPT' : 'MCX_FUT';
    if (ex === 'BSE' || cat.startsWith('bse_eq')) return 'BSE_EQ';
    if (ex === 'BFO' || cat.startsWith('bse_fut')) return /[CP]E$/i.test(sym) ? 'BSE_OPT' : 'BSE_FUT';
    // Category-based
    if (cat === 'forex' || cat === 'forex_yen' || cat === 'yen') return 'FOREX';
    if (cat === 'indices') return 'INDICES';
    if (cat === 'commodity' || cat === 'metals' || cat === 'energy') return 'COMMODITIES';
    if (cat === 'stocks') return 'STOCKS';
    if (cat === 'crypto_perpetual') return 'CRYPTO_PERPETUAL';
    // Fallback: forex-like symbols
    if (sym.length === 6 && forexSix.has(sym)) return 'FOREX';
    if (sym.includes('JPY') || sym.includes('CHF') || sym.includes('CAD') || sym.includes('NZD') || sym.includes('AUD')) return 'FOREX';
    if (sym === 'XAUUSD' || sym === 'XAGUSD' || sym === 'XPTUSD') return 'COMMODITIES';
    return null;
  }, []);

  // Apply spread to raw bid/ask — script override > segment fallback
  const applySegmentSpread = useCallback((rawBid, rawAsk, inst) => {
    if (rawBid <= 0 && rawAsk <= 0) return { bid: rawBid, ask: rawAsk, spreadAmount: 0 };

    const sym = String(inst?.symbol || '').toUpperCase();
    const segName = resolveSegmentForInst(inst);

    // Priority: script-level override > segment-level
    const scriptOverride = scriptSpreads[sym] || null;
    const segSS = segName ? segmentSpreads[segName] : null;
    const ss = scriptOverride || segSS;

    const spreadPips = Number(ss?.spreadPips) || 0;
    if (spreadPips <= 0) return { bid: rawBid, ask: rawAsk, spreadAmount: Math.abs(rawAsk - rawBid) };

    const st = String(ss?.spreadType || 'fixed').toLowerCase();
    const mid = (rawBid + rawAsk) / 2 || rawBid || rawAsk;
    let appliedSpread = spreadPips;

    if (st === 'floating') {
      // Floating: use max of admin floor and natural market spread
      const naturalSpread = Math.abs(rawAsk - rawBid);
      appliedSpread = Math.max(spreadPips, naturalSpread);
    }

    const halfSpread = appliedSpread / 2;
    return {
      bid: mid - halfSpread,
      ask: mid + halfSpread,
      spreadAmount: appliedSpread
    };
  }, [segmentSpreads, scriptSpreads, resolveSegmentForInst]);

  // Get instrument with live price (MetaAPI for Forex/Crypto, Zerodha for Indian)
  // Using useCallback to ensure child components get updated prices
  const getInstrumentWithLivePrice = useCallback((inst) => {
    if (!inst) return inst;

    let result = null;

    // Check if it's an Indian market instrument
    const isIndian = inst.category?.startsWith('nse_') ||
                     inst.category?.startsWith('mcx_') ||
                     inst.category?.startsWith('bse_') ||
                     inst.token; // Has Zerodha token

    if (isIndian) {
      let tick = null;
      if (inst.token && zerodhaTicks) tick = zerodhaTicks[inst.token];
      if (!tick) tick = getTickBySymbolAuto(inst.symbol);

      if (tick && (tick.lastPrice > 0 || tick.bid > 0)) {
        const lastPrice =
          Number(tick.lastPrice || tick.last_price || tick.ltp || 0) ||
          Number(tick.bid) ||
          0;
        const tb = Number(tick.bid);
        const ta = Number(tick.ask);
        let rawBid = tb > 0 ? tb : lastPrice;
        let rawAsk = ta > 0 ? ta : lastPrice;
        if (rawBid > 0 && rawAsk > 0 && rawAsk < rawBid) {
          const x = rawBid;
          rawBid = rawAsk;
          rawAsk = x;
        }
        result = {
          ...inst,
          bid: rawBid,
          ask: rawAsk,
          low: tick.low || inst.low || 0,
          high: tick.high || inst.high || 0,
          open: tick.open || inst.open || 0,
          close: tick.close || inst.close || 0,
          volume: tick.volume || inst.volume || 0,
          change: tick.change !== undefined ? parseFloat(tick.change) : (inst.change || 0),
          lastPrice: lastPrice,
          lastUpdated: tick.timestamp
        };
      } else {
        result = { ...inst, bid: 0, ask: 0, low: 0, high: 0, change: 0 };
      }
    }

    if (!result) {
      // Check Delta Exchange
      const symU = String(inst.symbol || '').toUpperCase();
      const forexSix = new Set(['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY']);
      const isPerpetualFutures =
        symU.endsWith('USD') && !symU.includes('/') && !forexSix.has(symU) &&
        !symU.includes('XAU') && !symU.includes('XAG');
      const isDeltaInstrument = inst.source === 'delta_exchange' ||
                                 inst.symbol.startsWith('C-') || inst.symbol.startsWith('P-') ||
                                 inst.contract_type || isPerpetualFutures;

      if (isDeltaInstrument) {
        const deltaPrice = deltaPrices?.[inst.symbol];
        if (deltaPrice) {
          result = {
            ...inst,
            bid: deltaPrice.bid || deltaPrice.mark_price || 0,
            ask: deltaPrice.ask || deltaPrice.mark_price || 0,
            last: deltaPrice.last || deltaPrice.mark_price || 0,
            mark_price: deltaPrice.mark_price || 0,
            low: deltaPrice.low || 0, high: deltaPrice.high || 0,
            change: deltaPrice.change || 0, volume: deltaPrice.volume || 0,
            open_interest: deltaPrice.open_interest || 0,
            funding_rate: deltaPrice.funding_rate || 0,
            greeks: deltaPrice.greeks || null,
          };
        } else {
          const fromSocket = resolveMetaapiLiveQuote(livePrices, inst.symbol) || livePrices?.[inst.symbol];
          if (fromSocket && (Number(fromSocket.bid) > 0 || Number(fromSocket.ask) > 0 || Number(fromSocket.mark_price) > 0)) {
            const m = Number(fromSocket.mark_price || fromSocket.last || 0);
            result = {
              ...inst,
              bid: Number(fromSocket.bid) || m, ask: Number(fromSocket.ask) || m,
              last: fromSocket.last ?? m, mark_price: fromSocket.mark_price ?? m,
              low: fromSocket.low || 0, high: fromSocket.high || 0,
              change: fromSocket.change !== undefined ? fromSocket.change : 0,
              volume: fromSocket.volume || 0, open_interest: fromSocket.open_interest || 0,
              funding_rate: fromSocket.funding_rate || 0, greeks: fromSocket.greeks || null,
            };
          } else {
            result = { ...inst, bid: 0, ask: 0, low: 0, high: 0, change: 0 };
          }
        }
      }
    }

    if (!result) {
      // MetaAPI (Forex/Indices/Metals)
      const livePrice = resolveMetaapiLiveQuote(livePrices, inst.symbol);
      if (livePrice && (livePrice.bid > 0 || livePrice.ask > 0)) {
        result = {
          ...inst,
          bid: livePrice.bid || 0, ask: livePrice.ask || 0,
          low: livePrice.low || 0, high: livePrice.high || 0,
          change: livePrice.change !== undefined ? livePrice.change : 0,
          pips: livePrice.pips !== undefined ? livePrice.pips : 0,
        };
      } else {
        result = { ...inst, bid: 0, ask: 0, low: 0, high: 0, change: 0, pips: 0 };
      }
    }

    // Apply segment spread to displayed bid/ask (what user sees = what they trade at)
    if (result.bid > 0 || result.ask > 0) {
      const { bid, ask, spreadAmount } = applySegmentSpread(result.bid, result.ask, result);
      result.bid = bid;
      result.ask = ask;
      result.spreadAmount = spreadAmount;
    }

    return result || { ...inst, bid: 0, ask: 0, low: 0, high: 0, change: 0, pips: 0 };
  }, [livePrices, zerodhaTicks, getTickBySymbolAuto, deltaPrices, applySegmentSpread]);

  // Check if symbol is from Indian market
  const isIndianMarketSymbol = (symbol) => {
    // Check if symbol exists in Indian market categories
    const indianCategories = ['NSE EQ', 'BSE EQ', 'NSE FUT', 'NSE OPT', 'MCX FUT', 'MCX OPT', 'BSE FUT', 'BSE OPT'];
    for (const category of indianCategories) {
      if (instrumentsByCategory[category]?.some(inst => inst.symbol === symbol)) {
        return true;
      }
    }
    // Also check by category prefix
    const inst = allInstruments.find(i => i.symbol === symbol);
    if (inst?.category?.startsWith('nse_') || inst?.category?.startsWith('mcx_') || inst?.category?.startsWith('bse_')) {
      return true;
    }
    return false;
  };

  // Add chart tab
  const addChartTab = (symbol) => {
    if (!chartTabs.includes(symbol)) {
      setChartTabs(prev => [...prev, symbol]);
    }
    setSelectedSymbol(symbol);
    
    // Note: Currency is now user-controlled - no auto-switching
    // User can view all instruments in USD or INR as they prefer
    
    // Auto-switch to Netting mode for Indian instruments (unless admin allows hedging)
    if (isIndianMarketSymbol(symbol) && !hedgingSettings.allowIndianInstruments && tradingMode === 'hedging') {
      if (allowedTradeModes.netting) {
        setTradingMode('netting');
      }
    }
  };

  // Remove chart tab
  const removeChartTab = (symbol, e) => {
    e.stopPropagation();
    if (chartTabs.length > 1) {
      const newTabs = chartTabs.filter(s => s !== symbol);
      setChartTabs(newTabs);
      if (selectedSymbol === symbol) {
        setSelectedSymbol(newTabs[newTabs.length - 1]);
      }
    }
  };

  // Toggle segment
  const toggleSegment = (segment) => {
    setExpandedSegments(prev => ({ ...prev, [segment]: !prev[segment] }));
  };

  // Toggle watchlist (with database persistence)
  // Uses addToWatchlistDb/removeFromWatchlistDb which update userPrefs.watchlist
  const toggleWatchlist = useCallback((symbol, e) => {
    if (e) e.stopPropagation();
    if (isInWatchlist(symbol)) {
      console.log('Removing from watchlist:', symbol);
      removeFromWatchlistDb(symbol);
    } else {
      console.log('Adding to watchlist:', symbol);
      addToWatchlistDb(symbol);
    }
  }, [isInWatchlist, addToWatchlistDb, removeFromWatchlistDb]);

  // Add to watchlist (with database persistence)
  const addToWatchlist = useCallback((symbol) => {
    if (!isInWatchlist(symbol)) {
      console.log('Added to watchlist:', symbol);
      addToWatchlistDb(symbol);
    }
  }, [isInWatchlist, addToWatchlistDb]);

  // Remove from watchlist (with database persistence)
  const removeFromWatchlist = useCallback((symbol) => {
    if (isInWatchlist(symbol)) {
      console.log('Removed from watchlist:', symbol);
      removeFromWatchlistDb(symbol);
    }
  }, [isInWatchlist, removeFromWatchlistDb]);

  // Navigate to page
  const navigateToPage = (page) => {
    setActivePage(page);
    navigate(`/app/${page === 'home' ? '' : page}`);
  };

  // Context to pass to child pages
  const outletContext = {
    user,
    API_URL,
    isDark,
    toggleTheme,
    activePage,
    setActivePage,
    navigateToPage,
    livePrices,
    isMetaApiConnected,
    executeOrder,
    zerodhaTicks,
    isZerodhaConnected,
    zerodhaStatus,
    getTickByToken,
    getTickBySymbolAuto,
    zerodhaRefreshStatus,
    instrumentsByCategory,
    visibleInstrumentsByCategory,
    nettingSegmentBlockByCode,
    allInstruments,
    addInstrumentToCategory,
    removeInstrumentFromCategory,
    // Broker instruments (MT5-style search for all 480+ symbols)
    brokerInstruments,
    brokerSearchResults,
    brokerInstrumentsLoading,
    brokerCategories,
    brokerCategoryNames,
    searchBrokerInstruments,
    getBrokerByCategory,
    getBrokerInstrument,
    selectedSymbol,
    setSelectedSymbol,
    chartTabs,
    setChartTabs,
    addChartTab,
    removeChartTab,
    tradingMode,
    setTradingMode,
    allowedTradeModes,
    hedgingSettings,
    binarySettings,
    isIndianMarketSymbol,
    watchlist,
    setWatchlist,
    isInWatchlist,
    toggleWatchlist,
    addToWatchlist,
    removeFromWatchlist,
    positions,
    setPositions,
    pendingOrders,
    setPendingOrders,
    tradeHistory,
    setTradeHistory,
    cancelledOrders,
    setCancelledOrders,
    totalPnL,
    walletData,
    setWalletData,
    usdInrRate,
    usdMarkup,
    displayCurrency,
    handleCurrencyChange,
    allowedCurrencyDisplay,
    formatPrice,
    mobileMarketTab,
    setMobileMarketTab,
    mobileShowChartBelow,
    setMobileShowChartBelow,
    fetchPositions,
    fetchPendingOrders,
    fetchTradeHistory,
    fetchCancelledOrders,
    fetchWallet,
    showNotification,
    notifications,
    onLogout,
    // Trading state
    orderSide,
    setOrderSide,
    orderType,
    setOrderType,
    volume,
    setVolume,
    marginPercent,
    setMarginPercent,
    limitPrice,
    setLimitPrice,
    stopPrice,
    setStopPrice,
    stopLoss,
    setStopLoss,
    takeProfit,
    setTakeProfit,
    slPips,
    setSlPips,
    tpPips,
    setTpPips,
    orderSession,
    setOrderSession,
    binaryDirection,
    setBinaryDirection,
    binaryAmount,
    setBinaryAmount,
    binaryExpiry,
    setBinaryExpiry,
    // UI state
    activeTab,
    setActiveTab,
    searchQuery,
    setSearchQuery,
    filterTab,
    setFilterTab,
    instrumentsPanelCollapsed,
    setInstrumentsPanelCollapsed,
    expandedSegments,
    setExpandedSegments,
    toggleSegment,
    oneClickMode,
    setOneClickMode,
    oneClickLotSize,
    setOneClickLotSize,
    hoveredInstrument,
    setHoveredInstrument,
    // Orders page
    ordersActiveTab,
    setOrdersActiveTab,
    orderDateFrom,
    setOrderDateFrom,
    orderDateTo,
    setOrderDateTo,
    filterOrdersByDate,
    // Position management
    handleClosePosition,
    handleModifyPosition,
    handleCancelPendingOrder,
    openEditModal,
    openCloseModal,
    handleExecuteOrder,
    oneClickPending,
    getInstrumentWithLivePrice,
    showEditModal,
    setShowEditModal,
    showCloseModal,
    setShowCloseModal,
    selectedPosition,
    setSelectedPosition,
    editSL,
    setEditSL,
    editTP,
    setEditTP,
    editPrice,
    setEditPrice,
    closeVolume,
    setCloseVolume,
    // KYC
    kycStatus,
    setKycStatus,
    kycForm,
    setKycForm,
    kycSubmitting,
    handleKycImageUpload,
    submitKyc,
    fetchKycStatus,
    // Timer
    timerTick,
    getTVSymbol
  };

  return (
    <div className={`app user-layout-shell ${isDark ? 'dark' : 'light'}`}>
      {/* iOS Style Notifications */}
      <div className="ios-notification-container">
        {notifications.map(n => (
          <div key={n.id} className={`ios-notification ios-notification-${n.type}`}>
            <div className="ios-notif-icon">
              {n.type === 'success' ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : n.type === 'error' ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : n.type === 'warning' ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
                </svg>
              )}
            </div>
            <div className="ios-notif-content">
              <span className="ios-notif-title">
                {n.title || (n.type === 'success' ? 'Success' : n.type === 'error' ? 'Error' : n.type === 'warning' ? 'Pending' : 'Notification')}
              </span>
              <span className="ios-notif-message">{n.message}</span>
            </div>
            <div className="ios-notif-time">Just now</div>
          </div>
        ))}
      </div>

      {/* Header */}
      <header className="header">
        <div className="header-left">
          <button className="hamburger-btn" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            <span className="hamburger-icon">{mobileMenuOpen ? '✕' : '☰'}</span>
          </button>
          <img src="/landing/img/logo1.png" alt="SetupFX" className="logo-img" style={{ height: '28px', width: 'auto' }} />
        </div>
        <div className={`header-nav ${mobileMenuOpen ? 'mobile-open' : ''}`}>
          <button type="button" className={`nav-btn nav-bnav-dup ${activePage === 'home' ? 'active' : ''}`} onClick={() => { navigateToPage('home'); setMobileMenuOpen(false); }}>🏠 Home</button>
          <button type="button" className={`nav-btn nav-bnav-dup ${activePage === 'market' ? 'active' : ''}`} onClick={() => { navigateToPage('market'); setMobileMenuOpen(false); }}>📈 Market</button>
          <button type="button" className={`nav-btn nav-bnav-dup ${activePage === 'orders' ? 'active' : ''}`} onClick={() => { navigateToPage('orders'); setMobileMenuOpen(false); }}>📋 Orders</button>
          <button type="button" className={`nav-btn nav-bnav-dup ${activePage === 'wallet' ? 'active' : ''}`} onClick={() => { navigateToPage('wallet'); setMobileMenuOpen(false); }}>💰 Wallet</button>
          <button type="button" className={`nav-btn ${activePage === 'business' ? 'active' : ''}`} onClick={() => { navigateToPage('business'); setMobileMenuOpen(false); }}>💼 Business</button>
          <button type="button" className={`nav-btn ${activePage === 'masters' ? 'active' : ''}`} onClick={() => { navigateToPage('masters'); setMobileMenuOpen(false); }}>👑 Masters</button>
          <button type="button" className={`nav-btn nav-bnav-dup ${activePage === 'settings' ? 'active' : ''}`} onClick={() => { navigateToPage('settings'); setMobileMenuOpen(false); }}>⚙️ Settings</button>
        </div>
        <div className="header-right">
          {/* Notification Bell */}
          <button 
            className="notification-bell-btn" 
            onClick={() => setShowNotificationPanel(!showNotificationPanel)}
            style={{
              position: 'relative',
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '8px',
              marginRight: '8px'
            }}
          >
            🔔
            {unreadNotifCount > 0 && (
              <span style={{
                position: 'absolute',
                top: '2px',
                right: '2px',
                background: '#ef4444',
                color: '#fff',
                fontSize: '10px',
                fontWeight: 600,
                borderRadius: '50%',
                minWidth: '16px',
                height: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 4px'
              }}>
                {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
              </span>
            )}
          </button>
          <button className="theme-toggle" onClick={toggleTheme}>
            {isDark ? '☀️' : '🌙'}
          </button>
          <div className="user-menu">
            {user?.isDemo && (
              <span className="demo-badge" style={{ 
                background: 'linear-gradient(135deg, #f59e0b, #d97706)', 
                color: '#fff', 
                padding: '2px 8px', 
                borderRadius: '4px', 
                fontSize: '10px', 
                fontWeight: 600,
                marginRight: '8px'
              }}>
                DEMO
              </span>
            )}
            <span className="user-name">{user?.name || 'Guest'}</span>
            <button className="logout-btn" onClick={onLogout}>Logout</button>
          </div>
        </div>
      </header>

      {/* Trade Notifications (Expiry, Margin Call, Stop Out) */}
      {tradeNotifications.length > 0 && (
        <div style={{
          position: 'fixed',
          top: '70px',
          right: '16px',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          maxWidth: '400px'
        }}>
          {tradeNotifications.map(notif => (
            <div
              key={notif.id}
              style={{
                padding: '12px 16px',
                borderRadius: '8px',
                background: notif.type === 'error' ? 'rgba(239, 68, 68, 0.95)' :
                           notif.type === 'warning' ? 'rgba(245, 158, 11, 0.95)' :
                           notif.type === 'success' ? 'rgba(34, 197, 94, 0.95)' :
                           'rgba(59, 130, 246, 0.95)',
                color: '#fff',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                animation: 'slideIn 0.3s ease-out'
              }}
            >
              <span style={{ fontSize: '18px' }}>
                {notif.type === 'error' ? '🚨' :
                 notif.type === 'warning' ? '⚠️' :
                 notif.type === 'success' ? '✅' : 'ℹ️'}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, marginBottom: '2px' }}>
                  {notif.type === 'error' ? 'Stop Out' :
                   notif.type === 'warning' ? 'Warning' :
                   notif.type === 'success' ? 'Trade Closed' : 'Notice'}
                </div>
                <div style={{ fontSize: '13px', opacity: 0.95 }}>{notif.message}</div>
              </div>
              <button
                onClick={() => setTradeNotifications(prev => prev.filter(n => n.id !== notif.id))}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#fff',
                  fontSize: '16px',
                  cursor: 'pointer',
                  opacity: 0.8
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Notification Panel */}
      {showNotificationPanel && (
        <>
          <div 
            className="notification-panel-overlay" 
            onClick={() => setShowNotificationPanel(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.3)',
              zIndex: 998
            }}
          />
          <div 
            className="notification-panel"
            style={{
              position: 'fixed',
              top: '60px',
              right: '16px',
              width: '360px',
              maxWidth: 'calc(100vw - 32px)',
              maxHeight: '70vh',
              background: 'var(--bg-secondary)',
              borderRadius: '12px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
              zIndex: 999,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              border: '1px solid var(--border-color)'
            }}
          >
            {/* Panel Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px',
              borderBottom: '1px solid var(--border-color)'
            }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>🔔 Notifications</h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                {unreadNotifCount > 0 && (
                  <button 
                    onClick={markAllNotificationsAsRead}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent-primary)',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    Mark all read
                  </button>
                )}
                <button 
                  onClick={() => setShowNotificationPanel(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '18px',
                    cursor: 'pointer',
                    color: 'var(--text-secondary)'
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Notifications List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
              {notificationsLoading ? (
                <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
                  Loading...
                </div>
              ) : systemNotifications.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>📭</div>
                  <p>No notifications yet</p>
                </div>
              ) : (
                systemNotifications.map(notif => (
                  <div 
                    key={notif._id}
                    onClick={() => !notif.isRead && markNotificationAsRead(notif._id)}
                    style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid var(--border-color)',
                      background: notif.isRead ? 'transparent' : 'rgba(59, 130, 246, 0.1)',
                      cursor: notif.isRead ? 'default' : 'pointer',
                      transition: 'background 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                      <span style={{ 
                        fontSize: '20px',
                        flexShrink: 0
                      }}>
                        {notif.type === 'success' ? '✅' : 
                         notif.type === 'warning' ? '⚠️' : 
                         notif.type === 'error' ? '❌' : 
                         notif.type === 'announcement' ? '📢' : 'ℹ️'}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ 
                          fontWeight: 600, 
                          fontSize: '14px',
                          marginBottom: '4px',
                          color: 'var(--text-primary)'
                        }}>
                          {notif.title}
                          {!notif.isRead && (
                            <span style={{
                              display: 'inline-block',
                              width: '8px',
                              height: '8px',
                              background: '#3b82f6',
                              borderRadius: '50%',
                              marginLeft: '8px'
                            }} />
                          )}
                        </div>
                        <div style={{ 
                          fontSize: '13px', 
                          color: 'var(--text-secondary)',
                          lineHeight: 1.4
                        }}>
                          {notif.message}
                        </div>
                        <div style={{ 
                          fontSize: '11px', 
                          color: 'var(--text-muted)',
                          marginTop: '6px'
                        }}>
                          {new Date(notif.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
      
      {/* Mobile menu overlay */}
      {mobileMenuOpen && <div className="mobile-menu-overlay" onClick={() => setMobileMenuOpen(false)} />}

      {/* Main Content - Outlet for nested routes */}
      <div className="main-content">
        <Outlet context={outletContext} />
      </div>

      {/* Status Bar */}
      <footer className="status-bar">
        <div className="status-left">
          <span className="status-symbol">{selectedSymbol}</span>
          <span className={`market-status ${isMetaApiConnected ? 'open' : 'closed'}`}>
            {isMetaApiConnected ? '● Open' : '○ Closed'}
          </span>
          <div className="status-currency-toggle">
            {(allowedCurrencyDisplay === 'BOTH' || allowedCurrencyDisplay === 'USD') && (
              <button className={`status-curr-btn ${displayCurrency === 'USD' ? 'active' : ''}`} onClick={() => handleCurrencyChange('USD')}>$ USD</button>
            )}
            {(allowedCurrencyDisplay === 'BOTH' || allowedCurrencyDisplay === 'INR') && (
              <button className={`status-curr-btn ${displayCurrency === 'INR' ? 'active' : ''}`} onClick={() => handleCurrencyChange('INR')}>₹ INR</button>
            )}
          </div>
        </div>
        <div className="status-center">
          <span className="status-label">Bal:</span>
          <span className="status-value">
            {displayCurrency === 'INR' ? '₹' : '$'}
            {displayCurrency === 'INR' ? (Number(walletData.balance || 0) * (usdInrRate + usdMarkup)).toFixed(2) : Number(walletData.balance || 0).toFixed(2)}
          </span>
          <span className="status-divider">|</span>
          <span className="status-label">Equity:</span>
          <span className={`status-value ${Number(walletData.equity || 0) < 0 ? 'negative' : ''}`}>
            {displayCurrency === 'INR' ? '₹' : '$'}
            {displayCurrency === 'INR' ? (Number(walletData.equity || 0) * (usdInrRate + usdMarkup)).toFixed(2) : Number(walletData.equity || 0).toFixed(2)}
          </span>
          <span className="status-divider">|</span>
          <span className="status-label">Margin:</span>
          <span className="status-value">
            {displayCurrency === 'INR' ? '₹' : '$'}
            {displayCurrency === 'INR' ? (Number(walletData.margin || 0) * (usdInrRate + usdMarkup)).toFixed(2) : Number(walletData.margin || 0).toFixed(2)}
          </span>
          <span className="status-divider">|</span>
          <span className={`status-value ${Number(walletData.freeMargin || 0) < 0 ? 'negative' : ''}`}>
            Free: {displayCurrency === 'INR' ? '₹' : '$'}
            {displayCurrency === 'INR' ? (Number(walletData.freeMargin || 0) * (usdInrRate + usdMarkup)).toFixed(2) : Number(walletData.freeMargin || 0).toFixed(2)}
          </span>
          {Number(walletData.marginLevel || 0) > 0 && (
            <>
              <span className="status-divider">|</span>
              <span className={`margin-level ${Number(walletData.marginLevel || 0) < 100 ? 'warning' : ''}`}>
                Level: {Number(walletData.marginLevel || 0).toFixed(0)}%
              </span>
            </>
          )}
        </div>
        <div className="status-right">
          <span className="usd-rate">1 USD = ₹{(usdInrRate + usdMarkup).toFixed(2)}</span>
          <span>Positions: {positions.length}</span>
          <span className={`live-status ${isMetaApiConnected ? '' : 'offline'}`}>
            {isMetaApiConnected ? '● Live' : '○ Offline'}
          </span>
        </div>
      </footer>

      <div className={`mobi-fixed-footer ${mobileStatusOpen ? 'mobi-status-open' : ''}`}>
        <div className="mobi-status-strip">
          <span className="m-mono" style={{ fontWeight: 600, color: 'var(--m-blue-l, #4d8eff)' }}>{selectedSymbol}</span>
          <span>
            Bal{' '}
            <span className="m-mono">
              {displayCurrency === 'INR' ? '₹' : '$'}
              {displayCurrency === 'INR'
                ? (Number(walletData.balance || 0) * (usdInrRate + usdMarkup)).toFixed(2)
                : Number(walletData.balance || 0).toFixed(2)}
            </span>
          </span>
          <button
            type="button"
            className="mobi-status-expand-btn"
            onClick={() => setMobileStatusOpen((o) => !o)}
          >
            {mobileStatusOpen ? '▲ Less' : '▼ More'}
          </button>
        </div>
        <div className="mobi-status-detail">
          <span>
            Equity: {displayCurrency === 'INR' ? '₹' : '$'}
            {displayCurrency === 'INR'
              ? (Number(walletData.equity || 0) * (usdInrRate + usdMarkup)).toFixed(2)
              : Number(walletData.equity || 0).toFixed(2)}
          </span>
          <span>
            Margin: {displayCurrency === 'INR' ? '₹' : '$'}
            {displayCurrency === 'INR'
              ? (Number(walletData.margin || 0) * (usdInrRate + usdMarkup)).toFixed(2)
              : Number(walletData.margin || 0).toFixed(2)}
          </span>
          <span>
            Free: {displayCurrency === 'INR' ? '₹' : '$'}
            {displayCurrency === 'INR'
              ? (Number(walletData.freeMargin || 0) * (usdInrRate + usdMarkup)).toFixed(2)
              : Number(walletData.freeMargin || 0).toFixed(2)}
          </span>
          <span>1 USD = ₹{(usdInrRate + usdMarkup).toFixed(2)}</span>
          <span>Positions: {positions.length}</span>
          <span>{isMetaApiConnected ? '● Live' : '○ Offline'}</span>
        </div>
        <nav className="mobile-bottom-nav mobi-SetupFX-bnav" aria-label="Main">
          <button
            type="button"
            className={`mobi-bnav-item ${activePage === 'home' ? 'mobi-active' : ''}`}
            onClick={() => {
              navigateToPage('home');
              setMobileMenuOpen(false);
            }}
          >
            <span className="mobi-bnav-dot" aria-hidden />
            <span className="mobi-bnav-icon" aria-hidden>🏠</span>
            <span className="mobi-bnav-label">Home</span>
          </button>
          <button
            type="button"
            className={`mobi-bnav-item ${activePage === 'market' && mobileMarketTab !== 'chart' ? 'mobi-active' : ''}`}
            onClick={() => {
              navigateToPage('market');
              setMobileMarketTab('instruments');
              setMobileShowChartBelow(false);
              setMobileMenuOpen(false);
            }}
          >
            <span className="mobi-bnav-dot" aria-hidden />
            <span className="mobi-bnav-icon" aria-hidden>📊</span>
            <span className="mobi-bnav-label">Market</span>
          </button>
          <div className="mobi-bnav-trade-wrap">
            <button
              type="button"
              className={`mobi-bnav-trade ${activePage === 'market' && mobileMarketTab === 'chart' ? 'mobi-fab-active' : ''}`}
              aria-label="Open price chart"
              onClick={() => {
                navigateToPage('market');
                setMobileMarketTab('chart');
                setMobileShowChartBelow(false);
                setMobileMenuOpen(false);
              }}
            >
              ⚡
            </button>
            <span className="mobi-bnav-trade-label">Chart</span>
          </div>
          <button
            type="button"
            className={`mobi-bnav-item ${activePage === 'orders' ? 'mobi-active' : ''}`}
            onClick={() => {
              navigateToPage('orders');
              setMobileMenuOpen(false);
            }}
          >
            <span className="mobi-bnav-dot" aria-hidden />
            <span className="mobi-bnav-icon" aria-hidden>📋</span>
            <span className="mobi-bnav-label">Orders</span>
          </button>
          <button
            type="button"
            className={`mobi-bnav-item ${activePage === 'settings' ? 'mobi-active' : ''}`}
            onClick={() => {
              navigateToPage('settings');
              setMobileMenuOpen(false);
            }}
          >
            <span className="mobi-bnav-dot" aria-hidden />
            <span className="mobi-bnav-icon" aria-hidden>👤</span>
            <span className="mobi-bnav-label">Profile</span>
          </button>
        </nav>
      </div>
    </div>
  );
}

export default UserLayout;
