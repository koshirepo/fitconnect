import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User, TenantMembershipSummary } from "@/types/api";
import { authApi } from "@/api/auth";

interface AuthState {
  // State
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  currentTenantId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Derived getters as functions
  currentMembership: () => TenantMembershipSummary | undefined;
  isSuperAdmin: () => boolean;
  isSupport: () => boolean;
  isPlatformStaff: () => boolean;
  tenantRole: () => string | undefined;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  fetchMe: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // ─── Initial State ────────────────────────────────────────────────────────
      user: null,
      accessToken: null,
      refreshToken: null,
      currentTenantId: null,
      isAuthenticated: false,
      isLoading: false,

      // ─── Derived ──────────────────────────────────────────────────────────────

      currentMembership: () => {
        return get().user?.membership;
      },

      isSuperAdmin: () => get().user?.platformRole === "SUPER_ADMIN",
      isSupport: () => get().user?.platformRole === "SUPPORT",
      isPlatformStaff: () => {
        const role = get().user?.platformRole;
        return role === "SUPER_ADMIN" || role === "SUPPORT";
      },
      tenantRole: () => get().currentMembership()?.role,

      // ─── Actions ──────────────────────────────────────────────────────────────

      login: async (email: string, password: string) => {
        set({ isLoading: true });
        try {
          const { data: resp } = await authApi.login(email, password);
          const { accessToken, refreshToken, user } = resp.data;

          set({
            user,
            accessToken,
            refreshToken,
            currentTenantId: user.membership?.tenantId ?? null,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (err) {
          set({ isLoading: false });
          throw err;
        }
      },

      logout: () => {
        const { refreshToken: rt } = get();
        if (rt) {
          authApi.logout(rt).catch(() => {});
        }
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          currentTenantId: null,
          isAuthenticated: false,
        });
      },

      setTokens: (accessToken: string, refreshToken: string) => {
        set({ accessToken, refreshToken });
      },

      fetchMe: async () => {
        try {
          const { data: resp } = await authApi.me();
          const user = resp.data.user;

          set({
            user,
            currentTenantId: user.membership?.tenantId ?? null,
          });
        } catch {
          get().logout();
        }
      },
    }),
    {
      name: "gms-auth",
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        currentTenantId: state.currentTenantId,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
