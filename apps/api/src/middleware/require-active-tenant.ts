/**
 * Documentation: The platform-expiry gate for routes that have no session.
 *
 * - `authorize` gates a caller who is signed in and holds a role. Nothing gated the other half of a gym's scope: the shop window, the guest checkout and the member signup all resolve their gym from the request host, and all of them kept working after the gym's platform access lapsed. That is the half that takes money.
 * - Writes and commerce only. Browsing a lapsed gym's page still works, and so does looking up an order already placed or opening an ID card already issued — those serve somebody who has already paid, and turning them away punishes the wrong person for the gym's lapse.
 * - Settlement is deliberately never gated. `checkout/verify` and `signup/verify` close a payment the buyer has already made; refusing them would take the money and withhold what it bought. Blocking the *start* of a checkout is what stops new money arriving, and it leaves nothing in flight to strand.
 * - A request that resolves to no gym passes straight through. These routes are also served from the app root, where there is no tenant to have an opinion about.
 * - Primary exports: requireActiveTenantByHost, requireActiveTenant.
 */
import { createMiddleware } from "hono/factory";
import { forbidden } from "../lib/response";
import { normalizeTenantHost } from "../lib/tenant-host";
import {
  PLATFORM_EXPIRED_MESSAGE,
  isTenantPlatformExpired,
  isTenantSlugPlatformExpired,
} from "../lib/platform-access";
import { isPlatformStaffRole } from "@fitconnect/shared/types/permissions";
import type { AppBindings } from "../types/app-context";

export const requireActiveTenantByHost = createMiddleware<AppBindings>(async (c, next) => {
  // The same two sources the public controllers read, in the same order, so the
  // gym this refuses is always the gym the handler would have served.
  const host = c.req.query("host") ?? c.req.header("host") ?? "";
  const slug = host ? normalizeTenantHost(host) : null;

  if (!slug) return next();

  if (await isTenantSlugPlatformExpired(slug)) {
    return forbidden(c, PLATFORM_EXPIRED_MESSAGE);
  }

  await next();
});

/**
 * The same gate for a signed-in caller, keyed on the tenant in the path or the
 * `x-tenant-id` header.
 *
 * For the routes that resolve a gym's permissions without demanding any — the
 * gym wall, where somebody deciding whether to join has to be able to ask a
 * question. `resolveTenantPermissions` never rejects by design, so it cannot
 * carry this itself, and the wall was the one signed-in surface a lapsed gym
 * kept.
 *
 * Applied to what creates content, not to what reads or removes it: a gym must
 * still be able to take down something abusive on its own page after its access
 * lapses, and a visitor should still be able to read the page they are judging.
 */
export const requireActiveTenant = createMiddleware<AppBindings>(async (c, next) => {
  const tenantId = c.req.param("tenantId") || c.req.header("x-tenant-id") || null;
  if (!tenantId) return next();

  // Platform staff are exempt here for the same reason they are in `authorize`.
  const user = c.get("authUser");
  if (user && isPlatformStaffRole(user.platformRole)) return next();

  if (await isTenantPlatformExpired(tenantId)) {
    return forbidden(c, PLATFORM_EXPIRED_MESSAGE);
  }

  await next();
});
