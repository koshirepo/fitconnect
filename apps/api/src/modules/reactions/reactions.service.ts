/**
 * Documentation: Likes and comments service.
 *
 * - The rules behind reacting to anything: who may react to a subject, who may take down what somebody else wrote, and what the caller gets back.
 * - One place decides what each subject means — `resolveSubject`. A gym's page is open to any signed-in account, because the people with an opinion about a gym include the ones deciding whether to join. A gym's product needs the store grant for that gym. An exercise is platform-wide and open to everybody, since the library is the same for every gym.
 * - A like always answers with the resulting state, `liked` and the fresh count, rather than an empty acknowledgement. The button that sent it needs both, and returning them saves every caller a follow-up read.
 * - Writing stops while a gym's platform access has lapsed, the same way it did before: a lapsed gym can still be read and moderated, but nothing new is posted to it.
 * - Deleting a comment is allowed to its author and to whoever moderates that subject — a gym's staff for its own page and products, platform staff for the library. One gym's admin can never delete another gym's member's words about an exercise, because the library belongs to nobody.
 * - Primary exports: reactionService, type ReactionActor.
 */
import { Permission } from "@fitconnect/shared/types/permissions";
import { prisma } from "../../lib/prisma";
import { PLATFORM_EXPIRED_MESSAGE, isTenantPlatformExpired } from "../../lib/platform-access";
import { reactionRepository, type ShapedComment, type SubjectRef } from "./reactions.repository";
import type { SubjectType } from "./reactions.schema";

type ServiceError = { error: string; status: 400 | 403 | 404 };
type ServiceResult<T> = { data: T } | ServiceError;
type PagedResult<T> = { data: T; total: number } | ServiceError;

/** Who is asking, and what they hold in the gym the request is acting in. */
export type ReactionActor = {
  userId: string;
  permissions: ReadonlySet<Permission>;
  /** From the path or the `x-tenant-id` header. Null for platform-only sessions. */
  tenantId: string | null;
};

/** What a comment list answers with, whatever it was written about. */
type CommentPage = { comments: ShapedComment[]; likeCount: number; liked: boolean };

type ResolvedSubject = {
  /** The gym this subject belongs to, for the expiry gate. Null when it has none. */
  tenantId: string | null;
  /** Whether this caller may take down somebody else's words here. */
  canModerate: boolean;
};

/**
 * Whether this subject exists, whether this caller may react to it, and whether
 * they moderate it.
 *
 * The one place a subject's meaning is written down. Everything else in this
 * file works on `(subjectType, subjectId)` and never asks what those are.
 */
async function resolveSubject(
  subject: SubjectRef,
  actor: ReactionActor,
): Promise<ResolvedSubject | ServiceError> {
  const has = (permission: Permission) => actor.permissions.has(permission);

  if (subject.subjectType === "GYM") {
    const tenant = await prisma.tenant.findUnique({
      where: { id: subject.subjectId },
      select: { id: true },
    });
    if (!tenant) return { error: "Gym not found.", status: 404 };

    // Its own staff moderate its page; nobody else does.
    return {
      tenantId: tenant.id,
      canModerate: actor.tenantId === tenant.id && has(Permission.TENANT_UPDATE),
    };
  }

  if (subject.subjectType === "PRODUCT") {
    const product = await prisma.product.findUnique({
      where: { id: subject.subjectId },
      select: { id: true, tenantId: true, isActive: true },
    });
    if (!product) return { error: "Product not found.", status: 404 };

    // A gym's own product: only that gym's people, holding the browse grant.
    if (product.tenantId) {
      if (actor.tenantId !== product.tenantId || !has(Permission.STORE_READ)) {
        return { error: "Product not found.", status: 404 };
      }

      return { tenantId: product.tenantId, canModerate: has(Permission.STORE_MANAGE) };
    }

    // The platform shop's own catalogue: open to any signed-in shopper.
    return { tenantId: null, canModerate: has(Permission.PLATFORM_PRODUCTS_UPDATE) };
  }

  const exercise = await prisma.exercise.findUnique({
    where: { id: subject.subjectId },
    select: { id: true, isActive: true },
  });
  const canManageLibrary = has(Permission.PLATFORM_EXERCISES_MANAGE);
  if (!exercise || (!exercise.isActive && !canManageLibrary)) {
    return { error: "Exercise not found.", status: 404 };
  }

  return { tenantId: null, canModerate: canManageLibrary };
}

