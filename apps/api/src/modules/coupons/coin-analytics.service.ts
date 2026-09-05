/**
 * Documentation: A gym's coins, taken as a whole rather than one member at a time.
 *
 * - Coins are a liability. Every one a gym issues is a rupee it has promised to discount later, and until now the only way to see them was to open a member and read their balance. This is the total, and where it came from.
 * - Issued and spent are reported separately rather than netted. "₹40,000 outstanding" says nothing about whether the scheme is working; forty thousand issued against thirty-five spent is a very different gym from forty thousand issued against two hundred.
 * - The ledger is the only source. Nothing here stores a total, because a stored total is a number that can disagree with the entries behind it, and the first time it does nobody can tell which is right.
 * - Expiry is reported as what is *about* to go, not what has gone: an expired coin has already been swept out by a negative entry and is in `spent` like any other outflow.
 * - Primary exports: coinAnalyticsService.
 */
import { prisma } from "../../lib/prisma";

/** Why a coin moved, in the order a reader wants to see them. */
const REASONS = ["COUPON", "REFERRAL", "ADJUSTMENT", "REDEEMED", "REVERSAL", "EXPIRED"] as const;

export const coinAnalyticsService = {
  /**
   * Everything a gym needs to know about its own coins.
   *
   * One pass over the ledger rather than a query per figure: a gym running this
   * for two years has a lot of rows, and six aggregates over the same table is
   * six table scans on D1.
   */
  async overview(tenantId: string) {
    const [entries, expirySetting] = await Promise.all([
      prisma.coinLedgerEntry.findMany({
        where: { tenantId },
        select: {
          amount: true,
          reason: true,
          createdAt: true,
          membershipId: true,
        },
      }),
      prisma.tenantSettings.findUnique({
        where: { tenantId },
        select: { coinExpiryDays: true },
      }),
    ]);

    let issued = 0;
    let spent = 0;
    const byReason = new Map<string, { issued: number; spent: number; entries: number }>();
    const byMember = new Map<string, number>();

    for (const entry of entries) {
      // Positive is a coin coming into existence, negative is one leaving.
      // Kept apart because the two answer different questions.
      if (entry.amount >= 0) issued += entry.amount;
      else spent += -entry.amount;

      const bucket = byReason.get(entry.reason) ?? { issued: 0, spent: 0, entries: 0 };
      if (entry.amount >= 0) bucket.issued += entry.amount;
      else bucket.spent += -entry.amount;
      bucket.entries += 1;
      byReason.set(entry.reason, bucket);

      byMember.set(entry.membershipId, (byMember.get(entry.membershipId) ?? 0) + entry.amount);
    }

    const holders = [...byMember.entries()].filter(([, balance]) => balance > 0);

    return {
      data: {
        /** Every coin ever granted. */
        issued,
        /** Every coin ever spent, reversed, or expired. */
        spent,
        /** What members could still redeem today — the gym's live liability. */
        outstanding: issued - spent,
        entryCount: entries.length,
        /** How many members are holding coins, and the biggest balance. */
        holderCount: holders.length,
        largestBalance: holders.reduce((max, [, balance]) => Math.max(max, balance), 0),
        /** Zero means coins never expire, which is what every gym starts on. */
        expiryDays: expirySetting?.coinExpiryDays ?? 0,
        byReason: REASONS.map((reason) => ({
          reason,
          ...(byReason.get(reason) ?? { issued: 0, spent: 0, entries: 0 }),
        })).filter((row) => row.entries > 0),
      },
    };
  },

  /**
   * Who is holding coins, biggest first.
   *
   * Balances are summed from the ledger rather than read from a column, for the
   * same reason the totals are: there is no column, and adding one would be a
   * second answer to a question the ledger already answers.
   */
  async holders(tenantId: string, limit = 25) {
    const grouped = await prisma.coinLedgerEntry.groupBy({
      by: ["membershipId"],
      where: { tenantId },
      _sum: { amount: true },
    });

    const positive = grouped
      .map((row) => ({ membershipId: row.membershipId, balance: row._sum.amount ?? 0 }))
      .filter((row) => row.balance > 0)
      .sort((a, b) => b.balance - a.balance)
      .slice(0, limit);

    if (positive.length === 0) return { data: { holders: [] } };

    const members = await prisma.tenantMembership.findMany({
      where: { id: { in: positive.map((row) => row.membershipId) } },
      select: {
        id: true,
        memberId: true,
        user: { select: { name: true, avatarUrl: true } },
      },
    });

    const byId = new Map(members.map((member) => [member.id, member]));

    return {
      data: {
        holders: positive.map((row) => {
          const member = byId.get(row.membershipId);
          return {
            membershipId: row.membershipId,
            memberId: member?.memberId ?? null,
            name: member?.user.name ?? "Unknown member",
            avatarUrl: member?.user.avatarUrl ?? null,
            balance: row.balance,
          };
        }),
      },
    };
  },

  /**
   * The most recent movements across the whole gym: who, to whom, and when.
   *
   * The actor comes through the `createdBy` relation added in migration 0045,
   * so the name arrives with the row rather than from a second query and a
   * hand-rolled join.
   *
   * Only hand adjustments have somebody to name. A coin earned from a coupon or
   * a referral was granted by the rules, not by a person, and inventing an actor
   * for those would put a staff member's name against something they did not do.
   */
  async recent(tenantId: string, limit = 500) {
    const entries = await prisma.coinLedgerEntry.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        amount: true,
        reason: true,
        note: true,
        createdAt: true,
        createdById: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            // Their membership *in this gym*, so their name can link to a
            // profile. Platform staff acting inside a gym they do not belong to
            // have none, and their name stays plain text rather than a link
            // that would 404.
            memberships: {
              where: { tenantId },
              select: { id: true },
              take: 1,
            },
          },
        },
        membership: {
          select: { id: true, memberId: true, user: { select: { name: true } } },
        },
      },
    });

    return {
      data: {
        entries: entries.map((entry) => ({
          id: entry.id,
          amount: entry.amount,
          reason: entry.reason,
          note: entry.note,
          createdAt: entry.createdAt,
          membershipId: entry.membership.id,
          memberId: entry.membership.memberId,
          memberName: entry.membership.user.name,
          /** Who did it, where a person did. Null for anything the rules granted. */
          actedById: entry.createdBy?.id ?? null,
          actedByName: entry.createdBy?.name ?? null,
          actedByAvatarUrl: entry.createdBy?.avatarUrl ?? null,
          /** Null where the actor is not a member of this gym. */
          actedByMembershipId: entry.createdBy?.memberships[0]?.id ?? null,
        })),
      },
    };
  },
};
