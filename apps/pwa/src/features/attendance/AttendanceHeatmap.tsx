/**
 * Documentation: When the floor is busy.
 *
 * - Reads `GET /tenants/:id/attendance/heatmap` and draws a week of local hours, so a gym can roster its desk and its coaches against the hours it actually fills rather than from memory.
 * - Two readings of the same visits. "In the gym" spreads each visit from its check-in to its check-out and shows the average headcount per hour — how full the floor actually is, which stays high for an hour after a rush of arrivals. "Arrivals" counts check-ins per hour, which is when the desk is busy. The first is the default, because it is the question a gym is usually asking.
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
import { CalendarClock, Clock3, Hand, LogIn, Sunrise, Timer, Users } from "lucide-react";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Windows worth comparing: this month's shape, this week's, or a quarter's. */
const WINDOWS = [1, 4, 12] as const;

type Mode = "occupancy" | "arrivals";

/** "6am", "12pm", "7pm" — the way a gym says an hour out loud. */
function hourLabel(hour: number) {
  if (hour === 0) return "12am";
  if (hour === 12) return "12pm";
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

/** "1h 12m", "45m". */
function stayLabel(minutes: number | null | undefined) {
  if (minutes == null) return "—";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h${rest ? ` ${rest}m` : ""}` : `${rest}m`;
}

/** Whole numbers stay whole; averages get one decimal. */
function amount(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * Five steps rather than a continuous ramp.
 *
 * A smooth gradient looks better and reads worse: nobody can tell 0.31 from
 * 0.38 opacity, so a continuous scale is a picture of the data rather than
 * something you can answer a question from. Five bands can be counted off
 * against the key.
 */
function intensityClass(value: number, ceiling: number) {
  if (value === 0) return "bg-muted/40";
  const share = Math.min(value / ceiling, 1);
  if (share > 0.75) return "bg-primary";
  if (share > 0.5) return "bg-primary/75";
  if (share > 0.25) return "bg-primary/50";
  return "bg-primary/25";
}

/**
 * The value the darkest shade means, which is not the largest value.
 *
 * Scaling to the maximum lets one freak cell decide the whole chart. A gym that
 * ran a free trial morning, or whose reader uploaded a backlog in one burst,
 * gets a single black square and 160 identical pale ones. This takes the 95th
 * percentile of the hours anybody trained in instead, so the shading describes
 * the ordinary week and anything above simply saturates.
 */
function shadingCeiling(cells: number[]) {
  const busy = cells.filter((cell) => cell > 0).sort((a, b) => a - b);
  if (busy.length === 0) return 1;
  return busy[Math.min(busy.length - 1, Math.floor(busy.length * 0.95))]!;
}

export function AttendanceHeatmap() {
  const [weeks, setWeeks] = React.useState<number>(4);
  const [mode, setMode] = React.useState<Mode>("occupancy");
  const query = useAttendanceHeatmap(weeks);

  const summary = query.data?.summary;
  const occupancy = query.data?.occupancy;
  // A server older than the occupancy grid answers without it; arrivals still work.
  const showingOccupancy = mode === "occupancy" && Boolean(occupancy);
  const grid = showingOccupancy ? occupancy?.grid : query.data?.grid;

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
      let columnHasValue = false;
      for (let day = 0; day < 7; day += 1) {
        const value = grid[day]?.[hour] ?? 0;
        cells.push(value);
        if (value > 0) columnHasValue = true;
        if (value > highest) highest = value;
      }
      if (columnHasValue) {
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

  const hasData = showingOccupancy ? (occupancy?.sessions ?? 0) > 0 : (summary?.total ?? 0) > 0;

  const describeCell = (label: string, hour: number, value: number) =>
    showingOccupancy
      ? `${label} ${hourLabel(hour)} — ${amount(value)} ${value === 1 ? "person" : "people"} inside on average`
      : `${label} ${hourLabel(hour)} — ${value} ${value === 1 ? "check-in" : "check-ins"}`;

  return (
    <div className="space-y-4">
      {showingOccupancy ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard
            icon={Sunrise}
            label="Fullest hour"
            value={
              occupancy?.peakHour == null || occupancy.peakDay == null
                ? "—"
                : `${DAY_LABELS[occupancy.peakDay]} ${hourLabel(occupancy.peakHour)}`
            }
            subtext="On an average week"
          />
          <StatCard
            icon={Users}
            label="Peak crowd"
            value={occupancy && occupancy.peak > 0 ? amount(occupancy.peak) : "—"}
            subtext="People inside at once"
          />
          <StatCard
            icon={Timer}
            label="Average stay"
            value={stayLabel(occupancy?.averageStayMinutes)}
            subtext={`${occupancy?.sessions ?? 0} visits with a check-out`}
            className="col-span-2 sm:col-span-1"
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard
            icon={Sunrise}
            label="Busiest hour"
            value={summary?.busiestHour == null ? "—" : hourLabel(summary.busiestHour)}
            subtext="Across the whole window"
          />
          <StatCard
            icon={CalendarClock}
            label="Busiest day"
            value={summary?.busiestDay == null ? "—" : DAY_LABELS[summary.busiestDay]!}
            subtext="By total check-ins"
          />
          <StatCard
            icon={LogIn}
            label="Check-ins"
            value={summary?.total ?? "—"}
            subtext={`Over ${weeks} ${weeks === 1 ? "week" : "weeks"}`}
            className="col-span-2 sm:col-span-1"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Which question the chart answers. */}
        <div className="inline-flex overflow-hidden rounded-lg border border-border" role="group">
          {(
            [
              { value: "occupancy", label: "In the gym", icon: Users },
              { value: "arrivals", label: "Arrivals", icon: LogIn },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setMode(option.value)}
              aria-pressed={mode === option.value}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors",
                mode === option.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted",
              )}
            >
              <option.icon className="h-3.5 w-3.5" />
              {option.label}
            </button>
          ))}
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
      {query.isSuccess && !hasData && (
        <EmptyState
          icon={Clock3}
          title={showingOccupancy ? "No completed visits to chart" : "No self check-ins to chart"}
          description={
            summary && summary.manualMarks > 0 && summary.total === 0
              ? `All ${summary.manualMarks} visits in this window were marked by staff at the desk, which records when the button was pressed rather than when the member arrived. Members checking themselves in — at the QR poster or a card reader — is what fills this in.`
              : showingOccupancy
                ? "How full the gym was needs visits with a check-out. Members tapping out at the reader or the QR poster is what fills this in; arrivals are still charted."
                : "Nobody has checked in over this window."
          }
        />
      )}

      {hasData && grid && (
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
                      const value = grid[day]?.[hour] ?? 0;
                      return (
                        <div key={hour} className="w-7 shrink-0 p-0.5">
                          <div
                            className={cn("h-6 rounded-sm", intensityClass(value, ceiling))}
                            title={describeCell(label, hour, value)}
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
                Busy ({amount(ceiling)}+{showingOccupancy ? " people" : ""}
                {peak > ceiling ? `, one hour reached ${amount(peak)}` : ""})
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
              {showingOccupancy &&
                " Each visit counts for every hour between its check-in and check-out, averaged over the weeks shown."}
            </p>
            {showingOccupancy && occupancy && occupancy.withoutCheckout > 0 && (
              <p className="flex items-start gap-1.5">
                <Timer className="mt-0.5 size-3 shrink-0" />
                <span>
                  {occupancy.withoutCheckout} visit{occupancy.withoutCheckout === 1 ? " has" : "s have"}{" "}
                  no check-out and {occupancy.withoutCheckout === 1 ? "is" : "are"} left out: without
                  a tap out there is no telling how long somebody stayed, and a guess would put
                  people on the floor who had gone home.
                </span>
              </p>
            )}
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
