/**
 * Documentation: Which private area belongs to whom, and on which address.
 *
 * - The app has two kinds of signed-in space and one account model. A gym's screens live on that gym's own subdomain; the platform's live on the app host. An account may hold a gym membership, a platform role, or both.
 * - Public pages are open to everybody either way. This decides only where somebody goes when they leave a public page for a private one, and which host may serve it — so a member who taps "Dashboard" on the platform's exercise library lands in their gym rather than on a platform screen that has nothing in it for them.
 * - Somebody holding both keeps both, each on its own address. Nothing here demotes an account; it answers "does this host serve you" and "where is your own area from here".
 * - Crossing between the two is a page load, not a route change: they are different origins, so the app has to start again on the other side.
 * - Primary exports: isPlatformUser, hasGymMembership, servesCurrentUser, resolvePrivateHome.
 */
import { buildApexUrl, buildTenantDashboardUrl, isTenantSubdomain } from "./subdomain";
import type { User } from "@fitconnect/shared/types/models";

/** Where a private area lives, and whether reaching it leaves this origin. */
export interface PrivateHome {
  href: string;
  /** True when this crosses hosts and needs a page load rather than a route change. */
  external: boolean;
}

/** Platform staff. The same pair the auth store and the API agree on. */
export function isPlatformUser(user?: User | null) {
  return user?.platformRole === "SUPER_ADMIN" || user?.platformRole === "SUPPORT";
}

export function hasGymMembership(user?: User | null) {
  return Boolean(user?.membership?.tenantId);
}

/**
 * Whether the host being browsed serves this user's private pages at all.
 *
 * A gym subdomain serves members of that gym; the app host serves platform
 * staff. This is what keeps a member off the platform's own dashboard and a
 * support user out of a gym's, without either of them being signed out.
 */
export function servesCurrentUser(user?: User | null) {
  return isTenantSubdomain() ? hasGymMembership(user) : isPlatformUser(user);
}

/**
 * Where this user's own private area is, from wherever they are standing.
 *
 * Returns null for an account with neither a membership nor a platform role —
 * a signed-in person with nothing private to open, which is a real state
 * during self-signup before a membership exists.
 */
export function resolvePrivateHome(user?: User | null): PrivateHome | null {
  const onGymHost = isTenantSubdomain();
  const platform = isPlatformUser(user);
  const membership = user?.membership;

  // The host you are on, when it is yours: an ordinary route change.
  if (onGymHost && membership?.tenantId) return { href: "/dashboard", external: false };
  if (!onGymHost && platform) return { href: "/dashboard", external: false };

  // Otherwise the other host, if anything over there belongs to them.
  if (onGymHost && platform) {
    const href = buildApexUrl("/dashboard");
    return { href, external: href.startsWith("http") };
  }

  if (!onGymHost && membership?.tenantSlug) {
    const href = buildTenantDashboardUrl(membership.tenantSlug, "/dashboard");
    // No subdomain is possible on this host (an IP, or a bare local host), so
    // the app host is the only address there is and the path serves.
    if (!href) return { href: "/dashboard", external: false };
    return { href, external: true };
  }

  return null;
}
