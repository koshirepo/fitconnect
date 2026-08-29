/**
 * Documentation: Likes and comments service.
 *
 * - The rules behind reacting to a store product or to a gym: who may react, who may delete what somebody else wrote, and what a caller gets back.
 * - A like always answers with the resulting state — `liked` and the fresh count — rather than an empty acknowledgement. The button that sent it needs both, and returning them here saves every caller a follow-up read.
 * - Deleting a comment is allowed to its author, and to a moderator. The author check is the common case; the moderator path exists because a gym has to be able to take down something abusive on its own page.
 * - Product reactions require a membership, resolved from the session rather than accepted from the request. Gym reactions require only an account, deliberately: the people with an opinion about a gym include prospects who have not joined.
 * - Primary exports: socialService.
 */
import { socialRepository, type ShapedComment } from "./social.repository";
import { paymentRepository } from "../payments/payments.repository";

/**
 * Every failure this module can produce.
 *
 * Written out rather than inferred from the return statements: an inferred
 * union carries `data?: undefined` on the failure half, which stops `"error" in
 * result` from narrowing and makes every caller cast.
 */
type ServiceError = { error: string; status: 400 | 403 | 404 };
type ServiceResult<T> = { data: T } | ServiceError;
type PagedResult<T> = { data: T; total: number } | ServiceError;

/** What a comment list answers with, whichever surface asked for it. */
type CommentPage = { comments: ShapedComment[]; likeCount: number; liked: boolean };

/** The membership this user holds at this gym, or the error to answer with. */
async function requireMembership(
  tenantId: string,
  userId: string,
): Promise<ServiceResult<{ id: string }>> {
  const membership = await paymentRepository.findMembershipByUser(tenantId, userId);
  if (!membership) return { error: "You are not a member of this gym.", status: 403 as const };

  return { data: membership };
}

export const socialService = {
  // ─── Store products ────────────────────────────────────────────────────────

  /**
   * Turn a product like on or off.
   *
   * `liked` is stated by the caller rather than inferred from the current row,
   * so a double tap on a slow connection settles on what the member last
   * pressed instead of flipping to whatever the race happened to leave behind.
   */
  async setProductLike(
    tenantId: string,
    productId: string,
    userId: string,
    liked: boolean,
  ): Promise<ServiceResult<{ liked: boolean; likeCount: number }>> {
    const product = await socialRepository.findProductInTenant(tenantId, productId);
    if (!product) return { error: "Product not found.", status: 404 };

    const membership = await requireMembership(tenantId, userId);
    if ("error" in membership) return membership;

    if (liked) await socialRepository.likeProduct(productId, membership.data.id);
    else await socialRepository.unlikeProduct(productId, membership.data.id);

    return { data: { liked, likeCount: await socialRepository.countProductLikes(productId) } };
  },

  async listProductComments(
    tenantId: string,
    productId: string,
    userId: string,
    page: number,
    limit: number,
  ): Promise<PagedResult<CommentPage>> {
    const product = await socialRepository.findProductInTenant(tenantId, productId);
    if (!product) return { error: "Product not found.", status: 404 };

    const membership = await paymentRepository.findMembershipByUser(tenantId, userId);
    const { comments, total } = await socialRepository.listProductComments(productId, page, limit);

    return {
      data: {
        comments,
        // Both are about what the button should render, and both need this
        // caller's identity, so they ride along with the list rather than
        // costing the storefront two more requests.
        likeCount: await socialRepository.countProductLikes(productId),
        liked: membership
          ? await socialRepository.hasLikedProduct(productId, membership.id)
          : false,
      },
      total,
    };
  },

  async addProductComment(
    tenantId: string,
    productId: string,
    userId: string,
    body: string,
  ): Promise<ServiceResult<{ comment: ShapedComment }>> {
    const product = await socialRepository.findProductInTenant(tenantId, productId);
    if (!product) return { error: "Product not found.", status: 404 };

    const membership = await requireMembership(tenantId, userId);
    if ("error" in membership) return membership;

    const comment = await socialRepository.createProductComment(productId, membership.data.id, body);
    return { data: { comment } };
  },

  /** `canModerate` is the gym taking something down; otherwise, authors only. */
  async deleteProductComment(
    tenantId: string,
    commentId: string,
    userId: string,
    canModerate: boolean,
  ): Promise<ServiceResult<{ deleted: true }>> {
    const comment = await socialRepository.findProductComment(tenantId, commentId);
    if (!comment) return { error: "Comment not found.", status: 404 };

    if (!canModerate) {
      const membership = await requireMembership(tenantId, userId);
      if ("error" in membership) return membership;
      if (membership.data.id !== comment.membershipId) {
        return { error: "You can only delete your own comment.", status: 403 };
      }
    }

    await socialRepository.deleteProductComment(commentId);
    return { data: { deleted: true } };
  },

  // ─── Gyms ──────────────────────────────────────────────────────────────────

  async setTenantLike(
    tenantId: string,
    userId: string,
    liked: boolean,
  ): Promise<{ data: { liked: boolean; likeCount: number } }> {
    if (liked) await socialRepository.likeTenant(tenantId, userId);
    else await socialRepository.unlikeTenant(tenantId, userId);

    return { data: { liked, likeCount: await socialRepository.countTenantLikes(tenantId) } };
  },

  /**
   * A gym's wall.
   *
   * `userId` is optional because this is readable by a visitor with no account
   * — the public profile page uses the same call. Without one there is nobody
   * to have liked anything, so `liked` is false.
   */
  async listTenantComments(
    tenantId: string,
    userId: string | null,
    page: number,
    limit: number,
  ): Promise<{ data: CommentPage; total: number }> {
    const { comments, total } = await socialRepository.listTenantComments(tenantId, page, limit);

    return {
      data: {
        comments,
        likeCount: await socialRepository.countTenantLikes(tenantId),
        liked: userId ? await socialRepository.hasLikedTenant(tenantId, userId) : false,
      },
      total,
    };
  },

  async addTenantComment(
    tenantId: string,
    userId: string,
    body: string,
  ): Promise<{ data: { comment: ShapedComment } }> {
    const comment = await socialRepository.createTenantComment(tenantId, userId, body);
    return { data: { comment } };
  },

  async deleteTenantComment(
    tenantId: string,
    commentId: string,
    userId: string,
    canModerate: boolean,
  ): Promise<ServiceResult<{ deleted: true }>> {
    const comment = await socialRepository.findTenantComment(tenantId, commentId);
    if (!comment) return { error: "Comment not found.", status: 404 };

    if (!canModerate && comment.userId !== userId) {
      return { error: "You can only delete your own comment.", status: 403 };
    }

    await socialRepository.deleteTenantComment(commentId);
    return { data: { deleted: true } };
  },
};
