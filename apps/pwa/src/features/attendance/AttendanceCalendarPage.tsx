import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { useAttendanceCalendar } from "@/api/queries/attendance";
import { getApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CardSkeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, CalendarDays, Users, List, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTenantDashboardPath } from "@/lib/subdomain";
import AvatarCard from "@/components/ui/avatarCard";

type DayData = {
  count: number;
  members: { id: string; memberId: number | null; name: string }[];
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getMonthStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function parseMonth(s: string): Date {
  const [y, m] = s.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

function formatMonthLabel(s: string) {
  const d = parseMonth(s);
  return d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
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
  const days = (calendarQuery.data?.days ?? {}) as Record<string, DayData>;
  const loading = calendarQuery.isLoading;
  const error = calendarQuery.isError ? getApiError(calendarQuery.error) : "";

  React.useEffect(() => {
    setSelectedDate(null);
  }, [currentMonth]);

  const goMonth = (delta: number) => {
    const d = parseMonth(currentMonth);
    d.setMonth(d.getMonth() + delta);
    setSearchParams({ month: getMonthStr(d) });
  };

  const isCurrentMonth = currentMonth === getMonthStr(today);

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

  const selectedDayData = selectedDate ? days[selectedDate] : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Attendance Calendar</h1>
          <p className="text-muted-foreground">Monthly overview of gym visits</p>
        </div>
        <Button variant="outline" onClick={() => navigate(getTenantDashboardPath("/attendance"))}>
          <List className="h-4 w-4 mr-2" />
          Daily View
        </Button>
      </div>

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
            <div className="flex items-center justify-between mb-4">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => goMonth(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-center">
                <h2 className="text-base font-semibold leading-tight">
                  {formatMonthLabel(currentMonth)}
                </h2>
                <div className="flex items-center justify-center gap-3 mt-1">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" />
                    {totalVisits} visit{totalVisits !== 1 ? "s" : ""}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <CalendarDays className="h-3 w-3" />
                    {activeDays} day{activeDays !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => goMonth(1)}
                disabled={isCurrentMonth}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

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

            {/* Selected day member list — inline */}
            {selectedDate && selectedDayData && (
              <div className="mt-4 pt-4 border-t">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm">
                    {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-IN", {
                      weekday: "long",
                      day: "numeric",
                      month: "short",
                    })}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {selectedDayData.count} member{selectedDayData.count !== 1 ? "s" : ""}
                    </span>
                  </h3>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setSelectedDate(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-1 overflow-y-auto -mx-1 px-1">
                  {selectedDayData.members.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className="flex w-full rounded-lg px-2.5 py-2 text-left hover:bg-muted/60 transition-colors"
                      onClick={() => navigate(getTenantDashboardPath(`/members/${m.id}`))}
                    >
                      <AvatarCard name={m.name} memberId={m.memberId ?? undefined} variant="sm" />
                    </button>
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
