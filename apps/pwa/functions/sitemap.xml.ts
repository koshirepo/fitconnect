/**
 * Documentation: The sitemap, built from what the shop actually sells.
 *
 * - The file this replaces was written by hand and listed six URLs. It named no product and no gym, which are the only pages on this site with anything to rank for, and its `lastmod` was whatever date somebody last edited it. A crawler reading it learned that the homepage exists.
 * - A gym subdomain gets its own sitemap, listing that gym and its store. `rudra-gym.fitconnect.co.in/sitemap.xml` describing the platform's catalog would be pointing a crawler at a different site.
 * - The API is asked for the real list on a cached request. If it cannot answer, the static pages are still returned rather than an error: half a sitemap is worth more than a 500, and a crawler that gets a 500 backs off the whole file.
 * - Primary exports: onRequestGet.
 */

type Env = {
  API_BASE_URL?: string;
  APP_ROOT_DOMAINS?: string;
};

type RequestContext = { request: Request; env: Env };

const DEFAULT_API_BASE_URL = "https://fitconnect-api.fitconnect.workers.dev";
const DEFAULT_ROOT_DOMAINS = "fitconnect.co.in";
const RESERVED_PREFIXES = new Set(["www", "api", "app", "admin", "test", "staging"]);

const FETCH_TIMEOUT_MS = 3000;
/** Long enough that crawling does not hammer the API, short enough to stay true. */
const CACHE_SECONDS = 3600;

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

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

type Entry = {
  path: string;
  changefreq: "daily" | "weekly" | "monthly" | "yearly";
  priority: string;
  lastmod?: string;
  image?: { loc: string; title: string };
};

function urlNode(origin: string, entry: Entry): string {
  const parts = [
    `    <loc>${xmlEscape(origin + entry.path)}</loc>`,
    entry.lastmod ? `    <lastmod>${entry.lastmod.slice(0, 10)}</lastmod>` : "",
    `    <changefreq>${entry.changefreq}</changefreq>`,
    `    <priority>${entry.priority}</priority>`,
    entry.image
      ? `    <image:image>\n      <image:loc>${xmlEscape(entry.image.loc)}</image:loc>\n      <image:title>${xmlEscape(entry.image.title)}</image:title>\n    </image:image>`
      : "",
  ].filter(Boolean);

  return `  <url>\n${parts.join("\n")}\n  </url>`;
}

export const onRequestGet = async (context: RequestContext): Promise<Response> => {
  const { request, env } = context;
  const url = new URL(request.url);
  const origin = url.origin;

  const api = (env.API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/$/, "");
  const roots = (env.APP_ROOT_DOMAINS ?? DEFAULT_ROOT_DOMAINS)
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  const slug = tenantSlugFromHost(url.host, roots);
  const entries: Entry[] = [];

  if (slug) {
    // A gym's own site: the gym, joining it, and its store.
    entries.push(
      { path: "/", changefreq: "weekly", priority: "1.0" },
      { path: "/signup", changefreq: "monthly", priority: "0.8" },
      { path: "/store", changefreq: "daily", priority: "0.9" },
    );

    const store = await getJson<{
      data?: { products?: Array<{ id: string; name: string; updatedAt?: string; photos?: string[] }> };
    }>(`${api}/public/store?host=${encodeURIComponent(url.host)}`);

    for (const product of store?.data?.products ?? []) {
      entries.push({
        path: `/store/products/${product.id}`,
        changefreq: "weekly",
        priority: "0.7",
        lastmod: product.updatedAt,
        ...(product.photos?.[0]
          ? { image: { loc: product.photos[0], title: product.name } }
          : {}),
      });
    }
  } else {
    // The platform: marketing, the shop, every product, and every gym.
    entries.push(
      { path: "/", changefreq: "weekly", priority: "1.0" },
      { path: "/shop", changefreq: "daily", priority: "0.9" },
      { path: "/about", changefreq: "monthly", priority: "0.5" },
      { path: "/contact", changefreq: "monthly", priority: "0.5" },
      { path: "/register-gym", changefreq: "monthly", priority: "0.8" },
    );

    const [products, gyms] = await Promise.all([
      getJson<{
        data?: { products?: Array<{ id: string; name: string; updatedAt?: string; photos?: string[] }> };
      }>(`${api}/products?page=1&limit=200`),
      getJson<{ data?: { gyms?: Array<{ slug: string; updatedAt?: string }> } }>(
        `${api}/public/gyms?page=1&limit=200`,
      ),
    ]);

    for (const product of products?.data?.products ?? []) {
      entries.push({
        path: `/shop/products/${product.id}`,
        changefreq: "weekly",
        priority: "0.8",
        lastmod: product.updatedAt,
        ...(product.photos?.[0]
          ? { image: { loc: product.photos[0], title: product.name } }
          : {}),
      });
    }

    for (const gym of gyms?.data?.gyms ?? []) {
      entries.push({
        path: `/gyms/${gym.slug}`,
        changefreq: "weekly",
        priority: "0.7",
        lastmod: gym.updatedAt,
      });
    }
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${entries.map((entry) => urlNode(origin, entry)).join("\n")}
</urlset>
`;

  return new Response(body, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": `public, max-age=0, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=86400`,
    },
  });
};
