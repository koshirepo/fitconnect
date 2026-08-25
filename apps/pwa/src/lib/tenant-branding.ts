const BRAND_CACHE_PREFIX = "fitconnect.tenant-branding";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export type TenantBranding = {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  description?: string | null;
  markdown?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  estd?: string | null;
};

function getStorageKey(hostname: string) {
  return `${BRAND_CACHE_PREFIX}:${hostname.toLowerCase()}`;
}

export function getCurrentTenantBrandingHost() {
  return typeof window === "undefined" ? "" : window.location.host;
}

export function readCachedTenantBranding(hostname = getCurrentTenantBrandingHost()): TenantBranding | null {
  if (!hostname || typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(getStorageKey(hostname));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { cachedAt?: number; data?: TenantBranding };
    if (!parsed.data || typeof parsed.cachedAt !== "number") return null;
    if (Date.now() - parsed.cachedAt > CACHE_TTL_MS) {
      window.localStorage.removeItem(getStorageKey(hostname));
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export function writeCachedTenantBranding(data: TenantBranding, hostname = getCurrentTenantBrandingHost()) {
  if (!hostname || typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      getStorageKey(hostname),
      JSON.stringify({ cachedAt: Date.now(), data }),
    );
  } catch {
    // Ignore storage quota issues; the app should keep working without this cache.
  }
}

export function clearTenantBrandingCache(hostname = getCurrentTenantBrandingHost()) {
  if (!hostname || typeof window === "undefined") return;
  window.localStorage.removeItem(getStorageKey(hostname));
}
