import { SessionTimes } from "./SessionTimes";
import { sessionState } from "./session";
import { getMonthStr, parseMonth, formatMonthLabel } from "@/lib/month";
import { PageHeader } from "@/components/ui/page-header";
import * as React from "react";
import { usePermissions } from "@/features/auth/permission-gate";
import { Permission } from "@fitconnect/shared/types/permissions";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { useAuthStore } from "@/stores/auth";
import {
  useAttendanceByDateInfinite,
  useAttendanceDevices,
  useMarkAllAttendance,
  useMemberAttendanceCalendar,
  useMemberAttendanceInfinite,
  useRemoveAttendance,
  useSelfCheckIn,
} from "@/api/queries/attendance";
import { useAllMembers } from "@/api/queries/members";
import { flattenPages } from "@/api/queries/shared";
import { getApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { ShareButton } from "@/components/ui/share-button";
import { QrCode } from "@/components/ui/qr-code";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { SkeletonRow } from "@/components/ui/skeleton";
import { AvatarTile } from "@/components/ui/member-card";
import { formatDate } from "@/lib/utils";
import { formatShiftLabel } from "@/lib/shifts";
import { cn } from "@/lib/utils";
import { getTenantDashboardPath } from "@/lib/subdomain";
import { useInfiniteScroll } from "@/lib/use-infinite-scroll";
import {
  CalendarCheck,
  CheckCircle2,
  UserCheck,
  Users,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  CalendarDays,
  ExternalLink,
  QrCode as QrCodeIcon,
  Clock3,
  Radio,
} from "lucide-react";
import { AtRiskPanel } from "./AtRiskPanel";
import { AttendanceHeatmap } from "./AttendanceHeatmap";
import type { AttendanceRecord } from "@/types/api";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * The member-facing self check-in card, parked while check-in happens at the
 * desk. Kept rather than deleted because the flow it renders still works.
 */
const SHOW_SELF_CHECKIN_CARD = false;

/** Today's date as `YYYY-MM-DD` on the viewer's own calendar. */
function todayLocalIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function AttendancePage() {
  const navigate = useAppNavigate();
  const { currentTenantId, currentMembership } = useAuthStore();
  const { can } = usePermissions();
  const membership = currentMembership();
  const membershipId = membership?.id;
  // "Staff" here means whoever may see the whole gym's attendance, not a role name.
  const isStaff = can(Permission.ATTENDANCE_READ);
  const canDeleteAttendance = can(Permission.ATTENDANCE_DELETE);
  // The machines used to be their own sidebar entry. They belong to this page.
  const canManageDevices = can(Permission.ATTENDANCE_QR_MANAGE);

  /**
   * The machines, read only by somebody who could act on a dead one.
   *
   * A reader that stops reporting takes the gym's attendance with it and looks
   * exactly like a quiet day. The nightly check emails nobody until morning,
   * so the screen that shows attendance says it too, the moment it is opened.
   */
  const devicesQuery = useAttendanceDevices({ enabled: canManageDevices });
  const offlineDevices = (devicesQuery.data ?? []).filter(
    (device) => device.isActive && !device.online,
  );

  const [date, setDate] = React.useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [checkingIn, setCheckingIn] = React.useState(false);
  // Set optimistically after a successful check-in, before the list refetches.
  const [justCheckedIn, setJustCheckedIn] = React.useState(false);
  const [actionError, setActionError] = React.useState("");

  // Bulk marking state
  const [showBulk, setShowBulk] = React.useState(false);

  /**
   * Which question this page is answering: who came today, or who has stopped
   * coming at all. Two views of one table rather than two screens, because the
   * second is only ever asked by somebody already looking at the first.
   */
  const [view, setView] = React.useState<"register" | "at-risk" | "hours">("register");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = React.useState(false);
  const [memberSearch, setMemberSearch] = React.useState("");

  const today = React.useMemo(() => new Date(), []);
  const [calMonth, setCalMonth] = React.useState(getMonthStr(today));

  const navigateMemberMonth = (dir: -1 | 1) => {
    const d = parseMonth(calMonth);
    d.setMonth(d.getMonth() + dir);
    setCalMonth(getMonthStr(d));
  };

  // Staff see the whole gym for a date; a member sees only their own history.
  // Exactly one of these runs, and the date is part of the cache key so moving
  // between days reuses what has already been fetched.
  const dayQuery = useAttendanceByDateInfinite(date, { enabled: isStaff });
  const mineQuery = useMemberAttendanceInfinite(membershipId, { enabled: !isStaff });
  const activeQuery = isStaff ? dayQuery : mineQuery;

  const records = React.useMemo(
    () => flattenPages<AttendanceRecord>(activeQuery.data?.pages),
    [activeQuery.data],
  );
  const loading = activeQuery.isLoading;
  const loadingMore = activeQuery.isFetchingNextPage;
  const hasMore = Boolean(activeQuery.hasNextPage);
  const error = actionError || (activeQuery.isError ? getApiError(activeQuery.error) : "");

  // Which members already have a check-in today, for the bulk-marking picker.
  const presentIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const record of records) {
      if (record.membershipId) ids.add(record.membershipId);
    }
    return ids;
  }, [records]);

  // A member's own month calendar, alongside their history.
  const calendarQuery = useMemberAttendanceCalendar(membershipId, calMonth, {
    enabled: !isStaff,
  });
  const calDates = React.useMemo(
    () => new Set(calendarQuery.data?.dates ?? []),
    [calendarQuery.data],
  );
  const calTotal = calendarQuery.data?.total ?? 0;
  const calLoading = calendarQuery.isLoading;

  const selfCheckIn = useSelfCheckIn();
  const markAll = useMarkAllAttendance();
  const removeAttendance = useRemoveAttendance();

  // The member's own list tells us whether today is already recorded.
  const checkedIn = React.useMemo(
    () =>
      justCheckedIn ||
      (!isStaff && records.some((record) => String(record.date).slice(0, 10) === date)),
    [justCheckedIn, isStaff, records, date],
  );

  const loadMoreRef = useInfiniteScroll({
    hasMore,
    loading: loading || loadingMore,
    onLoadMore: () => {
      if (activeQuery.hasNextPage && !activeQuery.isFetchingNextPage) {
        void activeQuery.fetchNextPage();
      }
    },
  });

  // The roster for bulk marking. This is the same cached query the member list
  // and the assignment pickers read, so opening the panel a second time — or
  // arriving from a screen that already loaded it — costs no request at all.
  const rosterQuery = useAllMembers({ enabled: showBulk && isStaff });
  const members = React.useMemo(
    () => (rosterQuery.data ?? []).filter((member) => member.status === "ACTIVE"),
    [rosterQuery.data],
  );

  const handleSelfCheckIn = async () => {
    setCheckingIn(true);
    setActionError("");
    try {
      await selfCheckIn.mutateAsync({ date });
      setJustCheckedIn(true);
    } catch (err) {
      const msg = getApiError(err);
      // A duplicate check-in means the goal is already met, not a failure.
      if (msg.toLowerCase().includes("unique") || msg.toLowerCase().includes("already")) {
        setJustCheckedIn(true);
      } else {
        setActionError(msg);
      }
    } finally {
      setCheckingIn(false);
    }
  };

  const handleBulkMark = async () => {
    if (selected.size === 0) return;
    setBulkLoading(true);
    setActionError("");
    try {
      const result = await markAll.mutateAsync({ membershipIds: Array.from(selected), date });
      setShowBulk(false);
      setSelected(new Set());
      // A bulk mark can succeed for the room and still miss somebody. Saying so
      // beats a silent partial success the desk only notices in the register.
      if (result.failed.length > 0) {
        setActionError(
          `Marked ${result.marked} of ${result.total}. ${result.failed.length} could not be marked.`,
        );
      }
    } catch (err) {
      setActionError(getApiError(err));
    } finally {
      setBulkLoading(false);
    }
  };

  const handleRemove = async (membershipId: string) => {
    try {
      await removeAttendance.mutateAsync({ membershipId, date });
    } catch (err) {
      setActionError(getApiError(err));
    }
  };

  const shiftDate = (days: number) => {
    const d = new Date(date + "T00:00:00");
    d.setDate(d.getDate() + days);
    setDate(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    );
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const filtered = filteredMembers;
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((m) => m.id)));
    }
  };

  const filteredMembers = members.filter(
    (m) =>
      !presentIds.has(m.id) &&
      `${m.name} ${m.email} ${m.phone ?? ""} ${m.memberId ?? ""}`
        .toLowerCase()
        .includes(memberSearch.toLowerCase()),
  );

  const isToday =
    date ===
    (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();

  const qrUrl = React.useMemo(() => {
    if (!currentTenantId || typeof window === "undefined") return "";
    return `${window.location.origin}/attendance/qr/${currentTenantId}`;
  }, [currentTenantId]);

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      {offlineDevices.length > 0 && (
        <button
          type="button"
          onClick={() => navigate("/attendance/devices")}
          className="flex w-full items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900 transition-colors hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
        >
          <Radio className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="font-medium">
              {offlineDevices.length === 1
                ? `${offlineDevices[0]!.name} is not reporting`
                : `${offlineDevices.length} machines are not reporting`}
            </span>
            <span className="block text-xs opacity-80">
              Attendance through {offlineDevices.length === 1 ? "it" : "them"} is not being
              recorded. Tap to check the machines.
            </span>
          </span>
        </button>
      )}

      <PageHeader
        icon={CalendarCheck}
        title="Attendance"
        description={isStaff ? "Track daily gym attendance" : "Check in for today"}
        actions={
          <>
            <div className="flex flex-wrap gap-2">
              {isStaff && (
                <Button variant="outline" onClick={() => navigate("/attendance/calendar")}>
                  <CalendarDays className="h-4 w-4 mr-2" />
                  Calendar
                </Button>
              )}
              {canManageDevices && (
                <Button variant="outline" onClick={() => navigate("/attendance/devices")}>
                  <Radio className="h-4 w-4 mr-2" />
                  Machines
                </Button>
              )}
              {isToday && (
                <Button onClick={handleSelfCheckIn} disabled={checkingIn || checkedIn}>
                  {checkedIn ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />
                      Checked In
                    </>
                  ) : (
                    <>
                      <UserCheck className="h-4 w-4 mr-2" />
                      {checkingIn ? "Checking in..." : "Check In"}
                    </>
                  )}
                </Button>
              )}
              {isStaff && (
                <Button variant="outline" onClick={() => setShowBulk(true)}>
                  <Users className="h-4 w-4 mr-2" />
                  Mark All
                </Button>
              )}
            </div>
          </>
        }
      />

      {/* Two views of the register, and the one nobody has been shown before
          needs a count on it — "At risk" alone reads as a section that might be
          empty, which is the one thing that would stop it being opened. */}
      {isStaff && (
        <div className="flex gap-2 border-b">
          {(
            [
              ["register", "Register"],
              ["at-risk", "At risk"],
              ["hours", "Busy hours"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                view === key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Date Picker */}
      {isStaff && view === "register" && (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <Button variant="ghost" size="sm" onClick={() => shiftDate(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border border-input rounded-md px-3 py-1.5 text-sm bg-background"
          />
          <Button variant="ghost" size="sm" onClick={() => shiftDate(1)} disabled={isToday}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            {formatDate(date + "T00:00:00.000Z")}
          </span>
        </div>
      )}

      {error && (
        <div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">{error}</div>
      )}

      {isStaff && view === "register" && qrUrl && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCodeIcon className="h-5 w-5" />
              Attendance QR
            </CardTitle>
            <CardDescription>
              Members can scan this QR to open FitConnect and mark today's attendance.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <QrCode value={qrUrl} size={160} label="Attendance QR" className="border" />
            <div className="min-w-0 flex-1 space-y-3">
              <p className="break-all rounded-md bg-muted p-3 text-xs text-muted-foreground">
                {qrUrl}
              </p>
              <div className="flex flex-wrap gap-2">
                <ShareButton url={qrUrl} title="Attendance QR" label="Share Link" size="default" />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => window.location.assign(qrUrl)}
                >
                  <ExternalLink className="h-4 w-4" />
                  Test
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Marking a roomful is a task with an end, so it opens over the page
          rather than pushing the register down it. */}
      {isStaff && (
        <Dialog open={showBulk} onOpenChange={setShowBulk}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Mark attendance</DialogTitle>
              <DialogDescription>
                Who is present {isToday ? "today" : `on ${formatDate(date + "T00:00:00.000Z")}`}.
                Anyone already marked is left out of this list.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by name, phone, email, or admission no..."
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  className="w-full pl-10 pr-10 py-2 border border-input rounded-md bg-background text-sm"
                />
                {memberSearch && (
                  <button
                    onClick={() => setMemberSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Select all, and the running count of what is picked. */}
              <div className="flex items-center justify-between gap-3 border-y py-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={selected.size > 0 && selected.size === filteredMembers.length}
                    onChange={toggleAll}
                    className="size-4 rounded"
                  />
                  Select all
                  <span className="text-muted-foreground">({filteredMembers.length})</span>
                </label>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {selected.size} selected
                </span>
              </div>

              {/* One row per member rather than a card each: the panel is a list
                to tick down, and a 40px avatar with a card's padding around it
                left so little width that every name on a phone truncated to
                "#624 – Raushan Ku…". The whole row is the target — a checkbox
                alone is a 16px one — and a picked row says so with a tint
                rather than only with a tick 40px away from the name. */}
              <ul className="-mx-1 max-h-[45vh] divide-y overflow-y-auto sm:max-h-80">
                {filteredMembers.map((m) => {
                  const picked = selected.has(m.id);

                  return (
                    <li key={m.id}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-center gap-3 px-1 py-2 transition-colors hover:bg-muted/60",
                          picked && "bg-primary/5",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={picked}
                          onChange={() => toggleSelect(m.id)}
                          className="size-4 shrink-0 rounded"
                        />
                        <AvatarTile
                          person={{
                            name: m.name,
                            avatarUrl: m.avatarUrl,
                            gender: m.gender,
                            status: m.status,
                          }}
                          size="sm"
                          stacked
                          className="size-9 shrink-0 rounded-lg"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            <span className="text-muted-foreground">#{m.memberId} </span>
                            {m.name}
                          </span>
                          {m.shift && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {formatShiftLabel(m.shift)}
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  );
                })}
                {filteredMembers.length === 0 && (
                  <li className="py-6 text-center text-sm text-muted-foreground">
                    {members.length === 0 ? "Loading members…" : "Everyone is already marked."}
                  </li>
                )}
              </ul>

              {/* The count belongs in the button: "Mark 0 Members Present" reads
                as a broken button rather than as nothing being picked yet. */}
              <Button
                onClick={handleBulkMark}
                disabled={bulkLoading || selected.size === 0}
                className="w-full"
              >
                {bulkLoading
                  ? "Marking…"
                  : selected.size === 0
                    ? "Pick who is present"
                    : `Mark ${selected.size} present`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {isStaff && view === "at-risk" && <AtRiskPanel />}

      {isStaff && view === "hours" && <AttendanceHeatmap />}

      {/* Attendance List */}
      {isStaff && view === "register" && (
        <>
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="rounded-lg ring-1 ring-foreground/10">
                  <SkeletonRow className="p-3" />
                </div>
              ))}
            </div>
          ) : records.length === 0 ? (
            <EmptyState
              icon={CalendarCheck}
              title="No attendance records"
              description={`No one has checked in ${isToday ? "today" : "on this date"} yet.`}
            />
          ) : (
            <div className="space-y-4">
              {/* Who is in today.

                Fifty people used to be fifty cards, each three lines tall with
                a red cross on the right: a screen and a half of scrolling to
                read a register, and the loudest thing on it was the button
                that deletes a visit. One card holding one row each instead —
                the same information at a third of the height, with the time
                where the eye can compare it down the column, and the remove
                control quiet until it is reached for. */}
              <Card className="overflow-hidden py-0">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                  <h2 className="text-base font-semibold">Present</h2>
                  {/* In and out at a glance: who is still on the floor, who has
                      left, and who never tapped out. Counted over the rows
                      loaded so far, which is the whole day for most gyms. */}
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums text-muted-foreground">
                    <span>
                      {records.length} {records.length === 1 ? "visit" : "visits"}
                    </span>
                    {isToday && records.some((r) => sessionState(r, true) === "inside") && (
                      <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {records.filter((r) => sessionState(r, true) === "inside").length} inside
                      </span>
                    )}
                    <span>{records.filter((r) => r.checkOutAt).length} checked out</span>
                    {records.some((r) => sessionState(r, isToday) === "no-checkout") && (
                      <span className="text-amber-700 dark:text-amber-400">
                        {records.filter((r) => sessionState(r, isToday) === "no-checkout").length} no
                        check-out
                      </span>
                    )}
                  </span>
                </div>

                <ul className="divide-y">
                  {records.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40"
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        onClick={() =>
                          r.membershipId &&
                          navigate(getTenantDashboardPath(`/members/${r.membershipId}#attendance`))
                        }
                      >
                        <AvatarTile
                          person={{
                            name: r.memberName ?? "",
                            avatarUrl: r.memberAvatarUrl,
                            status: "ACTIVE",
                          }}
                          size="sm"
                          stacked
                          className="h-9 w-9 rounded-lg"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {r.memberId !== undefined && r.memberId !== null && (
                              <span className="text-muted-foreground">#{r.memberId} </span>
                            )}
                            {r.memberName}
                          </span>
                          {/* The shift, and who marked them when somebody did.
                            A member who walked in and scanned needs no name. */}
                          {(r.shiftName || r.markedBy) && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {[r.shiftName, r.markedBy ? `by ${r.markedBy.name}` : null]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          )}
                        </span>
                      </button>

                      {/* In and out, in a column of its own so the morning rush
                        reads as a shape rather than as fifty separate lines. */}
                      <SessionTimes session={r} isToday={isToday} />

                      {canDeleteAttendance && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="size-7 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => r.membershipId && handleRemove(r.membershipId)}
                          title={`Remove ${r.memberName ?? "this visit"}`}
                          aria-label={`Remove ${r.memberName ?? "this visit"}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
              {records.length > 0 && (hasMore || loadingMore) && (
                <div
                  ref={loadMoreRef}
                  className="flex items-center justify-center py-4 text-sm text-muted-foreground"
                >
                  {loadingMore ? (
                    <div className="flex items-center gap-2">
                      <Spinner size="sm" />
                      Loading more...
                    </div>
                  ) : (
                    "Scroll to load more"
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Self-only view for members */}
      {!isStaff && (
        <div className="space-y-4">
          <Card>
            <CardContent className="py-8 text-center">
              {checkedIn ? (
                <div className="space-y-2">
                  <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
                  <p className="text-lg font-medium">You're checked in for today!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <CalendarCheck className="h-12 w-12 text-muted-foreground mx-auto" />
                  <p className="text-lg font-medium">Ready for your workout?</p>
                  <p className="text-sm text-muted-foreground">
                    Tap the Check In button above or scan the gym QR to mark your attendance.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5" />
                  Attendance Calendar
                </CardTitle>
                <span className="text-sm text-muted-foreground font-medium">
                  {calTotal} day{calTotal !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1">
                <Button variant="ghost" size="sm" onClick={() => navigateMemberMonth(-1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium">{formatMonthLabel(calMonth)}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigateMemberMonth(1)}
                  disabled={calMonth >= getMonthStr(today)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-3">
              {calLoading ? (
                <div className="flex justify-center py-6">
                  <Spinner size="sm" />
                </div>
              ) : (
                (() => {
                  const first = parseMonth(calMonth);
                  const daysInMonth = new Date(
                    first.getFullYear(),
                    first.getMonth() + 1,
                    0,
                  ).getDate();
                  const startDay = (first.getDay() + 6) % 7;
                  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
                  const cells: React.ReactNode[] = [];
                  for (let i = 0; i < startDay; i++) cells.push(<div key={`empty-${i}`} />);
                  for (let d = 1; d <= daysInMonth; d++) {
                    const dateStr = `${calMonth}-${String(d).padStart(2, "0")}`;
                    const present = calDates.has(dateStr);
                    const isTodayCell = dateStr === todayStr;
                    cells.push(
                      <div
                        key={d}
                        className={cn(
                          "flex min-h-11 flex-col items-center justify-center rounded-md p-1 text-sm",
                          present ? "bg-green-500 text-white font-medium" : "text-muted-foreground",
                          isTodayCell && "ring-2 ring-primary",
                        )}
                        title={present ? "Present" : "No attendance"}
                      >
                        {d}
                        {present && <CheckCircle2 className="mt-0.5 h-3 w-3" />}
                      </div>,
                    );
                  }

                  return (
                    <div className="grid grid-cols-7 gap-1">
                      {WEEKDAYS.map((weekday) => (
                        <div
                          key={weekday}
                          className="py-1 text-center text-xs font-medium text-muted-foreground"
                        >
                          {weekday}
                        </div>
                      ))}
                      {cells}
                    </div>
                  );
                })()
              )}
            </CardContent>
          </Card>

          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="rounded-lg ring-1 ring-foreground/10">
                  <SkeletonRow className="p-3" />
                </div>
              ))}
            </div>
          ) : records.length === 0 ? (
            <EmptyState
              icon={CalendarCheck}
              title="No attendance records"
              description="Your attendance history will appear here after check-in."
            />
          ) : (
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">My Attendance</h2>
              {records.map((record) => (
                <Card key={record.id}>
                  <div className="flex items-center justify-between p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{formatDate(String(record.date))}</p>
                      {(record.shiftName || record.note) && (
                        <p className="truncate text-xs text-muted-foreground">
                          {[record.shiftName, record.note].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock3 className="h-4 w-4 shrink-0" />
                      <SessionTimes
                        session={record}
                        isToday={String(record.date).slice(0, 10) === todayLocalIso()}
                      />
                    </div>
                  </div>
                </Card>
              ))}
              {records.length > 0 && (hasMore || loadingMore) && (
                <div
                  ref={loadMoreRef}
                  className="flex items-center justify-center py-4 text-sm text-muted-foreground"
                >
                  {loadingMore ? (
                    <div className="flex items-center gap-2">
                      <Spinner size="sm" />
                      Loading more...
                    </div>
                  ) : (
                    "Scroll to load more"
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {SHOW_SELF_CHECKIN_CARD && !isStaff && (
        <Card>
          <CardContent className="py-8 text-center">
            {checkedIn ? (
              <div className="space-y-2">
                <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
                <p className="text-lg font-medium">You're checked in for today!</p>
                <p className="text-sm text-muted-foreground">Keep up the great work 💪</p>
              </div>
            ) : (
              <div className="space-y-2">
                <CalendarCheck className="h-12 w-12 text-muted-foreground mx-auto" />
                <p className="text-lg font-medium">Ready for your workout?</p>
                <p className="text-sm text-muted-foreground">
                  Tap the Check In button above to mark your attendance
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
