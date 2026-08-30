import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isAxiosError } from "axios";
import { signInWithPasskey } from "@/api/passkeys";
import type { User, TenantMembershipSummary } from "@/types/api";
import { authApi } from "@/api/auth";
import { resolveClientPermissions, type Permission } from "@/lib/permissions";
import type { PlatformRole, TenantRole } from "@fitconnect/shared/types/enums";

interface AuthState {
  // State
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  currentTenantId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
      // Derived helpers
  currentMembership: () => TenantMembershipSummary | undefined;
  isSuperAdmin: () => boolean;
  isSupport: () => boolean;
  isPlatformStaff: () => boolean;
  tenantRole: () => string | undefined;
  /** Effective capability set for the signed-in user. */
  permissions: () => ReadonlySet<Permission>;
  /** True when the user holds this capability. */
  can: (permission: Permission) => boolean;
  /** True when the user holds at least one of these capabilities. */
  canAny: (...permissions: Permission[]) => boolean;
  /** True when the user holds every one of these capabilities. */
  canAll: (...permissions: Permission[]) => boolean;
      // Actions
  login: (email: string, password: string) => Promise<void>;
  /**
   * Sign in with a passkey.
   *
   * Takes the session the API already issued rather than credentials, because
   * the credential half happened inside a native dialog this store never sees.
   * Everything after that point is identical to a password sign-in.
   */
  loginWithPasskey: () => Promise<void>;
  logout: () => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  fetchMe: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      accessToken: null,
      refreshToken: null,
      currentTenantId: null,
      isAuthenticated: false,
      isLoading: false,
      // Derived helpers

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

      permissions: () => {
        const user = get().user;
        return resolveClientPermissions({
          platformRole: (user?.platformRole as PlatformRole | undefined) ?? null,
          tenantRole: (user?.membership?.role as TenantRole | undefined) ?? null,
          serverPermissions: user?.permissions ?? null,
        });
      },

      can: (permission) => get().permissions().has(permission),
      canAny: (...permissions) => {
        const granted = get().permissions();
        return permissions.some((permission) => granted.has(permission));
      },
      canAll: (...permissions) => {
        const granted = get().permissions();
        return permissions.every((permission) => granted.has(permission));
      },
      // Actions

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

      loginWithPasskey: async () => {
        set({ isLoading: true });
        try {
          const { accessToken, refreshToken, user } = await signInWithPasskey();

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

      /**
       * Adopt a session issued somewhere other than the login form.
       *
       * Self-signup is the one that matters: the API hands back a session for
       * the account it just created so the new member ends up inside the app
       * rather than at a sign-in page. Storing the tokens without setting
       * `isAuthenticated` left them holding a valid session the app did not
       * believe in — every guard read the flag, so the member was bounced
       * back out to log in with a password they had never chosen.
       */
      setTokens: (accessToken: string, refreshToken: string) => {
        set({ accessToken, refreshToken, isAuthenticated: true });
      },

      fetchMe: async () => {
        try {
          const { data: resp } = await authApi.me();
          const user = resp.data.user;

          set({
            user,
            currentTenantId: user.membership?.tenantId ?? null,
            // A `me` that answers proves the session is real. Set here too
            // so a token adopted from elsewhere is confirmed rather than
            // merely assumed.
            isAuthenticated: true,
          });
        } catch (error) {
          // Only the server saying no ends the session. A timeout or a dead
          // connection says nothing about whether the session is still good,
          // and signing someone out over gym wifi — which this ran on every
          // app start — loses whatever they were in the middle of.
          const status = isAxiosError(error) ? error.response?.status : undefined;
          if (status === 401 || status === 403) get().logout();
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
