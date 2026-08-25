import { api } from "./client";
import type {
  PublicTenantDetail,
  PublicGymSummary,
  ApiResponse,
  PaginatedResponse,
} from "@/types/api";

export type TenantBrandingPayload = {
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

export const publicApi = {
  getTenantBySlug: (slug: string) =>
    api.get<ApiResponse<{ tenant: PublicTenantDetail }>>(`/public/gyms/${slug}`, {
      params: { _: Date.now() },
    }),

  getTenantByHost: (host: string) =>
    api.get<ApiResponse<{ tenant: PublicTenantDetail }>>("/public/gyms/resolve", {
      params: { host, _: Date.now() },
    }),

  getTenantBranding: (host = typeof window !== "undefined" ? window.location.host : "") =>
    api.get<ApiResponse<{ tenant: TenantBrandingPayload }>>("/public/branding", {
      params: { host, _: Date.now() },
    }),

  listGyms: (page = 1, limit = 20) =>
    api.get<PaginatedResponse<{ gyms: PublicGymSummary[] }>>("/public/gyms", {
      params: { page, limit },
    }),
};
