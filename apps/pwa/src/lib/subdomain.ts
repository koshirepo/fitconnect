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
 * A URL for a path on the app's own host, from wherever you are standing.
 *
 * Platform work — the tenant list, platform roles and audit, the shop and its
 * warehouses — is not gym-scoped and exists only on the app host. A link to it
 * written on a gym subdomain has to leave that subdomain, so it needs a whole
 * URL rather than a path. Same protocol and port; only the hostname changes.
 *
 * Falls back to the plain path when the host cannot carry a subdomain at all
 * (an IP, or a bare local host), where the app host is the current one anyway.
 */
export function buildApexUrl(
  path = "/",
  origin = typeof window !== "undefined" ? window.location.origin : "",
) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!origin) return normalizedPath;

  const parsedOrigin = new URL(origin);
  const rootHost = getRootHostname(parsedOrigin.hostname);
  if (!rootHost || rootHost === parsedOrigin.hostname) return normalizedPath;

  const port = parsedOrigin.port ? `:${parsedOrigin.port}` : "";
  return `${parsedOrigin.protocol}//${rootHost}${port}${normalizedPath}`;
}

/**
 * Top-level segments that live only on the app host.
 *
 * Kept beside the tenant helpers because the two lists answer the same
 * question from opposite sides: this one is what a gym subdomain does not
 * serve, and must hand back to the app host.
 */
export const APEX_ONLY_SEGMENTS = new Set([
  "tenants",
  "platform-roles",
  "platform-audit",
  "platform-commerce",
  "shop",
]);

/**
 * Rewrite a path to its gym-subdomain form, regardless of the current host.
 * On a gym subdomain the dashboard lives under `/dashboard`, so `/members`
 * becomes `/dashboard/members`.
 */
export function toTenantDashboardPath(path = "/") {
  const normalizedPath = path === "/" ? "" : path.startsWith("/") ? path : `/${path}`;
  if (!normalizedPath || normalizedPath === "/dashboard") {
    return "/dashboard";
  }

  if (normalizedPath.startsWith("/dashboard")) {
    return normalizedPath;
  }

  return `/dashboard${normalizedPath}`;
}

/**
 * Map an apex-relative dashboard path onto its gym-subdomain equivalent, but
 * only when already on a gym subdomain. Used by in-app links, which must stay
 * relative to whichever host the user is currently on.
 */
export function getTenantDashboardPath(path = "/") {
  return isTenantSubdomain() ? toTenantDashboardPath(path) : path;
}

/**
 * True when this host can carry a gym subdomain at all.
 * An IP address cannot, which is why local development should use
 * `http://<slug>.localhost:5173` rather than `http://127.0.0.1:5173`.
 */
export function hostSupportsTenantSubdomains(
  hostname = typeof window !== "undefined" ? window.location.hostname : "",
) {
  const root = getRootHostname(hostname);
  return Boolean(root) && !isIpAddress(normalizeHostname(root));
}

/**
 * Absolute URL for a path on a gym's own subdomain, or null when this host
 * cannot carry one.
 */
export function buildTenantDashboardUrl(
  slug: string,
  path = "/",
  origin = typeof window !== "undefined" ? window.location.origin : "",
) {
  if (!origin || !hostSupportsTenantSubdomains(new URL(origin).hostname)) {
    return null;
  }

  const parsedOrigin = new URL(origin);
  const rootHost = getRootHostname(parsedOrigin.hostname);
  const port = parsedOrigin.port ? `:${parsedOrigin.port}` : "";

  return `${parsedOrigin.protocol}//${slug}.${rootHost}${port}${toTenantDashboardPath(path)}`;
}
