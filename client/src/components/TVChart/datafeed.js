const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const configurationData = {
    supported_resolutions: ['1', '5', '15', '60', '1D'],
    exchanges: [{ value: 'MARKET', name: 'MARKET', desc: 'Market' }],
    symbols_types: [{ name: 'All', value: 'all' }],
};

const subscriptions = new Map();

// Which price to show on chart: 'ask' (for Buy view) or 'bid' (for Sell view)
let currentPriceSide = 'bid'; // default: show bid price (like MT4/MT5)

// Helper to convert TV resolution to API strings
const TV_TO_API_INTERVALS = {
    '1': { zerodha: 'minute', meta: '1m', delta: '1m', truedata: '1min', seconds: 60 },
    '5': { zerodha: '5minute', meta: '5m', delta: '5m', truedata: '5min', seconds: 300 },
    '15': { zerodha: '15minute', meta: '15m', delta: '15m', truedata: '15min', seconds: 900 },
    '60': { zerodha: '60minute', meta: '1h', delta: '1h', truedata: '1hour', seconds: 3600 },
    '1D': { zerodha: 'day', meta: '1d', delta: '1d', truedata: 'EOD', seconds: 86400 },
};

const DELTA_LOOKBACK_SEC = {
    '1': 172800,
    '5': 604800,
    '15': 1209600,
    '60': 2592000,
    '1D': 31536000
};

/** Bar open time for TradingView: unix ms. APIs may send seconds or ms. */
function candleOpenTimeToMs(t) {
    const n = Number(t);
    if (!Number.isFinite(n)) return null;
    return n > 1e12 ? Math.floor(n) : Math.floor(n * 1000);
}

// Determine appropriate pricescale for a symbol
function getPricescale(symbolName) {
    const s = (symbolName || '').toUpperCase();
    if (s.includes('JPY')) return 1000;      // 3 decimals
    if (s.includes('XAU') || s.includes('GOLD')) return 100; // 2 decimals
    if (s.includes('XAG') || s.includes('SILVER')) return 1000; // 3 decimals
    if (s.includes('BTC')) return 100;       // 2 decimals
    if (s.includes('ETH')) return 100;       // 2 decimals
    if (s.includes('US30') || s.includes('US100') || s.includes('US500')) return 100;
    // Forex pairs
    if (s.length >= 6 && s.length <= 10) return 100000; // 5 decimals
    return 100;
}

