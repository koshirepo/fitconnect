/**
 * Documentation: Shared Hono context typing.
 *
 * - Defines the request-scoped auth variables and Worker binding types that middleware and route modules rely on.
 * - Keep this file aligned with JWT payload structure and Cloudflare binding names when context or environment contracts change.
 * - Primary exports: AuthUser, TenantAccess, AppVariables, AppBindings.
 */
import type { PlatformRole, TenantRole } from "../shared/types/enums";
import type { JwtTenants } from "../auth/jwt";

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
};

export type AppBindings = {
  Bindings: {
    DB: D1Database;
    FILES?: R2Bucket;
    UPLOADS_BUCKET?: R2Bucket;
    APP_URL?: string;
    R2_PUBLIC_URL?: string;
  };
  Variables: AppVariables;
};
