/**
 * Documentation: Create or edit one diet plan.
 *
 * - A page rather than a dialog, like the workout form: a plan is details plus an open-ended list of meals, each an open-ended list of foods.
 * - Foods come from the library through the picker, which copies each food's serving and nutrients onto the line. A line typed by hand — a family recipe the library will never have — takes its figures from whoever types them.
 * - A line's quantity is a number of servings. Every line, every meal and the whole day show their calories, protein, carbs, fat and fibre as the plan is written, and the day is compared against the target where one is set.
 * - Staff with `diet-plans:create` write plans for the gym; a member with `diet-plans:create:self` writes their own, which the API assigns to them. The form is the same for both.
 * - Primary exports: DietPlanFormPage.
 */
import * as React from "react";
import { Navigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  Apple,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  PenLine,
  Plus,
  Trash2,
  X,
} from "lucide-react";

import { useCreateDietPlan, useDietPlan, useUpdateDietPlan } from "@/api/queries/diet-plans";
import { getApiError } from "@/api/client";
import { usePermissions } from "@/features/auth/permission-gate";
import { FoodItemPickerDialog } from "@/features/food-items/FoodItemPickerDialog";
import { FoodPhoto, MacroChips } from "@/features/food-items/food-ui";
import {
  formatAmount,
  scaleNutrients,
  servingLabel,
  sumNutrients,
} from "@/features/food-items/nutrition";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { Permission } from "@fitconnect/shared/types/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormPageSkeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { DietPlan, DietPlanFood, DietPlanMeal } from "@fitconnect/shared/types/models";

const GOALS = ["Weight Loss", "Muscle Gain", "Maintenance", "Fat Loss", "Recomposition"];
const DIET_TYPES = ["Veg", "Non-Veg", "Eggetarian", "Vegan"];
const DEFAULT_MEALS: DietPlanMeal[] = [
  { name: "Breakfast", time: "08:00", foods: [] },
  { name: "Lunch", time: "13:00", foods: [] },
  { name: "Evening snack", time: "17:00", foods: [] },
  { name: "Dinner", time: "20:00", foods: [] },
];

export default function DietPlanFormPage() {
  const navigate = useAppNavigate();
  const { planId } = useParams<{ planId?: string }>();
  const isEdit = Boolean(planId);
  const { can } = usePermissions();

  // A member writing their own plan holds only the self grant, which the API
  // accepts on every write — so it opens this page too.
  const allowed = isEdit
    ? can(Permission.DIET_PLANS_UPDATE) || can(Permission.DIET_PLANS_CREATE_SELF)
    : can(Permission.DIET_PLANS_CREATE) || can(Permission.DIET_PLANS_CREATE_SELF);

  const planQuery = useDietPlan(allowed && isEdit ? planId : undefined);
  const plan = planQuery.data;

  if (!allowed) return <Navigate to="/diet-plans" replace />;

  if (isEdit && planQuery.isLoading) return <FormPageSkeleton fields={6} />;

  if (isEdit && planQuery.isError) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertCircle className="mx-auto mb-2 h-12 w-12 text-destructive" />
            <CardTitle>Plan not found</CardTitle>
            <CardDescription>{getApiError(planQuery.error)}</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button variant="outline" onClick={() => navigate("/diet-plans")}>
              <ArrowLeft className="h-4 w-4" />
              Back to Diet Plans
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <DietPlanForm
      key={plan?.id ?? "new"}
      planId={planId}
      plan={plan}
      isEdit={isEdit}
      forSelf={!can(Permission.DIET_PLANS_CREATE)}
    />
  );
}

/** A blank line typed by hand, one serving of 100 g with every figure at zero. */
function customLine(): DietPlanFood {
  return {
    name: "",
    servingSize: 100,
    servingUnit: "g",
    quantity: 1,
    calories: 0,
    proteinGrams: 0,
    carbsGrams: 0,
    fatGrams: 0,
    fibreGrams: 0,
  };
}

