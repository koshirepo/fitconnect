/**
 * Documentation: How a line reaches the buyer — collected, or delivered.
 *
 * - A gym's store is collected at the counter and the platform shop is couriered, so today every line in a given basket agrees with every other. The badge is per line regardless, because that is the honest shape: fulfilment is a property of the thing being bought, and a basket that ever mixes the two should say so without this needing rewriting.
 * - Words next to the icon, not an icon alone. A van and a shopfront are not universally legible, and "Delivered to you" is what somebody actually wants to know before they pay.
 * - Primary exports: FulfilmentBadge, type Fulfilment.
 */
import { Store, Truck } from "lucide-react";
import { cn } from "@/lib/utils";

export type Fulfilment = "PICKUP" | "DELIVERY";

const COPY: Record<Fulfilment, { label: string; hint: string }> = {
  PICKUP: { label: "Collect at the gym", hint: "Ready at the counter" },
  DELIVERY: { label: "Delivered to you", hint: "Shipped to your address" },
};

export function FulfilmentBadge({
  fulfilment,
  className,
  showHint = false,
}: {
  fulfilment: Fulfilment;
  className?: string;
  /** The second line, where there is room for it. */
  showHint?: boolean;
}) {
  const Icon = fulfilment === "PICKUP" ? Store : Truck;
  const copy = COPY[fulfilment];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground",
        className,
      )}
      title={copy.hint}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {copy.label}
      {showHint && <span className="text-muted-foreground/70">· {copy.hint}</span>}
    </span>
  );
}
