/**
 * Documentation: The bar that sits above a catalogue grid, for either storefront.
 *
 * - Search, the cart, category chips and an optional sort. Both storefronts already had exactly this, written twice, and had drifted on every value that was never a decision: `max-w-7xl` against `max-w-6xl`, `/85 backdrop-blur-sm` against `/95 backdrop-blur`, `border-y` against `border-b`, a real `<Input>` against a hand-rolled one. A shopper moving between a gym's store and the platform shop saw two different products.
 * - What legitimately differs stays a prop. The site header is 65px on the platform shop and 57px inside a gym, so `stickyTop` is passed rather than guessed; the cart button itself is a slot, because the shop shows a count and the gym store shows the running total.
 * - Category counts are shown when given. They turn a filter into a decision — nobody wants to tap a category to find it empty — and the shop simply never had them.
 * - Presentational. Filtering, sorting and what the cart does stay with the page that owns the data.
 * - Primary exports: StorefrontToolbar, type CategoryChip.
 */
import * as React from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type CategoryChip = {
  /** Empty string or null is the "All" chip. */
  value: string;
  label: string;
  /** Omitted where the surface has no cheap way to count. */
  count?: number;
};

export function StorefrontToolbar({
  search,
  onSearchChange,
  searchPlaceholder = "Search products…",
  categories,
  activeCategory,
  onCategoryChange,
  cart,
  actions,
  sort,
  stickyTop,
  className,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  categories: CategoryChip[];
  activeCategory: string;
  onCategoryChange: (value: string) => void;
  /** The cart control itself: a count on the shop, a running total in a gym. */
  cart: React.ReactNode;
  /** Anything between the search box and the cart — a product count, My Orders. */
  actions?: React.ReactNode;
  /** A sort control on the right of the chip row, where the surface offers one. */
  sort?: React.ReactNode;
  /** Height of the site header above this bar, in px. */
  stickyTop: number;
  className?: string;
}) {
  return (
    <div
      className={cn("sticky z-30 border-b bg-background/95 backdrop-blur", className)}
      style={{ top: stickyTop }}
    >
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="relative min-w-0 flex-1 sm:max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="pl-9"
            />
          </div>

          {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
          <div className={cn("shrink-0", !actions && "ml-auto")}>{cart}</div>
        </div>

        {/* Chips scroll sideways on a phone rather than stacking into a wall of
            categories above the grid. */}
        {categories.length > 1 && (
          <div className="-mx-1 mt-3 flex items-center gap-2 overflow-x-auto px-1 pb-1">
            {categories.map((entry) => {
              const active = entry.value === activeCategory;

              return (
                <button
                  key={entry.value || "all"}
                  type="button"
                  onClick={() => onCategoryChange(entry.value)}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  )}
                >
                  {entry.label}
                  {entry.count !== undefined && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 text-[11px]",
                        active ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {entry.count}
                    </span>
                  )}
                </button>
              );
            })}

            {sort && <div className="ml-auto flex shrink-0 items-center gap-2">{sort}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The catalogue grid.
 *
 * Two columns on a phone in both storefronts — a gym's catalogue is small and a
 * one-column list wastes a phone screen — widening to four. The shop ran three
 * at `lg` and four only at `xl`, which left a laptop with a row of very wide
 * cards.
 */
export function ProductGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4", className)}>
      {children}
    </div>
  );
}

/**
 * The count that rides on a cart button.
 *
 * Its own component because the same badge was written twice and both copies
 * had the same bug: `variant="secondary"` sets near-white text, and the
 * `bg-accent-foreground` override set a near-white background under it, so the
 * number was invisible in dark mode — a white square on the button's corner.
 *
 * It sits half outside the button, over whatever the page is, so it carries its
 * own ground and a ring rather than borrowing the button's colours.
 */
export function CartCountBadge({ count }: { count: number }) {
  if (count <= 0) return null;

  return (
    <span
      aria-hidden
      className="absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-background px-1 text-xs font-semibold text-foreground ring-1 ring-border"
    >
      {count}
    </span>
  );
}
