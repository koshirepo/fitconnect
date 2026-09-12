/**
 * Documentation: The session, shared across the app host and every gym subdomain.
 *
 * - One account, several addresses. `fitconnect.co.in` and `rudra.fitconnect.co.in` are separate origins, so a session held in `localStorage` on one is invisible to the other — which is why a signed-in member browsing the platform's exercise library was still offered "Sign In". A cookie scoped to the domain both share is readable from either, so the session lives here and `localStorage` keeps only the cached user.
 * - This is storage, not transport. The API is served from another domain entirely, so this cookie is never sent to it and nothing here widens what the API accepts; requests still carry a bearer token in a header. It exists so two pages of the same app can see one session.
 * - Tokens only, deliberately. A cookie is capped at about 4KB and a user object with its permission list is not small — whoever adopts this session asks the API who they are.
 * - The cookie is the truth about whether somebody is signed in. Signing out clears it, and the next load of any other host finds nothing and signs out too; a per-origin copy in `localStorage` would otherwise quietly resurrect a session the user had just ended.
 * - Primary exports: readSharedSession, writeSharedSession, clearSharedSession.
 */
import { getRootHostname, hostSupportsTenantSubdomains } from "./subdomain";

/** What is actually shared: enough to prove who you are, and nothing else. */
export interface SharedSession {
  accessToken: string;
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
 * off so the cookie stays host-only rather than being rejected outright.
 */
function cookieDomain(): string | null {
  if (typeof window === "undefined") return null;
  if (!hostSupportsTenantSubdomains()) return null;

  const root = getRootHostname();
  return root || null;
}

function cookieSuffix() {
  const domain = cookieDomain();
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
    if (!parsed?.accessToken || !parsed?.refreshToken) return null;

    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      tenantId: parsed.tenantId ?? null,
    };
  } catch {
    return null;
  }
}

export function writeSharedSession(session: SharedSession) {
  if (typeof document === "undefined") return;

  const value = encodeURIComponent(JSON.stringify(session));
  document.cookie = `${COOKIE_NAME}=${value}; max-age=${MAX_AGE_SECONDS}; ${cookieSuffix()}`;
}

/**
 * End the session everywhere.
 *
 * The same domain and path the cookie was written with: a delete that differs
 * in either attribute writes a second, empty cookie and leaves the real one
 * in place — which reads, from every other host, as a sign-out that did not
 * happen.
 */
export function clearSharedSession() {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE_NAME}=; max-age=0; ${cookieSuffix()}`;
}
