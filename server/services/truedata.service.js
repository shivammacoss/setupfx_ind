const truedata = require('truedata-nodejs');
const TrueDataSettings = require('../models/TrueDataSettings');

class TrueDataService {
  constructor() {
    this.ticksCache = {};       // { symbolName: { symbol, lastPrice, bid, ask, high, low, open, close, volume, change, timestamp } }
    this.tickCallbacks = [];
    this.isConnected = false;
    this._touchlineData = {};   // Raw touchline from TrueData
  }

  getPrice(symbol) {
    return this.ticksCache[symbol] || this.ticksCache[symbol?.toUpperCase()] || null;
  }

  getAllPrices() {
    return this.ticksCache;
  }

  getLastPrices() {
    return this.ticksCache;
  }

  onTick(callback) {
    this.tickCallbacks.push(callback);
  }

  async initialize() {
    try {
      const settings = await TrueDataSettings.getSettings();
      if (settings.isEnabled && settings.username && settings.password) {
        // Non-blocking connect — don't crash server if TrueData fails
        this.connect().catch(err => {
          console.error('[TrueData] Auto-connect failed (non-fatal):', err.message);
        });
      } else {
        console.log('[TrueData] Not enabled or not configured, skipping');
      }
    } catch (err) {
      console.error('[TrueData] Initialize error:', err.message);
    }
  }

  async connect() {
    const settings = await TrueDataSettings.getSettings();
    if (!settings.username || !settings.password) {
      throw new Error('TrueData credentials not configured');
    }

    await TrueDataSettings.findOneAndUpdate({}, { wsStatus: 'connecting' });

    const symbols = settings.subscribedSymbols.map(s => s.symbol);

    // Register event handlers BEFORE connecting
    // Tick events (trade data)
    truedata.rtFeed.removeAllListeners('tick');
    truedata.rtFeed.on('tick', (tick) => {
      this._handleTick(tick);
    });

    // Touchline events (snapshot data on connect)
    truedata.rtFeed.removeAllListeners('touchline');
    truedata.rtFeed.on('touchline', (touchlineData) => {
      this._handleTouchline(touchlineData);
    });

    // Bid/ask events
    truedata.rtFeed.removeAllListeners('bidask');
    truedata.rtFeed.on('bidask', (data) => {
      this._handleBidAsk(data);
    });

    try {
      // Connect with bidask enabled
      truedata.rtConnect(
        settings.username,
        settings.password,
        symbols.length > 0 ? symbols : ['NIFTY 50'], // Need at least one symbol
        settings.port || 8086,
        1,  // bidask feed enabled
        1,  // heartbeat enabled
        0,  // not replay
        'push' // URL prefix
      );

      // Wait a bit for connection to establish
      await new Promise(resolve => setTimeout(resolve, 3000));

      this.isConnected = truedata.isSocketConnected();

      await TrueDataSettings.findOneAndUpdate({}, {
        wsStatus: this.isConnected ? 'connected' : 'error',
        isConnected: this.isConnected,
        lastConnected: this.isConnected ? new Date() : null,
        wsLastError: this.isConnected ? null : 'Connection failed'
      });

      if (this.isConnected) {
        console.log(`[TrueData] Connected! Subscribed to ${symbols.length} symbols`);
        // Auth historical API too
        try {
          await truedata.historical.auth(settings.username, settings.password);
          console.log('[TrueData] Historical API authenticated');
        } catch (e) {
          console.log('[TrueData] Historical auth skipped:', e.message);
        }
      }
    } catch (err) {
      this.isConnected = false;
      try {
        await TrueDataSettings.findOneAndUpdate({}, {
          wsStatus: 'error',
          isConnected: false,
          wsLastError: err.message
        });
      } catch (_) { /* ignore DB error */ }
      console.error('[TrueData] Connect error:', err.message);
    }
  }

  async disconnect() {
    try {
      truedata.rtDisconnect();
    } catch (e) { /* ignore */ }
    this.isConnected = false;
    await TrueDataSettings.findOneAndUpdate({}, {
      wsStatus: 'disconnected',
      isConnected: false
    });
    console.log('[TrueData] Disconnected');
  }

  async subscribe(symbols) {
    if (!Array.isArray(symbols) || symbols.length === 0) return;
    if (truedata.isSocketConnected()) {
      truedata.rtSubscribe(symbols);
      console.log(`[TrueData] Subscribed to: ${symbols.join(', ')}`);
    }
  }

