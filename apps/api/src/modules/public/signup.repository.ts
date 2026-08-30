/**
 * Documentation: Public self-signup repository.
 *
 * - Encapsulates the Prisma reads and writes the unauthenticated join flow needs: what a visitor may choose from, and the membership plus payment rows a signup creates.
 * - Every query is scoped by tenant id and filtered to active rows, because the caller is a stranger and nothing here may leak or select a neighbouring gym's data.
 * - Primary exports: signupRepository.
 */
import { prisma } from "../../lib/prisma";

export const signupRepository = {
  /** The gym a visitor is standing in front of, by its subdomain slug. */
  findActiveTenantBySlug(slug: string) {
    return prisma.tenant.findFirst({
      where: { slug, status: "ACTIVE" },
      select: { id: true, name: true, slug: true, logoUrl: true },
    });
  },

  /**
   * The plans a visitor may pick from.
   *
   * Badge-restricted plans are excluded: a brand new member holds no badges, so
   * offering one would only produce a rejection at submit time.
   */
  listSelectablePlans(tenantId: string) {
    return prisma.subscription.findMany({
      where: { tenantId, isActive: true, badges: { none: {} } },
      select: {
        id: true,
        title: true,
        description: true,
        amount: true,
        durationDays: true,
      },
      orderBy: { amount: "asc" },
    });
  },

  listActiveCharges(tenantId: string) {
    return prisma.tenantCharge.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true, amount: true, isMandatory: true },
      orderBy: { createdAt: "asc" },
    });
  },

  listActiveShifts(tenantId: string) {
    return prisma.shift.findMany({
      where: { tenantId, isActive: true },
      select: {
        id: true,
        tenantId: true,
        name: true,
        description: true,
        startTime: true,
        endTime: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ startTime: "asc" }, { name: "asc" }],
    });
  },

  findSelectablePlan(tenantId: string, subscriptionId: string) {
    return prisma.subscription.findFirst({
      where: { id: subscriptionId, tenantId, isActive: true },
      select: {
        id: true,
        title: true,
        amount: true,
        durationDays: true,
        badges: { select: { id: true } },
      },
    });
  },

  findActiveShift(tenantId: string, shiftId: string) {
    return prisma.shift.findFirst({
      where: { id: shiftId, tenantId, isActive: true },
      select: { id: true },
    });
  },

  /**
   * The charges a signup is billed for: everything mandatory, plus whatever
   * optional charges the visitor ticked. Read as one query so an unknown or
   * inactive id in the request simply does not come back.
   */
  findChargesForSignup(tenantId: string, chargeIds: string[]) {
    return prisma.tenantCharge.findMany({
      where: {
        tenantId,
        isActive: true,
        OR: [
          { isMandatory: true },
          ...(chargeIds.length > 0 ? [{ id: { in: chargeIds } }] : []),
        ],
      },
      select: { id: true, name: true, amount: true },
    });
  },

  /**
   * Write the line items a signup owes, all PENDING.
   *
   * No validity window is set here. It is written when the money arrives, so an
   * abandoned signup never extends a membership it never paid for.
   */
  createPendingPayments(input: {
    tenantId: string;
    membershipId: string;
    subscription: {
      id: string;
      title: string;
      /** What is actually owed, after any joining offer. */
      amount: number;
      /** The price before it, kept beside the discount so a receipt adds up. */
      listAmount?: number;
      discountAmount?: number;
    };
    charges: { id: string; name: string; amount: number }[];
    gateway: { orderId: string; account: string } | null;
  }) {
    const gatewayColumns = input.gateway
      ? {
          gateway: "RAZORPAY",
          gatewayOrderId: input.gateway.orderId,
          gatewayAccount: input.gateway.account,
        }
      : {};

    return prisma.$transaction([
      ...input.charges.map((charge) =>
        prisma.payment.create({
          data: {
            tenantId: input.tenantId,
            membershipId: input.membershipId,
            chargeId: charge.id,
            amount: charge.amount,
            description: charge.name,
            status: "PENDING",
            ...gatewayColumns,
          },
          select: { id: true, amount: true, description: true, status: true },
        }),
      ),
      prisma.payment.create({
        data: {
          tenantId: input.tenantId,
          membershipId: input.membershipId,
          subscriptionId: input.subscription.id,
          amount: input.subscription.amount,
          ...(input.subscription.discountAmount
            ? {
                listAmount: input.subscription.listAmount,
                discountAmount: input.subscription.discountAmount,
              }
            : {}),
          description: input.subscription.title,
          status: "PENDING",
          ...gatewayColumns,
        },
        select: { id: true, amount: true, description: true, status: true },
      }),
    ]);
  },

  findTenantGymName(tenantId: string) {
    return prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, slug: true, logoUrl: true },
    });
  },

  /** Whether a membership came alive, read back after the money settled. */
  findMembershipStatus(membershipId: string) {
    return prisma.tenantMembership.findUnique({
      where: { id: membershipId },
      select: { id: true, memberId: true, status: true, dueDate: true },
    });
  },
};
