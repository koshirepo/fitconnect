/**
 * Documentation: One product in a catalogue grid, for either storefront.
 *
 * - Owns the whole card, not just the frame: the image, the badges, the name, the description, the price row and the slot the action sits in. An earlier pass shared only the frame and let each page write its own body, which is why the two storefronts still looked unrelated — the same component rendering two different layouts is not a shared design.
 * - The action is the one genuine difference and the only slot left. The platform shop puts a quantity stepper there once something is in the cart; a gym store sends you to the product page to pick a variant. Everything above the action is now identical by construction.
 * - `priceSuffix` is how "₹349 onwards" survives without a second card: a gym selling three sizes shows a starting price, and the shop selling one SKU shows the price.
 * - `OptimizedImage` throughout. The shop's grid used a raw `<img>`, so a category with forty products fetched forty full-size photos.
 * - Stock wording comes from `stock.ts`, so the two surfaces cannot drift apart again on what counts as nearly sold out.
 * - Primary exports: ProductCard.
 */
import * as React from "react";
import { PackageOpen } from "lucide-react";
import { OptimizedImage } from "@/components/ui/optimized-image";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { stockLabel, stockState } from "./stock";

export function ProductCard({
  name,
  description,
  photo,
  price,
  priceSuffix,
  stock,
  isActive = true,
  onOpen,
  emptyIcon,
  topLeft,
  topRight,
  action,
  className,
}: {
  name: string;
  description?: string | null;
  photo?: string;
  price: number;
  /** "onwards", where the price is the cheapest of several variants. */
  priceSuffix?: string;
  /** For a variant product, the total across variants. */
  stock: number;
  isActive?: boolean;
  onOpen: () => void;
  emptyIcon?: React.ReactNode;
  /** Over the image — a category chip, a coins badge. */
  topLeft?: React.ReactNode;
  topRight?: React.ReactNode;
  /** The buy control. A button, or a stepper once something is in the cart. */
  action?: React.ReactNode;
  className?: string;
}) {
  const state = stockState(stock, isActive);
  const label = stockLabel(stock, isActive);

  return (
    <div
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-all",
        "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg",
        state === "out" && "opacity-70",
        className,
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${name}`}
        className="relative block aspect-square w-full overflow-hidden bg-muted/40"
      >
        {photo ? (
          <OptimizedImage
            src={photo}
            alt={name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            {emptyIcon ?? <PackageOpen className="h-8 w-8 opacity-40" />}
          </div>
        )}

        {topLeft && <span className="absolute top-2 left-2">{topLeft}</span>}
        {topRight && <span className="absolute top-2 right-2">{topRight}</span>}

        {/* Scarcity where it is true and useful, and nowhere else. Sold out
            takes the bottom bar rather than covering the photo: somebody
            deciding whether to ask the gym to restock still wants to see it. */}
        {state === "out" && label && (
          <span className="absolute inset-x-0 bottom-0 bg-destructive/90 py-1 text-center text-[11px] font-semibold text-destructive-foreground">
            {label}
          </span>
        )}
        {state === "low" && label && (
          <span className="absolute bottom-2 left-2 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-amber-950">
            {label}
          </span>
        )}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3">
        <button type="button" className="text-left" onClick={onOpen}>
          <p className="line-clamp-2 text-sm leading-snug font-medium transition-colors group-hover:text-primary">
            {name}
          </p>
        </button>

        {description && (
          <p className="line-clamp-2 text-xs text-muted-foreground">{description}</p>
        )}

        <div className="mt-auto space-y-2 pt-2">
          <div className="flex items-baseline gap-1.5">
            <span className="text-lg font-bold tracking-tight">{formatCurrency(price)}</span>
            {priceSuffix && (
              <span className="text-xs text-muted-foreground">{priceSuffix}</span>
            )}
          </div>

          {action}
        </div>
      </div>
    </div>
  );
}
