import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';

function Dashboard() {
  const { API_URL, adminCurrency, usdInrRate, formatAdminCurrency } = useOutletContext();
  
  // Local currency formatter that handles INR values (deposits/withdrawals are stored in INR)
  const formatCurrency = (value, isAlreadyINR = true) => {
    const numValue = Number(value || 0);
    if (adminCurrency === 'INR') {
      // If value is already in INR, just format it
      if (isAlreadyINR) {
        return `₹${numValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
      // Convert USD to INR
      return `₹${(numValue * usdInrRate).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    // Convert INR to USD if needed
    if (isAlreadyINR) {
      return `$${(numValue / usdInrRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `$${numValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  const [statsLoading, setStatsLoading] = useState(false);
  const [dashboardStats, setDashboardStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    blockedUsers: 0,
    demoUsers: 0,
    totalSubAdmins: 0,
    totalBrokers: 0,
    totalTrades: 0,
    openPositions: 0,
    closedTrades: 0,
    totalDeposits: 0,
    totalWithdrawals: 0,
    pendingDeposits: 0,
    pendingWithdrawals: 0
  });
  const [recentUsers, setRecentUsers] = useState([]);
  const [recentTrades, setRecentTrades] = useState([]);

  const fetchDashboardStats = async () => {
    setStatsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/dashboard/stats`);
      const data = await res.json();
      if (data.success) {
        setDashboardStats(data.stats);
        setRecentUsers(data.recentUsers || []);
        setRecentTrades(data.recentTrades || []);
      }
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  if (statsLoading) {
    return <div className="loading-spinner">Loading dashboard...</div>;
  }

  return (
    <div className="admin-dashboard">
      <div className="dashboard-stats">
        <div className="stat-card">
          <div className="stat-icon">👥</div>
          <div className="stat-info">
            <span className="stat-value">{dashboardStats.totalUsers.toLocaleString()}</span>
            <span className="stat-label">Total Users</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📈</div>
          <div className="stat-info">
            <span className="stat-value">{dashboardStats.totalTrades.toLocaleString()}</span>
            <span className="stat-label">Total Trades</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-info">
            <span className="stat-value">{formatCurrency(dashboardStats.totalDeposits)}</span>
            <span className="stat-label">Total Deposits</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📊</div>
          <div className="stat-info">
            <span className="stat-value">{dashboardStats.openPositions}</span>
            <span className="stat-label">Open Positions</span>
          </div>
        </div>
      </div>

      <div className="dashboard-stats" style={{ marginTop: '20px' }}>
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}>
          <div className="stat-icon">✅</div>
          <div className="stat-info">
            <span className="stat-value">{dashboardStats.activeUsers}</span>
            <span className="stat-label">Active Users</span>
          </div>
        </div>
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' }}>
          <div className="stat-icon">🚫</div>
          <div className="stat-info">
            <span className="stat-value">{dashboardStats.blockedUsers}</span>
            <span className="stat-label">Blocked Users</span>
          </div>
        </div>
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' }}>
          <div className="stat-icon">⏳</div>
          <div className="stat-info">
            <span className="stat-value">{dashboardStats.pendingDeposits}</span>
            <span className="stat-label">Pending Deposits</span>
          </div>
        </div>
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)' }}>
          <div className="stat-icon">🎮</div>
          <div className="stat-info">
            <span className="stat-value">{dashboardStats.demoUsers}</span>
            <span className="stat-label">Demo Users</span>
          </div>
        </div>
      </div>

      {/* Admin Hierarchy Stats */}
      <div className="dashboard-stats" style={{ marginTop: '20px' }}>
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' }}>
          <div className="stat-icon">👔</div>
          <div className="stat-info">
            <span className="stat-value">{dashboardStats.totalSubAdmins}</span>
            <span className="stat-label">Sub-Admins</span>
          </div>
        </div>
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)' }}>
          <div className="stat-icon">🤝</div>
          <div className="stat-info">
            <span className="stat-value">{dashboardStats.totalBrokers}</span>
            <span className="stat-label">Brokers</span>
          </div>
        </div>
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)' }}>
          <div className="stat-icon">💸</div>
          <div className="stat-info">
            <span className="stat-value">{formatCurrency(dashboardStats.totalWithdrawals)}</span>
            <span className="stat-label">Total Withdrawals</span>
          </div>
        </div>
        <div className="stat-card" style={{ background: 'linear-gradient(135deg, #84cc16 0%, #65a30d 100%)' }}>
          <div className="stat-icon">⏳</div>
          <div className="stat-info">
            <span className="stat-value">{dashboardStats.pendingWithdrawals}</span>
            <span className="stat-label">Pending Withdrawals</span>
          </div>
        </div>
      </div>

      <div className="dashboard-charts">
        <div className="chart-card">
          <h3>Quick Stats</h3>
          <div style={{ padding: '20px' }}>
            <p><strong>Closed Trades:</strong> {dashboardStats.closedTrades}</p>
            <p><strong>Total Withdrawals:</strong> {formatCurrency(dashboardStats.totalWithdrawals)}</p>
            <p><strong>Pending Withdrawals:</strong> {dashboardStats.pendingWithdrawals}</p>
          </div>
        </div>
        <div className="chart-card">
          <h3>Recent Trades</h3>
          {recentTrades.length === 0 ? (
            <p style={{ padding: '20px', color: '#888' }}>No trades yet</p>
          ) : (
            <div style={{ maxHeight: '200px', overflow: 'auto' }}>
              <table className="admin-table" style={{ fontSize: '12px' }}>
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Side</th>
                    <th>Volume</th>
                    <th>P/L</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTrades.slice(0, 5).map((trade, idx) => (
                    <tr key={idx}>
                      <td>{trade.symbol}</td>
                      <td className={trade.side === 'buy' ? 'text-green' : 'text-red'}>{trade.side?.toUpperCase()}</td>
                      <td>{trade.volume}</td>
                      <td className={trade.profit >= 0 ? 'text-green' : 'text-red'}>
                        {trade.profit >= 0 ? '+' : ''}{formatCurrency(Math.abs(trade.profit || 0), false)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="dashboard-tables">
        <div className="table-card">
          <h3>Recent Users</h3>
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Balance</th>
                <th>Status</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {recentUsers.length === 0 ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', color: '#888' }}>No users yet</td></tr>
              ) : (
                recentUsers.map((user, idx) => (
                  <tr key={idx}>
                    <td>#{user.oderId || user._id?.slice(-6)}</td>
                    <td>{user.name} {user.isDemo && <span style={{ fontSize: '10px', color: '#f59e0b' }}>(Demo)</span>}</td>
                    <td>{user.email}</td>
                    <td>{formatCurrency(user.wallet?.balance || 0, false)}</td>
                    <td>
                      <span className={`status-badge ${user.isActive === false ? 'blocked' : 'active'}`}>
                        {user.isActive === false ? 'Blocked' : 'Active'}
                      </span>
                    </td>
                    <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
