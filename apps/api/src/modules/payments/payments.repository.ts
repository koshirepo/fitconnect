/**
 * Documentation: Payments repository.
 *
 * - Encapsulates Prisma queries for subscription management, payment collection, and membership validity tracking, including relation loading and write patterns that are specific to the persistence layer.
 * - Keep raw database concerns here so the service layer can reason about domain behavior without duplicating query details.
 * - Primary exports: paymentRepository.
 */
import { prisma } from "../../lib/prisma";
import type { PaymentStatus } from "@fitconnect/shared/types/enums";

/**
 * Collapse a payment aggregate into the giveaway shape the analytics response
 * uses: what was asked, what came off, and what was actually taken.
 *
 * `listAmount` is null on rows written before coupons existed. Those fall back
 * to the net amount, so an old row reports no giveaway rather than a negative one.
 */
function mapGiveaway(sum: {
  amount: number | null;
  listAmount: number | null;
  discountAmount: number | null;
  coinsRedeemed: number | null;
}) {
  const net = sum.amount ?? 0;
  const discount = sum.discountAmount ?? 0;
  const coins = sum.coinsRedeemed ?? 0;
  return {
    gross: sum.listAmount ?? net,
    discount,
    coins,
    net,
  };
}

/** Total one side of the cash/online split out of a `groupBy("gateway")` result. */
function sumGateway(
  rows: { gateway: string | null; _sum: { amount: number | null }; _count: number }[],
  matches: (gateway: string | null) => boolean,
) {
  let revenue = 0;
  let count = 0;
  for (const r of rows) {
    if (!matches(r.gateway)) continue;
    revenue += r._sum.amount ?? 0;
    count += r._count;
  }
  return { revenue, count };
}

/** One bucket of the subscription/charge revenue split, zeroed when absent. */
function pickMix(
  rows: { kind: string; revenue: number | bigint; count: number | bigint }[],
  kind: string,
) {
  const row = rows.find((r) => r.kind === kind);
  return { revenue: Number(row?.revenue ?? 0), count: Number(row?.count ?? 0) };
}

const subscriptionBadgeSelect = {
  id: true,
  name: true,
  color: true,
  icon: true,
  isActive: true,
} as const;

