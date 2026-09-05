/**
 * Documentation: Review routes.
 *
 * - Declares the Hono routes and middleware chain for product reviews, comments, and helpful-vote interactions. This route set is mounted from `/` in the application entrypoint.
 * - Keep routing and authorization wiring here, and delegate request handling to the companion controller instead of placing business logic in route callbacks.
 * - Relative endpoints declared in this file: GET /products/:productId/reviews, GET /products/:productId/reviews/stats, POST /products/:productId/reviews, POST /reviews/:reviewId/comments, POST /reviews/:reviewId/helpful, DELETE /reviews/:reviewId/helpful.
 * - Primary exports: reviewRoutes.
 */
import { Hono } from "hono";
import { authenticate } from "../../middleware/authenticate";
import { optionalAuthenticate } from "../../middleware/optional-authenticate";
import { requirePermissions } from "../../middleware/authorize";
import { Permission } from "@fitconnect/shared/types/permissions";
import { reviewController } from "./review.controller";
import type { AppBindings } from "../../types/app-context";

export const reviewRoutes = new Hono<AppBindings>();

// Get reviews for a product (public).
//
// `optionalAuthenticate` rather than nothing: the list is readable signed out,
// but a signed-in reader gets `helpfulByMe` on each row so the page can show
// the votes they already cast. A missing or invalid token is not an error here,
// it just means no votes to mark.
reviewRoutes.get(
  "/products/:productId/reviews",
  optionalAuthenticate,
  reviewController.listByProduct,
);

// Get rating stats for a product (public)
reviewRoutes.get("/products/:productId/reviews/stats", reviewController.getRatingStats);

// Create a review (authenticated or anonymous)
reviewRoutes.post(
  "/products/:productId/reviews",
  optionalAuthenticate,
  reviewController.createReview,
);

// Add comment to a review (authenticated or anonymous)
reviewRoutes.post("/reviews/:reviewId/comments", optionalAuthenticate, reviewController.addComment);

// Mark review as helpful (authenticated only)
reviewRoutes.post(
  "/reviews/:reviewId/helpful",
  authenticate,
  requirePermissions(Permission.REVIEWS_VOTE),
  reviewController.markHelpful,
);

// Unmark review as helpful (authenticated only)
reviewRoutes.delete(
  "/reviews/:reviewId/helpful",
  authenticate,
  requirePermissions(Permission.REVIEWS_VOTE),
  reviewController.unmarkHelpful,
);
