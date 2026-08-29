import axios, { AxiosHeaders, type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "@/stores/auth";
import { cacheResponse, serveCachedOnError, queueFailedMutation } from "@/lib/api-cache";

const API_BASE = (import.meta.env.VITE_API_URL ?? "/api").replace(/\/+$/, "");

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
});

// Request interceptor: attach access token

api.interceptors.request.use((config) => {
  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    if (config.headers instanceof AxiosHeaders) {
      config.headers.delete("Content-Type");
    } else if (config.headers) {
      delete (config.headers as Record<string, string>)["Content-Type"];
    }
  }

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

// Response interceptor: auto-refresh on 401
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
    // Only 401. The API answers 401 for a missing, invalid, or expired token
    // and 403 for a caller who is signed in but not permitted — and refreshing
    // cannot turn the second into a yes. Treating 403 as an expiry meant a
    // coach, who meets 403 on any screen holding one control they lack rights
    // to, rotated their refresh token on every such response: each rotation
    // wrote the auth store, re-rendered every subscriber, and re-ran the
    // queries that produced the next 403. Two of those racing left the second
    // holding a token the first had already revoked, which logged the coach
    // out mid-page.
    if (status === 401 && !originalRequest._retry) {
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

// Response interceptor: serve from offline cache on network failure

api.interceptors.response.use(undefined, serveCachedOnError);

// Response interceptor: queue mutations when offline

api.interceptors.response.use(undefined, queueFailedMutation);

// Helper to extract error messages

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
