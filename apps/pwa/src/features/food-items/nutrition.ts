/**
 * Documentation: The arithmetic behind every nutrient shown in the app.
 *
 * - Nutrients are stored per serving. `scaleNutrients` multiplies by a quantity of servings, and `sumNutrients` adds lines up into a meal or a day, so a food card, a plan line and a plan total all agree.
 * - `formatAmount` is the one rounding rule: whole numbers stay whole, anything else gets one decimal.
 * - The components that display these live in `food-ui.tsx`.
 * - Primary exports: MACROS, MacroTotals, formatAmount, servingLabel, scaleNutrients, sumNutrients, foodToPlanLine.
 */
import type { DietPlanFood, FoodItem, FoodNutrients } from "@fitconnect/shared/types/models";

/** The five figures a plan totals, in the order they are always shown. */
export const MACROS = [
  { key: "calories", label: "Calories", short: "kcal", unit: "kcal" },
  { key: "proteinGrams", label: "Protein", short: "P", unit: "g" },
  { key: "carbsGrams", label: "Carbs", short: "C", unit: "g" },
  { key: "fatGrams", label: "Fat", short: "F", unit: "g" },
  { key: "fibreGrams", label: "Fibre", short: "Fibre", unit: "g" },
] as const;

export type MacroTotals = Pick<
  FoodNutrients,
  "calories" | "proteinGrams" | "carbsGrams" | "fatGrams" | "fibreGrams"
>;

/** Whole numbers stay whole; anything else gets one decimal, never a trailing ".0". */
export function formatAmount(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? rounded.toLocaleString() : rounded.toFixed(1);
}

/** "100 g", "1 piece", or "1.5 × 100 g" when more than one serving is meant. */
export function servingLabel(size: number, unit: string, quantity = 1) {
  const serving = `${formatAmount(size)} ${unit}`;
  return quantity === 1 ? serving : `${formatAmount(quantity)} × ${serving}`;
}

/** One serving's figures, times a number of servings. */
export function scaleNutrients(food: MacroTotals, quantity: number): MacroTotals {
  return {
    calories: food.calories * quantity,
    proteinGrams: food.proteinGrams * quantity,
    carbsGrams: food.carbsGrams * quantity,
    fatGrams: food.fatGrams * quantity,
    fibreGrams: food.fibreGrams * quantity,
  };
}

/** Lines added up. Each line carries its own quantity. */
export function sumNutrients(lines: Array<MacroTotals & { quantity?: number }>): MacroTotals {
  return lines.reduce<MacroTotals>(
    (total, line) => {
      const scaled = scaleNutrients(line, line.quantity ?? 1);
      return {
        calories: total.calories + scaled.calories,
        proteinGrams: total.proteinGrams + scaled.proteinGrams,
        carbsGrams: total.carbsGrams + scaled.carbsGrams,
        fatGrams: total.fatGrams + scaled.fatGrams,
        fibreGrams: total.fibreGrams + scaled.fibreGrams,
      };
    },
    { calories: 0, proteinGrams: 0, carbsGrams: 0, fatGrams: 0, fibreGrams: 0 },
  );
}

/** A library food as a plan line: its figures copied, one serving to start. */
export function foodToPlanLine(food: FoodItem): DietPlanFood {
  return {
    foodItemId: food.id,
    name: food.name,
    servingSize: food.servingSize,
    servingUnit: food.servingUnit,
    quantity: 1,
    calories: food.calories,
    proteinGrams: food.proteinGrams,
    carbsGrams: food.carbsGrams,
    fatGrams: food.fatGrams,
    fibreGrams: food.fibreGrams,
    sugarGrams: food.sugarGrams ?? null,
    saturatedFatGrams: food.saturatedFatGrams ?? null,
    sodiumMg: food.sodiumMg ?? null,
    cholesterolMg: food.cholesterolMg ?? null,
    potassiumMg: food.potassiumMg ?? null,
    calciumMg: food.calciumMg ?? null,
    ironMg: food.ironMg ?? null,
    imageUrl: food.imageUrl ?? null,
  };
}
