import { reviewRepository } from "./review.repository";
import type { CreateReviewInput, CreateCommentInput } from "./review.schema";

export const reviewService = {
  async listByProduct(productId: string, page = 1, limit = 10) {
    const result = await reviewRepository.listByProduct(productId, page, limit);
    return { data: result };
  },

  async createReview(productId: string, userId: string | null, input: CreateReviewInput) {
    const review = await reviewRepository.create(productId, userId, input);
    return { data: { review } };
  },

  async addComment(reviewId: string, userId: string | null, input: CreateCommentInput) {
    const comment = await reviewRepository.addComment(
      reviewId,
      userId,
      input.text,
      input.isAnonymous,
    );
    return { data: { comment } };
  },

  async markHelpful(reviewId: string, userId: string) {
    const result = await reviewRepository.markHelpful(reviewId, userId);
    return { data: result };
  },

  async unmarkHelpful(reviewId: string, userId: string) {
    const result = await reviewRepository.unmarkHelpful(reviewId, userId);
    return { data: result };
  },

  async getProductRatingStats(productId: string) {
    const stats = await reviewRepository.getProductRatingStats(productId);
    return { data: stats };
  },
};