export default {
    onReady: (callback) => {
        setTimeout(() => callback(configurationData));
    },

    searchSymbols: async (userInput, exchange, symbolType, onResultReadyCallback) => {
        onResultReadyCallback([]);
    },

    resolveSymbol: async (symbolName, onSymbolResolvedCallback, onResolveErrorCallback, extension) => {
        let displayName = symbolName;
        if (symbolName.includes('|')) {
            displayName = symbolName.split('|')[1];
        }
        
        const symbolInfo = {
            name: symbolName,
            full_name: symbolName,
            description: displayName,
            type: 'crypto',
            session: '24x7',
            timezone: 'Asia/Kolkata',
            exchange: 'MARKET',
            minmov: 1,
            pricescale: getPricescale(displayName),
            has_intraday: true,
            visible_plots_set: 'ohlcv',
            has_weekly_and_monthly: false,
            supported_resolutions: configurationData.supported_resolutions,
            volume_precision: 2,
            data_status: 'streaming',
        };
        setTimeout(() => onSymbolResolvedCallback(symbolInfo));
    },

    getBars: async (symbolInfo, resolution, periodParams, onHistoryCallback, onErrorCallback) => {
        const { from, to, firstDataRequest } = periodParams;
        const symbol = symbolInfo.name;
        
        let baseSymbol = symbol;
        let dataSource = 'zerodha';
        
        if (symbol.includes('|')) {
            const parts = symbol.split('|');
            dataSource = parts[0];
            baseSymbol = parts[1];
        }

        try {
            const mapping = TV_TO_API_INTERVALS[resolution] || TV_TO_API_INTERVALS['60'];
            let url;

            if (dataSource === 'zerodha') {
                url = `${API_URL}/api/zerodha/historical/${encodeURIComponent(baseSymbol)}?interval=${mapping.zerodha}&from=${from}&to=${to}`;
            } else if (dataSource === 'truedata') {
                url = `${API_URL}/api/truedata/historical/${encodeURIComponent(baseSymbol)}?interval=${mapping.truedata || '1min'}&from=${from}&to=${to}`;
            } else if (dataSource === 'metaapi') {
                url = `${API_URL}/api/metaapi/historical/${encodeURIComponent(baseSymbol)}?timeframe=${mapping.meta}&limit=500&startTime=${from}`;
            } else if (dataSource === 'delta') {
                const lb = DELTA_LOOKBACK_SEC[resolution] || 604800;
                url = `${API_URL}/api/delta/history/${encodeURIComponent(baseSymbol)}?resolution=${mapping.delta}&lookbackSec=${lb}`;
            }

            // Client-side timeout: 15 seconds
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            let res;
            try {
                res = await fetch(url, { signal: controller.signal });
            } catch (fetchErr) {
                clearTimeout(timeoutId);
                if (fetchErr.name === 'AbortError') {
                    console.warn(`getBars timeout for ${baseSymbol} (${dataSource})`);
                    onHistoryCallback([], { noData: true });
                    return;
                }
                throw fetchErr;
            }
            clearTimeout(timeoutId);

            const data = await res.json();

            const rawCandles = Array.isArray(data?.candles) ? data.candles : [];
            if (data && data.success && rawCandles.length > 0) {
                // Snap every bar to its resolution boundary so historical and live bars
                // share one alignment scheme. MetaAPI sometimes returns the still-forming
                // last candle stamped with the first tick's time (e.g. 06:00:46 on a 5m
                // bar), which then collides with the live-tick bucket (06:00:00) and
                // causes TradingView "time order violation" loops.
                const bucketMs = (mapping.seconds || 60) * 1000;
                const bucketed = new Map(); // bucketTime → bar (last write wins)
                for (const c of rawCandles) {
                    const timeMs = candleOpenTimeToMs(c.time);
                    if (timeMs == null) continue;
                    const aligned = Math.floor(timeMs / bucketMs) * bucketMs;
                    const existing = bucketed.get(aligned);
                    if (existing) {
                        // Merge into the same bucket (keep open from earlier, extend hi/lo, take latest close)
                        existing.high = Math.max(existing.high, c.high);
                        existing.low = Math.min(existing.low, c.low);
                        existing.close = c.close;
                        existing.volume = (existing.volume || 0) + (c.volume || 0);
                    } else {
                        bucketed.set(aligned, {
                            time: aligned,
                            open: c.open,
                            high: c.high,
                            low: c.low,
                            close: c.close,
                            volume: c.volume || 0
                        });
                    }
                }
                let bars = Array.from(bucketed.values()).sort((a, b) => a.time - b.time);

                // Filter by from/to (TV passes Unix seconds). If the requested window does not
                // overlap our API lookback (common after cache reset / short history), still return
                // bars so candles are visible instead of an empty chart.
                const fromMs = from * 1000;
                const toMs = to * 1000;
                const filtered = bars.filter(b => b.time >= fromMs && b.time <= toMs);
                const out = filtered.length > 0 ? filtered : bars;

                if (out.length > 0) {
                    // Seed every active subscription for this symbol with the last historical
                    // bar's time so the live-tick path can never emit an earlier bar.
                    const lastBarTime = out[out.length - 1].time;
                    for (const sub of subscriptions.values()) {
                        if (sub.symbol === symbol && sub.resolution === resolution) {
                            if (sub.lastBarTime == null || lastBarTime > sub.lastBarTime) {
                                sub.lastBarTime = lastBarTime;
                                sub.lastBarOpen = out[out.length - 1].open;
                                sub.lastBarHigh = out[out.length - 1].high;
                                sub.lastBarLow = out[out.length - 1].low;
                            }
                        }
                    }
                    onHistoryCallback(out, { noData: false });
                } else {
                    onHistoryCallback([], { noData: true });
                }
            } else {
                console.warn(`getBars: no data for ${baseSymbol} (${dataSource}):`, data?.error);
                onHistoryCallback([], { noData: true });
            }
        } catch (error) {
            console.error('getBars error:', error);
            onHistoryCallback([], { noData: true });
        }
    },

    subscribeBars: (symbolInfo, resolution, onRealtimeCallback, subscribeUID, onResetCacheNeededCallback) => {
        subscriptions.set(subscribeUID, {
            symbol: symbolInfo.name,
            resolution,
            lastBarTime: null,
            callback: onRealtimeCallback
        });
    },

    unsubscribeBars: (subscribeUID) => {
        subscriptions.delete(subscribeUID);
    },

    // Set which price side the chart shows: 'bid' (for Sell view) or 'ask' (for Buy view)
    setPriceSide: (side) => {
        currentPriceSide = side === 'ask' ? 'ask' : 'bid';
    },

    // CUSTOM: Allow external components to feed live ticks
    updateLivePrice: (symbolName, livePriceObj) => {
        let targetSymbol = symbolName;
        
        const subs = Array.from(subscriptions.values()).filter(sub => 
            sub.symbol === targetSymbol || sub.symbol.endsWith(`|${targetSymbol}`)
        );

        if (subs.length === 0) return;

        const b = livePriceObj.bid || 0;
        const a = livePriceObj.ask || 0;
        
        // Use the price matching the selected order side
        let chartPrice;
        if (currentPriceSide === 'ask') {
            chartPrice = a > 0 ? a : (livePriceObj.last_price || b || 0);
        } else {
            chartPrice = b > 0 ? b : (livePriceObj.last_price || a || 0);
        }

        if (!chartPrice) return;

        const now = Date.now();

        subs.forEach(sub => {
            const resData = TV_TO_API_INTERVALS[sub.resolution] || TV_TO_API_INTERVALS['60'];
            const resMillis = resData.seconds * 1000;
            let bucketTime = Math.floor(now / resMillis) * resMillis;

            // Never go backwards — if the computed bucket is earlier than the last bar
            // TradingView already received (e.g. historical seeded a forming bar), fold
            // this tick into that last bar instead of emitting a "time order violation".
            if (sub.lastBarTime != null && bucketTime < sub.lastBarTime) {
                bucketTime = sub.lastBarTime;
            }

            if (sub.lastBarTime === bucketTime) {
                // Update existing bar
                sub.callback({
                    time: bucketTime,
                    open: sub.lastBarOpen || chartPrice,
                    high: Math.max(sub.lastBarHigh || chartPrice, chartPrice),
                    low: Math.min(sub.lastBarLow || chartPrice, chartPrice),
                    close: chartPrice,
                    volume: 0
                });
                sub.lastBarHigh = Math.max(sub.lastBarHigh || chartPrice, chartPrice);
                sub.lastBarLow = Math.min(sub.lastBarLow || chartPrice, chartPrice);
            } else {
                // New bar
                sub.lastBarTime = bucketTime;
                sub.lastBarOpen = chartPrice;
                sub.lastBarHigh = chartPrice;
                sub.lastBarLow = chartPrice;
                sub.callback({
                    time: bucketTime,
                    open: chartPrice,
                    high: chartPrice,
                    low: chartPrice,
                    close: chartPrice,
                    volume: 0
                });
            }
        });
    }
};
