/**
 * Documentation: Review service.
 *
 * - Implements the business rules for product reviews, comments, and helpful-vote interactions by coordinating repositories, shared helpers, and cross-cutting utilities like email or audit logging where needed.
 * - Prefer placing workflow logic, derived calculations, and domain invariants here instead of inside controllers or repositories.
 * - Primary exports: reviewService.
 */
import { reviewRepository } from "./review.repository";
import type { CreateReviewInput, CreateCommentInput } from "./review.schema";

export const reviewService = {
  /**
   * Execute the `list by product` workflow for the commerce module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async listByProduct(productId: string, page = 1, limit = 10) {
    const result = await reviewRepository.listByProduct(productId, page, limit);
    return { data: result };
  },

  /**
   * Execute the `create review` workflow for the commerce module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async createReview(productId: string, userId: string | null, input: CreateReviewInput) {
    const review = await reviewRepository.create(productId, userId, input);
    return { data: { review } };
  },

  /**
   * Execute the `add comment` workflow for the commerce module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async addComment(reviewId: string, userId: string | null, input: CreateCommentInput) {
    const comment = await reviewRepository.addComment(
      reviewId,
      userId,
      input.text,
      input.isAnonymous,
    );
    return { data: { comment } };
  },

  /**
   * Execute the `mark helpful` workflow for the commerce module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async markHelpful(reviewId: string, userId: string) {
    const result = await reviewRepository.markHelpful(reviewId, userId);
    return { data: result };
  },

  /**
   * Execute the `unmark helpful` workflow for the commerce module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async unmarkHelpful(reviewId: string, userId: string) {
    const result = await reviewRepository.unmarkHelpful(reviewId, userId);
    return { data: result };
  },

  /**
   * Execute the `get product rating stats` workflow for the commerce module.
   * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
   */
  async getProductRatingStats(productId: string) {
    const stats = await reviewRepository.getProductRatingStats(productId);
    return { data: stats };
  },
};
