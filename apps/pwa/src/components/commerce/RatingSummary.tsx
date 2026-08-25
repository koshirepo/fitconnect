import React from "react";
import { Star } from "lucide-react";
import type { RatingStats } from "@/api/reviews";

interface RatingSummaryProps {
  stats: RatingStats;
}

export const RatingSummary: React.FC<RatingSummaryProps> = ({ stats }) => {
  const { averageRating, totalReviews, distribution } = stats;

  if (totalReviews === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No ratings yet. Be the first to rate this product!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Average Rating */}
      <div className="flex items-start gap-6">
        <div className="text-center">
          <div className="text-4xl font-bold">{averageRating.toFixed(1)}</div>
          <div className="flex gap-0.5 mt-2 justify-center">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                size={20}
                className={
                  i < Math.round(averageRating)
                    ? "fill-yellow-400 text-yellow-400"
                    : "text-gray-300"
                }
              />
            ))}
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            {totalReviews} {totalReviews === 1 ? "rating" : "ratings"}
          </p>
        </div>

        {/* Distribution Bars */}
        <div className="flex-1 space-y-2">
          {[5, 4, 3, 2, 1].map((stars) => {
            const ratingData = distribution.find((d) => d.rating === stars);
            const count = ratingData?.count || 0;
            const percentage = (count / totalReviews) * 100;

            return (
              <div key={stars} className="flex items-center gap-2">
                <span className="text-sm font-medium w-12">{stars} star</span>
                <div className="flex-1 h-2 bg-gray-200 rounded overflow-hidden">
                  <div
                    className="h-full bg-yellow-400 transition-all duration-300"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <span className="text-sm text-muted-foreground w-12 text-right">
                  {count > 0 && `${percentage.toFixed(0)}%`}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