  async unsubscribe(symbols) {
    if (!Array.isArray(symbols) || symbols.length === 0) return;
    if (truedata.isSocketConnected()) {
      truedata.rtUnsubscribe(symbols);
      console.log(`[TrueData] Unsubscribed from: ${symbols.join(', ')}`);
    }
  }

  async addSymbol(symbolObj) {
    const settings = await TrueDataSettings.getSettings();
    if (settings.subscribedSymbols.length >= settings.maxSymbols) {
      throw new Error(`TrueData trial limit: max ${settings.maxSymbols} symbols. Currently subscribed: ${settings.subscribedSymbols.length}`);
    }
    // Check duplicate
    const exists = settings.subscribedSymbols.some(s => s.symbol === symbolObj.symbol);
    if (exists) {
      throw new Error(`Symbol ${symbolObj.symbol} is already subscribed`);
    }
    settings.subscribedSymbols.push(symbolObj);
    await settings.save();
    // Subscribe on WS if connected
    if (truedata.isSocketConnected()) {
      truedata.rtSubscribe([symbolObj.symbol]);
    }
    return settings;
  }

  async removeSymbol(symbol) {
    const settings = await TrueDataSettings.getSettings();
    settings.subscribedSymbols = settings.subscribedSymbols.filter(s => s.symbol !== symbol);
    await settings.save();
    if (truedata.isSocketConnected()) {
      truedata.rtUnsubscribe([symbol]);
    }
    // Remove from cache
    delete this.ticksCache[symbol];
    return settings;
  }

  async getStatus() {
    const settings = await TrueDataSettings.getSettings();
    return {
      isConfigured: !!(settings.username && settings.password),
      isEnabled: settings.isEnabled,
      isConnected: truedata.isSocketConnected(),
      wsStatus: settings.wsStatus,
      wsLastError: settings.wsLastError,
      subscribedCount: settings.subscribedSymbols.length,
      maxSymbols: settings.maxSymbols,
      isPrimaryForIndian: settings.isPrimaryForIndian,
      trialExpiry: settings.trialExpiry,
      lastConnected: settings.lastConnected
    };
  }

  /**
   * Map UI segment tab names to TrueData API segment codes.
   * UI tabs: nseEq, nseFut, nseOpt, bseEq, bseFut, bseOpt, mcxFut, mcxOpt
   * TrueData segments: EQ, FO, MCX, BSEEQ, BSEFO, CDS, all
   */
  static SEGMENT_MAP = {
    'nseEq': 'EQ',
    'nseFut': 'FO',
    'nseOpt': 'FO',
    'bseEq': 'BSEEQ',
    'bseFut': 'BSEFO',
    'bseOpt': 'BSEFO',
    'mcxFut': 'MCX',
    'mcxOpt': 'MCX',
  };

