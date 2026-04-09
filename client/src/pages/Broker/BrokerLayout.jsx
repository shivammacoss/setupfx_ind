import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import {
  LuLayoutDashboard, LuTv, LuUsers, LuTrendingUp, LuWallet,
  LuDollarSign, LuLandmark, LuCreditCard, LuSettings,
  LuChevronLeft, LuChevronRight, LuSun, LuMoon, LuArrowLeft,
  LuMenu, LuX,
} from 'react-icons/lu';
import '../../styles/themes.css';
import '../Admin/Admin.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Map string keys to react-icons components for the broker sidebar
const BROKER_ICON_MAP = {
  LuLayoutDashboard,
  LuTv,
  LuUsers,
  LuTrendingUp,
  LuWallet,
  LuDollarSign,
  LuLandmark,
  LuCreditCard,
  LuSettings,
};

// Limited sidebar for Broker
const brokerSidebarMenu = [
  { id: 'dashboard', label: 'Dashboard', icon: 'LuLayoutDashboard', path: '/broker-panel' },
  { id: 'market-watch', label: 'Market Watch', icon: 'LuTv', path: '/broker-panel/market-watch' },
  { id: 'users', label: 'User Management', icon: 'LuUsers', path: '/broker-panel/users' },
  { id: 'trades', label: 'Trade Management', icon: 'LuTrendingUp', path: '/broker-panel/trades' },
  { id: 'funds', label: 'Fund Management', icon: 'LuWallet', path: '/broker-panel/funds' },
  { id: 'pnl-sharing', label: 'PnL Sharing', icon: 'LuDollarSign', path: '/broker-panel/pnl-sharing' },
  { id: 'bank-management', label: 'Bank & Payment', icon: 'LuLandmark', path: '/broker-panel/bank-management' },
  { id: 'wallet', label: 'My Wallet', icon: 'LuCreditCard', path: '/broker-panel/wallet' },
  { id: 'settings', label: 'Settings', icon: 'LuSettings', path: '/broker-panel/settings' },
];

function BrokerLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [adminAuth, setAdminAuth] = useState({ isAuthenticated: false, user: null, loading: true });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const checkAuth = () => {
      // Check for impersonate parameter (Login As feature from admin panel)
      const urlParams = new URLSearchParams(window.location.search);
      const impersonateData = urlParams.get('impersonate');
      
      if (impersonateData) {
        try {
          const sessionData = JSON.parse(atob(impersonateData));
          if (sessionData.admin && sessionData.admin.role === 'broker') {
            // Store SetupFX impersonated session in sessionStorage (tab-specific, won't affect other tabs)
            sessionStorage.setItem('SetupFX-impersonate-token', sessionData.token);
            sessionStorage.setItem('SetupFX-impersonate-admin', JSON.stringify(sessionData.admin));
            // Remove impersonate param from URL
            window.history.replaceState({}, '', window.location.pathname);
            setAdminAuth({ isAuthenticated: true, user: sessionData.admin, loading: false });
            return;
          }
        } catch (e) {
          console.error('Invalid impersonate data:', e);
        }
      }
      
      // Check sessionStorage first for impersonated session (tab-specific)
      const impersonateAdmin = sessionStorage.getItem('SetupFX-impersonate-admin');
      const impersonateToken = sessionStorage.getItem('SetupFX-impersonate-token');
      if (impersonateAdmin && impersonateToken) {
        try {
          const parsedAdmin = JSON.parse(impersonateAdmin);
          if (parsedAdmin && parsedAdmin.role === 'broker') {
            setAdminAuth({ isAuthenticated: true, user: parsedAdmin, loading: false });
            return;
          }
        } catch (e) {
          // Invalid data
        }
      }
      
      // Fall back to localStorage for normal login
      const adminData = localStorage.getItem('SetupFX-admin');
      const adminToken = localStorage.getItem('SetupFX-admin-token');
      
      if (adminData && adminToken?.startsWith('admin-')) {
        try {
          const parsedAdmin = JSON.parse(adminData);
          if (parsedAdmin && parsedAdmin.role === 'broker') {
            setAdminAuth({ isAuthenticated: true, user: parsedAdmin, loading: false });
            return;
          }
        } catch (e) {
          // Invalid data
        }
      }
      
      // Not authenticated as broker, redirect to login
      setAdminAuth({ isAuthenticated: false, user: null, loading: false });
    };
    checkAuth();
  }, []);

  const handleLogout = async () => {
    // Call logout API to log the activity with session duration
    try {
      const adminData = JSON.parse(localStorage.getItem('SetupFX-admin') || '{}');
      if (adminData._id) {
        await fetch(`${API_URL}/api/admin/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adminId: adminData._id, sessionId: adminData.sessionId })
        });
      }
    } catch (error) {
      console.error('Logout API error:', error);
    }
    
    localStorage.removeItem('SetupFX-admin-token');
    localStorage.removeItem('SetupFX-admin-user');
    localStorage.removeItem('SetupFX-admin');
    navigate('/broker');
  };

  const getActiveMenu = () => {
    const path = location.pathname;
    // Check exact matches first, then prefix matches (excluding dashboard base path)
    for (const menu of brokerSidebarMenu) {
      if (path === menu.path) {
        return menu.id;
      }
    }
    // Check prefix matches for nested routes (but not for dashboard base path)
    for (const menu of brokerSidebarMenu) {
      if (menu.id !== 'dashboard' && path.startsWith(menu.path + '/')) {
        return menu.id;
      }
    }
    return 'dashboard';
  };

  const getPageTitle = () => {
    const path = location.pathname;
    for (const menu of brokerSidebarMenu) {
      if (path === menu.path || path.startsWith(menu.path + '/')) {
        return menu.label;
      }
    }
    return 'Dashboard';
  };

  if (adminAuth.loading) {
    return (
      <div className="admin-loading">
        <div className="loading-spinner">Loading...</div>
      </div>
    );
  }

  if (!adminAuth.isAuthenticated) {
    navigate('/broker');
    return null;
  }

  const activeMenu = getActiveMenu();

  return (
    <div className="admin-container">
      {/* Mobile Menu Overlay */}
      <div 
        className={`sidebar-overlay ${mobileMenuOpen ? 'visible' : ''}`} 
        onClick={() => setMobileMenuOpen(false)}
      />
      
      {/* Mobile Menu Toggle Button */}
      <button 
        className="mobile-menu-toggle"
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
      >
        {mobileMenuOpen ? <LuX size={20} /> : <LuMenu size={20} />}
      </button>
      
      {/* Sidebar */}
      <aside className={`admin-sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          {sidebarCollapsed ? (
            <span className="sidebar-logo">S4x</span>
          ) : (
            <img src="/landing/img/logo1.png" alt="SetupFX" className="sidebar-logo-img" style={{ height: '28px', width: 'auto' }} />
          )}
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            {sidebarCollapsed ? <LuChevronRight size={16} /> : <LuChevronLeft size={16} />}
          </button>
        </div>

        <nav className="sidebar-nav">
          {brokerSidebarMenu.map(menu => {
            const isActive = activeMenu === menu.id;
            const IconComp = BROKER_ICON_MAP[menu.icon];

            return (
              <div key={menu.id} className="sidebar-menu-item">
                <button
                  className={`sidebar-menu-btn ${isActive ? 'active' : ''}`}
                  onClick={() => { navigate(menu.path); setMobileMenuOpen(false); }}
                >
                  <span className="menu-icon">{IconComp ? <IconComp size={18} /> : menu.icon}</span>
                  {!sidebarCollapsed && (
                    <span className="menu-label">{menu.label}</span>
                  )}
                </button>
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <button className="back-to-app-btn" onClick={() => navigate('/')}>
            {sidebarCollapsed ? <LuArrowLeft size={16} /> : <><LuArrowLeft size={14} /> Back to App</>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="admin-main">
        <header className="admin-header">
          <h1 className="admin-page-title">{getPageTitle()}</h1>
          <div className="admin-header-actions">
            <span className="admin-user">{adminAuth.user?.name || 'Broker'} ({adminAuth.user?.oderId})</span>
            <button className="admin-logout-btn" onClick={handleLogout}>Logout</button>
          </div>
        </header>

        <div className="admin-content">
          <Outlet context={{ adminAuth, API_URL, adminId: adminAuth.user?._id, adminOderId: adminAuth.user?.oderId }} />
        </div>
      </main>
    </div>
  );
}

export default BrokerLayout;
