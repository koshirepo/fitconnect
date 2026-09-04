import { getMonthStr, parseMonth, formatMonthLabel } from "@/lib/month";
import * as React from "react";
import { usePermissions } from "@/features/auth/permission-gate";
import { ScanCheckIn } from "./ScanCheckIn";
import { Permission } from "@fitconnect/shared/types/permissions";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { useAuthStore } from "@/stores/auth";
import {
  useAttendanceByDateInfinite,
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
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { SkeletonRow } from "@/components/ui/skeleton";
import AvatarCard from "@/components/ui/avatarCard";
import { AvatarTile } from "@/components/ui/member-card";
import { formatDate } from "@/lib/utils";
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
import type { AttendanceRecord } from "@/types/api";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * The member-facing self check-in card, parked while check-in happens at the
 * desk. Kept rather than deleted because the flow it renders still works.
 */
const SHOW_SELF_CHECKIN_CARD = false;

export default function AttendancePage() {
  const navigate = useAppNavigate();
  const { currentTenantId, currentMembership } = useAuthStore();
  const { can } = usePermissions();
  const membership = currentMembership();
  const membershipId = membership?.id;
  // "Staff" here means whoever may see the whole gym's attendance, not a role name.
  const isStaff = can(Permission.ATTENDANCE_READ);
  const canMarkAttendance = can(Permission.ATTENDANCE_MARK);
  const canDeleteAttendance = can(Permission.ATTENDANCE_DELETE);
  // The machines used to be their own sidebar entry. They belong to this page.
  const canManageDevices = can(Permission.ATTENDANCE_QR_MANAGE);

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
      await markAll.mutateAsync({ membershipIds: Array.from(selected), date });
      setShowBulk(false);
      setSelected(new Set());
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CalendarCheck className="h-6 w-6" />
            Attendance
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isStaff ? "Track daily gym attendance" : "Check in for today"}
          </p>
        </div>
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
            <Button variant="outline" onClick={() => setShowBulk(!showBulk)}>
              <Users className="h-4 w-4 mr-2" />
              Mark All
            </Button>
          )}
        </div>
      </div>

      {/* Date Picker */}
      {isStaff && (
        <div className="flex items-center gap-3 justify-center">
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

      {/* The desk's own camera, above the poster members scan: at a queue this
          is the faster of the two, and the one that works for members who never
          installed anything. */}
      {canMarkAttendance && <ScanCheckIn />}

      {isStaff && qrUrl && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
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

      {/* Bulk Mark Panel */}
      {showBulk && isStaff && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mark Attendance for Members</CardTitle>
            <CardDescription>
              Select members who are present{" "}
              {isToday ? "today" : `on ${formatDate(date + "T00:00:00.000Z")}`}. Already marked
              members are excluded.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
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

            {/* Select all */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.size > 0 && selected.size === filteredMembers.length}
                  onChange={toggleAll}
                  className="rounded"
                />
                Select all ({filteredMembers.length})
              </label>
              <span className="text-sm text-muted-foreground">{selected.size} selected</span>
            </div>

            {/* Member list */}
            <div className="max-h-64 overflow-y-auto space-y-1">
              {filteredMembers.map((m) => (
                <label
                  key={m.id}
                  className="flex items-center gap-3 rounded-md p-2 hover:bg-muted cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(m.id)}
                    onChange={() => toggleSelect(m.id)}
                    className="rounded"
                  />
                  <AvatarCard
                    name={m.name}
                    avatarUrl={m.avatarUrl}
                    gender={m.gender}
                    memberId={m.memberId}
                    variant="sm"
                    isActive={m.status === "ACTIVE"}
                  />
                </label>
              ))}
              {filteredMembers.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {members.length === 0 ? "Loading members..." : "All members already marked!"}
                </p>
              )}
            </div>

            <Button
              onClick={handleBulkMark}
              disabled={bulkLoading || selected.size === 0}
              className="w-full"
            >
              {bulkLoading
                ? "Marking..."
                : `Mark ${selected.size} Member${selected.size !== 1 ? "s" : ""} Present`}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Attendance List */}
      {isStaff && (
        <>
          {loading ? (
            <div className="space-y-3">
              {[0,1,2,3].map((i) => (
                <div key={i} className="rounded-lg ring-1 ring-foreground/10"><SkeletonRow className="p-3" /></div>
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
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  Present — {records.length} member{records.length !== 1 ? "s" : ""}
                </h2>
              </div>
              <div className="space-y-2">
                {records.map((r) => (
                  <Card key={r.id} className="hover:shadow-sm transition-shadow">
                    {/* Who, then when. Both had to share one line before, which
                        on a phone truncated the person to "Rudra Gym Ad…" and
                        broke "06:00 AM" across two lines. */}
                    <div className="flex items-start gap-2 p-3">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-start gap-3 text-left transition-opacity hover:opacity-80"
                        onClick={() =>
                          r.membershipId && navigate(getTenantDashboardPath(`/members/${r.membershipId}#attendance`))
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
                          className="h-10 w-10 rounded-lg"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {r.memberId !== undefined && r.memberId !== null && (
                              <span className="text-muted-foreground">#{r.memberId} </span>
                            )}
                            {r.memberName}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground tabular-nums">
                            {new Date(r.checkInAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                            {r.markedBy ? ` · by ${r.markedBy.name}` : ""}
                          </p>
                        </div>
                      </button>
                      <div className="flex shrink-0 items-center gap-1 text-sm text-muted-foreground">
                        {canDeleteAttendance && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive h-7 w-7 p-0"
                            onClick={() => r.membershipId && handleRemove(r.membershipId)}
                            title="Remove"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
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
                <CardTitle className="text-lg flex items-center gap-2">
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
                          present
                            ? "bg-green-500 text-white font-medium"
                            : "text-muted-foreground",
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
              {[0,1,2,3].map((i) => (
                <div key={i} className="rounded-lg ring-1 ring-foreground/10"><SkeletonRow className="p-3" /></div>
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
                    <div>
                      <p className="text-sm font-medium">{formatDate(String(record.date))}</p>
                      {record.note && (
                        <p className="text-xs text-muted-foreground">{record.note}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock3 className="h-4 w-4" />
                      {new Date(record.checkInAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
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
