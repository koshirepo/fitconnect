/**
 * Documentation: Edge head rendering for public pages, with ISR-style caching.
 *
 * - The app is a single-page bundle: every URL is served the same `index.html`, so every URL carried the same title, description and share image. Google runs JavaScript and eventually sees the real page; WhatsApp, Facebook, Slack, LinkedIn, Twitter and Discord do not — they read the markup as delivered and stop. A gym's page and every product shared into a WhatsApp group therefore previewed as the generic platform card, which on this app is most of how a link ever gets shared.
 * - So the head is rendered here, at the edge, before the document leaves: the route is matched, the data fetched from the public API, and the tags rewritten into the static shell with `HTMLRewriter`. The body is still the SPA's to render — this is not server-side rendering of content, and does not pretend to be. It is the half that crawlers actually read.
 * - Incremental regeneration is the Cache API rather than a framework feature. A rendered document is cached at the edge for a short window and served stale while it revalidates behind the request, so a product edit shows up on its own without a deploy, and a burst of shares costs one origin fetch rather than one each. `x-seo-cache` on the response says which of the three happened.
 * - A failure here must never cost a page view. Every fetch is time-boxed and every error falls through to the unmodified shell, which is exactly what shipped before this file existed.
 * - Primary exports: onRequest.
 */

/**
 * The slice of the Workers runtime this file uses.
 *
 * Declared here rather than by depending on `@cloudflare/workers-types`, which
 * the PWA otherwise has no use for and which would apply to the whole app.
 */
declare const HTMLRewriter: {
  new (): HtmlRewriter;
};

type HtmlRewriterHandlers = {
  element(element: {
    setAttribute(name: string, value: string): void;
    setInnerContent(content: string): void;
    append(content: string, options?: { html?: boolean }): void;
  }): void;
};

type HtmlRewriter = {
  on(selector: string, handlers: HtmlRewriterHandlers): HtmlRewriter;
  transform(response: Response): Response;
};

type Env = {
  /** Base URL of the API that answers the public endpoints. */
  API_BASE_URL?: string;
  /** Comma-separated roots a gym subdomain can sit under. */
  APP_ROOT_DOMAINS?: string;
};

type RequestContext = {
  request: Request;
  env: Env;
  next: () => Promise<Response>;
  waitUntil: (promise: Promise<unknown>) => void;
};

const DEFAULT_API_BASE_URL = "https://fitconnect-api.fitconnect.workers.dev";
const DEFAULT_ROOT_DOMAINS = "fitconnect.co.in";
const RESERVED_PREFIXES = new Set(["www", "api", "app", "admin", "test", "staging"]);

/** How long a rendered document is fresh, and how long it may be served stale. */
const FRESH_SECONDS = 300;
const STALE_SECONDS = 86_400;

/** Nothing upstream is worth delaying a page for. */
const FETCH_TIMEOUT_MS = 1500;

const PLATFORM_NAME = "FitConnect";

type Seo = {
  title: string;
  description: string;
  image?: string;
  type?: "website" | "product" | "profile";
  canonical: string;
  jsonLd?: Record<string, unknown>;
  noIndex?: boolean;
};

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

/** Collapse prose to a description that reads as a sentence, not a truncation. */
function summarise(text: string | null | undefined, fallback: string, max = 155): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return fallback;
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const boundary = cut.lastIndexOf(" ");
  return `${cut.slice(0, boundary > 60 ? boundary : max)}…`;
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
    // A slow or broken API must not take the page with it.
    return null;
  }
}

/**
 * What this URL is, and what should be said about it.
 *
 * Returns null for anything with no public identity of its own — a checkout, a
 * cart, a signed-in screen — which is left to the shell and marked `noindex` by
 * the app itself.
 */
