import { getMonthStr, parseMonth } from "@/lib/month";
import { PageHeader } from "@/components/ui/page-header";
import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { useAttendanceCalendar } from "@/api/queries/attendance";
import { getApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CardSkeleton } from "@/components/ui/skeleton";
import { MonthNav } from "@/components/ui/month-nav";
import { CalendarDays, Clock3, LogOut, Timer, Users, List, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTenantDashboardPath } from "@/lib/subdomain";
import AvatarCard from "@/components/ui/avatarCard";
import { SessionTimes } from "./SessionTimes";
import { sessionState as visitState, stayLabel, stayMinutes } from "./session";

/**
 * One day of the calendar, taken from the API client rather than restated.
 *
 * A hand-written copy of the response shape is a second source of truth: this
 * one silently kept its old three fields after the endpoint grew a photo and a
 * check-in time, and the cast below meant the compiler had nothing to object
 * to until CI ran a stricter config.
 */
type DayData = NonNullable<ReturnType<typeof useAttendanceCalendar>["data"]>["days"][string];

type Visit = DayData["members"][number];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * A day's visits under their shifts, each shift in the order it began.
 *
 * Visits outside every shift window come last: they are the exceptions — a
 * desk mark for a past day, a tap at an hour the gym did not roster.
 */
function groupByShift(visits: Visit[]) {
  const groups = new Map<string, { name: string; visits: Visit[] }>();
  for (const visit of [...visits].sort((a, b) => a.checkInAt.localeCompare(b.checkInAt))) {
    const key = visit.shiftId ?? "none";
    const group = groups.get(key) ?? { name: visit.shiftName ?? "Outside shift hours", visits: [] };
    group.visits.push(visit);
    groups.set(key, group);
  }
  const outside = groups.get("none");
  groups.delete("none");
  return [...groups.values(), ...(outside ? [outside] : [])];
}

