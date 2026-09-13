/**
 * Documentation: Attendance service.
 *
 * - Implements the business rules for member check-ins, staff attendance marking, summaries, and calendar views by coordinating repositories, shared helpers, and cross-cutting utilities like email or audit logging where needed.
 * - Prefer placing workflow logic, derived calculations, and domain invariants here instead of inside controllers or repositories.
 * - Primary exports: attendanceService.
 */
import { attendanceRepository } from "./attendance.repository";
import { freezeService } from "../freezes/freezes.service";
import { daysBetween, toDay, toDayString, zoneDayStart, zoneToday } from "../../lib/timezone";
import { buildHeatmapGrid, buildOccupancyGrid } from "./attendance.heatmap";
import { resolvePunchShift, type ShiftWindow } from "./shift-window";
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

/**
 * Where a gym is, when it has not said.
 *
 * Matches the column default and the zone every reader ships with, so a gym
 * that never opened the settings screen reads the same as one that did.
 */
const DEFAULT_TIMEZONE = "Asia/Kolkata";

/**
 * How long a session may stay open before it is treated as abandoned.
 *
 * Eighteen hours clears the longest shift a gym plausibly runs while still
 * catching the same night's forgotten check-outs on the next morning's sweep.
 */
const ABANDONED_AFTER_MS = 18 * 60 * 60 * 1000;

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
  /** The zone the gym's clock runs in, which shift windows are written in. */
  timezone: string;
};

/**
 * What a check-in needs to know about the gym beyond the member in front of it.
 *
 * Passed in rather than fetched per member, because marking a roomful would
 * otherwise re-read the same shifts once for every person in it.
 */
export type CheckInContext = {
  timezone: string;
  shifts: ShiftWindow[];
  /**
   * A day the desk named explicitly, for marking somebody present in the past.
   * There is no wall clock to read a shift off a week ago, so a visit recorded
   * this way is filed on that day with no shift.
   */
  forDate?: Date | null;
};

/** How a member is identified to `commitCheckIn`, whichever path found them. */
export type CheckInMembership = {
  id: string;
  memberId: number;
  status: string;
  /** The shift they are rostered on, which breaks ties between windows. */
  shiftId?: string | null;
  user: { name: string; avatarUrl: string | null };
};

