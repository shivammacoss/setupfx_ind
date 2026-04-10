// Admin Configuration - Shared across all admin pages
import {
  LuLayoutDashboard,
  LuTv,
  LuUsers,
  LuTrendingUp,
  LuLandmark,
  LuShieldCheck,
  LuPalette,
  LuHandshake,
  LuCopy,
  LuGamepad2,
  LuTimer,
  LuShieldAlert,
  LuArrowLeftRight,
  LuChartBar,
  LuClock,
  LuChartPie,
  LuPlug,
  LuCalendarClock,
  LuFileChartColumn,
  LuBell,
  LuSettings,
  LuRadio,
} from 'react-icons/lu';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

// Map string icon keys to actual react-icons/lu components
export const ADMIN_ICON_MAP = {
  LuLayoutDashboard,
  LuTv,
  LuUsers,
  LuTrendingUp,
  LuLandmark,
  LuShieldCheck,
  LuPalette,
  LuHandshake,
  LuCopy,
  LuGamepad2,
  LuTimer,
  LuShieldAlert,
  LuArrowLeftRight,
  LuChartBar,
  LuClock,
  LuChartPie,
  LuPlug,
  LuCalendarClock,
  LuFileChartColumn,
  LuBell,
  LuSettings,
  LuRadio,
};

// Sidebar menu structure
export const sidebarMenu = [
  { id: 'dashboard',                  label: 'Dashboard',              icon: 'LuLayoutDashboard', path: '/admin' },
  { id: 'market-watch',               label: 'Market Watch',           icon: 'LuTv',              path: '/admin/market-watch' },
  { id: 'user-management',            label: 'User Management',        icon: 'LuUsers',           path: '/admin/users' },
  { id: 'trade-management',           label: 'Trade Management',       icon: 'LuTrendingUp',      path: '/admin/trades' },
  { id: 'bank-fund-management',       label: 'Bank & Fund Management', icon: 'LuLandmark',        path: '/admin/funds' },
  { id: 'admin-management',           label: 'Admin Management',       icon: 'LuShieldCheck',     path: '/admin/admins' },
  { id: 'brand-management',           label: 'Brand Management',       icon: 'LuPalette',         path: '/admin/brand' },
  { id: 'ib-management',              label: 'IB Management',          icon: 'LuHandshake',       path: '/admin/ib' },
  { id: 'copy-trade-management',      label: 'Copy Trade',             icon: 'LuCopy',            path: '/admin/copy-trade' },
  { id: 'demo-settings',              label: 'Demo Account Settings',  icon: 'LuGamepad2',        path: '/admin/demo-settings' },
  { id: 'binary-settings',            label: 'Binary Mode Settings',   icon: 'LuTimer',           path: '/admin/binary-settings' },
  { id: 'risk-management',            label: 'Risk Management',        icon: 'LuShieldAlert',     path: '/admin/risk-management' },
  { id: 'hedging-segment-management', label: 'Hedging Segments',       icon: 'LuArrowLeftRight',  path: '/admin/hedging-segments' },
  { id: 'netting-segment-management', label: 'Netting Segments',       icon: 'LuChartBar',       path: '/admin/netting-segments' },
  { id: 'reboorder-settings',         label: 'Reboorder Settings',     icon: 'LuClock',           path: '/admin/reboorder' },
  { id: 'pnl-sharing',                label: 'PnL Sharing',            icon: 'LuChartPie',        path: '/admin/pnl-sharing' },
  { id: 'zerodha-connect',            label: 'Zerodha Connect',        icon: 'LuPlug',            path: '/admin/zerodha' },
  { id: 'truedata-connect',           label: 'TrueData',               icon: 'LuRadio',           path: '/admin/truedata' },
  { id: 'market-control',             label: 'Market Control',         icon: 'LuCalendarClock',   path: '/admin/market-control' },
  { id: 'reports',                    label: 'Reports & Analytics',    icon: 'LuFileChartColumn',    path: '/admin/reports' },
  { id: 'notifications',              label: 'Notifications',          icon: 'LuBell',            path: '/admin/notifications' },
  { id: 'settings',                   label: 'Settings',               icon: 'LuSettings',        path: '/admin/settings' }
];

