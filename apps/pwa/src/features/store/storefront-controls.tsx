/**
 * Documentation: The small controls a gym storefront's toolbar and cards share.
 *
 * - The cart button, the sort select, and the coins badge over a product photo. The shop at `/shop` and the counter sale both draw them, and each was written inline once; a second copy is how the shop and the desk would start to disagree about what a cart button looks like.
 * - Components only, kept apart from the pure browsing rules in `storefront.ts`.
 * - Primary exports: StoreCartButton, StoreSortSelect, CoinsBadge.
 */
import { Coins, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { STORE_SORTS } from "./storefront";

/**
 * The cart control in a storefront toolbar.
 *
 * The running total, not just a count. What somebody wants to know before
 * opening a basket is what it will cost, and on a phone the word "Cart" is the
 * least useful thing in the button.
 */
export function StoreCartButton({
  count,
  total,
  onClick,
  label = "Basket",
  text,
  variant,
  className,
}: {
  count: number;
  total: number;
  onClick: () => void;
  /** What the button is called to a screen reader. */
  label?: string;
  /**
   * Fixed wording in place of the running total, shown on a phone too. The
   * counter's cart button is the main action in a page header, where "Sell at
   * counter" says more than a figure — the count and total ride in the badge.
   */
  text?: string;
  /** Overrides the empty-outline, filled-once-used default. */
  variant?: "default" | "outline";
  className?: string;
}) {
  return (
    <Button
      variant={variant ?? (count > 0 ? "default" : "outline")}
      onClick={onClick}
      className={className}
      aria-label={`${label}, ${count} item${count === 1 ? "" : "s"}`}
    >
      <ShoppingCart className="h-4 w-4" />
      {text ? (
        <span>{text}</span>
      ) : (
        <span className="hidden sm:inline">{count > 0 ? formatCurrency(total) : "Cart"}</span>
      )}
      {count > 0 && (
        <span className="ml-1 rounded-full bg-background/25 px-1.5 text-xs font-semibold">
          {text ? `${count} · ${formatCurrency(total)}` : count}
        </span>
      )}
    </Button>
  );
}

export function StoreSortSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <>
      <span className="hidden text-xs text-muted-foreground sm:inline">Sort by</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 rounded-md border border-input bg-background px-2 text-sm outline-none"
      >
        {STORE_SORTS.map((entry) => (
          <option key={entry.value} value={entry.value}>
            {entry.label}
          </option>
        ))}
      </select>
    </>
  );
}

/** Coins a product gives back, over the corner of its photo. */
export function CoinsBadge({ coins }: { coins: number }) {
  return (
    <span className="flex items-center gap-1 rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-semibold shadow-sm backdrop-blur">
      <Coins className="h-3 w-3" />+{coins}
    </span>
  );
}
