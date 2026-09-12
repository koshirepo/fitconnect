/**
 * Documentation: The session, shared across the app host and every gym subdomain.
 *
 * - One account, several addresses. `fitconnect.co.in` and `rudra.fitconnect.co.in` are separate origins, so a session held in `localStorage` on one is invisible to the other — which is why a signed-in member browsing the platform's exercise library was still offered "Sign In". A cookie scoped to the domain both share is readable from either.
 * - This is storage, not transport. The API is served from another domain entirely, so this cookie is never sent to it and nothing here widens what the API accepts; requests still carry a bearer token in a header. It exists so two pages of the same app can see one session.
 * - Only the refresh token, never the access token. A cookie is capped at about 4KB and an access token is a signed JWT carrying claims — big enough to push the pair over that limit, at which point the browser drops the write silently and nothing here would know. The refresh token is a short opaque string, and the client already knows how to trade one for an access token: the 401 interceptor does it on every expiry.
 * - Every write is read back before it is believed. A cookie can be refused for reasons this code cannot see — size, a host that will not take the domain, storage turned off — and a caller that assumed success would be free to discard the copy it still had.
 * - Primary exports: readSharedSession, writeSharedSession, clearSharedSession.
 */
import { getRootHostname, hostSupportsTenantSubdomains } from "./subdomain";

/** What is shared: enough to obtain a session, and nothing else. */
export interface SharedSession {
  /** Opaque and short. Traded for an access token by the usual refresh call. */
  refreshToken: string;
  /** The gym the session was last acting in, so a reload lands in the same place. */
  tenantId?: string | null;
}

const COOKIE_NAME = "fc_session";

/**
 * Seven days, matching `JWT_REFRESH_TTL_SECONDS` on the API.
 *
 * A cookie outliving the refresh token would offer a session the API has
 * already stopped honouring; one expiring sooner would sign people out while
 * their session was still good.
 */
const MAX_AGE_SECONDS = 604800;

/**
 * The domain the cookie is pinned to.
 *
 * The registrable root, so every gym subdomain and the app host see the same
 * cookie. Where the host cannot carry a subdomain at all — an IP address, or a
 * bare local host — there is nothing to share with, and the attribute is left
 * off so the cookie stays host-only rather than being refused outright.
 */
function cookieDomain(): string | null {
  if (typeof window === "undefined") return null;
  if (!hostSupportsTenantSubdomains()) return null;

  const root = getRootHostname();
  return root || null;
}

function cookieSuffix(domain: string | null) {
  const secure = typeof window !== "undefined" && window.location.protocol === "https:";

  return [
    "path=/",
    domain ? `domain=${domain}` : "",
    // Lax rather than Strict: arriving from a gym's link, an email, or a
    // payment gateway's redirect must not look like a signed-out visit.
    "samesite=lax",
    secure ? "secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function readSharedSession(): SharedSession | null {
  if (typeof document === "undefined") return null;

  const match = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${COOKIE_NAME}=`));

  if (!match) return null;

  try {
    const raw = decodeURIComponent(match.slice(COOKIE_NAME.length + 1));
    const parsed = JSON.parse(raw) as Partial<SharedSession> | null;

    // A cookie somebody hand-edited, or one written by an older build, is not
    // a session. Treated as absent rather than trusted into the store.
    if (!parsed?.refreshToken) return null;

    return { refreshToken: parsed.refreshToken, tenantId: parsed.tenantId ?? null };
  } catch {
    return null;
  }
}

/**
 * Share a session, and say whether it actually landed.
 *
 * The read-back is the point. A silent refusal that the caller took for
 * success is how a working session gets thrown away in favour of one that was
 * never stored — so this reports what is true rather than what was attempted.
 *
 * Falls back to a host-only cookie if the domain-scoped one is refused: that
 * still survives a reload on this address, which is worth more than nothing
 * even though it does not reach the other hosts.
 */
export function writeSharedSession(session: SharedSession): boolean {
  if (typeof document === "undefined") return false;

  const value = encodeURIComponent(JSON.stringify(session));
  const domain = cookieDomain();

  document.cookie = `${COOKIE_NAME}=${value}; max-age=${MAX_AGE_SECONDS}; ${cookieSuffix(domain)}`;
  if (readSharedSession()?.refreshToken === session.refreshToken) return true;

  if (domain) {
    document.cookie = `${COOKIE_NAME}=${value}; max-age=${MAX_AGE_SECONDS}; ${cookieSuffix(null)}`;
    if (readSharedSession()?.refreshToken === session.refreshToken) return true;
  }

  return false;
}

/**
 * End the session everywhere.
 *
 * Cleared at both scopes, because a write may have fallen back to a host-only
 * cookie: deleting only the domain-scoped one would leave the other in place,
 * which reads as a sign-out that did not happen.
 */
export function clearSharedSession() {
  if (typeof document === "undefined") return;

  const domain = cookieDomain();
  document.cookie = `${COOKIE_NAME}=; max-age=0; ${cookieSuffix(domain)}`;
  if (domain) document.cookie = `${COOKIE_NAME}=; max-age=0; ${cookieSuffix(null)}`;
}
