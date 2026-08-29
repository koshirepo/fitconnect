/**
 * Documentation: Likes and comments controller.
 *
 * - The HTTP boundary for reacting to a store product or to a gym: parse, delegate, and shape the reply.
 * - Whether the caller may delete somebody else's comment is decided here, from their permissions, and passed down as a plain boolean. The service should not have to know what a permission is called.
 * - Comments are audited on delete but not on create. A gym removing what a member wrote is the action somebody argues about later; the member writing it is already visible on the page.
 * - Primary exports: productSocialController, tenantSocialController.
 */
import type { Context } from "hono";
import { Permission } from "@fitconnect/shared/types/permissions";
import { socialService } from "./social.service";
import { commentSchema, listCommentsSchema } from "./social.schema";
import { auditLog } from "../../lib/audit";
import { parseBody } from "../../lib/http";
import { forbidden, notFound, ok, okPaginated } from "../../lib/response";
import type { AppBindings } from "../../types/app-context";

type AppContext = Context<AppBindings>;

/** Taking down somebody else's comment is a gym-management act, not a member one. */
function canModerate(c: AppContext) {
  const permissions = c.get("permissions");
  return permissions.has(Permission.STORE_MANAGE) || permissions.has(Permission.TENANT_UPDATE);
}

function paginationOf(c: AppContext) {
  const parsed = listCommentsSchema.safeParse(c.req.query());
  return parsed.success ? parsed.data : { page: 1, limit: 20 };
}

function respondToFailure(c: AppContext, result: { error: string; status: 400 | 403 | 404 }) {
  return result.status === 403 ? forbidden(c, result.error) : notFound(c, result.error);
}

export const productSocialController = {
  /** POST likes, DELETE unlikes; both answer with the resulting state. */
  async like(c: AppContext) {
    return handleProductLike(c, true);
  },

  async unlike(c: AppContext) {
    return handleProductLike(c, false);
  },

  async listComments(c: AppContext) {
    const { page, limit } = paginationOf(c);
    const result = await socialService.listProductComments(
      c.req.param("tenantId")!,
      c.req.param("productId")!,
      c.get("authUser").id,
      page,
      limit,
    );
    if ("error" in result) return respondToFailure(c, result);

    return okPaginated(c, result.data, { page, limit, total: result.total });
  },

  async addComment(c: AppContext) {
    const parsed = await parseBody(c, commentSchema);
    if (!parsed.ok) return parsed.response;

    const result = await socialService.addProductComment(
      c.req.param("tenantId")!,
      c.req.param("productId")!,
      c.get("authUser").id,
      parsed.data.body,
    );
    if ("error" in result) return respondToFailure(c, result);

    return ok(c, result.data, 201);
  },

  async deleteComment(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const commentId = c.req.param("commentId")!;

    const result = await socialService.deleteProductComment(
      tenantId,
      commentId,
      c.get("authUser").id,
      canModerate(c),
    );
    if ("error" in result) return respondToFailure(c, result);

    await auditLog({
      action: "DELETE",
      entity: "StoreProductComment",
      entityId: commentId,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: { moderated: canModerate(c) },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },
};

async function handleProductLike(c: AppContext, liked: boolean) {
  const result = await socialService.setProductLike(
    c.req.param("tenantId")!,
    c.req.param("productId")!,
    c.get("authUser").id,
    liked,
  );
  if ("error" in result) return respondToFailure(c, result);

  return ok(c, result.data);
}

/**
 * Reactions to the gym itself.
 *
 * These need only an account, not a membership: somebody deciding whether to
 * join is exactly the person whose question on a gym's page is worth answering.
 */
export const tenantSocialController = {
  async like(c: AppContext) {
    const result = await socialService.setTenantLike(
      c.req.param("tenantId")!,
      c.get("authUser").id,
      true,
    );
    return ok(c, result.data);
  },

  async unlike(c: AppContext) {
    const result = await socialService.setTenantLike(
      c.req.param("tenantId")!,
      c.get("authUser").id,
      false,
    );
    return ok(c, result.data);
  },

  async listComments(c: AppContext) {
    const { page, limit } = paginationOf(c);
    const result = await socialService.listTenantComments(
      c.req.param("tenantId")!,
      c.get("authUser").id,
      page,
      limit,
    );

    return okPaginated(c, result.data, { page, limit, total: result.total });
  },

  async addComment(c: AppContext) {
    const parsed = await parseBody(c, commentSchema);
    if (!parsed.ok) return parsed.response;

    const result = await socialService.addTenantComment(
      c.req.param("tenantId")!,
      c.get("authUser").id,
      parsed.data.body,
    );

    return ok(c, result.data, 201);
  },

  async deleteComment(c: AppContext) {
    const tenantId = c.req.param("tenantId")!;
    const commentId = c.req.param("commentId")!;

    const result = await socialService.deleteTenantComment(
      tenantId,
      commentId,
      c.get("authUser").id,
      canModerate(c),
    );
    if ("error" in result) return respondToFailure(c, result);

    await auditLog({
      action: "DELETE",
      entity: "TenantComment",
      entityId: commentId,
      actorId: c.get("authUser").id,
      tenantId,
      metadata: { moderated: canModerate(c) },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, result.data);
  },
};
