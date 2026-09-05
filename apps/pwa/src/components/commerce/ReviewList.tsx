/**
 * Documentation: The list of reviews on a platform-shop product.
 *
 * - Now the same two primitives the gym's comment threads use — `FeedbackList` for the rows, `FeedbackComposer` for the reply box. A review is a comment with stars, a title and a helpful button above and below the body, and those are slots rather than a second implementation.
 * - What this file keeps is only what is specific to a review: the stars, the verified-buyer badge, the helpful toggle, and the nested comment thread each review carries.
 * - Anonymity is decided by the server, which nulls the author on the way out. `authorFor` is the one place that turns "no user" into a display name, instead of the same three-branch conditional written out at every level.
 * - Writes go through the react-query hooks so the list, the average and the histogram all refresh together. This used to call `reviewsApi` directly and report failures with `alert()`, which meant a browser dialog in the middle of a shopping flow and a page that still showed the old rating afterwards.
 * - Whether somebody has already found a review helpful is the server's fact, not this component's. It used to be a `Set` in local state that started empty on every mount, so a returning reader saw their own vote missing and could cast it again.
 * - Primary exports: ReviewList.
 */
import * as React from "react";
import { Star, ThumbsUp, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeedbackComposer } from "@/components/feedback/feedback-composer";
import { FeedbackEntry, FeedbackList } from "@/components/feedback/feedback-list";
import { useAddReviewComment, useToggleReviewHelpful } from "@/api/queries/reviews";
import { useAuthStore } from "@/stores/auth";
import type { ProductReview } from "@/api/reviews";

/** A review or comment whose author the server withheld reads as anonymous. */
function authorFor(entry: {
  isAnonymous: boolean;
  user?: { name: string; avatarUrl?: string } | null;
}) {
  if (entry.isAnonymous || !entry.user) {
    return { name: "Anonymous", avatarUrl: null };
  }
  return { name: entry.user.name, avatarUrl: entry.user.avatarUrl ?? null };
}

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          size={16}
          aria-hidden
          className={
            index < rating
              ? "fill-amber-400 text-amber-400"
              : "text-muted-foreground/40"
          }
        />
      ))}
    </div>
  );
}

export function ReviewList({
  productId,
  reviews,
  loading = false,
}: {
  productId: string;
  reviews: ProductReview[];
  loading?: boolean;
}) {
  const { user } = useAuthStore();
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const addComment = useAddReviewComment(productId);
  const toggleHelpful = useToggleReviewHelpful(productId);

  const byId = React.useMemo(
    () => new Map(reviews.map((review) => [review.id, review])),
    [reviews],
  );

  const items = React.useMemo(
    () =>
      reviews.map((review) => {
        const author = authorFor(review);
        return {
          id: review.id,
          authorName: author.name,
          avatarUrl: author.avatarUrl,
          createdAt: review.createdAt,
          body: review.description,
        };
      }),
    [reviews],
  );

  return (
    <FeedbackList
      items={items}
      loading={loading}
      emptyTitle="No reviews yet"
      emptyDescription="Be the first to review this product."
      renderEntry={(item) => {
        const review = byId.get(item.id);
        if (!review) return null;

        const isOpen = expanded === review.id;
        const comments = review.comments ?? [];

        return (
          <FeedbackEntry
            item={item}
            meta={
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Stars rating={review.rating} />
                <span className="text-sm font-semibold">{review.title}</span>
                {review.verifiedBuyer && (
                  <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    Verified Buyer
                  </span>
                )}
              </div>
            }
            footer={
              <div className="mt-2 space-y-3">
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!user || toggleHelpful.isPending}
                    className={review.helpfulByMe ? "text-primary" : ""}
                    aria-pressed={Boolean(review.helpfulByMe)}
                    onClick={() =>
                      toggleHelpful.mutate({
                        reviewId: review.id,
                        helpful: !review.helpfulByMe,
                      })
                    }
                    aria-label={`Mark review by ${item.authorName} as helpful`}
                  >
                    <ThumbsUp size={16} />
                    <span className="ml-1">{review.helpfulCount}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpanded(isOpen ? null : review.id)}
                    aria-expanded={isOpen}
                  >
                    <MessageCircle size={16} />
                    <span className="ml-1">
                      {comments.length} {comments.length === 1 ? "comment" : "comments"}
                    </span>
                  </Button>
                </div>

                {isOpen && (
                  <div className="space-y-3 border-t pt-3">
                    <FeedbackList
                      items={comments.map((comment) => {
                        const author = authorFor(comment);
                        return {
                          id: comment.id,
                          authorName: author.name,
                          avatarUrl: author.avatarUrl,
                          createdAt: comment.createdAt,
                          body: comment.text,
                        };
                      })}
                      emptyTitle="No comments yet"
                      emptyDescription="Add the first reply to this review."
                    />

                    <FeedbackComposer
                      onSubmit={(text) =>
                        addComment.mutateAsync({
                          reviewId: review.id,
                          text,
                          isAnonymous: !user,
                        })
                      }
                      placeholder={
                        user ? "Add a comment..." : "Comment anonymously, or log in first"
                      }
                      submitLabel="Post"
                      rows={2}
                      ariaLabel={`Reply to the review by ${item.authorName}`}
                    />
                  </div>
                )}
              </div>
            }
          />
        );
      }}
    />
  );
}
