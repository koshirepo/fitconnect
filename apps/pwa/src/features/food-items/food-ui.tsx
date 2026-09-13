/**
 * Documentation: How a food looks, everywhere one appears.
 *
 * - `NutritionFacts` is the full label: serving, calories large, the four headline macros as tiles, then every nutrient the food has — the main five always, the rest only where somebody entered them. An empty row for sodium nobody measured would read as zero.
 * - `MacroChips` is the compact form for rows and cards: calories, protein, carbs, fat and fibre.
 * - `FoodPhoto` and `CategoryChip` are shared by the library, its detail page, the picker and the manage screen.
 * - Primary exports: NutritionFacts, MacroChips, FoodPhoto, CategoryChip.
 */
import { Apple } from "lucide-react";
import { OptimizedImage } from "@/components/ui/optimized-image";
import { cn } from "@/lib/utils";
import type { FoodNutrients } from "@fitconnect/shared/types/models";
import { MACROS, formatAmount, servingLabel, type MacroTotals } from "./nutrition";

/**
 * The compact row: calories, then protein, carbs, fat and fibre.
 *
 * Calories are set apart because they are the figure people look for first;
 * the four gram figures read as a group after it.
 */
export function MacroChips({
  values,
  className,
  size = "sm",
}: {
  values: MacroTotals;
  className?: string;
  size?: "xs" | "sm";
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {MACROS.map((macro) => (
        <span
          key={macro.key}
          className={cn(
            "inline-flex items-baseline gap-1 rounded-md border tabular-nums whitespace-nowrap",
            size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs",
            macro.key === "calories"
              ? "border-primary/30 bg-primary/10 font-semibold text-foreground"
              : "border-border bg-muted/40 text-muted-foreground",
          )}
        >
          {macro.key === "calories" ? (
            <>
              {formatAmount(values.calories)}
              <span className="font-normal">kcal</span>
            </>
          ) : (
            <>
              <span>{macro.label}</span>
              <span className="font-medium text-foreground">
                {formatAmount(values[macro.key])}g
              </span>
            </>
          )}
        </span>
      ))}
    </div>
  );
}

/** Rows of the full label, in label order. Indented rows are part of the row above. */
const LABEL_ROWS: Array<{
  key: keyof FoodNutrients;
  label: string;
  unit: "g" | "mg";
  indent?: boolean;
  optional?: boolean;
}> = [
  { key: "proteinGrams", label: "Protein", unit: "g" },
  { key: "carbsGrams", label: "Carbohydrates", unit: "g" },
  { key: "fibreGrams", label: "Fibre", unit: "g", indent: true },
  { key: "sugarGrams", label: "Sugar", unit: "g", indent: true, optional: true },
  { key: "fatGrams", label: "Fat", unit: "g" },
  { key: "saturatedFatGrams", label: "Saturated fat", unit: "g", indent: true, optional: true },
  { key: "cholesterolMg", label: "Cholesterol", unit: "mg", optional: true },
  { key: "sodiumMg", label: "Sodium", unit: "mg", optional: true },
  { key: "potassiumMg", label: "Potassium", unit: "mg", optional: true },
  { key: "calciumMg", label: "Calcium", unit: "mg", optional: true },
  { key: "ironMg", label: "Iron", unit: "mg", optional: true },
];

/** The full label for one food, per serving. */
export function NutritionFacts({
  food,
  className,
}: {
  food: FoodNutrients & { servingSize: number; servingUnit: string };
  className?: string;
}) {
  const rows = LABEL_ROWS.filter((row) => !row.optional || food[row.key] != null);

  return (
    <div className={cn("rounded-xl border border-border bg-card p-4", className)}>
      <p className="text-lg font-bold">Nutrition facts</p>
      <p className="text-sm text-muted-foreground">
        Per serving · {servingLabel(food.servingSize, food.servingUnit)}
      </p>

      <div className="mt-3 flex items-baseline justify-between border-y-4 border-foreground/80 py-2">
        <span className="text-base font-bold">Calories</span>
        <span className="text-3xl font-bold tabular-nums">{formatAmount(food.calories)}</span>
      </div>

      {/* The four headline macros as tiles, so they read at a glance before the
          detail rows below. */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {MACROS.slice(1).map((macro) => (
          <div key={macro.key} className="rounded-lg bg-muted/50 px-3 py-2">
            <p className="text-xs text-muted-foreground">{macro.label}</p>
            <p className="text-lg font-semibold tabular-nums">
              {formatAmount(food[macro.key])}
              <span className="ml-0.5 text-xs font-normal text-muted-foreground">g</span>
            </p>
          </div>
        ))}
      </div>

      <dl className="mt-3 divide-y divide-border text-sm">
        {rows.map((row) => (
          <div
            key={row.key}
            className={cn("flex items-center justify-between py-1.5", row.indent && "pl-4")}
          >
            <dt className={cn(row.indent ? "text-muted-foreground" : "font-medium")}>
              {row.label}
            </dt>
            <dd className="tabular-nums">
              {formatAmount(food[row.key] as number)} {row.unit}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function CategoryChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      {label}
      {count !== undefined && (
        <span
          className={cn(
            "rounded-full px-1.5 text-[11px]",
            active ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/** The photo, or a placeholder where nobody has added one. */
export function FoodPhoto({
  src,
  className,
  iconClassName = "h-8 w-8",
}: {
  src?: string | null;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <span className={cn("block overflow-hidden bg-muted/40", className)}>
      {src ? (
        <OptimizedImage src={src} alt="" className="h-full w-full" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-muted-foreground">
          <Apple className={cn("opacity-40", iconClassName)} />
        </span>
      )}
    </span>
  );
}
