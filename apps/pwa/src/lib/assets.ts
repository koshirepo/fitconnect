const API_BASE = (import.meta.env.VITE_API_URL ?? "/api").replace(/\/+$/, "");
const STORAGE_FOLDER_PATTERN = /^\/(avatars|logos|products)\/.+/u;

function buildProxyAssetUrl(key: string) {
  return `${API_BASE}/uploads/file/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export function resolveAssetUrl(url: string | null | undefined) {
  if (!url) {
    return null;
  }

  if (
    url.startsWith("blob:") ||
    url.startsWith("data:") ||
    url.startsWith(`${API_BASE}/uploads/file/`) ||
    url.includes("/uploads/file/")
  ) {
    return url;
  }

  try {
    const parsed = new URL(url);
    if (STORAGE_FOLDER_PATTERN.test(parsed.pathname)) {
      return buildProxyAssetUrl(parsed.pathname.replace(/^\/+/u, ""));
    }
  } catch {
    return url;
  }

  return url;
}
