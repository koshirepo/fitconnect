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
              user: { select: { id: true, name: true, avatarUrl: true } },
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
   * Run the `find membership` persistence operation for the attendance module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
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
        user: { select: { name: true, avatarUrl: true } },
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
        member: {
          select: {
            id: true,
            memberId: true,
            user: { select: { name: true } },
          },
        },
      },
      orderBy: { date: "asc" },
    });
    return records;
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
