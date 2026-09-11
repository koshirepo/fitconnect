/**
 * Documentation: Attendance repository.
 *
 * - Encapsulates Prisma queries for member check-ins, staff attendance marking, summaries, and calendar views, including relation loading and write patterns that are specific to the persistence layer.
 * - Keep raw database concerns here so the service layer can reason about domain behavior without duplicating query details.
 * - Primary exports: attendanceRepository.
 */
import { prisma } from "../../lib/prisma";

function dayRange(date: Date) {
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

/**
 * Everything a check-in response says about the member it recorded.
 *
 * One shape for all five entry points, so a screen can render the outcome of a
 * card scan and the outcome of a manual mark with the same component — status
 * included, because that is now reported rather than enforced.
 */
const MEMBER_CHECK_IN_SELECT = {
  id: true,
  memberId: true,
  status: true,
  userId: true,
  user: { select: { id: true, name: true, avatarUrl: true } },
} as const;

export const attendanceRepository = {
  findTenantByLookup(tenantIdOrSlug: string) {
    return prisma.tenant.findFirst({
      where: {
        OR: [{ id: tenantIdOrSlug }, { slug: tenantIdOrSlug }],
        status: "ACTIVE",
      },
      select: { id: true, name: true, slug: true, logoUrl: true, platformExpiresAt: true },
    });
  },

  /**
   * Run the `mark attendance` persistence operation for the attendance module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  markAttendance(
    tenantId: string,
    membershipId: string,
    date: Date,
    markedById?: string | null,
    note?: string,
  ) {
    return prisma.attendance.upsert({
      where: {
        tenantId_membershipId_date: { tenantId, membershipId, date },
      },
      create: { tenantId, membershipId, date, markedById: markedById ?? null, note },
      update: {},
      select: {
        id: true,
        date: true,
        checkInAt: true,
        note: true,
        member: {
          select: {
            id: true,
            memberId: true,
            user: { select: { id: true, name: true } },
          },
        },
      },
    });
  },

  /**
   * Run the `delete attendance` persistence operation for the attendance module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  deleteAttendance(tenantId: string, membershipId: string, date: Date) {
    const { start, end } = dayRange(date);
    return prisma.attendance.deleteMany({
      where: {
        tenantId,
        membershipId,
        date: { gte: start, lt: end },
      },
    });
  },

  /**
   * Run the `list by date` persistence operation for the attendance module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  async listByDate(tenantId: string, date: Date, page: number, limit: number) {
    const { start, end } = dayRange(date);
    const where = {
      tenantId,
      date: { gte: start, lt: end },
    };
    const [records, total] = await Promise.all([
      prisma.attendance.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { checkInAt: "desc" },
        select: {
          id: true,
          date: true,
          checkInAt: true,
          note: true,
          member: {
            select: {
              id: true,
              memberId: true,
              user: { select: { id: true, name: true, gender: true, avatarUrl: true } },
            },
          },
          markedBy: {
            select: {
              id: true,
              user: { select: { id: true, name: true } },
            },
          },
        },
      }),
      prisma.attendance.count({ where }),
    ]);
    return { records, total };
  },

  /**
   * Run the `list by member` persistence operation for the attendance module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  async listByMember(tenantId: string, membershipId: string, page: number, limit: number) {
    const where = { tenantId, membershipId };
    const [records, total] = await Promise.all([
      prisma.attendance.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { date: "desc" },
        select: {
          id: true,
          date: true,
          checkInAt: true,
          note: true,
          markedBy: {
            select: {
              id: true,
              user: { select: { id: true, name: true } },
            },
          },
        },
      }),
      prisma.attendance.count({ where }),
    ]);
    return { records, total };
  },

  /**
   * Run the `count by date range` persistence operation for the attendance module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  countByDateRange(tenantId: string, membershipId: string, from: Date, to: Date) {
    return prisma.attendance.count({
      where: { tenantId, membershipId, date: { gte: from, lte: to } },
    });
  },

  /** Get all membershipIds that have attendance on a given date */
  async presentMembershipIds(tenantId: string, date: Date) {
    const { start, end } = dayRange(date);
    const records = await prisma.attendance.findMany({
      where: { tenantId, date: { gte: start, lt: end } },
      select: { membershipId: true },
    });
    return new Set(records.map((r) => r.membershipId));
  },

  /**
   * A membership in this gym, whatever state it is in.
   *
   * Deliberately unfiltered by status, unlike `findMembership`. Recording a
   * visit is a statement about somebody standing in the building, not about
   * whether their plan is paid up — so the check-in paths resolve members with
   * this and report the status back rather than refusing. The ACTIVE-only
   * lookups below remain for the places that gate on membership standing.
   */
  findMembershipForCheckIn(tenantId: string, membershipId: string) {
    return prisma.tenantMembership.findFirst({
      where: { id: membershipId, tenantId },
      select: MEMBER_CHECK_IN_SELECT,
    });
  },

  /** The same lookup for a whole list of members, in one query. */
  findMembershipsForCheckIn(tenantId: string, membershipIds: string[]) {
    if (!membershipIds.length) return Promise.resolve([]);
    return prisma.tenantMembership.findMany({
      where: { tenantId, id: { in: membershipIds } },
      select: MEMBER_CHECK_IN_SELECT,
    });
  },

  /** The caller's own membership, whatever state it is in. See above. */
  findMembershipForCheckInByUserId(tenantId: string, userId: string) {
    return prisma.tenantMembership.findFirst({
      where: { tenantId, userId },
      select: MEMBER_CHECK_IN_SELECT,
    });
  },

  /**
   * The memberships behind a batch of device PINs.
   *
   * One query for a whole upload: a busy morning arrives from the machine as a
   * single batch of many rows, and resolving each punch on its own would turn
   * that into a query storm.
   */
  findMembershipsByDevicePins(tenantId: string, pins: number[]) {
    if (!pins.length) return Promise.resolve([]);
    return prisma.tenantMembership.findMany({
      where: { tenantId, deviceUserPin: { in: pins } },
      select: { ...MEMBER_CHECK_IN_SELECT, deviceUserPin: true },
    });
  },

  findMembership(tenantId: string, membershipId: string) {
    return prisma.tenantMembership.findFirst({
      where: { id: membershipId, tenantId, status: "ACTIVE" },
      select: { id: true, userId: true },
    });
  },

  /**
   * Run the `find membership by user id` persistence operation for the attendance module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  findMembershipByUserId(tenantId: string, userId: string) {
    return prisma.tenantMembership.findFirst({
      where: { tenantId, userId, status: "ACTIVE" },
      select: { id: true },
    });
  },

  async listQrMembers(tenantId: string, search?: string) {
    const trimmed = search?.trim();
    const members = await prisma.tenantMembership.findMany({
      where: {
        tenantId,
        status: "ACTIVE",
        role: "MEMBER",
        ...(trimmed
          ? {
              OR: [
                { user: { name: { contains: trimmed } } },
                { user: { phone: { contains: trimmed } } },
                ...(Number.isFinite(Number(trimmed)) ? [{ memberId: Number(trimmed) }] : []),
              ],
            }
          : {}),
      },
      take: 100,
      orderBy: [{ memberId: "asc" }],
      select: {
        id: true,
        memberId: true,
        user: { select: { name: true, gender: true, avatarUrl: true } },
      },
    });

    return members;
  },

  /** Daily attendance counts + member lists for a month */
  async monthlyCounts(tenantId: string, from: Date, to: Date) {
    const records = await prisma.attendance.findMany({
      where: { tenantId, date: { gte: from, lte: to } },
      select: {
        date: true,
        // The clock time of the punch, not just the day it fell on — the
        // calendar lists who came, and when is half of that.
        checkInAt: true,
        member: {
          select: {
            id: true,
            memberId: true,
            user: { select: { name: true, avatarUrl: true } },
          },
        },
      },
      orderBy: { date: "asc" },
    });
    return records;
  },

  /**
   * The zone the gym keeps its hours in.
   *
   * Read raw and guarded rather than through the model, because the column
   * arrives with migration 0049 and this app has shipped ahead of its
   * migrations before — settings.repository carries the same kind of guard for
   * the same reason. A gym whose database has not caught up should get a report
   * in the default zone, not a 500.
   */
  async getTenantTimezone(tenantId: string): Promise<{ timezone: string } | null> {
    try {
      const rows = await prisma.$queryRaw<{ timezone: string | null }[]>`
        SELECT "timezone" FROM "TenantSettings" WHERE "tenantId" = ${tenantId} LIMIT 1
      `;
      const timezone = rows[0]?.timezone;
      return timezone ? { timezone } : null;
    } catch {
      return null;
    }
  },

  /**
   * Members who have stopped coming, with the date they last did.
   *
   * One grouped statement rather than a read of every check-in: the answer is a
   * single row per member and the table it comes from is the largest in the
   * gym, so folding it in SQL is the difference between a handful of rows and a
   * year of visits crossing the wire to be reduced in memory.
   *
   * A LEFT JOIN rather than an inner one, because the member who joined in
   * March and never came back is the most at-risk person in the building and an
   * inner join is exactly the shape that hides them.
   *
   * Three exclusions, each of which would otherwise fill the list with people
   * staff cannot act on:
   *
   * - Anyone on an open freeze. Their absence was arranged with the desk; the
   *   gym already knows and calling them looks like it does not.
   * - Anyone who joined inside the window. A member of nine days cannot be
   *   twenty-one days absent, and reporting them as such teaches staff to
   *   distrust the list.
   * - Anyone not ACTIVE, who is a different conversation than this one.
   * - Staff. An admin or a coach holds a membership row like everybody else,
   *   and most gyms never make them check in — so without this the top of the
   *   list is the gym's own employees, reported as never having attended. A
   *   list that opens with three false alarms does not get opened again.
   */
  async listAtRisk(tenantId: string, absentSince: Date, joinedBefore: Date) {
    return prisma.$queryRaw<
      {
        membershipId: string;
        memberId: number | bigint;
        name: string;
        phone: string | null;
        avatarUrl: string | null;
        // The adapter maps date columns back to `Date` before this returns —
        // the `MAX()` included, which looks like it should stay text and does
        // not. Typed loosely and normalised in the service, because that
        // mapping is the adapter's decision to change, not a contract.
        dueDate: Date | string | null;
        joinedAt: Date | string;
        lastVisitOn: Date | string | null;
        lastNudgedAt: Date | string | null;
      }[]
    >`
      SELECT
        m."id"          AS membershipId,
        m."memberId"    AS memberId,
        u."name"        AS name,
        u."phone"       AS phone,
        u."avatarUrl"   AS avatarUrl,
        m."dueDate"     AS dueDate,
        m."joinedAt"    AS joinedAt,
        MAX(a."date")   AS lastVisitOn,
        -- When somebody last reached out about this same absence. Without it
        -- three people at the desk message the same member on the same
        -- morning, which reads to the member as a gym that is not paying
        -- attention rather than one that is.
        (
          SELECT MAX(r."sentAt")
          FROM "PaymentReminder" r
          WHERE r."membershipId" = m."id" AND r."reason" = 'ATTENDANCE_LAPSE'
        )               AS lastNudgedAt
      FROM "TenantMembership" m
      JOIN "User" u ON u."id" = m."userId"
      LEFT JOIN "Attendance" a ON a."membershipId" = m."id"
      WHERE m."tenantId" = ${tenantId}
        AND m."status" = 'ACTIVE'
        AND m."role" = 'MEMBER'
        AND m."joinedAt" < ${joinedBefore}
        AND NOT EXISTS (
          SELECT 1 FROM "MembershipFreeze" f
          WHERE f."membershipId" = m."id" AND f."endedOn" IS NULL
        )
      GROUP BY m."id"
      HAVING lastVisitOn IS NULL OR lastVisitOn < ${absentSince}
      ORDER BY lastVisitOn ASC
    `;
  },

  /**
   * When people actually walked in, counted per quarter-hour of UTC.
   *
   * Only self check-ins — `markedById IS NULL` — which is the whole reason this
   * is a separate read rather than a `GROUP BY` over the register. A staff mark
   * stamps `checkInAt` with the moment somebody pressed the button at the desk,
   * not the moment the member arrived; the seed database has a visit marked at
   * 23:15 local for exactly that reason. Feed those into an hourly chart and
   * the gym grows a late-night rush it does not have.
   *
   * Aggregated in SQL to a fixed grid rather than read row by row: the result
   * is at most a few thousand buckets whatever the size of the gym, where the
   * rows behind it grow forever.
   */
  listCheckInBuckets(tenantId: string, from: Date, to: Date) {
    return prisma.$queryRaw<
      { hourKey: string; quarter: number | bigint; visits: number | bigint }[]
    >`
      SELECT
        substr("checkInAt", 1, 13) AS hourKey,
        CAST(substr("checkInAt", 15, 2) AS INTEGER) / 15 AS quarter,
        COUNT(*) AS visits
      FROM "Attendance"
      WHERE "tenantId" = ${tenantId}
        AND "markedById" IS NULL
        AND "checkInAt" >= ${from}
        AND "checkInAt" < ${to}
      GROUP BY hourKey, quarter
    `;
  },

  /**
   * Visits in the same window that a member of staff recorded by hand.
   *
   * Reported alongside the chart rather than dropped silently. A gym that marks
   * everybody at the desk gets an empty heatmap, and without this number the
   * screen cannot tell them why — it would look like nobody came.
   */
  countManualMarks(tenantId: string, from: Date, to: Date) {
    return prisma.attendance.count({
      where: { tenantId, markedById: { not: null }, checkInAt: { gte: from, lt: to } },
    });
  },

  /** Members whose term is paused right now, and so are absent on purpose. */
  countActiveFreezes(tenantId: string) {
    return prisma.membershipFreeze.count({
      where: { tenantId, endedOn: null },
    });
  },

  /** Daily attendance dates for a single member in a month */
  async memberMonthlyDates(tenantId: string, membershipId: string, from: Date, to: Date) {
    const records = await prisma.attendance.findMany({
      where: { tenantId, membershipId, date: { gte: from, lte: to } },
      select: { date: true },
      orderBy: { date: "asc" },
    });
    return records.map((r) => r.date);
  },
};
