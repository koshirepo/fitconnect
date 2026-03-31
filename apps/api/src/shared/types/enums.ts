/**
 * Documentation: Shared enum-like constant maps.
 *
 * - Exports string-literal role, status, visibility, and audit-action sets that keep server and client code aligned without introducing a separate enum runtime.
 * - Use these constants when validating or comparing business-state strings so magic values do not spread through the codebase.
 * - Primary exports: PlatformRole, TenantRole, AccountStatus, PaymentStatus, OrderStatus, TodoVisibility, AuditAction.
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

export const OrderStatus = {
  PENDING: "PENDING",
  SHIPPED: "SHIPPED",
  DELIVERED: "DELIVERED",
} as const;
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
