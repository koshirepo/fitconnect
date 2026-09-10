/**
 * Documentation: Pure shared utility functions.
 *
 * - Contains framework-agnostic helpers for formatting money and dates, generating initials, and working with tenant slugs.
 * - Because these functions have no runtime dependencies on Hono or Prisma, they are safe to reuse in the API and any frontend client.
 * - Primary exports: formatCurrency, formatCompactCurrency, formatDate, formatDateTime, getInitials, isValidSlug, toSlug.
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

/**
 * The same amount, short enough for a stat tile on a phone.
 *
 * Two of these tiles sit side by side on a 375px screen, which leaves roughly
 * eight characters for the figure — so "₹6,52,700" was being truncated to
 * "₹6,52,7…", which is not a number at all. Anything from a lakh up is
 * abbreviated the way the amount would be said out loud in India: 6.5 lakh,
 * 1.2 crore. Below a lakh the exact figure already fits, and is kept.
 *
 * For reading rather than for arithmetic: the rounded form loses paise and
 * hundreds, so screens that must reconcile — a ledger, an invoice, a payout —
 * keep using `formatCurrency`, and a tile should carry the exact amount in a
 * `title` for anyone who wants it.
 */
export function formatCompactCurrency(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const value = Math.abs(amount);

  const CRORE = 10_000_000;
  const LAKH = 100_000;

  if (value >= CRORE) return `${sign}₹${trimZeros(value / CRORE)}Cr`;
  if (value >= LAKH) return `${sign}₹${trimZeros(value / LAKH)}L`;

  return formatCurrency(amount);
}

/** Two decimals at most, and none at all on a round number: 6.53, 1.2, 7. */
function trimZeros(value: number): string {
  return String(Number(value.toFixed(2)));
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
