import type { AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { getDB } from "./offline-db";
import { useAuthStore } from "@/stores/auth";

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_CACHE_ENTRIES = 200;

type BackgroundSyncRegistration = ServiceWorkerRegistration & {
  sync: {
    register(tag: string): Promise<void>;
  };
};

function hasBackgroundSync(
  registration: ServiceWorkerRegistration,
): registration is BackgroundSyncRegistration {
  const candidate = registration as ServiceWorkerRegistration & {
    sync?: { register?: unknown };
  };
  return typeof candidate.sync?.register === "function";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a stable, tenant-scoped cache key from the request config. */
function cacheKey(config: InternalAxiosRequestConfig): string {
  const tenant = (config.headers?.["x-tenant-id"] as string) ?? "_none";
  const base = config.baseURL ?? "";
  const url = config.url ?? "";
  const fullUrl = url.startsWith("http") ? url : `${base}${url}`;
  // Sort params so ?a=1&b=2 and ?b=2&a=1 hit the same key
  const params = config.params
    ? `?${new URLSearchParams(
        Object.entries(config.params)
          .sort()
          .map(([k, v]) => [k, String(v)]),
      ).toString()}`
    : "";
  return `${tenant}::${fullUrl}${params}`;
}

function isNetworkError(error: unknown): boolean {
  const e = error as { code?: string; response?: unknown };
  return !navigator.onLine || e?.code === "ERR_NETWORK" || (!!e && !e.response);
}

// ─── Queue a mutation to IDB ─────────────────────────────────────────────────

/**
 * Queue a mutation for later sync. Shared by the axios interceptor and manual
 * offline paths (e.g. AddMemberPage).
 */
/**
 * A key that identifies one intended write for as long as it is queued.
 *
 * `crypto.randomUUID` needs a secure context, which a PWA always has; the
 * fallback only matters for an insecure-origin dev server.
 */
function newIdempotencyKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function queueMutation(
  url: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown,
  headers?: Record<string, string>,
): Promise<void> {
  const db = await getDB();
  const tenantId = headers?.["x-tenant-id"] ?? useAuthStore.getState().currentTenantId;
  const bodyStr = typeof body === "string" ? body : body ? JSON.stringify(body) : undefined;

  await db.add("pendingMutations", {
    url,
    method,
    body: bodyStr,
    headers: {
      ...(tenantId ? { "x-tenant-id": tenantId } : {}),
    },
    createdAt: Date.now(),
    retries: 0,
    // Generated once, here, and reused by every retry. A key minted at send
    // time would be new on each attempt and defeat the whole point.
    idempotencyKey: newIdempotencyKey(),
  });

  // Trigger Background Sync if supported
  try {
    const registration = await navigator.serviceWorker?.ready;
    if (registration && hasBackgroundSync(registration)) {
      await registration.sync.register("pending-mutations");
    }
  } catch {
    // Background Sync not available — sync-listener handles it
  }

  // Notify pending-mutations consumers (so list pages update immediately)
  window.dispatchEvent(new CustomEvent("mutation-queued"));
}

// ─── Cache eviction ──────────────────────────────────────────────────────────

let lastEviction = 0;
const EVICTION_INTERVAL = 5 * 60 * 1000; // At most once every 5 minutes

async function evictStaleCache(db: Awaited<ReturnType<typeof getDB>>): Promise<void> {
  if (Date.now() - lastEviction < EVICTION_INTERVAL) return;
  lastEviction = Date.now();

  const all = await db.getAll("apiCache");
  const now = Date.now();

  // Delete entries older than TTL
  const stale = all.filter((e) => now - e.cachedAt > CACHE_TTL_MS);
  for (const entry of stale) {
    await db.delete("apiCache", entry.url);
  }

  // If still over limit, drop oldest entries
  const remaining = all.length - stale.length;
  if (remaining > MAX_CACHE_ENTRIES) {
    const sorted = all
      .filter((e) => now - e.cachedAt <= CACHE_TTL_MS)
      .sort((a, b) => a.cachedAt - b.cachedAt);
    const toDelete = sorted.slice(0, remaining - MAX_CACHE_ENTRIES);
    for (const entry of toDelete) {
      await db.delete("apiCache", entry.url);
    }
  }
}

// ─── Axios interceptors ─────────────────────────────────────────────────────

/**
 * Axios response interceptor — cache successful GET responses to IDB.
 */
export async function cacheResponse(response: AxiosResponse): Promise<AxiosResponse> {
  try {
    const config = response.config;
    if (config.method?.toUpperCase() !== "GET") return response;

    // Skip caching auth endpoints (tokens, refresh)
    const url = config.url ?? "";
    if (url.includes("/auth/")) return response;

    const tenant = (config.headers?.["x-tenant-id"] as string) ?? "_none";
    const key = cacheKey(config);
    const db = await getDB();
    await db.put("apiCache", {
      url: key,
      data: response.data,
      cachedAt: Date.now(),
      tenantId: tenant,
    });

    // Evict stale / excess entries (fire-and-forget)
    evictStaleCache(db).catch(() => {});
  } catch {
    // IDB write failures should never break the app
  }

  return response;
}

/**
 * Axios error interceptor — when offline / network error on GET,
 * return cached data from IDB instead.
 */
export async function serveCachedOnError(error: unknown): Promise<AxiosResponse> {
  const axiosError = error as {
    config?: InternalAxiosRequestConfig;
    code?: string;
    response?: AxiosResponse;
  };

  const config = axiosError.config;

  // Only intercept GET network failures (no response from server)
  if (
    !config ||
    config.method?.toUpperCase() !== "GET" ||
    axiosError.response // server responded (4xx/5xx) — don't mask it
  ) {
    return Promise.reject(error);
  }

  // Check if we're offline or got a network error
  const isOffline = !navigator.onLine || axiosError.code === "ERR_NETWORK";
  if (!isOffline) return Promise.reject(error);

  try {
    const key = cacheKey(config);
    const db = await getDB();
    const cached = await db.get("apiCache", key);

    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      // Return a synthetic AxiosResponse with cached data
      return {
        data: cached.data,
        status: 200,
        statusText: "OK (offline cache)",
        headers: { "x-offline-cache": "true" },
        config,
      } as AxiosResponse;
    }

    // Even if stale, serve it in offline mode — stale data > no data
    if (cached) {
      return {
        data: cached.data,
        status: 200,
        statusText: "OK (offline cache - stale)",
        headers: { "x-offline-cache": "stale" },
        config,
      } as AxiosResponse;
    }
  } catch {
    // IDB read failure — fall through to original error
  }

  return Promise.reject(error);
}

/**
 * Axios error interceptor — when offline / network error on a mutation
 * (POST/PATCH/PUT/DELETE), queue it to IDB for later sync and return
 * a synthetic 202 response so the UI can show success optimistically.
 */
export async function queueFailedMutation(error: unknown): Promise<AxiosResponse> {
  const axiosError = error as {
    config?: InternalAxiosRequestConfig;
    code?: string;
    response?: AxiosResponse;
  };

  const config = axiosError.config;
  if (!config) return Promise.reject(error);

  const method = config.method?.toUpperCase();

  // Only intercept mutation methods
  if (!method || !["POST", "PATCH", "PUT", "DELETE"].includes(method)) {
    return Promise.reject(error);
  }

  // Only when no server response (true network failure)
  if (axiosError.response) return Promise.reject(error);

  if (!isNetworkError(error)) return Promise.reject(error);

  // *** CRITICAL: Never re-queue a mutation that the sync-engine is replaying ***
  if (config.headers?.["X-Offline-Mutation"]) return Promise.reject(error);

  // Skip auth endpoints
  const url = config.url ?? "";
  if (url.includes("/auth/")) return Promise.reject(error);

  // Skip public self-signup. Replaying it later would create a member whose
  // payment window is long gone, and the visitor is standing there waiting for
  // an answer now — a queued "we'll get to it" is worse than a plain failure.
  if (url.includes("/public/signup")) return Promise.reject(error);

  // Skip FormData/multipart requests — binary data can't be serialized to JSON.
  // File uploads must be handled explicitly (e.g. AddMemberPage stores files in pendingFiles).
  if (config.data instanceof FormData) return Promise.reject(error);

  try {
    const tenantId = (config.headers?.["x-tenant-id"] as string) ?? undefined;
    await queueMutation(
      url,
      method as "POST" | "PATCH" | "PUT" | "DELETE",
      config.data,
      tenantId ? { "x-tenant-id": tenantId } : undefined,
    );

    // Return synthetic success so the UI can proceed optimistically
    return {
      data: { success: true, data: {}, _offlineQueued: true },
      status: 202,
      statusText: "Accepted (queued offline)",
      headers: { "x-offline-queued": "true" },
      config,
    } as AxiosResponse;
  } catch {
    return Promise.reject(error);
  }
}