/** What the gateway paths need to decide whether and how to settle a row. */
const gatewayPaymentSelect = {
  id: true,
  status: true,
  amount: true,
  description: true,
  // Carried so the settle path can notify the gym's admins without a second
  // read: which gym, and who paid.
  tenantId: true,
  membershipId: true,
  member: { select: { memberId: true, user: { select: { name: true } } } },
  gatewayOrderId: true,
  gatewayPaymentId: true,
  subscription: { select: { id: true, title: true, durationDays: true } },
} as const;

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
    const trimmedSearch = search?.trim();
    if (trimmedSearch) {
      const memberIdSearch = /^\d+$/.test(trimmedSearch) ? Number(trimmedSearch) : null;
      where.OR = [
        { member: { user: { name: { contains: trimmedSearch } } } },
        { member: { user: { email: { contains: trimmedSearch } } } },
        { member: { user: { phone: { contains: trimmedSearch } } } },
        ...(memberIdSearch !== null ? [{ member: { memberId: memberIdSearch } }] : []),
      ];
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
              status: true,
              dueDate: true,
              user: { select: { id: true, name: true, email: true, phone: true, gender: true, avatarUrl: true } },
            },
          },
          subscription: { select: { id: true, title: true } },
          collectedBy: {
            select: {
              id: true,
              user: { select: { id: true, name: true, email: true, phone: true, gender: true, avatarUrl: true } },
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
      select: {
        id: true,
        status: true,
        dueDate: true,
        badges: {
          select: { id: true },
        },
      },
    });
  },

  /**
   * Run the `find subscription` persistence operation for the payments module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  findSubscription(subscriptionId: string, tenantId: string) {
    return prisma.subscription.findFirst({
      where: { id: subscriptionId, tenantId },
      select: {
        id: true,
        // Names the balance row when a payment is only partly made.
        title: true,
        badges: {
          select: { id: true },
        },
      },
    });
  },

  /**
   * Run the `find subscription detail` persistence operation for the payments module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  findSubscriptionDetail(subscriptionId: string, tenantId: string) {
    return prisma.subscription.findFirst({
      where: { id: subscriptionId, tenantId },
      select: {
        id: true,
        title: true,
        description: true,
        amount: true,
        durationDays: true,
        freezeDays: true,
        freezeCount: true,
        isActive: true,
        badges: {
          orderBy: { name: "asc" },
          select: subscriptionBadgeSelect,
        },
      },
    });
  },

  /**
   * Run the `find badge ids` persistence operation for the payments module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  findBadgeIds(tenantId: string, badgeIds: string[]) {
    return prisma.badge.findMany({
      where: {
        tenantId,
        id: { in: badgeIds },
      },
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
    gateway?: string;
    gatewayOrderId?: string;
    gatewayAccount?: string;
  }) {
    return prisma.payment.create({
      data,
      select: {
        id: true,
        amount: true,
        status: true,
        description: true,
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
        // Enough to name the payer in the notification an admin receives when
        // this row is settled.
        member: {
          select: { memberId: true, user: { select: { name: true } } },
        },
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
            status: true,
            dueDate: true,
            user: { select: { id: true, name: true, email: true, phone: true, gender: true, avatarUrl: true } },
          },
        },
        collectedBy: {
          select: {
            id: true,
            user: { select: { id: true, name: true, email: true, phone: true, gender: true, avatarUrl: true } },
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
  listSubscriptions(tenantId: string, includeInactive = false) {
    return prisma.subscription.findMany({
      where: {
        tenantId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ isActive: "desc" }, { amount: "asc" }],
      select: {
        id: true,
        title: true,
        description: true,
        amount: true,
        durationDays: true,
        freezeDays: true,
        freezeCount: true,
        isActive: true,
        badges: {
          orderBy: { name: "asc" },
          select: subscriptionBadgeSelect,
        },
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
      badgeIds: string[];
    },
  ) {
    const { badgeIds, ...subscriptionData } = data;
    return prisma.subscription.create({
      data: {
        ...subscriptionData,
        tenantId,
        ...(badgeIds.length > 0
          ? {
              badges: {
                connect: badgeIds.map((id) => ({ id })),
              },
            }
          : {}),
      },
      select: {
        id: true,
        title: true,
        description: true,
        amount: true,
        durationDays: true,
        freezeDays: true,
        freezeCount: true,
        isActive: true,
        badges: {
          orderBy: { name: "asc" },
          select: subscriptionBadgeSelect,
        },
      },
    });
  },

  /**
   * Run the `update subscription` persistence operation for the payments module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  updateSubscription(
    subscriptionId: string,
    data: {
      title?: string;
      description?: string | null;
      amount?: number;
      durationDays?: number;
      isActive?: boolean;
      badgeIds?: string[];
    },
  ) {
    const { badgeIds, ...subscriptionData } = data;
    return prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        ...subscriptionData,
        ...(badgeIds !== undefined
          ? {
              badges: {
                set: badgeIds.map((id) => ({ id })),
              },
            }
          : {}),
      },
      select: {
        id: true,
        title: true,
        description: true,
        amount: true,
        durationDays: true,
        freezeDays: true,
        freezeCount: true,
        isActive: true,
        badges: {
          orderBy: { name: "asc" },
          select: subscriptionBadgeSelect,
        },
      },
    });
  },

  /**
   * Run the `count payments for subscription` persistence operation for the payments module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  countPaymentsForSubscription(subscriptionId: string) {
    return prisma.payment.count({
      where: { subscriptionId },
    });
  },

  /**
   * Run the `delete subscription` persistence operation for the payments module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  deleteSubscription(subscriptionId: string) {
    return prisma.subscription.delete({
      where: { id: subscriptionId },
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

  /**
   * Run the `delete payment` persistence operation for the payments module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  deletePayment(paymentId: string) {
    return prisma.payment.delete({
      where: { id: paymentId },
      select: { id: true },
    });
  },

  /** Recalculate and persist the membership's dueDate from its latest payment validUntil. */
  // ─── Gateway payments ───────────────────────────────────────────────────────

  /**
   * The member and badges behind an online checkout.
   *
   * Badges are loaded because plan eligibility is badge-gated, and the check has
   * to happen server-side: the browser picks the plan, but it does not get to
   * decide whether the member qualifies for it.
   */
  findCheckoutMembership(tenantId: string, userId: string) {
    return prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { id: true, status: true, badges: { select: { id: true } } },
    });
  },

  /** A plan with the fields checkout prices and dates a membership from. */
  findCheckoutSubscription(subscriptionId: string, tenantId: string) {
    return prisma.subscription.findFirst({
      where: { id: subscriptionId, tenantId },
      select: {
        id: true,
        title: true,
        amount: true,
        durationDays: true,
        freezeDays: true,
        freezeCount: true,
        isActive: true,
        badges: { select: { id: true } },
      },
    });
  },

  /**
   * Find a payment by the gateway order it was opened against.
   *
   * The tenant is part of the filter, so a webhook aimed at one gym cannot
   * settle another gym's payment.
   */
  findPaymentByOrderId(gatewayOrderId: string, tenantId: string) {
    return prisma.payment.findFirst({
      where: { gatewayOrderId, tenantId },
      select: gatewayPaymentSelect,
    });
  },

  /**
   * Every payment one gateway order covers.
   *
   * A self-signup pays for a plan and its mandatory charges in a single order,
   * so an order maps to several rows. The single-plan checkout returns one row
   * through the same query, which is why both paths can share it.
   */
  findPaymentsByOrderId(gatewayOrderId: string, tenantId: string) {
    return prisma.payment.findMany({
      where: { gatewayOrderId, tenantId },
      select: gatewayPaymentSelect,
      orderBy: { createdAt: "asc" },
    });
  },

  /**
   * Mark a gateway payment paid and give it its validity window.
   *
   * The window is set here rather than when the order was opened, so an
   * abandoned checkout never extends a membership: an unpaid PENDING row
   * carries no dates for `refreshDueDate` to pick up.
   */
  async settleGatewayPayment(paymentId: string, gatewayPaymentId: string) {
    const existing = await prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
      select: { subscription: { select: { durationDays: true } } },
    });

    const paidAt = new Date();
    const validUntil = existing.subscription
      ? new Date(paidAt.getTime() + existing.subscription.durationDays * 24 * 60 * 60 * 1000)
      : null;

    return prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: "COMPLETED",
        gatewayPaymentId,
        paidAt,
        validFrom: paidAt,
        validUntil,
      },
      select: {
        id: true,
        amount: true,
        status: true,
        paidAt: true,
        membershipId: true,
        validFrom: true,
        validUntil: true,
        description: true,
      },
    });
  },

  markGatewayFailure(paymentId: string, gatewayPaymentId: string) {
    return prisma.payment.update({
      where: { id: paymentId },
      data: { status: "FAILED", gatewayPaymentId },
      select: { id: true, status: true },
    });
  },

  /**
   * Bring a lapsed member back once a payment carries them to today or beyond.
   *
   * Compared at UTC day granularity, matching how `createPayment` reactivates
   * after a manually recorded payment.
   */
  async reactivateIfPaidUp(membershipId: string) {
    const membership = await prisma.tenantMembership.findUnique({
      where: { id: membershipId },
      select: { status: true, dueDate: true },
    });

    if (!membership || membership.status === "ACTIVE" || !membership.dueDate) return;

    const due = membership.dueDate;
    const now = new Date();
    const dueUtc = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
    const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

    if (dueUtc >= todayUtc) {
      await prisma.tenantMembership.update({
        where: { id: membershipId },
        data: { status: "ACTIVE" },
      });
    }
  },

  async refreshDueDate(membershipId: string) {
    // Only a completed row buys time. A pending one is money not yet in hand —
    // an unsettled gateway checkout or an unpaid balance — and letting it set
    // the due date would hand out membership nobody paid for.
    const latest = await prisma.payment.findFirst({
      where: { membershipId, status: "COMPLETED", validUntil: { not: null } },
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
      discountsMonth,
      discountsAllTime,
      collectionMonth,
      coinBalance,
      activeFreezes,
      mixMonth,
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
      // What was given away this month: coupons off the list price, and coins
      // spent against it. `amount` is already net of both.
      prisma.payment.aggregate({
        where: { tenantId, status: "COMPLETED", createdAt: { gte: startOfMonth } },
        _sum: { amount: true, listAmount: true, discountAmount: true, coinsRedeemed: true },
      }),
      prisma.payment.aggregate({
        where: { tenantId, status: "COMPLETED" },
        _sum: { amount: true, listAmount: true, discountAmount: true, coinsRedeemed: true },
      }),
      // How the money arrived. `gateway` is null for cash and other manual entries.
      prisma.payment.groupBy({
        by: ["gateway"],
        where: { tenantId, status: "COMPLETED", createdAt: { gte: startOfMonth } },
        _sum: { amount: true },
        _count: true,
      }),
      // Coins the gym still owes its members: earns are positive, spends negative.
      prisma.coinLedgerEntry.aggregate({ where: { tenantId }, _sum: { amount: true } }),
      // Terms paused right now, which is revenue already collected but not yet run out.
      prisma.membershipFreeze.count({ where: { tenantId, endedOn: null } }),
      // Membership dues versus one-off charges, which bill on different rhythms.
      prisma.$queryRaw<{ kind: string; revenue: number | bigint; count: number | bigint }[]>`
        SELECT
          CASE
            WHEN "subscriptionId" IS NOT NULL THEN 'SUBSCRIPTION'
            WHEN "chargeId" IS NOT NULL THEN 'CHARGE'
            ELSE 'OTHER'
          END AS kind,
          COALESCE(SUM("amount"), 0) AS revenue,
          COUNT(*) AS count
        FROM "Payment"
        WHERE "tenantId" = ${tenantId}
          AND "status" = 'COMPLETED'
          AND "createdAt" >= ${startOfMonth}
        GROUP BY kind
      `,
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

      // What the list price became after coupons and coins. `listAmount` is null
      // on rows written before coupons existed, so it falls back to the net
      // amount and those rows simply show no giveaway.
      discounts: {
        month: mapGiveaway(discountsMonth._sum),
        allTime: mapGiveaway(discountsAllTime._sum),
      },

      // Cash versus online, for this month.
      collection: {
        online: sumGateway(collectionMonth, (g) => g !== null),
        manual: sumGateway(collectionMonth, (g) => g === null),
      },

      // Coins outstanding across the gym, and terms currently paused.
      coinsOutstanding: coinBalance._sum.amount ?? 0,
      activeFreezes,

      revenueMix: {
        subscriptions: pickMix(mixMonth, "SUBSCRIPTION"),
        charges: pickMix(mixMonth, "CHARGE"),
        other: pickMix(mixMonth, "OTHER"),
      },
    };
  },
};
