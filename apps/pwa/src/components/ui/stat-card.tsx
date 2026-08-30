/**
 * Documentation: Single headline figure with an icon and optional caption.
 *
 * - The tile used across dashboard and reporting screens: one number, what it
 *   counts, and a line of context under it.
 * - `color` styles the value alone, so a screen can mark money green or an
 *   at-risk count red without restyling the rest of the tile.
 *
 * Primary exports: StatCard.
 */
import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type StatCardProps = {
  icon: React.ElementType;
  label: string;
  value: string | number;
  /** Context under the value, e.g. "12 completed". */
  subtext?: string;
  /** Tailwind text colour for the value. */
  color?: string;
  /**
   * Makes the whole tile a button.
   *
   * A figure that names a subset of what is on screen invites a click, so a
   * tile that has somewhere to go should look and behave like it does — and one
   * that does not should stay a plain card rather than a dead target.
   */
  onClick?: () => void;
  /** Marks the tile as the filter currently applied. */
  active?: boolean;
  className?: string;
};

export function StatCard({
  icon: Icon,
  label,
  value,
  subtext,
  color = "text-foreground",
  onClick,
  active,
  className,
}: StatCardProps) {
  return (
    <Card
      {...(onClick
        ? {
            role: "button",
            tabIndex: 0,
            "aria-pressed": Boolean(active),
            onClick,
            onKeyDown: (event: React.KeyboardEvent) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick();
              }
            },
          }
        : {})}
      className={cn(
        onClick &&
          "cursor-pointer transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        active && "border-primary bg-primary/5",
        className,
      )}
    >
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-muted p-2.5">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground truncate">{label}</p>
            <p className={`text-xl font-bold ${color}`}>{value}</p>
            {subtext && <p className="text-xs text-muted-foreground">{subtext}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
