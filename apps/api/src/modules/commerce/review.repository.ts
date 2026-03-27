import { prisma } from "../../lib/prisma";

const reviewSelect = {
  id: true,
  productId: true,
  userId: true,
  rating: true,
  title: true,
  description: true,
  isAnonymous: true,
  verifiedBuyer: true,
  helpfulCount: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      name: true,
      avatarUrl: true,
    },
  },
  comments: {
    select: {
      id: true,
      text: true,
      isAnonymous: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: { createdAt: "desc" as const },
  },
};

export const reviewRepository = {
  // Get paginated reviews for a product
  async listByProduct(productId: string, page: number, limit: number) {
    const [reviews, total] = await Promise.all([
      prisma.productReview.findMany({
        where: { productId },
        select: reviewSelect,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.productReview.count({ where: { productId } }),
    ]);

    return {
      reviews,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  // Get review with all details
  async getById(reviewId: string) {
    return prisma.productReview.findUnique({
      where: { id: reviewId },
      select: reviewSelect,
    });
  },

  // Create a new review
  async create(
    productId: string,
    userId: string | null,
    data: {
      rating: number;
      title: string;
      description: string;
      isAnonymous: boolean;
    },
  ) {
    return prisma.productReview.create({
      data: {
        productId,
        userId: userId && !data.isAnonymous ? userId : null,
        rating: data.rating,
        title: data.title,
        description: data.description,
        isAnonymous: data.isAnonymous,
        verifiedBuyer: userId ? true : false, // TODO: Check if user actually purchased
      },
      select: reviewSelect,
    });
  },

  // Add comment to a review
  async addComment(reviewId: string, userId: string | null, text: string, isAnonymous: boolean) {
    return prisma.productReviewComment.create({
      data: {
        reviewId,
        userId: userId && !isAnonymous ? userId : null,
        text,
        isAnonymous,
      },
      select: {
        id: true,
        text: true,
        isAnonymous: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
    });
  },

  // Mark review as helpful
  async markHelpful(reviewId: string, userId: string) {
    // Upsert: create if doesn't exist, ignore if already exists
    await prisma.productReviewHelpful.upsert({
      where: {
        reviewId_userId: { reviewId, userId },
      },
      create: {
        reviewId,
        userId,
      },
      update: {},
    });

    // Increment helpful count
    await prisma.productReview.update({
      where: { id: reviewId },
      data: { helpfulCount: { increment: 1 } },
    });

    return { success: true };
  },

  // Unmark review as helpful
  async unmarkHelpful(reviewId: string, userId: string) {
    const existing = await prisma.productReviewHelpful.findUnique({
      where: {
        reviewId_userId: { reviewId, userId },
      },
    });

    if (existing) {
      await prisma.productReviewHelpful.delete({
        where: {
          reviewId_userId: { reviewId, userId },
        },
      });

      // Decrement helpful count
      await prisma.productReview.update({
        where: { id: reviewId },
        data: {
          helpfulCount: { decrement: 1 },
        },
      });
    }

    return { success: true };
  },

  // Get average rating for a product
  async getProductRatingStats(productId: string) {
    const stats = await prisma.productReview.aggregate({
      where: { productId },
      _avg: { rating: true },
      _count: true,
    });

    const distribution = await prisma.productReview.groupBy({
      by: ["rating"],
      where: { productId },
      _count: true,
      orderBy: { rating: "asc" as const },
    });

    return {
      averageRating: stats._avg.rating || 0,
      totalReviews: stats._count,
      distribution: distribution.map((d) => ({
        rating: d.rating,
        count: d._count,
      })),
    };
  },

  // Check if user has marked review as helpful
  async isMarkedHelpful(reviewId: string, userId: string) {
    const record = await prisma.productReviewHelpful.findUnique({
      where: {
        reviewId_userId: { reviewId, userId },
      },
    });
    return !!record;
  },
};
