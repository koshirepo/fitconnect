/**
 * Documentation: When the floor is busy.
 *
 * - Reads `GET /tenants/:id/attendance/heatmap` and draws a week of local hours, so a gym can roster its desk and its coaches against the hours it actually fills rather than from memory.
 * - Built as a grid of cells rather than with the chart library: recharts has no heatmap, and pulling it in for a table of coloured squares would put a chart bundle behind a tab that does not otherwise need one.
 * - Empty hours are dropped from both ends. A gym open 05:00–23:00 spends a third of the chart's width proving nobody trains at 3am, and on a phone that is the third that pushes the evening rush off-screen.
 * - Primary exports: AttendanceHeatmap.
 */
import * as React from "react";
import { useAttendanceHeatmap } from "@/api/queries/attendance";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { cn } from "@/lib/utils";
import { CalendarClock, Clock3, Hand, Sunrise, Users } from "lucide-react";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Windows worth comparing: this month's shape, this week's, or a quarter's. */
const WINDOWS = [1, 4, 12] as const;

/** "6am", "12pm", "7pm" — the way a gym says an hour out loud. */
function hourLabel(hour: number) {
  if (hour === 0) return "12am";
  if (hour === 12) return "12pm";
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

/**
 * Five steps rather than a continuous ramp.
 *
 * A smooth gradient looks better and reads worse: nobody can tell 0.31 from
 * 0.38 opacity, so a continuous scale is a picture of the data rather than
 * something you can answer a question from. Five bands can be counted off
 * against the key.
 */
function intensityClass(visits: number, ceiling: number) {
  if (visits === 0) return "bg-muted/40";
  const share = Math.min(visits / ceiling, 1);
  if (share > 0.75) return "bg-primary";
  if (share > 0.5) return "bg-primary/75";
  if (share > 0.25) return "bg-primary/50";
  return "bg-primary/25";
}

/**
 * The count the darkest shade means, which is not the largest count.
 *
 * Scaling to the maximum lets one freak cell decide the whole chart. A gym that
 * ran a free trial morning, or whose reader uploaded a backlog in one burst,
 * gets a single black square and 160 identical pale ones — the real difference
 * between a 6am rush and a dead Tuesday afternoon disappears under the outlier.
 * This takes the 95th percentile of the hours anybody trained in instead, so
 * the shading describes the ordinary week and anything above simply saturates.
 */
function shadingCeiling(cells: number[]) {
  const busy = cells.filter((cell) => cell > 0).sort((a, b) => a - b);
  if (busy.length === 0) return 1;
  return busy[Math.min(busy.length - 1, Math.floor(busy.length * 0.95))]!;
}

export function AttendanceHeatmap() {
  const [weeks, setWeeks] = React.useState<number>(4);
  const query = useAttendanceHeatmap(weeks);

  const grid = query.data?.grid;
  const summary = query.data?.summary;

  /**
   * The hours worth drawing, and the busiest single cell to scale against.
   *
   * The peak is a cell rather than a column total: the question the colour
   * answers is "how full is the gym at this hour on this day", and scaling to a
   * day's total would flatten every cell against whichever day is busiest.
   */
  const { hours, ceiling, peak } = React.useMemo(() => {
    if (!grid) return { hours: [] as number[], ceiling: 1, peak: 0 };

    let first = 24;
    let last = -1;
    let highest = 0;
    const cells: number[] = [];
    for (let hour = 0; hour < 24; hour += 1) {
      let columnHasVisits = false;
      for (let day = 0; day < 7; day += 1) {
        const visits = grid[day]?.[hour] ?? 0;
        cells.push(visits);
        if (visits > 0) columnHasVisits = true;
        if (visits > highest) highest = visits;
      }
      if (columnHasVisits) {
        first = Math.min(first, hour);
        last = Math.max(last, hour);
      }
    }

    if (last < first) return { hours: [] as number[], ceiling: 1, peak: 0 };
    return {
      hours: Array.from({ length: last - first + 1 }, (_, i) => first + i),
      ceiling: shadingCeiling(cells),
      peak: highest,
    };
  }, [grid]);

  const hasVisits = (summary?.total ?? 0) > 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard
          icon={Sunrise}
          label="Busiest hour"
          value={summary?.busiestHour === null || summary?.busiestHour === undefined ? "—" : hourLabel(summary.busiestHour)}
          subtext="Across the whole window"
        />
        <StatCard
          icon={CalendarClock}
          label="Busiest day"
          value={
            summary?.busiestDay === null || summary?.busiestDay === undefined
              ? "—"
              : DAY_LABELS[summary.busiestDay]!
          }
          subtext="By total check-ins"
        />
        <StatCard
          icon={Users}
          label="Check-ins"
          value={summary?.total ?? "—"}
          subtext={`Over ${weeks} ${weeks === 1 ? "week" : "weeks"}`}
          className="col-span-2 sm:col-span-1"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Last</span>
        {WINDOWS.map((window) => (
          <Button
            key={window}
            variant={weeks === window ? "default" : "outline"}
            size="sm"
            onClick={() => setWeeks(window)}
          >
            {window} {window === 1 ? "week" : "weeks"}
          </Button>
        ))}
      </div>

      {!query.isSuccess && !query.isError && <Skeleton className="h-64 w-full" />}

      {query.isError && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          Could not load the busy hours.
        </div>
      )}

      {/* Gated on `isSuccess`, not on `!isLoading`. A query that has not run —
          no gym selected yet, so it is disabled rather than loading — is not
          loading either, and this branch would then tell the gym nobody has
          been in when nothing has actually been asked. */}
      {query.isSuccess && !hasVisits && (
        <EmptyState
          icon={Clock3}
          title="No self check-ins to chart"
          description={
            summary && summary.manualMarks > 0
              ? `All ${summary.manualMarks} visits in this window were marked by staff at the desk, which records when the button was pressed rather than when the member arrived. Members checking themselves in — at the QR poster or a card reader — is what fills this in.`
              : "Nobody has checked in over this window."
          }
        />
      )}

      {hasVisits && grid && (
        <Card className="overflow-hidden py-0">
          <CardContent className="p-3">
            {/* The grid can be wider than a phone. It scrolls inside its own
                box so the page never does. */}
            <div className="overflow-x-auto">
              <div className="min-w-max">
                <div className="flex">
                  <div className="w-9 shrink-0" />
                  {hours.map((hour) => (
                    <div
                      key={hour}
                      className="w-7 shrink-0 text-center text-[10px] tabular-nums text-muted-foreground"
                    >
                      {/* Every third hour, so the labels do not collide. */}
                      {hour % 3 === 0 ? hourLabel(hour).replace(/[ap]m/, "") : ""}
                    </div>
                  ))}
                </div>

                {DAY_LABELS.map((label, day) => (
                  <div key={label} className="flex items-center">
                    <div className="w-9 shrink-0 pr-1 text-right text-[11px] text-muted-foreground">
                      {label}
                    </div>
                    {hours.map((hour) => {
                      const visits = grid[day]?.[hour] ?? 0;
                      return (
                        <div key={hour} className="w-7 shrink-0 p-0.5">
                          <div
                            className={cn("h-6 rounded-sm", intensityClass(visits, ceiling))}
                            title={`${label} ${hourLabel(hour)} — ${visits} ${
                              visits === 1 ? "check-in" : "check-ins"
                            }`}
                          />
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
              <span>Quiet</span>
              {["bg-muted/40", "bg-primary/25", "bg-primary/50", "bg-primary/75", "bg-primary"].map(
                (tone) => (
                  <span key={tone} className={cn("h-3 w-4 rounded-sm", tone)} />
                ),
              )}
              <span>
                Busy ({ceiling}+{peak > ceiling ? `, one hour reached ${peak}` : ""})
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {summary && (
        <Card>
          <CardContent className="space-y-1 p-3 text-xs text-muted-foreground">
            <p>
              Hours are {summary.timezone} time, counted from self check-ins — the QR poster, the
              app, and the card readers.
            </p>
            {summary.manualMarks > 0 && (
              <p className="flex items-start gap-1.5">
                <Hand className="mt-0.5 size-3 shrink-0" />
                <span>
                  {summary.manualMarks} visit{summary.manualMarks === 1 ? " is" : "s are"} left out.
                  A visit marked at the desk records when staff pressed the button, not when the
                  member walked in, so counting it here would invent a rush at whatever hour the
                  paperwork gets done.
                </span>
              </p>
            )}
            {summary.unplaced > 0 && (
              <p className="text-amber-600">
                {summary.unplaced} check-in{summary.unplaced === 1 ? "" : "s"} could not be placed —
                &ldquo;{summary.timezone}&rdquo; is not a time zone this app recognises. Fix it in
                gym settings.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