/** Nothing new is posted to a gym whose platform access has lapsed. */
async function refuseIfLapsed(tenantId: string | null): Promise<ServiceError | null> {
  if (!tenantId) return null;
  return (await isTenantPlatformExpired(tenantId))
    ? { error: PLATFORM_EXPIRED_MESSAGE, status: 403 }
    : null;
}

export const reactionService = {
  /**
   * Turn a like on or off.
   *
   * `liked` is stated by the caller rather than inferred from the current row,
   * so a double tap on a slow connection settles on what was last pressed
   * instead of flipping to whatever the race happened to leave behind.
   */
  async setLike(
    subject: SubjectRef,
    actor: ReactionActor,
    liked: boolean,
  ): Promise<ServiceResult<{ liked: boolean; likeCount: number }>> {
    const resolved = await resolveSubject(subject, actor);
    if ("error" in resolved) return resolved;

    const lapsed = await refuseIfLapsed(resolved.tenantId);
    if (lapsed) return lapsed;

    if (liked) await reactionRepository.like(subject, actor.userId);
    else await reactionRepository.unlike(subject, actor.userId);

    return { data: { liked, likeCount: await reactionRepository.countLikes(subject) } };
  },

  /**
   * A thread, with what the like button should show.
   *
   * Both figures ride along with the list rather than costing the page two more
   * requests, and both need the caller's identity, which is why they are here
   * rather than on the subject's own read.
   */
  async listComments(
    subject: SubjectRef,
    actor: ReactionActor,
    page: number,
    limit: number,
  ): Promise<PagedResult<CommentPage>> {
    const resolved = await resolveSubject(subject, actor);
    if ("error" in resolved) return resolved;

    const [{ comments, total }, likeCount, liked] = await Promise.all([
      reactionRepository.listComments(subject, page, limit),
      reactionRepository.countLikes(subject),
      reactionRepository.hasLiked(subject, actor.userId),
    ]);

    return { data: { comments, likeCount, liked }, total };
  },

  async addComment(
    subject: SubjectRef,
    actor: ReactionActor,
    body: string,
  ): Promise<ServiceResult<{ comment: ShapedComment }>> {
    const resolved = await resolveSubject(subject, actor);
    if ("error" in resolved) return resolved;

    const lapsed = await refuseIfLapsed(resolved.tenantId);
    if (lapsed) return lapsed;

    return { data: { comment: await reactionRepository.createComment(subject, actor.userId, body) } };
  },

  /**
   * Take a comment down.
   *
   * Its author, or whoever moderates the subject it was written about — which
   * is resolved from the comment itself, so a gym admin cannot reach into
   * another gym's page or into the shared exercise library.
   */
  async deleteComment(
    commentId: string,
    actor: ReactionActor,
  ): Promise<ServiceResult<{ deleted: true; subjectType: SubjectType; tenantId: string | null }>> {
    const comment = await reactionRepository.findComment(commentId);
    if (!comment) return { error: "Comment not found.", status: 404 };

    const subject: SubjectRef = {
      subjectType: comment.subjectType as SubjectType,
      subjectId: comment.subjectId,
    };

    const resolved = await resolveSubject(subject, actor);
    if ("error" in resolved) return resolved;

    if (comment.userId !== actor.userId && !resolved.canModerate) {
      return { error: "You can only delete your own comment.", status: 403 };
    }

    await reactionRepository.deleteComment(commentId);

    return {
      data: {
        deleted: true,
        subjectType: subject.subjectType,
        tenantId: resolved.tenantId,
      },
    };
  },
};
