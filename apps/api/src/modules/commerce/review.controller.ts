import type { Context } from "hono";
import { ok, okPaginated, badRequest, notFound } from "../../lib/response";
import { parseBody } from "../../lib/http";
import { reviewService } from "./review.service";
import { createReviewSchema, createCommentSchema } from "./review.schema";
import { reviewRepository } from "./review.repository";
import type { AppBindings } from "../../types/app-context";

type AppContext = Context<AppBindings>;

export const reviewController = {
  async listByProduct(c: AppContext) {
    const productId = c.req.param("productId");
    const page = parseInt(c.req.query("page") || "1", 10);
    const limit = parseInt(c.req.query("limit") || "10", 10);

    if (!productId) {
      return badRequest(c, "Product ID is required");
    }

    const result = await reviewService.listByProduct(productId, page, limit);
    return okPaginated(c, result.data.reviews, {
      page: result.data.page,
      limit: result.data.limit,
      total: result.data.total,
    });
  },

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

  async getRatingStats(c: AppContext) {
    const productId = c.req.param("productId");

    if (!productId) {
      return badRequest(c, "Product ID is required");
    }

    const result = await reviewService.getProductRatingStats(productId);
    return ok(c, result.data);
  },
};
