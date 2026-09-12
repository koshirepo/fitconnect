/**
 * Documentation: Exercise library routes.
 *
 * - Declares the routing and authorization for the platform's exercise library. Mounted at `/exercises` in the application entrypoint, beside the occupation list, because neither belongs to a gym.
 * - Reading needs a session and nothing more, exactly as the occupation list does: every member browses the same videos and every plan is built from them. Writing needs `platform:exercises:manage`, so one gym can never rename a lift for all the others.
 * - Reads resolve permissions without demanding any. The controller still has to know whether the caller manages the library, because that is what makes a retired entry visible.
 * - Likes and comments are not here. They are served by the reactions module under the subject type `EXERCISE`, the same way a gym's page and a store product are.
 * - Relative endpoints declared in this file: GET /, GET /muscle-groups, GET /:idOrSlug, POST /, PATCH /:exerciseId, DELETE /:exerciseId.
 * - Primary exports: exerciseRoutes.
 */
import { Hono } from "hono";
import { Permission } from "@fitconnect/shared/types/permissions";
import { authenticate } from "../../middleware/authenticate";
import { optionalAuthenticate } from "../../middleware/optional-authenticate";
import { requirePermissions } from "../../middleware/authorize";
import { exerciseController } from "./exercises.controller";
import type { AppBindings } from "../../types/app-context";

export const exerciseRoutes = new Hono<AppBindings>();

/**
 * Reading is open to anybody, signed in or not.
 *
 * The library is a shop window as much as a training aid: somebody deciding
 * whether to join a gym, or just looking up how a lift is done, should reach it
 * without an account — the same footing the public storefront is on. A session
 * still changes what comes back, because it is what makes a retired entry
 * visible to the staff who manage the library and marks what the reader liked.
 */
exerciseRoutes.get("/", optionalAuthenticate, exerciseController.list);

/** Before `/:idOrSlug`, or "muscle-groups" would be read as a slug. */
exerciseRoutes.get("/muscle-groups", optionalAuthenticate, exerciseController.muscleGroups);

exerciseRoutes.get("/:idOrSlug", optionalAuthenticate, exerciseController.get);

exerciseRoutes.post(
  "/",
  authenticate,
  requirePermissions(Permission.PLATFORM_EXERCISES_MANAGE),
  exerciseController.create,
);

exerciseRoutes.patch(
  "/:exerciseId",
  authenticate,
  requirePermissions(Permission.PLATFORM_EXERCISES_MANAGE),
  exerciseController.update,
);

exerciseRoutes.delete(
  "/:exerciseId",
  authenticate,
  requirePermissions(Permission.PLATFORM_EXERCISES_MANAGE),
  exerciseController.remove,
);
