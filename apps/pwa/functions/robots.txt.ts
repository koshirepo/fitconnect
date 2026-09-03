/**
 * Documentation: robots.txt, told per host.
 *
 * - The static file this replaces was written for the platform and served to every gym subdomain alike. It pointed each of them at `https://fitconnect.co.in/sitemap.xml` — a sitemap for a different site — and its disallow list named apex paths (`/members`, `/payments`) that a gym subdomain does not even serve, while missing the `/dashboard/*` prefix where a gym's private screens actually live.
 * - So each host now states its own sitemap and its own private paths. Gym pages stay open — a gym's site ranking is the point of giving it one — and only the signed-in dashboard is closed.
 * - Blocking a path is not the same as keeping it out of an index: a disallowed URL can still be listed from a link elsewhere. Anything genuinely private also carries `noindex` from the app, which is the instruction that actually removes it.
 * - Primary exports: onRequestGet.
 */

type Env = { APP_ROOT_DOMAINS?: string };
type RequestContext = { request: Request; env: Env };

const DEFAULT_ROOT_DOMAINS = "fitconnect.co.in";
const RESERVED_PREFIXES = new Set(["www", "api", "app", "admin", "test", "staging"]);

function tenantSlugFromHost(host: string, rootDomains: string[]): string | null {
  const hostname = host.toLowerCase().split(":")[0];
  for (const root of rootDomains) {
    if (hostname === root) return null;
    if (!hostname.endsWith(`.${root}`)) continue;
    const prefix = hostname.slice(0, -(root.length + 1));
    if (!prefix || prefix.includes(".")) return null;
    if (RESERVED_PREFIXES.has(prefix)) return null;
    return prefix;
  }
  return null;
}

export const onRequestGet = async (context: RequestContext): Promise<Response> => {
  const url = new URL(context.request.url);
  const roots = (context.env.APP_ROOT_DOMAINS ?? DEFAULT_ROOT_DOMAINS)
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  const slug = tenantSlugFromHost(url.host, roots);

  // Private on every host. `/dashboard` is where a gym subdomain serves its
  // signed-in screens; the bare paths are the apex form of the same thing.
  const shared = [
    "/dashboard",
    "/login",
    "/forgot-password",
    "/reset-password",
    "/id-card/",
    "/api/",
  ];

  const body = slug
    ? [
        `# ${slug} — a gym on ${PLATFORM}`,
        "",
        "User-agent: *",
        "Allow: /",
        "Allow: /store",
        "",
        "# The gym's own private screens.",
        ...shared.map((path) => `Disallow: ${path}`),
        "",
        "# Checkout and order status belong to one buyer, not to an index.",
        "Disallow: /store/cart",
        "Disallow: /store/checkout",
        "Disallow: /orders/",
        "",
        `Sitemap: ${url.origin}/sitemap.xml`,
      ]
    : [
        `# ${PLATFORM} — gym management software and accessories shop`,
        `# ${url.origin}`,
        "",
        "User-agent: *",
        "Allow: /",
        "Allow: /shop",
        "Allow: /shop/products/",
        "Allow: /gyms/",
        "",
        "# Signed-in and personal screens.",
        ...shared.map((path) => `Disallow: ${path}`),
        ...[
          "/members",
          "/payments",
          "/settings",
          "/badges",
          "/workouts",
          "/subscriptions",
          "/attendance",
          "/todos",
          "/reminders",
          "/finance",
          "/audit",
          "/tenants",
          "/platform-commerce",
          "/platform-roles",
          "/platform-audit",
        ].map((path) => `Disallow: ${path}`),
        "",
        "# One buyer's basket and one buyer's order.",
        "Disallow: /shop/cart",
        "Disallow: /shop/checkout",
        "Disallow: /shop/orders",
        "",
        `Sitemap: ${url.origin}/sitemap.xml`,
      ];

  return new Response(`${body.join("\n")}\n`, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600",
    },
  });
};

const PLATFORM = "FitConnect";
