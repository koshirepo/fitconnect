/**
 * Documentation: Likes and comments routes.
 *
 * - Declares the routing and authorization for reactions to a store product and to a gym. Mounted under `/tenants` in the application entrypoint.
 * - Product reactions sit behind `STORE_READ`, the same gate as the storefront: if you may not see a product, you may not have an opinion on it.
 * - Gym reactions resolve tenant permissions without requiring any. A signed-in non-member has to be able to ask a gym a question — they are the person deciding whether to join — while a gym admin still arrives holding the permissions that let them moderate their own page.
 * - Liking is POST and unliking is DELETE on the same path, rather than one endpoint taking a boolean. A retried request then lands on the state the member pressed for, whichever half of it arrived twice.
 * - Relative endpoints declared in this file: POST /:tenantId/store/products/:productId/like, DELETE /:tenantId/store/products/:productId/like, GET /:tenantId/store/products/:productId/comments, POST /:tenantId/store/products/:productId/comments, DELETE /:tenantId/store/comments/:commentId, POST /:tenantId/social/like, DELETE /:tenantId/social/like, GET /:tenantId/social/comments, POST /:tenantId/social/comments, DELETE /:tenantId/social/comments/:commentId.
 * - Primary exports: socialRoutes.
 */
import { Hono } from "hono";
import { Permission } from "@fitconnect/shared/types/permissions";
import { authenticate } from "../../middleware/authenticate";
import { requireTenantPermissions, resolveTenantPermissions } from "../../middleware/authorize";
import { productSocialController, tenantSocialController } from "./social.controller";
import type { AppBindings } from "../../types/app-context";

export const socialRoutes = new Hono<AppBindings>();

// ─── Store products ──────────────────────────────────────────────────────────

socialRoutes.post(
  "/:tenantId/store/products/:productId/like",
  authenticate,
  requireTenantPermissions(Permission.STORE_READ),
  productSocialController.like,
);

socialRoutes.delete(
  "/:tenantId/store/products/:productId/like",
  authenticate,
  requireTenantPermissions(Permission.STORE_READ),
  productSocialController.unlike,
);

socialRoutes.get(
  "/:tenantId/store/products/:productId/comments",
  authenticate,
  requireTenantPermissions(Permission.STORE_READ),
  productSocialController.listComments,
);

socialRoutes.post(
  "/:tenantId/store/products/:productId/comments",
  authenticate,
  requireTenantPermissions(Permission.STORE_READ),
  productSocialController.addComment,
);

/**
 * Deleting a comment. Not nested under its product, because a comment id is
 * already unique and the delete would otherwise be refused for naming the
 * wrong parent — a distinction nobody deleting their own sentence cares about.
 */
socialRoutes.delete(
  "/:tenantId/store/comments/:commentId",
  authenticate,
  requireTenantPermissions(Permission.STORE_READ),
  productSocialController.deleteComment,
);

// ─── Gyms ────────────────────────────────────────────────────────────────────

socialRoutes.post(
  "/:tenantId/social/like",
  authenticate,
  resolveTenantPermissions,
  tenantSocialController.like,
);

socialRoutes.delete(
  "/:tenantId/social/like",
  authenticate,
  resolveTenantPermissions,
  tenantSocialController.unlike,
);

socialRoutes.get(
  "/:tenantId/social/comments",
  authenticate,
  resolveTenantPermissions,
  tenantSocialController.listComments,
);

socialRoutes.post(
  "/:tenantId/social/comments",
  authenticate,
  resolveTenantPermissions,
  tenantSocialController.addComment,
);

socialRoutes.delete(
  "/:tenantId/social/comments/:commentId",
  authenticate,
  resolveTenantPermissions,
  tenantSocialController.deleteComment,
);
