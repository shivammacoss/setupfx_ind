export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "SetupFX Broker";
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";

export const ROUTES = {
  login: "/login",
  register: "/register",
  forgotPassword: "/forgot-password",
  twoFa: "/2fa",
  dashboard: "/dashboard",
  marketwatch: "/marketwatch",
  orders: "/orders",
  positions: "/positions",
  holdings: "/holdings",
  wallet: "/wallet",
  ledger: "/ledger",
  reportsPnl: "/reports/pnl",
  reportsTradebook: "/reports/tradebook",
  reportsBrokerage: "/reports/brokerage",
  reportsTax: "/reports/tax",
  reportsMargin: "/reports/margin",
  alerts: "/alerts",
  notifications: "/notifications",
  profile: "/profile",
  chart: (symbol: string) => `/chart/${symbol}`,
} as const;

export const STORAGE_KEYS = {
  accessToken: "nb.accessToken",
  refreshToken: "nb.refreshToken",
  user: "nb.user",
} as const;

export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN: "ADMIN",
  MASTER: "MASTER",
  DEALER: "DEALER",
  CLIENT: "CLIENT",
} as const;
