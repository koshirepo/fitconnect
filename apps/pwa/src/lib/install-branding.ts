/**
 * Documentation: Gym branding for the "Add to Home Screen" prompt on iOS.
 *
 * - Android and desktop Chrome read the web app manifest, which the Pages Function at `functions/manifest.webmanifest.ts` already serves per gym. Safari does not: it takes the home-screen title from `apple-mobile-web-app-title` and the icon from `apple-touch-icon`, both of which are static in `index.html`.
 * - This rewrites those two tags in place once the gym is known, so a member installing from a gym subdomain gets that gym's name and logo rather than the platform's.
 * - A gym with no logo is left on the default icon already in the document, which is exactly what installs show today.
 * - Primary exports: useTenantInstallBranding.
 */
import * as React from "react";
import { publicApi } from "@/api/public";
import {
  getCurrentTenantBrandingHost,
  readCachedTenantBranding,
  writeCachedTenantBranding,
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
 * Apply the current gym's branding to the install tags.
 *
 * Runs once per mount from wherever it is called, because a member can install
 * from any screen, not only the one that happens to fetch branding for its own
 * rendering.
 */
export function useTenantInstallBranding() {
  React.useEffect(() => {
    if (!isTenantSubdomain()) return;

    const host = getCurrentTenantBrandingHost();
    const cached = readCachedTenantBranding(host);
    if (cached) {
      applyAppleMeta(cached);
      return;
    }

    let active = true;
    publicApi
      .getTenantBranding(host)
      .then((response) => {
        if (!active) return;
        const tenant = response.data.data.tenant as TenantBranding | undefined;
        if (!tenant?.name) return;
        writeCachedTenantBranding(tenant, host);
        applyAppleMeta(tenant);
      })
      .catch(() => {
        // Branding is decoration here; the platform tags in the document stand.
      });

    return () => {
      active = false;
    };
  }, []);
}
