/**
 * Documentation: What the gym sent, to whom, and on which day.
 *
 * - A month grid over the reminder log: every push the nightly cron sent and every WhatsApp message staff sent by hand. Picking a day lists the messages that went out on it, newest first, and each row opens the member it was addressed to.
 * - Built on the same month/day shape as the attendance calendar, down to the `?month=` query parameter, so the two screens page alike and a link to a month survives being shared.
 * - The channel filter is the question people actually arrive with — "did we message them, or did the app?" — so it sits above the grid and recolours the day cells rather than hiding them.
 * - Primary exports: ReminderCalendarPage.
 */
import { getMonthStr, parseMonth, formatMonthLabel } from "@/lib/month";
import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { useReminderCalendar } from "@/api/queries/reminders";
import { getApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CardSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Bell,
  BellOff,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getTenantDashboardPath } from "@/lib/subdomain";
import { AvatarTile, PersonChip } from "@/components/ui/member-card";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** What each reminder was about, in the words the desk uses. */
const REASON_LABELS: Record<string, string> = {
  RENEWAL_DUE: "Renewal due",
  EXPIRED: "Membership expired",
  PENDING_PAYMENT: "Pending payment",
  SUSPENDED: "Marked inactive",
};

type ChannelFilter = "ALL" | "PUSH" | "WHATSAPP";

const CHANNEL_TABS: { value: ChannelFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "PUSH", label: "Push" },
  { value: "WHATSAPP", label: "WhatsApp" },
];

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

