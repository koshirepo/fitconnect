/**
 * Documentation: How many of something, on a variant row or a cart line.
 *
 * - Minus, a number you can type into, plus. The typable middle is the point: setting a quantity of 12 by pressing `+` eleven times is what a text box is for, and both storefronts previously offered only steppers or only a field, never both.
 * - Clamps on the way out, not on the way in. A half-typed "1" while somebody means "12" must not be corrected to the minimum under their cursor, so the raw text is kept while focused and reconciled on blur or Enter.
 * - At the minimum the decrease becomes a bin, because going below it is removal and a disabled button with no way out is a dead end.
 * - Refuses to exceed stock or the per-order maximum, and says which of the two stopped it — "only 3 left" and "limit 5 per order" are different problems for the person reading them.
 * - Presentational: it reports a number and never touches a cart. What that number means is the caller's business, which is what lets a gym basket and a shipping cart share it.
 * - Primary exports: QuantityStepper.
 */
import * as React from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function QuantityStepper({
  quantity,
  onChange,
  min = 1,
  max,
  stock,
  disabled = false,
  removable = true,
  label = "Quantity",
  className,
}: {
  quantity: number;
  /** Called with the settled value. Zero means remove. */
  onChange: (quantity: number) => void;
  min?: number;
  /** Per-order limit, where the surface has one. */
  max?: number;
  /** What is actually left. The lower of this and `max` wins. */
  stock?: number;
  disabled?: boolean;
  /** False where a line cannot be removed from here, so minus just stops. */
  removable?: boolean;
  label?: string;
  className?: string;
}) {
  // What the field shows while it has focus. Null means "show the real value".
  const [draft, setDraft] = React.useState<string | null>(null);

  const ceiling = Math.min(max ?? Number.POSITIVE_INFINITY, stock ?? Number.POSITIVE_INFINITY);
  const atCeiling = quantity >= ceiling;
  const atFloor = quantity <= min;

  const commit = (raw: string) => {
    setDraft(null);
    const parsed = Number.parseInt(raw, 10);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      // An empty or nonsense box means "take it out", not "set it to one".
      onChange(removable ? 0 : min);
      return;
    }

    onChange(Math.max(min, Math.min(parsed, ceiling)));
  };

  const step = (delta: number) => {
    const next = quantity + delta;
    if (next < min) {
      onChange(removable ? 0 : min);
      return;
    }
    onChange(Math.min(next, ceiling));
  };

  return (
    <div className={cn("flex shrink-0 items-center gap-1", className)}>
      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        disabled={disabled || (atFloor && !removable)}
        onClick={() => step(-1)}
        aria-label={atFloor && removable ? `Remove ${label}` : "One fewer"}
      >
        {atFloor && removable ? (
          <Trash2 className="h-3 w-3" />
        ) : (
          <Minus className="h-3 w-3" />
        )}
      </Button>

      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={label}
        disabled={disabled}
        value={draft ?? String(quantity)}
        onChange={(event) => setDraft(event.target.value.replace(/[^0-9]/g, ""))}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            setDraft(null);
            event.currentTarget.blur();
          }
        }}
        className="h-7 w-11 rounded-md border border-input bg-background text-center text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:opacity-50"
      />

      <Button
        type="button"
        variant="outline"
        size="icon-xs"
        disabled={disabled || atCeiling}
        onClick={() => step(1)}
        aria-label="One more"
      >
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  );
}
