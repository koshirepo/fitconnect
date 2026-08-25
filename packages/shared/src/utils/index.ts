/**
 * Documentation: Pure shared utility functions.
 *
 * - Contains framework-agnostic helpers for formatting money and dates, generating initials, and working with tenant slugs.
 * - Because these functions have no runtime dependencies on Hono or Prisma, they are safe to reuse in the API and any frontend client.
 * - Primary exports: formatCurrency, formatDate, formatDateTime, getInitials, isValidSlug, toSlug.
 */
// ─── Shared Utilities ─────────────────────────────────────────────────────────
// Pure functions with no framework dependencies – safe for API and PWA.

/** Format amount (in rupees) to INR currency string */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
  }).format(amount);
}

/** Format ISO date string to readable date */
export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
  }).format(new Date(date));
}

/** Format ISO date string to readable date + time */
export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

/** Extract initials from a name (e.g., "Ravi Kumar" → "RK") */
export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/** Validate tenant slug format */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

/** Generate a URL-safe slug from a name */
export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
