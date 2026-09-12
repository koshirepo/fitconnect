/**
 * Documentation: Likes and comments routes.
 *
 * - One route set for every reaction in the app, mounted at `/reactions`. A gym's page, a gym's product and an exercise in the platform library all arrive here as `(subjectType, subjectId)`; what each of those means, and who may react to one, is decided in the service.
 * - `resolveTenantPermissions` rather than `requireTenantPermissions`: these paths carry no gym id, and the gym a caller is acting in comes from the `x-tenant-id` header the PWA already sends. Resolving without demanding anything is what lets a signed-in non-member ask a question on a gym's page while a gym's own staff still arrive holding the grants that let them moderate.
 * - Liking is POST and unliking is DELETE on the same path, rather than one endpoint taking a boolean. A request retried on a flaky connection then lands on the state the person pressed for, whichever half of it arrived twice.
 * - Deleting a comment is not nested under its subject: a comment id is already unique, and the delete would otherwise be refused for naming the wrong parent — a distinction nobody deleting their own sentence cares about.
 * - Relative endpoints declared in this file: POST /:subjectType/:subjectId/like, DELETE /:subjectType/:subjectId/like, GET /:subjectType/:subjectId/comments, POST /:subjectType/:subjectId/comments, DELETE /comments/:commentId.
 * - Primary exports: reactionRoutes.
 */
import { Hono } from "hono";
import { authenticate } from "../../middleware/authenticate";
import { resolveTenantPermissions } from "../../middleware/authorize";
import { reactionController } from "./reactions.controller";
import type { AppBindings } from "../../types/app-context";

export const reactionRoutes = new Hono<AppBindings>();

/**
 * Deleting comes first, so `/comments/:commentId` is matched before anything
 * tries to read "comments" as a subject type.
 */
reactionRoutes.delete(
  "/comments/:commentId",
  authenticate,
  resolveTenantPermissions,
  reactionController.deleteComment,
);

reactionRoutes.post(
  "/:subjectType/:subjectId/like",
  authenticate,
  resolveTenantPermissions,
  reactionController.like,
);

reactionRoutes.delete(
  "/:subjectType/:subjectId/like",
  authenticate,
  resolveTenantPermissions,
  reactionController.unlike,
);

reactionRoutes.get(
  "/:subjectType/:subjectId/comments",
  authenticate,
  resolveTenantPermissions,
  reactionController.listComments,
);

reactionRoutes.post(
  "/:subjectType/:subjectId/comments",
  authenticate,
  resolveTenantPermissions,
  reactionController.addComment,
);
