/**
 * Documentation: The food library, as a member or coach browses it.
 *
 * - The exercise library's counterpart: a grid of foods with a search box and a category rail, so the two libraries feel like one.
 * - A card leads with the photo, then states the serving and the five figures a plan totals. A food's protein means nothing without "per 100 g", so the serving is never left off.
 * - The library is the platform's, not the gym's, and read-only here: adding and editing live on the app-level screen.
 * - Primary exports: FoodItemLibraryPage.
 */
import * as React from "react";
import { Apple, Search } from "lucide-react";

import { useFoodItemCategories, useFoodItemsInfinite } from "@/api/queries/food-items";
import { flattenPages } from "@/api/queries/shared";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { useDebounced } from "@/lib/use-debounced";
import { useInfiniteScroll } from "@/lib/use-infinite-scroll";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { CardsGridSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import type { FoodItem } from "@fitconnect/shared/types/models";
import { CategoryChip, FoodPhoto, MacroChips } from "./food-ui";
import { servingLabel } from "./nutrition";

const ALL = "";

export default function FoodItemLibraryPage() {
  const navigate = useAppNavigate();

  const [search, setSearch] = React.useState("");
  const [category, setCategory] = React.useState(ALL);
  const term = useDebounced(search, 300);

  const categoriesQuery = useFoodItemCategories();
  const listQuery = useFoodItemsInfinite({
    ...(term.trim() ? { search: term.trim() } : {}),
    ...(category ? { category } : {}),
  });

  const foods = React.useMemo(
    () => flattenPages<FoodItem>(listQuery.data?.pages),
    [listQuery.data],
  );

  const loadMoreRef = useInfiniteScroll({
    hasMore: Boolean(listQuery.hasNextPage),
    loading: listQuery.isPending || listQuery.isFetchingNextPage,
    onLoadMore: () => {
      if (listQuery.hasNextPage && !listQuery.isFetchingNextPage) {
        void listQuery.fetchNextPage();
      }
    },
  });

  const categories = categoriesQuery.data ?? [];
  const total = categories.reduce((sum, entry) => sum + entry.count, 0);

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        icon={Apple}
        title="Food Items"
        description="What one serving holds — calories, protein, carbs, fat and fibre."
      />

      <div className="space-y-3">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by food, category or type"
            aria-label="Search food items"
            className="pl-9"
          />
        </div>

        <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1">
          <CategoryChip
            label="All"
            count={total}
            active={category === ALL}
            onClick={() => setCategory(ALL)}
          />
          {categories.map((entry) => (
            <CategoryChip
              key={entry.name}
              label={entry.name}
              count={entry.count}
              active={category === entry.name}
              onClick={() => setCategory(entry.name)}
            />
          ))}
        </div>
      </div>

      {listQuery.isPending ? (
        <CardsGridSkeleton count={8} className="grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4" />
      ) : foods.length === 0 ? (
        <EmptyState
          icon={Apple}
          title={term || category ? "Nothing matches that" : "No food items yet"}
          description={
            term || category
              ? "Try a different search, or clear the category filter."
              : "Foods appear here as soon as they are added to the library."
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {foods.map((food) => (
              <FoodCard
                key={food.id}
                food={food}
                onOpen={() => navigate(`/food-items/${food.slug}`)}
              />
            ))}
          </div>

          <div ref={loadMoreRef} className="flex justify-center py-4">
            {listQuery.isFetchingNextPage && <Spinner />}
          </div>
        </>
      )}
    </div>
  );
}

function FoodCard({ food, onOpen }: { food: FoodItem; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
    >
      <span className="relative block">
        <FoodPhoto src={food.imageUrl} className="aspect-[4/3] w-full" />
        <span className="absolute top-2 left-2 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-semibold shadow-sm backdrop-blur">
          {food.category}
        </span>
        {food.foodType && (
          <span className="absolute top-2 right-2 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-medium shadow-sm backdrop-blur">
            {food.foodType}
          </span>
        )}
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-1.5 p-3">
        <span className="line-clamp-2 text-sm leading-snug font-medium transition-colors group-hover:text-primary">
          {food.name}
        </span>
        <span className="text-xs text-muted-foreground">
          Per {servingLabel(food.servingSize, food.servingUnit)}
        </span>
        <MacroChips values={food} size="xs" className="mt-auto pt-1" />
      </span>
    </button>
  );
}
