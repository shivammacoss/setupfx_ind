import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';

function DemoSettings() {
  const { API_URL } = useOutletContext();
  const [settings, setSettings] = useState({
    demoWalletAmount: 10000,
    demoValidityDays: 7,
    demoRegistrationEnabled: true,
    maxDemoAccountsPerIp: 3,
    showDemoBadge: true,
    showTradingHistory: false
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [demoStats, setDemoStats] = useState({ total: 0, active: 0, expired: 0 });

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/settings/demo`);
      const data = await res.json();
      if (data.success && data.settings) {
        setSettings(data.settings);
      }
    } catch (error) {
      console.error('Error fetching demo settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDemoStats = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/users?status=demo&limit=1000`);
      const data = await res.json();
      if (data.success) {
        const demoUsers = data.users?.filter(u => u.isDemo) || [];
        const now = new Date();
        const active = demoUsers.filter(u => !u.demoExpiresAt || new Date(u.demoExpiresAt) > now).length;
        const expired = demoUsers.filter(u => u.demoExpiresAt && new Date(u.demoExpiresAt) <= now).length;
        setDemoStats({ total: demoUsers.length, active, expired });
      }
    } catch (error) {
      console.error('Error fetching demo stats:', error);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/settings/demo`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      const data = await res.json();
      if (data.success) {
        alert('Demo settings saved successfully');
      } else {
        alert(data.error || 'Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving demo settings:', error);
      alert('Error saving settings');
    } finally {
      setSaving(false);
    }
  };

  const cleanupExpiredAccounts = async () => {
    if (!confirm('Delete all expired demo accounts? This action cannot be undone.')) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/demo-accounts/cleanup`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        fetchDemoStats();
      } else {
        alert(data.error || 'Cleanup failed');
      }
    } catch (error) {
      alert('Error during cleanup');
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchDemoStats();
  }, []);

  const inputStyle = {
    width: '100%',
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    fontSize: '14px'
  };

  const labelStyle = {
    display: 'block',
    marginBottom: '8px',
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--text-secondary)'
  };

  const cardStyle = {
    background: 'var(--bg-secondary)',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '20px',
    border: '1px solid var(--border)'
  };

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <h2>🎮 Demo Account Settings</h2>
        <p style={{ color: 'var(--text-secondary)', margin: '8px 0 0', fontSize: '14px' }}>
          Configure demo account registration and behavior
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
          Loading settings...
        </div>
      ) : (
        <>
          {/* Stats Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div style={{ ...cardStyle, background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(99, 102, 241, 0.05))' }}>
              <div style={{ fontSize: '28px', fontWeight: 700, color: '#6366f1' }}>{demoStats.total}</div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Total Demo Accounts</div>
            </div>
            <div style={{ ...cardStyle, background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(16, 185, 129, 0.05))' }}>
              <div style={{ fontSize: '28px', fontWeight: 700, color: '#10b981' }}>{demoStats.active}</div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Active Demo Accounts</div>
            </div>
            <div style={{ ...cardStyle, background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(239, 68, 68, 0.05))' }}>
              <div style={{ fontSize: '28px', fontWeight: 700, color: '#ef4444' }}>{demoStats.expired}</div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Expired (Pending Cleanup)</div>
              {demoStats.expired > 0 && (
                <button 
                  onClick={cleanupExpiredAccounts}
                  style={{ marginTop: '12px', padding: '6px 12px', fontSize: '11px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  🗑️ Cleanup Now
                </button>
              )}
            </div>
          </div>

          {/* Settings Form */}
          <div style={cardStyle}>
            <h3 style={{ margin: '0 0 20px', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
              📝 Registration Settings
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
              <div>
                <label style={labelStyle}>Demo Registration</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <label style={{ position: 'relative', display: 'inline-block', width: 50, height: 26 }}>
                    <input
                      type="checkbox"
                      checked={settings.demoRegistrationEnabled}
                      onChange={(e) => setSettings(prev => ({ ...prev, demoRegistrationEnabled: e.target.checked }))}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span style={{
                      position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                      background: settings.demoRegistrationEnabled ? '#10b981' : '#374151',
                      borderRadius: 26, transition: '0.3s'
                    }}>
                      <span style={{
                        position: 'absolute', height: 20, width: 20, left: settings.demoRegistrationEnabled ? 27 : 3, bottom: 3,
                        background: 'white', borderRadius: '50%', transition: '0.3s'
                      }}></span>
                    </span>
                  </label>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {settings.demoRegistrationEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Demo Wallet Amount ($)</label>
                <input
                  type="number"
                  value={settings.demoWalletAmount}
                  onChange={(e) => setSettings(prev => ({ ...prev, demoWalletAmount: parseInt(e.target.value) || 0 }))}
                  style={inputStyle}
                  min="100"
                  max="1000000"
                />
              </div>

              <div>
                <label style={labelStyle}>Demo Validity (Days)</label>
                <input
                  type="number"
                  value={settings.demoValidityDays}
                  onChange={(e) => setSettings(prev => ({ ...prev, demoValidityDays: parseInt(e.target.value) || 1 }))}
                  style={inputStyle}
                  min="1"
                  max="365"
                />
              </div>

              <div>
                <label style={labelStyle}>Max Demo Accounts Per IP</label>
                <input
                  type="number"
                  value={settings.maxDemoAccountsPerIp}
                  onChange={(e) => setSettings(prev => ({ ...prev, maxDemoAccountsPerIp: parseInt(e.target.value) || 1 }))}
                  style={inputStyle}
                  min="1"
                  max="10"
                />
              </div>
            </div>
          </div>

          <div style={cardStyle}>
            <h3 style={{ margin: '0 0 20px', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
              🎨 Display Settings
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
              <div>
                <label style={labelStyle}>Show Demo Badge</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <label style={{ position: 'relative', display: 'inline-block', width: 50, height: 26 }}>
                    <input
                      type="checkbox"
                      checked={settings.showDemoBadge}
                      onChange={(e) => setSettings(prev => ({ ...prev, showDemoBadge: e.target.checked }))}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span style={{
                      position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                      background: settings.showDemoBadge ? '#10b981' : '#374151',
                      borderRadius: 26, transition: '0.3s'
                    }}>
                      <span style={{
                        position: 'absolute', height: 20, width: 20, left: settings.showDemoBadge ? 27 : 3, bottom: 3,
                        background: 'white', borderRadius: '50%', transition: '0.3s'
                      }}></span>
                    </span>
                  </label>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    Show "DEMO" badge in user header
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Info Box */}
          <div style={{ 
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(217, 119, 6, 0.05))',
            border: '1px solid rgba(245, 158, 11, 0.2)',
            borderRadius: '12px',
            padding: '16px 20px',
            marginBottom: '24px'
          }}>
            <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: '#f59e0b' }}>ℹ️ Demo Account Behavior</h4>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              <li>Demo accounts cannot access deposit or withdrawal features</li>
              <li>Trading history is not saved for demo accounts</li>
              <li>Demo accounts are automatically deleted after expiry</li>
              <li>Users can convert demo accounts to real accounts (wallet resets to zero)</li>
            </ul>
          </div>

          {/* Save Button */}
          <button
            onClick={saveSettings}
            disabled={saving}
            style={{
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff',
              border: 'none',
              padding: '14px 32px',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1
            }}
          >
            {saving ? 'Saving...' : '💾 Save Settings'}
          </button>
        </>
      )}
    </div>
  );
}

export default DemoSettings;
