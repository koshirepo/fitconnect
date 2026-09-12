/**
 * Documentation: The shop's own books.
 *
 * - Answers what the gym's store sold in a month, what that stock cost, and what was left — the questions the finance page cannot answer because it reports the whole business at once.
 * - Deliberately separate from payment analytics. A gym runs two unrelated businesses through one ledger: memberships, and things off a shelf. Reading them together made a busy counter look like a busy sign-up desk, so nothing here counts a subscription and nothing on the payments screen counts a tub.
 * - Profit is the point. Revenue alone says nothing about a shop — a gym can sell ₹200,000 of supplements and make ₹8,000 — so every total here carries its cost and its margin beside it, read from the order lines where both prices were frozen at the moment of sale.
 * - Which orders count, and which columns they need, come from `store-summary` rather than being restated here. The books read the same two definitions, so the two pages cannot quote different revenue for the same month.
 * - Primary exports: storeAnalyticsService.
 */
import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { monthRange } from "../../lib/month";
import {
  summariseStore,
  storeSaleSelect,
  storeSaleWindow,
} from "./store-summary";

/**
 * The shared sale shape, plus the three columns only this page buckets by.
 *
 * Spread rather than rewritten, so a column added to the books' select arrives
 * here too and the two can never fall out of step.
 */
const analyticsSelect = {
  ...storeSaleSelect,
  channel: true,
  membershipId: true,
  createdAt: true,
  payment: { select: { paidAt: true } },
} satisfies Prisma.StoreOrderSelect;

type AnalyticsOrder = Prisma.StoreOrderGetPayload<{ select: typeof analyticsSelect }>;

/**
 * The day a sale counts on.
 *
 * A member's order counts when the money settled, a guest's when the order was
 * written — the same two rules `storeSaleWindow` selects on. Using `createdAt`
 * for everything would put a January order paid in February in the wrong month
 * on this page and the right one in the books.
 */
function saleDay(order: AnalyticsOrder) {
  return (order.payment?.paidAt ?? order.createdAt).toISOString().slice(0, 10);
}

/**
 * Revenue, cost and profit for one slice of the month's orders.
 *
 * `uncostedSales` rides along because without it a slice can look like it is
 * lying. Guests buying mostly uncosted stock show a large figure collected, a
 * small profit, and a healthy-looking margin — all three correct, since margin
 * is taken on the costed part alone, but incoherent unless the screen can say
 * how much of the slice had no purchase price behind it.
 */
function slice(orders: AnalyticsOrder[]) {
  const summary = summariseStore(orders);

  return {
    orders: summary.orders,
    units: summary.units,
    netSales: summary.netSales,
    cost: summary.cost,
    profit: summary.profit,
    marginPercent: summary.marginPercent,
    uncostedSales: summary.uncostedSales,
    uncostedUnits: summary.uncostedUnits,
  };
}

/**
 * Bucket once, summarise once per bucket.
 *
 * The obvious shape — filter the whole month per channel, per buyer, per day —
 * walks every order some thirty-odd times for a thirty-day month. One pass to
 * group and one summary per group is the same answer for a fraction of the work,
 * which matters here because the summary itself walks every line of every order.
 */
function groupBy(orders: AnalyticsOrder[], key: (order: AnalyticsOrder) => string) {
  const buckets = new Map<string, AnalyticsOrder[]>();

  for (const order of orders) {
    const bucket = buckets.get(key(order));
    if (bucket) bucket.push(order);
    else buckets.set(key(order), [order]);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([value, rows]) => ({ value, ...slice(rows) }));
}

export const storeAnalyticsService = {
  /**
   * One month of the shop.
   *
   * The splits are the three questions a gym actually asks about its counter:
   * is the shop making money, where is it selling, and what is worth restocking.
   */
  async summary(tenantId: string, month: string) {
    const { from, to } = monthRange(month);

    const orders = await prisma.storeOrder.findMany({
      where: storeSaleWindow(tenantId, from, to),
      select: analyticsSelect,
    });

    // Channels come from the data rather than a fixed list, so one added later
    // appears here without this function being touched.
    const byChannel = groupBy(orders, (order) => order.channel).map(
      ({ value, ...figures }) => ({ channel: value, ...figures }),
    );

    // A gym selling mostly to guests is running a shop that happens to have a
    // gym attached — worth being able to see. Split directly rather than through
    // `groupBy`: both halves are always reported, including the empty one, and
    // a missing key here would read as "no guest sales" the same as zero.
    const byBuyer = {
      member: slice(orders.filter((order) => order.membershipId !== null)),
      guest: slice(orders.filter((order) => order.membershipId === null)),
    };

    return {
      data: {
        month,
        totals: summariseStore(orders),
        byChannel,
        byBuyer,
        // The month day by day, so a spike has a date on it.
        daily: groupBy(orders, saleDay).map(({ value, ...figures }) => ({
          day: value,
          ...figures,
        })),
      },
    };
  },
};
