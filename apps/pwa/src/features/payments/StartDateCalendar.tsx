/**
 * Documentation: Picking the day a new term begins, against what the member has already done.
 *
 * - A start date is a judgement, not a field. The desk is deciding whether somebody who stopped coming in July and turned up today should be charged from today or from where their last term ran out, and that judgement needs two facts: which days they were already paid up for, and which days they actually walked in.
 * - The grid itself is `CoverageCalendar`, the same component the member's own page draws. Same colours, same cells, same legend — a member's August has to look the same here as it does one click away, or the desk has two pictures of one month and no way to tell which is right.
 * - Days already covered can still be picked. Renewing early is ordinary, and the server stacks the new term on the cover that remains; refusing the click would only send the desk to another screen to check.
 * - Only staff reach this. It sits inside the record-payment form, which is behind `payments:create`.
 * - Primary exports: StartDateCalendar.
 */
import * as React from "react";
import { CoverageCalendar } from "@/components/members/coverage-calendar";
import { Button } from "@/components/ui/button";
import { formatMonthLabel, shiftMonth } from "@/lib/month";
import { localDayKey } from "@/lib/coverage-days";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** "12 Sept 2026", the way the rest of the app writes a date. */
function longDay(day: string) {
  return new Date(`${day}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function StartDateCalendar({
  membershipId,
  value,
  endDate,
  onChange,
}: {
  membershipId: string;
  /** The chosen start, "YYYY-MM-DD". Empty until the desk picks one. */
  value: string;
  /** Where the plan runs to. Empty until a plan is chosen. */
  endDate?: string;
  onChange: (day: string) => void;
}) {
  const today = localDayKey(new Date());
  // Opens on the month of the chosen day, so reopening the picker lands where
  // the desk left it rather than back on today.
  const [month, setMonth] = React.useState(() => (value || today).slice(0, 7));

  /**
   * Follow the date when something else sets it.
   *
   * Choosing a plan prefills the start from where the member's cover runs out,
   * which is regularly in a later month than the one on screen — and the grid
   * then sat on September with nothing highlighted while the form had quietly
   * picked the ninth of October. Jumping to the month makes the chosen day
   * visible, which is the only way the desk can tell it is right.
   */
  const shown = React.useRef(value);
  React.useEffect(() => {
    if (!value || value === shown.current) return;
    shown.current = value;
    setMonth(value.slice(0, 7));
  }, [value]);

  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between border-b px-2 py-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setMonth(shiftMonth(month, -1))}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium">{formatMonthLabel(month)}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setMonth(shiftMonth(month, 1))}
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <CoverageCalendar
        membershipId={membershipId}
        month={month}
        selectedDay={value}
        onSelectDay={onChange}
        pendingRange={value && endDate ? { from: value, to: endDate } : null}
        className="p-3"
      />

      {/* Spelled out as well as drawn: a three-month term crosses months the
          grid is not showing, so the span has to be readable without paging. */}
      {value && (
        <p className="border-t px-3 py-2 text-xs">
          <span className="font-medium">{longDay(value)}</span>
          {endDate ? (
            <>
              {" → "}
              <span className="font-medium">{longDay(endDate)}</span>
            </>
          ) : (
            <span className="text-muted-foreground"> — choose a plan for the end date</span>
          )}
        </p>
      )}
    </div>
  );
}
