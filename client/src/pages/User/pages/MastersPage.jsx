import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import './MastersPage.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const MastersPage = () => {
  const { user } = useOutletContext();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('discover');
  
  // Data states
  const [masters, setMasters] = useState([]);
  const [myMasterProfile, setMyMasterProfile] = useState(null);
  const [mySubscriptions, setMySubscriptions] = useState([]);
  const [myFollowers, setMyFollowers] = useState([]);
  
  // Modal states
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);
  const [selectedMaster, setSelectedMaster] = useState(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    const token = localStorage.getItem('SetupFX-token');
    
    try {
      // Check if user is a master
      const masterRes = await fetch(`${API_URL}/api/copy-trade/my-master-profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const masterData = await masterRes.json();
      if (masterData.success && masterData.data) {
        setMyMasterProfile(masterData.data);
      }

      // Fetch available masters
      const mastersRes = await fetch(`${API_URL}/api/copy-trade/masters`);
      const mastersData = await mastersRes.json();
      if (mastersData.success) {
        setMasters(mastersData.data.masters || []);
      }

      // Fetch my subscriptions
      const subsRes = await fetch(`${API_URL}/api/copy-trade/my-subscriptions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const subsData = await subsRes.json();
      if (subsData.success) {
        setMySubscriptions(subsData.data || []);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMyFollowers = async () => {
    const token = localStorage.getItem('SetupFX-token');
    try {
      const res = await fetch(`${API_URL}/api/copy-trade/my-followers`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setMyFollowers(data.data.followers || []);
      }
    } catch (err) {
      console.error('Error fetching followers:', err);
    }
  };

  const handleApplyMaster = async (formData) => {
    const token = localStorage.getItem('SetupFX-token');
    setError(null);
    
    try {
      const res = await fetch(`${API_URL}/api/copy-trade/apply-master`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });
      
      const data = await res.json();
      if (data.success) {
        setMyMasterProfile(data.data);
        setShowApplyModal(false);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSubscribe = async (masterId, settings) => {
    const token = localStorage.getItem('SetupFX-token');
    setError(null);
    
    try {
      const res = await fetch(`${API_URL}/api/copy-trade/subscribe/${masterId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(settings)
      });
      
      const data = await res.json();
      if (data.success) {
        setMySubscriptions([...mySubscriptions, data.data]);
        setShowSubscribeModal(false);
        setSelectedMaster(null);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUnsubscribe = async (masterId) => {
    if (!confirm('Are you sure you want to stop copying this master?')) return;
    
    const token = localStorage.getItem('SetupFX-token');
    try {
      const res = await fetch(`${API_URL}/api/copy-trade/unsubscribe/${masterId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      
      const data = await res.json();
      if (data.success) {
        setMySubscriptions(mySubscriptions.filter(s => s.masterId._id !== masterId));
      }
    } catch (err) {
      console.error('Error unsubscribing:', err);
    }
  };

  if (loading) {
    return (
      <div className="masters-page">
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // Demo account restriction
  if (user?.isDemo) {
    const handleConvertToReal = async () => {
      if (!confirm('Convert to real account? Your wallet will be reset to zero.')) return;
      try {
        const token = localStorage.getItem('SetupFX-token');
        const res = await fetch(`${API_URL}/api/auth/convert-to-real`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await res.json();
        if (data.success) {
          alert('Account converted successfully! Please login again.');
          localStorage.removeItem('SetupFX-token');
          localStorage.removeItem('SetupFX-user');
          window.location.href = '/login';
        } else {
          alert(data.error || 'Failed to convert account');
        }
      } catch (err) {
        alert('Error converting account');
      }
    };

    return (
      <div className="masters-page">
        <div className="page-header">
          <h1>📋 Copy Trading</h1>
          <p>Follow top traders and copy their trades automatically</p>
        </div>

        <div style={{
          background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(217, 119, 6, 0.1))',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          borderRadius: '16px',
          padding: '40px',
          textAlign: 'center',
          maxWidth: '600px',
          margin: '40px auto'
        }}>
          <div style={{ fontSize: '60px', marginBottom: '20px' }}>🎮</div>
          <h2 style={{ color: '#f59e0b', margin: '0 0 12px', fontSize: '24px' }}>Demo Account</h2>
          <p style={{ color: 'var(--text-secondary)', margin: '0 0 24px', fontSize: '15px', lineHeight: 1.6 }}>
            Copy Trading is not available for demo accounts.<br/>
            Convert to a real account to follow masters and copy their trades.
          </p>
          <button 
            onClick={handleConvertToReal}
            style={{
              background: 'linear-gradient(135deg, #10b981, #059669)',
              color: '#fff',
              border: 'none',
              padding: '14px 32px',
              borderRadius: '10px',
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            🚀 Switch to Real Account
          </button>
        </div>

        <div style={{ opacity: 0.5, pointerEvents: 'none' }}>
          <div className="masters-grid" style={{ padding: '20px' }}>
            <div className="master-card" style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>👑</div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px' }}>Top Trader</h3>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>Win Rate: 85%</p>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                <div><span style={{ color: 'var(--text-secondary)' }}>Profit:</span> <span style={{ color: '#10b981' }}>+$12,450</span></div>
                <div><span style={{ color: 'var(--text-secondary)' }}>Followers:</span> 156</div>
              </div>
            </div>
            <div className="master-card" style={{ background: 'var(--bg-secondary)', borderRadius: '12px', padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: 'linear-gradient(135deg, #10b981, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>📈</div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px' }}>Pro Scalper</h3>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>Win Rate: 78%</p>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                <div><span style={{ color: 'var(--text-secondary)' }}>Profit:</span> <span style={{ color: '#10b981' }}>+$8,320</span></div>
                <div><span style={{ color: 'var(--text-secondary)' }}>Followers:</span> 89</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="masters-page">
      <div className="page-header">
        <h1>📋 Copy Trading</h1>
        <p>Follow top traders and copy their trades automatically</p>
      </div>

      <div className="tabs">
        <button 
          className={activeTab === 'discover' ? 'active' : ''} 
          onClick={() => setActiveTab('discover')}
        >
          Discover Masters
        </button>
        <button 
          className={activeTab === 'following' ? 'active' : ''} 
          onClick={() => setActiveTab('following')}
        >
          My Subscriptions ({mySubscriptions.length})
        </button>
        <button 
          className={activeTab === 'master' ? 'active' : ''} 
          onClick={() => {
            setActiveTab('master');
            if (myMasterProfile?.status === 'active') {
              fetchMyFollowers();
            }
          }}
        >
          Become a Master
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {activeTab === 'discover' && (
        <div className="discover-tab">
          <div className="masters-grid">
            {masters.length === 0 ? (
              <div className="empty-state">
                <span className="icon">👑</span>
                <p>No masters available yet</p>
              </div>
            ) : (
              masters.map(master => (
                <MasterCard 
                  key={master._id} 
                  master={master}
                  isSubscribed={mySubscriptions.some(s => s.masterId?._id === master._id)}
                  onSubscribe={() => {
                    setSelectedMaster(master);
                    setShowSubscribeModal(true);
                  }}
                  onUnsubscribe={() => handleUnsubscribe(master._id)}
                />
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'following' && (
        <div className="following-tab">
          {mySubscriptions.length === 0 ? (
            <div className="empty-state">
              <span className="icon">📊</span>
              <p>You're not following any masters yet</p>
              <button className="btn-primary" onClick={() => setActiveTab('discover')}>
                Discover Masters
              </button>
            </div>
          ) : (
            <div className="subscriptions-list">
              {mySubscriptions.map(sub => (
                <SubscriptionCard 
                  key={sub._id} 
                  subscription={sub}
                  onUnsubscribe={() => handleUnsubscribe(sub.masterId?._id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'master' && (
        <div className="master-tab">
          {!myMasterProfile ? (
            <div className="become-master-section">
              <div className="master-benefits">
                <h2>Become a Copy Trading Master</h2>
                <p>Share your trading expertise and earn from followers</p>
                
                <div className="benefits-grid">
                  <div className="benefit-card">
                    <span className="icon">💰</span>
                    <h3>Earn Performance Fees</h3>
                    <p>Get paid when your followers profit</p>
                  </div>
                  <div className="benefit-card">
                    <span className="icon">👥</span>
                    <h3>Build Your Following</h3>
                    <p>Attract traders who want to copy your success</p>
                  </div>
                  <div className="benefit-card">
                    <span className="icon">📈</span>
                    <h3>Track Performance</h3>
                    <p>Monitor your stats and improve your strategy</p>
                  </div>
                </div>
                
                <button className="btn-apply" onClick={() => setShowApplyModal(true)}>
                  Apply to Become a Master
                </button>
              </div>
            </div>
          ) : myMasterProfile.status === 'pending' ? (
            <div className="status-card pending">
              <span className="icon">⏳</span>
              <h2>Application Pending</h2>
              <p>Your master application is being reviewed.</p>
            </div>
          ) : myMasterProfile.status === 'rejected' ? (
            <div className="status-card rejected">
              <span className="icon">❌</span>
              <h2>Application Rejected</h2>
              <p>{myMasterProfile.rejectedReason || 'Your application was not approved.'}</p>
              <button className="btn-reapply" onClick={() => setShowApplyModal(true)}>
                Apply Again
              </button>
            </div>
          ) : (
            <MasterDashboard 
              profile={myMasterProfile} 
              followers={myFollowers}
              onRefresh={fetchMyFollowers}
            />
          )}
        </div>
      )}

      {showApplyModal && (
        <ApplyMasterModal 
          onClose={() => setShowApplyModal(false)}
          onSubmit={handleApplyMaster}
          error={error}
        />
      )}

      {showSubscribeModal && selectedMaster && (
        <SubscribeModal 
          master={selectedMaster}
          onClose={() => {
            setShowSubscribeModal(false);
            setSelectedMaster(null);
          }}
          onSubmit={(settings) => handleSubscribe(selectedMaster._id, settings)}
          error={error}
        />
      )}
    </div>
  );
};

// Master Card Component
const MasterCard = ({ master, isSubscribed, onSubscribe, onUnsubscribe }) => {
  const winRate = master.stats?.winRate || 0;
  const profit = master.stats?.netProfitUSD || 0;
  
  return (
    <div className="master-card">
      <div className="master-header">
        <div className="master-avatar">
          {master.displayName?.charAt(0) || '👑'}
        </div>
        <div className="master-info">
          <h3>{master.displayName}</h3>
          <span className="followers-count">
            {master.followerSettings?.currentFollowers || 0} followers
          </span>
        </div>
      </div>
      
      <div className="master-stats">
        <div className="stat">
          <span className="value" style={{ color: profit >= 0 ? '#28a745' : '#dc3545' }}>
            ${profit.toFixed(2)}
          </span>
          <span className="label">Total Profit</span>
        </div>
        <div className="stat">
          <span className="value" style={{ color: winRate >= 50 ? '#28a745' : '#f0ad4e' }}>
            {winRate.toFixed(1)}%
          </span>
          <span className="label">Win Rate</span>
        </div>
        <div className="stat">
          <span className="value">{master.stats?.totalTrades || 0}</span>
          <span className="label">Trades</span>
        </div>
      </div>

      <div className="master-fees">
        <span>Performance Fee: {master.feeSettings?.performanceFeePercent || 0}%</span>
        {master.feeSettings?.perLotFee > 0 && (
          <span>Per Lot: ${master.feeSettings.perLotFee}</span>
        )}
      </div>

      <div className="master-actions">
        {isSubscribed ? (
          <button className="btn-unsubscribe" onClick={onUnsubscribe}>
            Stop Copying
          </button>
        ) : (
          <button className="btn-subscribe" onClick={onSubscribe}>
            Copy Trader
          </button>
        )}
      </div>
    </div>
  );
};

// Subscription Card Component
const SubscriptionCard = ({ subscription, onUnsubscribe }) => {
  const master = subscription.masterId;
  const stats = subscription.stats || {};
  
  return (
    <div className="subscription-card">
      <div className="sub-header">
        <div className="master-info">
          <h3>{master?.displayName || 'Unknown Master'}</h3>
          <span className={`status ${subscription.status}`}>{subscription.status}</span>
        </div>
      </div>
      
      <div className="sub-stats">
        <div className="stat">
          <span className="label">Trades Copied</span>
          <span className="value">{stats.totalTradesCopied || 0}</span>
        </div>
        <div className="stat">
          <span className="label">Net P/L</span>
          <span className="value" style={{ color: (stats.netProfitUSD || 0) >= 0 ? '#28a745' : '#dc3545' }}>
            ${(stats.netProfitUSD || 0).toFixed(2)}
          </span>
        </div>
        <div className="stat">
          <span className="label">Fees Paid</span>
          <span className="value">${(stats.totalFeesPaid || 0).toFixed(2)}</span>
        </div>
        <div className="stat">
          <span className="label">Copy Ratio</span>
          <span className="value">{subscription.copySettings?.copyRatio || 1}x</span>
        </div>
      </div>

      <div className="sub-actions">
        <button className="btn-danger" onClick={onUnsubscribe}>
          Stop Copying
        </button>
      </div>
    </div>
  );
};

// Master Dashboard Component
const MasterDashboard = ({ profile, followers, onRefresh }) => {
  return (
    <div className="master-dashboard">
      <div className="dashboard-header">
        <h2>Your Master Profile</h2>
        <span className="status active">Active</span>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-value">${(profile.wallet?.balance || 0).toFixed(2)}</span>
          <span className="stat-label">Available Balance</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">${(profile.wallet?.totalEarned || 0).toFixed(2)}</span>
          <span className="stat-label">Total Earned</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{profile.followerSettings?.currentFollowers || 0}</span>
          <span className="stat-label">Current Followers</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{(profile.stats?.winRate || 0).toFixed(1)}%</span>
          <span className="stat-label">Win Rate</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{profile.stats?.totalTrades || 0}</span>
          <span className="stat-label">Total Trades</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: (profile.stats?.netProfitUSD || 0) >= 0 ? '#28a745' : '#dc3545' }}>
            ${(profile.stats?.netProfitUSD || 0).toFixed(2)}
          </span>
          <span className="stat-label">Net Profit</span>
        </div>
      </div>

      <div className="fee-settings">
        <h3>Your Fee Settings</h3>
        <div className="fee-grid">
          <div className="fee-item">
            <span className="label">Performance Fee:</span>
            <span className="value">{profile.feeSettings?.performanceFeePercent || 0}%</span>
          </div>
          <div className="fee-item">
            <span className="label">Per Lot Fee:</span>
            <span className="value">${profile.feeSettings?.perLotFee || 0}</span>
          </div>
          <div className="fee-item">
            <span className="label">Min Investment:</span>
            <span className="value">${profile.feeSettings?.minInvestment || 100}</span>
          </div>
        </div>
      </div>

      <div className="followers-section">
        <h3>Your Followers ({followers.length})</h3>
        {followers.length === 0 ? (
          <p className="no-followers">No followers yet. Keep trading to attract followers!</p>
        ) : (
          <table className="followers-table">
            <thead>
              <tr>
                <th>Follower</th>
                <th>Status</th>
                <th>Investment</th>
                <th>Copy Ratio</th>
                <th>Since</th>
              </tr>
            </thead>
            <tbody>
              {followers.map(f => (
                <tr key={f._id}>
                  <td>{f.followerId?.name || f.followerOderId}</td>
                  <td><span className={`status ${f.status}`}>{f.status}</span></td>
                  <td>${(f.copySettings?.investmentAmount || 0).toFixed(2)}</td>
                  <td>{f.copySettings?.copyRatio || 1}x</td>
                  <td>{new Date(f.startedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// Apply Master Modal
const ApplyMasterModal = ({ onClose, onSubmit, error }) => {
  const [formData, setFormData] = useState({
    displayName: '',
    description: '',
    performanceFeePercent: 20,
    perLotFee: 0,
    minInvestment: 100,
    tradingStrategy: '',
    tradingExperience: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2>Apply to Become a Master</h2>
        {error && <div className="error-message">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Display Name *</label>
            <input 
              type="text"
              required
              value={formData.displayName}
              onChange={e => setFormData({...formData, displayName: e.target.value})}
              placeholder="Your trader name"
            />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea 
              value={formData.description}
              onChange={e => setFormData({...formData, description: e.target.value})}
              placeholder="Describe your trading style"
              rows="3"
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Performance Fee (%)</label>
              <input 
                type="number"
                min="0"
                max="50"
                value={formData.performanceFeePercent}
                onChange={e => setFormData({...formData, performanceFeePercent: parseInt(e.target.value)})}
              />
            </div>
            <div className="form-group">
              <label>Per Lot Fee ($)</label>
              <input 
                type="number"
                min="0"
                step="0.01"
                value={formData.perLotFee}
                onChange={e => setFormData({...formData, perLotFee: parseFloat(e.target.value)})}
              />
            </div>
          </div>
          <div className="form-group">
            <label>Minimum Investment ($)</label>
            <input 
              type="number"
              min="0"
              value={formData.minInvestment}
              onChange={e => setFormData({...formData, minInvestment: parseInt(e.target.value)})}
            />
          </div>
          <div className="form-group">
            <label>Trading Strategy</label>
            <textarea 
              value={formData.tradingStrategy}
              onChange={e => setFormData({...formData, tradingStrategy: e.target.value})}
              placeholder="Describe your trading strategy"
              rows="3"
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">Submit Application</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Subscribe Modal
const SubscribeModal = ({ master, onClose, onSubmit, error }) => {
  const [settings, setSettings] = useState({
    mode: 'proportional',
    copyRatio: 1,
    fixedLotSize: 0.01,
    maxLotSize: 1,
    investmentAmount: master.feeSettings?.minInvestment || 100,
    maxLossPercent: 30,
    copySLTP: true
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(settings);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2>Copy {master.displayName}</h2>
        {error && <div className="error-message">{error}</div>}
        
        <div className="master-summary">
          <p>Performance Fee: {master.feeSettings?.performanceFeePercent || 0}%</p>
          <p>Min Investment: ${master.feeSettings?.minInvestment || 100}</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Copy Mode</label>
            <select 
              value={settings.mode}
              onChange={e => setSettings({...settings, mode: e.target.value})}
            >
              <option value="proportional">Proportional (Copy Ratio)</option>
              <option value="fixed_lot">Fixed Lot Size</option>
            </select>
          </div>

          {settings.mode === 'proportional' && (
            <div className="form-group">
              <label>Copy Ratio</label>
              <input 
                type="number"
                min="0.1"
                max="10"
                step="0.1"
                value={settings.copyRatio}
                onChange={e => setSettings({...settings, copyRatio: parseFloat(e.target.value)})}
              />
              <small>1 = Same size as master, 0.5 = Half size</small>
            </div>
          )}

          {settings.mode === 'fixed_lot' && (
            <div className="form-group">
              <label>Fixed Lot Size</label>
              <input 
                type="number"
                min="0.01"
                step="0.01"
                value={settings.fixedLotSize}
                onChange={e => setSettings({...settings, fixedLotSize: parseFloat(e.target.value)})}
              />
            </div>
          )}

          <div className="form-group">
            <label>Investment Amount ($)</label>
            <input 
              type="number"
              min={master.feeSettings?.minInvestment || 100}
              value={settings.investmentAmount}
              onChange={e => setSettings({...settings, investmentAmount: parseInt(e.target.value)})}
            />
          </div>

          <div className="form-group">
            <label>Max Loss % (Stop copying if exceeded)</label>
            <input 
              type="number"
              min="5"
              max="100"
              value={settings.maxLossPercent}
              onChange={e => setSettings({...settings, maxLossPercent: parseInt(e.target.value)})}
            />
          </div>

          <div className="form-group checkbox">
            <label>
              <input 
                type="checkbox"
                checked={settings.copySLTP}
                onChange={e => setSettings({...settings, copySLTP: e.target.checked})}
              />
              Copy Stop Loss & Take Profit
            </label>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">Start Copying</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MastersPage;
