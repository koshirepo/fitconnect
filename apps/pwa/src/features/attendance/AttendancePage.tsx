import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth";
import { attendanceApi } from "@/api/attendance";
import { getApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageLoader, Spinner } from "@/components/ui/spinner";
import AvatarCard from "@/components/ui/avatarCard";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { loadAllTenantMembers } from "@/lib/tenant-members";
import { appendUniqueById, useInfiniteScroll } from "@/lib/use-infinite-scroll";
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
  Copy,
  ExternalLink,
  QrCode,
  Clock3,
} from "lucide-react";
import type { AttendanceRecord, TenantMember } from "@/types/api";

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

export default function AttendancePage() {
  const navigate = useNavigate();
  const { currentTenantId, tenantRole, currentMembership } = useAuthStore();
  const membership = currentMembership();
  const membershipId = membership?.id;
  const role = tenantRole();
  const isStaff = role === "ADMIN" || role === "COACH";

  const [date, setDate] = React.useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [records, setRecords] = React.useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [hasMore, setHasMore] = React.useState(true);
  const [checkingIn, setCheckingIn] = React.useState(false);
  const [checkedIn, setCheckedIn] = React.useState(false);
  const [error, setError] = React.useState("");
  const [copiedQrLink, setCopiedQrLink] = React.useState(false);

  // Bulk marking state
  const [members, setMembers] = React.useState<TenantMember[]>([]);
  const [showBulk, setShowBulk] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = React.useState(false);
  const [memberSearch, setMemberSearch] = React.useState("");
  const [presentIds, setPresentIds] = React.useState<Set<string>>(new Set());

  const today = React.useMemo(() => new Date(), []);
  const [calMonth, setCalMonth] = React.useState(getMonthStr(today));
  const [calDates, setCalDates] = React.useState<Set<string>>(new Set());
  const [calTotal, setCalTotal] = React.useState(0);
  const [calLoading, setCalLoading] = React.useState(false);

  const navigateMemberMonth = (dir: -1 | 1) => {
    const d = parseMonth(calMonth);
    d.setMonth(d.getMonth() + dir);
    setCalMonth(getMonthStr(d));
  };

  const fetchAttendance = React.useCallback(
    async (nextPage: number, mode: "replace" | "append") => {
      if (!currentTenantId) return;
      if (mode === "replace") {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError("");
      try {
        if (isStaff) {
          const res = await attendanceApi.listByDate(currentTenantId, date, nextPage, 50);
          const attendance = res.data.data.attendance;
          setRecords((prev) =>
            mode === "replace" ? attendance : appendUniqueById(prev, attendance),
          );
          const totalPages = res.data.meta?.totalPages ?? 1;
          setHasMore(nextPage < totalPages);
          setPage(nextPage);
          setPresentIds((prev) => {
            const nextSet = mode === "replace" ? new Set<string>() : new Set(prev);
            for (const record of attendance) {
              if (record.membershipId) nextSet.add(record.membershipId);
            }
            return nextSet;
          });
        } else if (membershipId) {
          const res = await attendanceApi.listByMember(currentTenantId, membershipId, nextPage, 20);
          const attendance = res.data.data.attendance;
          setRecords((prev) =>
            mode === "replace" ? attendance : appendUniqueById(prev, attendance),
          );
          const totalPages = res.data.meta?.totalPages ?? 1;
          setHasMore(nextPage < totalPages);
          setPage(nextPage);
          if (attendance.some((record) => String(record.date).slice(0, 10) === date)) {
            setCheckedIn(true);
          }
        } else {
          setRecords([]);
          setHasMore(false);
        }
      } catch (err) {
        setError(getApiError(err));
      } finally {
        if (mode === "replace") {
          setLoading(false);
        } else {
          setLoadingMore(false);
        }
      }
    },
    [currentTenantId, date, isStaff, membershipId],
  );

  React.useEffect(() => {
    if (!currentTenantId) return;
    setRecords([]);
    setHasMore(true);
    setPresentIds(new Set());
    void fetchAttendance(1, "replace");
  }, [currentTenantId, date, isStaff, fetchAttendance]);

  React.useEffect(() => {
    if (isStaff || !currentTenantId || !membershipId) {
      setCalDates(new Set());
      setCalTotal(0);
      setCalLoading(false);
      return;
    }

    let cancelled = false;
    setCalLoading(true);
    attendanceApi
      .memberCalendar(currentTenantId, membershipId, calMonth)
      .then((res) => {
        if (cancelled) return;
        setCalDates(new Set(res.data.data.dates));
        setCalTotal(res.data.data.total);
      })
      .catch(() => {
        if (!cancelled) {
          setCalDates(new Set());
          setCalTotal(0);
        }
      })
      .finally(() => {
        if (!cancelled) setCalLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isStaff, currentTenantId, membershipId, calMonth]);

  const loadMore = React.useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    void fetchAttendance(page + 1, "append");
  }, [loading, loadingMore, hasMore, page, fetchAttendance]);

  const loadMoreRef = useInfiniteScroll({
    hasMore,
    loading: loading || loadingMore,
    onLoadMore: loadMore,
  });

  // Load members for bulk marking
  React.useEffect(() => {
    if (!showBulk || !currentTenantId) return;
    loadAllTenantMembers(currentTenantId, { status: "ACTIVE" })
      .then((allMembers) => {
        setMembers(allMembers);
      })
      .catch(() => {});
  }, [showBulk, currentTenantId]);

  const handleSelfCheckIn = async () => {
    if (!currentTenantId) return;
    setCheckingIn(true);
    setError("");
    try {
      await attendanceApi.checkIn(currentTenantId, { date });
      setCheckedIn(true);
      void fetchAttendance(1, "replace");
    } catch (err) {
      const msg = getApiError(err);
      if (msg.toLowerCase().includes("unique") || msg.toLowerCase().includes("already")) {
        setCheckedIn(true);
      } else {
        setError(msg);
      }
    } finally {
      setCheckingIn(false);
    }
  };

  const handleBulkMark = async () => {
    if (!currentTenantId || selected.size === 0) return;
    setBulkLoading(true);
    setError("");
    try {
      await attendanceApi.markAll(currentTenantId, {
        membershipIds: Array.from(selected),
        date,
      });
      setShowBulk(false);
      setSelected(new Set());
      fetchAttendance(1, "replace");
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setBulkLoading(false);
    }
  };

  const handleRemove = async (membershipId: string) => {
    if (!currentTenantId) return;
    try {
      await attendanceApi.remove(currentTenantId, membershipId, date);
      fetchAttendance(1, "replace");
    } catch (err) {
      setError(getApiError(err));
    }
  };

  const shiftDate = (days: number) => {
    const d = new Date(date + "T00:00:00");
    d.setDate(d.getDate() + days);
    setDate(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    );
    setPage(1);
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

  const qrImageUrl = qrUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=12&data=${encodeURIComponent(qrUrl)}`
    : "";

  const handleCopyQrLink = async () => {
    if (!qrUrl) return;
    await navigator.clipboard.writeText(qrUrl);
    setCopiedQrLink(true);
    window.setTimeout(() => setCopiedQrLink(false), 2000);
  };

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
        <div className="flex gap-2">
          {isStaff && (
            <Button variant="outline" onClick={() => navigate("/attendance/calendar")}>
              <CalendarDays className="h-4 w-4 mr-2" />
              Calendar
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
            onChange={(e) => {
              setDate(e.target.value);
              setPage(1);
            }}
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

      {isStaff && qrUrl && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <QrCode className="h-5 w-5" />
              Attendance QR
            </CardTitle>
            <CardDescription>
              Members can scan this QR to open FitConnect and mark today's attendance.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <img
              src={qrImageUrl}
              alt="Attendance QR"
              className="h-40 w-40 rounded-lg border bg-white p-2"
            />
            <div className="min-w-0 flex-1 space-y-3">
              <p className="break-all rounded-md bg-muted p-3 text-xs text-muted-foreground">
                {qrUrl}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={handleCopyQrLink}>
                  <Copy className="h-4 w-4" />
                  {copiedQrLink ? "Copied" : "Copy Link"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => window.open(qrUrl, "_blank", "noopener,noreferrer")}
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
            <PageLoader />
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
                    <div className="flex items-center justify-between p-3">
                      <button
                        type="button"
                        className="flex items-center gap-3 text-left hover:opacity-80 transition-opacity"
                        onClick={() =>
                          r.membershipId && navigate(`/members/${r.membershipId}#attendance`)
                        }
                      >
                        <AvatarCard
                          name={r.memberName ?? ""}
                          avatarUrl={r.memberAvatarUrl}
                          memberId={r.memberId}
                          variant="sm"
                          isActive
                        />
                      </button>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {r.markedBy && (
                          <span className="hidden sm:inline">by {r.markedBy.name}</span>
                        )}
                        <span>
                          {new Date(r.checkInAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {role === "ADMIN" && (
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
            <PageLoader />
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
      {false && !isStaff && (
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
