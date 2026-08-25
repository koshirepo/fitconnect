/**
 * Documentation: Gym subdomain host parsing.
 *
 * - Decides whether a hostname is a gym subdomain (`rudra.fitconnect.co.in`) or the app's own root (`fitconnect.co.in`, `www.fitconnect.co.in`, `localhost`), and extracts the gym slug.
 * - Counting labels is not enough: `fitconnect.co.in` and `fit-pwa.pages.dev` both have three labels but are root hosts, not gym subdomains. Resolution works by stripping a known root domain, with a two-label public-suffix list as the fallback.
 * - Root domains are a parameter rather than read from the environment, because the API reads `process.env` and the PWA reads `import.meta.env`. Each app supplies its own config to the same logic — this file is the single definition both sides share, so the two can no longer drift apart.
 * - Primary exports: normalizeHostname, splitHost, tenantSlugFromHost, rootHostFromHost, isIpAddress, isLocalHost, RESERVED_SUBDOMAIN_PREFIXES.
 */

/** Subdomains that belong to the platform itself and can never be a gym slug. */
export const RESERVED_SUBDOMAIN_PREFIXES = new Set([
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
 * An explicitly configured root domain always takes precedence over this list.
 */
export const TWO_LABEL_PUBLIC_SUFFIXES = new Set([
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

/** Strip protocol, path, brackets, port, and trailing dot from a host-ish string. */
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

export function isIpAddress(host: string): boolean {
  // IPv4, or an IPv6 literal (the port split above removes colons, so an IPv6
  // host arrives here as hex labels with no dots).
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || /^[0-9a-f:]+$/.test(host);
}

export function isLocalHost(host: string): boolean {
  return LOCAL_HOSTS.has(host) || host.endsWith(".local");
}

/**
 * The registrable domain for a host, honouring two-label public suffixes.
 * `rudra.fitconnect.co.in` -> `fitconnect.co.in`; `gym.fitconnect.app` -> `fitconnect.app`.
 */
export function registrableDomain(host: string): string {
  const segments = host.split(".");
  if (segments.length <= 2) return host;

  const lastTwo = segments.slice(-2).join(".");
  const labelCount = TWO_LABEL_PUBLIC_SUFFIXES.has(lastTwo) ? 3 : 2;

  return segments.slice(-labelCount).join(".");
}

export type HostParts = {
  /** The app's own host for this deployment. */
  root: string;
  /** The label in front of the root, or null when the host *is* the root. */
  prefix: string | null;
};

/**
 * Split a host into its root domain and the label in front of it.
 * `rootDomains` is the deployment's configured list; when it is empty the
 * public-suffix fallback decides where the root begins.
 */
export function splitHost(hostname: string, rootDomains: readonly string[] = []): HostParts {
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
  for (const configured of rootDomains) {
    const root = normalizeHostname(configured);
    if (!root) continue;
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
export function tenantSlugFromHost(
  hostname: string,
  rootDomains: readonly string[] = [],
): string | null {
  const { prefix } = splitHost(hostname, rootDomains);

  if (!prefix || RESERVED_SUBDOMAIN_PREFIXES.has(prefix)) {
    return null;
  }

  return prefix;
}

/** The app's own host for this deployment, with any gym prefix removed. */
export function rootHostFromHost(
  hostname: string,
  rootDomains: readonly string[] = [],
): string {
  return splitHost(hostname, rootDomains).root;
}

/** Parse a comma-separated root-domain setting into a normalized list. */
export function parseRootDomains(value: string | null | undefined): string[] {
  return String(value ?? "")
    .split(",")
    .map((entry) => normalizeHostname(entry))
    .filter(Boolean);
}