/** Mounted once its plan has loaded, and keyed on it, so a refetch never discards edits. */
function DietPlanForm({
  planId,
  plan,
  isEdit,
  forSelf,
}: {
  planId?: string;
  plan?: DietPlan;
  isEdit: boolean;
  forSelf: boolean;
}) {
  const navigate = useAppNavigate();
  const createPlan = useCreateDietPlan();
  const updatePlan = useUpdateDietPlan();

  const [title, setTitle] = React.useState(plan?.title ?? "");
  const [description, setDescription] = React.useState(plan?.description ?? "");
  const [goal, setGoal] = React.useState(plan?.goal ?? "");
  const [dietType, setDietType] = React.useState(plan?.dietType ?? "");
  const [targetCalories, setTargetCalories] = React.useState(
    plan?.targetCalories != null ? String(plan.targetCalories) : "",
  );
  const [meals, setMeals] = React.useState<DietPlanMeal[]>(
    plan?.meals?.length ? plan.meals : isEdit ? [] : DEFAULT_MEALS,
  );
  // Which meal the picker is adding to, or null while it is closed.
  const [pickerMeal, setPickerMeal] = React.useState<number | null>(null);
  const [error, setError] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const updateMeal = (index: number, patch: Partial<DietPlanMeal>) =>
    setMeals((prev) => prev.map((meal, i) => (i === index ? { ...meal, ...patch } : meal)));

  const updateFood = (mealIndex: number, foodIndex: number, patch: Partial<DietPlanFood>) =>
    setMeals((prev) =>
      prev.map((meal, i) =>
        i === mealIndex
          ? {
              ...meal,
              foods: meal.foods.map((food, j) => (j === foodIndex ? { ...food, ...patch } : food)),
            }
          : meal,
      ),
    );

  const addFoods = (mealIndex: number, lines: DietPlanFood[]) =>
    setMeals((prev) =>
      prev.map((meal, i) => (i === mealIndex ? { ...meal, foods: [...meal.foods, ...lines] } : meal)),
    );

  const removeFood = (mealIndex: number, foodIndex: number) =>
    setMeals((prev) =>
      prev.map((meal, i) =>
        i === mealIndex ? { ...meal, foods: meal.foods.filter((_, j) => j !== foodIndex) } : meal,
      ),
    );

  const moveMeal = (index: number, delta: number) =>
    setMeals((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });

  const dayTotals = sumNutrients(meals.flatMap((meal) => meal.foods));
  const target = Number(targetCalories) || 0;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    const unnamed = meals.some(
      (meal) => !meal.name.trim() || meal.foods.some((food) => !food.name.trim()),
    );
    if (unnamed) {
      setError("Every meal and every food needs a name.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        goal: goal.trim() || null,
        dietType: dietType.trim() || null,
        targetCalories: targetCalories.trim() ? Math.round(Number(targetCalories)) : null,
        meals: meals.map((meal) => ({
          ...meal,
          name: meal.name.trim(),
          time: meal.time?.trim() || undefined,
          notes: meal.notes?.trim() || undefined,
          foods: meal.foods.map((food) => ({ ...food, notes: food.notes?.trim() || undefined })),
        })),
      };

      if (isEdit && planId) {
        await updatePlan.mutateAsync({ planId, data: payload });
        navigate(`/diet-plans/${planId}`);
      } else {
        const created = await createPlan.mutateAsync(payload);
        navigate(created?.id ? `/diet-plans/${created.id}` : "/diet-plans");
      }
    } catch (caught) {
      setError(getApiError(caught));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5 sm:space-y-6">
      <PageHeader
        icon={Apple}
        title={isEdit ? `Edit ${plan?.title ?? "plan"}` : "New Diet Plan"}
        description={
          forSelf
            ? "Design your own plan from the food library."
            : "Build a plan from the food library, then assign it to members."
        }
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Plan details</CardTitle>
            <CardDescription>Name the plan and say who it is for.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="diet-title">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="diet-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Lean bulk — vegetarian"
                required
                autoFocus
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="diet-goal">Goal</Label>
                <Input
                  id="diet-goal"
                  list="diet-goal-options"
                  value={goal}
                  onChange={(event) => setGoal(event.target.value)}
                  placeholder="Muscle Gain"
                />
                <datalist id="diet-goal-options">
                  {GOALS.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-2">
                <Label htmlFor="diet-type">Diet type</Label>
                <Input
                  id="diet-type"
                  list="diet-type-options"
                  value={dietType}
                  onChange={(event) => setDietType(event.target.value)}
                  placeholder="Veg"
                />
                <datalist id="diet-type-options">
                  {DIET_TYPES.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-2">
                <Label htmlFor="diet-target">Daily calorie target</Label>
                <Input
                  id="diet-target"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={targetCalories}
                  onChange={(event) => setTargetCalories(event.target.value)}
                  placeholder="2200"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="diet-description">Description</Label>
              <Textarea
                id="diet-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Who it suits, water intake, what to avoid…"
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* The day at a glance, kept in view while meals are written below it. */}
        <Card className="sticky top-2 z-10 border-primary/30 shadow-sm">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="text-sm font-semibold">Daily total</p>
              {target > 0 && (
                <p className="text-xs text-muted-foreground">
                  {formatAmount(dayTotals.calories)} of {formatAmount(target)} kcal target
                  {dayTotals.calories > target
                    ? ` · ${formatAmount(dayTotals.calories - target)} over`
                    : ` · ${formatAmount(target - dayTotals.calories)} to go`}
                </p>
              )}
            </div>
            <MacroChips values={dayTotals} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          {meals.map((meal, mealIndex) => {
            const mealTotals = sumNutrients(meal.foods);
            return (
              <Card key={mealIndex}>
                <CardHeader className="space-y-3 pb-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[10rem] flex-1 space-y-1">
                      <Label className="text-xs">Meal</Label>
                      <Input
                        value={meal.name}
                        onChange={(event) => updateMeal(mealIndex, { name: event.target.value })}
                        placeholder="Breakfast"
                        required
                      />
                    </div>
                    <div className="w-28 space-y-1">
                      <Label className="text-xs">Time</Label>
                      <Input
                        value={meal.time ?? ""}
                        onChange={(event) => updateMeal(mealIndex, { time: event.target.value })}
                        placeholder="08:00"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => moveMeal(mealIndex, -1)}
                        disabled={mealIndex === 0}
                        aria-label="Move meal up"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => moveMeal(mealIndex, 1)}
                        disabled={mealIndex === meals.length - 1}
                        aria-label="Move meal down"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setMeals((prev) => prev.filter((_, i) => i !== mealIndex))}
                        aria-label={`Remove ${meal.name || "meal"}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <MacroChips values={mealTotals} size="xs" />
                </CardHeader>

                <CardContent className="space-y-3">
                  {meal.foods.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No foods yet. Add them from the library, or type one in.
                    </p>
                  )}

                  {meal.foods.map((food, foodIndex) => (
                    <FoodLineEditor
                      key={foodIndex}
                      food={food}
                      onChange={(patch) => updateFood(mealIndex, foodIndex, patch)}
                      onRemove={() => removeFood(mealIndex, foodIndex)}
                    />
                  ))}

                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" size="sm" onClick={() => setPickerMeal(mealIndex)}>
                      <Plus className="h-3.5 w-3.5" />
                      Add from food library
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addFoods(mealIndex, [customLine()])}
                    >
                      <PenLine className="h-3.5 w-3.5" />
                      Type one
                    </Button>
                  </div>

                  <Input
                    value={meal.notes ?? ""}
                    onChange={(event) => updateMeal(mealIndex, { notes: event.target.value })}
                    placeholder="Notes for this meal (optional)"
                  />
                </CardContent>
              </Card>
            );
          })}

          <Button
            type="button"
            variant="outline"
            className="w-full border-dashed"
            onClick={() =>
              setMeals((prev) => [...prev, { name: `Meal ${prev.length + 1}`, foods: [] }])
            }
          >
            <Plus className="h-4 w-4" />
            Add a meal
          </Button>
        </div>

        <FoodItemPickerDialog
          open={pickerMeal !== null}
          onOpenChange={(open) => !open && setPickerMeal(null)}
          mealName={pickerMeal !== null ? meals[pickerMeal]?.name : undefined}
          onAdd={(lines) => pickerMeal !== null && addFoods(pickerMeal, lines)}
        />

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(isEdit && planId ? `/diet-plans/${planId}` : "/diet-plans")}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || !title.trim()}>
            {submitting ? "Saving..." : isEdit ? "Update Plan" : "Create Plan"}
          </Button>
        </div>
      </form>
    </div>
  );
}

const CUSTOM_FIGURES = [
  { key: "calories", label: "kcal" },
  { key: "proteinGrams", label: "Protein g" },
  { key: "carbsGrams", label: "Carbs g" },
  { key: "fatGrams", label: "Fat g" },
  { key: "fibreGrams", label: "Fibre g" },
] as const;

/**
 * One food in a meal.
 *
 * A library line shows its photo and serving and only lets the quantity and a
 * note change: its figures are the library's. A line typed by hand has no
 * library behind it, so its serving and figures are editable here.
 */
function FoodLineEditor({
  food,
  onChange,
  onRemove,
}: {
  food: DietPlanFood;
  onChange: (patch: Partial<DietPlanFood>) => void;
  onRemove: () => void;
}) {
  const fromLibrary = Boolean(food.foodItemId);
  const lineTotals = scaleNutrients(food, food.quantity || 0);

  const numberInput = (key: keyof DietPlanFood, value: string) => {
    const parsed = Number(value);
    onChange({ [key]: Number.isFinite(parsed) && value !== "" ? parsed : 0 } as Partial<DietPlanFood>);
  };

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-start gap-3">
        <FoodPhoto
          src={food.imageUrl}
          className="h-14 w-14 shrink-0 rounded-md border"
          iconClassName="h-5 w-5"
        />

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[10rem] flex-1">
              {fromLibrary ? (
                <>
                  <p className="truncate text-sm font-medium">{food.name}</p>
                  <p className="text-xs text-muted-foreground">
                    1 serving = {servingLabel(food.servingSize, food.servingUnit)}
                  </p>
                </>
              ) : (
                <>
                  <Label className="text-xs">Food</Label>
                  <Input
                    value={food.name}
                    onChange={(event) => onChange({ name: event.target.value })}
                    placeholder="Homemade dal"
                    required
                  />
                </>
              )}
            </div>

            <div className="w-24">
              <Label className="text-xs">Servings</Label>
              <Input
                type="number"
                inputMode="decimal"
                min={0.25}
                step={0.25}
                value={food.quantity}
                onChange={(event) => numberInput("quantity", event.target.value)}
              />
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onRemove}
              aria-label={`Remove ${food.name || "food"}`}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {!fromLibrary && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-7">
              <div>
                <Label className="text-xs">Serving</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={food.servingSize}
                  onChange={(event) => numberInput("servingSize", event.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Unit</Label>
                <Input
                  value={food.servingUnit}
                  onChange={(event) => onChange({ servingUnit: event.target.value })}
                />
              </div>
              {CUSTOM_FIGURES.map((figure) => (
                <div key={figure.key}>
                  <Label className="text-xs">{figure.label}</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={food[figure.key]}
                    onChange={(event) => numberInput(figure.key, event.target.value)}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <MacroChips values={lineTotals} size="xs" />
            <Input
              value={food.notes ?? ""}
              onChange={(event) => onChange({ notes: event.target.value })}
              placeholder="Note (optional)"
              className="h-8 max-w-[14rem] text-xs"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
