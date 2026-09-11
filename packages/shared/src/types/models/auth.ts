/**
 * Documentation: Who is signed in, and the session they hold.
 *
 * - One slice of the shared contract surface. `types/models.ts` re-exports every slice, so nothing that imports from there had to change when this was split out of it.
 * - Treat these as the shape the API promises, not as a mirror of Prisma's own models.
 */

import type { AccountStatus, PlatformRole, TenantRole } from "../enums";
import type { OccupationSummary } from "./tenant";

// ─── User / Auth ──────────────────────────────────────────────────────────────

export type Gender = "MALE" | "FEMALE" | "OTHER";

export interface User {
  id: string;
  name: string;
  email: string;
  gender?: Gender | null;
  /** ISO date (YYYY-MM-DD) at UTC midnight. Null on accounts from before it was asked for. */
  dateOfBirth?: string | null;
  occupationId?: string | null;
  occupation?: OccupationSummary | null;
  phone?: string | null;
  avatarUrl?: string | null;
  platformRole: PlatformRole;
  status?: AccountStatus;
  createdAt?: string;
  membership?: TenantMembershipSummary;
  /** Effective capability list resolved by the API for this session. */
  permissions?: string[];
}

export interface TenantMembershipSummary {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  role: TenantRole;
  platformExpiresAt?: string | null;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface TokenRefreshResponse {
  accessToken: string;
  refreshToken: string;
}