export default function ReminderCalendarPage() {
  const navigate = useAppNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const today = new Date();
  const currentMonth = searchParams.get("month") || getMonthStr(today);
  const todayStr = `${currentMonth === getMonthStr(today) ? currentMonth : getMonthStr(today)}-${String(
    today.getDate(),
  ).padStart(2, "0")}`;

  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);
  const [channel, setChannel] = React.useState<ChannelFilter>("ALL");

  const calendarQuery = useReminderCalendar(currentMonth);
  // Memoised so the `?? {}` fallback does not mint a fresh object every
  // render, which would re-run every hook below that depends on `days`.
  const days = React.useMemo(() => calendarQuery.data?.days ?? {}, [calendarQuery.data]);
  const loading = calendarQuery.isPending;
  const error = calendarQuery.isError ? getApiError(calendarQuery.error) : "";

  // A day that made sense in one month means nothing in the next.
  React.useEffect(() => {
    setSelectedDate(null);
  }, [currentMonth]);

  const goMonth = (delta: number) => {
    const d = parseMonth(currentMonth);
    d.setMonth(d.getMonth() + delta);
    setSearchParams({ month: getMonthStr(d) });
  };

  const isCurrentMonth = currentMonth === getMonthStr(today);

  /** The count a day cell shows, under the channel currently filtered to. */
  const countFor = React.useCallback(
    (dateStr: string) => {
      const day = days[dateStr];
      if (!day) return 0;
      if (channel === "PUSH") return day.push;
      if (channel === "WHATSAPP") return day.whatsapp;
      return day.count;
    },
    [channel, days],
  );

  const monthDate = parseMonth(currentMonth);
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = (new Date(year, month, 1).getDay() + 6) % 7; // 0 = Monday

  const calendarCells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i += 1) calendarCells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) calendarCells.push(d);

  const dayKeys = Object.keys(days);
  const monthTotal = dayKeys.reduce((sum, key) => sum + countFor(key), 0);
  const activeDays = dayKeys.filter((key) => countFor(key) > 0).length;
  const maxCount = Math.max(1, ...dayKeys.map((key) => countFor(key)));

  const selectedReminders = React.useMemo(() => {
    if (!selectedDate) return [];
    const day = days[selectedDate];
    if (!day) return [];
    return day.reminders
      .filter((reminder) => channel === "ALL" || reminder.channel === channel)
      .slice()
      .reverse();
  }, [channel, days, selectedDate]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reminders sent</h1>
          <p className="text-sm text-muted-foreground">
            Every nudge, notice, and payment chase — by the day it went out.
          </p>
        </div>
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
            {/* Month nav + what the month came to */}
            <div className="mb-4 flex items-center justify-between">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => goMonth(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-center">
                <h2 className="text-base font-semibold leading-tight">
                  {formatMonthLabel(currentMonth)}
                </h2>
                <div className="mt-1 flex items-center justify-center gap-3">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Bell className="h-3 w-3" />
                    {monthTotal} sent
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

            {/* Channel filter */}
            <div className="mx-auto mb-4 grid max-w-xs grid-cols-3 gap-1 rounded-lg bg-muted p-1">
              {CHANNEL_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setChannel(tab.value)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    channel === tab.value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="mb-1 grid grid-cols-7 gap-1">
              {WEEKDAYS.map((wd) => (
                <div
                  key={wd}
                  className="py-1 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70"
                >
                  {wd}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {calendarCells.map((day, idx) => {
                if (day === null) return <div key={`empty-${idx}`} />;

                const dateStr = `${currentMonth}-${String(day).padStart(2, "0")}`;
                const count = countFor(dateStr);
                const isToday = dateStr === todayStr;
                const isSelected = dateStr === selectedDate;
                const intensity = count > 0 ? Math.max(0.2, count / maxCount) : 0;

                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => count > 0 && setSelectedDate(isSelected ? null : dateStr)}
                    className={cn(
                      "relative flex min-h-11 flex-col items-center justify-center rounded-lg text-sm transition-all",
                      count > 0 ? "cursor-pointer hover:scale-105 active:scale-95" : "cursor-default",
                      isToday && !isSelected && "ring-2 ring-primary",
                      isSelected && "scale-105 shadow-sm ring-2 ring-primary",
                    )}
                    style={{
                      backgroundColor: isSelected
                        ? "hsl(var(--primary) / 0.15)"
                        : count > 0
                          ? `oklch(0.72 0.15 250 / ${intensity})`
                          : undefined,
                    }}
                  >
                    <span
                      className={cn(
                        "text-xs leading-none",
                        count > 0 && intensity > 0.5 ? "font-semibold text-white" : "font-medium",
                        count === 0 && "text-muted-foreground",
                        isToday && count === 0 && "font-semibold text-primary",
                        isSelected && "font-semibold text-primary",
                      )}
                    >
                      {day}
                    </span>
                    {count > 0 && (
                      <span
                        className={cn(
                          "mt-0.5 text-[9px] font-bold leading-none",
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

            {/* Who heard from the gym that day */}
            {selectedDate && (
              <div className="mt-4 border-t pt-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold">
                    {new Date(`${selectedDate}T00:00:00`).toLocaleDateString("en-IN", {
                      weekday: "long",
                      day: "numeric",
                      month: "short",
                    })}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {selectedReminders.length} sent
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

                {/* Three lines per message, in the order they are read: what it
                    was and when it went, then who it went to, then what it said.
                    Each line truncates on its own rather than wrapping, which is
                    what made this list unscannable on a phone. */}
                <ul className="-mx-1 divide-y divide-border/60 px-1">
                  {selectedReminders.map((reminder) => (
                    <li key={reminder.id}>
                      <button
                        type="button"
                        className="flex w-full items-start gap-3 rounded-lg py-2.5 text-left transition-colors hover:bg-muted/60"
                        onClick={() =>
                          navigate(
                            getTenantDashboardPath(
                              `/reminders/${reminder.id}?month=${currentMonth}`,
                            ),
                          )
                        }
                      >
                        <AvatarTile
                          person={{
                            name: reminder.memberName,
                            avatarUrl: reminder.memberAvatarUrl,
                          }}
                          size="sm"
                          stacked
                          className="h-10 w-10 rounded-lg"
                        />

                        <div className="min-w-0 flex-1">
                          {/* What it was and when it went — the two things being
                              scanned for, on the line the eye lands on first. */}
                          <div className="flex min-w-0 items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-1">
                              <PersonChip
                                icon={reminder.channel === "WHATSAPP" ? MessageCircle : Bell}
                                className={
                                  reminder.channel === "WHATSAPP"
                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                    : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                }
                              >
                                {REASON_LABELS[reminder.reason] ?? reminder.reason}
                              </PersonChip>
                              {reminder.settled && (
                                <PersonChip
                                  icon={CheckCircle2}
                                  className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                >
                                  Settled
                                </PersonChip>
                              )}
                            </div>
                            <span className="shrink-0 text-[11px] whitespace-nowrap tabular-nums text-muted-foreground">
                              {formatTime(reminder.sentAt)}
                            </span>
                          </div>

                          <p className="mt-1 truncate text-sm font-medium">
                            {reminder.memberId !== null && (
                              <span className="text-muted-foreground">#{reminder.memberId} </span>
                            )}
                            {reminder.memberName}
                          </p>

                          {(reminder.actorName || reminder.message) && (
                            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                              {reminder.actorName ? `by ${reminder.actorName}` : ""}
                              {reminder.actorName && reminder.message ? " · " : ""}
                              {reminder.message ?? ""}
                            </p>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {monthTotal === 0 && (
              <div className="mt-4 border-t pt-4">
                <EmptyState
                  icon={BellOff}
                  title="Nothing went out this month"
                  description="Reminders appear here as the nightly job sends them, and as staff send WhatsApp messages from a member's page."
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
