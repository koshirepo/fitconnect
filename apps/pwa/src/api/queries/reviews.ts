/**
 * Documentation: Platform shop review queries and mutations.
 *
 * - Wraps `reviewsApi` so the shop's product page declares what it needs instead of fetching in a `useEffect` and holding the result in component state, which is what it did before and why a new review never appeared until a reload.
 * - Not gym-scoped. A product in the platform catalogue is the same product whichever gym the visitor came from, so these use the plain query helpers rather than the tenant-aware ones. The gym's own store has its own hooks in `social.ts`.
 * - Every write invalidates the product's whole review prefix. The list, the rating average, and the distribution histogram all move together when one review lands, and invalidating the root is cheaper to reason about than three separate keys that must be kept in step.
 * - Reviews are readable signed out, so these are ordinary queries with no auth gate. Whether somebody may *write* is the caller's decision, not this file's.
 * - Primary exports: useProductReviews, useProductRatingStats, useCreateReview, useAddReviewComment, useToggleReviewHelpful.
 */
import { useQuery } from "@tanstack/react-query";
import {
  reviewsApi,
  type ProductReview,
  type ProductReviewComment,
  type RatingStats,
} from "@/api/reviews";
import { queryKeys } from "@/lib/query-keys";
import { useAppMutation } from "./shared";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

export function useProductReviews(
  productId: string | undefined,
  page: number = DEFAULT_PAGE,
  limit: number = DEFAULT_LIMIT,
) {
  return useQuery({
    queryKey: queryKeys.reviews.list(productId ?? "none", page, limit),
    queryFn: async (): Promise<ProductReview[]> =>
      (await reviewsApi.listByProduct(productId!, page, limit)).data.data ?? [],
    enabled: Boolean(productId),
  });
}

export function useProductRatingStats(productId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.reviews.stats(productId ?? "none"),
    queryFn: async (): Promise<RatingStats | null> =>
      (await reviewsApi.getRatingStats(productId!)).data.data ?? null,
    enabled: Boolean(productId),
  });
}

export function useCreateReview(productId: string | undefined) {
  return useAppMutation(
    async (data: {
      rating: number;
      title: string;
      description: string;
      isAnonymous: boolean;
    }): Promise<ProductReview | null> =>
      (await reviewsApi.createReview(productId!, data)).data.data?.review ?? null,
    { invalidates: [queryKeys.reviews.root(productId ?? "none")] },
  );
}

export function useAddReviewComment(productId: string | undefined) {
  return useAppMutation(
    async (vars: {
      reviewId: string;
      text: string;
      isAnonymous: boolean;
    }): Promise<ProductReviewComment | null> =>
      (
        await reviewsApi.addComment(vars.reviewId, {
          text: vars.text,
          isAnonymous: vars.isAnonymous,
        })
      ).data.data?.comment ?? null,
    { invalidates: [queryKeys.reviews.root(productId ?? "none")] },
  );
}

/**
 * Mark or unmark a review as helpful.
 *
 * Not optimistic, unlike a product like. A like is a gesture whose whole value
 * is being instant; this is a checkbox next to a number nobody is watching, and
 * an honest count is worth more here than a fast one.
 */
export function useToggleReviewHelpful(productId: string | undefined) {
  return useAppMutation(
    async (vars: { reviewId: string; helpful: boolean }) =>
      vars.helpful
        ? (await reviewsApi.markHelpful(vars.reviewId)).data.data
        : (await reviewsApi.unmarkHelpful(vars.reviewId)).data.data,
    { invalidates: [queryKeys.reviews.root(productId ?? "none")] },
  );
}
