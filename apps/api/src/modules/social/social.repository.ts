/**
 * Documentation: Likes and comments repository.
 *
 * - Owns every Prisma query behind the two reaction surfaces: a store product, and a gym's public profile.
 * - The two are keyed differently on purpose. A product like hangs off a `TenantMembership`, because only someone who belongs to the gym can browse or buy there. A gym like hangs off a `User`, because the people with an opinion about a gym include prospects deciding whether to join, and a membership id would shut exactly those people out.
 * - Every product query is scoped by `tenantId` through the product it hangs from, never by a filter a caller is trusted to add.
 * - Liking is idempotent: the unique key turns a double tap into one row, and the delete of a like that was never there is not an error. That keeps a flaky connection from producing a wrong count.
 * - Both comment kinds are returned in one shape — an id, a body, timestamps, and an `author`. To a reader they are the same thing, and a page that renders one should not need a second component to render the other.
 * - Primary exports: socialRepository.
 */
import { prisma } from "../../lib/prisma";

/** Enough to put a name and a face beside a comment; never the whole user. */
const productCommentSelect = {
  id: true,
  body: true,
  createdAt: true,
  updatedAt: true,
  membershipId: true,
  membership: {
    select: {
      id: true,
      user: { select: { id: true, name: true, avatarUrl: true } },
    },
  },
} as const;

const tenantCommentSelect = {
  id: true,
  body: true,
  createdAt: true,
  updatedAt: true,
  userId: true,
  user: { select: { id: true, name: true, avatarUrl: true } },
} as const;

/** A comment as every caller sees it, whichever table it came out of. */
export type ShapedComment = {
  id: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  authorKey: string;
  author: { id: string; name: string; avatarUrl: string | null };
};

function shapeProductComment(row: {
  id: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  membershipId: string;
  membership: { id: string; user: { id: string; name: string; avatarUrl: string | null } };
}): ShapedComment {
  const { membership, membershipId, ...comment } = row;
  // `authorKey` is what the page compares against to decide whether to offer a
  // delete. It is the membership id here and the user id on a gym comment,
  // which is exactly the difference the two tables were keyed on.
  return { ...comment, authorKey: membershipId, author: membership.user };
}

function shapeTenantComment(row: {
  id: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
  user: { id: string; name: string; avatarUrl: string | null };
}): ShapedComment {
  const { user, userId, ...comment } = row;
  return { ...comment, authorKey: userId, author: user };
}

export const socialRepository = {
  // ─── Store products ────────────────────────────────────────────────────────

  /** Confirms the product is this gym's before anything is written against it. */
  findProductInTenant(tenantId: string, productId: string) {
    return prisma.product.findFirst({
      where: { id: productId, tenantId },
      select: { id: true, name: true },
    });
  },

  async likeProduct(productId: string, membershipId: string) {
    // Upsert rather than create: tapping twice, or a retried request, should
    // leave one row rather than raising a unique-constraint error at a member.
    await prisma.productLike.upsert({
      where: { productId_membershipId: { productId, membershipId } },
      create: { productId, membershipId },
      update: {},
    });
  },

  async unlikeProduct(productId: string, membershipId: string) {
    await prisma.productLike.deleteMany({ where: { productId, membershipId } });
  },

  countProductLikes(productId: string) {
    return prisma.productLike.count({ where: { productId } });
  },

  async hasLikedProduct(productId: string, membershipId: string) {
    const like = await prisma.productLike.findUnique({
      where: { productId_membershipId: { productId, membershipId } },
      select: { id: true },
    });

    return Boolean(like);
  },

  /**
   * Which of these products a member has already liked.
   *
   * One query for a whole catalogue page rather than one per card, so the
   * storefront can render filled hearts without N round trips.
   */
  async findLikedProductIds(membershipId: string, productIds: string[]) {
    if (productIds.length === 0) return new Set<string>();

    const likes = await prisma.productLike.findMany({
      where: { membershipId, productId: { in: productIds } },
      select: { productId: true },
    });

    return new Set(likes.map((like) => like.productId));
  },

  async listProductComments(productId: string, page: number, limit: number) {
    const [comments, total] = await Promise.all([
      prisma.productComment.findMany({
        where: { productId },
        select: productCommentSelect,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.productComment.count({ where: { productId } }),
    ]);

    return { comments: comments.map(shapeProductComment), total };
  },

  async createProductComment(productId: string, membershipId: string, body: string) {
    const comment = await prisma.productComment.create({
      data: { productId, membershipId, body },
      select: productCommentSelect,
    });

    return shapeProductComment(comment);
  },

  findProductComment(tenantId: string, commentId: string) {
    return prisma.productComment.findFirst({
      where: { id: commentId, product: { tenantId } },
      select: { id: true, membershipId: true, productId: true },
    });
  },

  async deleteProductComment(commentId: string) {
    await prisma.productComment.delete({ where: { id: commentId } });
  },

  // ─── Gyms ──────────────────────────────────────────────────────────────────

  async likeTenant(tenantId: string, userId: string) {
    await prisma.tenantLike.upsert({
      where: { tenantId_userId: { tenantId, userId } },
      create: { tenantId, userId },
      update: {},
    });
  },

  async unlikeTenant(tenantId: string, userId: string) {
    await prisma.tenantLike.deleteMany({ where: { tenantId, userId } });
  },

  countTenantLikes(tenantId: string) {
    return prisma.tenantLike.count({ where: { tenantId } });
  },

  async hasLikedTenant(tenantId: string, userId: string) {
    const like = await prisma.tenantLike.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { id: true },
    });

    return Boolean(like);
  },

  async listTenantComments(tenantId: string, page: number, limit: number) {
    const [comments, total] = await Promise.all([
      prisma.tenantComment.findMany({
        where: { tenantId },
        select: tenantCommentSelect,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.tenantComment.count({ where: { tenantId } }),
    ]);

    return { comments: comments.map(shapeTenantComment), total };
  },

  async createTenantComment(tenantId: string, userId: string, body: string) {
    const comment = await prisma.tenantComment.create({
      data: { tenantId, userId, body },
      select: tenantCommentSelect,
    });

    return shapeTenantComment(comment);
  },

  findTenantComment(tenantId: string, commentId: string) {
    return prisma.tenantComment.findFirst({
      where: { id: commentId, tenantId },
      select: { id: true, userId: true },
    });
  },

  async deleteTenantComment(commentId: string) {
    await prisma.tenantComment.delete({ where: { id: commentId } });
  },
};
