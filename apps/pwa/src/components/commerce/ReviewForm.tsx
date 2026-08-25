import React, { useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { reviewsApi } from "@/api/reviews";
import { useAuthStore } from "@/stores/auth";
import { getApiError } from "@/api/client";

interface ReviewFormProps {
  productId: string;
  onSuccess?: () => void;
}

export const ReviewForm: React.FC<ReviewFormProps> = ({ productId, onSuccess }) => {
  const { user } = useAuthStore();
  const [rating, setRating] = useState<number>(0);
  const [hoveredRating, setHoveredRating] = useState<number>(0);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(!user);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!rating) {
      setError("Please select a rating");
      return;
    }

    if (!title.trim()) {
      setError("Please enter a title");
      return;
    }

    if (!description.trim()) {
      setError("Please enter a review");
      return;
    }

    setSubmitting(true);
    try {
      await reviewsApi.createReview(productId, {
        rating,
        title: title.trim(),
        description: description.trim(),
        isAnonymous: isAnonymous && !user,
      });

      setRating(0);
      setTitle("");
      setDescription("");
      setIsAnonymous(!user);
      onSuccess?.();
    } catch (err) {
      setError(`Failed to submit review: ${getApiError(err)}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <h3 className="text-base font-semibold">Share Your Review</h3>

      {!user && (
        <div className="rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          You're sharing this as an anonymous review. Log in to attach your name.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Rating */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Rating</label>
          <div className="flex gap-1.5">
            {Array.from({ length: 5 }).map((_, i) => {
              const starRating = i + 1;
              const isFilledHover = starRating <= hoveredRating;
              const isFilled = starRating <= rating;

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setRating(starRating)}
                  onMouseEnter={() => setHoveredRating(starRating)}
                  onMouseLeave={() => setHoveredRating(0)}
                  className="transition-transform hover:scale-110"
                >
                  <Star
                    size={30}
                    className={
                      isFilledHover || isFilled
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-muted-foreground/40"
                    }
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* Title */}
        <div className="space-y-1.5">
          <label htmlFor="review-title" className="text-sm font-medium">
            Review Title
          </label>
          <Input
            id="review-title"
            placeholder="Sum up your experience"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
          />
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label htmlFor="review-description" className="text-sm font-medium">
            Your Review
          </label>
          <Textarea
            id="review-description"
            placeholder="Share your experience with this product..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            rows={4}
          />
          <p className="text-xs text-muted-foreground text-right">{description.length}/2000</p>
        </div>

        {/* Anonymous Option */}
        {user && (
          <div className="flex items-center gap-2">
            <input
              id="anonymous"
              type="checkbox"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              className="h-4 w-4 rounded border border-primary accent-primary cursor-pointer"
            />
            <Label htmlFor="anonymous" className="cursor-pointer text-sm font-normal">
              Post as anonymous
            </Label>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Submit */}
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? "Submitting…" : "Submit Review"}
        </Button>
      </form>
    </div>
  );
};
