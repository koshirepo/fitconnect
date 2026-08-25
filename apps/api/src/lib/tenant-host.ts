/**
 * Documentation: Tenant host resolution for the Worker.
 *
 * - Binds the shared host-parsing logic in `@fitconnect/shared/tenant-host` to this app's configuration, so `/public/branding` and `/public/gyms/resolve` can serve a gym by its subdomain.
 * - Only the config source lives here: root domains come from `APP_ROOT_DOMAINS`, or from `APP_URL` when that is not set. The parsing itself is shared with the PWA so the two can never disagree about what counts as a gym subdomain.
 * - Primary exports: normalizeTenantHost, getRootHostname, resolveRequestTenantHost.
 */
import {
  RESERVED_SUBDOMAIN_PREFIXES,
  normalizeHostname,
  parseRootDomains,
  rootHostFromHost,
  splitHost,
  tenantSlugFromHost,
} from "@fitconnect/shared/tenant-host";

export { normalizeHostname };

/**
 * Root domains this deployment serves.
 * `APP_ROOT_DOMAINS` wins; otherwise the host of `APP_URL` is used, which is
 * already configured for password-reset links.
 */
function configuredRootDomains(): string[] {
  const explicit = parseRootDomains(process.env.APP_ROOT_DOMAINS);
  if (explicit.length > 0) return explicit;

  const host = normalizeHostname(process.env.APP_URL ?? "");
  return host ? [host.replace(/^www\./, "")] : [];
}

/**
 * Gym slug for a request host, or null when the host is the app's own root.
 * Reserved prefixes such as `www` and `api` never resolve to a gym.
 */
export function normalizeTenantHost(host: string): string | null {
  return tenantSlugFromHost(host, configuredRootDomains());
}

/** The app's own host for this deployment, with any gym prefix removed. */
export function getRootHostname(hostname: string): string {
  return rootHostFromHost(hostname, configuredRootDomains());
}

export type RequestTenantHost = {
  /** Gym slug taken from the subdomain the request was made from. */
  slug: string;
  /** The app's root host for this deployment, for building a corrective link. */
  rootHost: string;
};

/**
 * The gym context a browser request was made from, or null when it came from the
 * app root (or from a non-browser client such as the REST collection).
 *
 * `Origin` is the page the request was issued from and is set by the browser
 * itself, so it survives the API being served from its own host — unlike `Host`,
 * which in production is the API's hostname rather than the gym's. `Host` is
 * still consulted for same-origin deployments where no `Origin` is sent.
 */
export function resolveRequestTenantHost(headers: {
  origin?: string | null;
  host?: string | null;
}): RequestTenantHost | null {
  const candidate = headers.origin || headers.host || "";
  if (!candidate) return null;

  const { root, prefix } = splitHost(candidate, configuredRootDomains());

  if (!prefix || RESERVED_SUBDOMAIN_PREFIXES.has(prefix)) {
    return null;
  }

  // Keep any explicit port so a corrective link stays clickable in development,
  // where the app is served from localhost:5173 rather than port 443.
  const port = candidate.replace(/^https?:\/\//, "").match(/:(\d+)/)?.[1];

  return { slug: prefix, rootHost: port ? `${root}:${port}` : root };
}
