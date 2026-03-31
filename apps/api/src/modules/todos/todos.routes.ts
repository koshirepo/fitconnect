/**
 * Documentation: Todos routes.
 *
 * - Declares the Hono routes and middleware chain for tenant todo management. This route set is mounted from `/tenants` in the application entrypoint.
 * - Keep routing and authorization wiring here, and delegate request handling to the companion controller instead of placing business logic in route callbacks.
 * - Relative endpoints declared in this file: GET /:tenantId/todos, POST /:tenantId/todos, PATCH /:tenantId/todos/:todoId, DELETE /:tenantId/todos/:todoId.
 * - Primary exports: todoRoutes.
 */
import { Hono } from "hono";
import { authenticate } from "../../middleware/authenticate";
import { requireTenantRoles } from "../../middleware/authorize";
import { TenantRole } from "../../shared/types/enums";
import type { AppBindings } from "../../types/app-context";
import { todoController } from "./todos.controller";

export const todoRoutes = new Hono<AppBindings>();

todoRoutes.get(
  "/:tenantId/todos",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN, TenantRole.COACH]),
  todoController.list,
);

todoRoutes.post(
  "/:tenantId/todos",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN, TenantRole.COACH]),
  todoController.create,
);

todoRoutes.patch(
  "/:tenantId/todos/:todoId",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN, TenantRole.COACH]),
  todoController.update,
);

todoRoutes.delete(
  "/:tenantId/todos/:todoId",
  authenticate,
  requireTenantRoles([TenantRole.ADMIN, TenantRole.COACH]),
  todoController.delete,
);
