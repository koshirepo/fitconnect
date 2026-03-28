/**
 * Documentation: Payments repository.
 *
 * - Encapsulates Prisma queries for subscription management, payment collection, and membership validity tracking, including relation loading and write patterns that are specific to the persistence layer.
 * - Keep raw database concerns here so the service layer can reason about domain behavior without duplicating query details.
 * - Primary exports: paymentRepository.
 */
import { prisma } from "../../lib/prisma";
import type { PaymentStatus } from "../../shared/types/enums";

export const paymentRepository = {
  /**
   * Run the `list payments` persistence operation for the payments module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  async listPayments(
    tenantId: string,
    page: number,
    limit: number,
    statusFilter?: string,
    search?: string,
    membershipId?: string,
  ) {
    const where: Record<string, unknown> = { tenantId };
    if (statusFilter && ["PENDING", "COMPLETED", "FAILED", "REFUNDED"].includes(statusFilter)) {
      where.status = statusFilter as PaymentStatus;
    }
    if (membershipId) {
      where.membershipId = membershipId;
    }
    if (search) {
      where.member = {
        user: {
          OR: [
            { name: { contains: search } },
            { email: { contains: search } },
            { phone: { contains: search } },
          ],
        },
      };
    }

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          amount: true,
          status: true,
          paidAt: true,
          validFrom: true,
          validUntil: true,
          description: true,
          createdAt: true,
          member: {
            select: {
              id: true,
              memberId: true,
              user: { select: { id: true, name: true, email: true, phone: true, avatarUrl: true } },
            },
          },
          subscription: { select: { id: true, title: true } },
          collectedBy: {
            select: {
              id: true,
              user: { select: { id: true, name: true, email: true, phone: true } },
            },
          },
        },
      }),
      prisma.payment.count({ where }),
    ]);

    return { payments, total };
  },

  /**
   * Run the `find membership by user` persistence operation for the payments module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  findMembershipByUser(tenantId: string, userId: string) {
    return prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { id: true },
    });
  },

  /**
   * Run the `list my payments` persistence operation for the payments module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  listMyPayments(membershipId: string) {
    return prisma.payment.findMany({
      where: { membershipId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        amount: true,
        status: true,
        paidAt: true,
        validFrom: true,
        validUntil: true,
        description: true,
        subscription: { select: { id: true, title: true } },
        createdAt: true,
      },
    });
  },

  /**
   * Run the `find active membership` persistence operation for the payments module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  findActiveMembership(membershipId: string, tenantId: string) {
    return prisma.tenantMembership.findFirst({
      where: { id: membershipId, tenantId, status: "ACTIVE" },
      select: { id: true },
    });
  },

  /**
   * Run the `find membership by id` persistence operation for the payments module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  findMembershipById(membershipId: string, tenantId: string) {
    return prisma.tenantMembership.findFirst({
      where: { id: membershipId, tenantId },
      select: { id: true, status: true, dueDate: true },
    });
  },

  /**
   * Run the `find subscription` persistence operation for the payments module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  findSubscription(subscriptionId: string, tenantId: string) {
    return prisma.subscription.findFirst({
      where: { id: subscriptionId, tenantId },
      select: { id: true },
    });
  },

  /**
   * Run the `create payment` persistence operation for the payments module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  createPayment(data: {
    tenantId: string;
    membershipId: string;
    subscriptionId?: string;
    chargeId?: string;
    description?: string;
    note?: string;
    status?: "PENDING" | "COMPLETED";
    amount: number;
    collectorId?: string;
    paidAt?: Date;
    validFrom?: Date;
    validUntil?: Date;
  }) {
    return prisma.payment.create({
      data,
      select: {
        id: true,
        amount: true,
        status: true,
        createdAt: true,
        member: {
          select: {
            id: true,
            memberId: true,
            user: { select: { id: true, name: true, email: true, phone: true } },
          },
        },
      },
    });
  },

  /**
   * Run the `find payment` persistence operation for the payments module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  findPayment(paymentId: string, tenantId: string) {
    return prisma.payment.findFirst({
      where: { id: paymentId, tenantId },
      select: {
        id: true,
        status: true,
        membershipId: true,
        amount: true,
        description: true,
        note: true,
        validFrom: true,
        validUntil: true,
      },
    });
  },

  /**
   * Run the `find payment detail` persistence operation for the payments module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  findPaymentDetail(paymentId: string, tenantId: string) {
    return prisma.payment.findFirst({
      where: { id: paymentId, tenantId },
      select: {
        id: true,
        amount: true,
        description: true,
        note: true,
        status: true,
        paidAt: true,
        validFrom: true,
        validUntil: true,
        createdAt: true,
        updatedAt: true,
        membershipId: true,
        member: {
          select: {
            id: true,
            memberId: true,
            user: { select: { id: true, name: true, email: true, phone: true } },
          },
        },
        collectedBy: {
          select: {
            id: true,
            user: { select: { id: true, name: true, email: true, phone: true } },
          },
        },
        subscription: {
          select: {
            id: true,
            title: true,
            amount: true,
            durationDays: true,
          },
        },
      },
    });
  },

  /**
   * Run the `update payment status` persistence operation for the payments module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  updatePaymentStatus(paymentId: string, status: PaymentStatus) {
    return prisma.payment.update({
      where: { id: paymentId },
      data: {
        status,
        paidAt: status === "COMPLETED" ? new Date() : undefined,
      },
      select: { id: true, amount: true, status: true, paidAt: true },
    });
  },

  /**
   * Run the `list subscriptions` persistence operation for the payments module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  listSubscriptions(tenantId: string) {
    return prisma.subscription.findMany({
      where: { tenantId, isActive: true },
      orderBy: { amount: "asc" },
      select: {
        id: true,
        title: true,
        description: true,
        amount: true,
        durationDays: true,
        isActive: true,
      },
    });
  },

  /**
   * Run the `create subscription` persistence operation for the payments module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  createSubscription(
    tenantId: string,
    data: {
      title: string;
      description?: string;
      amount: number;
      durationDays: number;
    },
  ) {
    return prisma.subscription.create({
      data: { ...data, tenantId },
      select: { id: true, title: true, amount: true, durationDays: true },
    });
  },

  /**
   * Run the `update payment` persistence operation for the payments module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  updatePayment(
    paymentId: string,
    data: {
      amount?: number;
      description?: string;
      note?: string | null;
      validFrom?: Date | null;
      validUntil?: Date | null;
    },
  ) {
    return prisma.payment.update({
      where: { id: paymentId },
      data,
      select: { id: true, amount: true, status: true, paidAt: true },
    });
  },

  /** Recalculate and persist the membership's dueDate from its latest payment validUntil. */
  async refreshDueDate(membershipId: string) {
    const latest = await prisma.payment.findFirst({
      where: { membershipId, validUntil: { not: null } },
      orderBy: { validUntil: "desc" },
      select: { validUntil: true },
    });
    await prisma.tenantMembership.update({
      where: { id: membershipId },
      data: { dueDate: latest?.validUntil ?? null },
    });
  },

  /**
   * Run the `get payment analytics` persistence operation for the payments module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  async getPaymentAnalytics(tenantId: string) {
    const now = new Date();

    // Start of today, this week (Monday), this month
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1; // Monday = 0
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Last 30 days daily breakdown
    const thirtyDaysAgo = new Date(startOfDay);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);

    const [
      daily,
      weekly,
      monthly,
      allTime,
      dailyBreakdown,
      joinedToday,
      joinedWeek,
      joinedMonth,
      joinedAll,
      deactivatedToday,
      deactivatedWeek,
      deactivatedMonth,
      deactivatedAll,
    ] = await Promise.all([
      // Today's stats
      prisma.payment.groupBy({
        by: ["status"],
        where: { tenantId, createdAt: { gte: startOfDay } },
        _sum: { amount: true },
        _count: true,
      }),
      // This week's stats
      prisma.payment.groupBy({
        by: ["status"],
        where: { tenantId, createdAt: { gte: startOfWeek } },
        _sum: { amount: true },
        _count: true,
      }),
      // This month's stats
      prisma.payment.groupBy({
        by: ["status"],
        where: { tenantId, createdAt: { gte: startOfMonth } },
        _sum: { amount: true },
        _count: true,
      }),
      // All-time stats
      prisma.payment.groupBy({
        by: ["status"],
        where: { tenantId },
        _sum: { amount: true },
        _count: true,
      }),
      // Last 30 days - per-day breakdown
      prisma.$queryRaw<{ day: string; revenue: number | bigint; count: number | bigint }[]>`
        SELECT
          substr("createdAt", 1, 10) AS day,
          COALESCE(SUM(CASE WHEN "status" = 'COMPLETED' THEN "amount" ELSE 0 END), 0) AS revenue,
          COUNT(*) AS count
        FROM "Payment"
        WHERE "tenantId" = ${tenantId}
          AND "createdAt" >= ${thirtyDaysAgo}
        GROUP BY day
        ORDER BY day ASC
      `,
      // Members joined
      prisma.tenantMembership.count({ where: { tenantId, joinedAt: { gte: startOfDay } } }),
      prisma.tenantMembership.count({ where: { tenantId, joinedAt: { gte: startOfWeek } } }),
      prisma.tenantMembership.count({ where: { tenantId, joinedAt: { gte: startOfMonth } } }),
      prisma.tenantMembership.count({ where: { tenantId } }),
      // Members deactivated (SUSPENDED or DELETED, by updatedAt)
      prisma.tenantMembership.count({
        where: {
          tenantId,
          status: { in: ["SUSPENDED", "DELETED"] },
          updatedAt: { gte: startOfDay },
        },
      }),
      prisma.tenantMembership.count({
        where: {
          tenantId,
          status: { in: ["SUSPENDED", "DELETED"] },
          updatedAt: { gte: startOfWeek },
        },
      }),
      prisma.tenantMembership.count({
        where: {
          tenantId,
          status: { in: ["SUSPENDED", "DELETED"] },
          updatedAt: { gte: startOfMonth },
        },
      }),
      prisma.tenantMembership.count({
        where: { tenantId, status: { in: ["SUSPENDED", "DELETED"] } },
      }),
    ]);

    const mapStats = (rows: typeof daily) => {
      let totalRevenue = 0;
      let totalCount = 0;
      let completed = 0;
      let pending = 0;
      let failed = 0;
      for (const r of rows) {
        totalCount += r._count;
        if (r.status === "COMPLETED") {
          totalRevenue += r._sum.amount ?? 0;
          completed += r._count;
        } else if (r.status === "PENDING") {
          pending += r._count;
        } else {
          failed += r._count;
        }
      }
      return { totalRevenue, totalCount, completed, pending, failed };
    };

    return {
      today: mapStats(daily),
      week: mapStats(weekly),
      month: mapStats(monthly),
      allTime: mapStats(allTime),
      dailyBreakdown: dailyBreakdown.map(
        (d: { day: string; revenue: number | bigint; count: number | bigint }) => ({
        day: d.day,
        revenue: Number(d.revenue),
        count: Number(d.count),
      })),

      members: {
        joined: { today: joinedToday, week: joinedWeek, month: joinedMonth, allTime: joinedAll },
        deactivated: {
          today: deactivatedToday,
          week: deactivatedWeek,
          month: deactivatedMonth,
          allTime: deactivatedAll,
        },
      },
    };
  },
};
