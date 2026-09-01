/**
 * Documentation: Gym branding for the "Add to Home Screen" prompt on iOS.
 *
 * - Android and desktop Chrome read the web app manifest, which the Pages Function at `functions/manifest.webmanifest.ts` already serves per gym. Safari does not: it takes the home-screen title from `apple-mobile-web-app-title` and the icon from `apple-touch-icon`, both of which are static in `index.html`.
 * - This rewrites those two tags in place once the gym is known, so a member installing from a gym subdomain gets that gym's name and logo rather than the platform's.
 * - A gym with no logo is left on the default icon already in the document, which is exactly what installs show today.
 * - The same lookup backs the install banner's own wording, so it can offer "Install Rudra Gym" rather than the platform name. It is returned as state rather than read straight from the cache: on a first visit the cache is cold, which is exactly the visit where the offer to install matters most.
 * - Primary exports: useTenantInstallBranding.
 */
import * as React from "react";
import { publicApi } from "@/api/public";
import {
  getCurrentTenantBrandingHost,
  readCachedTenantBranding,
  writeCachedTenantBranding,
  TENANT_BRANDING_EVENT,
  type TenantBranding,
} from "@/lib/tenant-branding";
import { isTenantSubdomain } from "@/lib/subdomain";

/** Point the iOS home-screen title and icon at this gym. */
function applyAppleMeta(branding: TenantBranding) {
  if (typeof document === "undefined") return;

  const title = document.querySelector<HTMLMetaElement>(
    'meta[name="apple-mobile-web-app-title"]',
  );
  if (title && branding.name) title.content = branding.name;

  // Only when the gym actually has a logo. Clearing the href would leave iOS to
  // screenshot the page instead of using the FitConnect icon.
  if (branding.logoUrl) {
    for (const icon of document.querySelectorAll<HTMLLinkElement>('link[rel="apple-touch-icon"]')) {
      icon.href = branding.logoUrl;
    }
  }
}

/**
 * One lookup per host, shared by every caller of the hook.
 *
 * Both the app root and the install banner ask for branding, and without this
 * a cold cache would fetch it twice on the same page load.
 */
const inFlight = new Map<string, Promise<TenantBranding | null>>();

function loadBranding(host: string): Promise<TenantBranding | null> {
  const existing = inFlight.get(host);
  if (existing) return existing;

  const request = publicApi
    .getTenantBranding(host)
    .then((response) => {
      const tenant = response.data.data.tenant as TenantBranding | undefined;
      if (!tenant?.name) return null;
      writeCachedTenantBranding(tenant, host);
      return tenant;
    })
    .catch(() => {
      // Branding is decoration here; the platform tags in the document stand.
      return null;
    })
    .finally(() => {
      inFlight.delete(host);
    });

  inFlight.set(host, request);
  return request;
}

/**
 * Apply the current gym's branding to the install tags, and hand that branding
 * back for anything else that has to name the gym.
 *
 * Runs once per mount from wherever it is called, because a member can install
 * from any screen, not only the one that happens to fetch branding for its own
 * rendering. Returns null on the app's own root, where there is no gym.
 */
export function useTenantInstallBranding(): TenantBranding | null {
  const [branding, setBranding] = React.useState<TenantBranding | null>(() =>
    isTenantSubdomain() ? readCachedTenantBranding() : null,
  );

  React.useEffect(() => {
    if (!isTenantSubdomain()) return;

    const host = getCurrentTenantBrandingHost();

    /**
     * Adopt branding the moment it is rewritten.
     *
     * The gym's accent is painted from this value at the app root, so without
     * this an admin who changes the colour in settings would go on seeing the
     * old one everywhere until the cache expired hours later — including on
     * the very page they just saved.
     */
    const onBrandingChanged = (event: Event) => {
      const next = (event as CustomEvent<TenantBranding>).detail;
      if (!next?.name) return;
      applyAppleMeta(next);
      setBranding(next);
    };
    window.addEventListener(TENANT_BRANDING_EVENT, onBrandingChanged);

    const cached = readCachedTenantBranding(host);
    if (cached) {
      applyAppleMeta(cached);
      return () => window.removeEventListener(TENANT_BRANDING_EVENT, onBrandingChanged);
    }

    let active = true;
    void loadBranding(host).then((tenant) => {
      if (!active || !tenant) return;
      applyAppleMeta(tenant);
      setBranding(tenant);
    });

    return () => {
      active = false;
      window.removeEventListener(TENANT_BRANDING_EVENT, onBrandingChanged);
    };
  }, []);

  return branding;
}
