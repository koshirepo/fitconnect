/**
 * Documentation: Per-page document head.
 *
 * - `index.html` carries one title, one description and one canonical for the whole app. That is right for the landing page and wrong everywhere else: a product, a gym's public page and the catalog all told Google and every share preview the same thing, so nothing but the homepage could rank for what it actually is.
 * - Written by hand rather than pulled in with react-helmet: the whole job is upserting a dozen elements, and a head library brings a provider, a render-tree dependency and its own reconciliation for that. Every tag written here is marked `data-seo`, and each render clears the previous page's before writing its own — which is what stops a stale product description surviving a client-side navigation.
 * - `noIndex` matters more than any of the descriptions. A member's ID card and a guest's order-status page are addressable by anyone holding the link, which is the point, but neither belongs in an index — and `robots.txt` cannot reach the `/dashboard` paths a gym subdomain serves.
 * - Only helps crawlers that run JavaScript. Google does; WhatsApp, Facebook, Slack and Twitter do not, and read the static markup instead — so share previews still need the meta injected at the edge, which is not this file's job.
 * - Primary exports: useSeo, absoluteUrl, PLATFORM_NAME.
 */
import * as React from "react";

export const PLATFORM_NAME = "FitConnect";

/** Where the deployment lives, for canonicals and share images. */
const SITE_ORIGIN =
  (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.replace(/\/$/, "") ??
  "https://fitconnect.co.in";

const DEFAULT_IMAGE = `${SITE_ORIGIN}/icons/og-image.png`;

/**
 * A path made absolute against the host the visitor is actually on.
 *
 * A gym is served from its own subdomain, so a canonical built from the
 * platform origin would point every gym's page at a URL that does not serve it.
 * The current origin is the honest answer; the configured one is the fallback
 * for a build with no window.
 */
export function absoluteUrl(path = "/"): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (typeof window === "undefined") return `${SITE_ORIGIN}${normalized}`;
  return `${window.location.origin}${normalized}`;
}

type SeoInput = {
  /** Page title, without the site name — that is appended. */
  title: string;
  description?: string;
  /** Path this page should be indexed under. Defaults to the current one. */
  canonicalPath?: string;
  image?: string;
  /** "website" for pages, "article" for content, "product" for a product. */
  type?: "website" | "article" | "product";
  keywords?: string;
  /**
   * Keep this page out of search results.
   *
   * For anything reachable by link but personal — an ID card, someone's order,
   * a checkout — and for every signed-in screen.
   */
  noIndex?: boolean;
  /** Schema.org JSON-LD. Serialised and written as its own script tag. */
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
  /** Title used verbatim, without the site name appended. */
  exactTitle?: boolean;
};

const MANAGED = "data-seo";

function upsert(
  selector: string,
  create: () => HTMLElement,
  apply: (element: HTMLElement) => void,
) {
  let element = document.head.querySelector<HTMLElement>(selector);
  if (!element) {
    element = create();
    element.setAttribute(MANAGED, "");
    document.head.appendChild(element);
  }
  apply(element);
}

function meta(name: string, content: string, attribute: "name" | "property" = "name") {
  if (!content) return;
  upsert(
    `meta[${attribute}="${name}"]`,
    () => {
      const element = document.createElement("meta");
      element.setAttribute(attribute, name);
      return element;
    },
    (element) => element.setAttribute("content", content),
  );
}

/**
 * Describe the current page to crawlers and share previews.
 *
 * Call it once per screen, with values already resolved — a title built from
 * data still loading will be written and then written again, which is fine, but
 * a title of "undefined" is not.
 */
export function useSeo(input: SeoInput) {
  const {
    title,
    description,
    canonicalPath,
    image = DEFAULT_IMAGE,
    type = "website",
    keywords,
    noIndex = false,
    jsonLd,
    exactTitle = false,
  } = input;

  // Serialised so the effect compares by value: a jsonLd object rebuilt on
  // every render would otherwise rewrite the head on every render.
  const jsonLdText = jsonLd ? JSON.stringify(jsonLd) : "";

  React.useEffect(() => {
    const fullTitle = exactTitle ? title : `${title} | ${PLATFORM_NAME}`;
    const url = absoluteUrl(
      canonicalPath ?? (typeof window !== "undefined" ? window.location.pathname : "/"),
    );

    document.title = fullTitle;

    // The previous page's tags go before this page's are written, so nothing
    // survives a navigation that no longer describes what is on screen.
    document.head
      .querySelectorAll(`[${MANAGED}]`)
      .forEach((element) => element.remove());

    meta("title", fullTitle);
    if (description) meta("description", description);
    if (keywords) meta("keywords", keywords);

    meta(
      "robots",
      noIndex
        ? "noindex, nofollow"
        : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
    );

    meta("og:type", type, "property");
    meta("og:title", fullTitle, "property");
    if (description) meta("og:description", description, "property");
    meta("og:url", url, "property");
    meta("og:image", image, "property");
    meta("og:site_name", PLATFORM_NAME, "property");

    meta("twitter:card", "summary_large_image");
    meta("twitter:title", fullTitle);
    if (description) meta("twitter:description", description);
    meta("twitter:image", image);

    // A page kept out of the index has no canonical worth stating: pointing at
    // itself only invites a crawler to treat it as indexable after all.
    if (!noIndex) {
      upsert(
        'link[rel="canonical"]',
        () => {
          const element = document.createElement("link");
          element.setAttribute("rel", "canonical");
          return element;
        },
        (element) => element.setAttribute("href", url),
      );
    }

    if (jsonLdText) {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.setAttribute(MANAGED, "");
      script.textContent = jsonLdText;
      document.head.appendChild(script);
    }
  }, [
    title,
    description,
    canonicalPath,
    image,
    type,
    keywords,
    noIndex,
    jsonLdText,
    exactTitle,
  ]);
}
