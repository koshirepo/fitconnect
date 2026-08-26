/**
 * Documentation: Shared Hono context typing.
 *
 * - Defines the request-scoped auth variables and Worker binding types that middleware and route modules rely on.
 * - Keep this file aligned with JWT payload structure and Cloudflare binding names when context or environment contracts change.
 * - Primary exports: AuthUser, TenantAccess, AppVariables, AppBindings.
 */
import type { PlatformRole, TenantRole } from "@fitconnect/shared/types/enums";
import type { JwtTenants } from "../auth/jwt";
import type { Permission } from "@fitconnect/shared/types/permissions";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  platformRole: PlatformRole;
  tenants: JwtTenants;
};

export type TenantAccess = {
  tenantId: string;
  role: TenantRole;
};

export type AppVariables = {
  authUser: AuthUser;
  optionalAuthUser?: AuthUser | null;
  tenantAccess: TenantAccess | null;
  /**
   * Effective capability set for this request, published by the authorize
   * middleware so controllers can make finer-grained decisions (for example,
   * narrowing a list to the caller's own records) without re-deriving it.
   */
  permissions: ReadonlySet<Permission>;
};

/**
 * Cloudflare's rate limiting binding.
 *
 * Typed here rather than imported: the Worker types are generated per build and
 * this is the only shape the app calls.
 */
export type RateLimiter = {
  limit: (options: { key: string }) => Promise<{ success: boolean }>;
};

export type AppBindings = {
  Bindings: {
    DB: D1Database;
    FILES?: R2Bucket;
    UPLOADS_BUCKET?: R2Bucket;
    APP_URL?: string;
    R2_PUBLIC_URL?: string;
    /**
     * Throttles the unauthenticated signup endpoints. Optional so local
     * development and tests run without the binding configured.
     */
    SIGNUP_RATE_LIMITER?: RateLimiter;
  };
  Variables: AppVariables;
};