async function describe(
  url: URL,
  slug: string | null,
  api: string,
): Promise<Seo | null> {
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const canonical = `${url.origin}${path === "/" ? "/" : path}`;

  // ── A gym's own site ──────────────────────────────────────────────────────
  if (slug) {
    const gym = await getJson<{
      data?: { tenant?: { name?: string; description?: string; address?: string; logoUrl?: string } };
    }>(`${api}/public/gyms/${encodeURIComponent(slug)}`);

    const tenant = gym?.data?.tenant;
    if (!tenant?.name) return null;

    const where = tenant.address ? ` in ${tenant.address}` : "";

    // A product in that gym's own store.
    const storeProduct = path.match(/^\/store\/products\/([^/]+)$/);
    if (storeProduct) {
      const product = await getJson<{
        data?: { product?: { name?: string; description?: string; photos?: string[]; price?: number } };
      }>(
        `${api}/public/store/products/${encodeURIComponent(storeProduct[1]!)}?host=${encodeURIComponent(url.host)}`,
      );

      const item = product?.data?.product;
      if (item?.name) {
        return {
          title: `${item.name} — ${tenant.name}`,
          description: summarise(item.description, `Buy ${item.name} at ${tenant.name}.`),
          image: item.photos?.[0],
          type: "product",
          canonical,
          jsonLd: {
            "@context": "https://schema.org",
            "@type": "Product",
            name: item.name,
            description: summarise(item.description, item.name),
            image: item.photos ?? [],
            ...(item.price
              ? {
                  offers: {
                    "@type": "Offer",
                    price: item.price,
                    priceCurrency: "INR",
                    availability: "https://schema.org/InStock",
                    url: canonical,
                  },
                }
              : {}),
          },
        };
      }
    }

    if (path === "/store") {
      return {
        title: `Store — ${tenant.name}`,
        description: `Shop supplements, apparel and accessories at ${tenant.name}${where}. Collect at the gym or pay online.`,
        image: tenant.logoUrl,
        canonical,
      };
    }

    if (path === "/" || path === "/signup") {
      const joining = path === "/signup";
      return {
        title: joining ? `Join ${tenant.name}` : tenant.name,
        description: summarise(
          tenant.description,
          joining
            ? `Become a member of ${tenant.name}${where}. Choose a plan and join online in minutes.`
            : `${tenant.name}${where}. Memberships, timings, facilities and the gym store.`,
        ),
        image: tenant.logoUrl,
        type: "profile",
        canonical,
        jsonLd: {
          "@context": "https://schema.org",
          "@type": "HealthAndBeautyBusiness",
          additionalType: "https://schema.org/ExerciseGym",
          name: tenant.name,
          url: `${url.origin}/`,
          ...(tenant.description ? { description: summarise(tenant.description, tenant.name) } : {}),
          ...(tenant.logoUrl ? { image: tenant.logoUrl } : {}),
          ...(tenant.address ? { address: tenant.address } : {}),
        },
      };
    }

    return null;
  }

  // ── The platform's own shop ───────────────────────────────────────────────
  const shopProduct = path.match(/^\/shop\/products\/([^/]+)$/);
  if (shopProduct) {
    const product = await getJson<{
      data?: {
        product?: {
          name?: string;
          description?: string;
          photos?: string[];
          price?: number;
          stock?: number;
        };
      };
    }>(`${api}/products/${encodeURIComponent(shopProduct[1]!)}`);

    const item = product?.data?.product;
    if (!item?.name) return null;

    return {
      title: item.name,
      description: summarise(
        item.description,
        `Buy ${item.name} online at ${PLATFORM_NAME}. Fast delivery across India.`,
      ),
      image: item.photos?.[0],
      type: "product",
      canonical,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Product",
        name: item.name,
        description: summarise(item.description, item.name),
        image: item.photos ?? [],
        ...(item.price
          ? {
              offers: {
                "@type": "Offer",
                price: item.price,
                priceCurrency: "INR",
                availability:
                  (item.stock ?? 0) > 0
                    ? "https://schema.org/InStock"
                    : "https://schema.org/OutOfStock",
                url: canonical,
              },
            }
          : {}),
      },
    };
  }

  // A gym's public profile on the platform host.
  const gymProfile = path.match(/^\/gyms\/([^/]+)$/);
  if (gymProfile) {
    const gym = await getJson<{
      data?: { tenant?: { name?: string; description?: string; address?: string; logoUrl?: string } };
    }>(`${api}/public/gyms/${encodeURIComponent(gymProfile[1]!)}`);

    const tenant = gym?.data?.tenant;
    if (!tenant?.name) return null;

    return {
      title: tenant.name,
      description: summarise(
        tenant.description,
        `${tenant.name}${tenant.address ? ` in ${tenant.address}` : ""}. Memberships, timings and facilities.`,
      ),
      image: tenant.logoUrl,
      type: "profile",
      canonical,
    };
  }

  return null;
}

