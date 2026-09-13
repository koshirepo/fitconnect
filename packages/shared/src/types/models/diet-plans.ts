/**
 * Documentation: A gym's diet plans and the meals in them.
 *
 * - One slice of the shared contract surface, re-exported from `types/models.ts`.
 * - Shaped like `WorkoutPlan`: written by staff and assigned to members, or written by a member for themselves.
 * - A plan is meals, and a meal is food lines. A line picked from the food library keeps its `foodItemId` *and* a copy of the name, serving and nutrients it was picked with — the same reason a workout line keeps its exercise's name — so a plan written today reads the same if the library entry is corrected later.
 * - A line's nutrients are for one serving; `quantity` is how many servings. Totals are computed from the lines rather than stored.
 */
import type { FoodNutrients } from "./food-items";

/** One food in a meal. */
export interface DietPlanFood extends FoodNutrients {
  /** The library food this line came from, when it came from the library. */
  foodItemId?: string;
  name: string;
  /** One serving, as the line was written: 100 with "g", 1 with "piece". */
  servingSize: number;
  servingUnit: string;
  /** How many servings. 1.5 servings of 100 g is 150 g. */
  quantity: number;
  /** The library photo, copied so a plan shows it without a second lookup. */
  imageUrl?: string | null;
  notes?: string;
}

/** One meal: a name, an optional time, and what is eaten. */
export interface DietPlanMeal {
  /** "Breakfast", "Pre-workout", "Dinner". */
  name: string;
  /** "08:00". Free text, so "after training" is allowed too. */
  time?: string;
  notes?: string;
  foods: DietPlanFood[];
}

/** The daily figures a plan adds up to. */
export interface DietPlanTotals {
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fibreGrams: number;
}

export interface DietPlan {
  id: string;
  title: string;
  description?: string | null;
  /** "Weight Loss", "Muscle Gain". */
  goal?: string | null;
  /** "Veg", "Non-Veg", "Vegan". */
  dietType?: string | null;
  /** What the plan aims for a day, as its author set it. */
  targetCalories?: number | null;
  /** Present on a single plan; lists carry `totals` instead. */
  meals?: DietPlanMeal[];
  /** What the meals add up to. */
  totals?: DietPlanTotals;
  mealCount?: number;
  createdAt: string;
  updatedAt?: string;
  creator?: {
    id: string;
    name: string;
  };
  _count?: { assignments: number };
  assignments?: {
    id: string;
    assignedAt: string;
    membershipId: string;
    memberId: number;
    memberName: string;
  }[];
}

export interface CreateDietPlanPayload {
  title: string;
  description?: string | null;
  goal?: string | null;
  dietType?: string | null;
  targetCalories?: number | null;
  meals?: DietPlanMeal[];
}

export type UpdateDietPlanPayload = Partial<CreateDietPlanPayload>;