  /**
   * Search TrueData symbols via REST API.
   * @param {string} query - Search term
   * @param {string} [segment] - UI segment code (nseEq, nseFut, etc.) or TrueData code (EQ, FO, MCX)
   */
  async searchSymbols(query, segment = 'all') {
    const settings = await TrueDataSettings.getSettings();
    if (!settings.username || !settings.password) {
      throw new Error('TrueData credentials not configured');
    }
    // Map UI segment to TrueData API segment
    const tdSegment = TrueDataService.SEGMENT_MAP[segment] || segment || 'all';

    const axios = require('axios');
    const url = `https://api.truedata.in/getAllSymbols?segment=${tdSegment}&user=${settings.username}&password=${settings.password}&search=${encodeURIComponent(query)}&allexpiry=false`;
    const res = await axios.get(url);
    if (!res.data || !res.data.Records) return [];

    // TrueData record fields:
    // [0]=symbolId, [1]=symbol, [2]=segType(EQ/CE/PE/XX/FUT), [3]=ISIN, [4]=exchange(NSE/BSE/MCX),
    // [5]=lotSize, [6]=tickSize, [7]=expiry, [8]=tradingSymbol, [12]=companyName, [14]=strike
    const results = res.data.Records.map(r => {
      const segType = String(r[2] || '').toUpperCase();
      let instrumentType = 'EQ';
      if (segType === 'CE' || segType === 'PE') instrumentType = segType;
      else if (segType === 'XX' || segType === 'FUT') instrumentType = 'FUT';

      const expiry = r[7] && r[7] !== '1970-01-01T00:00:00' ? r[7] : null;
      const lotSize = Number(r[5]) || 1;
      const strike = (segType === 'CE' || segType === 'PE') ? (Number(r[14]) || null) : null;

      return {
        symbolId: r[0],
        symbol: r[1],
        tradingsymbol: r[1],
        exchange: r[4] || 'NSE',
        segment: segType,
        instrumentType,
        expiry,
        strike,
        lotSize,
        name: (r[12] && r[12] !== 'None' && r[12] !== null) ? r[12] : r[1],
        source: 'truedata'
      };
    });

    // Post-filter by UI segment (TrueData FO returns both FUT and OPT together)
    let filtered = results;
    if (segment === 'nseFut') {
      filtered = results.filter(r => r.exchange === 'NSE' && (r.instrumentType === 'FUT' || r.segment === 'XX'));
    } else if (segment === 'nseOpt') {
      filtered = results.filter(r => r.exchange === 'NSE' && (r.instrumentType === 'CE' || r.instrumentType === 'PE'));
    } else if (segment === 'nseEq') {
      filtered = results.filter(r => r.exchange === 'NSE' && r.instrumentType === 'EQ');
    } else if (segment === 'bseEq') {
      filtered = results.filter(r => r.exchange === 'BSE' && r.instrumentType === 'EQ');
    } else if (segment === 'bseFut') {
      filtered = results.filter(r => r.exchange === 'BSE' && (r.instrumentType === 'FUT' || r.segment === 'XX'));
    } else if (segment === 'bseOpt') {
      filtered = results.filter(r => r.exchange === 'BSE' && (r.instrumentType === 'CE' || r.instrumentType === 'PE'));
    } else if (segment === 'mcxFut') {
      filtered = results.filter(r => r.exchange === 'MCX' && (r.instrumentType === 'FUT' || r.segment === 'XX'));
    } else if (segment === 'mcxOpt') {
      filtered = results.filter(r => r.exchange === 'MCX' && (r.instrumentType === 'CE' || r.instrumentType === 'PE'));
    }

    return filtered.slice(0, 100);
  }

  /**
   * Get historical bar data from TrueData.
   * API signature: getBarData(symbol, from, to, interval, response, symbolId)
   * formatTime expects: (year, month, date, hour, min) → "260411T09:15:00"
   * Intervals: 1min, 5min, 15min, 30min, 1hour, EOD
   */
  async getHistoricalData(symbol, interval = '1min', from = null, to = null) {
    const settings = await TrueDataSettings.getSettings();
    if (!settings.username || !settings.password) {
      throw new Error('TrueData credentials not configured');
    }

    // Auth historical API
    try {
      await truedata.historical.auth(settings.username, settings.password);
    } catch (e) {
      console.error('[TrueData] Historical auth error:', e.message);
    }

    const now = new Date();
    const fromDate = from ? new Date(from * 1000) : new Date(now.getTime() - 15 * 86400000); // 15 days back (trial limit)
    const toDate = to ? new Date(to * 1000) : now;

    // formatTime(year, month, date, hour, min) → "260411T09:15:00"
    const fmtDate = (d) => {
      return truedata.formatTime(d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes());
    };
    const fromStr = fmtDate(fromDate);
    const toStr = fmtDate(toDate);

    // Map chart intervals to TrueData intervals
    const intervalMap = {
      '1': '1min', '1min': '1min', 'minute': '1min',
      '5': '5min', '5min': '5min', '5minute': '5min',
      '15': '15min', '15min': '15min', '15minute': '15min',
      '30': '30min', '30min': '30min', '30minute': '30min',
      '60': '1hour', '1hour': '1hour', '60minute': '1hour',
      'D': 'EOD', 'day': 'EOD', '1D': 'EOD', 'EOD': 'EOD',
    };
    const tdInterval = intervalMap[interval] || '1min';

    console.log(`[TrueData] Historical: ${symbol} ${tdInterval} from=${fromStr} to=${toStr}`);

    try {
      // Correct arg order: getBarData(symbol, from, to, interval)
      const rawData = await truedata.historical.getBarData(symbol, fromStr, toStr, tdInterval);

      // TrueData returns { Records: [...] } or plain array depending on response format
      let records = [];
      if (rawData && rawData.Records && Array.isArray(rawData.Records)) {
        records = rawData.Records;
      } else if (Array.isArray(rawData)) {
        records = rawData;
      } else if (rawData && typeof rawData === 'object') {
        // Try to extract any array from the response
        const keys = Object.keys(rawData);
        for (const k of keys) {
          if (Array.isArray(rawData[k])) { records = rawData[k]; break; }
        }
      }

      if (records.length === 0) {
        console.log('[TrueData] Historical: no bars returned');
        return [];
      }

      console.log(`[TrueData] Historical: ${records.length} bars received`);

      return records.map(candle => {
        // TrueData bar format: { timestamp, open, high, low, close, Volume, oi }
        const t = candle.timestamp || candle.time || candle.Time;
        return {
          time: typeof t === 'number' ? t : Math.floor(new Date(t).getTime() / 1000),
          open: Number(candle.open) || 0,
          high: Number(candle.high) || 0,
          low: Number(candle.low) || 0,
          close: Number(candle.close) || 0,
          volume: Number(candle.Volume || candle.volume) || 0
        };
      });
    } catch (err) {
      console.error('[TrueData] Historical error:', err.message);
      return [];
    }
  }

