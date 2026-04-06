import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../adminConfig';

const CopyTradeManagement = () => {
  const { tab } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(tab || 'applications');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Data states
  const [applications, setApplications] = useState([]);
  const [masters, setMasters] = useState([]);
  const [followers, setFollowers] = useState([]);
  const [settings, setSettings] = useState({
    enabled: true,
    autoApprove: false,
    enforceHighWaterMark: true,
    maxPerformanceFee: 50,
    maxPerLotFee: 10,
    maxSubscriptionFee: 100,
    defaultMaxFollowers: 100,
    absoluteMaxFollowers: 500,
    defaultMaxDrawdown: 30,
    forceStopAtDrawdown: 50
  });
  const [stats, setStats] = useState({ masters: [], followers: [] });
  
  // Modal states
  const [selectedMaster, setSelectedMaster] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('');

  const tabs = [
    { id: 'applications', label: 'Applications', path: '' },
    { id: 'masters', label: 'All Masters', path: 'masters' },
    { id: 'followers', label: 'Followers', path: 'followers' },
    { id: 'settings', label: 'Settings', path: 'settings' }
  ];

  useEffect(() => {
    const currentTab = tab || 'applications';
    setActiveTab(currentTab);
    fetchData(currentTab);
  }, [tab]);

  const fetchData = async (currentTab) => {
    setLoading(true);
    setError(null);
    const token = localStorage.getItem('SetupFX-admin-token');

    try {
      switch (currentTab) {
        case 'applications':
          const appRes = await fetch(`${API_BASE_URL}/copy-trade/admin/pending`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const appData = await appRes.json();
          if (appData.success) setApplications(appData.data.masters || []);
          break;

        case 'masters':
          const mastersRes = await fetch(`${API_BASE_URL}/copy-trade/admin/masters?status=active`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const mastersData = await mastersRes.json();
          if (mastersData.success) setMasters(mastersData.data.masters || []);
          break;

        case 'followers':
          const followersRes = await fetch(`${API_BASE_URL}/copy-trade/admin/followers`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const followersData = await followersRes.json();
          if (followersData.success) setFollowers(followersData.data.followers || []);
          break;

        case 'settings':
          const settingsRes = await fetch(`${API_BASE_URL}/copy-trade/admin/settings`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const settingsData = await settingsRes.json();
          if (settingsData.success && settingsData.data) {
            setSettings(prev => ({ ...prev, ...settingsData.data }));
          }
          
          const statsRes = await fetch(`${API_BASE_URL}/copy-trade/admin/stats`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const statsData = await statsRes.json();
          if (statsData.success && statsData.data) {
            setStats(prev => ({ ...prev, ...statsData.data }));
          }
          break;
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (tabId) => {
    const tabConfig = tabs.find(t => t.id === tabId);
    navigate(`/admin/copy-trade${tabConfig.path ? '/' + tabConfig.path : ''}`);
  };

  const handleApprove = async (masterId) => {
    const token = localStorage.getItem('SetupFX-admin-token');
    try {
      const res = await fetch(`${API_BASE_URL}/copy-trade/admin/masters/${masterId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        fetchData('applications');
        setShowModal(false);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleReject = async (masterId, reason) => {
    const token = localStorage.getItem('SetupFX-admin-token');
    try {
      const res = await fetch(`${API_BASE_URL}/copy-trade/admin/masters/${masterId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ reason })
      });
      const data = await res.json();
      if (data.success) {
        fetchData('applications');
        setShowModal(false);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSuspend = async (masterId, reason) => {
    const token = localStorage.getItem('SetupFX-admin-token');
    try {
      const res = await fetch(`${API_BASE_URL}/copy-trade/admin/masters/${masterId}/suspend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ reason })
      });
      const data = await res.json();
      if (data.success) {
        fetchData('masters');
        setShowModal(false);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUpdateSettings = async (newSettings) => {
    const token = localStorage.getItem('SetupFX-admin-token');
    try {
      const res = await fetch(`${API_BASE_URL}/copy-trade/admin/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(newSettings)
      });
      const data = await res.json();
      if (data.success) {
        setSettings(data.data);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const renderApplications = () => (
    <div className="admin-table-container">
      <div className="table-header">
        <h3>Pending Master Applications</h3>
        <span className="badge">{applications.length} pending</span>
      </div>
      
      {applications.length === 0 ? (
        <div className="empty-state">
          <span className="icon">📋</span>
          <p>No pending applications</p>
        </div>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Display Name</th>
              <th>Performance Fee</th>
              <th>Applied At</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {applications.map(master => (
              <tr key={master._id}>
                <td>
                  <div className="user-info">
                    <strong>{master.userId?.name || 'N/A'}</strong>
                    <small>{master.userId?.email}</small>
                  </div>
                </td>
                <td>{master.displayName}</td>
                <td>{master.feeSettings?.performanceFeePercent || 0}%</td>
                <td>{new Date(master.appliedAt).toLocaleDateString()}</td>
                <td>
                  <div className="action-buttons">
                    <button 
                      className="btn btn-success btn-sm"
                      onClick={() => {
                        setSelectedMaster(master);
                        setModalType('approve');
                        setShowModal(true);
                      }}
                    >
                      Approve
                    </button>
                    <button 
                      className="btn btn-danger btn-sm"
                      onClick={() => {
                        setSelectedMaster(master);
                        setModalType('reject');
                        setShowModal(true);
                      }}
                    >
                      Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  const renderMasters = () => (
    <div className="admin-table-container">
      <div className="table-header">
        <h3>Active Copy Masters</h3>
        <span className="badge badge-success">{masters.length} active</span>
      </div>
      
      {masters.length === 0 ? (
        <div className="empty-state">
          <span className="icon">👑</span>
          <p>No active masters</p>
        </div>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Master</th>
              <th>Followers</th>
              <th>Win Rate</th>
              <th>Total Profit</th>
              <th>Performance Fee</th>
              <th>Total Earned</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {masters.map(master => (
              <tr key={master._id}>
                <td>
                  <div className="user-info">
                    <strong>{master.displayName}</strong>
                    <small>{master.oderId}</small>
                  </div>
                </td>
                <td>
                  <span className="badge">
                    {master.followerSettings?.currentFollowers || 0} / {master.followerSettings?.maxFollowers || 100}
                  </span>
                </td>
                <td>
                  <span className={`badge ${(master.stats?.winRate || 0) >= 50 ? 'badge-success' : 'badge-warning'}`}>
                    {(master.stats?.winRate || 0).toFixed(1)}%
                  </span>
                </td>
                <td className={master.stats?.netProfitUSD >= 0 ? 'text-success' : 'text-danger'}>
                  ${(master.stats?.netProfitUSD || 0).toFixed(2)}
                </td>
                <td>{master.feeSettings?.performanceFeePercent || 0}%</td>
                <td className="text-success">${(master.wallet?.totalEarned || 0).toFixed(2)}</td>
                <td>
                  <div className="action-buttons">
                    <button 
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        setSelectedMaster(master);
                        setModalType('edit');
                        setShowModal(true);
                      }}
                    >
                      Edit
                    </button>
                    <button 
                      className="btn btn-warning btn-sm"
                      onClick={() => {
                        setSelectedMaster(master);
                        setModalType('suspend');
                        setShowModal(true);
                      }}
                    >
                      Suspend
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  const renderFollowers = () => (
    <div className="admin-table-container">
      <div className="table-header">
        <h3>All Followers</h3>
        <span className="badge">{followers.length} total</span>
      </div>
      
      {followers.length === 0 ? (
        <div className="empty-state">
          <span className="icon">👥</span>
          <p>No followers yet</p>
        </div>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Follower</th>
              <th>Following</th>
              <th>Status</th>
              <th>Investment</th>
              <th>Copy Ratio</th>
              <th>Net P/L</th>
              <th>Fees Paid</th>
            </tr>
          </thead>
          <tbody>
            {followers.map(follower => (
              <tr key={follower._id}>
                <td>
                  <div className="user-info">
                    <strong>{follower.followerId?.name || 'N/A'}</strong>
                    <small>{follower.followerOderId}</small>
                  </div>
                </td>
                <td>
                  <div className="user-info">
                    <strong>{follower.masterId?.displayName || 'N/A'}</strong>
                    <small>{follower.masterOderId}</small>
                  </div>
                </td>
                <td>
                  <span className={`badge ${follower.status === 'active' ? 'badge-success' : 'badge-warning'}`}>
                    {follower.status}
                  </span>
                </td>
                <td>${(follower.copySettings?.investmentAmount || 0).toFixed(2)}</td>
                <td>{follower.copySettings?.copyRatio || 1}x</td>
                <td className={follower.stats?.netProfitUSD >= 0 ? 'text-success' : 'text-danger'}>
                  ${(follower.stats?.netProfitUSD || 0).toFixed(2)}
                </td>
                <td>${(follower.stats?.totalFeesPaid || 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  const renderSettings = () => (
    <div className="settings-container">
      <div className="settings-section">
        <h3>Copy Trading Settings</h3>
        
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-value">
              {stats.masters?.find(m => m._id === 'active')?.count || 0}
            </span>
            <span className="stat-label">Active Masters</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">
              {stats.masters?.find(m => m._id === 'pending')?.count || 0}
            </span>
            <span className="stat-label">Pending Applications</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">
              {stats.followers?.find(f => f._id === 'active')?.count || 0}
            </span>
            <span className="stat-label">Active Followers</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">
              ${(stats.followers?.find(f => f._id === 'active')?.totalFeesPaid || 0).toFixed(2)}
            </span>
            <span className="stat-label">Total Fees Collected</span>
          </div>
        </div>

        <div className="settings-form">
          <div className="form-group">
            <label>
              <input 
                type="checkbox" 
                checked={settings.enabled}
                onChange={(e) => handleUpdateSettings({ enabled: e.target.checked })}
              />
              Enable Copy Trading
            </label>
          </div>
          
          <div className="form-group">
              <label>
                <input 
                  type="checkbox" 
                  checked={settings.autoApprove}
                  onChange={(e) => handleUpdateSettings({ autoApprove: e.target.checked })}
                />
                Auto-approve Master Applications
              </label>
            </div>

            <div className="form-group">
              <label>
                <input 
                  type="checkbox" 
                  checked={settings.enforceHighWaterMark}
                  onChange={(e) => handleUpdateSettings({ enforceHighWaterMark: e.target.checked })}
                />
                Enforce High Water Mark for Performance Fees
              </label>
            </div>

            <h4>Fee Caps</h4>
            
            <div className="form-group">
              <label>Max Performance Fee (%)</label>
              <input 
                type="number" 
                min="0"
                max="100"
                value={settings.maxPerformanceFee || 50}
                onChange={(e) => handleUpdateSettings({ maxPerformanceFee: parseInt(e.target.value) })}
              />
            </div>

            <div className="form-group">
              <label>Max Per Lot Fee ($)</label>
              <input 
                type="number" 
                step="0.01"
                value={settings.maxPerLotFee || 10}
                onChange={(e) => handleUpdateSettings({ maxPerLotFee: parseFloat(e.target.value) })}
              />
            </div>

            <div className="form-group">
              <label>Max Subscription Fee ($)</label>
              <input 
                type="number" 
                value={settings.maxSubscriptionFee || 100}
                onChange={(e) => handleUpdateSettings({ maxSubscriptionFee: parseInt(e.target.value) })}
              />
            </div>

            <h4>Follower Limits</h4>

            <div className="form-group">
              <label>Default Max Followers per Master</label>
              <input 
                type="number" 
                value={settings.defaultMaxFollowers || 100}
                onChange={(e) => handleUpdateSettings({ defaultMaxFollowers: parseInt(e.target.value) })}
              />
            </div>

            <div className="form-group">
              <label>Absolute Max Followers</label>
              <input 
                type="number" 
                value={settings.absoluteMaxFollowers || 500}
                onChange={(e) => handleUpdateSettings({ absoluteMaxFollowers: parseInt(e.target.value) })}
              />
            </div>

            <h4>Master Requirements</h4>

            <div className="form-group">
              <label>Minimum Trades to Become Master</label>
              <input 
                type="number" 
                min="0"
                value={settings.minTradesToBecomeMaster || 10}
                onChange={(e) => handleUpdateSettings({ minTradesToBecomeMaster: parseInt(e.target.value) })}
              />
              <small className="form-hint">Set to 0 to disable this requirement</small>
            </div>

            <div className="form-group">
              <label>Minimum Win Rate to Become Master (%)</label>
              <input 
                type="number" 
                min="0"
                max="100"
                value={settings.minWinRateToBecomeMaster || 0}
                onChange={(e) => handleUpdateSettings({ minWinRateToBecomeMaster: parseInt(e.target.value) })}
              />
              <small className="form-hint">Set to 0 to disable this requirement</small>
            </div>

            <div className="form-group">
              <label>Minimum Profit to Become Master ($)</label>
              <input 
                type="number" 
                min="0"
                value={settings.minProfitToBecomeMaster || 0}
                onChange={(e) => handleUpdateSettings({ minProfitToBecomeMaster: parseInt(e.target.value) })}
              />
              <small className="form-hint">Set to 0 to disable this requirement</small>
            </div>

            <h4>Risk Controls</h4>

            <div className="form-group">
              <label>Default Max Drawdown (%)</label>
              <input 
                type="number" 
                min="0"
                max="100"
                value={settings.defaultMaxDrawdown || 30}
                onChange={(e) => handleUpdateSettings({ defaultMaxDrawdown: parseInt(e.target.value) })}
              />
            </div>

            <div className="form-group">
              <label>Force Stop at Drawdown (%)</label>
              <input 
                type="number" 
                min="0"
                max="100"
                value={settings.forceStopAtDrawdown || 50}
                onChange={(e) => handleUpdateSettings({ forceStopAtDrawdown: parseInt(e.target.value) })}
              />
            </div>
          </div>
      </div>
    </div>
  );

  const renderModal = () => {
    if (!showModal || !selectedMaster) return null;

    return (
      <div className="modal-overlay" onClick={() => setShowModal(false)}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
          {modalType === 'approve' && (
            <>
              <h3>Approve Master Application</h3>
              <p>Approve {selectedMaster.displayName} as a Copy Trading Master?</p>
              <div className="master-details">
                <p><strong>User:</strong> {selectedMaster.userId?.name}</p>
                <p><strong>Performance Fee:</strong> {selectedMaster.feeSettings?.performanceFeePercent}%</p>
                <p><strong>Strategy:</strong> {selectedMaster.applicationDetails?.tradingStrategy || 'N/A'}</p>
              </div>
              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn btn-success" onClick={() => handleApprove(selectedMaster._id)}>Approve</button>
              </div>
            </>
          )}

          {modalType === 'reject' && (
            <>
              <h3>Reject Master Application</h3>
              <p>Reject {selectedMaster.displayName}'s application?</p>
              <div className="form-group">
                <label>Rejection Reason</label>
                <textarea 
                  id="rejectReason"
                  placeholder="Enter reason for rejection..."
                  rows="3"
                />
              </div>
              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button 
                  className="btn btn-danger" 
                  onClick={() => handleReject(selectedMaster._id, document.getElementById('rejectReason').value)}
                >
                  Reject
                </button>
              </div>
            </>
          )}

          {modalType === 'suspend' && (
            <>
              <h3>Suspend Master</h3>
              <p>Suspend {selectedMaster.displayName}? All followers will be stopped.</p>
              <div className="form-group">
                <label>Suspension Reason</label>
                <textarea 
                  id="suspendReason"
                  placeholder="Enter reason for suspension..."
                  rows="3"
                />
              </div>
              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button 
                  className="btn btn-warning" 
                  onClick={() => handleSuspend(selectedMaster._id, document.getElementById('suspendReason').value)}
                >
                  Suspend
                </button>
              </div>
            </>
          )}

          {modalType === 'edit' && (
            <>
              <h3>Edit Master Fee Settings</h3>
              <div className="form-group">
                <label>Performance Fee (%)</label>
                <input 
                  type="number" 
                  min="0"
                  max="50"
                  defaultValue={selectedMaster.feeSettings?.performanceFeePercent || 20}
                />
              </div>
              <div className="form-group">
                <label>Per Lot Fee ($)</label>
                <input 
                  type="number" 
                  step="0.01"
                  defaultValue={selectedMaster.feeSettings?.perLotFee || 0}
                />
              </div>
              <div className="form-group">
                <label>Subscription Fee ($)</label>
                <input 
                  type="number" 
                  defaultValue={selectedMaster.feeSettings?.subscriptionFee || 0}
                />
              </div>
              <div className="form-group">
                <label>Max Followers</label>
                <input 
                  type="number" 
                  defaultValue={selectedMaster.followerSettings?.maxFollowers || 100}
                />
              </div>
              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn btn-primary">Save Changes</button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="admin-page copy-trade-management">
      <div className="page-header">
        <h2>📋 Copy Trade Management</h2>
        <p>Manage Copy Trading Masters and Followers</p>
      </div>

      <div className="tabs-container">
        {tabs.map(t => (
          <button
            key={t.id}
            className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => handleTabChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="error-message">{error}</div>}
      
      {loading ? (
        <div className="loading-spinner">Loading...</div>
      ) : (
        <div className="tab-content">
          {activeTab === 'applications' && renderApplications()}
          {activeTab === 'masters' && renderMasters()}
          {activeTab === 'followers' && renderFollowers()}
          {activeTab === 'settings' && renderSettings()}
        </div>
      )}

      {renderModal()}
    </div>
  );
};

export default CopyTradeManagement;
