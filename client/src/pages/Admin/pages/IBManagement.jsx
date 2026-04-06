import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../adminConfig';

const IBManagement = () => {
  const { tab } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(tab || 'applications');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Data states
  const [applications, setApplications] = useState([]);
  const [activeIBs, setActiveIBs] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [settings, setSettings] = useState({
    enabled: true,
    autoApprove: false,
    defaultCommission: { type: 'per_lot', perLotAmount: 2, revenuePercent: 10 },
    minWithdrawal: 50,
    maxLevels: 5
  });
  const [stats, setStats] = useState({ total: 0, active: 0, pending: 0, totalCommissionPaid: 0 });
  const [commissionSummary, setCommissionSummary] = useState({ totalAmount: 0, pendingAmount: 0, creditedAmount: 0, paidAmount: 0, count: 0 });
  
  // Modal states
  const [selectedIB, setSelectedIB] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('');

  const tabs = [
    { id: 'applications', label: 'Applications', path: '' },
    { id: 'active', label: 'Active IBs', path: 'active' },
    { id: 'commissions', label: 'Commissions', path: 'commissions' },
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
          const appRes = await fetch(`${API_BASE_URL}/ib/admin/pending`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const appData = await appRes.json();
          if (appData.success) setApplications(appData.data.ibs || []);
          break;

        case 'active':
          const activeRes = await fetch(`${API_BASE_URL}/ib/admin/list?status=active`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const activeData = await activeRes.json();
          if (activeData.success) setActiveIBs(activeData.data.ibs || []);
          break;

        case 'commissions':
          const commRes = await fetch(`${API_BASE_URL}/ib/admin/commissions`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const commData = await commRes.json();
          if (commData.success) {
            setCommissions(commData.data.commissions || []);
            setCommissionSummary(commData.data.summary || {});
          }
          break;

        case 'settings':
          const settingsRes = await fetch(`${API_BASE_URL}/ib/admin/settings`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const settingsData = await settingsRes.json();
          if (settingsData.success && settingsData.data) {
            setSettings(prev => ({ ...prev, ...settingsData.data }));
          }
          
          const statsRes = await fetch(`${API_BASE_URL}/ib/admin/stats/summary`, {
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
    navigate(`/admin/ib${tabConfig.path ? '/' + tabConfig.path : ''}`);
  };

  const handleApprove = async (ibId) => {
    const token = localStorage.getItem('SetupFX-admin-token');
    try {
      const res = await fetch(`${API_BASE_URL}/ib/admin/${ibId}/approve`, {
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

  const handleReject = async (ibId, reason) => {
    const token = localStorage.getItem('SetupFX-admin-token');
    try {
      const res = await fetch(`${API_BASE_URL}/ib/admin/${ibId}/reject`, {
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

  const handleSuspend = async (ibId, reason) => {
    const token = localStorage.getItem('SetupFX-admin-token');
    try {
      const res = await fetch(`${API_BASE_URL}/ib/admin/${ibId}/suspend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ reason })
      });
      const data = await res.json();
      if (data.success) {
        fetchData('active');
        setShowModal(false);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUpdateSettings = async (newSettings) => {
    const token = localStorage.getItem('SetupFX-admin-token');
    try {
      const res = await fetch(`${API_BASE_URL}/ib/admin/settings`, {
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
        <h3>Pending IB Applications</h3>
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
              <th>Referral Code</th>
              <th>Business Name</th>
              <th>Applied At</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {applications.map(ib => (
              <tr key={ib._id}>
                <td>
                  <div className="user-info">
                    <strong>{ib.userId?.name || 'N/A'}</strong>
                    <small>{ib.userId?.email}</small>
                  </div>
                </td>
                <td><code>{ib.referralCode}</code></td>
                <td>{ib.applicationDetails?.businessName || '-'}</td>
                <td>{new Date(ib.appliedAt).toLocaleDateString()}</td>
                <td>
                  <div className="action-buttons">
                    <button 
                      className="btn btn-success btn-sm"
                      onClick={() => {
                        setSelectedIB(ib);
                        setModalType('approve');
                        setShowModal(true);
                      }}
                    >
                      Approve
                    </button>
                    <button 
                      className="btn btn-danger btn-sm"
                      onClick={() => {
                        setSelectedIB(ib);
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

  const renderActiveIBs = () => (
    <div className="admin-table-container">
      <div className="table-header">
        <h3>Active IBs</h3>
        <span className="badge badge-success">{activeIBs.length} active</span>
      </div>
      
      {activeIBs.length === 0 ? (
        <div className="empty-state">
          <span className="icon">🤝</span>
          <p>No active IBs</p>
        </div>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Referral Code</th>
              <th>Level</th>
              <th>Referrals</th>
              <th>Total Commission</th>
              <th>Commission Type</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {activeIBs.map(ib => (
              <tr key={ib._id}>
                <td>
                  <div className="user-info">
                    <strong>{ib.userId?.name || 'N/A'}</strong>
                    <small>{ib.oderId}</small>
                  </div>
                </td>
                <td><code>{ib.referralCode}</code></td>
                <td><span className="badge">Level {ib.level}</span></td>
                <td>{ib.stats?.totalReferrals || 0}</td>
                <td className="text-success">${(ib.stats?.totalCommissionEarned || 0).toFixed(2)}</td>
                <td>
                  <span className="badge badge-info">
                    {ib.commissionSettings?.type || 'per_lot'}
                  </span>
                </td>
                <td>
                  <div className="action-buttons">
                    <button 
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        setSelectedIB(ib);
                        setModalType('edit');
                        setShowModal(true);
                      }}
                    >
                      Edit
                    </button>
                    <button 
                      className="btn btn-warning btn-sm"
                      onClick={() => {
                        setSelectedIB(ib);
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

  const renderCommissions = () => (
    <div className="admin-table-container">
      {/* Commission Summary Cards */}
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <span className="stat-value" style={{ color: '#10b981' }}>${(commissionSummary.totalAmount || 0).toFixed(2)}</span>
          <span className="stat-label">Total Commission</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: '#f59e0b' }}>${(commissionSummary.pendingAmount || 0).toFixed(2)}</span>
          <span className="stat-label">Pending</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: '#3b82f6' }}>${(commissionSummary.creditedAmount || 0).toFixed(2)}</span>
          <span className="stat-label">Credited</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: '#8b5cf6' }}>${(commissionSummary.paidAmount || 0).toFixed(2)}</span>
          <span className="stat-label">Paid Out</span>
        </div>
      </div>

      <div className="table-header">
        <h3>Commission Records</h3>
        <span className="badge">{commissions.length} records</span>
      </div>
      
      {commissions.length === 0 ? (
        <div className="empty-state">
          <span className="icon">💰</span>
          <p>No commission records found</p>
        </div>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>IB</th>
              <th>Referred User</th>
              <th>Type</th>
              <th>Trade Details</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {commissions.map(comm => (
              <tr key={comm._id}>
                <td>{new Date(comm.createdAt).toLocaleDateString()}</td>
                <td>
                  <div className="user-info">
                    <code>{comm.ibId?.referralCode || 'N/A'}</code>
                  </div>
                </td>
                <td>
                  <div className="user-info">
                    <strong>{comm.referredUserId?.name || 'N/A'}</strong>
                    <small>{comm.referredOderId || comm.referredUserId?.oderId}</small>
                  </div>
                </td>
                <td>
                  <span className="badge badge-info">{comm.commissionType}</span>
                  {comm.levelDepth > 1 && <small style={{ marginLeft: 4 }}>L{comm.levelDepth}</small>}
                </td>
                <td>
                  {comm.tradeDetails?.symbol ? (
                    <div>
                      <strong>{comm.tradeDetails.symbol}</strong>
                      <small style={{ display: 'block' }}>
                        {comm.tradeDetails.volume} lots | P/L: ${(comm.tradeDetails.profit || 0).toFixed(2)}
                      </small>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--text-secondary)' }}>{comm.sourceType}</span>
                  )}
                </td>
                <td className="text-success" style={{ fontWeight: 600 }}>
                  ${(comm.amount || 0).toFixed(2)}
                </td>
                <td>
                  <span className={`badge ${
                    comm.status === 'credited' ? 'badge-success' : 
                    comm.status === 'pending' ? 'badge-warning' : 
                    comm.status === 'paid' ? 'badge-info' : 
                    'badge-secondary'
                  }`}>
                    {comm.status}
                  </span>
                </td>
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
        <h3>IB System Settings</h3>
        
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-value">{stats.total || 0}</span>
            <span className="stat-label">Total IBs</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{stats.active || 0}</span>
            <span className="stat-label">Active IBs</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{stats.pending || 0}</span>
            <span className="stat-label">Pending</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">${(stats.totalCommissionPaid || 0).toFixed(2)}</span>
            <span className="stat-label">Total Commission Paid</span>
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
                Enable IB System
              </label>
            </div>
            
            <div className="form-group">
              <label>
                <input 
                  type="checkbox" 
                  checked={settings.autoApprove}
                  onChange={(e) => handleUpdateSettings({ autoApprove: e.target.checked })}
                />
                Auto-approve IB Applications
              </label>
            </div>

            <div className="form-group">
              <label>Default Commission Type</label>
              <select 
                value={settings.defaultCommission?.type || 'per_lot'}
                onChange={(e) => handleUpdateSettings({ 
                  defaultCommission: { ...settings.defaultCommission, type: e.target.value }
                })}
              >
                <option value="per_lot">Per Lot</option>
                <option value="revenue_percent">Revenue Percent</option>
                <option value="spread_share">Spread Share</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>

            <div className="form-group">
              <label>Default Per Lot Amount ($)</label>
              <input 
                type="number" 
                step="0.01"
                value={settings.defaultCommission?.perLotAmount || 0}
                onChange={(e) => handleUpdateSettings({ 
                  defaultCommission: { ...settings.defaultCommission, perLotAmount: parseFloat(e.target.value) }
                })}
              />
            </div>

            <div className="form-group">
              <label>Minimum Withdrawal ($)</label>
              <input 
                type="number" 
                value={settings.minWithdrawal || 50}
                onChange={(e) => handleUpdateSettings({ minWithdrawal: parseInt(e.target.value) })}
              />
            </div>

            <div className="form-group">
              <label>Max Multi-Level Depth</label>
              <input 
                type="number" 
                min="1"
                max="10"
                value={settings.maxLevels || 5}
                onChange={(e) => handleUpdateSettings({ maxLevels: parseInt(e.target.value) })}
              />
            </div>
          </div>
      </div>
    </div>
  );

  const renderModal = () => {
    if (!showModal || !selectedIB) return null;

    return (
      <div className="modal-overlay" onClick={() => setShowModal(false)}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
          {modalType === 'approve' && (
            <>
              <h3>Approve IB Application</h3>
              <p>Approve {selectedIB.userId?.name} as an Introducing Broker?</p>
              <div className="ib-details">
                <p><strong>Referral Code:</strong> {selectedIB.referralCode}</p>
                <p><strong>Business:</strong> {selectedIB.applicationDetails?.businessName || 'N/A'}</p>
              </div>
              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn btn-success" onClick={() => handleApprove(selectedIB._id)}>Approve</button>
              </div>
            </>
          )}

          {modalType === 'reject' && (
            <>
              <h3>Reject IB Application</h3>
              <p>Reject {selectedIB.userId?.name}'s application?</p>
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
                  onClick={() => handleReject(selectedIB._id, document.getElementById('rejectReason').value)}
                >
                  Reject
                </button>
              </div>
            </>
          )}

          {modalType === 'suspend' && (
            <>
              <h3>Suspend IB</h3>
              <p>Suspend {selectedIB.userId?.name}?</p>
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
                  onClick={() => handleSuspend(selectedIB._id, document.getElementById('suspendReason').value)}
                >
                  Suspend
                </button>
              </div>
            </>
          )}

          {modalType === 'edit' && (
            <>
              <h3>Edit IB Commission Settings</h3>
              <div className="form-group">
                <label>Commission Type</label>
                <select defaultValue={selectedIB.commissionSettings?.type}>
                  <option value="per_lot">Per Lot</option>
                  <option value="revenue_percent">Revenue Percent</option>
                  <option value="spread_share">Spread Share</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </div>
              <div className="form-group">
                <label>Per Lot Amount ($)</label>
                <input 
                  type="number" 
                  step="0.01"
                  defaultValue={selectedIB.commissionSettings?.perLotAmount || 0}
                />
              </div>
              <div className="form-group">
                <label>Revenue Percent (%)</label>
                <input 
                  type="number" 
                  step="0.1"
                  defaultValue={selectedIB.commissionSettings?.revenuePercent || 0}
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
    <div className="admin-page ib-management">
      <div className="page-header">
        <h2>🤝 IB Management</h2>
        <p>Manage Introducing Brokers and commission settings</p>
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
          {activeTab === 'active' && renderActiveIBs()}
          {activeTab === 'commissions' && renderCommissions()}
          {activeTab === 'settings' && renderSettings()}
        </div>
      )}

      {renderModal()}
    </div>
  );
};

export default IBManagement;
