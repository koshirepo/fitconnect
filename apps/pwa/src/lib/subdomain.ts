/**
 * Documentation: Tenant subdomain resolution.
 *
 * - Decides whether the current host is a gym subdomain (`rudra.fitconnect.co.in`) or the app's own root host (`fitconnect.co.in`, `www.fitconnect.co.in`, `localhost`), and derives the tenant slug from it.
 * - Counting labels is not enough: `fitconnect.co.in` and `fit-pwa.pages.dev` both have three labels but are root hosts, not tenant subdomains. Resolution therefore works by stripping a known root domain — configured via `VITE_APP_ROOT_DOMAINS`, or inferred with a two-label public-suffix list.
 * - Keep this file in sync with `normalizeTenantHost` in the API's public repository; both must classify a host identically or a gym will resolve on one side and not the other.
 * - Primary exports: getTenantSlugFromHostname, isTenantSubdomain, getRootHostname, buildTenantPublicUrl, getTenantDashboardPath.
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
 * Only the suffixes this app can realistically be deployed under are listed;
 * an explicit `VITE_APP_ROOT_DOMAINS` always takes precedence.
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

/** Root domains the app is served from, e.g. "fitconnect.co.in,fitconnect.app". */
function configuredRootDomains(): string[] {
  const raw = import.meta.env.VITE_APP_ROOT_DOMAINS ?? "";
  return String(raw)
    .split(",")
    .map((entry) => normalizeHostname(entry))
    .filter(Boolean);
}

function normalizeHostname(hostname: string): string {
  return String(hostname ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^\[|\]$/g, "")
    .split(":")[0]
    .replace(/\.$/, "");
}

function isIpAddress(host: string) {
  // IPv4, or an IPv6 literal (colons are stripped by normalizeHostname, so an
  // IPv6 host arrives here as hex labels with no dots).
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || /^[0-9a-f:]+$/.test(host);
}

function isLocalHost(host: string) {
  return LOCAL_HOSTS.has(host) || host.endsWith(".local");
}

/**
 * The registrable domain for a host, honouring two-label public suffixes.
 * `rudra.fitconnect.co.in` -> `fitconnect.co.in`; `gym.fitconnect.app` -> `fitconnect.app`.
 */
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

  // `rudra.localhost` is the local development equivalent of a gym subdomain.
  if (host === "localhost" || host.endsWith(".localhost")) {
    const prefix = host === "localhost" ? null : host.slice(0, -".localhost".length);
    return { root: "localhost", prefix: prefix || null };
  }

  if (isLocalHost(host)) {
    return { root: host, prefix: null };
  }

  // An explicitly configured root domain is authoritative.
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
 * Gym slug for a host, or null when the host is the app's own root.
 * Reserved prefixes such as `www` and `api` never resolve to a gym.
 */
export function getTenantSlugFromHostname(
  hostname = typeof window !== "undefined" ? window.location.hostname : "",
) {
  const { prefix } = splitHost(hostname);

  if (!prefix || RESERVED_SUBDOMAIN_PREFIXES.has(prefix)) {
    return null;
  }

  return prefix;
}

export function isTenantSubdomain(
  hostname = typeof window !== "undefined" ? window.location.hostname : "",
) {
  return Boolean(getTenantSlugFromHostname(hostname));
}

/** The app's own host for this deployment, with any gym prefix removed. */
export function getRootHostname(
  hostname = typeof window !== "undefined" ? window.location.hostname : "",
) {
  return splitHost(hostname).root;
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
  if (!rootHost || isIpAddress(rootHost) || (isLocalHost(rootHost) && rootHost !== "localhost")) {
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
