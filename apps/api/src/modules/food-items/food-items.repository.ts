/**
 * Documentation: Food library repository.
 *
 * - Every Prisma query for the platform's food library: the catalogue, the category rail, and the foods themselves.
 * - Nothing here is scoped by tenant: one library, read the same way by every gym. The only visibility rule is `isActive`, which the service decides from the caller's permission.
 * - Primary exports: foodItemRepository.
 */
import { prisma } from "../../lib/prisma";
import type { Prisma } from "../../generated/prisma/client";

/** What every read of a food returns. */
const foodItemSelect = {
  id: true,
  name: true,
  slug: true,
  category: true,
  foodType: true,
  servingSize: true,
  servingUnit: true,
  calories: true,
  proteinGrams: true,
  carbsGrams: true,
  fatGrams: true,
  fibreGrams: true,
  sugarGrams: true,
  saturatedFatGrams: true,
  sodiumMg: true,
  cholesterolMg: true,
  potassiumMg: true,
  calciumMg: true,
  ironMg: true,
  description: true,
  imageUrl: true,
  isActive: true,
  createdAt: true,
} satisfies Prisma.FoodItemSelect;

export const foodItemRepository = {
  /**
   * The catalogue, filtered the way the library page and the picker filter it.
   *
   * Search covers the name, the category and the food type, because those are
   * what somebody types: "paneer", "dairy", "vegan".
   */
  async list(
    filters: { search?: string; category?: string; includeInactive?: boolean; ids?: string[] },
    page: number,
    limit: number,
  ) {
    const where: Prisma.FoodItemWhereInput = {
      ...(filters.includeInactive ? {} : { isActive: true }),
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.ids?.length ? { id: { in: filters.ids } } : {}),
      // No `mode: "insensitive"`: SQLite's LIKE already ignores ASCII case, and
      // Prisma's SQLite client rejects the option.
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search } },
              { category: { contains: filters.search } },
              { foodType: { contains: filters.search } },
            ],
          }
        : {}),
    };

    const [foodItems, total] = await Promise.all([
      prisma.foodItem.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ category: "asc" }, { name: "asc" }],
        select: foodItemSelect,
      }),
      prisma.foodItem.count({ where }),
    ]);

    return { foodItems, total };
  },

  /** The filter rail: every category that has something in it. */
  async categories(includeInactive: boolean) {
    const rows = await prisma.foodItem.groupBy({
      by: ["category"],
      where: includeInactive ? {} : { isActive: true },
      _count: { _all: true },
      orderBy: { category: "asc" },
    });

    return rows.map((row) => ({ name: row.category, count: row._count._all }));
  },

  /** One food, by id or by slug: a URL carries the slug, a plan line the id. */
  findByIdOrSlug(idOrSlug: string) {
    return prisma.foodItem.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      select: foodItemSelect,
    });
  },

  findBySlug(slug: string) {
    return prisma.foodItem.findUnique({ where: { slug }, select: { id: true } });
  },

  create(data: Prisma.FoodItemCreateInput) {
    return prisma.foodItem.create({ data, select: foodItemSelect });
  },

  async update(foodItemId: string, data: Prisma.FoodItemUpdateManyMutationInput) {
    const result = await prisma.foodItem.updateMany({ where: { id: foodItemId }, data });
    if (result.count === 0) return null;

    return prisma.foodItem.findUnique({ where: { id: foodItemId }, select: foodItemSelect });
  },
};
