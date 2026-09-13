/**
 * Documentation: One food, with everything one serving of it holds.
 *
 * - The photo and the nutrition label take the main column; other foods from the same category run down the side, and fall underneath on a narrow screen.
 * - The label shows every nutrient the library has for this food. The optional ones are left out where nobody entered them, rather than shown as zero.
 * - Primary exports: FoodItemDetailPage.
 */
import * as React from "react";
import { useParams } from "react-router-dom";
import { Apple, ArrowLeft } from "lucide-react";

import { useFoodItem, useFoodItemsInfinite } from "@/api/queries/food-items";
import { flattenPages } from "@/api/queries/shared";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DetailPageSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import type { FoodItem } from "@fitconnect/shared/types/models";
import { FoodPhoto, MacroChips, NutritionFacts } from "./food-ui";
import { servingLabel } from "./nutrition";

export default function FoodItemDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useAppNavigate();

  const foodQuery = useFoodItem(slug);
  const food = foodQuery.data;

  const relatedQuery = useFoodItemsInfinite(food?.category ? { category: food.category } : {}, {
    enabled: Boolean(food?.category),
    limit: 12,
  });

  const related = React.useMemo(
    () =>
      flattenPages<FoodItem>(relatedQuery.data?.pages)
        .filter((entry) => entry.id !== food?.id)
        .slice(0, 8),
    [relatedQuery.data, food?.id],
  );

  if (foodQuery.isPending) return <DetailPageSkeleton />;

  if (!food) {
    return (
      <EmptyState
        icon={Apple}
        title="Food not found"
        description="It may have been retired from the library."
        action={
          <Button variant="outline" onClick={() => navigate("/food-items")}>
            <ArrowLeft className="h-4 w-4" />
            Back to food items
          </Button>
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate("/food-items")}>
        <ArrowLeft className="h-4 w-4" />
        Food Items
      </Button>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="min-w-0 space-y-5">
          <div className="grid gap-5 md:grid-cols-2 md:items-start">
            <FoodPhoto
              src={food.imageUrl}
              className="aspect-square w-full rounded-xl border border-border"
              iconClassName="h-12 w-12"
            />

            <div className="space-y-3">
              <div>
                <h1 className="text-xl font-bold sm:text-2xl">{food.name}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{food.category}</Badge>
                  {food.foodType && <Badge variant="outline">{food.foodType}</Badge>}
                  {!food.isActive && <Badge variant="warning">Retired</Badge>}
                </div>
              </div>

              {food.description && (
                <p className="text-sm text-muted-foreground">{food.description}</p>
              )}

              <NutritionFacts food={food} />
            </div>
          </div>
        </div>

        {related.length > 0 && (
          <aside className="min-w-0 space-y-3">
            <h2 className="text-sm font-semibold">More {food.category}</h2>
            <div className="space-y-2">
              {related.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => navigate(`/food-items/${entry.slug}`)}
                  className="flex w-full items-center gap-3 rounded-lg border border-border px-2 py-2 text-left transition-colors hover:border-primary/40 hover:bg-muted"
                >
                  <FoodPhoto
                    src={entry.imageUrl}
                    className="h-14 w-14 shrink-0 rounded-md"
                    iconClassName="h-4 w-4"
                  />
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="block truncate text-sm font-medium">{entry.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      Per {servingLabel(entry.servingSize, entry.servingUnit)}
                    </span>
                    <MacroChips values={entry} size="xs" />
                  </span>
                </button>
              ))}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
