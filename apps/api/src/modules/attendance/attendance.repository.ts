import { prisma } from "../../lib/prisma";

export const attendanceRepository = {
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

  deleteAttendance(tenantId: string, membershipId: string, date: Date) {
    return prisma.attendance.delete({
      where: {
        tenantId_membershipId_date: { tenantId, membershipId, date },
      },
    });
  },

  async listByDate(tenantId: string, date: Date, page: number, limit: number) {
    const where = { tenantId, date };
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

  countByDateRange(tenantId: string, membershipId: string, from: Date, to: Date) {
    return prisma.attendance.count({
      where: { tenantId, membershipId, date: { gte: from, lte: to } },
    });
  },

  /** Get all membershipIds that have attendance on a given date */
  async presentMembershipIds(tenantId: string, date: Date) {
    const records = await prisma.attendance.findMany({
      where: { tenantId, date },
      select: { membershipId: true },
    });
    return new Set(records.map((r) => r.membershipId));
  },

  findMembership(tenantId: string, membershipId: string) {
    return prisma.tenantMembership.findFirst({
      where: { id: membershipId, tenantId, status: "ACTIVE" },
      select: { id: true, userId: true },
    });
  },

  findMembershipByUserId(tenantId: string, userId: string) {
    return prisma.tenantMembership.findFirst({
      where: { tenantId, userId, status: "ACTIVE" },
      select: { id: true },
    });
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
