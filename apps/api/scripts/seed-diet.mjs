/**
 * Documentation: Food library and diet plan seeder.
 *
 * - The food library is platform-wide, so it is always seeded: about fifty common foods, weighted towards what an Indian gym's members actually eat — roti, dal, paneer, poha, eggs, chicken — each with its serving stated and every nutrient per serving. Figures are typical values from standard nutrition tables (USDA FoodData Central and common Indian food tables), rounded; they are good enough to plan with, and any of them can be corrected on the manage screen.
 * - No photos. There is nothing to upload them from here, and a stock image pointed at another site would break the moment that site moved. Photos are added on the manage screen and this script never overwrites one.
 * - With `--tenant <slug>`, it also writes diet plans into that gym, built out of the seeded foods exactly as the plan form builds them: each line carries the food's id and a copy of its serving and nutrients. Four plans are written by the gym's staff and assigned to a few active members; one is written by a member for themselves, the way the self-service form does it.
 * - Safe to re-run. Foods are keyed `foodseed_<slug>` and updated in place — except the photo and whether the food is retired, which belong to whoever manages the library. A food whose slug is already taken by a hand-added row is left alone and that row is used instead. Plans are keyed `dietseed_` and exactly that prefix is cleared for the gym before it is written again.
 * - Writes SQL and hands it to `wrangler d1 execute`, like every other seeder here. `--remote` targets production; the default is the local database.
 * - Usage: `pnpm run seed:diet` (foods only), `pnpm run seed:diet -- --tenant seed-gym-1` (foods and plans), add `--remote` for production.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(rootDir, "..", "..");

function resolveWranglerCli() {
  return [
    path.join(rootDir, "node_modules", "wrangler", "bin", "wrangler.js"),
    path.join(repoRoot, "node_modules", "wrangler", "bin", "wrangler.js"),
  ].find((candidate) => existsSync(candidate));
}

/** Doubling the single quote is the only escape a SQLite string literal needs. */
function q(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// ─── Foods ────────────────────────────────────────────────────────────────────

/**
 * One row per food: name, category, type, serving, then per serving
 * [kcal, protein g, carbs g, fat g, fibre g], then the optional figures where
 * the tables give them: sugar g, saturated fat g, cholesterol mg, sodium mg,
 * potassium mg, calcium mg, iron mg.
 */
const FOODS = [
  // Grains
  ["Rolled oats", "Grains", "Vegan", 40, "g", [152, 5.3, 27.1, 2.6, 4.0], { sugar: 0.4, sat: 0.5, sodium: 2, potassium: 145, calcium: 21, iron: 1.7 }, "Dry weight, before cooking."],
  ["White rice, cooked", "Grains", "Vegan", 150, "g", [195, 4.1, 42.3, 0.5, 0.6], { sugar: 0.1, sodium: 2, potassium: 53, calcium: 15, iron: 0.3 }],
  ["Brown rice, cooked", "Grains", "Vegan", 150, "g", [185, 4.1, 38.4, 1.5, 2.4], { sodium: 6, potassium: 129, calcium: 5, iron: 0.9 }],
  ["Whole wheat roti", "Grains", "Vegan", 1, "piece", [110, 3.5, 18.5, 2.6, 2.9], { sugar: 0.4, potassium: 90, calcium: 12, iron: 1.2 }, "About 40 g, with a little oil."],
  ["Brown bread", "Grains", "Veg", 1, "slice", [69, 3.6, 11.5, 1.0, 1.9], { sugar: 1.6, sat: 0.2, sodium: 126, potassium: 70, calcium: 45, iron: 0.7 }, "Whole wheat, about 28 g."],
  ["Quinoa, cooked", "Grains", "Vegan", 150, "g", [180, 6.6, 32.0, 2.9, 4.2], { sugar: 1.3, sodium: 11, potassium: 258, calcium: 26, iron: 2.2 }],
  ["Sweet potato, boiled", "Grains", "Vegan", 150, "g", [114, 2.1, 26.6, 0.2, 3.8], { sugar: 8.6, sodium: 41, potassium: 345, calcium: 41, iron: 1.1 }],
  ["Potato, boiled", "Grains", "Vegan", 100, "g", [87, 1.9, 20.1, 0.1, 1.8], { sugar: 0.9, sodium: 4, potassium: 379, calcium: 5, iron: 0.3 }],

  // Pulses & soy
  ["Moong dal, cooked", "Pulses & Soy", "Vegan", 1, "bowl", [158, 10.5, 28.8, 0.6, 11.4], { sugar: 3.0, sodium: 3, potassium: 399, calcium: 41, iron: 2.1 }, "About 150 g, without tadka."],
  ["Chickpeas (chana), boiled", "Pulses & Soy", "Vegan", 100, "g", [164, 8.9, 27.4, 2.6, 7.6], { sugar: 4.8, sat: 0.3, sodium: 7, potassium: 291, calcium: 49, iron: 2.9 }],
  ["Kidney beans (rajma), boiled", "Pulses & Soy", "Vegan", 100, "g", [127, 8.7, 22.8, 0.5, 6.4], { sugar: 0.3, sodium: 2, potassium: 405, calcium: 35, iron: 2.9 }],
  ["Soya chunks", "Pulses & Soy", "Vegan", 30, "g", [104, 15.6, 9.9, 0.2, 3.9], { calcium: 105 }, "Dry weight, before soaking."],
  ["Moong sprouts", "Pulses & Soy", "Vegan", 100, "g", [30, 3.0, 5.9, 0.2, 1.8], { sugar: 4.1, sodium: 6, potassium: 149, calcium: 13, iron: 0.9 }],
  ["Tofu, firm", "Pulses & Soy", "Vegan", 100, "g", [144, 17.3, 2.8, 8.7, 2.3], { sat: 1.3, sodium: 14, potassium: 237, calcium: 683, iron: 2.7 }],
  ["Roasted chana", "Pulses & Soy", "Vegan", 30, "g", [111, 6.8, 17.4, 1.6, 5.1], { sodium: 10, potassium: 250, calcium: 17, iron: 1.8 }],

  // Dairy
  ["Paneer", "Dairy", "Veg", 100, "g", [265, 18.3, 1.2, 20.8, 0], { sat: 13.0, calcium: 208 }],
  ["Curd (dahi)", "Dairy", "Veg", 100, "g", [61, 3.5, 4.7, 3.3, 0], { sugar: 4.7, sat: 2.1, cholesterol: 13, sodium: 46, potassium: 155, calcium: 121, iron: 0.1 }, "Plain, from whole milk."],
  ["Greek yogurt, plain", "Dairy", "Veg", 150, "g", [89, 15.3, 5.4, 0.6, 0], { sugar: 4.8, sat: 0.2, cholesterol: 8, sodium: 54, potassium: 212, calcium: 165, iron: 0.1 }, "Non-fat."],
  ["Toned milk", "Dairy", "Veg", 250, "ml", [145, 7.8, 11.8, 7.5, 0], { sugar: 11.8, sat: 4.7, cholesterol: 25, sodium: 110, potassium: 375, calcium: 300 }, "3% fat."],
  ["Skimmed milk", "Dairy", "Veg", 250, "ml", [85, 8.5, 12.5, 0.3, 0], { sugar: 12.5, cholesterol: 5, sodium: 105, potassium: 390, calcium: 305 }],
  ["Buttermilk (chaas)", "Dairy", "Veg", 250, "ml", [100, 8.3, 12.0, 2.2, 0], { sugar: 12.0, sat: 1.3, cholesterol: 10, sodium: 263, potassium: 375, calcium: 290 }],

  // Eggs
  ["Whole egg, boiled", "Eggs", "Egg", 1, "piece", [78, 6.3, 0.6, 5.3, 0], { sugar: 0.6, sat: 1.6, cholesterol: 186, sodium: 62, potassium: 63, calcium: 25, iron: 0.6 }, "Large, about 50 g."],
  ["Egg white", "Eggs", "Egg", 1, "piece", [17, 3.6, 0.2, 0.1, 0], { sugar: 0.2, sodium: 55, potassium: 54, calcium: 2 }, "From one large egg."],

  // Meat & fish
  ["Chicken breast, cooked", "Meat & Fish", "Non-Veg", 100, "g", [165, 31.0, 0, 3.6, 0], { sat: 1.0, cholesterol: 85, sodium: 74, potassium: 256, calcium: 15, iron: 1.0 }, "Skinless, grilled or boiled."],
  ["Mutton, lean, cooked", "Meat & Fish", "Non-Veg", 100, "g", [191, 28.3, 0, 7.7, 0], { sat: 2.7, cholesterol: 89, sodium: 68, potassium: 339, calcium: 8, iron: 2.1 }],
  ["Rohu fish", "Meat & Fish", "Non-Veg", 100, "g", [97, 16.6, 0, 1.4, 0], {}, "Raw weight."],
  ["Tuna, canned in water", "Meat & Fish", "Non-Veg", 100, "g", [86, 19.4, 0, 1.0, 0], { sat: 0.3, cholesterol: 36, sodium: 247, potassium: 179, calcium: 17, iron: 1.0 }, "Drained."],

  // Vegetables
  ["Spinach (palak), boiled", "Vegetables", "Vegan", 100, "g", [23, 3.0, 3.8, 0.3, 2.4], { sugar: 0.4, sodium: 70, potassium: 466, calcium: 136, iron: 3.6 }],
  ["Broccoli, steamed", "Vegetables", "Vegan", 100, "g", [35, 2.4, 7.2, 0.4, 3.3], { sugar: 1.4, sodium: 41, potassium: 293, calcium: 40, iron: 0.7 }],
  ["Cucumber", "Vegetables", "Vegan", 100, "g", [15, 0.7, 3.6, 0.1, 0.5], { sugar: 1.7, sodium: 2, potassium: 147, calcium: 16, iron: 0.3 }],
  ["Tomato", "Vegetables", "Vegan", 1, "piece", [22, 1.1, 4.7, 0.2, 1.4], { sugar: 3.1, sodium: 6, potassium: 284, calcium: 12, iron: 0.3 }, "Medium, about 120 g."],
  ["Green salad", "Vegetables", "Vegan", 1, "bowl", [30, 1.3, 6.5, 0.2, 1.8], { sugar: 3.5, sodium: 8, potassium: 250, calcium: 25, iron: 0.4 }, "Cucumber, tomato, onion; about 150 g."],
  ["Mixed vegetable sabzi", "Vegetables", "Vegan", 1, "bowl", [120, 3.0, 12.0, 7.0, 4.0], { sugar: 4.0, sodium: 300 }, "Dry, home-style; about 150 g."],

  // Fruits
  ["Banana", "Fruits", "Vegan", 1, "piece", [105, 1.3, 27.0, 0.4, 3.1], { sugar: 14.4, sodium: 1, potassium: 422, calcium: 6, iron: 0.3 }, "Medium, about 118 g."],
  ["Apple", "Fruits", "Vegan", 1, "piece", [95, 0.5, 25.0, 0.3, 4.4], { sugar: 18.9, sodium: 2, potassium: 195, calcium: 11, iron: 0.2 }, "Medium, about 180 g."],
  ["Papaya", "Fruits", "Vegan", 1, "cup", [62, 0.7, 15.7, 0.4, 2.5], { sugar: 11.3, sodium: 12, potassium: 264, calcium: 29, iron: 0.4 }, "Cubed, about 145 g."],
  ["Orange", "Fruits", "Vegan", 1, "piece", [61, 1.2, 15.4, 0.2, 3.1], { sugar: 12.2, potassium: 235, calcium: 52, iron: 0.1 }, "Medium, about 130 g."],
  ["Guava", "Fruits", "Vegan", 1, "piece", [68, 2.6, 14.3, 1.0, 5.4], { sugar: 8.9, sodium: 2, potassium: 417, calcium: 18, iron: 0.3 }, "About 100 g."],
  ["Dates", "Fruits", "Vegan", 3, "piece", [68, 0.6, 18.0, 0.1, 1.9], { sugar: 15.1, potassium: 157, calcium: 9, iron: 0.2 }, "Dry, about 24 g."],

  // Nuts & seeds
  ["Almonds", "Nuts & Seeds", "Vegan", 10, "piece", [69, 2.5, 2.6, 6.0, 1.5], { sugar: 0.5, sat: 0.5, potassium: 88, calcium: 32, iron: 0.4 }, "About 12 g."],
  ["Peanuts, roasted", "Nuts & Seeds", "Vegan", 30, "g", [176, 7.3, 6.4, 14.9, 2.5], { sugar: 1.3, sat: 2.1, sodium: 2, potassium: 190, calcium: 16, iron: 0.5 }, "Unsalted."],
  ["Peanut butter", "Nuts & Seeds", "Vegan", 1, "tbsp", [94, 3.5, 3.1, 8.0, 1.0], { sugar: 1.7, sat: 1.6, sodium: 73, potassium: 90, calcium: 7, iron: 0.3 }, "About 16 g."],
  ["Walnuts", "Nuts & Seeds", "Vegan", 15, "g", [98, 2.3, 2.1, 9.8, 1.0], { sugar: 0.4, sat: 0.9, potassium: 66, calcium: 15, iron: 0.4 }],
  ["Flaxseeds", "Nuts & Seeds", "Vegan", 1, "tbsp", [53, 1.8, 2.9, 4.2, 2.7], { sugar: 0.2, sat: 0.4, sodium: 3, potassium: 81, calcium: 26, iron: 0.6 }, "Ground, about 10 g."],
  ["Chia seeds", "Nuts & Seeds", "Vegan", 1, "tbsp", [58, 2.0, 5.1, 3.7, 4.1], { sat: 0.4, sodium: 2, potassium: 49, calcium: 76, iron: 0.9 }, "About 12 g."],
  ["Makhana, roasted", "Nuts & Seeds", "Vegan", 30, "g", [104, 2.9, 23.1, 0.3, 4.4], { calcium: 18, iron: 0.4 }, "Fox nuts, dry roasted."],

  // Oils & fats
  ["Ghee", "Oils & Fats", "Veg", 1, "tsp", [44, 0, 0, 5.0, 0], { sat: 3.1, cholesterol: 13 }, "About 5 g."],
  ["Olive oil", "Oils & Fats", "Vegan", 1, "tbsp", [119, 0, 0, 13.5, 0], { sat: 1.9 }, "About 13.5 g."],

  // Beverages
  ["Black coffee", "Beverages", "Vegan", 240, "ml", [2, 0.3, 0, 0, 0], { sodium: 5, potassium: 116 }, "Unsweetened."],
  ["Green tea", "Beverages", "Vegan", 240, "ml", [2, 0.5, 0, 0, 0], { sodium: 2, potassium: 20 }, "Unsweetened."],
  ["Coconut water", "Beverages", "Vegan", 240, "ml", [46, 1.7, 8.9, 0.5, 2.6], { sugar: 6.3, sodium: 252, potassium: 600, calcium: 58, iron: 0.7 }],

  // Supplements
  ["Whey protein", "Supplements", "Veg", 1, "scoop", [120, 24.0, 3.0, 1.5, 0], { sugar: 1.5, sat: 1.0, cholesterol: 50, sodium: 60, potassium: 150, calcium: 120 }, "About 30 g; check your brand's label."],

  // Indian dishes
  ["Poha", "Indian Dishes", "Vegan", 1, "bowl", [180, 3.5, 32.0, 4.5, 1.5], { sugar: 2.0, sodium: 280, iron: 2.5 }, "Cooked with vegetables; about 150 g."],
  ["Idli", "Indian Dishes", "Vegan", 1, "piece", [58, 1.6, 12.0, 0.4, 0.8], { sodium: 110 }, "About 40 g."],
  ["Sambar", "Indian Dishes", "Vegan", 1, "bowl", [90, 4.5, 13.0, 2.5, 3.5], { sugar: 3.0, sodium: 450, potassium: 300 }, "About 150 g."],
  ["Upma", "Indian Dishes", "Veg", 1, "bowl", [200, 5.0, 30.0, 7.0, 2.5], { sodium: 350 }, "About 150 g."],
  ["Besan chilla", "Indian Dishes", "Vegan", 1, "piece", [120, 6.0, 14.0, 4.5, 2.5], { sodium: 200, iron: 1.5 }, "About 60 g."],
];

const OPTIONAL_COLUMNS = {
  sugar: "sugarGrams",
  sat: "saturatedFatGrams",
  cholesterol: "cholesterolMg",
  sodium: "sodiumMg",
  potassium: "potassiumMg",
  calcium: "calciumMg",
  iron: "ironMg",
};

const foods = FOODS.map(([name, category, foodType, servingSize, servingUnit, main, extra, description]) => {
  const [calories, proteinGrams, carbsGrams, fatGrams, fibreGrams] = main;
  const optional = Object.fromEntries(
    Object.entries(OPTIONAL_COLUMNS).map(([key, column]) => [column, extra?.[key] ?? null]),
  );
  const slug = slugify(name);
  return {
    id: `foodseed_${slug}`,
    slug,
    name,
    category,
    foodType,
    servingSize,
    servingUnit,
    calories,
    proteinGrams,
    carbsGrams,
    fatGrams,
    fibreGrams,
    ...optional,
    description: description ?? null,
  };
});

// ─── Arguments ────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const remote = argv.includes("--remote");
const tenantArg = argv.indexOf("--tenant");
const tenantSlug = tenantArg >= 0 ? argv[tenantArg + 1] : null;

if (tenantArg >= 0 && (!tenantSlug || tenantSlug.startsWith("--"))) {
  console.error("Usage: node scripts/seed-diet.mjs [--tenant <slug>] [--remote]");
  process.exit(1);
}

const wranglerCli = resolveWranglerCli();
if (!wranglerCli) {
  console.error("Wrangler CLI not found. Run `pnpm install` first.");
  process.exit(1);
}

function d1(args) {
  const result = spawnSync(
    process.execPath,
    [wranglerCli, "d1", "execute", "fit-db", "--env", "production", remote ? "--remote" : "--local", ...args],
    { cwd: rootDir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
  return result.stdout;
}

function d1Rows(sql) {
  const out = d1(["--json", "--command", sql]);
  try {
    return JSON.parse(out.slice(out.indexOf("[")))?.[0]?.results ?? [];
  } catch {
    return [];
  }
}

function runSql(name, statements) {
  const file = path.join(rootDir, ".wrangler", "tmp", name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, statements.join("\n") + "\n", "utf8");
  d1(["--file", file]);
}

const now = new Date().toISOString().replace("Z", "+00:00");

// ─── Seed the food library ────────────────────────────────────────────────────

/**
 * Slugs somebody already added by hand. Inserting a seeded row over one would
 * fail on the unique slug, and replacing theirs is not this script's call —
 * so those are skipped and the existing row is what plans point at.
 */
const takenBySomebodyElse = new Set(
  d1Rows(
    `SELECT "slug" FROM "FoodItem" WHERE "slug" IN (${foods.map((f) => q(f.slug)).join(",")}) AND "id" NOT LIKE 'foodseed_%'`,
  ).map((row) => row.slug),
);

const FOOD_COLUMNS = [
  "name", "category", "foodType", "servingSize", "servingUnit",
  "calories", "proteinGrams", "carbsGrams", "fatGrams", "fibreGrams",
  "sugarGrams", "saturatedFatGrams", "cholesterolMg", "sodiumMg", "potassiumMg", "calciumMg", "ironMg",
  "description",
];

const foodStatements = foods
  .filter((food) => !takenBySomebodyElse.has(food.slug))
  .map(
    (food) =>
      `INSERT INTO "FoodItem" ("id","slug",${FOOD_COLUMNS.map((c) => `"${c}"`).join(",")},"isActive","createdAt","updatedAt") VALUES (` +
      [q(food.id), q(food.slug), ...FOOD_COLUMNS.map((c) => q(food[c])), 1, q(now), q(now)].join(",") +
      `) ON CONFLICT("id") DO UPDATE SET ` +
      // Photo and retirement are left to whoever manages the library.
      [...FOOD_COLUMNS, "updatedAt"].map((c) => `"${c}" = excluded."${c}"`).join(", ") +
      ";",
  );

runSql("seed-diet-foods.sql", foodStatements);

const byCategory = new Map();
for (const food of foods) byCategory.set(food.category, (byCategory.get(food.category) ?? 0) + 1);
console.log(`Food library: ${foodStatements.length} foods written, ${takenBySomebodyElse.size} kept as already added by hand (${remote ? "remote" : "local"})`);
for (const [category, count] of [...byCategory.entries()].sort()) {
  console.log(`  ${category.padEnd(14)} ${count}`);
}

if (!tenantSlug) {
  console.log("No --tenant given, so no diet plans were written.");
  process.exit(0);
}

// ─── Seed diet plans into one gym ─────────────────────────────────────────────

const tenant = d1Rows(`SELECT "id", "name" FROM "Tenant" WHERE "slug" = ${q(tenantSlug)}`)[0];
if (!tenant) {
  console.error(`No gym found with slug "${tenantSlug}".`);
  process.exit(1);
}

/** The library rows plans point at, by slug, including any added by hand. */
const libraryRows = new Map(
  d1Rows(
    `SELECT "id", "slug", "imageUrl" FROM "FoodItem" WHERE "slug" IN (${foods.map((f) => q(f.slug)).join(",")})`,
  ).map((row) => [row.slug, row]),
);

const foodBySlug = new Map(foods.map((food) => [food.slug, food]));

/** A plan line, exactly as the plan form's picker builds one. */
function line(name, quantity = 1, notes) {
  const slug = slugify(name);
  const food = foodBySlug.get(slug);
  const row = libraryRows.get(slug);
  if (!food || !row) throw new Error(`Seed plan names an unknown food: ${name}`);
  return {
    foodItemId: row.id,
    name: food.name,
    servingSize: food.servingSize,
    servingUnit: food.servingUnit,
    quantity,
    calories: food.calories,
    proteinGrams: food.proteinGrams,
    carbsGrams: food.carbsGrams,
    fatGrams: food.fatGrams,
    fibreGrams: food.fibreGrams,
    sugarGrams: food.sugarGrams,
    saturatedFatGrams: food.saturatedFatGrams,
    cholesterolMg: food.cholesterolMg,
    sodiumMg: food.sodiumMg,
    potassiumMg: food.potassiumMg,
    calciumMg: food.calciumMg,
    ironMg: food.ironMg,
    imageUrl: row.imageUrl ?? null,
    ...(notes ? { notes } : {}),
  };
}

const meal = (name, time, foodsInMeal, notes) => ({ name, time, ...(notes ? { notes } : {}), foods: foodsInMeal });

const PLANS = [
  {
    key: "fatloss-veg",
    by: "admin",
    title: "Fat Loss — Vegetarian",
    goal: "Weight Loss",
    dietType: "Veg",
    description: "A moderate deficit built on dal, paneer and vegetables. Drink 3–4 litres of water, and keep oil to the ghee listed.",
    assignTo: 3,
    meals: [
      meal("Breakfast", "08:00", [line("Rolled oats"), line("Skimmed milk"), line("Almonds")]),
      meal("Mid-morning", "11:00", [line("Apple"), line("Green tea")]),
      meal("Lunch", "13:30", [line("Whole wheat roti", 2), line("Moong dal, cooked"), line("Spinach (palak), boiled", 1.5), line("Curd (dahi)"), line("Cucumber")]),
      meal("Evening snack", "17:00", [line("Roasted chana"), line("Green tea")]),
      meal("Dinner", "20:00", [line("Paneer", 0.75, "Grilled, not fried"), line("Broccoli, steamed", 1.5), line("Whole wheat roti"), line("Ghee")]),
    ],
  },
  {
    key: "musclegain-nonveg",
    by: "coach",
    title: "Lean Muscle Gain — Non-Veg",
    goal: "Muscle Gain",
    dietType: "Non-Veg",
    description: "A small surplus with protein at every meal. Have the pre-workout meal 60–90 minutes before training.",
    assignTo: 3,
    meals: [
      meal("Breakfast", "07:30", [line("Whole egg, boiled", 2), line("Egg white", 3), line("Brown bread", 2), line("Toned milk")]),
      meal("Mid-morning", "10:30", [line("Banana"), line("Almonds")]),
      meal("Lunch", "13:30", [line("White rice, cooked", 2), line("Chicken breast, cooked", 1.5), line("Kidney beans (rajma), boiled"), line("Green salad"), line("Curd (dahi)")]),
      meal("Pre-workout", "17:00", [line("Brown bread"), line("Peanut butter"), line("Banana")]),
      meal("Post-workout", "19:00", [line("Whey protein"), line("Dates")], "Mix the whey in water."),
      meal("Dinner", "21:00", [line("Whole wheat roti", 2), line("Chicken breast, cooked"), line("Broccoli, steamed"), line("Olive oil", 0.5)]),
    ],
  },
  {
    key: "maintenance-southindian",
    by: "admin",
    title: "Maintenance — South Indian Veg",
    goal: "Maintenance",
    dietType: "Veg",
    description: "Everyday home food at maintenance calories, for members who want to hold their weight while training.",
    assignTo: 2,
    meals: [
      meal("Breakfast", "08:00", [line("Idli", 4), line("Sambar"), line("Toned milk")]),
      meal("Mid-morning", "11:00", [line("Papaya"), line("Almonds"), line("Buttermilk (chaas)")]),
      meal("Lunch", "13:30", [line("White rice, cooked", 1.5), line("Sambar"), line("Mixed vegetable sabzi"), line("Curd (dahi)"), line("Ghee")]),
      meal("Evening snack", "17:00", [line("Makhana, roasted"), line("Banana"), line("Green tea")]),
      meal("Dinner", "20:30", [line("Whole wheat roti", 3), line("Moong dal, cooked"), line("Paneer", 0.5), line("Spinach (palak), boiled")]),
    ],
  },
  {
    key: "highprotein-vegan",
    by: "admin",
    title: "High-Protein Vegan",
    goal: "Muscle Gain",
    dietType: "Vegan",
    description: "Tofu, soya, chana and quinoa for plant-based members chasing a protein target.",
    assignTo: 1,
    meals: [
      meal("Breakfast", "08:00", [line("Tofu, firm", 1.5, "Scrambled with vegetables"), line("Brown bread", 2), line("Orange")]),
      meal("Lunch", "13:30", [line("Quinoa, cooked"), line("Chickpeas (chana), boiled", 1.5), line("Green salad")]),
      meal("Evening snack", "17:00", [line("Peanuts, roasted"), line("Coconut water")]),
      meal("Dinner", "20:30", [line("Soya chunks", 1.5), line("Brown rice, cooked"), line("Broccoli, steamed"), line("Olive oil", 0.5)]),
    ],
  },
];

/** The one a member writes for themselves, as the self-service form would. */
const OWN_PLAN = {
  key: "member-own",
  title: "My cutting plan",
  goal: "Fat Loss",
  dietType: "Egg",
  description: "What I actually eat on training days.",
  meals: [
    meal("Breakfast", "08:30", [line("Poha"), line("Whole egg, boiled", 2)]),
    meal("Lunch", "14:00", [line("Whole wheat roti", 2), line("Moong dal, cooked"), line("Green salad")]),
    meal("Snack", "17:30", [line("Guava"), line("Black coffee")]),
    meal("Dinner", "21:00", [line("Besan chilla", 2), line("Curd (dahi)")]),
  ],
};

function dayCalories(meals) {
  return meals.reduce(
    (sum, m) => sum + m.foods.reduce((inner, f) => inner + f.calories * f.quantity, 0),
    0,
  );
}

const staff = d1Rows(
  `SELECT "id", "role" FROM "TenantMembership"
   WHERE "tenantId" = ${q(tenant.id)} AND "status" = 'ACTIVE' AND "role" IN ('ADMIN','COACH')
   ORDER BY "memberId"`,
);
const admin = staff.find((row) => row.role === "ADMIN");
const coach = staff.find((row) => row.role === "COACH") ?? admin;
if (!admin) {
  console.error(`Gym "${tenantSlug}" has no active admin to write plans as.`);
  process.exit(1);
}

const members = d1Rows(
  `SELECT m."id", u."name" FROM "TenantMembership" m JOIN "User" u ON u."id" = m."userId"
   WHERE m."tenantId" = ${q(tenant.id)} AND m."status" = 'ACTIVE' AND m."role" = 'MEMBER'
   ORDER BY m."memberId" LIMIT 12`,
);

const planStatements = [
  // Assignments first, in case a database has foreign keys off.
  `DELETE FROM "DietPlanAssignment" WHERE "planId" IN (SELECT "id" FROM "DietPlan" WHERE "tenantId" = ${q(tenant.id)} AND "id" LIKE 'dietseed_%');`,
  `DELETE FROM "DietPlan" WHERE "tenantId" = ${q(tenant.id)} AND "id" LIKE 'dietseed_%';`,
];

function insertPlan(id, creatorId, plan) {
  // What the meals add up to, rounded to the nearest 50 as a coach would state it.
  const target = Math.round(dayCalories(plan.meals) / 50) * 50;
  planStatements.push(
    `INSERT INTO "DietPlan" ("id","tenantId","creatorId","title","description","goal","dietType","targetCalories","meals","createdAt","updatedAt") VALUES (` +
      [q(id), q(tenant.id), q(creatorId), q(plan.title), q(plan.description), q(plan.goal), q(plan.dietType), target, q(JSON.stringify(plan.meals)), q(now), q(now)].join(",") +
      `);`,
  );
  return target;
}

function assign(planId, membershipId) {
  planStatements.push(
    `INSERT INTO "DietPlanAssignment" ("id","planId","membershipId","assignedAt") VALUES (` +
      [q(`dietseedasg_${planId.slice(-24)}_${membershipId.slice(-12)}`), q(planId), q(membershipId), q(now)].join(",") +
      `);`,
  );
}

const summary = [];
let nextMember = 0;

/**
 * The next few members, round the roster and back to the start.
 *
 * A demo gym can have only a handful of active members, and a member following
 * two plans is ordinary, so running out wraps rather than leaving the later
 * plans assigned to nobody.
 */
function takeMembers(count) {
  const picked = new Map();
  for (let i = 0; i < Math.min(count, members.length); i++) {
    const member = members[(nextMember + i) % members.length];
    picked.set(member.id, member);
  }
  nextMember = members.length ? (nextMember + count) % members.length : 0;
  return [...picked.values()];
}

for (const plan of PLANS) {
  const id = `dietseed_${tenant.id}_${plan.key}`;
  const creator = plan.by === "coach" ? coach : admin;
  const target = insertPlan(id, creator.id, plan);

  const assigned = takeMembers(plan.assignTo);
  for (const member of assigned) assign(id, member.id);

  summary.push(`  ${plan.title.padEnd(34)} ~${target} kcal, by ${plan.by}, assigned to ${assigned.map((m) => m.name).join(", ") || "nobody"}`);
}

// The member-designed plan goes to the next member along, assigned to themselves.
const author = takeMembers(1)[0];
if (author) {
  const id = `dietseed_${tenant.id}_${OWN_PLAN.key}`;
  const target = insertPlan(id, author.id, OWN_PLAN);
  assign(id, author.id);
  summary.push(`  ${OWN_PLAN.title.padEnd(34)} ~${target} kcal, written by ${author.name} for themselves`);
}

runSql("seed-diet-plans.sql", planStatements);

console.log(`Diet plans in ${tenant.name}:`);
for (const row of summary) console.log(row);
console.log("Done. Re-run any time; it replaces the rows it wrote.");
