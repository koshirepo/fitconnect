/**
 * Documentation: Occupations routes.
 *
 * - Declares the Hono routes and middleware chain for the platform-wide occupation list. Mounted at `/occupations` in the application entrypoint.
 * - Keep routing and authorization wiring here, and delegate request handling to the companion controller instead of placing business logic in route callbacks.
 * - Relative endpoints declared in this file: GET /, POST /, PATCH /:occupationId, DELETE /:occupationId.
 * - Primary exports: occupationRoutes.
 */
import { Hono } from "hono";
import { Permission } from "@fitconnect/shared/types/permissions";
import { authenticate } from "../../middleware/authenticate";
import { requirePermissions } from "../../middleware/authorize";
import { occupationController } from "./occupations.controller";
import type { AppBindings } from "../../types/app-context";

export const occupationRoutes = new Hono<AppBindings>();

// Reading needs a session and nothing more: every gym's member form has to draw
// this picker, and a coach who can add a member must be able to fill it in.
occupationRoutes.get("/", authenticate, occupationController.list);

occupationRoutes.post(
  "/",
  authenticate,
  requirePermissions(Permission.PLATFORM_OCCUPATIONS_MANAGE),
  occupationController.create,
);

occupationRoutes.patch(
  "/:occupationId",
  authenticate,
  requirePermissions(Permission.PLATFORM_OCCUPATIONS_MANAGE),
  occupationController.update,
);

occupationRoutes.delete(
  "/:occupationId",
  authenticate,
  requirePermissions(Permission.PLATFORM_OCCUPATIONS_MANAGE),
  occupationController.delete,
);
