/**
 * Documentation: What the shop made, as opposed to what it took.
 *
 * - One definition of store profit, shared by the books and by the store's own analytics page. Both used to be able to disagree about what a month's margin was; now there is nothing to disagree with.
 * - Revenue is what buyers actually paid, so coupons and coins are already off it. Cost is what those same units cost the gym, read from the order line where it was frozen at the moment of sale — repricing a product, or a supplier putting their rate up, moves nothing that already sold.
 * - A line sold before its purchase price was ever recorded has no honest cost to set against it. It is reported in `uncostedSales` and left out of `profit` rather than treated as free, which would read every pre-costing sale as pure margin. That can understate profit; it can never overstate it.
 * - Primary exports: summariseStore, storeSaleSelect, storeSaleWindow, type StoreSaleOrder, type StoreSummary.
 */
import { Prisma } from "../../generated/prisma/client";
import { PaymentStatus } from "@fitconnect/shared/types/enums";

/**
 * Which orders a month's figures are built from, and which columns they need.
 *
 * Both readers — the books and the store's own analytics page — take these from
 * here rather than writing their own. Two hand-written copies of "what counts
 * as a sale in September" is two answers waiting to disagree, and the symptom
 * would be a finance page and a store page quoting different revenue for the
 * same month with nothing to say which was wrong.
 */
export const storeSaleSelect = {
  subtotalAmount: true,
  discountAmount: true,
  coinsRedeemed: true,
  totalAmount: true,
  items: {
    select: {
      variantId: true,
      productName: true,
      variantName: true,
      quantity: true,
      lineTotal: true,
      lineCost: true,
    },
  },
} satisfies Prisma.StoreOrderSelect;

/**
 * A month of completed sales, on the books' own dates.
 *
 * A member's order counts when its payment settled; a guest's, which writes no
 * payment row at all, when the order was written. Using one rule for both would
 * put a January order paid in February in the wrong month on one page and the
 * right one on the other.
 */
export function storeSaleWindow(
  tenantId: string,
  from: Date,
  to: Date,
): Prisma.StoreOrderWhereInput {
  return {
    tenantId,
    OR: [
      { paymentId: null, status: "COMPLETED", createdAt: { gte: from, lt: to } },
      { payment: { status: PaymentStatus.COMPLETED, paidAt: { gte: from, lt: to } } },
    ],
  };
}

/** One completed order, with the lines it sold. Inferred, never hand-written. */
export type StoreSaleOrder = Prisma.StoreOrderGetPayload<{
  select: typeof storeSaleSelect;
}>;

export type StoreSummary = ReturnType<typeof summariseStore>;

/**
 * Per-product figures are line totals, before coupons and coins, which belong
 * to a basket rather than to any one thing in it.
 */
export function summariseStore(orders: StoreSaleOrder[]) {
  let grossSales = 0;
  let discounts = 0;
  let netSales = 0;
  let cost = 0;
  let units = 0;
  let uncostedSales = 0;
  let uncostedUnits = 0;
  // What buyers actually paid for the lines that had a cost to set against it.
  // A basket's coupon and coins are shared across its lines by value, so one
  // that mixed costed and uncosted lines takes its discount off each in
  // proportion — never entirely off one, which could push profit below zero on
  // a month where nothing had a known cost at all.
  let costedSales = 0;

  const byVariant = new Map<
    string,
    {
      variantId: string;
      productName: string;
      variantName: string;
      units: number;
      sales: number;
      cost: number;
      uncostedUnits: number;
    }
  >();

  for (const order of orders) {
    grossSales += order.subtotalAmount;
    discounts += order.discountAmount + order.coinsRedeemed;
    netSales += order.totalAmount;

    // How much of each rupee of list price this basket actually collected.
    const paidShare = order.subtotalAmount > 0 ? order.totalAmount / order.subtotalAmount : 0;

    for (const item of order.items) {
      const row = byVariant.get(item.variantId) ?? {
        variantId: item.variantId,
        productName: item.productName,
        variantName: item.variantName,
        units: 0,
        sales: 0,
        cost: 0,
        uncostedUnits: 0,
      };
      byVariant.set(item.variantId, row);

      units += item.quantity;
      row.units += item.quantity;
      row.sales += item.lineTotal;

      if (item.lineCost === null) {
        uncostedSales += item.lineTotal;
        uncostedUnits += item.quantity;
        row.uncostedUnits += item.quantity;
      } else {
        cost += item.lineCost;
        row.cost += item.lineCost;
        costedSales += item.lineTotal * paidShare;
      }
    }
  }

  // Whole rupees, like every other amount here; the share above is fractional.
  const profit = Math.round(costedSales - cost);

  return {
    orders: orders.length,
    units,
    grossSales,
    discounts,
    netSales,
    cost,
    profit,
    marginPercent: costedSales > 0 ? Math.round((profit / costedSales) * 1000) / 10 : null,
    uncostedSales,
    uncostedUnits,
    products: [...byVariant.values()]
      .map((row) => ({
        ...row,
        // Half a margin is not a margin: a figure only when every unit had a cost.
        profit: row.uncostedUnits === 0 ? row.sales - row.cost : null,
      }))
      .sort((a, b) => b.sales - a.sales),
  };
}
