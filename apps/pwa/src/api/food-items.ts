/**
 * Documentation: Food library API client.
 *
 * - Wraps the platform's food library: the catalogue every gym browses, the category rail it filters by, and the writes behind the app-level manage screen.
 * - Not gym-scoped, so these paths carry no gym id. One library, the same rows in every gym.
 * - Primary exports: foodItemsApi.
 */
import { api } from "./client";
import type { ApiResponse, PaginatedResponse } from "@/types/api";
import type {
  CreateFoodItemPayload,
  FoodItem,
  FoodItemCategory,
  UpdateFoodItemPayload,
} from "@fitconnect/shared/types/models";

export type FoodItemFilters = {
  search?: string;
  category?: string;
  /** Retired foods. Honoured only for whoever manages the library. */
  includeInactive?: boolean;
  /** Specific foods, by id — what a plan asks for to draw its lines' photos. */
  ids?: string[];
};

export const foodItemsApi = {
  list: (filters: FoodItemFilters = {}, page = 1, limit = 24) =>
    api.get<PaginatedResponse<{ foodItems: FoodItem[] }>>("/food-items", {
      params: {
        ...(filters.search ? { search: filters.search } : {}),
        ...(filters.category ? { category: filters.category } : {}),
        ...(filters.includeInactive ? { includeInactive: true } : {}),
        ...(filters.ids?.length ? { ids: filters.ids.join(",") } : {}),
        page,
        limit,
      },
    }),

  categories: (includeInactive = false) =>
    api.get<ApiResponse<{ categories: FoodItemCategory[] }>>("/food-items/categories", {
      params: includeInactive ? { includeInactive: true } : {},
    }),

  /** By id or by slug — a URL carries the slug, a plan line the id. */
  get: (idOrSlug: string) =>
    api.get<ApiResponse<{ foodItem: FoodItem }>>(`/food-items/${idOrSlug}`),

  create: (data: CreateFoodItemPayload) =>
    api.post<ApiResponse<{ foodItem: FoodItem }>>("/food-items", data),

  update: (foodItemId: string, data: UpdateFoodItemPayload) =>
    api.patch<ApiResponse<{ foodItem: FoodItem }>>(`/food-items/${foodItemId}`, data),

  /** Retires the food. Plans that already hold it keep their copy. */
  retire: (foodItemId: string) =>
    api.delete<ApiResponse<{ retired: boolean }>>(`/food-items/${foodItemId}`),
};
