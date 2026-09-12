/**
 * Documentation: Picking the day a new term begins, against what the member has already done.
 *
 * - A start date is a judgement, not a field. The desk is deciding whether somebody who stopped coming in July and turned up today should be charged from today or from where their last term ran out, and that judgement needs the two facts this calendar draws: which days they were already paid up for, and which days they actually walked in.
 * - Cover is shaded, attendance is a dot, and the two overlap freely — a member training on days nobody was charging for is precisely the case worth seeing before the date is chosen.
 * - Days already covered can still be picked. Renewing early is ordinary, and the server stacks the new term on the cover that remains; refusing the click would only send the desk to a different screen to check.
 * - Only staff reach this. It sits inside the record-payment form, which is behind `payments:create`.
 * - Primary exports: StartDateCalendar.
 */
import * as React from "react";
import { useMemberAttendanceCalendar } from "@/api/queries/attendance";
import { useMembershipCoverage } from "@/api/queries/members";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMonthLabel, parseMonth, shiftMonth } from "@/lib/month";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { coveredDays, localDayKey as dayKey } from "@/lib/coverage-days";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function StartDateCalendar({
  membershipId,
  value,
  onChange,
}: {
  membershipId: string;
  /** The chosen start, "YYYY-MM-DD". Empty until the desk picks one. */
  value: string;
  onChange: (day: string) => void;
}) {
  const today = dayKey(new Date());
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

  const attendance = useMemberAttendanceCalendar(membershipId, month);
  const coverage = useMembershipCoverage(membershipId);

  const attended = React.useMemo(
    () => new Set(attendance.data?.dates ?? []),
    [attendance.data],
  );
  const covered = React.useMemo(
    () => coveredDays(coverage.data?.terms ?? []),
    [coverage.data],
  );

  const cells = React.useMemo(() => {
    const first = parseMonth(month);
    const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    // Monday-first, matching the attendance calendar on the member's page.
    const lead = (first.getDay() + 6) % 7;

    const pad = Array.from({ length: lead }, (_, i) => ({
      key: `pad-${i}`,
      day: null as string | null,
      label: 0,
    }));
    const days = Array.from({ length: daysInMonth }, (_, i) => {
      const day = `${month}-${String(i + 1).padStart(2, "0")}`;
      return { key: day, day: day as string | null, label: i + 1 };
    });

    return [...pad, ...days];
  }, [month]);

  const loading = attendance.isLoading || coverage.isLoading;

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

      <div className="p-2">
        <div className="grid grid-cols-7">
          {WEEKDAYS.map((weekday) => (
            <div
              key={weekday}
              className="py-1 text-center text-[10px] font-medium text-muted-foreground"
            >
              {weekday}
            </div>
          ))}

          {cells.map((cell) => {
            if (!cell.day) return <div key={cell.key} />;

            const isCovered = covered.has(cell.day);
            const isAttended = attended.has(cell.day);
            const isChosen = cell.day === value;
            const isToday = cell.day === today;

            return (
              <button
                key={cell.key}
                type="button"
                onClick={() => onChange(cell.day!)}
                aria-pressed={isChosen}
                aria-label={[
                  cell.day,
                  isCovered ? "covered by a term" : "no cover",
                  isAttended ? "attended" : null,
                ]
                  .filter(Boolean)
                  .join(", ")}
                className={cn(
                  "relative flex h-9 flex-col items-center justify-center rounded-md text-xs transition-colors",
                  // Cover is the background, so a run of paid days reads as a
                  // block rather than as thirty separate badges.
                  isCovered && "bg-emerald-500/15 text-emerald-900 dark:text-emerald-200",
                  !isCovered && "text-foreground",
                  isToday && !isChosen && "ring-1 ring-inset ring-primary/50",
                  isChosen
                    ? "bg-primary font-semibold text-primary-foreground"
                    : "hover:bg-accent",
                )}
              >
                {cell.label}
                {/* A dot rather than another fill: attendance and cover land on
                    the same day constantly, and two backgrounds cannot both
                    show. */}
                {isAttended && (
                  <span
                    className={cn(
                      "absolute bottom-1 h-1 w-1 rounded-full",
                      isChosen ? "bg-primary-foreground" : "bg-sky-500",
                    )}
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/40" />
            Already covered
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
            Attended
          </span>
          {loading && <span>Loading…</span>}
          {/* Spelled out as well as highlighted: the grid shows one month, and
              a term starting in the next one is a click away from being read
              wrong. */}
          {value && (
            <span className="ml-auto font-medium text-foreground">
              Starting{" "}
              {new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
