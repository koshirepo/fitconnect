/**
 * Documentation: What a gym is owed, and the record of paying it.
 *
 * - A gym that has not configured its own Razorpay collects into the platform account. That money is the gym's, and this is the ledger that says how much of it has not been forwarded yet.
 * - The balance is derived, never stored: every completed payment marked `gatewayAccount: "PLATFORM"`, less what Razorpay charged, less FitConnect's cut, less everything already paid out or promised. A stored balance is a number that can disagree with the payments behind it, and the first time it does nobody can tell which is right.
 * - Every amount here is in PAISE. `Payment.amount` is in rupees, because that is how this codebase stores money a person typed; a gateway fee is ₹23.60 and has to be exact, so the ledger converts on the way in and stays in paise thereafter.
 * - A payout in REQUESTED or APPROVED counts against the balance as firmly as a paid one. Two requests for the same money is how a gym gets paid twice.
 * - Primary exports: payoutsRepository.
 */
import { prisma } from "../../lib/prisma";

/**
 * What Razorpay is assumed to have charged on a payment taken before the fee
 * was recorded, in basis points, plus the GST rate on that fee.
 *
 * Razorpay's standard card and UPI rate at the time this was written. Applied
 * only where the real figure is unknown, which is every payment predating
 * migration 0044 — on a database with a year of history that is a lot of money
 * to hand over as though the gateway had taken nothing.
 *
 * An estimate is reported as an estimate: `balance` returns what it applied, so
 * a statement can say which part of a deduction is known and which is assumed
 * rather than quietly presenting both as fact.
 */
const ASSUMED_GATEWAY_FEE_BPS = 200;
const GST_ON_FEE_BPS = 1_800;

/** Rupees, as payments are stored, to paise, as the gateway counts. */
export function rupeesToPaise(rupees: number) {
  return Math.round(rupees * 100);
}

/** Anything not yet refused is money that is already spoken for. */
const COMMITTED_STATUSES = ["REQUESTED", "APPROVED", "PAID"];

/**
 * What came off a payment, and whether we actually know it.
 *
 * A payment Razorpay reported on carries the real figures. One taken before
 * that was recorded gets the standard rate applied, and says so.
 */
function feeFor(grossPaise: number, feePaise: number | null, taxPaise: number | null) {
  if (feePaise != null || taxPaise != null) {
    return {
      gatewayFeePaise: (feePaise ?? 0) + (taxPaise ?? 0),
      gatewayFeeEstimated: false,
    };
  }

  const fee = Math.round((grossPaise * ASSUMED_GATEWAY_FEE_BPS) / 10_000);
  const gst = Math.round((fee * GST_ON_FEE_BPS) / 10_000);

  return { gatewayFeePaise: fee + gst, gatewayFeeEstimated: true };
}

export const payoutsRepository = {
  /**
   * Every platform-collected payment for a gym, with what it earned and cost.
   *
   * Split by what was sold, because the two carry different commission rates: a
   * payment attached to a store order is kit, everything else is membership.
   */
  async collectedForTenant(tenantId: string) {
    const rows = await prisma.payment.findMany({
      where: {
        tenantId,
        status: "COMPLETED",
        // The whole condition for owing a gym money. A payment into the gym's
        // own Razorpay account never passed through FitConnect's hands.
        gatewayAccount: "PLATFORM",
      },
      select: {
        id: true,
        amount: true,
        gatewayFeePaise: true,
        gatewayTaxPaise: true,
        paidAt: true,
        description: true,
        storeOrder: { select: { id: true } },
      },
      orderBy: { paidAt: "desc" },
    });

    return rows.map((row) => ({
      id: row.id,
      paidAt: row.paidAt,
      description: row.description,
      kind: row.storeOrder ? ("STORE" as const) : ("SUBSCRIPTION" as const),
      grossPaise: rupeesToPaise(row.amount),
      ...feeFor(rupeesToPaise(row.amount), row.gatewayFeePaise, row.gatewayTaxPaise),
    }));
  },

  /** What has already been requested, approved, or sent. */
  async committedPaise(tenantId: string) {
    const rows = await prisma.tenantPayout.findMany({
      where: { tenantId, status: { in: COMMITTED_STATUSES } },
      select: { netPaise: true },
    });

    return rows.reduce((sum, row) => sum + row.netPaise, 0);
  },

  findBankAccount(tenantId: string) {
    return prisma.tenantBankAccount.findUnique({ where: { tenantId } });
  },

  upsertBankAccount(
    tenantId: string,
    data: {
      accountHolder: string;
      accountNumber: string;
      accountLast4: string;
      ifsc: string;
      bankName?: string | null;
    },
  ) {
    return prisma.tenantBankAccount.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });
  },

  commissionRates(tenantId: string) {
    return prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { subscriptionCommissionBps: true, storeCommissionBps: true },
    });
  },

  createPayout(data: {
    tenantId: string;
    grossPaise: number;
    gatewayFeePaise: number;
    commissionPaise: number;
    commissionBps: number;
    netPaise: number;
    requestedById?: string | null;
    accountHolder: string;
    accountLast4: string;
    ifsc: string;
  }) {
    return prisma.tenantPayout.create({ data });
  },

  listForTenant(tenantId: string) {
    return prisma.tenantPayout.findMany({
      where: { tenantId },
      orderBy: { requestedAt: "desc" },
    });
  },

  /** The platform's queue: everything still waiting on somebody. */
  listPending() {
    return prisma.tenantPayout.findMany({
      where: { status: { in: ["REQUESTED", "APPROVED"] } },
      orderBy: { requestedAt: "asc" },
      include: { tenant: { select: { id: true, name: true, slug: true } } },
    });
  },

  findPayout(payoutId: string) {
    return prisma.tenantPayout.findUnique({
      where: { id: payoutId },
      include: { tenant: { select: { id: true, name: true, slug: true } } },
    });
  },

  /**
   * Move a payout on.
   *
   * Guarded by the status it is expected to be in, so two members of staff
   * settling the same request at once produce one transfer, not two: the second
   * update matches no row and is told the request already moved.
   */
  async advance(
    payoutId: string,
    from: string[],
    data: {
      status: string;
      decidedById?: string | null;
      note?: string | null;
      reference?: string | null;
      decidedAt?: Date;
      paidAt?: Date;
    },
  ) {
    const result = await prisma.tenantPayout.updateMany({
      where: { id: payoutId, status: { in: from } },
      data,
    });

    return result.count > 0 ? this.findPayout(payoutId) : null;
  },
};
