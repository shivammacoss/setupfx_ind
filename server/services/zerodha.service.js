const axios = require('axios');
const crypto = require('crypto');
const WebSocket = require('ws');
const ZerodhaSettings = require('../models/ZerodhaSettings');
const {
  filterZerodhaInstrumentsByExpirySettings,
  mapClientSegmentToExpirySettingsKey
} = require('./indianFnOExpiryFilter');

const KOLKATA_TZ = 'Asia/Kolkata';

/** yyyy-mm-dd HH:mm:ss in IST — Kite historical expects exchange-local style datetimes for intraday. */
function formatKiteISTDateTime(unixSec) {
  const d = new Date(Math.floor(unixSec) * 1000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: KOLKATA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(d);
  const p = (t) => parts.find((x) => x.type === t)?.value ?? '00';
  return `${p('year')}-${p('month')}-${p('day')} ${p('hour')}:${p('minute')}:${p('second')}`;
}

function formatKiteISTDateOnly(unixSec) {
  const d = new Date(Math.floor(unixSec) * 1000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: KOLKATA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(d);
  const p = (t) => parts.find((x) => x.type === t)?.value ?? '00';
  return `${p('year')}-${p('month')}-${p('day')}`;
}

/** Kite caps intraday history (~60 calendar days). Daily allows longer ranges. */
function maxKiteHistorySpanSec(interval) {
  if (interval === 'day') return 86400 * 2000;
  return 86400 * 60;
}

/**
 * Best bid/ask from Kite quote or parsed tick: use depth when both sides exist, else LTP on both.
 * Kite sorts depth.buy descending (best bid first) and depth.sell ascending (best ask first).
 */
function extractBidAskFromZerodha(tickLike, ltpFallback = 0) {
  const ltp =
    Number(tickLike?.lastPrice ?? tickLike?.last_price ?? tickLike?.ltp ?? ltpFallback) || 0;
  const db = tickLike?.depth?.buy?.[0]?.price;
  const ds = tickLike?.depth?.sell?.[0]?.price;
  const hasBid = Number(db) > 0;
  const hasAsk = Number(ds) > 0;
  let bid = ltp;
  let ask = ltp;
  if (hasBid && hasAsk) {
    bid = Number(db);
    ask = Number(ds);
    if (ask < bid) {
      const t = bid;
      bid = ask;
      ask = t;
    }
  }
  return { bid, ask, ltp: ltp || bid };
}

class ZerodhaService {
  constructor() {
    this.baseUrl = 'https://api.kite.trade';
    this.loginUrl = 'https://kite.zerodha.com/connect/login';
    this.ws = null;
    this.tickCallbacks = [];
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.instrumentsCache = {};
    this.allInstrumentsCache = {}; // Cache all instruments by exchange
    this.instrumentsCacheTime = null;
    this.CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours - Zerodha updates instruments daily
    this.ticksCache = {}; // Cache latest ticks by symbol for trade execution
  }

  // Get cached price for a symbol (used by trade execution)
  getPrice(symbol) {
    return this.ticksCache[symbol] || null;
  }

  // Get all cached prices
  getAllPrices() {
    return this.ticksCache;
  }

  // Check if Zerodha token is expired
  async isTokenExpired() {
    const settings = await ZerodhaSettings.getSettings();
    if (!settings.accessToken || !settings.tokenExpiry) {
      return true;
    }
    // Token is expired if current time is past tokenExpiry
    return new Date() >= new Date(settings.tokenExpiry);
  }

  // Check token and mark as disconnected if expired
  async checkAndHandleTokenExpiry() {
    const settings = await ZerodhaSettings.getSettings();
    if (!settings.accessToken) return false;
    
    const isExpired = await this.isTokenExpired();
    if (isExpired) {
      console.log('⚠️ Zerodha token has expired! Please re-authenticate.');
      settings.isConnected = false;
      settings.wsStatus = 'disconnected';
      await settings.save();
      
      // Disconnect WebSocket if connected
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
      return true; // Token was expired
    }
    return false; // Token is still valid
  }

  // Initialize - check connection and auto-connect WebSocket
  async initialize() {
    try {
      const settings = await ZerodhaSettings.getSettings();
      
      // Check if token is expired on startup
      if (settings.accessToken && settings.tokenExpiry) {
        const isExpired = await this.checkAndHandleTokenExpiry();
        if (isExpired) {
          console.log('⚠️ Zerodha: Token expired. Please re-authenticate in Admin > Zerodha Connect.');
          return;
        }
      }
      
      if (settings.isConnected && settings.accessToken) {
        console.log('✅ Zerodha: Connected. Token valid until:', settings.tokenExpiry);
        await this.removeExpiredInstruments();
        
        // Auto-connect WebSocket if we have subscribed instruments
        if (settings.subscribedInstruments?.length > 0) {
          try {
            await this.connectWebSocket();
            console.log('Zerodha WebSocket auto-connected on startup');
          } catch (wsError) {
            console.log('Zerodha WebSocket auto-connect skipped:', wsError.message);
          }
        }
      }
    } catch (error) {
      console.error('Zerodha initialization error:', error.message);
    }
  }

  // Fetch instruments for a specific exchange (on-demand, cached per exchange)
  async fetchExchangeInstruments(exchange) {
    // Check if already cached and not expired
    if (this.allInstrumentsCache[exchange] && this.instrumentsCacheTime) {
      const cacheAge = Date.now() - this.instrumentsCacheTime;
      if (cacheAge < this.CACHE_DURATION) {
        return this.allInstrumentsCache[exchange];
      }
    }

    // Fetch fresh from Zerodha
    const instruments = await this.getInstruments(exchange);
    this.allInstrumentsCache[exchange] = instruments;
    this.instrumentsCacheTime = Date.now();
    console.log(`Zerodha: Fetched ${instruments.length} instruments from ${exchange} (on-demand)`);
    
    return instruments;
  }

  // Remove expired instruments from subscribed list
  async removeExpiredInstruments() {
    const settings = await ZerodhaSettings.getSettings();
    if (!settings.autoRemoveExpired) return;

    const now = new Date();
    const originalCount = settings.subscribedInstruments.length;
    
    // IST date-only comparison so today's expiry instruments remain visible all day
    const nowIST = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const todayIST = new Date(nowIST.getFullYear(), nowIST.getMonth(), nowIST.getDate()).getTime();
    settings.subscribedInstruments = settings.subscribedInstruments.filter(inst => {
      if (!inst.expiry) return true; // No expiry = keep
      const exp = new Date(inst.expiry);
      const expIST = new Date(exp.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      const expDay = new Date(expIST.getFullYear(), expIST.getMonth(), expIST.getDate()).getTime();
      return expDay >= todayIST;
    });

    const removedCount = originalCount - settings.subscribedInstruments.length;
    if (removedCount > 0) {
      await settings.save();
      console.log(`Zerodha: Removed ${removedCount} expired instruments`);
    }

    return removedCount;
  }

  // Search instruments ON-DEMAND - only fetches the specific exchange needed
  async searchAllInstruments(query, segment = null) {
    if (!query || query.length < 2) {
      return []; // Require at least 2 characters to search
    }

    const segmentToExchange = {
      'nseEq': 'NSE',
      'bseEq': 'BSE',
      'nseFut': 'NFO',
      'nseOpt': 'NFO',
      'mcxFut': 'MCX',
      'mcxOpt': 'MCX',
      'bseFut': 'BFO',
      'bseOpt': 'BFO'
    };

    const exchange = segment ? segmentToExchange[segment] : null;
    
    // Only fetch the specific exchange needed (on-demand)
    let instruments = [];
    if (exchange) {
      instruments = await this.fetchExchangeInstruments(exchange);
    } else {
      // If no segment specified, search subscribed instruments only
      const settings = await ZerodhaSettings.getSettings();
      instruments = settings.subscribedInstruments || [];
    }

    if (!instruments || instruments.length === 0) {
      return [];
    }

    // Filter by query
    const queryLower = query.toLowerCase();
    let results = instruments.filter(inst => 
      inst.symbol?.toLowerCase().includes(queryLower) ||
      inst.name?.toLowerCase().includes(queryLower)
    );

    // Filter by segment type
    if (segment) {
      results = results.filter(inst => {
        if (segment === 'nseEq') {
          return inst.segment === 'NSE' && inst.instrumentType === 'EQ';
        } else if (segment === 'bseEq') {
          return (inst.segment === 'BSE' || inst.exchange === 'BSE') && inst.instrumentType === 'EQ';
        } else if (segment === 'nseFut') {
          return inst.segment === 'NFO-FUT' || 
                 (inst.exchange === 'NFO' && inst.instrumentType === 'FUT');
        } else if (segment === 'nseOpt') {
          return inst.segment === 'NFO-OPT' || 
                 (inst.exchange === 'NFO' && (inst.instrumentType === 'CE' || inst.instrumentType === 'PE'));
        } else if (segment === 'mcxFut') {
          return inst.segment === 'MCX-FUT' ||
                 (inst.exchange === 'MCX' && inst.instrumentType === 'FUT');
        } else if (segment === 'mcxOpt') {
          return inst.segment === 'MCX-OPT' ||
                 (inst.exchange === 'MCX' && (inst.instrumentType === 'CE' || inst.instrumentType === 'PE'));
        } else if (segment === 'bseFut') {
          return inst.segment === 'BFO-FUT' || 
                 (inst.exchange === 'BFO' && inst.instrumentType === 'FUT');
        } else if (segment === 'bseOpt') {
          return inst.segment === 'BFO-OPT' || 
                 (inst.exchange === 'BFO' && (inst.instrumentType === 'CE' || inst.instrumentType === 'PE'));
        }
        return true;
      });
    }

    // Filter out expired instruments (IST date-only: today's expiry stays visible)
    const now = new Date();
    const nowIST2 = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const todayIST2 = new Date(nowIST2.getFullYear(), nowIST2.getMonth(), nowIST2.getDate()).getTime();
    results = results.filter(inst => {
      if (!inst.expiry) return true;
      const exp = new Date(inst.expiry);
      const expIST = new Date(exp.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      const expDay = new Date(expIST.getFullYear(), expIST.getMonth(), expIST.getDate()).getTime();
      return expDay >= todayIST2;
    });

    const expiryKey = mapClientSegmentToExpirySettingsKey(segment);
    if (expiryKey) {
      results = await filterZerodhaInstrumentsByExpirySettings(results, expiryKey);
    }

    return results.slice(0, 50); // Limit to 50 results
  }

  // Fetch quotes (LTP) for instruments - works even when market is closed
  async getQuotes(instruments) {
    const settings = await ZerodhaSettings.getSettings();
    if (!settings.accessToken) {
      throw new Error('Not authenticated with Zerodha');
    }

    try {
      // Format: exchange:tradingsymbol (e.g., NSE:RELIANCE, NFO:NIFTY25MARFUT)
      const instrumentKeys = instruments.map(inst => {
        const exchange = inst.exchange || 'NSE';
        return `${exchange}:${inst.symbol}`;
      });

      const response = await axios.get(`${this.baseUrl}/quote`, {
        params: { i: instrumentKeys },
        headers: {
          'X-Kite-Version': '3',
          'Authorization': `token ${settings.apiKey}:${settings.accessToken}`
        },
        paramsSerializer: params => {
          // Zerodha expects multiple 'i' params
          return params.i.map(i => `i=${encodeURIComponent(i)}`).join('&');
        }
      });

      if (response.data.status === 'success') {
        return response.data.data;
      }
      return {};
    } catch (error) {
      console.error('Error fetching quotes:', error.response?.data || error.message);
      return {};
    }
  }

  // Fetch LTP for subscribed instruments and broadcast
  async fetchAndBroadcastLTP() {
    try {
      const settings = await ZerodhaSettings.getSettings();
      if (!settings.accessToken || settings.subscribedInstruments.length === 0) {
        return;
      }

      const quotes = await this.getQuotes(settings.subscribedInstruments);
      
      // Convert quotes to tick format
      const ticks = [];
      for (const [key, quote] of Object.entries(quotes)) {
        const instrument = settings.subscribedInstruments.find(i => 
          `${i.exchange}:${i.symbol}` === key
        );
        if (instrument && quote.last_price) {
          const { bid, ask, ltp } = extractBidAskFromZerodha(quote, quote.last_price);

          ticks.push({
            token: instrument.token,
            symbol: instrument.symbol,
            exchange: instrument.exchange,
            name: instrument.name,
            last_price: ltp,
            lastPrice: ltp,
            ltp,
            bid,
            ask,
            high: quote.ohlc?.high || 0,
            low: quote.ohlc?.low || 0,
            open: quote.ohlc?.open || 0,
            close: quote.ohlc?.close || 0,
            volume: quote.volume || 0,
            change: quote.net_change || 0,
            changePercent: ((ltp - quote.ohlc?.close) / quote.ohlc?.close * 100) || 0
          });
        }
      }

      // Broadcast to callbacks
      if (ticks.length > 0) {
        this.tickCallbacks.forEach(callback => {
          try {
            callback(ticks);
          } catch (error) {
            console.error('LTP callback error:', error);
          }
        });
      }

      return ticks;
    } catch (error) {
      console.error('Error fetching LTP:', error.message);
      return [];
    }
  }

  // Generate login URL for OAuth
  async getLoginUrl() {
    const settings = await ZerodhaSettings.getSettings();
    if (!settings.apiKey) {
      throw new Error('API Key not configured');
    }
    return `${this.loginUrl}?v=3&api_key=${settings.apiKey}`;
  }

  // Exchange request token for access token
  async generateSession(requestToken) {
    const settings = await ZerodhaSettings.getSettings();
    if (!settings.apiKey || !settings.apiSecret) {
      throw new Error('API credentials not configured');
    }

    const checksum = crypto
      .createHash('sha256')
      .update(settings.apiKey + requestToken + settings.apiSecret)
      .digest('hex');

    try {
      const response = await axios.post(`${this.baseUrl}/session/token`, {
        api_key: settings.apiKey,
        request_token: requestToken,
        checksum: checksum
      }, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      if (response.data.status === 'success') {
        const { access_token, refresh_token } = response.data.data;
        
        // Save tokens to database
        settings.accessToken = access_token;
        settings.refreshToken = refresh_token;
        settings.tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        settings.isConnected = true;
        settings.lastConnected = new Date();
        await settings.save();

        return { success: true, accessToken: access_token };
      } else {
        throw new Error(response.data.message || 'Failed to generate session');
      }
    } catch (error) {
      console.error('Zerodha session error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || error.message);
    }
  }

  // Get instruments list from Zerodha
  async getInstruments(exchange = null) {
    const settings = await ZerodhaSettings.getSettings();
    if (!settings.accessToken) {
      throw new Error('Not authenticated with Zerodha');
    }

    try {
      let url = `${this.baseUrl}/instruments`;
      if (exchange) {
        url += `/${exchange}`;
      }

      const response = await axios.get(url, {
        headers: {
          'X-Kite-Version': '3',
          'Authorization': `token ${settings.apiKey}:${settings.accessToken}`
        }
      });

      // Debug: Log raw CSV first line
      const rawLines = response.data.split('\n');
      console.log('Zerodha RAW CSV headers:', rawLines[0]);
      if (rawLines[1]) {
        console.log('Zerodha RAW CSV first data row:', rawLines[1].substring(0, 200));
      }
      
      // Parse CSV response
      const instruments = this.parseInstrumentsCSV(response.data);
      
      // Debug: Log first parsed instrument
      if (instruments[0]) {
        console.log('Zerodha PARSED first instrument:', JSON.stringify(instruments[0]));
      }
      
      // Cache instruments
      if (exchange) {
        this.instrumentsCache[exchange] = instruments;
      }

      return instruments;
    } catch (error) {
      const errorData = error.response?.data || error.message;
      // Check if it's an access denied error (token expired)
      if (typeof errorData === 'string' && errorData.includes('AccessDenied')) {
        console.error('Zerodha token expired - please re-authenticate');
        // Mark as disconnected
        const settings = await ZerodhaSettings.getSettings();
        settings.isConnected = false;
        settings.wsStatus = 'disconnected';
        await settings.save();
        throw new Error('Zerodha token expired. Please re-authenticate in Admin > Zerodha Connect.');
      }
      console.error('Error fetching instruments:', errorData);
      throw new Error(error.response?.data?.message || error.message);
    }
  }

  // Parse instruments CSV to JSON - handles quoted fields
  parseInstrumentsCSV(csvData) {
    const lines = csvData.split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    const instruments = [];

    // Find column indices - Zerodha CSV format
    const colIdx = {
      instrument_token: headers.indexOf('instrument_token'),
      tradingsymbol: headers.indexOf('tradingsymbol'),
      exchange: headers.indexOf('exchange'),
      segment: headers.indexOf('segment'),
      name: headers.indexOf('name'),
      lot_size: headers.indexOf('lot_size'),
      tick_size: headers.indexOf('tick_size'),
      expiry: headers.indexOf('expiry'),
      strike: headers.indexOf('strike'),
      instrument_type: headers.indexOf('instrument_type')
    };

    // Helper to parse CSV line with quoted fields
    const parseCSVLine = (line) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    // Debug: Log first line to see structure
    if (lines.length > 1) {
      const sampleValues = parseCSVLine(lines[1]);
      console.log('Zerodha CSV headers:', headers);
      console.log('Zerodha CSV sample row values count:', sampleValues.length);
      console.log('lot_size index:', colIdx.lot_size, 'value:', sampleValues[colIdx.lot_size]);
    }

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      
      const values = parseCSVLine(lines[i]);
      
      // Get lot_size from API, but for MCX use actual market lot sizes (quantity per lot)
      const symbol = values[colIdx.tradingsymbol]?.trim() || '';
      const exchange = values[colIdx.exchange]?.trim() || '';
      let lotSizeVal = parseInt(values[colIdx.lot_size]) || 1;
      
      // MCX lot sizes: 1 lot = X quantity (grams/kg/barrels)
      if (exchange === 'MCX') {
        if (symbol.startsWith('GOLD') && !symbol.includes('GUINEA') && !symbol.includes('PETAL') && !symbol.startsWith('GOLDM')) {
          lotSizeVal = 100; // GOLD: 1 lot = 100 grams
        } else if (symbol.startsWith('GOLDM')) {
          lotSizeVal = 10; // GOLDM (Mini): 1 lot = 10 grams
        } else if (symbol.startsWith('GOLDGUINEA')) {
          lotSizeVal = 8; // GOLDGUINEA: 1 lot = 8 grams
        } else if (symbol.startsWith('SILVER') && !symbol.startsWith('SILVERM')) {
          lotSizeVal = 30; // SILVER: 1 lot = 30 kg
        } else if (symbol.startsWith('SILVERM')) {
          lotSizeVal = 5; // SILVERM (Mini): 1 lot = 5 kg
        } else if (symbol.startsWith('CRUDE') && !symbol.startsWith('CRUDEM')) {
          lotSizeVal = 100; // CRUDE: 1 lot = 100 barrels
        } else if (symbol.startsWith('CRUDEM')) {
          lotSizeVal = 10; // CRUDEM (Mini): 1 lot = 10 barrels
        } else if (symbol.startsWith('NATURAL')) {
          lotSizeVal = 1250; // NATURALGAS: 1 lot = 1250 mmBtu
        } else if (symbol.startsWith('COPPER')) {
          lotSizeVal = 2500; // COPPER: 1 lot = 2500 kg
        } else if (symbol.startsWith('ZINC')) {
          lotSizeVal = 5000; // ZINC: 1 lot = 5000 kg
        } else if (symbol.startsWith('ALUMINIUM')) {
          lotSizeVal = 5000; // ALUMINIUM: 1 lot = 5000 kg
        } else if (symbol.startsWith('LEAD')) {
          lotSizeVal = 5000; // LEAD: 1 lot = 5000 kg
        } else if (symbol.startsWith('NICKEL')) {
          lotSizeVal = 1500; // NICKEL: 1 lot = 1500 kg
        }
      }
      
      instruments.push({
        token: parseInt(values[colIdx.instrument_token]),
        symbol: values[colIdx.tradingsymbol]?.trim(),
        exchange: values[colIdx.exchange]?.trim(),
        segment: values[colIdx.segment]?.trim(),
        name: values[colIdx.name]?.trim().replace(/"/g, ''),
        lotSize: lotSizeVal,
        tickSize: parseFloat(values[colIdx.tick_size]) || 0.05,
        expiry: values[colIdx.expiry]?.trim() || null,
        strike: parseFloat(values[colIdx.strike]) || null,
        instrumentType: values[colIdx.instrument_type]?.trim()
      });
    }

    return instruments;
  }

  // Search instruments by symbol
  async searchInstruments(query, segment = null) {
    const settings = await ZerodhaSettings.getSettings();
    
    // Map segment to exchange
    const segmentToExchange = {
      'nseEq': 'NSE',
      'bseEq': 'BSE',
      'nseFut': 'NFO',
      'nseOpt': 'NFO',
      'mcxFut': 'MCX',
      'mcxOpt': 'MCX',
      'bseFut': 'BFO',
      'bseOpt': 'BFO'
    };

    const exchange = segment ? segmentToExchange[segment] : null;
    
    // Get instruments from cache or fetch
    let instruments = this.instrumentsCache[exchange];
    if (!instruments && settings.accessToken) {
      try {
        instruments = await this.getInstruments(exchange);
      } catch (error) {
        console.error('Error fetching instruments for search:', error);
        instruments = [];
      }
    }

    if (!instruments) {
      return [];
    }

    // Filter by query and segment type
    const queryLower = query.toLowerCase();
    return instruments.filter(inst => {
      const matchesQuery = inst.symbol?.toLowerCase().includes(queryLower) ||
                          inst.name?.toLowerCase().includes(queryLower);
      
      if (!matchesQuery) return false;

      // Filter by instrument type based on segment
      // Zerodha segment formats: NSE, NFO-FUT, NFO-OPT, MCX-FUT, MCX-OPT, BFO-FUT, BFO-OPT
      // Also check exchange + instrumentType combination
      if (segment === 'nseEq') {
        return (inst.segment === 'NSE' || inst.exchange === 'NSE') && 
               (inst.instrumentType === 'EQ' || !inst.instrumentType);
      } else if (segment === 'bseEq') {
        return (inst.segment === 'BSE' || inst.exchange === 'BSE') &&
               (inst.instrumentType === 'EQ' || !inst.instrumentType);
      } else if (segment === 'nseFut') {
        return inst.segment === 'NFO-FUT' || 
               (inst.exchange === 'NFO' && inst.instrumentType === 'FUT') ||
               (inst.segment?.includes('NFO') && inst.instrumentType === 'FUT');
      } else if (segment === 'nseOpt') {
        return inst.segment === 'NFO-OPT' || 
               (inst.exchange === 'NFO' && (inst.instrumentType === 'CE' || inst.instrumentType === 'PE')) ||
               (inst.segment?.includes('NFO') && (inst.instrumentType === 'CE' || inst.instrumentType === 'PE'));
      } else if (segment === 'mcxFut') {
        return inst.segment === 'MCX-FUT' || inst.segment === 'MCX' ||
               (inst.exchange === 'MCX' && inst.instrumentType === 'FUT') ||
               (inst.exchange === 'MCX' && !inst.instrumentType?.includes('OPT'));
      } else if (segment === 'mcxOpt') {
        return inst.segment === 'MCX-OPT' ||
               (inst.exchange === 'MCX' && (inst.instrumentType === 'CE' || inst.instrumentType === 'PE'));
      } else if (segment === 'bseFut') {
        return inst.segment === 'BFO-FUT' || 
               (inst.exchange === 'BFO' && inst.instrumentType === 'FUT');
      } else if (segment === 'bseOpt') {
        return inst.segment === 'BFO-OPT' || 
               (inst.exchange === 'BFO' && (inst.instrumentType === 'CE' || inst.instrumentType === 'PE'));
      }
      
      return true;
    }).slice(0, 50); // Limit results
  }

  // Connect to Zerodha WebSocket for live ticks
  async connectWebSocket() {
    const settings = await ZerodhaSettings.getSettings();
    if (!settings.accessToken || !settings.apiKey) {
      console.log('Zerodha WebSocket: Not authenticated, skipping connection');
      return; // Don't throw, just return silently
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    const wsUrl = `wss://ws.kite.trade?api_key=${settings.apiKey}&access_token=${settings.accessToken}`;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', async () => {
        console.log('Zerodha WebSocket connected');
        this.reconnectAttempts = 0;
        
        settings.wsStatus = 'connected';
        settings.wsLastError = null;
        await settings.save();

        // Subscribe to saved instruments
        if (settings.subscribedInstruments.length > 0) {
          const tokens = settings.subscribedInstruments.map(i => i.token);
          this.subscribe(tokens);
        }

        resolve();
      });

      this.ws.on('message', (data) => {
        this.handleTick(data);
      });

      this.ws.on('error', async (error) => {
        console.error('Zerodha WebSocket error:', error.message);
        // Use findByIdAndUpdate to avoid ParallelSaveError
        try {
          await ZerodhaSettings.findByIdAndUpdate(settings._id, { 
            wsStatus: 'error', 
            wsLastError: error.message 
          });
        } catch (e) { console.error('Failed to update ws status:', e.message); }
        reject(error);
      });

      this.ws.on('close', async () => {
        console.log('Zerodha WebSocket closed');
        // Use findByIdAndUpdate to avoid ParallelSaveError
        try {
          await ZerodhaSettings.findByIdAndUpdate(settings._id, { 
            wsStatus: 'disconnected' 
          });
        } catch (e) { console.error('Failed to update ws status:', e.message); }

        // Attempt reconnection only if authenticated
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          console.log(`Reconnecting... Attempt ${this.reconnectAttempts}`);
          setTimeout(async () => {
            try {
              await this.connectWebSocket();
            } catch (err) {
              console.log('WebSocket reconnect failed:', err.message);
            }
          }, 5000);
        }
      });
    });
  }

  // Subscribe to instrument tokens
  subscribe(tokens, mode = 'full') {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('WebSocket not connected');
      return;
    }

    // Mode: ltp, quote, full
    const message = JSON.stringify({
      a: 'subscribe',
      v: tokens
    });
    this.ws.send(message);

    // Set mode
    const modeMessage = JSON.stringify({
      a: 'mode',
      v: [mode, tokens]
    });
    this.ws.send(modeMessage);
  }

  // Unsubscribe from instrument tokens
  unsubscribe(tokens) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const message = JSON.stringify({
      a: 'unsubscribe',
      v: tokens
    });
    this.ws.send(message);
  }

  // Handle incoming tick data
  async handleTick(data) {
    try {
      // Zerodha sends binary data, need to parse it
      const ticks = this.parseBinaryTicks(data);
      
      if (ticks.length > 0) {
        // Enrich ticks with symbol information from subscribed instruments
        const settings = await ZerodhaSettings.getSettings();
        const enrichedTicks = ticks.map(tick => {
          const instrument = settings.subscribedInstruments.find(i => i.token === tick.token);
          const { bid, ask, ltp } = extractBidAskFromZerodha(tick, tick.lastPrice);
          if (instrument) {
            return {
              ...tick,
              bid,
              ask,
              symbol: instrument.symbol,
              exchange: instrument.exchange,
              name: instrument.name,
              last_price: ltp
            };
          }
          return { ...tick, bid, ask, last_price: ltp };
        });
        
        // Cache ticks by symbol for trade execution
        enrichedTicks.forEach(tick => {
          if (tick.symbol) {
            this.ticksCache[tick.symbol] = {
              symbol: tick.symbol,
              bid: tick.bid,
              ask: tick.ask,
              lastPrice: tick.lastPrice,
              high: tick.high,
              low: tick.low,
              open: tick.open,
              close: tick.close,
              change: tick.change,
              timestamp: Date.now()
            };
          }
        });
        
        // Log first tick for debugging (only occasionally)
        if (Math.random() < 0.01) {
          console.log(`Zerodha tick received: ${enrichedTicks.length} instruments, sample:`, enrichedTicks[0]?.symbol, enrichedTicks[0]?.lastPrice);
        }
        
        // Notify all callbacks with enriched ticks
        this.tickCallbacks.forEach(callback => {
          try {
            callback(enrichedTicks);
          } catch (error) {
            console.error('Tick callback error:', error);
          }
        });
      }
    } catch (error) {
      console.error('Error parsing tick data:', error);
    }
  }

  // Parse binary tick data from Zerodha
  parseBinaryTicks(buffer) {
    const ticks = [];
    
    if (buffer.length < 2) return ticks;

    const numberOfPackets = buffer.readInt16BE(0);
    let offset = 2;

    for (let i = 0; i < numberOfPackets; i++) {
      if (offset + 2 > buffer.length) break;
      
      const packetLength = buffer.readInt16BE(offset);
      offset += 2;

      if (offset + packetLength > buffer.length) break;

      const packet = buffer.slice(offset, offset + packetLength);
      offset += packetLength;

      const tick = this.parseTickPacket(packet, packetLength);
      if (tick) {
        ticks.push(tick);
      }
    }

    return ticks;
  }

  // Parse individual tick packet
  parseTickPacket(packet, length) {
    if (length < 8) return null;

    const tick = {
      token: packet.readInt32BE(0),
      lastPrice: packet.readInt32BE(4) / 100
    };

    // LTP mode (8 bytes)
    if (length === 8) {
      return tick;
    }

    // Quote mode (44 bytes) or Full mode (184 bytes)
    if (length >= 44) {
      tick.lastQuantity = packet.readInt32BE(8);
      tick.averagePrice = packet.readInt32BE(12) / 100;
      tick.volume = packet.readInt32BE(16);
      tick.buyQuantity = packet.readInt32BE(20);
      tick.sellQuantity = packet.readInt32BE(24);
      tick.open = packet.readInt32BE(28) / 100;
      tick.high = packet.readInt32BE(32) / 100;
      tick.low = packet.readInt32BE(36) / 100;
      tick.close = packet.readInt32BE(40) / 100;
      tick.change = ((tick.lastPrice - tick.close) / tick.close * 100).toFixed(2);
    }

    // Full mode: bytes 44–63 are last_trade_time, OI, OI day hi/lo, exchange ts — depth starts at 64
    // (matches kiteconnectjs parseBinary layout for 184-byte packets)
    if (length >= 184) {
      tick.lastTradeTimeSec = packet.readUInt32BE(44);
      tick.oi = packet.readInt32BE(48);
      tick.oiDayHigh = packet.readInt32BE(52);
      tick.oiDayLow = packet.readInt32BE(56);
      tick.exchangeTimestampSec = packet.readUInt32BE(60);

      tick.depth = {
        buy: [],
        sell: []
      };

      let depthOffset = 64;
      for (let i = 0; i < 5; i++) {
        tick.depth.buy.push({
          quantity: packet.readInt32BE(depthOffset),
          price: packet.readInt32BE(depthOffset + 4) / 100,
          orders: packet.readInt16BE(depthOffset + 8)
        });
        depthOffset += 12;
      }

      for (let i = 0; i < 5; i++) {
        tick.depth.sell.push({
          quantity: packet.readInt32BE(depthOffset),
          price: packet.readInt32BE(depthOffset + 4) / 100,
          orders: packet.readInt16BE(depthOffset + 8)
        });
        depthOffset += 12;
      }
    }

    return tick;
  }

  // Register tick callback
  onTick(callback) {
    this.tickCallbacks.push(callback);
    return () => {
      this.tickCallbacks = this.tickCallbacks.filter(cb => cb !== callback);
    };
  }

  // Disconnect WebSocket
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // Add instrument to subscription
  async addInstrument(instrument) {
    const settings = await ZerodhaSettings.getSettings();
    
    // Check if already subscribed
    const exists = settings.subscribedInstruments.find(i => i.token === instrument.token);
    if (exists) {
      return { success: true, message: 'Already subscribed' };
    }

    settings.subscribedInstruments.push(instrument);
    await settings.save();

    // Subscribe via WebSocket if connected
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.subscribe([instrument.token]);
    }

    return { success: true };
  }

  // Remove instrument from subscription
  async removeInstrument(token) {
    const settings = await ZerodhaSettings.getSettings();
    
    settings.subscribedInstruments = settings.subscribedInstruments.filter(i => i.token !== token);
    await settings.save();

    // Unsubscribe via WebSocket if connected
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.unsubscribe([token]);
    }

    return { success: true };
  }

  // Get current status
  async getStatus() {
    const settings = await ZerodhaSettings.getSettings();
    return {
      isConfigured: !!(settings.apiKey && settings.apiSecret),
      isConnected: settings.isConnected,
      wsStatus: settings.wsStatus,
      lastConnected: settings.lastConnected,
      subscribedCount: settings.subscribedInstruments.length,
      enabledSegments: settings.enabledSegments
    };
  }

  /**
   * Historical OHLC for charts. `fromUnix` / `toUnix` are TradingView-style UTC unix **seconds**
   * (optional). When omitted, defaults use **Asia/Kolkata** calendar (fixes UTC `toISOString()` day skew).
   */
  async getHistoricalData(instrumentToken, interval = 'minute', fromUnix = null, toUnix = null) {
    const settings = await ZerodhaSettings.getSettings();
    if (!settings.accessToken || !settings.apiKey) {
      throw new Error('Not authenticated with Zerodha');
    }

    const nowSec = Math.floor(Date.now() / 1000);
    let toSec =
      toUnix != null && Number.isFinite(Number(toUnix)) ? Math.floor(Number(toUnix)) : nowSec;
    let fromSec;
    if (fromUnix != null && Number.isFinite(Number(fromUnix))) {
      fromSec = Math.floor(Number(fromUnix));
    } else if (interval === 'day') {
      fromSec = toSec - 86400 * 365;
    } else if (interval === '60minute') {
      fromSec = toSec - 86400 * 7;
    } else {
      fromSec = toSec - 86400;
    }

    const maxSpan = maxKiteHistorySpanSec(interval);
    if (toSec - fromSec > maxSpan) {
      fromSec = toSec - maxSpan;
    }
    if (fromSec > toSec) {
      const t = fromSec;
      fromSec = toSec;
      toSec = t;
    }

    const fromParam =
      interval === 'day' ? formatKiteISTDateOnly(fromSec) : formatKiteISTDateTime(fromSec);
    const toParam = interval === 'day' ? formatKiteISTDateOnly(toSec) : formatKiteISTDateTime(toSec);

    try {
      const response = await axios.get(
        `${this.baseUrl}/instruments/historical/${instrumentToken}/${interval}`,
        {
          params: {
            from: fromParam,
            to: toParam
          },
          headers: {
            'X-Kite-Version': '3',
            'Authorization': `token ${settings.apiKey}:${settings.accessToken}`
          }
        }
      );

      if (response.data.status === 'success') {
        // Transform data to candlestick format for lightweight-charts
        const candles = response.data.data.candles.map(candle => ({
          time: Math.floor(new Date(candle[0]).getTime() / 1000),
          open: candle[1],
          high: candle[2],
          low: candle[3],
          close: candle[4],
          volume: candle[5]
        }));
        return candles;
      }
      return [];
    } catch (error) {
      console.error('Error fetching historical data:', error.response?.data || error.message);
      // Return empty array instead of throwing - chart will show no data
      return [];
    }
  }

  /**
   * Resolve instrument by tradingsymbol: subscribed list → per-exchange cache → fetch Kite CSV per exchange.
   * Needed after admin clears subscription/cache so charts (historical + ticks) work again on demand.
   */
  async findInstrumentBySymbol(symbol) {
    const settings = await ZerodhaSettings.getSettings();
    const symU = String(symbol || '').trim().toUpperCase();
    if (!symU) return null;

    const match = (i) =>
      i && String(i.symbol || '').trim().toUpperCase() === symU;

    const sub = (settings.subscribedInstruments || []).find(match);
    if (sub) return sub;

    for (const instruments of Object.values(this.instrumentsCache)) {
      if (!Array.isArray(instruments)) continue;
      const hit = instruments.find(match);
      if (hit) return hit;
    }

    if (!settings.accessToken || !settings.apiKey) return null;

    const exchanges = ['NSE', 'BSE', 'NFO', 'MCX', 'BFO'];
    for (const ex of exchanges) {
      try {
        const list = await this.getInstruments(ex);
        const hit = list.find(match);
        if (hit) return hit;
      } catch (e) {
        console.warn(`[Zerodha] findInstrumentBySymbol skip ${ex}:`, e.message);
      }
    }
    return null;
  }

  // Get instrument token by symbol
  async getInstrumentToken(symbol, exchange = null) {
    const inst = await this.findInstrumentBySymbol(symbol);
    return inst ? inst.token : null;
  }
}

// Singleton instance
const zerodhaService = new ZerodhaService();

module.exports = zerodhaService;
