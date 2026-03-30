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
} from "lucide-react";
import type { AttendanceRecord, TenantMember } from "@/types/api";

export default function AttendancePage() {
  const navigate = useNavigate();
  const { currentTenantId, tenantRole } = useAuthStore();
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

  // Bulk marking state
  const [members, setMembers] = React.useState<TenantMember[]>([]);
  const [showBulk, setShowBulk] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = React.useState(false);
  const [memberSearch, setMemberSearch] = React.useState("");
  const [presentIds, setPresentIds] = React.useState<Set<string>>(new Set());

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
    [currentTenantId, date, isStaff],
  );

  React.useEffect(() => {
    if (!currentTenantId) return;
    setRecords([]);
    setHasMore(true);
    setPresentIds(new Set());
    void fetchAttendance(1, "replace");
  }, [currentTenantId, date, isStaff, fetchAttendance]);

  const loadMore = React.useCallback(() => {
    if (!isStaff || loading || loadingMore || !hasMore) return;
    void fetchAttendance(page + 1, "append");
  }, [isStaff, loading, loadingMore, hasMore, page, fetchAttendance]);

  const loadMoreRef = useInfiniteScroll({
    hasMore: isStaff && hasMore,
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
      fetchAttendance(1, "replace");
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
