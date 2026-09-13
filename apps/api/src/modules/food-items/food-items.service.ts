/**
 * Documentation: Food library service.
 *
 * - The rules over the platform's food library: what a caller may see, what a slug is, and what removing a food means.
 * - Removing a food retires it rather than deleting the row. Diet plans keep their own copy of a line's nutrients, so nothing breaks either way, but a retired food can be brought back and a deleted one cannot.
 * - Retired foods are hidden from everybody except the platform staff who manage the library — and from nobody when a plan asks for its own lines by id.
 * - Primary exports: foodItemService.
 */
import { foodItemRepository } from "./food-items.repository";
import { slugifyExercise } from "../exercises/exercises.service";
import type {
  CreateFoodItemInput,
  ListFoodItemsInput,
  UpdateFoodItemInput,
} from "./food-items.schema";

/** Only the fields a caller actually sent, so an edit never blanks the rest. */
function definedFields<T extends object>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

export const foodItemService = {
  async list(filters: ListFoodItemsInput, canManage: boolean, page: number, limit: number) {
    const { foodItems, total } = await foodItemRepository.list(
      {
        ...(filters.search ? { search: filters.search } : {}),
        ...(filters.category ? { category: filters.category } : {}),
        ...(filters.ids?.length ? { ids: filters.ids } : {}),
        // A plan naming its own lines sees them even where one was retired.
        includeInactive:
          (canManage && Boolean(filters.includeInactive)) || Boolean(filters.ids?.length),
      },
      page,
      limit,
    );

    return { data: { foodItems }, total };
  },

  async categories(canManage: boolean, includeInactive: boolean) {
    return {
      data: { categories: await foodItemRepository.categories(canManage && includeInactive) },
    };
  },

  async get(idOrSlug: string, canManage: boolean) {
    const foodItem = await foodItemRepository.findByIdOrSlug(idOrSlug);
    if (!foodItem || (!foodItem.isActive && !canManage)) {
      return { error: "Food item not found.", status: 404 as const };
    }

    return { data: { foodItem } };
  },

  /**
   * Add a food.
   *
   * The slug is derived from the name and made unique by a counter, so two
   * "Rice" entries — raw and cooked, say — both get a usable URL.
   */
  async create(input: CreateFoodItemInput) {
    const base = slugifyExercise(input.name);
    if (!base) return { error: "That name cannot be turned into a link.", status: 400 as const };

    let slug = base;
    for (let suffix = 2; await foodItemRepository.findBySlug(slug); suffix++) {
      slug = `${base}-${suffix}`;
    }

    const foodItem = await foodItemRepository.create({ ...input, slug });
    return { data: { foodItem } };
  },

  /** Edit one. The slug is left alone, so saved links keep working. */
  async update(foodItemId: string, input: UpdateFoodItemInput) {
    const foodItem = await foodItemRepository.update(foodItemId, definedFields(input));
    if (!foodItem) return { error: "Food item not found.", status: 404 as const };

    return { data: { foodItem } };
  },

  /** Retire a food. Plans that already hold it keep their copy of its nutrients. */
  async retire(foodItemId: string) {
    const foodItem = await foodItemRepository.update(foodItemId, { isActive: false });
    if (!foodItem) return { error: "Food item not found.", status: 404 as const };

    return { data: { retired: true } };
  },
};
