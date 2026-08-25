/**
 * Documentation: Tenant subdomain resolution for the PWA.
 *
 * - Binds the shared host-parsing logic in `@fitconnect/shared/tenant-host` to this app's configuration, and adds the browser-only helpers for building gym URLs and dashboard paths.
 * - Only the config source lives here: root domains come from `VITE_APP_ROOT_DOMAINS`. The parsing itself is shared with the API so the two can never disagree about what counts as a gym subdomain.
 * - Primary exports: getTenantSlugFromHostname, isTenantSubdomain, getRootHostname, buildTenantPublicUrl, getTenantDashboardPath.
 */
import {
  isIpAddress,
  isLocalHost,
  normalizeHostname,
  parseRootDomains,
  rootHostFromHost,
  tenantSlugFromHost,
} from "@fitconnect/shared/tenant-host";

/** Root domains this build is served from, e.g. "fitconnect.co.in,fitconnect.app". */
function configuredRootDomains(): string[] {
  return parseRootDomains(import.meta.env.VITE_APP_ROOT_DOMAINS);
}

function currentHostname() {
  return typeof window !== "undefined" ? window.location.hostname : "";
}

/**
 * Gym slug for a host, or null when the host is the app's own root.
 * Reserved prefixes such as `www` and `api` never resolve to a gym.
 */
export function getTenantSlugFromHostname(hostname = currentHostname()) {
  return tenantSlugFromHost(hostname, configuredRootDomains());
}

export function isTenantSubdomain(hostname = currentHostname()) {
  return Boolean(getTenantSlugFromHostname(hostname));
}

/** The app's own host for this deployment, with any gym prefix removed. */
export function getRootHostname(hostname = currentHostname()) {
  return rootHostFromHost(hostname, configuredRootDomains());
}

/** Public URL for a gym, on the same protocol, root domain, and port as the caller. */
export function buildTenantPublicUrl(
  slug: string,
  origin = typeof window !== "undefined" ? window.location.origin : "https://fitconnect.co.in",
) {
  const parsedOrigin = new URL(origin);
  const rootHost = getRootHostname(parsedOrigin.hostname);
  const port = parsedOrigin.port ? `:${parsedOrigin.port}` : "";

  // An IP or bare local host has no room for a subdomain; fall back to the
  // slug-path form of the public profile so the link still resolves.
  if (
    !rootHost ||
    isIpAddress(normalizeHostname(rootHost)) ||
    (isLocalHost(rootHost) && rootHost !== "localhost")
  ) {
    return `${parsedOrigin.protocol}//${parsedOrigin.host}/gyms/${slug}`;
  }

  return `${parsedOrigin.protocol}//${slug}.${rootHost}${port}`;
}

/**
 * Map an apex-relative dashboard path onto its gym-subdomain equivalent.
 * On a gym subdomain the dashboard lives under `/dashboard`, so `/members`
 * becomes `/dashboard/members`.
 */
export function getTenantDashboardPath(path = "/") {
  if (!isTenantSubdomain()) {
    return path;
  }

  const normalizedPath = path === "/" ? "" : path.startsWith("/") ? path : `/${path}`;
  if (!normalizedPath || normalizedPath === "/dashboard") {
    return "/dashboard";
  }

  if (normalizedPath.startsWith("/dashboard")) {
    return normalizedPath;
  }

  return `/dashboard${normalizedPath}`;
}
