import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isAxiosError } from "axios";
import { signInWithPasskey } from "@/api/passkeys";
import type { User, TenantMembershipSummary } from "@/types/api";
import { authApi } from "@/api/auth";
import { resolveClientPermissions, type Permission } from "@/lib/permissions";
import {
  clearSharedSession,
  readSharedSession,
  writeSharedSession,
} from "@/lib/session-cookie";
import type { PlatformRole, TenantRole } from "@fitconnect/shared/types/enums";

/**
 * Whether the shared cookie has ever been written successfully on this origin.
 *
 * It is what lets a missing cookie be read correctly. Gone after it worked
 * means somebody signed out on another host; never having worked at all — a
 * browser refusing the write, storage turned off — must not be mistaken for
 * that, or every reload would sign the user out.
 */
const SHARED_FLAG = "gms-session-shared";

function markShared(shared: boolean) {
  try {
    if (shared) window.localStorage.setItem(SHARED_FLAG, "1");
    else window.localStorage.removeItem(SHARED_FLAG);
  } catch {
    // Storage refused. Nothing to remember, and nothing worth failing over.
  }
}

function wasShared() {
  try {
    return window.localStorage.getItem(SHARED_FLAG) === "1";
  } catch {
    return false;
  }
}

/** Publish the session for the other hosts, recording whether it landed. */
function shareSession(refreshToken: string, tenantId: string | null) {
  markShared(writeSharedSession({ refreshToken, tenantId }));
}

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

          // And where the app's other hosts can see it, so a member signing in
          // on a gym address is signed in on the platform's pages too.
          shareSession(refreshToken, user.membership?.tenantId ?? null);
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

          shareSession(refreshToken, user.membership?.tenantId ?? null);
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

        // Ends the session on every host, not only this one.
        clearSharedSession();
        markShared(false);

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
       *
       * Also where a refreshed pair lands, which is why it republishes the
       * cookie: refresh tokens rotate, and the other hosts must not be left
       * holding one this host has already spent.
       */
      setTokens: (accessToken: string, refreshToken: string) => {
        set({ accessToken, refreshToken, isAuthenticated: true });
        shareSession(refreshToken, get().currentTenantId);
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
      /**
       * The session stays here as well as in the shared cookie.
       *
       * Deliberately belt and braces. A cookie can be refused for reasons this
       * code cannot see, and an earlier version of this store moved the tokens
       * out of `localStorage` on the assumption the cookie had taken them —
       * when it had not, the only copy was gone and the next reload was a
       * sign-out. The cookie is what the *other* hosts read; this is what this
       * one falls back to.
       */
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

/**
 * Reconcile this origin's session with the one shared across the app's hosts.
 *
 * Runs once, before the first render, because a guard reading the store first
 * would bounce a signed-in user to the login page before this could correct it.
 *
 * Three cases:
 * - the cookie has a session, so this host adopts it — which is how somebody
 *   signed in on a gym address arrives on the platform's pages already signed
 *   in. A refresh token different from this origin's means it was started or
 *   rotated elsewhere, so the local access token is stale and dropped; the
 *   401 interceptor trades the refresh token for a fresh one on first use;
 * - no cookie but a session here, which means either that the cookie was
 *   cleared by a sign-out on another host (only believable if sharing has ever
 *   worked on this origin) or that this session predates sharing, in which
 *   case it is published now;
 * - neither, and there is nothing to do.
 */
export function initSharedSession() {
  const state = useAuthStore.getState();
  const shared = readSharedSession();

  if (shared) {
    const rotated = state.refreshToken !== shared.refreshToken;

    useAuthStore.setState({
      refreshToken: shared.refreshToken,
      ...(rotated ? { accessToken: null } : {}),
      ...(shared.tenantId ? { currentTenantId: shared.tenantId } : {}),
      isAuthenticated: true,
    });
    markShared(true);
    return;
  }

  if (!state.refreshToken) {
    markShared(false);
    return;
  }

  if (wasShared()) {
    // Sharing worked here before and the cookie is gone: signed out elsewhere.
    // Cleared locally without calling the API — the token may simply have
    // aged out, and there is nothing left to revoke that revoking would fix.
    markShared(false);
    useAuthStore.setState({
      user: null,
      accessToken: null,
      refreshToken: null,
      currentTenantId: null,
      isAuthenticated: false,
    });
    return;
  }

  // A session from before this origin ever shared one. Publish it.
  shareSession(state.refreshToken, state.currentTenantId);
}
