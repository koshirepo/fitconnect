/**
 * Documentation: One month of a member, showing when they came and when they were paid up.
 *
 * - Two screens ask the same question of the same member — the attendance calendar on their page, and the start-date picker when the desk sells them a term — and until this existed they answered it in two visual languages: solid fills on one, a faint wash and a blue dot on the other. Same member, same week, two pictures. Now there is one.
 * - The state worth spotting is amber: a day somebody trained on with no term behind it. A calendar that knows only who turned up cannot show it, and a calendar that knows only what was paid for cannot either.
 * - Selection is a ring, never a fill. The picker used to paint the chosen day in the accent colour, which hid whether that day was covered — the one thing the desk is choosing it against.
 * - Reads the same coverage endpoint the gaps card does, so no two views of a member's cover can disagree.
 * - Primary exports: CoverageCalendar.
 */
import * as React from "react";
import { useMemberAttendanceCalendar } from "@/api/queries/attendance";
import { useMembershipCoverage } from "@/api/queries/members";
import { coveredDays, localDayKey } from "@/lib/coverage-days";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CoverageCalendar({
  membershipId,
  month,
  /** Set when the day is the caller's business — the picker. Read-only without it. */
  selectedDay,
  onSelectDay,
  /**
   * A term being sold but not yet saved, drawn over the history.
   *
   * The desk picks a start and the plan decides the end, and until this was
   * drawn the only thing on screen was a ring around one day — leaving "how
   * long does this actually run, and does it overlap what they already have"
   * as arithmetic in somebody's head.
   */
  pendingRange,
  className,
}: {
  membershipId: string;
  /** "YYYY-MM". The caller owns it, because both screens put the nav in their own header. */
  month: string;
  selectedDay?: string;
  onSelectDay?: (day: string) => void;
  pendingRange?: { from: string; to: string } | null;
  className?: string;
}) {
  const attendanceQuery = useMemberAttendanceCalendar(membershipId, month);
  const coverageQuery = useMembershipCoverage(membershipId);

  const attended = React.useMemo(
    () => new Set(attendanceQuery.data?.dates ?? []),
    [attendanceQuery.data],
  );
  const covered = React.useMemo(
    () => coveredDays(coverageQuery.data?.terms ?? []),
    [coverageQuery.data],
  );

  const today = localDayKey(new Date());
  const selectable = typeof onSelectDay === "function";

  // Destructured so the memo depends on the two dates rather than the object,
  // which callers rebuild on every render.
  const pendingFrom = pendingRange?.from ?? "";
  const pendingTo = pendingRange?.to ?? "";

  // The same expansion the saved terms get, so the proposed term and the real
  // ones are measured the same way and a one-day disagreement is impossible.
  const pending = React.useMemo(
    () =>
      pendingFrom && pendingTo
        ? coveredDays([{ from: pendingFrom, to: pendingTo }])
        : new Set<string>(),
    [pendingFrom, pendingTo],
  );

  const cells = React.useMemo(() => {
    const first = new Date(`${month}-01T00:00:00`);
    const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    // Monday-first.
    const lead = (first.getDay() + 6) % 7;

    return [
      ...Array.from({ length: lead }, (_, i) => ({ key: `pad-${i}`, day: "", label: 0 })),
      ...Array.from({ length: daysInMonth }, (_, i) => {
        const day = `${month}-${String(i + 1).padStart(2, "0")}`;
        return { key: day, day, label: i + 1 };
      }),
    ];
  }, [month]);

  if (attendanceQuery.isLoading || coverageQuery.isLoading) {
    return (
      <div className={cn("flex justify-center py-6", className)}>
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((weekday) => (
          <div
            key={weekday}
            className="py-1 text-center text-xs font-medium text-muted-foreground"
          >
            {weekday}
          </div>
        ))}

        {cells.map((cell) => {
          if (!cell.day) return <div key={cell.key} />;

          const isAttended = attended.has(cell.day);
          const isCovered = covered.has(cell.day);
          const isToday = cell.day === today;
          const isSelected = cell.day === selectedDay;
          const isPending = pending.has(cell.day);

          const tone = cn(
            "relative flex min-h-10 flex-col items-center justify-center rounded-md p-1 text-sm transition-colors",
            // Came, and the gym was being paid for it: the ordinary case.
            isAttended && isCovered && "bg-emerald-500 font-medium text-white",
            // Came, and nobody was charging. The whole reason cover is drawn here.
            isAttended && !isCovered && "bg-amber-500 font-medium text-white",
            // Paid up but absent — a wash, so a term reads as a block behind
            // the days they actually turned up.
            !isAttended && isCovered && "bg-emerald-500/10 text-muted-foreground",
            !isAttended && !isCovered && "text-muted-foreground",
            isToday && !isSelected && "ring-2 ring-primary",
            // A ring, not a fill: the chosen day still has to show whether it
            // was covered, which is what it is being chosen against.
            isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
            selectable && "cursor-pointer hover:opacity-80",
          );

          const title = [
            isCovered ? "Covered" : "No cover",
            isAttended ? "attended" : null,
            isPending ? "in the new term" : null,
          ]
            .filter(Boolean)
            .join(" · ");

          /**
           * The proposed term as a bar under the day, not a fill.
           *
           * A fill would have to fight the four the cell already uses, and the
           * new term regularly lands on days that are covered or attended —
           * which is exactly when the reader needs to see both at once.
           */
          const body = (
            <>
              {cell.label}
              {isPending && (
                <span className="absolute inset-x-1 bottom-0.5 h-0.5 rounded-full bg-primary" />
              )}
            </>
          );

          if (!selectable) {
            return (
              <div key={cell.key} title={title} className={tone}>
                {body}
              </div>
            );
          }

          return (
            <button
              key={cell.key}
              type="button"
              title={title}
              aria-pressed={isSelected}
              aria-label={`${cell.day}, ${title.toLowerCase()}`}
              onClick={() => onSelectDay(cell.day)}
              className={tone}
            >
              {body}
            </button>
          );
        })}
      </div>

      {/* Three fills need naming. The amber one especially — nobody guesses it. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
          Attended
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />
          Attended, no paid term
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/20" />
          Covered, did not come
        </span>
        {/* Only named when there is one on screen — the member's own page
            sells nothing and has no bar to explain. */}
        {pending.size > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded-full bg-primary" />
            New term
          </span>
        )}
      </div>
    </div>
  );
}
