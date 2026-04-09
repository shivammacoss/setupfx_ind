import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  LuUsers, LuTrendingUp, LuWallet, LuChartBar,
  LuUserCheck, LuUserX, LuHourglass, LuGamepad2,
  LuShieldCheck, LuHandshake, LuArrowDownToLine, LuClock4,
} from 'react-icons/lu';

/**
 * Single source of truth for stat-card accent colors. Each accent maps to:
 *   - bg:     icon-tile background tint (low-alpha)
 *   - border: icon-tile border (slightly stronger alpha)
 *   - fg:     icon stroke color
 * The card itself stays neutral (white / dark:#1e1e2e) so the dashboard
 * reads as a single coherent surface, not a rainbow.
 */
const ACCENTS = {
  blue:   { bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.32)', fg: '#3b82f6' },
  green:  { bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.32)', fg: '#10b981' },
  red:    { bg: 'rgba(239, 68, 68, 0.12)',  border: 'rgba(239, 68, 68, 0.32)',  fg: '#ef4444' },
  orange: { bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.32)', fg: '#f59e0b' },
  purple: { bg: 'rgba(139, 92, 246, 0.12)', border: 'rgba(139, 92, 246, 0.32)', fg: '#8b5cf6' },
  cyan:   { bg: 'rgba(6, 182, 212, 0.12)',  border: 'rgba(6, 182, 212, 0.32)',  fg: '#06b6d4' },
  pink:   { bg: 'rgba(236, 72, 153, 0.12)', border: 'rgba(236, 72, 153, 0.32)', fg: '#ec4899' },
  indigo: { bg: 'rgba(99, 102, 241, 0.12)', border: 'rgba(99, 102, 241, 0.32)', fg: '#6366f1' },
};

/** Auto-shrink font size based on text length */
function StatValue({ children }) {
  const text = String(children ?? '');
  const len = text.length;
  let fontSize = 22;
  if (len > 14) fontSize = 13;
  else if (len > 10) fontSize = 15;
  else if (len > 6) fontSize = 18;
  return <span className="admin-stat-tile-value" style={{ fontSize: `${fontSize}px` }}>{children}</span>;
}

function StatCard({ icon: IconComponent, label, value, accent = 'blue' }) {
  const c = ACCENTS[accent] || ACCENTS.blue;
  return (
    <div className="admin-stat-tile" style={{
      background: 'var(--bg-secondary, #fff)',
      borderRadius: '12px',
      padding: '14px 16px',
      border: 'none',
      boxShadow: 'none',
    }}>
      <div
        className="admin-stat-tile-icon"
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '10px',
          backgroundColor: c.bg,
          borderColor: c.border,
          color: c.fg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <IconComponent size={20} />
      </div>
      <div className="admin-stat-tile-info">
        <span className="admin-stat-tile-label">{label}</span>
        <StatValue>{value}</StatValue>
      </div>
    </div>
  );
}

function Dashboard() {
  const { API_URL, adminCurrency, usdInrRate, formatAdminCurrency } = useOutletContext();

  // Local currency formatter that handles INR values (deposits/withdrawals are stored in INR)
  const formatCurrency = (value, isAlreadyINR = true) => {
    const numValue = Number(value || 0);
    if (adminCurrency === 'INR') {
      if (isAlreadyINR) {
        return `₹${numValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
      return `₹${(numValue * usdInrRate).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
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

  const num = (n) => Number(n || 0).toLocaleString();

  return (
    <div className="admin-dashboard">
      {/* All 12 stat cards in one grid — single coherent surface, no gradients */}
      <div className="admin-stat-grid" style={{ gap: '10px' }}>
        <StatCard icon={LuUsers}            label="Total Users"          value={num(dashboardStats.totalUsers)}          accent="indigo" />
        <StatCard icon={LuTrendingUp}       label="Total Trades"         value={num(dashboardStats.totalTrades)}         accent="blue" />
        <StatCard icon={LuWallet}           label="Total Deposits"       value={formatCurrency(dashboardStats.totalDeposits)} accent="green" />
        <StatCard icon={LuChartBar}        label="Open Positions"       value={num(dashboardStats.openPositions)}       accent="cyan" />

        <StatCard icon={LuUserCheck}        label="Active Users"         value={num(dashboardStats.activeUsers)}         accent="green" />
        <StatCard icon={LuUserX}            label="Blocked Users"        value={num(dashboardStats.blockedUsers)}        accent="red" />
        <StatCard icon={LuHourglass}        label="Pending Deposits"     value={num(dashboardStats.pendingDeposits)}     accent="orange" />
        <StatCard icon={LuGamepad2}         label="Demo Users"           value={num(dashboardStats.demoUsers)}           accent="purple" />

        <StatCard icon={LuShieldCheck}      label="Sub-Admins"           value={num(dashboardStats.totalSubAdmins)}      accent="blue" />
        <StatCard icon={LuHandshake}        label="Brokers"              value={num(dashboardStats.totalBrokers)}        accent="cyan" />
        <StatCard icon={LuArrowDownToLine}  label="Total Withdrawals"    value={formatCurrency(dashboardStats.totalWithdrawals)} accent="pink" />
        <StatCard icon={LuClock4}           label="Pending Withdrawals"  value={num(dashboardStats.pendingWithdrawals)}  accent="orange" />
      </div>

      <div className="dashboard-charts">
        <div className="chart-card">
          <h3>Quick Stats</h3>
          <div className="quick-stats-list">
            <div className="quick-stats-row">
              <span className="quick-stats-label">Closed Trades</span>
              <span className="quick-stats-value">{num(dashboardStats.closedTrades)}</span>
            </div>
            <div className="quick-stats-row">
              <span className="quick-stats-label">Total Withdrawals</span>
              <span className="quick-stats-value">{formatCurrency(dashboardStats.totalWithdrawals)}</span>
            </div>
            <div className="quick-stats-row">
              <span className="quick-stats-label">Pending Withdrawals</span>
              <span className="quick-stats-value">{num(dashboardStats.pendingWithdrawals)}</span>
            </div>
          </div>
        </div>
        <div className="chart-card">
          <h3>Recent Trades</h3>
          {recentTrades.length === 0 ? (
            <p style={{ padding: '20px', color: 'var(--text-muted)' }}>No trades yet</p>
          ) : (
            <div style={{ maxHeight: '240px', overflow: 'auto' }}>
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
                <tr><td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No users yet</td></tr>
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
