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
