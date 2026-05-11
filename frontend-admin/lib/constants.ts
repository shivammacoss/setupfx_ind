export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "SetupFX Broker Admin";
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";
export const ADMIN_API_KEY = process.env.NEXT_PUBLIC_ADMIN_KEY ?? "";

export const STORAGE_KEYS = {
  accessToken: "nb.admin.accessToken",
  refreshToken: "nb.admin.refreshToken",
  user: "nb.admin.user",
} as const;

export const ADMIN_ROUTES = {
  login: "/login",
  dashboard: "/dashboard",
  users: "/users",
  segmentSettings: "/segment-settings/global",
  orders: "/orders",
  positions: "/positions",
  trades: "/trades",
  payinDeposits: "/payin-out/deposits",
  payinWithdrawals: "/payin-out/withdrawals",
  ledger: "/ledger",
  reports: "/reports/users",
  settingsPlatform: "/settings/platform",
  audit: "/audit",
  backup: "/backup",
} as const;
