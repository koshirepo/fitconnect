/**
 * Documentation: Shared enum-like constant maps.
 *
 * - Exports string-literal role, status, visibility, and audit-action sets that keep server and client code aligned without introducing a separate enum runtime.
 * - Use these constants when validating or comparing business-state strings so magic values do not spread through the codebase.
 * - Primary exports: PlatformRole, TenantRole, AccountStatus, PaymentStatus, OrderStatus, ShipmentStatus, ReturnStatus, TodoVisibility, AuditAction.
 */
// ─── Platform Roles & Enums ───────────────────────────────────────────────────
// These mirror the Prisma schema "enums" (stored as plain strings in SQLite).
// Both API and PWA import from here – single source of truth.

export const PlatformRole = {
  USER: "USER",
  SUPER_ADMIN: "SUPER_ADMIN",
  SUPPORT: "SUPPORT",
} as const;
export type PlatformRole = (typeof PlatformRole)[keyof typeof PlatformRole];

export const TenantRole = {
  MEMBER: "MEMBER",
  COACH: "COACH",
  ADMIN: "ADMIN",
} as const;
export type TenantRole = (typeof TenantRole)[keyof typeof TenantRole];

export const AccountStatus = {
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  DELETED: "DELETED",
} as const;
export type AccountStatus = (typeof AccountStatus)[keyof typeof AccountStatus];

export const PaymentStatus = {
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  REFUNDED: "REFUNDED",
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

/**
 * What a payment was for, so the shop and the membership desk can be read apart.
 *
 * A gym sells two unrelated things through one ledger: time in the gym, and
 * things off a shelf. Both write a `Payment` row — that is what lets the finance
 * page reconcile a single figure for the month — but nothing on the row said
 * which was which, so the payments screen listed a protein tub beside a renewal
 * and the two could only be told apart by reading the description.
 *
 * The precedence is `subscriptionId`, then `chargeId`, then a linked
 * `StoreOrder`, then nothing — the same order `financeRepository.incomeTotals`
 * has always split by. Storing it makes that rule explicit, indexable, and
 * impossible for a new reader to get subtly different.
 *
 * OTHER is a payment attached to none of the three: a manual entry somebody
 * recorded against a member with no plan and no charge behind it.
 */
export const PaymentSource = {
  SUBSCRIPTION: "SUBSCRIPTION",
  CHARGE: "CHARGE",
  STORE: "STORE",
  OTHER: "OTHER",
} as const;
export type PaymentSource = (typeof PaymentSource)[keyof typeof PaymentSource];

/** Every source, for validating a filter and for iterating a breakdown. */
export const PAYMENT_SOURCES = Object.values(PaymentSource);

/**
 * The membership business: everything the shop is not.
 *
 * The payments screen shows these by default. A store sale is money the gym
 * took, but it is not a membership payment, and mixing them made the ledger
 * unreadable on any gym that sells more tubs than it signs members.
 */
export const MEMBERSHIP_PAYMENT_SOURCES: PaymentSource[] = [
  PaymentSource.SUBSCRIPTION,
  PaymentSource.CHARGE,
  PaymentSource.OTHER,
];

/**
 * Which source a membership-side payment belongs to, from what it points at.
 *
 * The precedence — plan, then charge, then neither — is the one rule, written
 * once. A store sale never comes through here: it carries neither id, and its
 * order is written after the payment row, so those callers name STORE outright.
 */
export function membershipPaymentSource(link: {
  subscriptionId?: string | null;
  chargeId?: string | null;
}): PaymentSource {
  if (link.subscriptionId) return PaymentSource.SUBSCRIPTION;
  if (link.chargeId) return PaymentSource.CHARGE;
  return PaymentSource.OTHER;
}

/**
 * Where an order is in its fulfilment, not its payment — see PaymentStatus.
 *
 * PENDING is an order that exists but has not been paid for. Everything from
 * CONFIRMED onward is the parcel's journey, and the three middle states are
 * written by the courier's own scans rather than by anyone at the shop.
 */
export const OrderStatus = {
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  PACKED: "PACKED",
  SHIPPED: "SHIPPED",
  IN_TRANSIT: "IN_TRANSIT",
  OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED",
  RETURNED: "RETURNED",
} as const;

/** A courier consignment's own state, which the order above follows. */
export const ShipmentStatus = {
  PENDING: "PENDING",
  MANIFESTED: "MANIFESTED",
  IN_TRANSIT: "IN_TRANSIT",
  OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
  DELIVERED: "DELIVERED",
  /** Returned to origin — refused, unreachable, or sent back by the courier. */
  RTO: "RTO",
  CANCELLED: "CANCELLED",
  FAILED: "FAILED",
} as const;
export type ShipmentStatus = (typeof ShipmentStatus)[keyof typeof ShipmentStatus];

/** A return request from the moment it is raised to the money going back. */
export const ReturnStatus = {
  REQUESTED: "REQUESTED",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  PICKED_UP: "PICKED_UP",
  RECEIVED: "RECEIVED",
  REFUNDED: "REFUNDED",
  CANCELLED: "CANCELLED",
} as const;
export type ReturnStatus = (typeof ReturnStatus)[keyof typeof ReturnStatus];
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const TodoVisibility = {
  PRIVATE: "PRIVATE",
  PROTECTED: "PROTECTED",
  PUBLIC: "PUBLIC",
} as const;
export type TodoVisibility = (typeof TodoVisibility)[keyof typeof TodoVisibility];

export const AuditAction = {
  CREATE: "CREATE",
  UPDATE: "UPDATE",
  DELETE: "DELETE",
  LOGIN: "LOGIN",
  LOGOUT: "LOGOUT",
  ROLE_CHANGE: "ROLE_CHANGE",
  SETTINGS_CHANGE: "SETTINGS_CHANGE",
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];
