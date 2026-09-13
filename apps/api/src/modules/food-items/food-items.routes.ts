/**
 * Documentation: Food library routes.
 *
 * - Declares the routing and authorization for the platform's food library. Mounted at `/food-items` in the application entrypoint, beside the exercise library.
 * - Reading is open to anybody, signed in or not, on the same footing as the exercise library. A session still matters: it makes retired foods visible to the staff who manage them.
 * - Writing needs `platform:food-items:manage`, so one gym can never correct a food's figures for all the others.
 * - Relative endpoints declared in this file: GET /, GET /categories, GET /:idOrSlug, POST /, PATCH /:foodItemId, DELETE /:foodItemId.
 * - Primary exports: foodItemRoutes.
 */
import { Hono } from "hono";
import { Permission } from "@fitconnect/shared/types/permissions";
import { authenticate } from "../../middleware/authenticate";
import { optionalAuthenticate } from "../../middleware/optional-authenticate";
import { requirePermissions } from "../../middleware/authorize";
import { foodItemController } from "./food-items.controller";
import type { AppBindings } from "../../types/app-context";

export const foodItemRoutes = new Hono<AppBindings>();

foodItemRoutes.get("/", optionalAuthenticate, foodItemController.list);

/** Before `/:idOrSlug`, or "categories" would be read as a slug. */
foodItemRoutes.get("/categories", optionalAuthenticate, foodItemController.categories);

foodItemRoutes.get("/:idOrSlug", optionalAuthenticate, foodItemController.get);

foodItemRoutes.post(
  "/",
  authenticate,
  requirePermissions(Permission.PLATFORM_FOOD_ITEMS_MANAGE),
  foodItemController.create,
);

foodItemRoutes.patch(
  "/:foodItemId",
  authenticate,
  requirePermissions(Permission.PLATFORM_FOOD_ITEMS_MANAGE),
  foodItemController.update,
);

/** Retires rather than deletes: see the service. */
foodItemRoutes.delete(
  "/:foodItemId",
  authenticate,
  requirePermissions(Permission.PLATFORM_FOOD_ITEMS_MANAGE),
  foodItemController.remove,
);
