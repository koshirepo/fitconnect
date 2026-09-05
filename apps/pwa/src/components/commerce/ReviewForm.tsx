/**
 * Documentation: Write a review of a platform-shop product.
 *
 * - The same `FeedbackComposer` the gym's comment threads use. A review is a comment with a rating, a title and an anonymity choice above the text box, so those go in the `fields` slot rather than into a second composer with its own draft state, its own busy flag and its own error box.
 * - The write goes through `useCreateReview`, which invalidates the product's review prefix. Posting used to call `reviewsApi` directly and lean on an `onSuccess` callback to make the page refetch by hand; the list, the average and the histogram now update themselves.
 * - Signed out is a supported case, not an error: the API accepts an anonymous review. Signed in, anonymity becomes a choice; signed out it is simply what happens, and the notice says so instead of offering a checkbox that cannot be unticked.
 * - The rating is required and the composer cannot know that, so it is enforced through `validate` — which is also what keeps "please select a rating" in the same error slot as a failed request.
 * - Primary exports: ReviewForm.
 */
import * as React from "react";
import { Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { FeedbackComposer } from "@/components/feedback/feedback-composer";
import { useCreateReview } from "@/api/queries/reviews";
import { useAuthStore } from "@/stores/auth";
import { FEEDBACK_LIMITS } from "@fitconnect/shared/constants";

function RatingPicker({
  rating,
  onChange,
}: {
  rating: number;
  onChange: (value: number) => void;
}) {
  const [hovered, setHovered] = React.useState(0);

  return (
    <div className="flex gap-1.5" role="radiogroup" aria-label="Rating">
      {Array.from({ length: FEEDBACK_LIMITS.RATING_MAX }).map((_, index) => {
        const value = index + 1;
        const filled = value <= (hovered || rating);

        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={rating === value}
            aria-label={`${value} ${value === 1 ? "star" : "stars"}`}
            onClick={() => onChange(value)}
            onMouseEnter={() => setHovered(value)}
            onMouseLeave={() => setHovered(0)}
            className="transition-transform hover:scale-110"
          >
            <Star
              size={30}
              className={filled ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}
            />
          </button>
        );
      })}
    </div>
  );
}

export function ReviewForm({
  productId,
  onSuccess,
}: {
  productId: string;
  onSuccess?: () => void;
}) {
  const { user } = useAuthStore();
  const createReview = useCreateReview(productId);

  const [rating, setRating] = React.useState(0);
  const [title, setTitle] = React.useState("");
  const [anonymous, setAnonymous] = React.useState(false);

  // Signed out, the review is anonymous whatever the box says, so the choice is
  // only offered to somebody who has a name to attach.
  const postAnonymously = anonymous || !user;

  return (
    <FeedbackComposer
      header={<h3 className="text-base font-semibold">Share Your Review</h3>}
      placeholder="Share your experience with this product..."
      ariaLabel="Your review"
      submitLabel="Submit Review"
      busyLabel="Submitting…"
      maxLength={FEEDBACK_LIMITS.REVIEW_BODY_MAX_LENGTH}
      rows={4}
      fullWidthSubmit
      validate={() => {
        if (!rating) return "Please select a rating.";
        if (!title.trim()) return "Please enter a title.";
        return null;
      }}
      onSubmit={async (description) => {
        await createReview.mutateAsync({
          rating,
          title: title.trim(),
          description,
          isAnonymous: postAnonymously,
        });
        setRating(0);
        setTitle("");
        setAnonymous(false);
        onSuccess?.();
      }}
      fields={
        <div className="space-y-4">
          {!user && (
            <div className="rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
              You're sharing this as an anonymous review. Log in to attach your name.
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Rating</Label>
            <RatingPicker rating={rating} onChange={setRating} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="review-title">Review Title</Label>
            <Input
              id="review-title"
              placeholder="Sum up your experience"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={FEEDBACK_LIMITS.REVIEW_TITLE_MAX_LENGTH}
            />
          </div>

          {user && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="review-anonymous"
                checked={anonymous}
                onCheckedChange={(checked) => setAnonymous(checked === true)}
              />
              <Label htmlFor="review-anonymous" className="cursor-pointer text-sm font-normal">
                Post as anonymous
              </Label>
            </div>
          )}
        </div>
      }
    />
  );
}
