/**
 * Documentation: Payments repository.
 *
 * - Encapsulates Prisma queries for subscription management, payment collection, and membership validity tracking, including relation loading and write patterns that are specific to the persistence layer.
 * - Keep raw database concerns here so the service layer can reason about domain behavior without duplicating query details.
 * - Primary exports: paymentRepository.
 */
import { prisma } from "../../lib/prisma";
import { proratedDays } from "@fitconnect/shared/prorata";
import { Prisma } from "../../generated/prisma/client";
import { monthRange } from "../../lib/month";
import { MEMBERSHIP_PAYMENT_SOURCES } from "@fitconnect/shared/types/enums";
import type { PaymentStatus, PaymentSource } from "@fitconnect/shared/types/enums";

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

/**
 * Re-exported so this module's existing callers keep one import.
 *
 * The rule itself moved to the shared package: the record-payment screen now
 * draws the term it is about to sell across a calendar before saving it, and a
 * client working the length out its own way would show one term and store
 * another.
 */
export { proratedDays };

export const paymentRepository = {
  /**
   * Run the `list payments` persistence operation for the payments module.
   * Repository methods own Prisma query shape and relation loading so service code can stay focused on domain flow.
   */
  /**
   * `sources` narrows the ledger to one of the gym's businesses.
   *
   * Passing none reads the whole ledger, which is what the member-scoped views
   * and the exports want. The payments screen passes the membership sources, so
   * a gym that sells more tubs than it signs members can still find a renewal.
   */
  async listPayments(
    tenantId: string,
    page: number,
    limit: number,
    statusFilter?: string,
    search?: string,
    membershipId?: string,
    sources?: PaymentSource[],
  ) {
    // Typed against the schema rather than `Record<string, unknown>`: a filter
    // built as loose keys compiles happily with a misspelled column and simply
    // stops narrowing, which on this query would mean quietly listing another
    // business's rows instead of failing.
    const where: Prisma.PaymentWhereInput = { tenantId };
    if (statusFilter && ["PENDING", "COMPLETED", "FAILED", "REFUNDED"].includes(statusFilter)) {
      where.status = statusFilter as PaymentStatus;
    }
    if (membershipId) {
      where.membershipId = membershipId;
    }
    if (sources?.length) {
      where.source = { in: sources };
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
          source: true,
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
        // How long the term runs, so the service can work out the window a
        // desk payment grants rather than trusting a date the client sent.
        durationDays: true,
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
    /**
     * Which of the gym's two businesses this money belongs to.
     *
     * Required rather than derived from the ids above, because the one case the
     * ids cannot express is the one that matters most: a store sale carries no
     * `subscriptionId` and no `chargeId`, and its `StoreOrder` is written
     * afterwards — so at the moment the payment row is created there is nothing
     * on it to derive STORE from. Every caller says what it is selling.
     */
    source: PaymentSource;
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
    /** False for a balance: the row it split from already granted the window. */
    extendsValidity?: boolean;
    /** The payable this row is a share of, for pro-rata validity. */
    validityBasisAmount?: number | null;
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
        // Needed when only part of what is owed is handed over: the remainder
        // is written as its own row against the same plan, sharing its basis.
        subscriptionId: true,
        validityBasisAmount: true,
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
  /**
   * When a plan just paid for should start, and when it should run out.
   *
   * A member who pays while still covered is paying in advance, so the new
   * period is stacked on the end of the one they already hold rather than
   * started today — otherwise every early renewal quietly burned whatever time
   * was left on the old one. A lapsed member, or one who never had cover, gets
   * the period from now.
   *
   * Continuous by construction: the new window opens at the exact instant the
   * old one closes, so consecutive plans neither overlap nor leave a gap.
   */
  async nextValidityWindow(
    membershipId: string,
    durationDays: number,
    from: Date,
  ) {
    const membership = await prisma.tenantMembership.findUnique({
      where: { id: membershipId },
      select: { dueDate: true },
    });

    const current = membership?.dueDate ?? null;
    const validFrom = current && current.getTime() > from.getTime() ? current : from;

    return {
      validFrom,
      validUntil: new Date(
        validFrom.getTime() + durationDays * 24 * 60 * 60 * 1000,
      ),
    };
  },

  /**
   * Reduce a pending row to what was actually handed over.
   *
   * Used when the desk takes part of what is owed: this row becomes the money
   * received, and the caller writes the remainder as its own pending balance.
   */
  reducePaymentAmount(paymentId: string, amount: number) {
    return prisma.payment.update({
      where: { id: paymentId },
      data: { amount },
      select: { id: true, amount: true },
    });
  },

  async updatePaymentStatus(paymentId: string, status: PaymentStatus) {
    const existing = await prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
      select: {
        membershipId: true,
        validUntil: true,
        amount: true,
        extendsValidity: true,
        validityBasisAmount: true,
        subscription: { select: { durationDays: true } },
      },
    });

    const paidAt = status === "COMPLETED" ? new Date() : undefined;

    /**
     * The validity a settled plan buys, stamped here as the gateway path
     * stamps it.
     *
     * A plan row can reach this with no dates on it: a self-signup and a
     * renewal booked for the counter both write their PENDING row without a
     * window, because an unpaid bill has not bought any time yet. Settling it
     * without filling that in left `refreshDueDate` — which only counts a
     * completed row that carries a `validUntil` — with nothing to find, so the
     * member came out paid, with no due date and still inactive.
     *
     * Only ever filled in, never overwritten: a date an admin typed on the
     * payment is the one that stands.
     */
    // A balance settles a debt against time already granted, so it buys none
    // of its own. Without this check, paying the ₹100 remainder of a ₹600 plan
    // would hand the member another full month.
    const window =
      paidAt && existing.extendsValidity && existing.subscription && !existing.validUntil
        ? await paymentRepository.nextValidityWindow(
            existing.membershipId,
            proratedDays(
              existing.subscription.durationDays,
              // The amount as it stands: a row reduced to a part payment just
              // above carries the money actually taken.
              existing.amount,
              existing.validityBasisAmount,
            ),
            paidAt,
          )
        : {};

    return prisma.payment.update({
      where: { id: paymentId },
      data: { status, paidAt, ...window },
      select: {
        id: true,
        amount: true,
        status: true,
        paidAt: true,
        validFrom: true,
        validUntil: true,
      },
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
  /**
   * What this member still owes and could pay for now.
   *
   * Rows already attached to a gateway order are left out: those belong to a
   * checkout that may yet complete, and sweeping them into a second order is
   * how a member ends up paying the same due twice.
   */
  /**
   * A renewal this member already asked to settle at the desk.
   *
   * Nothing is charged when that row is written, so a member who taps twice
   * would otherwise leave the front desk two bills for one renewal. Reusing
   * the open one keeps the queue honest.
   */
  findPendingCounterPayment(
    tenantId: string,
    membershipId: string,
    subscriptionId: string,
  ) {
    return prisma.payment.findFirst({
      where: {
        tenantId,
        membershipId,
        subscriptionId,
        status: "PENDING",
        gatewayOrderId: null,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
  },

  findSettleablePending(tenantId: string, membershipId: string) {
    return prisma.payment.findMany({
      where: { tenantId, membershipId, status: "PENDING", gatewayOrderId: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, amount: true, description: true, createdAt: true },
    });
  },

  /**
   * Put existing dues on the order that is about to pay for them.
   *
   * Settlement already walks every row of an order, so attaching them here is
   * all it takes for the plan and the arrears to complete together.
   */
  attachToGatewayOrder(
    paymentIds: string[],
    gatewayOrderId: string,
    gatewayAccount: string,
  ) {
    if (paymentIds.length === 0) return Promise.resolve({ count: 0 });
    return prisma.payment.updateMany({
      where: { id: { in: paymentIds }, status: "PENDING" },
      data: { gateway: "RAZORPAY", gatewayOrderId, gatewayAccount },
    });
  },

  /**
   * Settle dues collected at the desk alongside a new payment.
   *
   * Scoped by membership and by PENDING as well as by id, so a stale form
   * cannot complete a row that has since been paid, refunded, or moved.
   */
  /**
   * Pending rows a member owes, oldest first.
   *
   * Ordered because money is allocated in that order: a debt from March is
   * closed before one from April, which is both what a member expects and what
   * keeps the oldest arrears from ageing indefinitely while newer ones clear.
   */
  findPendingByIds(tenantId: string, membershipId: string, paymentIds: string[]) {
    if (paymentIds.length === 0) return Promise.resolve([]);

    return prisma.payment.findMany({
      where: { id: { in: paymentIds }, tenantId, membershipId, status: "PENDING" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        amount: true,
        description: true,
        subscriptionId: true,
        extendsValidity: true,
        validityBasisAmount: true,
      },
    });
  },

  /** Close one pending row, recording who took the money. */
  /**
   * Close one pending row, granting whatever membership time it bought.
   *
   * The single place that settles a pending payment, because the validity is
   * the half that is easy to forget: three paths reach this — a payment settled
   * on its own, dues collected at the desk, and dues cleared alongside a new
   * plan — and two of them originally marked the row COMPLETED and stopped.
   * A member paying off a pending "3 Month" then had it recorded as paid while
   * `refreshDueDate` found no completed row carrying a date, and their
   * membership gained nothing.
   *
   * The window is stacked on cover they still hold and only ever filled in,
   * never overwritten — the same rule the gateway and the desk already follow.
   * A balance buys nothing, which is what `extendsValidity` records.
   */
  async settleOnePending(paymentId: string, collectorId?: string) {
    const existing = await prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
      select: {
        membershipId: true,
        validUntil: true,
        amount: true,
        extendsValidity: true,
        validityBasisAmount: true,
        subscription: { select: { durationDays: true } },
      },
    });

    const paidAt = new Date();

    // Time is bought in proportion to the money that arrived, so a row settled
    // for part of what it was raised for buys part of the period.
    const window =
      existing.extendsValidity && existing.subscription && !existing.validUntil
        ? await paymentRepository.nextValidityWindow(
            existing.membershipId!,
            proratedDays(
              existing.subscription.durationDays,
              existing.amount,
              existing.validityBasisAmount,
            ),
            paidAt,
          )
        : {};

    return prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: "COMPLETED",
        paidAt,
        ...(collectorId ? { collectorId } : {}),
        ...window,
      },
      select: {
        id: true,
        amount: true,
        description: true,
        membershipId: true,
        validUntil: true,
      },
    });
  },

  /** What the named pending rows add up to. */
  async sumPendingByIds(tenantId: string, membershipId: string, paymentIds: string[]) {
    if (paymentIds.length === 0) return 0;

    const rows = await prisma.payment.findMany({
      where: { id: { in: paymentIds }, tenantId, membershipId, status: "PENDING" },
      select: { amount: true },
    });

    return rows.reduce((sum: number, row: { amount: number }) => sum + row.amount, 0);
  },

  /**
   * Settle dues with only so much money, oldest first.
   *
   * Replaces the assumption that ticking a due means it is paid in full. When
   * somebody buys a ₹600 plan, owes ₹3,500, and hands over ₹4,000, the ₹100
   * short has to land somewhere — and settling every ticked row regardless
   * wrote it off silently.
   *
   * The row the money runs out on is reduced to what it received and the
   * shortfall is returned, for the caller to write as its own pending balance.
   */
  async settlePendingWithBudget(
    tenantId: string,
    membershipId: string,
    paymentIds: string[],
    budget: number,
    collectorId?: string,
  ) {
    type Shortfall = {
      amount: number;
      description: string | null;
      subscriptionId: string | null;
      basisAmount: number;
    };
    type Settled = { id: string; amount: number; description: string | null };

    if (paymentIds.length === 0 || budget <= 0) {
      return { settled: [] as Settled[], shortfall: null as Shortfall | null };
    }

    const rows = await prisma.payment.findMany({
      where: { id: { in: paymentIds }, tenantId, membershipId, status: "PENDING" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        amount: true,
        description: true,
        subscriptionId: true,
        membershipId: true,
        validityBasisAmount: true,
      },
    });

    let remaining = budget;
    const settled: Settled[] = [];
    let shortfall: Shortfall | null = null;

    for (const row of rows) {
      if (remaining <= 0) break;

      const takes = Math.min(remaining, row.amount);

      if (takes < row.amount) {
        // The money ran out part-way through this row. It becomes what it
        // received, and the rest carries on as its own debt — keeping the
        // basis so the remainder buys the days this part did not.
        shortfall = {
          amount: row.amount - takes,
          description: row.description,
          subscriptionId: row.subscriptionId,
          basisAmount: row.validityBasisAmount ?? row.amount,
        };
        await prisma.payment.update({ where: { id: row.id }, data: { amount: takes } });
      }

      // Through the shared settle, so this path grants membership time too.
      const closed = await paymentRepository.settleOnePending(row.id, collectorId);

      // Refreshed between rows so the next one stacks on the date this one just
      // bought, rather than every plan in the batch starting from today.
      if (closed.validUntil) {
        await paymentRepository.refreshDueDate(row.membershipId ?? "");
      }

      settled.push({ id: row.id, amount: takes, description: row.description });
      remaining -= takes;
    }

    return { settled, shortfall };
  },

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
  async settleGatewayPayment(
    paymentId: string,
    gatewayPaymentId: string,
    /**
     * What the gateway charged, in paise, when it is known.
     *
     * Recorded on the row rather than derived later because it is the basis of
     * what the gym is owed, and Razorpay only reports it once. Omitted for the
     * desk paths, which have no gateway and so no fee.
     */
    deductions?: { feePaise: number | null; taxPaise: number | null },
  ) {
    const existing = await prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
      select: {
        membershipId: true,
        amount: true,
        extendsValidity: true,
        validityBasisAmount: true,
        subscription: { select: { durationDays: true } },
      },
    });

    const paidAt = new Date();

    /**
     * The same rule the desk paths follow, and for the same reasons.
     *
     * This settles whatever an order covered, and an order can carry arrears
     * alongside the plan — including balance rows split from an earlier part
     * payment. Granting each of those a full period would hand out months
     * nobody bought, which is exactly what `extendsValidity` and the pro-rata
     * basis exist to prevent. Before this, only the two desk paths consulted
     * them and the online one did not.
     */
    const window =
      existing.extendsValidity && existing.subscription
        ? await paymentRepository.nextValidityWindow(
            existing.membershipId,
            proratedDays(
              existing.subscription.durationDays,
              existing.amount,
              existing.validityBasisAmount,
            ),
            paidAt,
          )
        : { validFrom: paidAt, validUntil: null };

    return prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: "COMPLETED",
        gatewayPaymentId,
        paidAt,
        validFrom: window.validFrom,
        validUntil: window.validUntil,
        ...(deductions?.feePaise != null ? { gatewayFeePaise: deductions.feePaise } : {}),
        ...(deductions?.taxPaise != null ? { gatewayTaxPaise: deductions.taxPaise } : {}),
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
   *
   * `month` is the "YYYY-MM" the month-scoped figures report on. It used to be
   * whatever month the server happened to be in, which is why the analytics
   * screen could not be asked about October: the only period it could describe
   * was the one it was standing in.
   *
   * `today` and `week` stay relative to now whatever month is asked for — they
   * are facts about this moment, not about the month — and the screen only
   * shows them while the month being read is the current one.
   */
  async getPaymentAnalytics(tenantId: string, month: string) {
    const now = new Date();

    // Start of today and of this week (Monday), both still relative to now.
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1; // Monday = 0
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek);

    // The chosen month, on the same half-open bounds the books use.
    const { from: startOfMonth, to: endOfMonth } = monthRange(month);
    const monthWindow = { gte: startOfMonth, lt: endOfMonth };

    /**
     * The membership business. Store sales are not this screen's subject.
     *
     * Without this every figure here counted the shop: one gym's September read
     * ₹86,699 of "revenue", of which ₹77,899 was supplements — a number that
     * described neither business and moved with whichever had the better month.
     * The shop has its own page, with the cost of the goods beside the takings.
     */
    const membership = { source: { in: MEMBERSHIP_PAYMENT_SOURCES } };

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
      guestSales,
    ] = await Promise.all([
      // Today's stats
      prisma.payment.groupBy({
        by: ["status"],
        where: { tenantId, ...membership, createdAt: { gte: startOfDay } },
        _sum: { amount: true },
        _count: true,
      }),
      // This week's stats
      prisma.payment.groupBy({
        by: ["status"],
        where: { tenantId, ...membership, createdAt: { gte: startOfWeek } },
        _sum: { amount: true },
        _count: true,
      }),
      // This month's stats
      prisma.payment.groupBy({
        by: ["status"],
        where: { tenantId, ...membership, createdAt: monthWindow },
        _sum: { amount: true },
        _count: true,
      }),
      // All-time stats
      prisma.payment.groupBy({
        by: ["status"],
        where: { tenantId, ...membership },
        _sum: { amount: true },
        _count: true,
      }),
      // Per-day breakdown across the chosen month.
      //
      // This was a rolling last-30-days window, which is a different span from
      // every other figure on the screen — the trend chart and the month tile
      // beside it described overlapping but unequal periods. Now they agree.
      prisma.$queryRaw<{ day: string; revenue: number | bigint; count: number | bigint }[]>`
        SELECT
          substr("createdAt", 1, 10) AS day,
          COALESCE(SUM(CASE WHEN "status" = 'COMPLETED' THEN "amount" ELSE 0 END), 0) AS revenue,
          COUNT(*) AS count
        FROM "Payment"
        WHERE "tenantId" = ${tenantId}
          AND "source" IN (${Prisma.join(MEMBERSHIP_PAYMENT_SOURCES)})
          AND "createdAt" >= ${startOfMonth}
          AND "createdAt" < ${endOfMonth}
        GROUP BY day
        ORDER BY day ASC
      `,
      // Members joined
      prisma.tenantMembership.count({ where: { tenantId, joinedAt: { gte: startOfDay } } }),
      prisma.tenantMembership.count({ where: { tenantId, joinedAt: { gte: startOfWeek } } }),
      prisma.tenantMembership.count({ where: { tenantId, joinedAt: monthWindow } }),
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
          updatedAt: monthWindow,
        },
      }),
      prisma.tenantMembership.count({
        where: { tenantId, status: { in: ["SUSPENDED", "DELETED"] } },
      }),
      // What was given away this month: coupons off the list price, and coins
      // spent against it. `amount` is already net of both.
      prisma.payment.aggregate({
        where: { tenantId, ...membership, status: "COMPLETED", createdAt: monthWindow },
        _sum: { amount: true, listAmount: true, discountAmount: true, coinsRedeemed: true },
      }),
      prisma.payment.aggregate({
        where: { tenantId, ...membership, status: "COMPLETED" },
        _sum: { amount: true, listAmount: true, discountAmount: true, coinsRedeemed: true },
      }),
      // How the money arrived. `gateway` is null for cash and other manual entries.
      prisma.payment.groupBy({
        by: ["gateway"],
        where: { tenantId, ...membership, status: "COMPLETED", createdAt: monthWindow },
        _sum: { amount: true },
        _count: true,
      }),
      // Coins the gym still owes its members: earns are positive, spends negative.
      prisma.coinLedgerEntry.aggregate({ where: { tenantId }, _sum: { amount: true } }),
      // Terms paused right now, which is revenue already collected but not yet run out.
      prisma.membershipFreeze.count({ where: { tenantId, endedOn: null } }),
      // Completed store orders with no membership: the walk-ins and visitors
      // whose money the payment ledger structurally cannot hold. Small by
      // nature — one row per guest sale — so it is read whole and bucketed in
      // memory rather than aggregated four times in SQL.
      prisma.storeOrder.findMany({
        where: { tenantId, status: "COMPLETED", membershipId: null },
        select: { totalAmount: true, createdAt: true },
      }),
    ]);

    /**
     * Store revenue that has no payment row.
     *
     * A guest order — a walk-in at the till, or a visitor collecting a
     * reservation — belongs to nobody, and `Payment.membershipId` is
     * required. Those sales were therefore invisible here: a gym selling
     * ₹40,000 to walk-ins saw ₹0, because the only place the money was
     * recorded was `StoreOrder`.
     *
     * Counted separately rather than merged into the payment figures, so the
     * finance page can say where the money came from instead of quietly
     * inflating a number whose provenance nobody can check.
     */
    // `to` bounds the month bucket. Today and this week run to now and need no
    // upper edge; a chosen month does, or every past month would also collect
    // every sale made since.
    const guestIn = (from: Date, to?: Date) =>
      guestSales.filter((sale) => sale.createdAt >= from && (!to || sale.createdAt < to));

    const guestRevenue = (from: Date, to?: Date) =>
      guestIn(from, to).reduce((sum, sale) => sum + sale.totalAmount, 0);

    const guestCount = (from: Date, to?: Date) => guestIn(from, to).length;

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

    const allGuestRevenue = guestSales.reduce(
      (sum, sale) => sum + sale.totalAmount,
      0,
    );

    /**
     * Membership figures for a window, with the shop's counter sales beside them.
     *
     * Beside, not inside. These used to be added into `totalRevenue`, which —
     * together with the store payments that were also being counted — made the
     * revenue tile on the finance page a sum of two unrelated businesses: one
     * gym's September read ₹86,699, of which ₹77,899 was supplements. The guest
     * figures stay in the response because the counter-sales tile reports them
     * honestly under their own name, and the shop's full picture, with the cost
     * of the goods against it, is on the store analytics page.
     */
    const membershipStats = (rows: typeof daily, from: Date | null, to?: Date) => ({
      ...mapStats(rows),
      /** The shop's takings in the same window. Not part of the totals above. */
      guestRevenue: from === null ? allGuestRevenue : guestRevenue(from, to),
      guestCount: from === null ? guestSales.length : guestCount(from, to),
    });

    return {
      /** The month these figures describe, echoed so the caller can be sure. */
      monthKey: month,
      today: membershipStats(daily, startOfDay),
      week: membershipStats(weekly, startOfWeek),
      month: membershipStats(monthly, startOfMonth, endOfMonth),
      allTime: membershipStats(allTime, null),
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
      // No revenue mix here: the payments service takes it from the books, on
      // the same dates as the month total, with store sales as their own bucket.
    };
  },
};
