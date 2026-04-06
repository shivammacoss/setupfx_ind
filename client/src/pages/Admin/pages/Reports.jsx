import { useState, useEffect } from 'react';
import { useOutletContext, useLocation } from 'react-router-dom';

function Reports() {
  const { API_URL, formatAdminCurrency } = useOutletContext();
  const location = useLocation();

  /** Report API amounts are treated as USD (wallet, commissions, aggregates); display follows admin header toggle. */
  const fmt = (usd) => formatAdminCurrency(usd);
  const fmtSigned = (usd) => {
    const n = Number(usd || 0);
    return `${n < 0 ? '-' : ''}${formatAdminCurrency(Math.abs(n))}`;
  };
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [expandedUser, setExpandedUser] = useState(null); // userId currently expanded
  const [userTrades, setUserTrades] = useState([]); // trades for expanded user
  const [loadingTrades, setLoadingTrades] = useState(false);

  const getActiveTab = () => {
    const path = location.pathname;
    if (path.includes('/users')) return 'user-reports';
    if (path.includes('/trades')) return 'trade-reports';
    if (path.includes('/commissions')) return 'commission-reports';
    if (path.includes('/brokers')) return 'broker-reports';
    if (path.includes('/subadmins')) return 'subadmin-reports';
    return 'financial-reports';
  };

  const activeTab = getActiveTab();

  const getTabTitle = () => {
    const titles = {
      'financial-reports': 'Financial Reports',
      'user-reports': 'User Reports',
      'trade-reports': 'Trade Reports',
      'commission-reports': 'Commission Reports',
      'broker-reports': 'Broker Analytics',
      'subadmin-reports': 'Sub-Admin Analytics'
    };
    return titles[activeTab] || 'Reports';
  };

  const fetchReport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateRange.from) params.set('from', dateRange.from);
      if (dateRange.to) params.set('to', dateRange.to);
      const tabToEndpoint = {
        'financial-reports': 'financial-reports',
        'user-reports': 'user-reports',
        'trade-reports': 'trade-reports',
        'commission-reports': 'commission-reports',
        'broker-reports': 'broker-reports',
        'subadmin-reports': 'subadmin-reports'
      };
      const endpoint = tabToEndpoint[activeTab] || activeTab;
      const res = await fetch(`${API_URL}/api/admin/reports/${endpoint}?${params}`);
      const data = await res.json();
      if (data.success) {
        setReportData(data.report);
      }
    } catch (error) {
      console.error('Error fetching report:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserTrades = async (userId) => {
    if (expandedUser === userId) {
      setExpandedUser(null);
      setUserTrades([]);
      return;
    }
    setExpandedUser(userId);
    setLoadingTrades(true);
    try {
      const params = new URLSearchParams();
      if (dateRange.from) params.set('from', dateRange.from);
      if (dateRange.to) params.set('to', dateRange.to);
      const res = await fetch(`${API_URL}/api/admin/reports/user-commission-trades/${userId}?${params}`);
      const data = await res.json();
      if (data.success) setUserTrades(data.trades);
      else setUserTrades([]);
    } catch {
      setUserTrades([]);
    } finally {
      setLoadingTrades(false);
    }
  };

  useEffect(() => {
    fetchReport();
    setExpandedUser(null);
    setUserTrades([]);
  }, [activeTab]);

  const setQuickRange = (days) => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    setDateRange({
      from: from.toISOString().split('T')[0],
      to: to.toISOString().split('T')[0]
    });
  };

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <h2>{getTabTitle()}</h2>
        <button className="admin-btn primary" onClick={fetchReport}>🔄 Refresh Report</button>
      </div>

      {/* Date Filters */}
      <div className="admin-filters-bar" style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 24 }}>
        <div className="admin-form-group" style={{ margin: 0 }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>From Date</label>
          <input type="date" value={dateRange.from} onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))} className="admin-input" />
        </div>
        <div className="admin-form-group" style={{ margin: 0 }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>To Date</label>
          <input type="date" value={dateRange.to} onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))} className="admin-input" />
        </div>
        <button onClick={fetchReport} className="admin-btn primary">Apply Filter</button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setQuickRange(7)} className="admin-btn small" style={{ background: 'var(--bg-primary)' }}>7 Days</button>
          <button onClick={() => setQuickRange(30)} className="admin-btn small" style={{ background: 'var(--bg-primary)' }}>30 Days</button>
          <button onClick={() => setQuickRange(90)} className="admin-btn small" style={{ background: 'var(--bg-primary)' }}>90 Days</button>
          <button onClick={() => setDateRange({ from: '', to: '' })} className="admin-btn small" style={{ background: 'var(--bg-primary)' }}>All Time</button>
        </div>
      </div>

      {loading ? (
        <div className="admin-loading">Generating report...</div>
      ) : (
        <>
          {/* Financial Reports */}
          {activeTab === 'financial-reports' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 20, marginBottom: 24 }}>
                <div style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Total Deposits</p>
                  <p style={{ fontSize: 32, fontWeight: 700, color: '#10b981', margin: '12px 0 8px' }}>{fmt(reportData?.totalDeposits)}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>{reportData?.depositCount || 0} transactions</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Total Withdrawals</p>
                  <p style={{ fontSize: 32, fontWeight: 700, color: '#ef4444', margin: '12px 0 8px' }}>{fmt(reportData?.totalWithdrawals)}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>{reportData?.withdrawalCount || 0} transactions</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Net Flow</p>
                  <p style={{ fontSize: 32, fontWeight: 700, color: (reportData?.totalRevenue || 0) >= 0 ? '#10b981' : '#ef4444', margin: '12px 0 8px' }}>
                    {fmtSigned(reportData?.totalRevenue)}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>Deposits - Withdrawals</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>User Net P/L</p>
                  <p style={{ fontSize: 32, fontWeight: 700, color: (reportData?.netPnL || 0) >= 0 ? '#10b981' : '#ef4444', margin: '12px 0 8px' }}>
                    {fmtSigned(reportData?.netPnL)}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>Closed trades P/L</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Total User Balances</p>
                  <p style={{ fontSize: 32, fontWeight: 700, color: '#3b82f6', margin: '12px 0 8px' }}>{fmt(reportData?.totalUserBalance)}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>All user wallets</p>
                </div>
              </div>
            </>
          )}

          {/* User Reports */}
          {activeTab === 'user-reports' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 20, marginBottom: 24 }}>
                <div style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Total Users</p>
                  <p style={{ fontSize: 32, fontWeight: 700, color: '#3b82f6', margin: '12px 0 0' }}>{reportData?.totalUsers || 0}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Active Users (30d)</p>
                  <p style={{ fontSize: 32, fontWeight: 700, color: '#10b981', margin: '12px 0 0' }}>{reportData?.activeUsers || 0}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>New Users (Period)</p>
                  <p style={{ fontSize: 32, fontWeight: 700, color: '#f59e0b', margin: '12px 0 0' }}>{reportData?.newUsers || 0}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>KYC Verified</p>
                  <p style={{ fontSize: 32, fontWeight: 700, color: '#8b5cf6', margin: '12px 0 0' }}>{reportData?.kycVerified || 0}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Blocked Users</p>
                  <p style={{ fontSize: 32, fontWeight: 700, color: '#ef4444', margin: '12px 0 0' }}>{reportData?.blockedUsers || 0}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Users with Balance</p>
                  <p style={{ fontSize: 32, fontWeight: 700, color: '#10b981', margin: '12px 0 0' }}>{reportData?.usersWithBalance || 0}</p>
                </div>
              </div>

              {/* Top Depositors */}
              {reportData?.topDepositors?.length > 0 && (
                <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 20, border: '1px solid var(--border)' }}>
                  <h4 style={{ marginTop: 0, marginBottom: 16 }}>Top Users by Balance</h4>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Order ID</th>
                        <th>Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.topDepositors.map((user, idx) => (
                        <tr key={user._id || idx}>
                          <td>{idx + 1}</td>
                          <td><strong>{user.name}</strong></td>
                          <td>{user.email}</td>
                          <td><code>{user.oderId}</code></td>
                          <td style={{ color: '#10b981', fontWeight: 600 }}>{fmt(user.wallet?.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* Trade Reports */}
          {activeTab === 'trade-reports' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 20, marginBottom: 24 }}>
                <div style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Total Trades</p>
                  <p style={{ fontSize: 32, fontWeight: 700, color: '#3b82f6', margin: '12px 0 0' }}>{reportData?.totalTrades || 0}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Open Trades</p>
                  <p style={{ fontSize: 32, fontWeight: 700, color: '#f59e0b', margin: '12px 0 0' }}>{reportData?.openTrades || 0}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Closed Trades</p>
                  <p style={{ fontSize: 32, fontWeight: 700, color: '#8b5cf6', margin: '12px 0 0' }}>{reportData?.closedTrades || 0}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Total Volume</p>
                  <p style={{ fontSize: 32, fontWeight: 700, color: '#3b82f6', margin: '12px 0 0' }}>{(reportData?.totalVolume || 0).toFixed(2)} lots</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Winning Trades</p>
                  <p style={{ fontSize: 32, fontWeight: 700, color: '#10b981', margin: '12px 0 0' }}>{reportData?.winningTrades || 0}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Losing Trades</p>
                  <p style={{ fontSize: 32, fontWeight: 700, color: '#ef4444', margin: '12px 0 0' }}>{reportData?.losingTrades || 0}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Win Rate</p>
                  <p style={{ fontSize: 32, fontWeight: 700, color: '#10b981', margin: '12px 0 0' }}>{reportData?.winRate || 0}%</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Total P/L</p>
                  <p style={{ fontSize: 32, fontWeight: 700, color: (reportData?.totalPnL || 0) >= 0 ? '#10b981' : '#ef4444', margin: '12px 0 0' }}>
                    {fmtSigned(reportData?.totalPnL)}
                  </p>
                </div>
              </div>

              {/* Trades by Mode */}
              {reportData?.byMode && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 24 }}>
                  <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 20, border: '1px solid var(--border)' }}>
                    <h4 style={{ marginTop: 0, marginBottom: 16 }}>Trades by Mode</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Hedging</span>
                        <span style={{ fontWeight: 600, color: '#3b82f6' }}>{reportData.byMode.hedging || 0}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Netting</span>
                        <span style={{ fontWeight: 600, color: '#10b981' }}>{reportData.byMode.netting || 0}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Binary</span>
                        <span style={{ fontWeight: 600, color: '#f59e0b' }}>{reportData.byMode.binary || 0}</span>
                      </div>
                    </div>
                  </div>

                  {/* Top Symbols */}
                  {reportData?.topSymbols?.length > 0 && (
                    <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 20, border: '1px solid var(--border)' }}>
                      <h4 style={{ marginTop: 0, marginBottom: 16 }}>Top Symbols</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {reportData.topSymbols.slice(0, 5).map((sym, idx) => (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                            <span style={{ fontWeight: 600 }}>{sym.symbol}</span>
                            <div style={{ textAlign: 'right' }}>
                              <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{sym.count} trades</span>
                              <span style={{ marginLeft: 12, color: sym.pnl >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>{fmtSigned(sym.pnl)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Commission Reports */}
          {activeTab === 'commission-reports' && (
            <>
              {/* Platform Earnings */}
              <div style={{ marginBottom: 8 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px' }}>Platform Earnings (from Trades)</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20, marginBottom: 24 }}>
                <div style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Total Commission</p>
                  <p style={{ fontSize: 32, fontWeight: 700, color: '#10b981', margin: '12px 0 8px' }}>{fmt(reportData?.totalCommission)}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>{reportData?.tradeCount || 0} trades</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Total Swap</p>
                  <p style={{ fontSize: 32, fontWeight: 700, color: '#3b82f6', margin: '12px 0 0' }}>{fmt(reportData?.totalSwap)}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Total Revenue</p>
                  <p style={{ fontSize: 32, fontWeight: 700, color: '#8b5cf6', margin: '12px 0 0' }}>{fmt(reportData?.totalRevenue)}</p>
                </div>
              </div>

              {/* By Mode */}
              {reportData?.byMode && Object.keys(reportData.byMode).length > 0 && (
                <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 20, border: '1px solid var(--border)', marginBottom: 20 }}>
                  <h4 style={{ marginTop: 0, marginBottom: 16 }}>Commission by Mode</h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                    {Object.entries(reportData.byMode).map(([mode, data]) => (
                      <div key={mode} style={{ background: 'var(--bg-primary)', padding: 16, borderRadius: 8, minWidth: 180 }}>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'capitalize', fontWeight: 600 }}>{mode}</span>
                        <p style={{ fontSize: 18, fontWeight: 700, color: '#10b981', margin: '8px 0 2px' }}>{fmt(data.commission)} <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 400 }}>comm</span></p>
                        <p style={{ fontSize: 14, color: '#3b82f6', margin: 0 }}>{fmt(data.swap)} <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>swap</span></p>
                        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0' }}>{data.count} trades</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* IB Commission Payouts */}
              <div style={{ marginBottom: 8, marginTop: 8 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px' }}>IB Commission Payouts (owed to IBs)</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20, marginBottom: 24 }}>
                <div style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Total IB Payout</p>
                  <p style={{ fontSize: 32, fontWeight: 700, color: '#f59e0b', margin: '12px 0 0' }}>{fmt(reportData?.ibTotal)}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Pending</p>
                  <p style={{ fontSize: 32, fontWeight: 700, color: '#ef4444', margin: '12px 0 0' }}>{fmt(reportData?.ibPending)}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Credited</p>
                  <p style={{ fontSize: 32, fontWeight: 700, color: '#10b981', margin: '12px 0 0' }}>{fmt(reportData?.ibCredited)}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Paid Out</p>
                  <p style={{ fontSize: 32, fontWeight: 700, color: '#8b5cf6', margin: '12px 0 0' }}>{fmt(reportData?.ibPaid)}</p>
                </div>
              </div>

              {/* Top Users by Commission */}
              {reportData?.topUsers?.length > 0 && (
                <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 20, border: '1px solid var(--border)' }}>
                  <h4 style={{ marginTop: 0, marginBottom: 16 }}>Top Users by Commission Paid</h4>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>User ID</th>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Trades</th>
                        <th>Commission</th>
                        <th>Swap</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.topUsers.map((u, idx) => (
                        <tr key={idx} onClick={() => fetchUserTrades(u.oderId)} style={{ cursor: 'pointer' }} title="Click to view trade details">
                          <td>{idx + 1}</td>
                          <td><code style={{ color: '#3b82f6' }}>{u.oderId}</code></td>
                          <td><strong>{u.name}</strong></td>
                          <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{u.email}</td>
                          <td>{u.tradeCount}</td>
                          <td style={{ color: '#10b981', fontWeight: 600 }}>{fmt(u.totalCommission)}</td>
                          <td style={{ color: '#3b82f6', fontWeight: 600 }}>{fmt(u.totalSwap)}</td>
                          <td style={{ color: '#8b5cf6', fontWeight: 700 }}>{fmt(u.totalCommission + u.totalSwap)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Expanded User Trade Details */}
                  {expandedUser && (
                    <div style={{ marginTop: 16, background: 'var(--bg-primary)', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-tertiary, var(--bg-secondary))' }}>
                        <h4 style={{ margin: 0, fontSize: 14 }}>
                          Trade Details for <code style={{ color: '#3b82f6' }}>{expandedUser}</code>
                          {' '}({userTrades.length} trades with commission/swap)
                        </h4>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          {userTrades.length > 0 && <button onClick={() => {
                            const hdr = ['Date','Symbol','Mode','Type','Side','Size','Entry','Close','P/L','Commission','Swap','Closed By'];
                            const rows = userTrades.map(t => [
                              new Date(t.executedAt || t.createdAt).toLocaleString(), t.symbol, t.mode, t.type, t.side,
                              t.volume || t.quantity || (t.amount != null ? fmt(t.amount) : ''), t.entryPrice ?? '', t.closePrice ?? '',
                              fmtSigned(t.profit), fmt(t.commission), fmt(t.swap), t.remark || t.closedBy || ''
                            ]);
                            const tot = ['','','','','','','','Totals:', fmtSigned(userTrades.reduce((s,t)=>s+(t.profit||0),0)),
                              fmt(userTrades.reduce((s,t)=>s+(t.commission||0),0)), fmt(userTrades.reduce((s,t)=>s+(t.swap||0),0)), ''];
                            const csv = [hdr,...rows,tot].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
                            const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
                            a.download = `commission_${expandedUser}_${new Date().toISOString().slice(0,10)}.csv`; a.click();
                          }} style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Download CSV</button>}
                          <button onClick={() => { setExpandedUser(null); setUserTrades([]); }} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 18 }}>✕</button>
                        </div>
                      </div>
                      {loadingTrades ? (
                        <p style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>Loading trades...</p>
                      ) : userTrades.length === 0 ? (
                        <p style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)' }}>No trades found</p>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table className="admin-table" style={{ margin: 0 }}>
                            <thead>
                              <tr>
                                <th>Date</th>
                                <th>Symbol</th>
                                <th>Mode</th>
                                <th>Type</th>
                                <th>Side</th>
                                <th>Size</th>
                                <th>Entry</th>
                                <th>Close</th>
                                <th>P/L</th>
                                <th>Commission</th>
                                <th>Swap</th>
                                <th>Closed By</th>
                              </tr>
                            </thead>
                            <tbody>
                              {userTrades.map((t, i) => (
                                <tr key={t.tradeId || i}>
                                  <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{new Date(t.executedAt || t.createdAt).toLocaleString()}</td>
                                  <td><strong>{t.symbol}</strong></td>
                                  <td style={{ textTransform: 'capitalize', fontSize: 12 }}>{t.mode}</td>
                                  <td style={{ textTransform: 'capitalize', fontSize: 12 }}>{t.type}</td>
                                  <td style={{ color: t.side === 'buy' || t.side === 'up' ? '#10b981' : '#ef4444', fontWeight: 600, textTransform: 'uppercase' }}>{t.side}</td>
                                  <td>{t.volume || t.quantity || (t.amount != null ? fmt(t.amount) : '-')}</td>
                                  <td>{t.entryPrice?.toFixed(t.entryPrice < 10 ? 4 : 2) || '-'}</td>
                                  <td>{t.closePrice?.toFixed(t.closePrice < 10 ? 4 : 2) || '-'}</td>
                                  <td style={{ color: (t.profit || 0) >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                                    {fmtSigned(t.profit)}
                                  </td>
                                  <td style={{ color: '#f59e0b', fontWeight: 600 }}>{fmt(t.commission)}</td>
                                  <td style={{ color: '#3b82f6', fontWeight: 600 }}>{fmt(t.swap)}</td>
                                  <td style={{ fontSize: 12, textTransform: 'capitalize', color: 'var(--text-secondary)' }}>{t.remark || t.closedBy || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                                <td colSpan="8" style={{ textAlign: 'right' }}>Totals:</td>
                                <td style={{ color: userTrades.reduce((s, t) => s + (t.profit || 0), 0) >= 0 ? '#10b981' : '#ef4444' }}>
                                  {fmtSigned(userTrades.reduce((s, t) => s + (t.profit || 0), 0))}
                                </td>
                                <td style={{ color: '#f59e0b' }}>{fmt(userTrades.reduce((s, t) => s + (t.commission || 0), 0))}</td>
                                <td style={{ color: '#3b82f6' }}>{fmt(userTrades.reduce((s, t) => s + (t.swap || 0), 0))}</td>
                                <td></td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          {/* Broker Reports */}
          {activeTab === 'broker-reports' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20, marginBottom: 24 }}>
                <div style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Total Brokers</p>
                  <p style={{ fontSize: 32, fontWeight: 700, color: '#3b82f6', margin: '12px 0 0' }}>{reportData?.totalBrokers || 0}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Active Brokers</p>
                  <p style={{ fontSize: 32, fontWeight: 700, color: '#10b981', margin: '12px 0 0' }}>{reportData?.activeBrokers || 0}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Total Users</p>
                  <p style={{ fontSize: 32, fontWeight: 700, color: '#8b5cf6', margin: '12px 0 0' }}>{reportData?.totalUsers || 0}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Total User Balance</p>
                  <p style={{ fontSize: 32, fontWeight: 700, color: '#10b981', margin: '12px 0 0' }}>{fmt(reportData?.totalBalance)}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Total Deposits</p>
                  <p style={{ fontSize: 32, fontWeight: 700, color: '#f59e0b', margin: '12px 0 0' }}>{fmt(reportData?.totalDeposits)}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Total Trades</p>
                  <p style={{ fontSize: 32, fontWeight: 700, color: '#3b82f6', margin: '12px 0 0' }}>{reportData?.totalTrades || 0}</p>
                </div>
              </div>

              {reportData?.brokerList?.length > 0 && (
                <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 20, border: '1px solid var(--border)' }}>
                  <h4 style={{ marginTop: 0, marginBottom: 16 }}>Broker-wise Breakdown</h4>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Broker ID</th>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Status</th>
                        <th>Users</th>
                        <th>Total Balance</th>
                        <th>Total Deposits</th>
                        <th>Trades</th>
                        <th>P/L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.brokerList.map((broker, idx) => (
                        <tr key={broker._id || idx}>
                          <td>{idx + 1}</td>
                          <td><code>{broker.oderId}</code></td>
                          <td><strong>{broker.name}</strong></td>
                          <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{broker.email}</td>
                          <td>
                            <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                              background: broker.isActive ? '#10b98120' : '#ef444420',
                              color: broker.isActive ? '#10b981' : '#ef4444' }}>
                              {broker.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td style={{ fontWeight: 600 }}>{broker.userCount}</td>
                          <td style={{ color: '#10b981', fontWeight: 600 }}>{fmt(broker.totalBalance)}</td>
                          <td style={{ color: '#f59e0b', fontWeight: 600 }}>{fmt(broker.totalDeposits)}</td>
                          <td>{broker.tradeCount}</td>
                          <td style={{ color: broker.totalPnL >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                            {fmtSigned(broker.totalPnL)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {(!reportData?.brokerList || reportData.brokerList.length === 0) && !loading && (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>No brokers found.</div>
              )}
            </>
          )}

          {/* Sub-Admin Reports */}
          {activeTab === 'subadmin-reports' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20, marginBottom: 24 }}>
                <div style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Total Sub-Admins</p>
                  <p style={{ fontSize: 32, fontWeight: 700, color: '#3b82f6', margin: '12px 0 0' }}>{reportData?.totalSubAdmins || 0}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Active Sub-Admins</p>
                  <p style={{ fontSize: 32, fontWeight: 700, color: '#10b981', margin: '12px 0 0' }}>{reportData?.activeSubAdmins || 0}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Total Brokers</p>
                  <p style={{ fontSize: 32, fontWeight: 700, color: '#8b5cf6', margin: '12px 0 0' }}>{reportData?.totalBrokers || 0}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Total Users</p>
                  <p style={{ fontSize: 32, fontWeight: 700, color: '#f59e0b', margin: '12px 0 0' }}>{reportData?.totalUsers || 0}</p>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Total User Balance</p>
                  <p style={{ fontSize: 32, fontWeight: 700, color: '#10b981', margin: '12px 0 0' }}>{fmt(reportData?.totalBalance)}</p>
                </div>
              </div>

              {reportData?.subAdminList?.length > 0 && (
                <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 20, border: '1px solid var(--border)' }}>
                  <h4 style={{ marginTop: 0, marginBottom: 16 }}>Sub-Admin Breakdown</h4>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>ID</th>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Status</th>
                        <th>Brokers</th>
                        <th>Users</th>
                        <th>Total Balance</th>
                        <th>Total Deposits</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.subAdminList.map((sa, idx) => (
                        <tr key={sa._id || idx}>
                          <td>{idx + 1}</td>
                          <td><code>{sa.oderId}</code></td>
                          <td><strong>{sa.name}</strong></td>
                          <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{sa.email}</td>
                          <td>
                            <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                              background: sa.isActive ? '#10b98120' : '#ef444420',
                              color: sa.isActive ? '#10b981' : '#ef4444' }}>
                              {sa.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td style={{ fontWeight: 600 }}>{sa.brokerCount}</td>
                          <td style={{ fontWeight: 600 }}>{sa.userCount}</td>
                          <td style={{ color: '#10b981', fontWeight: 600 }}>{fmt(sa.totalBalance)}</td>
                          <td style={{ color: '#f59e0b', fontWeight: 600 }}>{fmt(sa.totalDeposits)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {(!reportData?.subAdminList || reportData.subAdminList.length === 0) && !loading && (
                <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>No sub-admins found.</div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

export default Reports;
