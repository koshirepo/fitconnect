/**
 * Documentation: Single headline figure with an icon and optional caption.
 *
 * - The tile used across dashboard and reporting screens: one number, what it
 *   counts, and a line of context under it.
 * - `color` styles the value alone, so a screen can mark money green or an
 *   at-risk count red without restyling the rest of the tile.
 * - Sized to sit two-up on a phone. Every figure here is short — a count or an
 *   amount — so the tile scales its type down rather than its column count,
 *   which is what let four of these fill a phone screen before any content.
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
      <CardContent>
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="shrink-0 rounded-lg bg-muted p-2 sm:p-2.5">
            <Icon className="size-4 text-muted-foreground sm:size-5" />
          </div>
          <div className="min-w-0 flex-1">
            {/* Two lines rather than one, because these labels are phrases, not
                words: "Waiting to hand over" truncated to "Waiting to hand…" on
                a 375px screen loses the only part that says what the number is
                for. The value and subtext below stay on one line — those are
                short by construction. */}
            <p className="line-clamp-2 text-[11px] leading-tight text-muted-foreground sm:text-xs sm:text-balance">
              {label}
            </p>
            <p className={cn("truncate text-lg font-bold tabular-nums sm:text-xl", color)}>
              {value}
            </p>
            {subtext && (
              <p className="truncate text-[10px] text-muted-foreground sm:text-xs">{subtext}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
