/**
 * Documentation: Food library request schemas.
 *
 * - Validates what a caller may send to the platform's food library: the foods themselves and the filters a browser reads them with.
 * - Every nutrient is for one serving, so the serving (`servingSize` + `servingUnit`) is required beside them.
 * - Calories, protein, carbs, fat and fibre are required: a diet plan totals those five, and a food missing one would quietly make every total wrong. The rest are optional and nullable.
 * - Nothing here decides what a viewer may see. Reading needs nothing, and writing needs `platform:food-items:manage`; the routes enforce both.
 * - Primary exports: the schemas, and the inferred input types.
 */
import { z } from "zod";
import { cleanText } from "../../lib/clean-text";

const category = z.string().trim().min(2).max(40);

/** A required amount. Decimals allowed: 2.5 g of fibre is a real figure. */
const amount = (max: number) => z.number().min(0).max(max);

/** An optional amount. Null clears it; absent leaves it alone on an edit. */
const optionalAmount = (max: number) => amount(max).nullable().optional();

export const createFoodItemSchema = z.object({
  name: cleanText(z.string().trim().min(2).max(160)),
  category,
  foodType: z.string().trim().max(40).nullable().optional(),
  servingSize: z.number().positive().max(10000),
  servingUnit: z.string().trim().min(1).max(20),
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
  description: cleanText(z.string().trim().max(2000)).nullable().optional(),
  /** The photo, as the upload route returned it. */
  imageUrl: z.string().trim().url().max(1000).nullable().optional(),
  isActive: z.boolean().default(true),
});

export const updateFoodItemSchema = createFoodItemSchema.partial();

/**
 * What a library page or a plan's food picker asks for.
 *
 * `includeInactive` is the manage screen's, honoured only for whoever manages
 * the library. `ids` is a plan's: the foods its lines were picked from, which
 * come back retired or not.
 */
export const listFoodItemsSchema = z.object({
  search: z.string().trim().max(80).optional(),
  category: category.optional(),
  includeInactive: z.coerce.boolean().optional(),
  ids: z
    .string()
    .trim()
    .max(4000)
    .transform((value) =>
      value
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    )
    .optional(),
});

export type CreateFoodItemInput = z.infer<typeof createFoodItemSchema>;
export type UpdateFoodItemInput = z.infer<typeof updateFoodItemSchema>;
export type ListFoodItemsInput = z.infer<typeof listFoodItemsSchema>;
