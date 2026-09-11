/**
 * Documentation: One definition of "this gym's platform access has lapsed".
 *
 * - The check used to live inline in `authorize`, which meant it covered exactly the routes that happened to reach for a tenant-scoped permission middleware. Everything else in the tenant's scope ran unguarded: the gym wall resolves permissions without requiring any, and the whole public surface resolves its gym from the request host and never consulted the date at all. A lapsed gym kept its shop window, its guest checkout and its member signup — the three places money actually changes hands.
 * - Platform staff are never gated, here or in `authorize`. Somebody has to be able to service, bill and un-expire a lapsed gym, and the renewal path runs through the same API as everything else.
 * - Expiry stops a gym transacting. It does not hide a gym from somebody who already bought from it, so order lookup and ID cards are deliberately not routed through this.
 * - The cache key is shared with `authorize` on purpose: both paths ask the same question about the same gym, and answering it twice per request would be two reads where the point of the cache is zero.
 * - Primary exports: PLATFORM_EXPIRED_MESSAGE, isPlatformExpired, tenantPlatformExpiresAt, isTenantPlatformExpired, isTenantSlugPlatformExpired.
 */
import { isPlatformExpired } from "@fitconnect/shared/utils";
import { prisma } from "./prisma";
import { cached } from "./request-cache";

/**
 * One wording, so a member locked out of the dashboard and a visitor turned
 * away at checkout are told the same thing and the gym hears one story.
 */
export const PLATFORM_EXPIRED_MESSAGE =
  "Platform access is expired. Renew access to continue using the platform.";

/**
 * Null means no expiry was ever set, which is not the same as expired.
 *
 * Re-exported rather than defined here: the PWA asks the same question to
 * decide whether to bounce the dashboard, and the two answers must agree. A
 * second copy is how one side starts letting people in after the other has
 * stopped, with nothing failing loudly in between.
 */
export { isPlatformExpired };

/** The gym's expiry date, cached for the few seconds a burst of requests lasts. */
export function tenantPlatformExpiresAt(tenantId: string): Promise<Date | null> {
  return cached(`tenant-expiry:${tenantId}`, async () => {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { platformExpiresAt: true },
    });
    return tenant?.platformExpiresAt ?? null;
  });
}

export async function isTenantPlatformExpired(tenantId: string): Promise<boolean> {
  return isPlatformExpired(await tenantPlatformExpiresAt(tenantId));
}

/**
 * The same question asked by public slug, for the routes that resolve their gym
 * from the request host and never learn a tenant id.
 *
 * Keyed by slug rather than id because that is all the caller has; a gym's slug
 * is unique and stable, so the two caches cannot disagree about one gym.
 */
export async function isTenantSlugPlatformExpired(slug: string): Promise<boolean> {
  const expiresAt = await cached(`tenant-expiry-slug:${slug}`, async () => {
    const tenant = await prisma.tenant.findFirst({
      where: { slug },
      select: { platformExpiresAt: true },
    });
    return tenant?.platformExpiresAt ?? null;
  });

  return isPlatformExpired(expiresAt);
}