/** What every path reports back after recording one visit. */
export type CheckInOutcome = {
  attendance: {
    id: string;
    date: Date;
    checkInAt: Date;
    checkOutAt: Date | null;
    shiftId: string | null;
    note: string | null;
    membershipId: string;
    memberId: number;
    memberName: string;
  };
  /**
   * What this tap turned out to be.
   *
   * `IGNORED` is a second read of the same card moments after the first — a
   * real event that changed nothing, and worth saying so rather than reporting
   * a check-out that did not happen.
   */
  direction: "CHECKED_IN" | "CHECKED_OUT" | "IGNORED";
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
  /**
   * The gym's clock and its shift windows, read once for a check-in.
   *
   * Every path already holds the tenant it resolved, so this only fetches the
   * shifts — and marking a roomful builds it once instead of per person.
   */
  async checkInContext(
    tenant: CheckInTenant,
    forDate?: Date | null,
  ): Promise<CheckInContext> {
    const shifts = await attendanceRepository.findActiveShifts(tenant.id);

    return {
      timezone: tenant.timezone || DEFAULT_TIMEZONE,
      shifts,
      forDate: forDate ?? null,
    };
  },

  async commitCheckIn(
    tenantId: string,
    membership: CheckInMembership,
    at: Date,
    markedById: string | null,
    note?: string,
    context?: CheckInContext,
  ): Promise<CheckInOutcome> {
    const ctx =
      context ??
      (await this.checkInContext({
        id: tenantId,
        name: "",
        slug: "",
        logoUrl: null,
        platformExpiresAt: null,
        timezone: DEFAULT_TIMEZONE,
      }));

    const resolved = resolvePunchShift(at, ctx.timezone, ctx.shifts, membership.shiftId ?? null);

    let day = resolved.day;
    let shiftId = resolved.shift?.id ?? null;
    let shiftKey = resolved.shiftKey;

    /**
     * A day named by the desk wins over the one the clock implies.
     *
     * Marking somebody present last Tuesday is not a tap: there is no wall
     * clock to read a shift off, so it is filed on the day it was meant for
     * with no shift rather than being attributed to whichever window happened
     * to be open when the button was pressed.
     */
    if (ctx.forDate && ctx.forDate.getTime() !== zoneToday(ctx.timezone, at).getTime()) {
      day = ctx.forDate;
      shiftId = null;
      shiftKey = "none";
    }

    const { session, direction } = await attendanceRepository.recordPunch({
      tenantId,
      membershipId: membership.id,
      day,
      shiftKey,
      shiftId,
      at,
      markedById,
      note,
    });

    await freezeService.endForAttendance(tenantId, membership.id, day);

    return {
      attendance: {
        id: session.id,
        date: session.date,
        checkInAt: session.checkInAt,
        checkOutAt: session.checkOutAt,
        shiftId: session.shiftId,
        note: session.note,
        membershipId: membership.id,
        memberId: membership.memberId,
        memberName: membership.user.name,
      },
      direction,
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
      data: await this.commitCheckIn(
        tenant.data.id,
        membership,
        new Date(),
        markedById,
        note,
        await this.checkInContext(tenant.data, date),
      ),
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
        // Carried through so the poster can say "checked out" rather than
        // reporting every tap as an arrival.
        direction: result.data.direction,
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
        new Date(),
        isSelf ? null : actorMembershipId,
        input.note,
        await this.checkInContext(tenant.data, date),
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
    // Read once for the room rather than once per person in it.
    const context = await this.checkInContext(tenant.data, date);

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
        await this.commitCheckIn(
          tenant.data.id,
          membership,
          new Date(),
          actorMembershipId,
          undefined,
          context,
        );
        marked += 1;
      } catch {
        // One member's row failing should not cost the rest of the room theirs.
        failed.push(membershipId);
      }
    }

    return { data: { marked, total: input.membershipIds.length, failed } };
  },

  /**
   * Close out sessions nobody checked out of.
   *
   * Judged on age rather than on each shift's own end, because the two agree
   * where it matters and the simpler rule cannot be wrong about a shift that
   * was edited or deleted after the fact: a session still open the better part
   * of a day later was not closed, whatever window it belonged to.
   */
  async closeAbandonedSessions(now: Date = new Date()) {
    const before = new Date(now.getTime() - ABANDONED_AFTER_MS);
    const closed = await attendanceRepository.closeAbandonedSessions(before);

    return { data: { closed } };
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
          checkOutAt: r.checkOutAt,
          shiftId: r.shiftId,
          shiftName: r.shift?.name ?? null,
          closedAutomatically: r.closedAutomatically,
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
          checkOutAt: r.checkOutAt,
          shiftId: r.shiftId,
          shiftName: r.shift?.name ?? null,
          closedAutomatically: r.closedAutomatically,
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

  /**
   * Members who have stopped coming while their membership is still running.
   *
   * The gym already gets told when money is due. Nobody is told when somebody
   * quietly stops turning up, which happens weeks earlier and is the thing that
   * decides whether the renewal gets paid at all. This is that list.
   *
   * Counted in the gym's own days, not UTC ones: at 04:00 in India the UTC day
   * is still yesterday, so a UTC-based threshold would report every absence one
   * day short for the first five and a half hours of every morning.
   *
   * `dueDate` rides along because absence alone does not say how urgent
   * somebody is. Absent three weeks with a renewal on Friday is today's phone
   * call; the same absence with eight months paid up is a different one.
   */
  async atRisk(tenantId: string, thresholdDays: number) {
    const settings = await attendanceRepository.getTenantTimezone(tenantId);
    const timezone = settings?.timezone ?? DEFAULT_TIMEZONE;

    const today = zoneToday(timezone);
    const absentSince = new Date(today);
    absentSince.setUTCDate(absentSince.getUTCDate() - thresholdDays);

    const [rows, frozen] = await Promise.all([
      attendanceRepository.listAtRisk(tenantId, absentSince, absentSince),
      attendanceRepository.countActiveFreezes(tenantId),
    ]);

    const members = rows.map((row) => {
      // The driver decides the shape it hands dates back in and does not hand
      // every column back in the same one — `toDayString` is what makes that
      // not this layer's problem. `memberId` gets `Number` for the same class
      // of reason: an integer column can arrive as a bigint, which serialises
      // to nothing at all.
      const lastVisit = toDay(row.lastVisitOn);
      const due = toDay(row.dueDate);

      return {
        membershipId: row.membershipId,
        memberId: Number(row.memberId),
        name: row.name,
        phone: row.phone,
        avatarUrl: row.avatarUrl,
        lastVisitOn: toDayString(row.lastVisitOn),
        absentDays: lastVisit ? daysBetween(lastVisit, today) : null,
        dueDate: toDayString(row.dueDate),
        daysToDue: due ? daysBetween(today, due) : null,
        joinedAt: toDayString(row.joinedAt),
        lastNudgedOn: toDayString(row.lastNudgedAt),
      };
    });

    return {
      data: {
        members,
        summary: {
          thresholdDays,
          total: members.length,
          // The subset worth calling first: still absent, and the money is
          // about to be decided one way or the other.
          dueSoon: members.filter((m) => m.daysToDue !== null && m.daysToDue <= 14).length,
          frozen,
          timezone,
        },
      },
    };
  },

  /**
   * When the floor is busy, as a week of local hours.
   *
   * The staffing question the register cannot answer: it says how many came on
   * a given day, never at what time, so a gym rosters its desk and its coaches
   * on memory. Four weeks is the default window — long enough that one holiday
   * or one washed-out Tuesday does not set the shape, short enough to still
   * describe how the gym runs now.
   *
   * Counts self check-ins only. What that leaves out is returned beside it, so
   * a gym that marks attendance by hand is told why its chart is empty instead
   * of being shown an empty floor.
   */
  async heatmap(tenantId: string, weeks: number) {
    const settings = await attendanceRepository.getTenantTimezone(tenantId);
    const timezone = settings?.timezone ?? DEFAULT_TIMEZONE;

    // Whole local days, ending at the end of today. Built from the instant
    // local midnight fell at rather than from the midnight-UTC day stamp: for
    // India those are five and a half hours apart, which would slide every
    // window edge into the previous evening.
    const startOfToday = zoneDayStart(timezone);
    const to = new Date(startOfToday.getTime() + 86_400_000);
    const from = new Date(to.getTime() - weeks * 7 * 86_400_000);

    const [buckets, manualMarks, spans] = await Promise.all([
      attendanceRepository.listCheckInBuckets(tenantId, from, to),
      attendanceRepository.countManualMarks(tenantId, from, to),
      attendanceRepository.listSessionSpans(tenantId, from, to),
    ]);

    // How full the floor was, from whole visits rather than arrivals.
    const occupancy = buildOccupancyGrid(
      spans.map((span) => ({
        checkInAt: span.checkInAt,
        checkOutAt: span.checkOutAt,
        open: !span.checkOutAt && !span.closedAutomatically,
      })),
      timezone,
      weeks,
    );

    const { grid, total, busiestHour, busiestDay, unplaced } = buildHeatmapGrid(
      buckets.map((bucket) => ({
        hourKey: bucket.hourKey,
        quarter: Number(bucket.quarter),
        visits: Number(bucket.visits),
      })),
      timezone,
    );

    return {
      data: {
        grid,
        summary: {
          weeks,
          total,
          busiestHour,
          busiestDay,
          /** Staff-marked visits left out, because their clock is the desk's. */
          manualMarks,
          unplaced,
          timezone,
          from: from.toISOString(),
          to: to.toISOString(),
        },
        occupancy,
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
          /** Null while they are still inside, or were never checked out. */
          checkOutAt: Date | null;
          /** True when the nightly sweep closed a session nobody tapped out of. */
          closedAutomatically: boolean;
          shiftId: string | null;
          shiftName: string | null;
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
        checkOutAt: r.checkOutAt ?? null,
        closedAutomatically: Boolean(r.closedAutomatically),
        shiftId: r.shift?.id ?? null,
        shiftName: r.shift?.name ?? null,
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
