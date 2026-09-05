/**
 * Documentation: The list of forms a product is sold in, with a quantity each.
 *
 * - One row per variant: what it is called, what is left of it, what it costs, and how many you want. Both storefronts had a version of this and neither could do the last part — the gym offered a single `+` that jumped to the basket, and the shop made you pick one form and then use a separate Add to Cart, so buying two colours meant going round twice.
 * - A quantity per row, not a chosen row. That is what a variant list is for: a shopper wanting one 1kg tub and two 2kg tubs says so once.
 * - Sold-out variants are shown, disabled. "Chocolate 1kg — out of stock" tells a reader something; a silently missing row reads as a gym that never stocked it.
 * - Presentational. It reports quantities and never touches a cart, which is what lets a gym's in-memory basket and the shop's stored cart share it.
 * - Primary exports: VariantOptionsCard.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { QuantityStepper } from "./quantity-stepper";

export type VariantRow = {
  id: string;
  name: string;
  price: number;
  stock: number;
};

export function VariantOptionsCard({
  variants,
  quantityFor,
  onQuantityChange,
  maxPerOrder,
  title = "Options",
  disabled = false,
}: {
  variants: VariantRow[];
  quantityFor: (variant: VariantRow) => number;
  onQuantityChange: (variant: VariantRow, quantity: number) => void;
  /** Per-order limit, where the surface has one. Stock still caps below it. */
  maxPerOrder?: number;
  title?: string;
  disabled?: boolean;
}) {
  if (variants.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {variants.map((variant) => {
          const soldOut = variant.stock <= 0;
          const quantity = quantityFor(variant);

          return (
            <div
              key={variant.id}
              className={cn(
                "flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2",
                quantity > 0 && "border-primary bg-primary/5",
                soldOut && "opacity-60",
              )}
            >
              <div className="min-w-0">
                {/* Wrapped, not truncated: "Chocolate 1kg" losing its size to an
                    ellipsis would price the wrong thing. */}
                <p className="break-words text-sm font-medium">{variant.name}</p>
                <p className="text-xs text-muted-foreground">
                  {soldOut ? "Out of stock" : `${variant.stock} left`}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-3">
                <span className="text-sm font-semibold tabular-nums">
                  {formatCurrency(variant.price)}
                </span>
                <QuantityStepper
                  quantity={quantity}
                  // Zero is a valid resting state here — a row nobody wants yet
                  // — so minus stops at it rather than offering a bin.
                  min={0}
                  removable={false}
                  max={maxPerOrder}
                  stock={variant.stock}
                  disabled={disabled || soldOut}
                  label={`Quantity of ${variant.name}`}
                  onChange={(next) => onQuantityChange(variant, next)}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
