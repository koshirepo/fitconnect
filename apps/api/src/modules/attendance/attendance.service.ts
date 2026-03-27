import { attendanceRepository } from "./attendance.repository";
import type { MarkAttendanceInput, MarkAllAttendanceInput } from "./attendance.schema";

function toDateOnly(dateStr?: string): Date {
  if (dateStr) return new Date(dateStr + "T00:00:00.000Z");
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export const attendanceService = {
  /** Self check-in or admin/coach marks for a specific member */
  async markAttendance(
    tenantId: string,
    actorUserId: string,
    actorMembershipId: string | null,
    input: MarkAttendanceInput,
    isSelf: boolean,
  ) {
    const date = toDateOnly(input.date);
    let targetMembershipId: string;

    if (isSelf) {
      // Member checking in themselves
      const membership = await attendanceRepository.findMembershipByUserId(tenantId, actorUserId);
      if (!membership)
        return { error: "You are not an active member of this gym.", status: 403 as const };
      targetMembershipId = membership.id;
    } else {
      // Admin/coach marking for someone else
      if (!input.membershipId) return { error: "membershipId is required.", status: 400 as const };
      const membership = await attendanceRepository.findMembership(tenantId, input.membershipId);
      if (!membership) return { error: "Member not found or inactive.", status: 404 as const };
      targetMembershipId = membership.id;
    }

    const record = await attendanceRepository.markAttendance(
      tenantId,
      targetMembershipId,
      date,
      isSelf ? null : actorMembershipId,
      input.note,
    );

    return {
      data: {
        attendance: {
          id: record.id,
          date: record.date,
          checkInAt: record.checkInAt,
          note: record.note,
          membershipId: record.member.id,
          memberId: record.member.memberId,
          memberName: record.member.user.name,
        },
      },
    };
  },

  /** Admin/coach marks attendance for multiple members at once */
  async markAll(tenantId: string, actorMembershipId: string | null, input: MarkAllAttendanceInput) {
    const date = toDateOnly(input.date);
    const results = await Promise.allSettled(
      input.membershipIds.map((mid) =>
        attendanceRepository.markAttendance(tenantId, mid, date, actorMembershipId),
      ),
    );
    const marked = results.filter((r) => r.status === "fulfilled").length;
    return { data: { marked, total: input.membershipIds.length } };
  },

  /** Remove attendance record (admin/coach only) */
  async removeAttendance(tenantId: string, membershipId: string, dateStr: string) {
    const date = toDateOnly(dateStr);
    try {
      await attendanceRepository.deleteAttendance(tenantId, membershipId, date);
      return { data: { message: "Attendance removed." } };
    } catch {
      return { error: "Attendance record not found.", status: 404 as const };
    }
  },

  /** List attendance for a specific date */
  async listByDate(tenantId: string, date: string, page: number, limit: number) {
    const d = toDateOnly(date);
    const { records, total } = await attendanceRepository.listByDate(tenantId, d, page, limit);
    return {
      data: {
        attendance: records.map((r) => ({
          id: r.id,
          date: r.date,
          checkInAt: r.checkInAt,
          note: r.note,
          membershipId: r.member.id,
          memberId: r.member.memberId,
          memberName: r.member.user.name,
          memberAvatarUrl: r.member.user.avatarUrl,
          markedBy: r.markedBy ? { id: r.markedBy.id, name: r.markedBy.user.name } : null,
        })),
      },
      total,
    };
  },

  /** List attendance history for a specific member */
  async listByMember(tenantId: string, membershipId: string, page: number, limit: number) {
    const { records, total } = await attendanceRepository.listByMember(
      tenantId,
      membershipId,
      page,
      limit,
    );
    return {
      data: {
        attendance: records.map((r) => ({
          id: r.id,
          date: r.date,
          checkInAt: r.checkInAt,
          note: r.note,
          markedBy: r.markedBy ? { id: r.markedBy.id, name: r.markedBy.user.name } : null,
        })),
      },
      total,
    };
  },

  /** Summary: count of days attended in current month + this week */
  async summary(tenantId: string, membershipId: string) {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
    const monthEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0));
    const dayOfWeek = now.getUTCDay(); // 0=Sun
    const weekStart = new Date(
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - ((dayOfWeek + 6) % 7)),
    ); // Monday
    const weekEnd = new Date(
      Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate() + 6),
    );

    const [monthCount, weekCount] = await Promise.all([
      attendanceRepository.countByDateRange(tenantId, membershipId, monthStart, monthEnd),
      attendanceRepository.countByDateRange(tenantId, membershipId, weekStart, weekEnd),
    ]);

    return { data: { thisMonth: monthCount, thisWeek: weekCount } };
  },

  /** Calendar dates for a single member in a month */
  async memberCalendar(tenantId: string, membershipId: string, month: string) {
    const [year, mon] = month.split("-").map(Number);
    const from = new Date(Date.UTC(year, mon - 1, 1));
    const to = new Date(Date.UTC(year, mon, 0));

    const dates = await attendanceRepository.memberMonthlyDates(tenantId, membershipId, from, to);

    return {
      data: {
        month,
        dates: dates.map((d) => d.toISOString().slice(0, 10)),
        total: dates.length,
      },
    };
  },

  /** Full gym calendar: daily counts + member names for a month */
  async calendarMonth(tenantId: string, month: string) {
    const [year, mon] = month.split("-").map(Number);
    const from = new Date(Date.UTC(year, mon - 1, 1));
    const to = new Date(Date.UTC(year, mon, 0)); // last day of month

    const records = await attendanceRepository.monthlyCounts(tenantId, from, to);

    const dayMap: Record<
      string,
      { count: number; members: { id: string; memberId: number | null; name: string }[] }
    > = {};
    for (const r of records) {
      const key = r.date.toISOString().slice(0, 10);
      if (!dayMap[key]) dayMap[key] = { count: 0, members: [] };
      dayMap[key].count++;
      dayMap[key].members.push({
        id: r.member.id,
        memberId: r.member.memberId,
        name: r.member.user.name,
      });
    }

    return {
      data: {
        month,
        days: dayMap,
      },
    };
  },
};