export default function AttendanceCalendarPage() {
  const navigate = useAppNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const today = new Date();
  const currentMonth = searchParams.get("month") || getMonthStr(today);
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);

  // The month is part of the cache key, so paging back and forth reuses months
  // already fetched instead of refetching each time.
  const calendarQuery = useAttendanceCalendar(currentMonth);
  // Annotated, not cast: if the response shape drifts, this line fails to
  // compile instead of silently agreeing with a stale local type.
  const days: Record<string, DayData> = calendarQuery.data?.days ?? {};
  const loading = calendarQuery.isPending;
  const error = calendarQuery.isError ? getApiError(calendarQuery.error) : "";

  React.useEffect(() => {
    setSelectedDate(null);
  }, [currentMonth]);

  // Build calendar grid
  const monthDate = parseMonth(currentMonth);
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = (new Date(year, month, 1).getDay() + 6) % 7; // 0=Mon

  const calendarCells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) calendarCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) calendarCells.push(d);

  const totalVisits = Object.values(days).reduce((sum, d) => sum + d.count, 0);
  const activeDays = Object.keys(days).length;
  const maxCount = Math.max(1, ...Object.values(days).map((d) => d.count));

  // How long a visit lasts, across every visit this month that was tapped out.
  const completedStays = Object.values(days)
    .flatMap((d) => d.members)
    .map(stayMinutes)
    .filter((minutes): minutes is number => minutes !== null && minutes > 0);
  const averageStay = completedStays.length
    ? completedStays.reduce((sum, minutes) => sum + minutes, 0) / completedStays.length
    : null;

  const selectedDayData = selectedDate ? days[selectedDate] : null;
  const selectedIsToday = selectedDate === todayStr;
  const selectedVisits = selectedDayData?.members ?? [];
  const selectedStates = selectedVisits.map((visit) => visitState(visit, selectedIsToday));
  const selectedStays = selectedVisits
    .map(stayMinutes)
    .filter((minutes): minutes is number => minutes !== null && minutes > 0);
  const selectedPeople = new Set(selectedVisits.map((visit) => visit.id)).size;
  const insideCount = days[todayStr]
    ? days[todayStr].members.filter((visit) => visitState(visit, true) === "inside").length
    : 0;

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <PageHeader
        title="Attendance Calendar"
        description="Monthly overview of gym visits"
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => navigate(getTenantDashboardPath("/attendance"))}
            >
              <List className="h-4 w-4 mr-2" />
              Daily View
            </Button>
          </>
        }
      />

      {error && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {loading ? (
        <CardSkeleton />
      ) : (
        <Card>
          <CardContent className="p-4 sm:p-5">
            {/* Month nav + stats — single row */}
            <MonthNav
              month={currentMonth}
              onMonthChange={(next) => setSearchParams({ month: next })}
              className="mb-4"
            >
              <div className="mt-1 flex items-center justify-center gap-3">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="h-3 w-3" />
                  {totalVisits} visit{totalVisits !== 1 ? "s" : ""}
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <CalendarDays className="h-3 w-3" />
                  {activeDays} day{activeDays !== 1 ? "s" : ""}
                </span>
                {averageStay !== null && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Timer className="h-3 w-3" />
                    {stayLabel(averageStay)} avg stay
                  </span>
                )}
                {insideCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedDate(todayStr)}
                    className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400"
                  >
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                    </span>
                    {insideCount} in the gym now
                  </button>
                )}
              </div>
            </MonthNav>

            {/* Weekday headers */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEKDAYS.map((wd) => (
                <div
                  key={wd}
                  className="text-center text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider py-1"
                >
                  {wd}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {calendarCells.map((day, idx) => {
                if (day === null) return <div key={`empty-${idx}`} />;

                const dateStr = `${currentMonth}-${String(day).padStart(2, "0")}`;
                const data = days[dateStr];
                const count = data?.count ?? 0;
                const isToday = dateStr === todayStr;
                const isSelected = dateStr === selectedDate;
                const intensity = count > 0 ? Math.max(0.2, count / maxCount) : 0;

                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => count > 0 && setSelectedDate(isSelected ? null : dateStr)}
                    className={cn(
                      "relative flex flex-col items-center justify-center rounded-lg min-h-11 transition-all text-sm",
                      count > 0 && "cursor-pointer hover:scale-105 active:scale-95",
                      count === 0 && "cursor-default",
                      isToday && !isSelected && "ring-2 ring-primary",
                      isSelected && "ring-2 ring-primary shadow-sm scale-105",
                    )}
                    style={{
                      backgroundColor: isSelected
                        ? "hsl(var(--primary) / 0.15)"
                        : count > 0
                          ? `oklch(0.72 0.17 145 / ${intensity})`
                          : undefined,
                    }}
                  >
                    <span
                      className={cn(
                        "text-xs leading-none",
                        count > 0 && intensity > 0.5 ? "text-white font-semibold" : "font-medium",
                        count === 0 && "text-muted-foreground",
                        isToday && count === 0 && "text-primary font-semibold",
                        isSelected && "text-primary font-semibold",
                      )}
                    >
                      {day}
                    </span>
                    {count > 0 && (
                      <span
                        className={cn(
                          "text-[9px] font-bold leading-none mt-0.5",
                          intensity > 0.5 ? "text-white/90" : "text-foreground/70",
                          isSelected && "text-primary/80",
                        )}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Selected day: every visit, in and out, under its shift. */}
            {selectedDate && selectedDayData && (
              <div className="mt-4 pt-4 border-t">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0 space-y-2">
                    <h3 className="font-semibold text-sm">
                      {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-IN", {
                        weekday: "long",
                        day: "numeric",
                        month: "short",
                      })}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {selectedDayData.count} visit{selectedDayData.count !== 1 ? "s" : ""}
                        {selectedPeople !== selectedDayData.count
                          ? ` · ${selectedPeople} member${selectedPeople !== 1 ? "s" : ""}`
                          : ""}
                      </span>
                    </h3>
                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                        <LogOut className="h-3 w-3" />
                        {selectedStates.filter((state) => state === "out").length} checked out
                      </span>
                      {selectedStates.includes("inside") && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-700 dark:text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          {selectedStates.filter((state) => state === "inside").length} still inside
                        </span>
                      )}
                      {selectedStates.includes("no-checkout") && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-400">
                          {selectedStates.filter((state) => state === "no-checkout").length} no check-out
                        </span>
                      )}
                      {selectedStays.length > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                          <Timer className="h-3 w-3" />
                          {stayLabel(
                            selectedStays.reduce((sum, minutes) => sum + minutes, 0) /
                              selectedStays.length,
                          )}{" "}
                          avg stay
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => setSelectedDate(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-4">
                  {groupByShift(selectedVisits).map((group) => (
                    <section key={group.name} className="space-y-1">
                      <h4 className="flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        <Clock3 className="h-3 w-3" />
                        {group.name}
                        <span className="font-normal normal-case tracking-normal">
                          · {group.visits.length}
                        </span>
                      </h4>
                      {group.visits.map((visit) => {
                        return (
                          <button
                            key={`${visit.id}:${visit.checkInAt}`}
                            type="button"
                            className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-muted/60 transition-colors"
                            onClick={() => navigate(getTenantDashboardPath(`/members/${visit.id}`))}
                          >
                            <AvatarCard
                              name={visit.name}
                              avatarUrl={visit.avatarUrl}
                              memberId={visit.memberId ?? undefined}
                              variant="sm"
                              wrapName
                              className="min-w-0 flex-1"
                            />
                            <SessionTimes session={visit} isToday={selectedIsToday} />
                          </button>
                        );
                      })}
                    </section>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
