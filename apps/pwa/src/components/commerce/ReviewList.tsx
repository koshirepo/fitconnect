import React, { useState } from "react";
import { Star, ThumbsUp, MessageCircle, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProductReview } from "@/api/reviews";
import { reviewsApi } from "@/api/reviews";
import { useAuthStore } from "@/stores/auth";
import { getApiError } from "@/api/client";
import { resolveAssetUrl } from "@/lib/assets";

interface ReviewListProps {
  reviews: ProductReview[];
  onCommentAdded?: (reviewId: string) => void;
  onHelpfulToggled?: (reviewId: string) => void;
}

export const ReviewList: React.FC<ReviewListProps> = ({
  reviews,
  onCommentAdded,
  onHelpfulToggled,
}) => {
  const { user } = useAuthStore();
  const [expandedReviews, setExpandedReviews] = useState<Set<string>>(new Set());
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [loadingComments, setLoadingComments] = useState<Set<string>>(new Set());
  const [helpfulStates, setHelpfulStates] = useState<Set<string>>(new Set());

  const toggleExpanded = (reviewId: string) => {
    const newExpanded = new Set(expandedReviews);
    if (newExpanded.has(reviewId)) {
      newExpanded.delete(reviewId);
    } else {
      newExpanded.add(reviewId);
    }
    setExpandedReviews(newExpanded);
  };

  const handleAddComment = async (reviewId: string) => {
    const text = commentText[reviewId]?.trim();
    if (!text) return;

    setLoadingComments((prev) => new Set([...prev, reviewId]));
    try {
      await reviewsApi.addComment(reviewId, {
        text,
        isAnonymous: !user,
      });
      setCommentText((prev) => ({ ...prev, [reviewId]: "" }));
      onCommentAdded?.(reviewId);
    } catch (error) {
      console.error("Failed to add comment:", error);
      alert(`Error adding comment: ${getApiError(error)}`);
    } finally {
      setLoadingComments((prev) => {
        const newSet = new Set(prev);
        newSet.delete(reviewId);
        return newSet;
      });
    }
  };

  const handleToggleHelpful = async (reviewId: string) => {
    if (!user) {
      alert("Please log in to mark reviews as helpful");
      return;
    }

    const isCurrentlyHelpful = helpfulStates.has(reviewId);

    try {
      if (isCurrentlyHelpful) {
        await reviewsApi.unmarkHelpful(reviewId);
        setHelpfulStates((prev) => {
          const newSet = new Set(prev);
          newSet.delete(reviewId);
          return newSet;
        });
      } else {
        await reviewsApi.markHelpful(reviewId);
        setHelpfulStates((prev) => new Set([...prev, reviewId]));
      }
      onHelpfulToggled?.(reviewId);
    } catch (error) {
      console.error("Failed to update helpful status:", error);
    }
  };

  return (
    <div className="space-y-4">
      {reviews.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          No reviews yet. Be the first to review this product!
        </p>
      ) : (
        reviews.map((review) => (
          <div key={review.id} className="border rounded-lg p-4">
            {/* Review Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                {/* Stars and Title */}
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        size={16}
                        className={
                          i < review.rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
                        }
                      />
                    ))}
                  </div>
                  <span className="font-semibold">{review.title}</span>
                </div>

                {/* Reviewer Info */}
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  {review.isAnonymous ? (
                    <>
                      <User size={14} />
                      <span>Anonymous</span>
                    </>
                  ) : review.user ? (
                    <>
                      {review.user.avatarUrl ? (
                        <img
                          src={resolveAssetUrl(review.user.avatarUrl) ?? review.user.avatarUrl}
                          alt={review.user.name}
                          loading="lazy"
                          decoding="async"
                          className="h-6 w-6 rounded-full"
                        />
                      ) : (
                        <User size={14} />
                      )}
                      <span>{review.user.name}</span>
                    </>
                  ) : (
                    <>
                      <User size={14} />
                      <span>Anonymous</span>
                    </>
                  )}
                  {review.verifiedBuyer && (
                    <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">
                      Verified Buyer
                    </span>
                  )}
                  <span>•</span>
                  <span>{new Date(review.createdAt).toLocaleDateString()}</span>
                </div>

                {/* Review Description */}
                <p className="text-gray-700 mb-3">{review.description}</p>
              </div>
            </div>

            {/* Review Actions */}
            <div className="flex items-center gap-2 mb-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleToggleHelpful(review.id)}
                className={helpfulStates.has(review.id) ? "text-blue-600" : ""}
              >
                <ThumbsUp size={16} />
                <span className="ml-1">{review.helpfulCount}</span>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => toggleExpanded(review.id)}>
                <MessageCircle size={16} />
                <span className="ml-1">{review.comments?.length || 0} Comments</span>
              </Button>
            </div>

            {/* Comments Section */}
            {expandedReviews.has(review.id) && (
              <div className="mt-4 border-t pt-4 space-y-3">
                {/* Existing Comments */}
                {review.comments && review.comments.length > 0 && (
                  <div className="space-y-2 mb-3 max-h-64 overflow-y-auto">
                    {review.comments.map((comment) => (
                      <div key={comment.id} className="bg-gray-50 rounded p-2 text-sm">
                        <div className="flex items-center gap-2 mb-1">
                          {comment.isAnonymous ? (
                            <>
                              <User size={12} />
                              <span className="font-medium">Anonymous</span>
                            </>
                          ) : comment.user ? (
                            <>
                              {comment.user.avatarUrl ? (
                                <img
                                  src={
                                    resolveAssetUrl(comment.user.avatarUrl) ?? comment.user.avatarUrl
                                  }
                                  alt={comment.user.name}
                                  className="h-4 w-4 rounded-full"
                                />
                              ) : (
                                <User size={12} />
                              )}
                              <span className="font-medium">{comment.user.name}</span>
                            </>
                          ) : (
                            <>
                              <User size={12} />
                              <span className="font-medium">Anonymous</span>
                            </>
                          )}
                          <span className="text-muted-foreground">
                            {new Date(comment.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-gray-600">{comment.text}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Comment Form */}
                <div className="space-y-2">
                  <Input
                    placeholder={
                      user ? "Add a comment..." : "Log in to comment or comment anonymously"
                    }
                    value={commentText[review.id] || ""}
                    onChange={(e) =>
                      setCommentText((prev) => ({
                        ...prev,
                        [review.id]: e.target.value,
                      }))
                    }
                    className="text-sm"
                  />
                  <Button
                    size="sm"
                    onClick={() => handleAddComment(review.id)}
                    disabled={!commentText[review.id]?.trim() || loadingComments.has(review.id)}
                  >
                    {loadingComments.has(review.id) ? "Posting..." : "Post"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
};
