import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "@/stores/auth";
import { cacheResponse, serveCachedOnError, queueFailedMutation } from "@/lib/api-cache";

const API_BASE = (import.meta.env.VITE_API_URL ?? "/api").replace(/\/+$/, "");

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

// ─── Request Interceptor: Attach access token ────────────────────────────────

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Attach current tenant header if set
  const tenantId = useAuthStore.getState().currentTenantId;
  if (tenantId) {
    config.headers["x-tenant-id"] = tenantId;
  }
  return config;
});

// ─── Response Interceptor: Auto-refresh on 401 ──────────────────────────────
// Note: interceptors run in order added. Cache runs first so online responses
// are saved before the refresh interceptor runs. For errors, the offline
// fallback is added after the refresh interceptor so it catches network errors
// that aren't auth-related.

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => cacheResponse(response),
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    const status = error.response?.status;
    if ((status === 401 || status === 403) && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = useAuthStore.getState().refreshToken;
      if (!refreshToken) {
        useAuthStore.getState().logout();
        isRefreshing = false;
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post(`${API_BASE}/auth/refresh`, {
          refreshToken,
        });
        const newAccess = data.data.accessToken;
        const newRefresh = data.data.refreshToken;

        useAuthStore.getState().setTokens(newAccess, newRefresh);
        processQueue(null, newAccess);

        originalRequest.headers.Authorization = `Bearer ${newAccess}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        useAuthStore.getState().logout();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

// ─── Response Interceptor: Serve from offline cache on network failure ───────

api.interceptors.response.use(undefined, serveCachedOnError);

// ─── Response Interceptor: Queue mutations when offline ──────────────────────

api.interceptors.response.use(undefined, queueFailedMutation);

// ─── Helper to extract error message ─────────────────────────────────────────

export function getApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    // API returns { success: false, error: { code, message } }
    if (data?.error?.message) return data.error.message;
    if (typeof data?.error === "string") return data.error;
    if (data?.message) return data.message;
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "An unexpected error occurred.";
}
