"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AdminAuthAPI, clearTokens, setTokens } from "@/lib/api";
import { STORAGE_KEYS } from "@/lib/constants";
import type { AdminTokenPair, AdminUser } from "@/types";

interface AdminAuthState {
  admin: AdminUser | null;
  hydrated: boolean;
  loading: boolean;
  setHydrated: (v: boolean) => void;
  setSession: (pair: AdminTokenPair) => void;
  login: (identifier: string, password: string, two_fa_code?: string) => Promise<AdminTokenPair>;
  logout: () => Promise<void>;
}

export const useAdminAuthStore = create<AdminAuthState>()(
  persist(
    (set, get) => ({
      admin: null,
      hydrated: false,
      loading: false,
      setHydrated: (v) => set({ hydrated: v }),
      setSession: (pair) => {
        setTokens(pair.access_token, pair.refresh_token);
        set({ admin: pair.admin });
      },
      login: async (identifier, password, two_fa_code) => {
        set({ loading: true });
        try {
          const pair = await AdminAuthAPI.login({ identifier, password, two_fa_code });
          get().setSession(pair);
          return pair;
        } finally {
          set({ loading: false });
        }
      },
      logout: async () => {
        try {
          const refresh =
            typeof window !== "undefined"
              ? window.localStorage.getItem(STORAGE_KEYS.refreshToken) ?? undefined
              : undefined;
          await AdminAuthAPI.logout(refresh);
        } catch {
          // ignore
        } finally {
          clearTokens();
          set({ admin: null });
        }
      },
    }),
    {
      name: "nb.admin.auth",
      storage: {
        getItem: (k) => {
          if (typeof window === "undefined") return null;
          const raw = window.localStorage.getItem(k);
          return raw ? JSON.parse(raw) : null;
        },
        setItem: (k, v) => {
          if (typeof window !== "undefined") window.localStorage.setItem(k, JSON.stringify(v));
        },
        removeItem: (k) => {
          if (typeof window !== "undefined") window.localStorage.removeItem(k);
        },
      },
      partialize: (s) => ({ admin: s.admin }) as AdminAuthState,
      onRehydrateStorage: () => (s) => s?.setHydrated(true),
    }
  )
);
