import { useState, useEffect, useCallback, useRef } from 'react';
import socketService from '../services/socketService';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const TICKS_CACHE_KEY = 'SetupFX-truedata-ticks';

const loadCachedTicks = () => {
  try {
    const cached = localStorage.getItem(TICKS_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.timestamp && Date.now() - parsed.timestamp < 7 * 24 * 60 * 60 * 1000) {
        return parsed.ticks || {};
      }
    }
  } catch (e) { /* ignore */ }
  return {};
};

const saveCachedTicks = (ticks) => {
  try {
    localStorage.setItem(TICKS_CACHE_KEY, JSON.stringify({ ticks, timestamp: Date.now() }));
  } catch (e) { /* ignore */ }
};

export function useTrueDataTicks() {
  const [ticks, setTicks] = useState(loadCachedTicks);
  const [isConnected, setIsConnected] = useState(false);
  const [trueDataStatus, setTrueDataStatus] = useState({
    isConfigured: false,
    isConnected: false,
    subscribedCount: 0
  });
  const subscribedRef = useRef(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/truedata/status`);
      const data = await res.json();
      if (data.success) {
        setTrueDataStatus({
          isConfigured: data.isConfigured,
          isConnected: data.isConnected,
          subscribedCount: data.subscribedCount,
          wsStatus: data.wsStatus,
          isPrimaryForIndian: data.isPrimaryForIndian
        });
      }
    } catch (e) { /* ignore */ }
  }, []);

  useEffect(() => {
    // Use the app's shared socket (same as zerodha, metaapi, etc.)
    const socket = socketService.getSocket();

    const onConnect = () => {
      setIsConnected(true);
      if (!subscribedRef.current) {
        socket.emit('subscribeTrueDataTicks');
        subscribedRef.current = true;
      }
    };

    const onDisconnect = () => {
      setIsConnected(false);
      subscribedRef.current = false;
    };

    const onTick = (tickData) => {
      setTicks(prev => {
        const updated = { ...prev };
        const tickArray = Array.isArray(tickData) ? tickData : [tickData];
        tickArray.forEach(tick => {
          if (tick.symbol) {
            updated[tick.symbol] = { ...tick, timestamp: Date.now() };
          }
        });
        saveCachedTicks(updated);
        return updated;
      });
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('truedata-tick', onTick);

    // Subscribe immediately if already connected
    if (socket.connected && !subscribedRef.current) {
      socket.emit('subscribeTrueDataTicks');
      subscribedRef.current = true;
    }

    fetchStatus();
    const statusInterval = setInterval(fetchStatus, 30000);

    // Also fetch cached prices from server as fallback
    fetch(`${API_URL}/api/truedata/prices`)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.prices) {
          setTicks(prev => {
            const merged = { ...prev };
            for (const [sym, price] of Object.entries(data.prices)) {
              if (!merged[sym] || !merged[sym].lastPrice) {
                merged[sym] = price;
              }
            }
            return merged;
          });
        }
      })
      .catch(() => {});

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('truedata-tick', onTick);
      if (subscribedRef.current) {
        socket.emit('unsubscribeTrueDataTicks');
        subscribedRef.current = false;
      }
      clearInterval(statusInterval);
    };
  }, [fetchStatus]);

  const getTickBySymbol = useCallback((symbol) => {
    if (!symbol) return null;
    if (ticks[symbol]) return ticks[symbol];
    const upper = symbol.toUpperCase();
    if (ticks[upper]) return ticks[upper];
    for (const [key, tick] of Object.entries(ticks)) {
      if (key.toUpperCase() === upper) return tick;
    }
    return null;
  }, [ticks]);

  const getAllTicks = useCallback(() => Object.values(ticks), [ticks]);

  const refreshStatus = useCallback(() => { fetchStatus(); }, [fetchStatus]);

  return {
    ticks,
    isConnected,
    trueDataStatus,
    getTickBySymbol,
    getAllTicks,
    refreshStatus
  };
}