// Sub-tabs for each main section
export const sectionTabs = {
  'user-management': [
    { id: 'all-users', label: 'All Users', path: '' },
    { id: 'active-users', label: 'Active Users', path: 'active' },
    { id: 'blocked-users', label: 'Blocked Users', path: 'blocked' },
    { id: 'demo-users', label: 'Demo Users', path: 'demo' },
    { id: 'kyc-management', label: 'KYC Verification', path: 'kyc' },
    { id: 'user-logs', label: 'Activity Logs', path: 'logs' }
  ],
  'trade-management': [
    { id: 'combined', label: 'Combined Positions', path: '' },
    { id: 'open-positions', label: 'Open Positions', path: 'open' },
    { id: 'closed-positions', label: 'Closed Positions', path: 'closed' },
    { id: 'pending-orders', label: 'Pending Orders', path: 'pending' },
    { id: 'trade-history', label: 'Trade History', path: 'history' },
    { id: 'edited-trades', label: 'Edited Trades', path: 'edited' }
  ],
  'bank-fund-management': [
    { id: 'deposit-requests', label: 'Deposits', path: '' },
    { id: 'withdrawal-requests', label: 'Withdrawals', path: 'withdrawals' },
    { id: 'bank-accounts', label: 'Bank Accounts', path: 'banks' },
    { id: 'upi-management', label: 'UPI', path: 'upi' },
    { id: 'crypto-wallets', label: 'Crypto Wallets', path: 'crypto' },
    { id: 'transaction-history', label: 'History', path: 'history' }
  ],
    'admin-management': [
    { id: 'sub-admins', label: 'Sub-Admins', path: '' },
    { id: 'brokers', label: 'Brokers', path: 'brokers' },
    { id: 'hierarchy', label: 'Hierarchy View', path: 'hierarchy' },
    { id: 'fund-requests', label: 'Fund Requests', path: 'fund-requests' },
    { id: 'subadmin-logs', label: 'Sub-Admin Activity', path: 'subadmin-logs' },
    { id: 'broker-logs', label: 'Broker Activity', path: 'broker-logs' }
  ],
  'brand-management': [
    { id: 'banner-settings', label: 'Banners', path: '' }
  ],
  'ib-management': [
    { id: 'ib-applications', label: 'Applications', path: '' },
    { id: 'ib-active', label: 'Active IBs', path: 'active' },
    { id: 'ib-commissions', label: 'Commissions', path: 'commissions' },
    { id: 'ib-settings', label: 'Settings', path: 'settings' }
  ],
  'copy-trade-management': [
    { id: 'copy-applications', label: 'Applications', path: '' },
    { id: 'master-traders', label: 'All Masters', path: 'masters' },
    { id: 'copy-followers', label: 'Followers', path: 'followers' },
    { id: 'copy-settings', label: 'Settings', path: 'settings' }
  ],
  'hedging-segment-management': [
    { id: 'hedging-settings', label: 'Segment Settings', path: '' },
    { id: 'hedging-scripts', label: 'Script Settings', path: 'scripts' },
    { id: 'hedging-user-settings', label: 'User Settings', path: 'users' }
  ],
  'netting-segment-management': [
    { id: 'netting-settings', label: 'Segment Settings', path: '' },
    { id: 'netting-scripts', label: 'Script Settings', path: 'scripts' },
    { id: 'netting-user-settings', label: 'User Settings', path: 'users' },
    { id: 'netting-copy-settings', label: 'Copy Settings', path: 'copy' }
  ],
  'reports': [
    { id: 'financial-reports', label: 'Financial Reports', path: '' },
    { id: 'user-reports', label: 'User Reports', path: 'users' },
    { id: 'trade-reports', label: 'Trade Reports', path: 'trades' },
    { id: 'commission-reports', label: 'Commission Reports', path: 'commissions' },
    { id: 'broker-reports', label: 'Broker Reports', path: 'brokers' },
    { id: 'subadmin-reports', label: 'Sub-Admin Reports', path: 'subadmins' }
  ],
  'notifications': [
    { id: 'push-notifications', label: 'Push Notifications', path: '' },
    { id: 'email-templates', label: 'Email Templates', path: 'email' },
    { id: 'sms-settings', label: 'SMS Settings', path: 'sms' },
    { id: 'notification-logs', label: 'Logs', path: 'logs' }
  ],
  'settings': [
    { id: 'general-settings', label: 'General', path: '' },
    { id: 'admin-account', label: 'My account', path: 'account' }
  ]
};
