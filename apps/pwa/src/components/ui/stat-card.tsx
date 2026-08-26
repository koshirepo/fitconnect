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

export type StatCardProps = {
  icon: React.ElementType;
  label: string;
  value: string | number;
  /** Context under the value, e.g. "12 completed". */
  subtext?: string;
  /** Tailwind text colour for the value. */
  color?: string;
};

export function StatCard({
  icon: Icon,
  label,
  value,
  subtext,
  color = "text-foreground",
}: StatCardProps) {
  return (
    <Card>
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
