import { useState, useEffect } from 'react';
import { useOutletContext, useLocation } from 'react-router-dom';
import AdminMyAccount from './AdminMyAccount';
import { Settings } from 'lucide-react';

function Settings() {
  const { API_URL } = useOutletContext();
  const location = useLocation();
  const [settings, setSettings] = useState({
    siteName: 'SetupFX',
    siteUrl: '',
    supportEmail: '',
    maintenanceMode: false,
    registrationEnabled: true,
    demoAccountEnabled: true,
    minDeposit: 100,
    maxWithdrawal: 100000
  });
  const [loading, setLoading] = useState(false);

  const getActiveTab = () => {
    const path = location.pathname;
    if (path.includes('/account')) return 'admin-account';
    if (path.includes('/security')) return 'security-settings';
    if (path.includes('/api')) return 'api-settings';
    if (path.includes('/backup')) return 'backup-settings';
    return 'general-settings';
  };

  const activeTab = getActiveTab();

  const getTabTitle = () => {
    const titles = {
      'general-settings': 'General Settings',
      'admin-account': 'My account',
      'security-settings': 'Security Settings',
      'api-settings': 'API Keys',
      'backup-settings': 'Backup Settings'
    };
    return titles[activeTab] || 'Settings';
  };

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/settings`);
      const data = await res.json();
      if (data.success && data.settings) {
        setSettings(prev => ({ ...prev, ...data.settings }));
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      const data = await res.json();
      if (data.success) {
        alert('Settings saved successfully');
      } else {
        alert(data.error || 'Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  };

  useEffect(() => {
    if (activeTab === 'general-settings') {
      fetchSettings();
    }
  }, [activeTab]);

  if (activeTab === 'admin-account') {
    return <AdminMyAccount API_URL={API_URL} />;
  }

  if (activeTab === 'general-settings') {
    return (
      <div className="admin-page-container">
        <div className="admin-page-header">
          <h2>{getTabTitle()}</h2>
          <button onClick={saveSettings} className="admin-btn primary">Save Settings</button>
        </div>

        {loading ? (
          <div className="admin-loading">Loading settings...</div>
        ) : (
          <div className="admin-settings-grid">
            <div className="admin-form-card">
              <h3>Site Information</h3>
              <div className="admin-form-group">
                <label>Site Name</label>
                <input type="text" value={settings.siteName} onChange={(e) => setSettings(prev => ({ ...prev, siteName: e.target.value }))} className="admin-input" />
              </div>
              <div className="admin-form-group">
                <label>Site URL</label>
                <input type="text" value={settings.siteUrl} onChange={(e) => setSettings(prev => ({ ...prev, siteUrl: e.target.value }))} placeholder="https://example.com" className="admin-input" />
              </div>
              <div className="admin-form-group">
                <label>Support Email</label>
                <input type="email" value={settings.supportEmail} onChange={(e) => setSettings(prev => ({ ...prev, supportEmail: e.target.value }))} placeholder="support@example.com" className="admin-input" />
              </div>
            </div>

            <div className="admin-form-card">
              <h3>Feature Toggles</h3>
              <div className="admin-toggle-group">
                <label className="admin-toggle">
                  <input type="checkbox" checked={settings.maintenanceMode} onChange={(e) => setSettings(prev => ({ ...prev, maintenanceMode: e.target.checked }))} />
                  <span>Maintenance Mode</span>
                </label>
              </div>
              <div className="admin-toggle-group">
                <label className="admin-toggle">
                  <input type="checkbox" checked={settings.registrationEnabled} onChange={(e) => setSettings(prev => ({ ...prev, registrationEnabled: e.target.checked }))} />
                  <span>User Registration Enabled</span>
                </label>
              </div>
              <div className="admin-toggle-group">
                <label className="admin-toggle">
                  <input type="checkbox" checked={settings.demoAccountEnabled} onChange={(e) => setSettings(prev => ({ ...prev, demoAccountEnabled: e.target.checked }))} />
                  <span>Demo Account Enabled</span>
                </label>
              </div>
            </div>

            <div className="admin-form-card">
              <h3>Transaction Limits</h3>
              <div className="admin-form-group">
                <label>Minimum Deposit (₹)</label>
                <input type="number" value={settings.minDeposit} onChange={(e) => setSettings(prev => ({ ...prev, minDeposit: parseInt(e.target.value) }))} className="admin-input" />
              </div>
              <div className="admin-form-group">
                <label>Maximum Withdrawal (₹)</label>
                <input type="number" value={settings.maxWithdrawal} onChange={(e) => setSettings(prev => ({ ...prev, maxWithdrawal: parseInt(e.target.value) }))} className="admin-input" />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <h2>{getTabTitle()}</h2>
      </div>
      <div className="admin-placeholder">
        <div className="placeholder-icon"><Settings size={14} strokeWidth={2.2} /></div>
        <p>This section is under development.</p>
      </div>
    </div>
  );
}

export default Settings;
