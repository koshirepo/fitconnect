/**
 * Documentation: Review controller.
 *
 * - Owns the HTTP boundary for product reviews, comments, and helpful-vote interactions, including request parsing, service invocation, response shaping, and request-scoped side effects such as audit logging.
 * - Controller code should stay thin: validate inputs, call the service layer, and convert outcomes into the shared response envelope.
 * - Primary exports: reviewController.
 */
import type { Context } from "hono";
import { ok, okPaginated, badRequest, notFound } from "../../lib/response";
import { parseBody } from "../../lib/http";
import { reviewService } from "./review.service";
import { createReviewSchema, createCommentSchema } from "./review.schema";
import { reviewRepository } from "./review.repository";
import type { AppBindings } from "../../types/app-context";

type AppContext = Context<AppBindings>;

export const reviewController = {
  /**
   * Handle the `list by product` HTTP action for the commerce module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async listByProduct(c: AppContext) {
    const productId = c.req.param("productId");
    const page = parseInt(c.req.query("page") || "1", 10);
    const limit = parseInt(c.req.query("limit") || "10", 10);

    if (!productId) {
      return badRequest(c, "Product ID is required");
    }

    // Anonymous readers still get the list; a signed-in one also gets their own
    // helpful votes marked on it, which is the only thing the token changes here.
    const viewerId = c.get("optionalAuthUser")?.id ?? null;

    const result = await reviewService.listByProduct(productId, page, limit, viewerId);
    return okPaginated(c, result.data.reviews, {
      page: result.data.page,
      limit: result.data.limit,
      total: result.data.total,
    });
  },

  /**
   * Handle the `create review` HTTP action for the commerce module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async createReview(c: AppContext) {
    const productId = c.req.param("productId");

    if (!productId) {
      return badRequest(c, "Product ID is required");
    }

    const parsed = await parseBody(c, createReviewSchema);
    if (!parsed.ok) return parsed.response;

    const userId = c.get("optionalAuthUser")?.id || null;

    const result = await reviewService.createReview(productId, userId, parsed.data);
    return ok(c, result.data.review, 201);
  },

  /**
   * Handle the `add comment` HTTP action for the commerce module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async addComment(c: AppContext) {
    const reviewId = c.req.param("reviewId");

    if (!reviewId) {
      return badRequest(c, "Review ID is required");
    }

    // Check if review exists
    const review = await reviewRepository.getById(reviewId);
    if (!review) {
      return notFound(c, "Review not found");
    }

    const parsed = await parseBody(c, createCommentSchema);
    if (!parsed.ok) return parsed.response;

    const userId = c.get("optionalAuthUser")?.id || null;

    const result = await reviewService.addComment(reviewId, userId, parsed.data);
    return ok(c, result.data.comment, 201);
  },

  /**
   * Handle the `mark helpful` HTTP action for the commerce module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async markHelpful(c: AppContext) {
    const reviewId = c.req.param("reviewId");
    const userId = c.get("authUser").id;

    if (!reviewId) {
      return badRequest(c, "Review ID is required");
    }

    // Check if review exists
    const review = await reviewRepository.getById(reviewId);
    if (!review) {
      return notFound(c, "Review not found");
    }

    const result = await reviewService.markHelpful(reviewId, userId);
    return ok(c, result.data);
  },

  /**
   * Handle the `unmark helpful` HTTP action for the commerce module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async unmarkHelpful(c: AppContext) {
    const reviewId = c.req.param("reviewId");
    const userId = c.get("authUser").id;

    if (!reviewId) {
      return badRequest(c, "Review ID is required");
    }

    // Check if review exists
    const review = await reviewRepository.getById(reviewId);
    if (!review) {
      return notFound(c, "Review not found");
    }

    const result = await reviewService.unmarkHelpful(reviewId, userId);
    return ok(c, result.data);
  },

  /**
   * Handle the `get rating stats` HTTP action for the commerce module.
   * Read request state, delegate to the service layer, and translate outcomes into the shared API response shape.
   */
  async getRatingStats(c: AppContext) {
    const productId = c.req.param("productId");

    if (!productId) {
      return badRequest(c, "Product ID is required");
    }

    const result = await reviewService.getProductRatingStats(productId);
    return ok(c, result.data);
  },
};
