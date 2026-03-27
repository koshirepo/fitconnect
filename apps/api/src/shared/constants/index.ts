// ─── Shared Constants ─────────────────────────────────────────────────────────

/** Default pagination values */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** Password constraints */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

/** Tenant slug regex: lowercase letters, numbers, hyphens */
export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** JWT expiry durations (in seconds) */
export const ACCESS_TOKEN_EXPIRY = 15 * 60; // 15 minutes
export const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60; // 7 days

/** Role display labels */
export const PLATFORM_ROLE_LABELS: Record<string, string> = {
  USER: "User",
  SUPER_ADMIN: "Super Admin",
  SUPPORT: "Support",
};

export const TENANT_ROLE_LABELS: Record<string, string> = {
  MEMBER: "Member",
  COACH: "Coach",
  ADMIN: "Admin",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  COMPLETED: "Completed",
  FAILED: "Failed",
  REFUNDED: "Refunded",
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
};

export const COMMERCE_DEFAULT_GST_RATE_PCT = 18;
