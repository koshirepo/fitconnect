import { api } from "./client";
import type { ApiResponse } from "@/shared/types";

export interface ProductReview {
  id: string;
  productId: string;
  userId: string | null;
  rating: number;
  title: string;
  description: string;
  isAnonymous: boolean;
  verifiedBuyer: boolean;
  helpfulCount: number;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    name: string;
    avatarUrl?: string;
  } | null;
  comments?: ProductReviewComment[];
}

export interface ProductReviewComment {
  id: string;
  text: string;
  isAnonymous: boolean;
  createdAt: string;
  user?: {
    id: string;
    name: string;
    avatarUrl?: string;
  } | null;
}

export interface RatingStats {
  averageRating: number;
  totalReviews: number;
  distribution: Array<{ rating: number; count: number }>;
}

export const reviewsApi = {
  // Get reviews for a product
  listByProduct: (productId: string, page: number = 1, limit: number = 10) =>
    api.get<ApiResponse<ProductReview[]>>(
      `/products/${productId}/reviews?page=${page}&limit=${limit}`,
    ),

  // Get rating statistics for a product
  getRatingStats: (productId: string) =>
    api.get<ApiResponse<RatingStats>>(`/products/${productId}/reviews/stats`),

  // Create a review
  createReview: (
    productId: string,
    data: {
      rating: number;
      title: string;
      description: string;
      isAnonymous: boolean;
    },
  ) => api.post<ApiResponse<{ review: ProductReview }>>(`/products/${productId}/reviews`, data),

  // Add comment to a review
  addComment: (
    reviewId: string,
    data: {
      text: string;
      isAnonymous: boolean;
    },
  ) =>
    api.post<ApiResponse<{ comment: ProductReviewComment }>>(`/reviews/${reviewId}/comments`, data),

  // Mark review as helpful
  markHelpful: (reviewId: string) =>
    api.post<ApiResponse<{ success: boolean }>>(`/reviews/${reviewId}/helpful`, {}),

  // Unmark review as helpful
  unmarkHelpful: (reviewId: string) =>
    api.delete<ApiResponse<{ success: boolean }>>(`/reviews/${reviewId}/helpful`),
};
