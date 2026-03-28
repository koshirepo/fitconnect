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
import { reviewController } from "./review.controller";
import type { AppBindings } from "../../types/app-context";

export const reviewRoutes = new Hono<AppBindings>();

// Get reviews for a product (public)
reviewRoutes.get("/products/:productId/reviews", reviewController.listByProduct);

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
reviewRoutes.post("/reviews/:reviewId/helpful", authenticate, reviewController.markHelpful);

// Unmark review as helpful (authenticated only)
reviewRoutes.delete("/reviews/:reviewId/helpful", authenticate, reviewController.unmarkHelpful);
