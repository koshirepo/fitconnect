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
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getTenantDashboardPath } from "@/lib/subdomain";
import AvatarCard from "@/components/ui/avatarCard";

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
  const days = calendarQuery.data?.days ?? {};
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
          <p className="text-muted-foreground">
            Every renewal nudge, expiry notice, and payment chase — by the day it went out.
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
            <div className="mb-4 flex justify-center gap-1">
              {CHANNEL_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setChannel(tab.value)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    channel === tab.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground",
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

                <div className="-mx-1 space-y-1 px-1">
                  {selectedReminders.map((reminder) => (
                    <button
                      key={reminder.id}
                      type="button"
                      className="flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted/60"
                      onClick={() =>
                        navigate(
                          getTenantDashboardPath(
                            `/reminders/${reminder.id}?month=${currentMonth}`,
                          ),
                        )
                      }
                    >
                      <div className="min-w-0 flex-1">
                        <AvatarCard
                          name={reminder.memberName}
                          memberId={reminder.memberId ?? undefined}
                          variant="sm"
                          className="min-w-0"
                        >
                          <p className="truncate text-xs text-muted-foreground">
                            {REASON_LABELS[reminder.reason] ?? reminder.reason}
                            {reminder.message ? ` — ${reminder.message}` : ""}
                          </p>
                        </AvatarCard>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                          {reminder.channel === "WHATSAPP" ? (
                            <MessageCircle className="h-3 w-3 text-emerald-600" />
                          ) : (
                            <Bell className="h-3 w-3 text-blue-600" />
                          )}
                          {formatTime(reminder.sentAt)}
                        </p>
                        {reminder.actorName && (
                          <p className="text-[10px] text-muted-foreground">
                            by {reminder.actorName}
                          </p>
                        )}
                        {reminder.settled && (
                          <p className="text-[10px] text-emerald-600">settled</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
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
