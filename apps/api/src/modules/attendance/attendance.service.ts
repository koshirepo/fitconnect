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

/** A refusal from any check-in path, carrying the status the route should send. */
export type CheckInFailure = { error: string; status: 400 | 403 | 404 };

/** Either the thing, or why not. Every check-in entry point answers in this shape. */
export type CheckInResult<T> = CheckInFailure | { data: T };

export type CheckInTenant = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  platformExpiresAt: Date | null;
};

/** How a member is identified to `commitCheckIn`, whichever path found them. */
export type CheckInMembership = {
  id: string;
  memberId: number;
  status: string;
  user: { name: string; avatarUrl: string | null };
};

/** What every path reports back after recording one visit. */
export type CheckInOutcome = {
  attendance: {
    id: string;
    date: Date;
    checkInAt: Date;
    note: string | null;
    membershipId: string;
    memberId: number;
    memberName: string;
  };
  member: {
    id: string;
    memberId: number;
    name: string;
    avatarUrl: string | null;
    status: string;
  };
};

export const attendanceService = {
  /**
   * The gym a visit is being recorded against, or a refusal.
   *
   * Accepts an id or a slug so the public QR page and the authenticated paths
   * can share it. The platform-expiry check lives here rather than in one
   * caller: it used to guard the QR route alone, which meant a gym past its
   * expiry could still record attendance through self check-in, the desk
   * scanner or the wall device — so as a commercial gate it did nothing.
   */
  async resolveTenantForCheckIn(
    tenantIdOrSlug: string,
  ): Promise<CheckInResult<CheckInTenant>> {
    const tenant = await attendanceRepository.findTenantByLookup(tenantIdOrSlug);
    if (!tenant) return { error: "Gym not found.", status: 404 as const };
    if (tenant.platformExpiresAt && tenant.platformExpiresAt.getTime() < Date.now()) {
      return { error: "Platform access is expired for this gym.", status: 403 as const };
    }
    return { data: tenant };
  },

  /**
   * Write one visit. The single choke point for every way attendance is marked.
   *
   * Self check-in, the QR poster, a scanned ID card, a staff member marking by
   * hand or in bulk, and the wall-mounted RFID machine all end here. They differ
   * only in how the member was identified and in who is recorded as having
   * marked it; everything that must hold of a recorded visit regardless of its
   * origin belongs in this function, because five copies of that logic is how
   * three of these paths silently drifted apart in the first place.
   *
   * What holds for all of them: the visit is recorded whatever the membership's
   * status — the member is in the building, and the status travels back so the
   * screen can say something about it — and training ends any freeze covering
   * that day, refunding the unused days, so attending cannot quietly earn
   * somebody free time on a paused membership.
   */
  async commitCheckIn(
    tenantId: string,
    membership: CheckInMembership,
    date: Date,
    markedById: string | null,
    note?: string,
  ): Promise<CheckInOutcome> {
    const record = (await attendanceRepository.markAttendance(
      tenantId,
      membership.id,
      date,
      markedById,
      note,
    )) as any;

    await freezeService.endForAttendance(tenantId, membership.id, date);

    return {
      attendance: {
        id: record.id,
        date: record.date,
        checkInAt: record.checkInAt,
        note: record.note,
        membershipId: membership.id,
        memberId: membership.memberId,
        memberName: membership.user.name,
      },
      member: {
        id: membership.id,
        memberId: membership.memberId,
        name: membership.user.name,
        avatarUrl: membership.user.avatarUrl,
        status: membership.status,
      },
    };
  },

  /**
   * Resolve a member by id and record their visit — the form the staff-driven
   * paths take, where the member was picked from a list rather than scanned.
   */
  async recordCheckInById(
    tenantId: string,
    membershipId: string,
    date: Date,
    markedById: string | null,
    note?: string,
  ): Promise<CheckInResult<CheckInOutcome>> {
    const tenant = await this.resolveTenantForCheckIn(tenantId);
    if ("error" in tenant) return tenant;

    const membership = await attendanceRepository.findMembershipForCheckIn(
      tenant.data.id,
      membershipId,
    );
    if (!membership) return { error: "Member not found.", status: 404 as const };

    return {
      data: await this.commitCheckIn(tenant.data.id, membership, date, markedById, note),
    };
  },

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
  ): Promise<
    CheckInResult<CheckInOutcome & { tenant: CheckInTenant; mode: "self" }>
  > {
    const tenant = await this.resolveTenantForCheckIn(tenantIdOrSlug);
    if ("error" in tenant) return tenant;

    if (!input.membershipId) {
      return { error: "Pick who is checking in.", status: 400 as const };
    }

    // The poster names the member; scanning it is the member acting on their
    // own behalf, so nobody is recorded as having marked it for them.
    const result = await this.recordCheckInById(
      tenant.data.id,
      input.membershipId,
      toDateOnly(undefined),
      null,
    );
    if ("error" in result) return result;

    return {
      data: {
        attendance: result.data.attendance,
        member: result.data.member,
        tenant: tenant.data,
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
  ): Promise<CheckInResult<CheckInOutcome>> {
    const date = toDateOnly(input.date);

    const tenant = await this.resolveTenantForCheckIn(tenantId);
    if ("error" in tenant) return tenant;

    // The only thing separating a self check-in from a staff mark: who is
    // identified, and by what. Everything after this is the same act.
    const membership = isSelf
      ? await attendanceRepository.findMembershipForCheckInByUserId(tenant.data.id, actorUserId)
      : input.membershipId
        ? await attendanceRepository.findMembershipForCheckIn(tenant.data.id, input.membershipId)
        : null;

    if (!membership) {
      if (isSelf) return { error: "You are not a member of this gym.", status: 403 as const };
      if (!input.membershipId) {
        return { error: "membershipId is required.", status: 400 as const };
      }
      return { error: "Member not found.", status: 404 as const };
    }

    return {
      data: await this.commitCheckIn(
        tenant.data.id,
        membership,
        date,
        isSelf ? null : actorMembershipId,
        input.note,
      ),
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
  ): Promise<CheckInResult<CheckInOutcome>> {
    // A card url, or the bare token if somebody typed it. Anything after the
    // last slash, minus any query string a scanner may have kept.
    const token = code.trim().split(/[?#]/)[0]!.split("/").filter(Boolean).pop() ?? "";
    if (!token) {
      return { error: "That code could not be read.", status: 400 as const };
    }

    const tenant = await this.resolveTenantForCheckIn(tenantId);
    if ("error" in tenant) return tenant;

    const membership = await attendanceRepository.findMembershipByCardToken(
      tenant.data.id,
      token,
    );
    if (!membership) {
      return { error: "That card does not belong to this gym.", status: 404 as const };
    }

    return {
      data: await this.commitCheckIn(
        tenant.data.id,
        membership,
        toDateOnly(undefined),
        actorMembershipId,
      ),
    };
  },

  /**
   * Mark a roomful of members at once.
   *
   * Goes through the same per-member path as marking one by hand, rather than
   * writing rows directly: a member marked in bulk gets their freeze ended and
   * their membership checked against this gym exactly as they would have if the
   * desk had marked them individually. `allSettled` keeps one bad id from
   * losing the rest of the room, and the ids that failed come back so the
   * screen can say which.
   */
  async markAll(
    tenantId: string,
    actorMembershipId: string | null,
    input: MarkAllAttendanceInput,
  ): Promise<CheckInResult<{ marked: number; total: number; failed: string[] }>> {
    const tenant = await this.resolveTenantForCheckIn(tenantId);
    if ("error" in tenant) return tenant;

    const date = toDateOnly(input.date);

    // One lookup for the room, then the same commit each of them would have got
    // individually. Resolving the gym and the member per id would turn marking
    // a class into a few hundred queries.
    const memberships = await attendanceRepository.findMembershipsForCheckIn(
      tenant.data.id,
      input.membershipIds,
    );
    const byId = new Map(memberships.map((membership) => [membership.id, membership]));

    const failed: string[] = [];
    let marked = 0;

    for (const membershipId of input.membershipIds) {
      const membership = byId.get(membershipId);
      if (!membership) {
        failed.push(membershipId);
        continue;
      }
      try {
        await this.commitCheckIn(tenant.data.id, membership, date, actorMembershipId);
        marked += 1;
      } catch {
        // One member's row failing should not cost the rest of the room theirs.
        failed.push(membershipId);
      }
    }

    return { data: { marked, total: input.membershipIds.length, failed } };
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