  // --- Internal tick handlers ---

  _handleTick(tick) {
    if (!tick || !tick.Symbol) return;
    const symbol = tick.Symbol;
    const prev = this.ticksCache[symbol] || {};

    const normalized = {
      symbol,
      lastPrice: tick.LTP || 0,
      last_price: tick.LTP || 0,
      ltp: tick.LTP || 0,
      bid: (typeof tick.Bid === 'number' && tick.Bid > 0) ? tick.Bid : (prev.bid || tick.LTP || 0),
      ask: (typeof tick.Ask === 'number' && tick.Ask > 0) ? tick.Ask : (prev.ask || tick.LTP || 0),
      high: tick.High || prev.high || 0,
      low: tick.Low || prev.low || 0,
      open: tick.Open || prev.open || 0,
      close: tick.Prev_Close || prev.close || 0,
      volume: tick.Volume || prev.volume || 0,
      change: tick.Prev_Close > 0 ? (((tick.LTP - tick.Prev_Close) / tick.Prev_Close) * 100) : 0,
      oi: tick.OI || 0,
      timestamp: Date.now(),
      source: 'truedata'
    };

    this.ticksCache[symbol] = normalized;

    // Broadcast to callbacks
    for (const cb of this.tickCallbacks) {
      try { cb([normalized]); } catch (e) { /* ignore */ }
    }
  }

  _handleTouchline(touchlineData) {
    if (!touchlineData) return;
    this._touchlineData = touchlineData;
    const ticks = [];

    for (const [symbolId, data] of Object.entries(touchlineData)) {
      if (!data.Symbol) continue;
      const symbol = data.Symbol;
      const normalized = {
        symbol,
        lastPrice: data.LTP || 0,
        last_price: data.LTP || 0,
        ltp: data.LTP || 0,
        bid: data.Bid || data.LTP || 0,
        ask: data.Ask || data.LTP || 0,
        high: data.High || 0,
        low: data.Low || 0,
        open: data.Open || 0,
        close: data.Previous_Close || 0,
        volume: data.TotalVolume || 0,
        change: data.Previous_Close > 0 ? (((data.LTP - data.Previous_Close) / data.Previous_Close) * 100) : 0,
        oi: data.Today_OI || 0,
        timestamp: Date.now(),
        source: 'truedata'
      };
      this.ticksCache[symbol] = normalized;
      ticks.push(normalized);
    }

    if (ticks.length > 0) {
      for (const cb of this.tickCallbacks) {
        try { cb(ticks); } catch (e) { /* ignore */ }
      }
    }
    console.log(`[TrueData] Touchline received for ${ticks.length} symbols`);
  }

  _handleBidAsk(data) {
    if (!data || !data.Symbol) return;
    const symbol = data.Symbol;
    const cached = this.ticksCache[symbol];
    if (cached) {
      if (typeof data.Bid === 'number' && data.Bid > 0) cached.bid = data.Bid;
      if (typeof data.Ask === 'number' && data.Ask > 0) cached.ask = data.Ask;
      cached.timestamp = Date.now();
    }
  }
}

const trueDataService = new TrueDataService();
module.exports = trueDataService;
