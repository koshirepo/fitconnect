/**
 * Documentation: Choosing foods out of the library, while writing a diet plan.
 *
 * - A dialog over the plan form, like the exercise picker, so a half-written plan is never lost to a trip to the library.
 * - Search and the category rail are the library page's own two controls. Each row shows the photo, the serving and the five figures, because choosing between "rice, cooked" and "rice, raw" is exactly what the numbers are for.
 * - Several at once, into one meal. What it hands back is plan lines: the food's name, serving and nutrients are copied onto each line beside its id, with a quantity of one serving to adjust afterwards.
 * - Primary exports: FoodItemPickerDialog.
 */
import * as React from "react";
import { Apple, Check, Search } from "lucide-react";

import { useFoodItemCategories, useFoodItemsInfinite } from "@/api/queries/food-items";
import { flattenPages } from "@/api/queries/shared";
import { useDebounced } from "@/lib/use-debounced";
import { useInfiniteScroll } from "@/lib/use-infinite-scroll";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { DietPlanFood, FoodItem } from "@fitconnect/shared/types/models";
import { CategoryChip, FoodPhoto, MacroChips } from "./food-ui";
import { foodToPlanLine, servingLabel } from "./nutrition";

export function FoodItemPickerDialog({
  open,
  onOpenChange,
  onAdd,
  mealName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Receives one plan line per chosen food, in the order they were picked. */
  onAdd: (lines: DietPlanFood[]) => void;
  /** Which meal the foods are going into, for the title. */
  mealName?: string;
}) {
  const [search, setSearch] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [chosen, setChosen] = React.useState<FoodItem[]>([]);
  const term = useDebounced(search, 300);

  const categoriesQuery = useFoodItemCategories();
  const listQuery = useFoodItemsInfinite(
    {
      ...(term.trim() ? { search: term.trim() } : {}),
      ...(category ? { category } : {}),
    },
    // Nothing is fetched until the dialog is actually open.
    { enabled: open, limit: 18 },
  );

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

  const toggle = (food: FoodItem) => {
    setChosen((prev) =>
      prev.some((entry) => entry.id === food.id)
        ? prev.filter((entry) => entry.id !== food.id)
        : [...prev, food],
    );
  };

  const confirm = () => {
    onAdd(chosen.map(foodToPlanLine));
    setChosen([]);
    onOpenChange(false);
  };

  const categories = categoriesQuery.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add food{mealName ? ` to ${mealName}` : ""}</DialogTitle>
          <DialogDescription>
            Pick as many as you need. Quantities are adjusted afterwards.
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by food, category or type"
              aria-label="Search the food library"
              className="pl-9"
              autoFocus
            />
          </div>

          <div className="-mx-1 flex min-w-0 items-center gap-2 overflow-x-auto px-1 pb-1">
            <CategoryChip label="All" active={!category} onClick={() => setCategory("")} />
            {categories.map((entry) => (
              <CategoryChip
                key={entry.name}
                label={entry.name}
                active={category === entry.name}
                onClick={() => setCategory(entry.name)}
              />
            ))}
          </div>

          <div className="max-h-[45vh] min-h-[12rem] min-w-0 space-y-2 overflow-y-auto pr-1">
            {listQuery.isPending ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : foods.length === 0 ? (
              <EmptyState
                icon={Apple}
                title="Nothing matches that"
                description="Try a different search, or clear the category filter."
              />
            ) : (
              <>
                {foods.map((food) => {
                  const picked = chosen.some((entry) => entry.id === food.id);
                  return (
                    <button
                      key={food.id}
                      type="button"
                      onClick={() => toggle(food)}
                      aria-pressed={picked}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                        picked ? "border-primary bg-primary/5" : "border-border hover:bg-muted",
                      )}
                    >
                      <FoodPhoto
                        src={food.imageUrl}
                        className="h-14 w-14 shrink-0 rounded"
                        iconClassName="h-5 w-5"
                      />
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="block truncate text-sm font-medium">{food.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {food.category} · per {servingLabel(food.servingSize, food.servingUnit)}
                        </span>
                        <MacroChips values={food} size="xs" />
                      </span>
                      {picked && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </button>
                  );
                })}
                <div ref={loadMoreRef} className="flex justify-center py-2">
                  {listQuery.isFetchingNextPage && <Spinner />}
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={confirm} disabled={chosen.length === 0}>
            <Check className="h-4 w-4" />
            Add {chosen.length > 0 ? chosen.length : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
