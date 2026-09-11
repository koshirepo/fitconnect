/**
 * Documentation: Audit trail, badges, and the settings a gym chooses for itself.
 *
 * - One slice of the shared contract surface. `types/models.ts` re-exports every slice, so nothing that imports from there had to change when this was split out of it.
 * - Treat these as the shape the API promises, not as a mirror of Prisma's own models.
 */

import type { AuditAction } from "../enums";

// ─── Audit Logs ───────────────────────────────────────────────────────────────

export interface AuditLog {
  id: string;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  actorId?: string | null;
  tenantId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  createdAt: string;
  actor?: { id: string; name: string; email: string } | null;
}

// ─── Badges ───────────────────────────────────────────────────────────────────

export interface Badge {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
  color: string;
  icon?: string | null;
  /**
   * Whether handing this badge out needs `badges:assign:restricted`.
   *
   * For badges that confer standing rather than mark progress — a staff
   * credential, lifetime membership — which a coach should not be able to
   * grant or take away on the floor.
   */
  restricted: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
  _count?: { assignments: number };
}

export interface CreateBadgePayload {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  restricted?: boolean;
}

export interface UpdateBadgePayload {
  name?: string;
  description?: string;
  color?: string;
  icon?: string;
  restricted?: boolean;
  isActive?: boolean;
}

export interface AssignBadgePayload {
  membershipId: string;
}

export type WhatsAppTemplateKey =
  | "new_member_welcome"
  | "birthday_greeting"
  | "payment_reminder"
  | "attendance_nudge"
  | "pending_payment_reminder"
  | "payment_receipt"
  | "salary_payment"
  | "salary_updated";

export interface WhatsAppTemplate {
  key: WhatsAppTemplateKey;
  label: string;
  description: string;
  variables: string[];
  body: string;
  defaultBody: string;
  isCustom: boolean;
}

// ─── Tenant Settings ──────────────────────────────────────────────────────────

export interface TenantSettings {
  overdueDays: number;
  /**
   * The terms a joining member must accept, resolved to the gym's own wording
   * or the platform default. Saving an empty string clears the override and
   * puts the default back.
   */
  consentText?: string;
  /**
   * IANA zone the gym keeps its hours in, e.g. "Asia/Kolkata". Every stored
   * timestamp is UTC; this is what a report renders them in, so that "busiest
   * hour" names an hour the staff would recognise.
   */
  timezone?: string;
  /** Coins the referrer earns on a referee's first subscription. 0 is off. */
  referralRewardCoins?: number;
  /** Coins the referred member earns at the same moment. */
  referralRefereeCoins?: number;
  whatsappTemplates: WhatsAppTemplate[];
  /**
   * Whether members can pay online, from either the gym's own gateway account
   * or the platform's. Readable by every member — it says nothing about which
   * account collects or what keys are behind it.
   */
  onlinePaymentsEnabled?: boolean;
}

export interface UpdateTenantSettingsPayload {
  overdueDays?: number;
  timezone?: string;
  consentText?: string;
  referralRewardCoins?: number;
  referralRefereeCoins?: number;
  whatsappTemplates?: Partial<Record<WhatsAppTemplateKey, string>>;
}

export interface TenantCharge {
  id: string;
  tenantId: string;
  name: string;
  amount: number;
  isMandatory: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateTenantChargePayload {
  name: string;
  amount: number;
  isMandatory?: boolean;
}

export interface UpdateTenantChargePayload {
  name?: string;
  amount?: number;
  isMandatory?: boolean;
  isActive?: boolean;
}
