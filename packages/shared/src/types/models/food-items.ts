/**
 * Documentation: The food library every diet plan is built from.
 *
 * - One slice of the shared contract surface, re-exported from `types/models.ts`.
 * - Platform-owned, like the exercise library: the platform writes it and every gym reads the same rows, so none of these carry a tenant id.
 * - Every nutrient is for one serving, and the serving is stated beside them (`servingSize` + `servingUnit`), because "12 g protein" means nothing until you know of how much.
 * - Calories, protein, carbs, fat and fibre are always present; the other nutrients are optional because most nutrition tables do not give every one.
 */

/** The nutrients one serving holds. The first five are always known. */
export interface FoodNutrients {
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fibreGrams: number;
  sugarGrams?: number | null;
  saturatedFatGrams?: number | null;
  sodiumMg?: number | null;
  cholesterolMg?: number | null;
  potassiumMg?: number | null;
  calciumMg?: number | null;
  ironMg?: number | null;
}

export interface FoodItem extends FoodNutrients {
  id: string;
  name: string;
  /** Stable, lowercase, used in URLs: "paneer-tikka". */
  slug: string;
  /** How the library files it: "Grains", "Dairy", "Fruits". */
  category: string;
  /** "Veg", "Non-Veg", "Egg", "Vegan". */
  foodType?: string | null;
  /** How much one serving is: 100 with "g", 1 with "piece". */
  servingSize: number;
  servingUnit: string;
  description?: string | null;
  imageUrl?: string | null;
  /** Retired foods stay readable in plans that already name them. */
  isActive: boolean;
  createdAt: string;
}

/** The category filter rail, with how many foods each holds. */
export interface FoodItemCategory {
  name: string;
  count: number;
}

export interface CreateFoodItemPayload extends FoodNutrients {
  name: string;
  category: string;
  foodType?: string | null;
  servingSize: number;
  servingUnit: string;
  description?: string | null;
  imageUrl?: string | null;
  isActive?: boolean;
}

export type UpdateFoodItemPayload = Partial<CreateFoodItemPayload>;
