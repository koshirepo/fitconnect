/**
 * Documentation: One visit's times, as a right-aligned column.
 *
 * - "07:12 → 08:34" on top, and under it how long they stayed, that they are still in the gym, or that nobody checked them out.
 * - Used by the register, the calendar's day list and a member's own history, so all three say the same thing the same way.
 * - Primary exports: SessionTimes.
 */
import * as React from "react";
import { cn } from "@/lib/utils";
import { clockTime, sessionState, stayLabel, stayMinutes, type SessionLike } from "./session";

export function SessionTimes({
  session,
  isToday,
  className,
}: {
  session: SessionLike;
  /** Whether the visit is on today's date, which is the only day "inside" can be true. */
  isToday: boolean;
  className?: string;
}) {
  const state = sessionState(session, isToday);
  const minutes = stayMinutes(session);
  // Read once, when the row first renders: "in the gym · 34m" is a glance, not a
  // running clock, and the page refetches often enough to keep it honest.
  const [renderedAt] = React.useState(() => Date.now());

  return (
    <span className={cn("flex shrink-0 flex-col items-end gap-0.5 text-right", className)}>
      <span className="text-xs tabular-nums">
        {clockTime(session.checkInAt)}
        <span className="mx-1 text-muted-foreground">→</span>
        {session.checkOutAt ? (
          clockTime(session.checkOutAt)
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </span>

      {state === "out" && minutes !== null && (
        <span className="text-[11px] tabular-nums text-muted-foreground">{stayLabel(minutes)}</span>
      )}

      {state === "inside" && (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          In the gym · {stayLabel(Math.max(0, renderedAt - new Date(session.checkInAt).getTime()) / 60_000)}
        </span>
      )}

      {state === "no-checkout" && (
        <span
          className="text-[11px] text-amber-700 dark:text-amber-400"
          title="Nobody checked out, so how long they stayed is unknown."
        >
          No check-out
        </span>
      )}
    </span>
  );
}
