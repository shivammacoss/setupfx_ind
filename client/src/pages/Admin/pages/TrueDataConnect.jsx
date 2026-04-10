import { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { X, Eye, EyeOff } from 'lucide-react';

function TrueDataConnect() {
  const { API_URL } = useOutletContext();

  const [settings, setSettings] = useState({
    username: '',
    password: '',
    port: 8086
  });
  const [status, setStatus] = useState({
    isConfigured: false,
    isConnected: false,
    wsStatus: 'disconnected',
    subscribedCount: 0,
    trialExpiry: null,
    error: null,
    lastConnected: null,
    isPrimary: false
  });
  const [subscribedSymbols, setSubscribedSymbols] = useState([]);
  const [newSymbol, setNewSymbol] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const searchTimerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const MAX_SYMBOLS = 50;

  useEffect(() => {
    fetchSettings();
    fetchStatus();
    fetchSubscribedSymbols();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch(`${API_URL}/api/truedata/settings`);
      const data = await res.json();
      if (data.success && data.settings) {
        setSettings({
          username: data.settings.username || '',
          password: data.settings.password || '',
          port: data.settings.port || 8086
        });
      }
    } catch (error) {
      console.error('Error fetching TrueData settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/api/truedata/status`);
      const data = await res.json();
      if (data.success) {
        setStatus({
          isConfigured: data.isConfigured,
          isConnected: data.isConnected,
          wsStatus: data.wsStatus || 'disconnected',
          subscribedCount: data.subscribedCount || 0,
          trialExpiry: data.trialExpiry || null,
          error: data.error || null,
          lastConnected: data.lastConnected || null,
          isPrimary: data.isPrimaryForIndian || data.isPrimary || false
        });
      }
    } catch (error) {
      console.error('Error fetching TrueData status:', error);
    }
  };

  const fetchSubscribedSymbols = async () => {
    try {
      const res = await fetch(`${API_URL}/api/truedata/symbols/subscribed`);
      const data = await res.json();
      if (data.success) {
        setSubscribedSymbols(data.symbols || []);
      }
    } catch (error) {
      console.error('Error fetching subscribed symbols:', error);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/truedata/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: settings.username,
          password: settings.password,
          port: settings.port
        })
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Settings saved successfully!' });
        fetchStatus();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save settings' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Error saving settings' });
    } finally {
      setSaving(false);
    }
  };

  const connectTrueData = async () => {
    setConnecting(true);
    try {
      const res = await fetch(`${API_URL}/api/truedata/connect`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Connected to TrueData!' });
        fetchStatus();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to connect' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Error connecting to TrueData' });
    } finally {
      setConnecting(false);
    }
  };

  const disconnectTrueData = async () => {
    if (!confirm('Are you sure you want to disconnect from TrueData?')) return;
    try {
      const res = await fetch(`${API_URL}/api/truedata/disconnect`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Disconnected from TrueData' });
        fetchStatus();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to disconnect' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Error disconnecting' });
    }
  };

  const togglePrimary = async () => {
    const newValue = !status.isPrimary;
    try {
      const res = await fetch(`${API_URL}/api/truedata/set-primary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPrimary: newValue })
      });
      const data = await res.json();
      if (data.success) {
        setStatus(prev => ({ ...prev, isPrimary: newValue }));
        setMessage({ type: 'success', text: newValue ? 'TrueData set as primary data source' : 'TrueData removed as primary data source' });
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to update' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Error updating primary setting' });
    }
  };

  // Debounced search
  const handleSearchInput = (value) => {
    setNewSymbol(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (value.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/api/truedata/symbols/search?query=${encodeURIComponent(value.trim())}`);
        const data = await res.json();
        if (data.success) setSearchResults(data.results || []);
      } catch (e) { /* ignore */ }
      setSearching(false);
    }, 300);
  };

  const subscribeSymbol = async (symbolObj = null) => {
    const sym = symbolObj || { symbol: newSymbol.trim().toUpperCase() };
    if (!sym.symbol) return;
    if (subscribedSymbols.some(s => (s.symbol || s).toUpperCase() === sym.symbol.toUpperCase())) {
      setMessage({ type: 'error', text: 'Symbol already subscribed' });
      return;
    }
    if (subscribedSymbols.length >= MAX_SYMBOLS) {
      setMessage({ type: 'error', text: `Maximum ${MAX_SYMBOLS} symbols allowed` });
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/truedata/symbols/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sym)
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `Subscribed to ${sym.symbol}` });
        setNewSymbol('');
        setSearchResults([]);
        fetchSubscribedSymbols();
        fetchStatus();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to subscribe' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Error subscribing to symbol' });
    }
  };

  const unsubscribeSymbol = async (symbol) => {
    try {
      const res = await fetch(`${API_URL}/api/truedata/symbols/subscribe/${encodeURIComponent(symbol)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `Unsubscribed from ${symbol}` });
        fetchSubscribedSymbols();
        fetchStatus();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to unsubscribe' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Error unsubscribing' });
    }
  };

  const wsStatusColors = {
    disconnected: '#ef4444',
    connecting: '#f59e0b',
    connected: '#10b981',
    error: '#ef4444'
  };

  const wsStatusLabel = (s) => {
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  if (loading) {
    return <div className="admin-page-container"><div style={{ padding: 40, textAlign: 'center' }}>Loading...</div></div>;
  }

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <h2>TrueData Connect</h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
          Connect TrueData for live Indian market data via WebSocket
        </p>
      </div>

      {message.text && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 8,
          marginBottom: 20,
          background: message.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
          border: `1px solid ${message.type === 'success' ? '#10b981' : '#ef4444'}`,
          color: message.type === 'success' ? '#10b981' : '#ef4444'
        }}>
          {message.text}
          <button className="admin-btn admin-btn-primary" onClick={() => setMessage({ type: '', text: '' })} style={{ float: 'right' }}><X size={14} strokeWidth={2.2} /></button>
        </div>
      )}

      {/* Section 1: Configuration */}
      <div className="admin-card" style={{ marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 16px 0' }}>Configuration</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          <div className="form-group">
            <label>Username</label>
            <input
              type="text"
              value={settings.username}
              onChange={(e) => setSettings(prev => ({ ...prev, username: e.target.value }))}
              placeholder="TrueData username"
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={settings.password}
                onChange={(e) => setSettings(prev => ({ ...prev, password: e.target.value }))}
                placeholder="TrueData password"
                className="form-input"
                style={{ width: '100%', paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)',
                  padding: 4, display: 'flex', alignItems: 'center'
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div className="form-group">
            <label>Port</label>
            <input
              type="number"
              value={settings.port}
              onChange={(e) => setSettings(prev => ({ ...prev, port: parseInt(e.target.value, 10) || 8086 }))}
              placeholder="8086"
              className="form-input"
            />
          </div>
        </div>
        <button onClick={saveSettings} className="btn-primary admin-btn admin-btn-primary" disabled={saving} style={{ marginTop: 16 }}>
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {/* Section 2: Connection */}
      <div className="admin-card" style={{ marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 16px 0' }}>Connection</h3>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{
                width: 12, height: 12, borderRadius: '50%',
                background: wsStatusColors[status.wsStatus] || '#6b7280'
              }} />
              <span style={{ fontWeight: 500 }}>
                {status.isConnected ? 'Connected' : wsStatusLabel(status.wsStatus)}
              </span>
            </div>
            {status.lastConnected && (
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: 0 }}>
                Last connected: {new Date(status.lastConnected).toLocaleString()}
              </p>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{
                width: 12, height: 12, borderRadius: '50%',
                background: wsStatusColors[status.wsStatus] || '#6b7280'
              }} />
              <span style={{ fontWeight: 500 }}>
                WebSocket: {wsStatusLabel(status.wsStatus)}
              </span>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: 0 }}>
              {status.subscribedCount} symbols subscribed
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          {!status.isConnected ? (
            <button onClick={connectTrueData} className="btn-primary" disabled={!status.isConfigured || connecting}>
              {connecting ? 'Connecting...' : 'Connect'}
            </button>
          ) : (
            <button onClick={disconnectTrueData} className="btn-danger">
              Disconnect
            </button>
          )}
        </div>

        {/* Primary data source toggle */}
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
            <div
              onClick={togglePrimary}
              style={{
                width: 44, height: 24, borderRadius: 12, position: 'relative',
                background: status.isPrimary ? '#10b981' : 'var(--bg-secondary)',
                border: `2px solid ${status.isPrimary ? '#10b981' : 'var(--border)'}`,
                transition: 'all 0.2s', cursor: 'pointer'
              }}
            >
              <div style={{
                width: 18, height: 18, borderRadius: '50%', background: '#fff',
                position: 'absolute', top: 1, left: status.isPrimary ? 22 : 1,
                transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
              }} />
            </div>
            <div>
              <span style={{ fontWeight: 500 }}>Use as primary Indian data source</span>
              <p style={{ color: 'var(--text-secondary)', fontSize: 12, margin: '2px 0 0 0' }}>
                When enabled, TrueData will be preferred over Zerodha for Indian market data
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Section 3: Symbol Management */}
      <div className="admin-card" style={{ marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 16px 0' }}>Symbol Management</h3>

        <div style={{ position: 'relative', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <input
              type="text"
              value={newSymbol}
              onChange={(e) => handleSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && subscribeSymbol()}
              placeholder="Search symbol (e.g. NIFTY, RELIANCE, SBIN)"
              className="form-input"
              style={{ flex: 1, minWidth: 200 }}
            />
            <button onClick={() => subscribeSymbol()} className="btn-primary" disabled={!newSymbol.trim()}>
              Add
            </button>
          </div>
          {searching && <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>Searching...</div>}
          {searchResults.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
              background: 'var(--bg-primary, #1a1a2e)', border: '1px solid var(--border)',
              borderRadius: 8, maxHeight: 300, overflowY: 'auto', marginTop: 4,
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
            }}>
              {searchResults.map((r, i) => (
                <div key={`${r.symbol}-${i}`}
                  onClick={() => subscribeSymbol(r)}
                  style={{
                    padding: '10px 14px', cursor: 'pointer', display: 'flex',
                    justifyContent: 'space-between', alignItems: 'center',
                    borderBottom: '1px solid var(--border)',
                    transition: 'background 0.15s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-secondary, #252540)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{r.symbol}</span>
                    {r.exchange && <span style={{ color: 'var(--text-secondary)', fontSize: 11, marginLeft: 8 }}>{r.exchange}</span>}
                    {r.instrumentType && <span style={{ color: '#8b5cf6', fontSize: 11, marginLeft: 6 }}>{r.instrumentType}</span>}
                  </div>
                  {r.expiry && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{new Date(r.expiry).toLocaleDateString()}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
          {subscribedSymbols.length} / {MAX_SYMBOLS} symbols
        </p>

        {subscribedSymbols.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 20 }}>
            No symbols subscribed yet. Add symbols above to start receiving live data.
          </p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {subscribedSymbols.map((sym, idx) => {
              const symbolName = typeof sym === 'string' ? sym : sym.symbol;
              return (
                <div key={symbolName || idx} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '8px 12px', background: 'var(--bg-secondary)',
                  borderRadius: 8, border: '1px solid var(--border)',
                  fontSize: 13, fontWeight: 500
                }}>
                  <span>{symbolName}</span>
                  <button
                    onClick={() => unsubscribeSymbol(symbolName)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text-secondary)', padding: 0, display: 'flex',
                      alignItems: 'center'
                    }}
                    title="Remove"
                  >
                    <X size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section 4: Status Info */}
      <div className="admin-card">
        <h3 style={{ margin: '0 0 16px 0' }}>Status Info</h3>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: 8, minWidth: 160 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Trial Expiry</div>
            <div style={{ fontWeight: 600, marginTop: 4 }}>
              {status.trialExpiry ? new Date(status.trialExpiry).toLocaleDateString() : 'N/A'}
            </div>
          </div>
          <div style={{ padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: 8, minWidth: 160 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>WebSocket</div>
            <div style={{
              fontWeight: 600, marginTop: 4,
              color: wsStatusColors[status.wsStatus] || '#6b7280'
            }}>
              {wsStatusLabel(status.wsStatus)}
            </div>
          </div>
          <div style={{ padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: 8, minWidth: 160 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Subscribed</div>
            <div style={{ fontWeight: 600, marginTop: 4 }}>
              {status.subscribedCount} symbols
            </div>
          </div>
          <div style={{ padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: 8, minWidth: 160 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Configured</div>
            <div style={{ fontWeight: 600, marginTop: 4, color: status.isConfigured ? '#10b981' : '#6b7280' }}>
              {status.isConfigured ? 'Yes' : 'No'}
            </div>
          </div>
        </div>

        {status.error && (
          <div style={{
            marginTop: 16, padding: '12px 16px', borderRadius: 8,
            background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444',
            color: '#ef4444', fontSize: 13
          }}>
            Error: {status.error}
          </div>
        )}
      </div>

      <style>{`
        .admin-card {
          background: var(--bg-secondary);
          border-radius: 12px;
          padding: 20px;
          border: 1px solid var(--border);
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .form-group label {
          font-weight: 500;
          font-size: 13px;
          color: var(--text-secondary);
        }
        .form-input {
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--bg-primary);
          color: var(--text-primary);
          font-size: 14px;
        }
        .btn-primary {
          padding: 10px 20px;
          border-radius: 8px;
          border: none;
          background: var(--primary);
          color: white;
          font-weight: 500;
          cursor: pointer;
        }
        .btn-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .btn-danger {
          padding: 10px 20px;
          border-radius: 8px;
          border: none;
          background: #ef4444;
          color: white;
          font-weight: 500;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}

export default TrueDataConnect;
