/**
 * Documentation: Cross-layer constants.
 *
 * - Defines pagination defaults, password limits, display labels, slug validation, and commerce defaults used across the API.
 * - Keep these values here when they affect both validation and presentation so behavior stays synchronized between modules.
 * - Primary exports: DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH, SLUG_REGEX, ACCESS_TOKEN_EXPIRY, REFRESH_TOKEN_EXPIRY, PLATFORM_ROLE_LABELS, TENANT_ROLE_LABELS, PAYMENT_STATUS_LABELS, ORDER_STATUS_LABELS, COMMERCE_DEFAULT_GST_RATE_PCT, FEEDBACK_LIMITS.
 */
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

// ─── Feedback ─────────────────────────────────────────────────────────────────

/**
 * Limits for everything a person writes about something else: a comment on a
 * gym's page, a comment on a store product, a comment on a review, and a review
 * itself.
 *
 * Here rather than in each module's zod schema because both sides need the same
 * number for different reasons. The API refuses anything longer; the PWA's
 * character counter has to warn *before* that refusal, and a composer that lets
 * someone type 2000 characters into a field the server caps at 500 turns a
 * validation rule into lost writing.
 *
 * They were three different numbers before this existed — the gym thread
 * allowed 2000, a review's comment 500, and the composer counted to its own
 * hardcoded 2000 regardless of which surface it was on.
 */
export const FEEDBACK_LIMITS = {
  /** Any free-text comment body, whatever the surface calls the field. */
  COMMENT_MAX_LENGTH: 2000,
  /** A review's one-line summary. */
  REVIEW_TITLE_MAX_LENGTH: 200,
  /** A review's prose. Longer than a comment: this is the considered opinion. */
  REVIEW_BODY_MAX_LENGTH: 2000,
  /** Stars. Inclusive on both ends, integers only. */
  RATING_MIN: 1,
  RATING_MAX: 5,
} as const;
