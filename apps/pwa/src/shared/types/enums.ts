// ─── Platform Roles & Enums ───────────────────────────────────────────────────
// These mirror the Prisma schema enums exactly.
// Both API and PWA import from here – single source of truth.

export type PlatformRole = "USER" | "SUPER_ADMIN" | "SUPPORT";
export type TenantRole = "MEMBER" | "COACH" | "ADMIN";
export type AccountStatus = "ACTIVE" | "SUSPENDED" | "DELETED";
export type PaymentStatus = "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED";
export type OrderStatus = "PENDING" | "SHIPPED" | "DELIVERED";

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "LOGIN"
  | "LOGOUT"
  | "ROLE_CHANGE"
  | "SETTINGS_CHANGE";
