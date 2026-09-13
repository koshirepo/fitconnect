/**
 * Documentation: Food library query hooks.
 *
 * - The platform's food library: the catalogue a member scrolls, one food's page, the category rail, and the writes behind the app-level manage screen.
 * - Not gym-scoped, so these use the plain app-level helpers rather than the tenant-aware ones.
 * - The list is paged for infinite scroll, and its key carries the filters, so changing the category starts a fresh list instead of appending to the last one.
 * - Primary exports: useFoodItemsInfinite, useFoodItem, useFoodItemCategories, useCreateFoodItem, useUpdateFoodItem, useRetireFoodItem.
 */
import { useQuery } from "@tanstack/react-query";
import { foodItemsApi, type FoodItemFilters } from "@/api/food-items";
import { queryKeys } from "@/lib/query-keys";
import type {
  CreateFoodItemPayload,
  UpdateFoodItemPayload,
} from "@fitconnect/shared/types/models";
import { unwrap, unwrapPaginated, useAppInfiniteQuery, useAppMutation } from "./shared";

/** The rail is edited by hand, rarely. */
const CATEGORY_STALE_TIME = 60 * 60 * 1000;

/** The catalogue, paged for the grid's infinite scroll. */
export function useFoodItemsInfinite(
  filters: FoodItemFilters = {},
  options: { enabled?: boolean; limit?: number } = {},
) {
  const { limit = 24 } = options;

  return useAppInfiniteQuery(
    queryKeys.foodItems.list({ ...filters, limit }),
    async (page) => {
      const { data, meta } = unwrapPaginated(await foodItemsApi.list(filters, page, limit));
      return { data: data.foodItems, meta };
    },
    options,
  );
}

/** One food, for its page. Takes an id or a slug. */
export function useFoodItem(idOrSlug: string | undefined) {
  return useQuery({
    queryKey: queryKeys.foodItems.detail(idOrSlug ?? "none"),
    enabled: Boolean(idOrSlug),
    queryFn: async () => unwrap(await foodItemsApi.get(idOrSlug!)).foodItem,
  });
}

export function useFoodItemCategories(includeInactive = false) {
  return useQuery({
    queryKey: queryKeys.foodItems.categories(includeInactive),
    staleTime: CATEGORY_STALE_TIME,
    queryFn: async () => unwrap(await foodItemsApi.categories(includeInactive)).categories,
  });
}

export function useCreateFoodItem() {
  return useAppMutation(
    async (payload: CreateFoodItemPayload) => unwrap(await foodItemsApi.create(payload)).foodItem,
    { invalidates: [queryKeys.foodItems.all()] },
  );
}

export function useUpdateFoodItem() {
  return useAppMutation(
    async (variables: { foodItemId: string; data: UpdateFoodItemPayload }) =>
      unwrap(await foodItemsApi.update(variables.foodItemId, variables.data)).foodItem,
    { invalidates: [queryKeys.foodItems.all()] },
  );
}

export function useRetireFoodItem() {
  return useAppMutation(
    async (foodItemId: string) => unwrap(await foodItemsApi.retire(foodItemId)),
    { invalidates: [queryKeys.foodItems.all()] },
  );
}
