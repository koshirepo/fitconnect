/**
 * Documentation: The food library, as the platform manages it.
 *
 * - The app-level screen behind `platform:food-items:manage`: add a food with its photo and nutrition, correct its figures, retire it.
 * - The form is laid out like a nutrition label: the serving first, because every figure below it is "per" that; then the five required figures; then the optional ones, folded away until somebody wants them.
 * - Removing retires rather than deletes. Diet plans keep their own copy of a line's figures, so a retired food changes no plan; it only stops being offered.
 * - Primary exports: PlatformFoodItemsPage.
 */
import * as React from "react";
import { Apple, Pencil, Plus, Search, Trash2 } from "lucide-react";

import {
  useCreateFoodItem,
  useFoodItemCategories,
  useFoodItemsInfinite,
  useRetireFoodItem,
  useUpdateFoodItem,
} from "@/api/queries/food-items";
import { flattenPages } from "@/api/queries/shared";
import { getApiError } from "@/api/client";
import { uploadsApi } from "@/api/uploads";
import { useDebounced } from "@/lib/use-debounced";
import { useInfiniteScroll } from "@/lib/use-infinite-scroll";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
import { Label } from "@/components/ui/label";
import { ListPageSkeleton } from "@/components/ui/skeleton";
import { PhotoListInput } from "@/components/ui/photo-list-input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { CreateFoodItemPayload, FoodItem } from "@fitconnect/shared/types/models";
import { FoodPhoto, MacroChips } from "./food-ui";
import { servingLabel } from "./nutrition";

const CATEGORY_SUGGESTIONS = [
  "Grains",
  "Pulses",
  "Dairy",
  "Eggs",
  "Meat",
  "Fish",
  "Vegetables",
  "Fruits",
  "Nuts & Seeds",
  "Oils & Fats",
  "Beverages",
  "Supplements",
  "Snacks",
];
const FOOD_TYPES = ["Veg", "Non-Veg", "Egg", "Vegan"];
const SERVING_UNITS = ["g", "ml", "piece", "cup", "bowl", "tbsp", "tsp", "slice", "scoop"];

/** The five every food must state. */
const REQUIRED_FIELDS = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "proteinGrams", label: "Protein", unit: "g" },
  { key: "carbsGrams", label: "Carbs", unit: "g" },
  { key: "fatGrams", label: "Fat", unit: "g" },
  { key: "fibreGrams", label: "Fibre", unit: "g" },
] as const;

/** The rest, entered where known. */
const OPTIONAL_FIELDS = [
  { key: "sugarGrams", label: "Sugar", unit: "g" },
  { key: "saturatedFatGrams", label: "Saturated fat", unit: "g" },
  { key: "cholesterolMg", label: "Cholesterol", unit: "mg" },
  { key: "sodiumMg", label: "Sodium", unit: "mg" },
  { key: "potassiumMg", label: "Potassium", unit: "mg" },
  { key: "calciumMg", label: "Calcium", unit: "mg" },
  { key: "ironMg", label: "Iron", unit: "mg" },
] as const;

type NumberKey =
  | "servingSize"
  | (typeof REQUIRED_FIELDS)[number]["key"]
  | (typeof OPTIONAL_FIELDS)[number]["key"];

/** Numbers are edited as text, so a cleared box stays cleared rather than snapping to 0. */
type Draft = {
  name: string;
  category: string;
  foodType: string;
  servingUnit: string;
  description: string;
  imageUrl: string;
  isActive: boolean;
} & Record<NumberKey, string>;

const EMPTY_DRAFT: Draft = {
  name: "",
  category: "",
  foodType: "",
  servingSize: "100",
  servingUnit: "g",
  calories: "",
  proteinGrams: "",
  carbsGrams: "",
  fatGrams: "",
  fibreGrams: "",
  sugarGrams: "",
  saturatedFatGrams: "",
  cholesterolMg: "",
  sodiumMg: "",
  potassiumMg: "",
  calciumMg: "",
  ironMg: "",
  description: "",
  imageUrl: "",
  isActive: true,
};

const toText = (value: number | null | undefined) => (value == null ? "" : String(value));

function toNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

async function uploadFoodItemPhoto(file: File) {
  const response = await uploadsApi.uploadFoodItemPhoto(file);
  return response.data.data.url;
}

