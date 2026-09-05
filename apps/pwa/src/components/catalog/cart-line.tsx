/**
 * Documentation: One line in a cart, for either storefront.
 *
 * - A thumbnail, what it is, what it costs, and how many. Both storefronts had this and had solved the quantity control differently: a gym's basket used a −/+ stepper, and the platform shop used a number field with a separate "Update Qty" button — which meant a shopper could type 3, not press the button, and check out with 1.
 * - The stepper wins, and not only because it is fewer taps. The shop's own catalogue card already used one, so the shop disagreed with itself between its grid and its cart.
 * - At the minimum quantity the decrease becomes a bin. Going below the minimum is removal, so the control says so rather than sitting disabled with no way out.
 * - `issue` is rendered here rather than swallowed: a line that breaks a min or max rule has to say which, next to the line it applies to.
 * - Primary exports: CartLine.
 */
import * as React from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OptimizedImage } from "@/components/ui/optimized-image";

export function CartLine({
  name,
  subtitle,
  photo,
  price,
  meta,
  quantity,
  atMinimum = quantity <= 1,
  canIncrease = true,
  onDecrease,
  onIncrease,
  issue,
}: {
  name: string;
  /** The variant, or the category — whatever narrows the name. */
  subtitle?: string | null;
  photo?: string | null;
  /** Already formatted, because one surface shows a line total and the other a unit price. */
  price: string;
  /** A second line under the price: stock, or min/max rules. */
  meta?: React.ReactNode;
  quantity: number;
  /** One fewer would drop below what may be bought, so the control removes instead. */
  atMinimum?: boolean;
  canIncrease?: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
  issue?: string | null;
}) {
  return (
    <div className="flex gap-3 rounded-lg border border-border p-3">
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded bg-muted/50">
        {photo && (
          <OptimizedImage src={photo} alt={name} className="h-full w-full object-cover" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        <p className="mt-1 text-sm font-semibold">{price}</p>
        {meta && <div className="text-xs text-muted-foreground">{meta}</div>}
        {issue && <p className="mt-1 text-xs text-destructive">{issue}</p>}
      </div>

      <div className="flex shrink-0 items-start gap-1">
        <Button
          variant="outline"
          size="icon-xs"
          onClick={onDecrease}
          aria-label={atMinimum ? `Remove ${name}` : "One fewer"}
        >
          {atMinimum ? <Trash2 className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
        </Button>
        <span className="w-6 text-center text-sm tabular-nums">{quantity}</span>
        <Button
          variant="outline"
          size="icon-xs"
          disabled={!canIncrease}
          onClick={onIncrease}
          aria-label="One more"
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

/**
 * The money at the foot of a cart.
 *
 * Rows in, total last. A gym's basket shows only a subtotal because the server
 * prices coupons and coins at the next step; the platform shop shows GST as its
 * own line. Both are the same list with different entries, which is why this
 * takes rows rather than named props.
 */
export function CartSummary({
  rows,
  footnote,
  children,
}: {
  rows: { label: string; value: string; strong?: boolean }[];
  footnote?: React.ReactNode;
  /** The buttons that leave the cart. */
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1 rounded-md border p-3 text-sm">
        {rows.map((row) => (
          <div
            key={row.label}
            className={`flex justify-between ${row.strong ? "font-semibold" : ""}`}
          >
            <span className={row.strong ? "" : "text-muted-foreground"}>{row.label}</span>
            <span className="tabular-nums">{row.value}</span>
          </div>
        ))}
      </div>

      {footnote && <p className="text-xs text-muted-foreground">{footnote}</p>}
      {children}
    </div>
  );
}