/** Rewrite the shell's head to describe this page instead of the app. */
function render(response: Response, seo: Seo): Response {
  const title = `${seo.title} | ${PLATFORM_NAME}`;
  const image = seo.image || `${new URL(seo.canonical).origin}/icons/og-image.png`;

  const replacements: Record<string, string> = {
    'meta[name="title"]': title,
    'meta[name="description"]': seo.description,
    'meta[property="og:title"]': title,
    'meta[property="og:description"]': seo.description,
    'meta[property="og:url"]': seo.canonical,
    'meta[property="og:image"]': image,
    'meta[property="og:type"]': seo.type ?? "website",
    'meta[name="twitter:title"]': title,
    'meta[name="twitter:description"]': seo.description,
    'meta[name="twitter:image"]': image,
    'meta[name="twitter:url"]': seo.canonical,
  };

  let rewriter = new HTMLRewriter()
    .on("title", {
      element(element) {
        element.setInnerContent(title);
      },
    })
    .on('link[rel="canonical"]', {
      element(element) {
        element.setAttribute("href", seo.canonical);
      },
    });

  for (const [selector, content] of Object.entries(replacements)) {
    rewriter = rewriter.on(selector, {
      element(element) {
        element.setAttribute("content", content);
      },
    });
  }

  if (seo.noIndex) {
    rewriter = rewriter.on('meta[name="robots"]', {
      element(element) {
        element.setAttribute("content", "noindex, nofollow");
      },
    });
  }

  // Appended rather than replacing the shell's own blocks: the platform's
  // SoftwareApplication and Store entries stay true on every page, and a second
  // node is how schema.org expects a page to describe more than one thing.
  if (seo.jsonLd) {
    const block = `<script type="application/ld+json">${JSON.stringify(seo.jsonLd).replace(
      /</g,
      "\\u003c",
    )}</script>`;
    rewriter = rewriter.on("head", {
      element(element) {
        element.append(block, { html: true });
      },
    });
  }

  return rewriter.transform(response);
}

export const onRequest = async (context: RequestContext): Promise<Response> => {
  const { request, env, next, waitUntil } = context;
  const url = new URL(request.url);

  // Documents only. Assets, API calls and anything non-GET go straight through.
  const wantsHtml = (request.headers.get("accept") ?? "").includes("text/html");
  if (request.method !== "GET" || !wantsHtml) return next();

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(url.toString(), { method: "GET" });

  const hit = await cache.match(cacheKey);
  if (hit) {
    const age = Number(hit.headers.get("x-seo-age") ?? "0");
    const cachedAt = Number(hit.headers.get("x-seo-at") ?? "0");
    const seconds = cachedAt ? (Date.now() - cachedAt) / 1000 : age;

    if (seconds < FRESH_SECONDS) {
      const fresh = new Response(hit.body, hit);
      fresh.headers.set("x-seo-cache", "hit");
      return fresh;
    }

    // Stale but usable: answer now, refresh behind the request. This is the
    // regeneration half — a product edit lands within a revalidation rather
    // than waiting for a deploy.
    waitUntil(
      (async () => {
        try {
          const rebuilt = await build(context, url, env);
          if (rebuilt) await cache.put(cacheKey, rebuilt);
        } catch {
          // Keep serving what we have.
        }
      })(),
    );

    const stale = new Response(hit.body, hit);
    stale.headers.set("x-seo-cache", "stale");
    return stale;
  }

  const built = await build(context, url, env);
  if (!built) return next();

  waitUntil(cache.put(cacheKey, built.clone()));

  const response = new Response(built.body, built);
  response.headers.set("x-seo-cache", "miss");
  return response;
};

/** Fetch the shell, describe the page, and return the rendered document. */
async function build(
  context: RequestContext,
  url: URL,
  env: Env,
): Promise<Response | null> {
  const api = (env.API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/$/, "");
  const roots = (env.APP_ROOT_DOMAINS ?? DEFAULT_ROOT_DOMAINS)
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  const slug = tenantSlugFromHost(url.host, roots);

  let seo: Seo | null = null;
  try {
    seo = await describe(url, slug, api);
  } catch {
    seo = null;
  }

  const shell = await context.next();
  if (!seo) return null;

  const contentType = shell.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return null;

  const rendered = render(shell, seo);
  const response = new Response(rendered.body, rendered);

  response.headers.set(
    "cache-control",
    `public, max-age=0, s-maxage=${FRESH_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`,
  );
  response.headers.set("x-seo-at", String(Date.now()));
  return response;
}
