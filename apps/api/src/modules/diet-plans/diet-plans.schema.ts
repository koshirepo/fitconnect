/**
 * Documentation: Diet plan request schemas.
 *
 * - Validates what a caller may send to a gym's diet plans: the plan, its meals, the food lines in them, and an assignment.
 * - A food line carries its own copy of the nutrients for one serving, plus how many servings. Lines picked from the food library also carry `foodItemId`; lines typed by hand carry none and need none.
 * - Bounds are generous but finite — twenty meals of fifty foods — because a plan is read whole on every open.
 * - Primary exports: createDietPlanSchema, updateDietPlanSchema, assignDietPlanSchema, and the inferred input types.
 */
import { z } from "zod";
import { cleanText } from "../../lib/clean-text";

const amount = (max: number) => z.number().min(0).max(max);
const optionalAmount = (max: number) => amount(max).nullable().optional();

const foodSchema = z.object({
  /**
   * The library food this line was picked from, where it was picked from one.
   *
   * Kept beside the copied figures rather than instead of them: the copy is what
   * the plan says, and stays right if the library entry is later corrected.
   */
  foodItemId: z.string().max(120).optional(),
  name: z.string().trim().min(1).max(160),
  servingSize: z.number().positive().max(10000),
  servingUnit: z.string().trim().min(1).max(20),
  quantity: z.number().positive().max(100),
  calories: amount(10000),
  proteinGrams: amount(1000),
  carbsGrams: amount(1000),
  fatGrams: amount(1000),
  fibreGrams: amount(1000),
  sugarGrams: optionalAmount(1000),
  saturatedFatGrams: optionalAmount(1000),
  sodiumMg: optionalAmount(100000),
  cholesterolMg: optionalAmount(100000),
  potassiumMg: optionalAmount(100000),
  calciumMg: optionalAmount(100000),
  ironMg: optionalAmount(10000),
  imageUrl: z.string().max(1000).nullable().optional(),
  notes: z.string().max(500).optional(),
});

const mealSchema = z.object({
  name: z.string().trim().min(1).max(80),
  time: z.string().trim().max(40).optional(),
  notes: z.string().max(1000).optional(),
  foods: z.array(foodSchema).max(50).default([]),
});

export const createDietPlanSchema = z.object({
  title: cleanText(z.string().trim().min(2).max(200)),
  description: z.string().max(2000).nullable().optional(),
  goal: z.string().trim().max(60).nullable().optional(),
  dietType: z.string().trim().max(40).nullable().optional(),
  targetCalories: z.number().int().min(0).max(20000).nullable().optional(),
  meals: z.array(mealSchema).max(20).optional(),
});

export const updateDietPlanSchema = createDietPlanSchema.partial();

export const assignDietPlanSchema = z.object({
  membershipId: z.string().min(1),
});

export type DietPlanFoodInput = z.infer<typeof foodSchema>;
export type DietPlanMealInput = z.infer<typeof mealSchema>;
export type CreateDietPlanInput = z.infer<typeof createDietPlanSchema>;
export type UpdateDietPlanInput = z.infer<typeof updateDietPlanSchema>;
