import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { LuChevronLeft, LuChevronRight, LuSun, LuMoon, LuArrowLeft, LuMenu, LuX, LuChevronDown, LuChevronUp } from 'react-icons/lu';
import AdminLogin from './AdminLogin';
import { sidebarMenu, sectionTabs, API_URL, ADMIN_ICON_MAP } from './adminConfig';
import '../../styles/themes.css';
import './Admin.css';

// Default exchange rate (USD to INR)
const DEFAULT_USD_INR_RATE = 83.5;

function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [adminAuth, setAdminAuth] = useState({ isAuthenticated: false, user: null, loading: true });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState([]);
  const [adminCurrency, setAdminCurrency] = useState(localStorage.getItem('SetupFX-admin-currency') || 'USD');
  const [usdInrRate, setUsdInrRate] = useState(DEFAULT_USD_INR_RATE);
  const [usdMarkup, setUsdMarkup] = useState(0);
  const [adminTheme, setAdminTheme] = useState(() => {
    const stored = localStorage.getItem('SetupFX-admin-theme');
    return stored === 'light' ? 'light' : 'dark';
  });

  const toggleAdminTheme = () => {
    setAdminTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('SetupFX-admin-theme', next);
      return next;
    });
  };

  // Fetch real exchange rate and markup (same as user side)
  useEffect(() => {
    // Get markup from localStorage (synced with currency settings)
    const currencySettings = JSON.parse(localStorage.getItem('SetupFX-currency-settings') || '{"usdMarkup":0}');
    setUsdMarkup(currencySettings.usdMarkup || 0);

    // Fetch real-time exchange rate
    const fetchUsdRate = async () => {
      try {
        const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
        const data = await response.json();
        if (data.rates && data.rates.INR) {
          setUsdInrRate(data.rates.INR);
        }
      } catch (error) {
        console.log('Using fallback USD rate');
      }
    };
    fetchUsdRate();
  }, []);

  // Total rate including markup (same as user side)
  const totalRate = usdInrRate + usdMarkup;

  // Currency formatting helper
  const formatAdminCurrency = (valueInUSD) => {
    const numValue = Number(valueInUSD || 0);
    if (adminCurrency === 'INR') {
      return `₹${(numValue * totalRate).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `$${numValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Toggle currency and persist preference
  const toggleAdminCurrency = (currency) => {
    setAdminCurrency(currency);
    localStorage.setItem('SetupFX-admin-currency', currency);
  };

  useEffect(() => {
    const onUserRefresh = (e) => {
      if (e?.detail) {
        setAdminAuth((prev) => (prev.isAuthenticated ? { ...prev, user: e.detail } : prev));
      }
    };
    window.addEventListener('SetupFX-admin-user-refreshed', onUserRefresh);
    return () => window.removeEventListener('SetupFX-admin-user-refreshed', onUserRefresh);
  }, []);

  // Check admin authentication on mount
  useEffect(() => {
    const checkAdminAuth = async () => {
      const adminToken = localStorage.getItem('SetupFX-admin-token');
      const adminUser = localStorage.getItem('SetupFX-admin-user');
      
      // SuperAdmin panel should only use JWT token (not admin- prefixed tokens)
      // SubAdmin/Broker tokens start with 'admin-', SuperAdmin tokens are JWT
      if (adminToken && !adminToken.startsWith('admin-') && adminUser) {
        try {
          const res = await fetch(`${API_URL}/api/auth/admin/verify`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
          });
          if (res.ok) {
            const data = await res.json();
            // Update localStorage with fresh user data including _id
            if (data.user) {
              localStorage.setItem('SetupFX-admin-user', JSON.stringify(data.user));
              setAdminAuth({ isAuthenticated: true, user: data.user, loading: false });
            } else {
              setAdminAuth({ isAuthenticated: true, user: JSON.parse(adminUser), loading: false });
            }
          } else {
            localStorage.removeItem('SetupFX-admin-token');
            localStorage.removeItem('SetupFX-admin-user');
            setAdminAuth({ isAuthenticated: false, user: null, loading: false });
          }
        } catch (error) {
          setAdminAuth({ isAuthenticated: true, user: JSON.parse(adminUser), loading: false });
        }
      } else {
        setAdminAuth({ isAuthenticated: false, user: null, loading: false });
      }
    };
    checkAdminAuth();
  }, []);

  const handleAdminLogin = (user, token) => {
    localStorage.setItem('SetupFX-admin-token', token);
    localStorage.setItem('SetupFX-admin-user', JSON.stringify(user));
    setAdminAuth({ isAuthenticated: true, user, loading: false });
    // Navigate to dashboard after login
    navigate('/admin');
  };

  const handleAdminLogout = () => {
    localStorage.removeItem('SetupFX-admin-token');
    localStorage.removeItem('SetupFX-admin-user');
    localStorage.removeItem('SetupFX-admin');
    setAdminAuth({ isAuthenticated: false, user: null, loading: false });
  };

  const toggleMenu = (menuId) => {
    setExpandedMenus(prev =>
      prev.includes(menuId)
        ? prev.filter(id => id !== menuId)
        : [...prev, menuId]
    );
  };

  // Get current active menu based on URL path
  const getActiveMenu = () => {
    const path = location.pathname;
    // Check exact matches first, then prefix matches (excluding dashboard base path)
    for (const menu of sidebarMenu) {
      if (path === menu.path) {
        return menu.id;
      }
    }
    // Check prefix matches for nested routes (but not for dashboard base path)
    for (const menu of sidebarMenu) {
      if (menu.id !== 'dashboard' && path.startsWith(menu.path + '/')) {
        return menu.id;
      }
    }
    return 'dashboard';
  };

  // Get page title based on current route
  const getPageTitle = () => {
    const path = location.pathname;
    for (const menu of sidebarMenu) {
      if (path === menu.path) return menu.label;
      if (path.startsWith(menu.path + '/')) {
        const subPath = path.replace(menu.path + '/', '');
        const tabs = sectionTabs[menu.id];
        if (tabs) {
          const tab = tabs.find(t => t.path === subPath);
          if (tab) return tab.label;
        }
        return menu.label;
      }
    }
    return 'Dashboard';
  };

  if (adminAuth.loading) {
    return (
      <div className="admin-theme-root" data-theme={adminTheme}>
        <div className="admin-loading">
          <div className="loading-spinner">Loading...</div>
        </div>
      </div>
    );
  }

  if (!adminAuth.isAuthenticated) {
    return (
      <div className="admin-theme-root" data-theme={adminTheme}>
        <AdminLogin
          onLogin={handleAdminLogin}
          adminTheme={adminTheme}
          onToggleTheme={toggleAdminTheme}
        />
      </div>
    );
  }

  const activeMenu = getActiveMenu();

  return (
    <div className="admin-theme-root" data-theme={adminTheme}>
    <div className="admin-container">
      {/* Sidebar */}
      <aside className={`admin-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
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
          {sidebarMenu.map(menu => {
            const hasSubItems = sectionTabs[menu.id];
            const isExpanded = expandedMenus.includes(menu.id);
            const isActive = activeMenu === menu.id;
            const IconComp = ADMIN_ICON_MAP[menu.icon];

            return (
              <div key={menu.id} className="sidebar-menu-item">
                <button
                  className={`sidebar-menu-btn ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    if (hasSubItems) {
                      toggleMenu(menu.id);
                      if (!isExpanded) {
                        navigate(menu.path);
                      }
                    } else {
                      navigate(menu.path);
                    }
                  }}
                >
                  <span className="menu-icon">{IconComp ? <IconComp size={18} /> : menu.icon}</span>
                  {!sidebarCollapsed && (
                    <>
                      <span className="menu-label">{menu.label}</span>
                      {hasSubItems && <span className="menu-arrow">{isExpanded ? <LuChevronDown size={14} /> : <LuChevronRight size={14} />}</span>}
                    </>
                  )}
                </button>
                
                {/* Submenu items */}
                {hasSubItems && isExpanded && !sidebarCollapsed && (
                  <div className="sidebar-submenu">
                    {sectionTabs[menu.id].map(subItem => {
                      const subPath = subItem.path ? `${menu.path}/${subItem.path}` : menu.path;
                      const isSubActive = location.pathname === subPath;
                      return (
                        <button
                          key={subItem.id}
                          className={`sidebar-submenu-btn ${isSubActive ? 'active' : ''}`}
                          onClick={() => navigate(subPath)}
                        >
                          {subItem.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <button className="back-to-app-btn" onClick={() => navigate('/app')}>
            {sidebarCollapsed ? <LuArrowLeft size={16} /> : <><LuArrowLeft size={14} /> Back to App</>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="admin-main">
        <header className="admin-header">
          <h1 className="admin-page-title">{getPageTitle()}</h1>
          <div className="admin-header-actions">
            <button
              type="button"
              className="admin-theme-toggle"
              onClick={toggleAdminTheme}
              title={adminTheme === 'dark' ? 'Light theme' : 'Dark theme'}
              aria-label={adminTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              {adminTheme === 'dark' ? <LuSun size={17} /> : <LuMoon size={17} />}
            </button>
            <div className="admin-currency-toggle">
              <button
                type="button"
                className={adminCurrency === 'USD' ? 'active usd' : ''}
                onClick={() => toggleAdminCurrency('USD')}
              >
                $ USD
              </button>
              <button
                type="button"
                className={adminCurrency === 'INR' ? 'active inr' : ''}
                onClick={() => toggleAdminCurrency('INR')}
              >
                ₹ INR
              </button>
            </div>
            <span className="admin-user">{adminAuth.user?.name || 'Admin'} ({adminAuth.user?.email})</span>
            <button className="admin-logout-btn" onClick={handleAdminLogout}>Logout</button>
          </div>
        </header>

        <div className="admin-content">
          <Outlet context={{ adminAuth, API_URL, adminCurrency, usdInrRate: totalRate, formatAdminCurrency }} />
        </div>
      </main>
    </div>
    </div>
  );
}

export default AdminLayout;
