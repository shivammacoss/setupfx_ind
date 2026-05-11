export type AdminRole = "SUPER_ADMIN" | "ADMIN";

export interface AdminUser {
  id: string;
  user_code: string;
  email: string;
  full_name: string;
  role: AdminRole;
  last_login_at: string | null;
}

export interface AdminTokenPair {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
  admin: AdminUser;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  message?: string | null;
}
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
