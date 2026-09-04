/**
 * Documentation: Attendance service.
 *
 * - Implements the business rules for member check-ins, staff attendance marking, summaries, and calendar views by coordinating repositories, shared helpers, and cross-cutting utilities like email or audit logging where needed.
 * - Prefer placing workflow logic, derived calculations, and domain invariants here instead of inside controllers or repositories.
 * - Primary exports: attendanceService.
 */
import { attendanceRepository } from "./attendance.repository";
import { freezeService } from "../freezes/freezes.service";
import type {
  MarkAttendanceInput,
  MarkAllAttendanceInput,
  QrAttendanceInput,
} from "./attendance.schema";

/**
 * Execute the `to date only` workflow for the attendance module.
 * Keep business rules, orchestration, and derived state updates in this layer instead of duplicating them in controllers or repositories.
 */
function toDateOnly(dateStr?: string): Date {
  if (dateStr) return new Date(dateStr + "T00:00:00.000Z");
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export const attendanceService = {
  async listQrMembers(tenantIdOrSlug: string, search?: string) {
    const tenant = await attendanceRepository.findTenantByLookup(tenantIdOrSlug);
    if (!tenant) return { error: "Gym not found.", status: 404 as const };

    const members = await attendanceRepository.listQrMembers(tenant.id, search);
    return {
      data: {
        tenant,
        members: members.map((member) => ({
          id: member.id,
          memberId: member.memberId,
          name: member.user.name,
          avatarUrl: member.user.avatarUrl,
        })),
      },
    };
  },

  async markQrAttendance(
    tenantIdOrSlug: string,
    actorUserId: string,
    input: QrAttendanceInput,
  ) {
    const tenant = await attendanceRepository.findTenantByLookup(tenantIdOrSlug);
    if (!tenant) return { error: "Gym not found.", status: 404 as const };
    if (tenant.platformExpiresAt && tenant.platformExpiresAt.getTime() < Date.now()) {
      return { error: "Platform access is expired for this gym.", status: 403 as const };
    }

    const result = await this.markAttendance(
      tenant.id,
      actorUserId,
      null,
      { membershipId: input.membershipId },
      true,
    );

    if ("error" in result) {
      return { error: result.error, status: result.status };
    }
    const attendance = result.data.attendance;
    return {
      data: {
        attendance,
        tenant,
        mode: "self" as const,
      },
    };
  },

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

    const record = (await attendanceRepository.markAttendance(
      tenantId,
      targetMembershipId,
      date,
      isSelf ? null : actorMembershipId,
      input.note,
    )) as any;

    // A member who trains is not paused. Ends any freeze covering this day and
    // returns the days they did not use, so attending cannot quietly earn them
    // free time on a frozen membership.
    await freezeService.endForAttendance(tenantId, targetMembershipId, date);

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
/**
   * Check somebody in from a scanned ID card.
   *
   * The desk's half of the QR story. The gym already posts a code members scan
   * with their own phone; this is the other direction — one phone at the
   * counter reading the card each member already carries, which is faster at a
   * queue and works for members who never installed anything.
   *
   * The scanned value is a whole url, because that is what the card encodes and
   * what a scanner hands back. Only the token is used, and only as a lookup:
   * an unknown code is refused rather than guessed at.
   */
  async markByScannedCode(
    tenantId: string,
    actorMembershipId: string | null,
    code: string,
  ) {
    // A card url, or the bare token if somebody typed it. Anything after the
    // last slash, minus any query string a scanner may have kept.
    const token = code.trim().split(/[?#]/)[0]!.split("/").filter(Boolean).pop() ?? "";
    if (!token) {
      return { error: "That code could not be read.", status: 400 as const };
    }

    const membership = await attendanceRepository.findMembershipByCardToken(
      tenantId,
      token,
    );

    if (!membership) {
      return {
        error: "That card does not belong to this gym.",
        status: 404 as const,
      };
    }

    const date = toDateOnly(undefined);

    // Marked even for a lapsed member: they are standing at the desk, and a
    // gym wants the visit recorded whatever it decides about their plan. The
    // status travels back so the screen can say something about it.
    const attendance = await attendanceRepository.markAttendance(
      tenantId,
      membership.id,
      date,
      actorMembershipId,
    );

    return {
      data: {
        attendance,
        member: {
          id: membership.id,
          memberId: membership.memberId,
          name: membership.user.name,
          avatarUrl: membership.user.avatarUrl,
          status: membership.status,
        },
      },
    };
  },

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
    const result = await attendanceRepository.deleteAttendance(tenantId, membershipId, date);
    if (result.count === 0) {
      return { error: "Attendance record not found.", status: 404 as const };
    }
    return { data: { message: "Attendance removed." } };
  },

  /** List attendance for a specific date */
  async listByDate(tenantId: string, date: string, page: number, limit: number) {
    const d = toDateOnly(date);
    const { records, total } = await attendanceRepository.listByDate(tenantId, d, page, limit);
    return {
      data: {
        attendance: records.map((r: any) => ({
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
  async listByMember(
    tenantId: string,
    membershipId: string,
    page: number,
    limit: number,
    callerUserId?: string,
    canReadAll = false,
  ) {
    if (!canReadAll) {
      const membership = await attendanceRepository.findMembership(tenantId, membershipId);
      if (!membership || membership.userId !== callerUserId) {
        return { error: "You can only view your own attendance.", status: 403 as const };
      }
    }

    const { records, total } = await attendanceRepository.listByMember(
      tenantId,
      membershipId,
      page,
      limit,
    );
    return {
      data: {
        attendance: records.map((r: any) => ({
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
  async summary(
    tenantId: string,
    membershipId: string,
    callerUserId?: string,
    canReadAll = false,
  ) {
    if (!canReadAll) {
      const membership = await attendanceRepository.findMembership(tenantId, membershipId);
      if (!membership || membership.userId !== callerUserId) {
        return { error: "You can only view your own attendance summary.", status: 403 as const };
      }
    }

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
  async memberCalendar(
    tenantId: string,
    membershipId: string,
    month: string,
    callerUserId?: string,
    canReadAll = false,
  ) {
    if (!canReadAll) {
      const membership = await attendanceRepository.findMembership(tenantId, membershipId);
      if (!membership || membership.userId !== callerUserId) {
        return { error: "You can only view your own attendance calendar.", status: 403 as const };
      }
    }

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
      {
        count: number;
        members: {
          id: string;
          memberId: number | null;
          name: string;
          avatarUrl: string | null;
          checkInAt: Date;
        }[];
      }
    > = {};
    for (const r of records as any[]) {
      const key = r.date.toISOString().slice(0, 10);
      if (!dayMap[key]) dayMap[key] = { count: 0, members: [] };
      dayMap[key].count++;
      dayMap[key].members.push({
        id: r.member.id,
        memberId: r.member.memberId,
        name: r.member.user.name,
        avatarUrl: r.member.user.avatarUrl ?? null,
        checkInAt: r.checkInAt,
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