export default function PlatformFoodItemsPage() {
  const toast = useToast();

  const [search, setSearch] = React.useState("");
  const term = useDebounced(search, 300);

  const listQuery = useFoodItemsInfinite({
    ...(term.trim() ? { search: term.trim() } : {}),
    includeInactive: true,
  });
  const categoriesQuery = useFoodItemCategories(true);

  const foods = React.useMemo(
    () => flattenPages<FoodItem>(listQuery.data?.pages),
    [listQuery.data],
  );

  const createFood = useCreateFoodItem();
  const updateFood = useUpdateFoodItem();
  const retireFood = useRetireFoodItem();

  const [editing, setEditing] = React.useState<FoodItem | null>(null);
  const [draft, setDraft] = React.useState<Draft>(EMPTY_DRAFT);
  const [formOpen, setFormOpen] = React.useState(false);
  const [showMore, setShowMore] = React.useState(false);
  const [formError, setFormError] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [pendingRetire, setPendingRetire] = React.useState<FoodItem | null>(null);

  const loadMoreRef = useInfiniteScroll({
    hasMore: Boolean(listQuery.hasNextPage),
    loading: listQuery.isPending || listQuery.isFetchingNextPage,
    onLoadMore: () => {
      if (listQuery.hasNextPage && !listQuery.isFetchingNextPage) {
        void listQuery.fetchNextPage();
      }
    },
  });

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const openCreate = () => {
    setEditing(null);
    setDraft(EMPTY_DRAFT);
    setShowMore(false);
    setFormError("");
    setFormOpen(true);
  };

  const openEdit = (food: FoodItem) => {
    setEditing(food);
    setDraft({
      name: food.name,
      category: food.category,
      foodType: food.foodType ?? "",
      servingSize: toText(food.servingSize),
      servingUnit: food.servingUnit,
      calories: toText(food.calories),
      proteinGrams: toText(food.proteinGrams),
      carbsGrams: toText(food.carbsGrams),
      fatGrams: toText(food.fatGrams),
      fibreGrams: toText(food.fibreGrams),
      sugarGrams: toText(food.sugarGrams),
      saturatedFatGrams: toText(food.saturatedFatGrams),
      cholesterolMg: toText(food.cholesterolMg),
      sodiumMg: toText(food.sodiumMg),
      potassiumMg: toText(food.potassiumMg),
      calciumMg: toText(food.calciumMg),
      ironMg: toText(food.ironMg),
      description: food.description ?? "",
      imageUrl: food.imageUrl ?? "",
      isActive: food.isActive,
    });
    // Open the extra figures straight away where this food already has some.
    setShowMore(OPTIONAL_FIELDS.some((field) => food[field.key] != null));
    setFormError("");
    setFormOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");

    const servingSize = toNumber(draft.servingSize);
    if (!servingSize || servingSize <= 0) {
      setFormError("Enter how much one serving is.");
      return;
    }
    const missing = REQUIRED_FIELDS.filter((field) => toNumber(draft[field.key]) == null);
    if (missing.length > 0) {
      setFormError(`Enter ${missing.map((field) => field.label.toLowerCase()).join(", ")}.`);
      return;
    }

    const payload: CreateFoodItemPayload = {
      name: draft.name.trim(),
      category: draft.category.trim(),
      foodType: draft.foodType.trim() || null,
      servingSize,
      servingUnit: draft.servingUnit.trim(),
      calories: toNumber(draft.calories)!,
      proteinGrams: toNumber(draft.proteinGrams)!,
      carbsGrams: toNumber(draft.carbsGrams)!,
      fatGrams: toNumber(draft.fatGrams)!,
      fibreGrams: toNumber(draft.fibreGrams)!,
      sugarGrams: toNumber(draft.sugarGrams),
      saturatedFatGrams: toNumber(draft.saturatedFatGrams),
      cholesterolMg: toNumber(draft.cholesterolMg),
      sodiumMg: toNumber(draft.sodiumMg),
      potassiumMg: toNumber(draft.potassiumMg),
      calciumMg: toNumber(draft.calciumMg),
      ironMg: toNumber(draft.ironMg),
      description: draft.description.trim() || null,
      imageUrl: draft.imageUrl || null,
      isActive: draft.isActive,
    };

    setSaving(true);
    try {
      if (editing) {
        await updateFood.mutateAsync({ foodItemId: editing.id, data: payload });
        toast.success(`${payload.name} updated.`);
      } else {
        await createFood.mutateAsync(payload);
        toast.success(`${payload.name} added to the library.`);
      }
      setFormOpen(false);
    } catch (caught) {
      setFormError(getApiError(caught));
    } finally {
      setSaving(false);
    }
  };

  const handleRetireConfirmed = async () => {
    if (!pendingRetire) return;
    const target = pendingRetire;
    setPendingRetire(null);

    try {
      await retireFood.mutateAsync(target.id);
      toast.success(`${target.name} retired.`);
    } catch (caught) {
      toast.error(getApiError(caught));
    }
  };

  const categoryOptions = React.useMemo(
    () => [
      ...new Set([...CATEGORY_SUGGESTIONS, ...(categoriesQuery.data ?? []).map((c) => c.name)]),
    ],
    [categoriesQuery.data],
  );

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        icon={Apple}
        title="Food library"
        description="One catalogue of foods and their nutrition, shared by every gym."
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New food item
          </Button>
        }
      />

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by food, category or type"
          aria-label="Search the library"
          className="pl-9"
        />
      </div>

      {listQuery.isPending ? (
        <ListPageSkeleton rows={6} search={false} filters={0} />
      ) : foods.length === 0 ? (
        <EmptyState
          icon={Apple}
          title={term ? "Nothing matches that" : "The library is empty"}
          description={term ? "Try a different search." : "Add the first food every gym will see."}
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              New food item
            </Button>
          }
        />
      ) : (
        <>
          <div className="space-y-2">
            {foods.map((food) => (
              <Card key={food.id} className={cn(!food.isActive && "opacity-70")}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <FoodPhoto
                      src={food.imageUrl}
                      className="h-14 w-14 shrink-0 rounded-md"
                      iconClassName="h-5 w-5"
                    />
                    <div className="min-w-0 space-y-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {food.name}
                        <Badge variant="secondary" className="text-xs">
                          {food.category}
                        </Badge>
                        {food.foodType && (
                          <Badge variant="outline" className="text-xs">
                            {food.foodType}
                          </Badge>
                        )}
                        {!food.isActive && (
                          <Badge variant="warning" className="text-xs">
                            Retired
                          </Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Per {servingLabel(food.servingSize, food.servingUnit)}
                      </p>
                      <MacroChips values={food} size="xs" />
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(food)}>
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                    {food.isActive && (
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setPendingRetire(food)}
                        aria-label={`Retire ${food.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div ref={loadMoreRef} className="flex justify-center py-4">
            {listQuery.isFetchingNextPage && <Spinner />}
          </div>
        </>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name}` : "New food item"}</DialogTitle>
            <DialogDescription>
              Every figure is for one serving. State the serving first.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="food-name">Name *</Label>
                <Input
                  id="food-name"
                  value={draft.name}
                  onChange={(event) => set("name", event.target.value)}
                  placeholder="Paneer"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="food-category">Category *</Label>
                <Input
                  id="food-category"
                  list="food-category-options"
                  value={draft.category}
                  onChange={(event) => set("category", event.target.value)}
                  placeholder="Dairy"
                  required
                />
                <datalist id="food-category-options">
                  {categoryOptions.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="food-type">Type</Label>
                <Input
                  id="food-type"
                  list="food-type-options"
                  value={draft.foodType}
                  onChange={(event) => set("foodType", event.target.value)}
                  placeholder="Veg"
                />
                <datalist id="food-type-options">
                  {FOOD_TYPES.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Photo</Label>
              <PhotoListInput
                value={draft.imageUrl ? [draft.imageUrl] : []}
                onChange={(next) => set("imageUrl", next[0] ?? "")}
                max={1}
                prompt="Add a photo"
                upload={uploadFoodItemPhoto}
              />
            </div>

            <fieldset className="space-y-3 rounded-lg border p-3">
              <legend className="px-1 text-sm font-semibold">One serving</legend>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="food-serving-size">Amount *</Label>
                  <Input
                    id="food-serving-size"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={draft.servingSize}
                    onChange={(event) => set("servingSize", event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="food-serving-unit">Unit *</Label>
                  <Input
                    id="food-serving-unit"
                    list="food-unit-options"
                    value={draft.servingUnit}
                    onChange={(event) => set("servingUnit", event.target.value)}
                    required
                  />
                  <datalist id="food-unit-options">
                    {SERVING_UNITS.map((option) => (
                      <option key={option} value={option} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {REQUIRED_FIELDS.map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <Label htmlFor={`food-${field.key}`}>
                      {field.label} ({field.unit}) *
                    </Label>
                    <Input
                      id={`food-${field.key}`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      value={draft[field.key]}
                      onChange={(event) => set(field.key, event.target.value)}
                      required
                    />
                  </div>
                ))}
              </div>

              <button
                type="button"
                className="text-sm font-medium text-primary hover:underline"
                onClick={() => setShowMore((open) => !open)}
              >
                {showMore ? "Hide other nutrients" : "Add sugar, sodium, minerals…"}
              </button>

              {showMore && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {OPTIONAL_FIELDS.map((field) => (
                    <div key={field.key} className="space-y-1.5">
                      <Label htmlFor={`food-${field.key}`}>
                        {field.label} ({field.unit})
                      </Label>
                      <Input
                        id={`food-${field.key}`}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        value={draft[field.key]}
                        onChange={(event) => set(field.key, event.target.value)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </fieldset>

            <div className="space-y-1.5">
              <Label htmlFor="food-description">Description</Label>
              <Textarea
                id="food-description"
                value={draft.description}
                onChange={(event) => set("description", event.target.value)}
                rows={2}
                placeholder="Raw, homemade, per 100 g…"
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(event) => set("isActive", event.target.checked)}
              />
              Offered in every gym's library
            </label>

            {formError && <p className="text-sm text-destructive">{formError}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving || !draft.name.trim() || !draft.category.trim()}
              >
                {saving ? "Saving…" : editing ? "Save changes" : "Add food item"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(pendingRetire)}
        onOpenChange={(open) => !open && setPendingRetire(null)}
        title={`Retire ${pendingRetire?.name ?? "this food"}?`}
        description="It stops being offered in the library and the plan picker. Diet plans that already include it are unchanged."
        confirmLabel="Retire"
        onConfirm={handleRetireConfirmed}
      />
    </div>
  );
}
