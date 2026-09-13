/**
 * Documentation: Food library controller.
 *
 * - The HTTP boundary for the platform's food library: parse, delegate, and shape the reply.
 * - Reading is open to anybody, so the controller decides one thing the routes cannot: whether the reader manages the library, which is what makes retired foods visible.
 * - Writes are audited, as the exercise library's are.
 * - Primary exports: foodItemController.
 */
import type { Context } from "hono";
import { Permission } from "@fitconnect/shared/types/permissions";
import { foodItemService } from "./food-items.service";
import { auditLog } from "../../lib/audit";
import { parseBody } from "../../lib/http";
import { parsePagination } from "../../lib/pagination";
import { badRequest, notFound, ok, okPaginated } from "../../lib/response";
import {
  createFoodItemSchema,
  listFoodItemsSchema,
  updateFoodItemSchema,
} from "./food-items.schema";
import type { AppBindings } from "../../types/app-context";

type AppContext = Context<AppBindings>;

/** An anonymous request carries no permission set, and a visitor manages nothing. */
function canManage(c: AppContext) {
  return Boolean(c.get("permissions")?.has(Permission.PLATFORM_FOOD_ITEMS_MANAGE));
}

export const foodItemController = {
  async list(c: AppContext) {
    const parsed = listFoodItemsSchema.safeParse(c.req.query());
    const filters = parsed.success ? parsed.data : {};
    const { page, limit } = parsePagination(c);

    const { data, total } = await foodItemService.list(filters, canManage(c), page, limit);

    return okPaginated(c, data, { page, limit, total });
  },

  /** The filter rail: every category, with how many foods it holds. */
  async categories(c: AppContext) {
    const result = await foodItemService.categories(
      canManage(c),
      c.req.query("includeInactive") === "true",
    );

    return ok(c, result.data);
  },

  async get(c: AppContext) {
    const result = await foodItemService.get(c.req.param("idOrSlug")!, canManage(c));
    if ("error" in result) return notFound(c, result.error!);

    return ok(c, result.data);
  },

  async create(c: AppContext) {
    const parsed = await parseBody(c, createFoodItemSchema);
    if (!parsed.ok) return parsed.response;

    const result = await foodItemService.create(parsed.data);
    if ("error" in result) return badRequest(c, result.error!);

    await auditLog({
      action: "CREATE",
      entity: "FoodItem",
      entityId: result.data.foodItem.id,
      actorId: c.get("authUser")!.id,
      metadata: { name: result.data.foodItem.name, category: result.data.foodItem.category },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data, 201);
  },

  async update(c: AppContext) {
    const foodItemId = c.req.param("foodItemId")!;
    const parsed = await parseBody(c, updateFoodItemSchema);
    if (!parsed.ok) return parsed.response;

    const result = await foodItemService.update(foodItemId, parsed.data);
    if ("error" in result) return notFound(c, result.error!);

    await auditLog({
      action: "UPDATE",
      entity: "FoodItem",
      entityId: foodItemId,
      actorId: c.get("authUser").id,
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },

  async remove(c: AppContext) {
    const foodItemId = c.req.param("foodItemId")!;

    const result = await foodItemService.retire(foodItemId);
    if ("error" in result) return notFound(c, result.error!);

    await auditLog({
      action: "DELETE",
      entity: "FoodItem",
      entityId: foodItemId,
      actorId: c.get("authUser").id,
      metadata: { retired: true },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },
};
