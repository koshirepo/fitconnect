/**
 * Documentation: A gym, as the app and as the public page see it.
 *
 * - One slice of the shared contract surface. `types/models.ts` re-exports every slice, so nothing that imports from there had to change when this was split out of it.
 * - Treat these as the shape the API promises, not as a mirror of Prisma's own models.
 */

import type { AccountStatus } from "../enums";
import type { Shift } from "./members";

// ─── Tenant ───────────────────────────────────────────────────────────────────

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  logoUrl?: string | null;
  /** Hex accent colour for this gym's pages. Null uses the platform default. */
  brandColor?: string | null;
  markdown?: string | null;
  description?: string | null;
  estd?: string | null;
  status: AccountStatus;
  platformExpiresAt?: string | null;
  createdAt: string;
}

export interface CreateTenantAdminPayload {
  name: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
}

export interface CreateTenantPayload {
  name: string;
  slug?: string;
  email?: string;
  phone?: string;
  address?: string;
  logoUrl?: string;
  markdown?: string;
  admin: CreateTenantAdminPayload;
}

export interface UpdateTenantPayload {
  name?: string;
  phone?: string | null;
  address?: string | null;
  logoUrl?: string | null;
  /** Hex accent colour. Null puts this gym back on the platform's own. */
  brandColor?: string | null;
  markdown?: string | null;
  description?: string | null;
}

// ─── Public Tenant Detail ─────────────────────────────────────────────────────

export interface PublicTenantDetail {
  id: string;
  name: string;
  slug: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  logoUrl?: string | null;
  markdown?: string | null;
  description?: string | null;
  estd?: string | null;
  createdAt: string;
  _count: { memberships: number };
  subscriptions: {
    id: string;
    title: string;
    description?: string | null;
    amount: number;
    durationDays: number;
  }[];
  shifts: Shift[];
}

export interface PublicGymSummary {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  address?: string | null;
  estd?: string | null;
  _count: { memberships: number };
}

/**
 * One entry in the platform-wide list of what members do for a living.
 *
 * A table rather than a fixed set of strings so the list can grow without a
 * release, and so "how many students train here" stays answerable: every
 * member points at a row instead of holding their own spelling of it.
 */
export interface Occupation {
  id: string;
  name: string;
  /** Icon key from the curated set the PWA draws; null falls back to a briefcase. */
  icon?: string | null;
  isActive: boolean;
  /** Ascending order in pickers; ties break on name. */
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
  /** How many accounts hold it. Only sent on the manage listing. */
  memberCount?: number;
}

/** What a member record carries: enough to name and draw it, nothing more. */
export interface OccupationSummary {
  id: string;
  name: string;
  icon?: string | null;
}

export interface CreateOccupationPayload {
  name: string;
  icon?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}

export type UpdateOccupationPayload = Partial<CreateOccupationPayload>;
