/**
 * Documentation: Likes and comments controller.
 *
 * - The HTTP boundary for reacting to anything: parse the subject out of the path, delegate, and shape the reply.
 * - The caller is assembled here — their account, the permissions resolved for the gym this request is acting in, and that gym's id — and handed down as plain data. The service should not have to know what a permission is called or where a tenant id came from.
 * - Comments are audited on delete but not on create. Somebody taking down what another person wrote is the act argued about later; the writing is already visible on the page.
 * - Primary exports: reactionController.
 */
import type { Context } from "hono";
import type { Permission } from "@fitconnect/shared/types/permissions";
import { reactionService, type ReactionActor } from "./reactions.service";
import { commentSchema, listCommentsSchema, subjectSchema } from "./reactions.schema";
import { auditLog } from "../../lib/audit";
import { parseBody } from "../../lib/http";
import { badRequest, forbidden, notFound, ok, okPaginated } from "../../lib/response";
import type { AppBindings } from "../../types/app-context";
import type { SubjectRef } from "./reactions.repository";

type AppContext = Context<AppBindings>;

/** The subject named by the path, or the 400 to answer with. */
function subjectOf(c: AppContext): SubjectRef | null {
  const parsed = subjectSchema.safeParse({
    subjectType: c.req.param("subjectType"),
    subjectId: c.req.param("subjectId"),
  });

  return parsed.success ? parsed.data : null;
}

function actorOf(c: AppContext): ReactionActor {
  return {
    userId: c.get("authUser").id,
    permissions: c.get("permissions") as ReadonlySet<Permission>,
    // Whichever gym this request is acting in: the path wins, then the header
    // the PWA sends on every call.
    tenantId: c.req.param("tenantId") ?? c.req.header("x-tenant-id") ?? null,
  };
}

function paginationOf(c: AppContext) {
  const parsed = listCommentsSchema.safeParse(c.req.query());
  return parsed.success ? parsed.data : { page: 1, limit: 20 };
}

function respondToFailure(c: AppContext, result: { error: string; status: 400 | 403 | 404 }) {
  if (result.status === 403) return forbidden(c, result.error);
  if (result.status === 400) return badRequest(c, result.error);
  return notFound(c, result.error);
}

async function handleLike(c: AppContext, liked: boolean) {
  const subject = subjectOf(c);
  if (!subject) return badRequest(c, "That is not something that can be liked.");

  const result = await reactionService.setLike(subject, actorOf(c), liked);
  if ("error" in result) return respondToFailure(c, result);

  return ok(c, result.data);
}

export const reactionController = {
  /** POST likes, DELETE unlikes; both answer with the resulting state. */
  async like(c: AppContext) {
    return handleLike(c, true);
  },

  async unlike(c: AppContext) {
    return handleLike(c, false);
  },

  async listComments(c: AppContext) {
    const subject = subjectOf(c);
    if (!subject) return badRequest(c, "That is not something that can be commented on.");

    const { page, limit } = paginationOf(c);
    const result = await reactionService.listComments(subject, actorOf(c), page, limit);
    if ("error" in result) return respondToFailure(c, result);

    return okPaginated(c, result.data, { page, limit, total: result.total });
  },

  async addComment(c: AppContext) {
    const subject = subjectOf(c);
    if (!subject) return badRequest(c, "That is not something that can be commented on.");

    const parsed = await parseBody(c, commentSchema);
    if (!parsed.ok) return parsed.response;

    const result = await reactionService.addComment(subject, actorOf(c), parsed.data.body);
    if ("error" in result) return respondToFailure(c, result);

    return ok(c, result.data, 201);
  },

  async deleteComment(c: AppContext) {
    const commentId = c.req.param("commentId")!;
    const actor = actorOf(c);

    const result = await reactionService.deleteComment(commentId, actor);
    if ("error" in result) return respondToFailure(c, result);

    await auditLog({
      action: "DELETE",
      entity: "Comment",
      entityId: commentId,
      actorId: actor.userId,
      // The gym it belonged to, where it belonged to one: a comment on the
      // exercise library belongs to no gym and is logged without one.
      ...(result.data.tenantId ? { tenantId: result.data.tenantId } : {}),
      metadata: { subjectType: result.data.subjectType },
      ip: c.req.header("x-forwarded-for") ?? undefined,
    });

    return ok(c, { deleted: true });
  },
};
