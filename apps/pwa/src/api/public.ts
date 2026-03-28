import { api } from "./client";
import type {
  PublicTenantDetail,
  PublicGymSummary,
  ApiResponse,
  PaginatedResponse,
} from "@/types/api";

export const publicApi = {
  getTenantBySlug: (slug: string) =>
    api.get<ApiResponse<{ tenant: PublicTenantDetail }>>(`/public/gyms/${slug}`),

  listGyms: (page = 1, limit = 20) =>
    api.get<PaginatedResponse<{ gyms: PublicGymSummary[] }>>("/public/gyms", {
      params: { page, limit },
    }),
};
