/**
 * Documentation: Per-gym web app manifest.
 *
 * - Cloudflare Pages runs Functions before static assets, so this replaces the build's own `manifest.webmanifest` on every request without the page having to point anywhere else.
 * - A manifest must be same-origin with the document that links it, which is why this lives on the Pages project rather than on the API Worker: a gym is served from its own subdomain, so its manifest has to come from that subdomain too.
 * - The gym is resolved from the request's `Host`. Anything that is not a gym subdomain — the app root, `www`, an unknown slug, or a branding lookup that fails — falls back to the platform manifest, which is the behaviour every install had before this existed.
 * - Primary exports: onRequestGet.
 */

type BrandingResponse = {
  success?: boolean;
  data?: {
    tenant?: {
      name?: string;
      slug?: string;
      logoUrl?: string | null;
    };
  };
};

type Env = {
  /** Base URL of the API that answers `/public/branding`. */
  API_BASE_URL?: string;
  /** Comma-separated roots a gym subdomain can sit under, e.g. "fitconnect.co.in". */
  APP_ROOT_DOMAINS?: string;
};

/**
 * The slice of the Pages Functions context this handler uses.
 *
 * Declared locally so the file type-checks without pulling
 * `@cloudflare/workers-types` into the PWA, which otherwise has no need of it.
 */
type RequestContext = {
  request: Request;
  env: Env;
};

/** Hosts that are the app itself rather than a gym. */
const RESERVED_PREFIXES = new Set(["www", "api", "app", "admin", "test", "staging"]);

const DEFAULT_API_BASE_URL = "https://fitconnect-api.fitconnect.workers.dev";
const DEFAULT_ROOT_DOMAINS = "fitconnect.co.in";

/** The platform's own icons, and the fallback for a gym with no logo. */
const DEFAULT_ICONS = [
  { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
  { src: "/icons/icon-96x96.png", sizes: "96x96", type: "image/png" },
  { src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
  { src: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
  { src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
  { src: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
];

const PLATFORM_MANIFEST = {
  name: "FitConnect - Gym Management Software & Accessories Shop",
  short_name: "FitConnect",
  description:
    "All-in-one gym management software for fitness centers and health clubs. Manage members, payments, attendance, subscriptions, workout plans and shop premium gym accessories online.",
  start_url: "/dashboard",
  scope: "/",
  display: "standalone",
  orientation: "portrait-primary",
  background_color: "#09090b",
  theme_color: "#09090b",
  categories: ["fitness", "health", "business", "shopping", "lifestyle"],
  lang: "en",
  icons: DEFAULT_ICONS,
};

/**
 * The gym slug a host belongs to, or null when the host is the app's own root.
 *
 * Mirrors `tenantSlugFromHost` in the shared package. It is repeated here rather
 * than imported because Pages Functions are bundled separately from the app.
 */
function tenantSlugFromHost(host: string, rootDomains: string[]): string | null {
  const hostname = host.toLowerCase().split(":")[0];

  for (const root of rootDomains) {
    if (hostname === root) return null;
    if (!hostname.endsWith(`.${root}`)) continue;

    const prefix = hostname.slice(0, -(root.length + 1));
    // Only one level down is a gym; anything deeper is not an address we issue.
    if (!prefix || prefix.includes(".")) return null;
    if (RESERVED_PREFIXES.has(prefix)) return null;
    return prefix;
  }

  return null;
}

/**
 * Icons for a gym.
 *
 * A logo is uploaded as a 512px square JPEG, which covers both the install icon
 * and the splash screen. Older logos were stored at 200px: still above Chrome's
 * 192px install threshold, so they are offered at that size and the platform's
 * 512px icon carries the splash. A gym with no logo gets the default set, which
 * is exactly what its members see today.
 */
function iconsForTenant(logoUrl: string | null | undefined) {
  if (!logoUrl) return DEFAULT_ICONS;

  return [
    // The gym's own mark, offered first so a browser picking by order or by
    // best fit lands on it. No `type`: the upload may be a JPEG, a PNG or a
    // WebP, and naming the wrong one invites a browser to skip the very icon
    // it was told it could not render.
    { src: logoUrl, sizes: "192x192" },
    { src: logoUrl, sizes: "512x512" },

    // Those sizes are a claim about a file nobody measured — Rudra Gym's logo
    // is 400x400, declared above as both 192 and 512 — which is why the
    // platform set follows it. These are same-origin PNGs at exactly the sizes
    // they say, so whether a gym can be installed at all never rests on the
    // dimensions of an upload. A mismatch on its own costs the install prompt
    // outright; a mismatch with these behind it costs nothing.
    ...DEFAULT_ICONS,
  ];
}

function manifestResponse(body: unknown, cacheSeconds: number) {
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      // Cloudflare's cache key includes the hostname, so each gym caches its own
      // copy without a Vary header.
      "Cache-Control": `public, max-age=${cacheSeconds}`,
    },
  });
}

export const onRequestGet = async (context: RequestContext): Promise<Response> => {
  // Pages always sends a Host header; a Request built from a url in a test or
  // a dev middleware does not carry one, and the url is then the only place the
  // hostname exists. Reading both makes this work in either.
  const host =
    context.request.headers.get("host") ||
    (() => {
      try {
        return new URL(context.request.url).host;
      } catch {
        return "";
      }
    })();
  const rootDomains = (context.env.APP_ROOT_DOMAINS ?? DEFAULT_ROOT_DOMAINS)
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  const slug = tenantSlugFromHost(host, rootDomains);
  if (!slug) return manifestResponse(PLATFORM_MANIFEST, 3600);

  const apiBase = (context.env.API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/+$/, "");

  try {
    const response = await fetch(
      `${apiBase}/public/branding?host=${encodeURIComponent(host)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!response.ok) return manifestResponse(PLATFORM_MANIFEST, 300);

    const payload = (await response.json()) as BrandingResponse;
    const tenant = payload.data?.tenant;
    if (!tenant?.name) return manifestResponse(PLATFORM_MANIFEST, 300);

    return manifestResponse(
      {
        ...PLATFORM_MANIFEST,
        name: `${tenant.name} — powered by FitConnect`,
        short_name: tenant.name,
        description: `Membership, payments, and attendance for ${tenant.name}.`,
        icons: iconsForTenant(tenant.logoUrl),
      },
      3600,
    );
  } catch {
    // An install prompt showing platform branding beats one that fails to load.
    return manifestResponse(PLATFORM_MANIFEST, 60);
  }
};
