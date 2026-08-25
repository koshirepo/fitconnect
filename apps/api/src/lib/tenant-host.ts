/**
 * Documentation: Tenant host resolution.
 *
 * - Derives a gym slug from a request host so `/public/branding` and `/public/gyms/resolve` can serve a gym by its subdomain.
 * - Counting labels is not enough: `fitconnect.co.in` and `fit-pwa.pages.dev` both have three labels but are root hosts, not gym subdomains. Resolution therefore strips a known root domain — configured via `APP_ROOT_DOMAINS` (or inferred from `APP_URL`), with a two-label public-suffix list as the fallback.
 * - Keep this file in sync with the PWA's `src/lib/subdomain.ts`; both must classify a host identically or a gym will resolve on one side and not the other.
 * - Primary exports: normalizeTenantHost, getRootHostname, resolveRequestTenantHost.
 */

/** Subdomains that belong to the platform itself and can never be a gym slug. */
const RESERVED_SUBDOMAIN_PREFIXES = new Set([
  "www",
  "app",
  "api",
  "admin",
  "platform",
  "dashboard",
  "staging",
  "preview",
  "dev",
]);

/**
 * Public suffixes that occupy two labels. Without these, `fitconnect.co.in`
 * looks like the subdomain "fitconnect" of the domain "co.in".
 */
const TWO_LABEL_PUBLIC_SUFFIXES = new Set([
  "co.in",
  "net.in",
  "org.in",
  "firm.in",
  "gen.in",
  "ind.in",
  "co.uk",
  "org.uk",
  "me.uk",
  "com.au",
  "net.au",
  "org.au",
  "co.nz",
  "com.br",
  "com.sg",
  "co.za",
  "pages.dev",
  "workers.dev",
  "vercel.app",
  "netlify.app",
  "github.io",
]);

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

export function normalizeHostname(hostname: string): string {
  return String(hostname ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^\[|\]$/g, "")
    .split(":")[0]
    .replace(/\.$/, "");
}

/**
 * Root domains this deployment serves.
 * `APP_ROOT_DOMAINS` wins; otherwise the host of `APP_URL` is used, which is
 * already configured for password-reset links.
 */
function configuredRootDomains(): string[] {
  const explicit = process.env.APP_ROOT_DOMAINS;
  if (explicit) {
    return explicit
      .split(",")
      .map((entry) => normalizeHostname(entry))
      .filter(Boolean);
  }

  const appUrl = process.env.APP_URL;
  if (!appUrl) return [];

  const host = normalizeHostname(appUrl);
  return host ? [host.replace(/^www\./, "")] : [];
}

function isIpAddress(host: string) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || /^[0-9a-f:]+$/.test(host);
}

function isLocalHost(host: string) {
  return LOCAL_HOSTS.has(host) || host.endsWith(".local");
}

/** The registrable domain for a host, honouring two-label public suffixes. */
function registrableDomain(host: string): string {
  const segments = host.split(".");
  if (segments.length <= 2) return host;

  const lastTwo = segments.slice(-2).join(".");
  const labelCount = TWO_LABEL_PUBLIC_SUFFIXES.has(lastTwo) ? 3 : 2;

  return segments.slice(-labelCount).join(".");
}

/**
 * Split a host into its root domain and the label in front of it.
 * Returns a null prefix when the host *is* the root domain.
 */
function splitHost(hostname: string): { root: string; prefix: string | null } {
  const host = normalizeHostname(hostname);

  if (!host || isIpAddress(host)) {
    return { root: host, prefix: null };
  }

  if (host === "localhost" || host.endsWith(".localhost")) {
    const prefix = host === "localhost" ? null : host.slice(0, -".localhost".length);
    return { root: "localhost", prefix: prefix || null };
  }

  if (isLocalHost(host)) {
    return { root: host, prefix: null };
  }

  for (const root of configuredRootDomains()) {
    if (host === root) return { root, prefix: null };
    if (host.endsWith(`.${root}`)) {
      const prefix = host.slice(0, -(root.length + 1));
      return { root, prefix: prefix.split(".")[0] || null };
    }
  }

  const root = registrableDomain(host);
  if (host === root) return { root, prefix: null };

  const prefix = host.slice(0, -(root.length + 1));
  return { root, prefix: prefix.split(".")[0] || null };
}

/**
 * Gym slug for a request host, or null when the host is the app's own root.
 * Reserved prefixes such as `www` and `api` never resolve to a gym.
 */
export function normalizeTenantHost(host: string): string | null {
  const { prefix } = splitHost(host);

  if (!prefix || RESERVED_SUBDOMAIN_PREFIXES.has(prefix)) {
    return null;
  }

  return prefix;
}

/** The app's own host for this deployment, with any gym prefix removed. */
export function getRootHostname(hostname: string): string {
  return splitHost(hostname).root;
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

  const { root, prefix } = splitHost(candidate);

  if (!prefix || RESERVED_SUBDOMAIN_PREFIXES.has(prefix)) {
    return null;
  }

  // Keep any explicit port so a corrective link stays clickable in development,
  // where the app is served from localhost:5173 rather than port 443.
  const port = candidate.replace(/^https?:\/\//, "").match(/:(\d+)/)?.[1];

  return { slug: prefix, rootHost: port ? `${root}:${port}` : root };
}
