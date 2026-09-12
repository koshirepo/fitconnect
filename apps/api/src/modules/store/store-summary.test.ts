/**
 * Documentation: What the shop made, and what nobody should be able to claim it made.
 *
 * - `summariseStore` is the one definition of store profit, read by the books and by the store's own analytics page. An error here misstates a gym's margin on both at once, quietly and in the same direction, so there is nothing on screen to catch it.
 * - The cases that matter are the dishonest ones. A line sold before anybody recorded a purchase price has no cost to set against it, and the tempting shortcut — treat missing as zero — reports the entire sale as profit. These tests exist mostly to keep that from creeping back.
 * - Baskets are the other trap. A coupon belongs to an order, not to any one thing in it, so a basket that mixes costed and uncosted lines has to share the discount across them by value rather than taking it all off one.
 */
import { describe, expect, it } from "vitest";
import { summariseStore, type StoreSaleOrder } from "./store-summary";
import { membershipPaymentSource, PaymentSource } from "@fitconnect/shared/types/enums";

/** One line, priced and costed. `lineCost: null` is a sale made before costing. */
function line(overrides: Partial<StoreSaleOrder["items"][number]> = {}) {
  return {
    variantId: "v1",
    productName: "Whey",
    variantName: "1kg",
    quantity: 1,
    lineTotal: 1000,
    lineCost: 900,
    ...overrides,
  };
}

/** An order that collected exactly its subtotal unless told otherwise. */
function order(overrides: Partial<StoreSaleOrder> = {}): StoreSaleOrder {
  const items = overrides.items ?? [line()];
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);

  return {
    subtotalAmount: subtotal,
    discountAmount: 0,
    coinsRedeemed: 0,
    totalAmount: subtotal,
    items,
    ...overrides,
  };
}

describe("summariseStore", () => {
  it("reports profit as what was collected less what the goods cost", () => {
    const summary = summariseStore([order()]);

    expect(summary.netSales).toBe(1000);
    expect(summary.cost).toBe(900);
    expect(summary.profit).toBe(100);
    expect(summary.marginPercent).toBe(10);
  });

  it("counts units and orders, not just money", () => {
    const summary = summariseStore([
      order({ items: [line({ quantity: 2, lineTotal: 2000, lineCost: 1800 })] }),
      order(),
    ]);

    expect(summary.orders).toBe(2);
    expect(summary.units).toBe(3);
  });

  // The whole reason the uncosted bookkeeping exists.
  it("leaves an uncosted line out of profit rather than treating it as free", () => {
    const summary = summariseStore([order({ items: [line({ lineCost: null })] })]);

    expect(summary.uncostedSales).toBe(1000);
    expect(summary.uncostedUnits).toBe(1);
    // Not 1000. A tub whose purchase price nobody recorded is unknown, not free.
    expect(summary.profit).toBe(0);
    expect(summary.marginPercent).toBeNull();
  });

  it("still reports profit on the costed half of a mixed month", () => {
    const summary = summariseStore([
      order(),
      order({ items: [line({ variantId: "v2", productName: "Shaker", lineCost: null })] }),
    ]);

    expect(summary.profit).toBe(100);
    expect(summary.uncostedSales).toBe(1000);
  });

  /**
   * A coupon belongs to the basket, so it comes off each line in proportion.
   *
   * Taking the whole discount off the costed line would report a loss on a
   * basket that made money.
   */
  it("shares a basket discount across its lines by value", () => {
    const summary = summariseStore([
      order({
        items: [
          line({ lineTotal: 1000, lineCost: 900 }),
          line({ variantId: "v2", lineTotal: 1000, lineCost: null }),
        ],
        subtotalAmount: 2000,
        discountAmount: 200,
        totalAmount: 1800,
      }),
    ]);

    // The costed line collected 90% of its list price, so 900 of it.
    expect(summary.profit).toBe(0);
    expect(summary.netSales).toBe(1800);
    expect(summary.discounts).toBe(200);
  });

  it("reports a loss as a loss when goods sold below cost", () => {
    const summary = summariseStore([
      order({ items: [line({ lineTotal: 800, lineCost: 900 })] }),
    ]);

    expect(summary.profit).toBe(-100);
  });

  it("gives a product no margin while any of its units went uncosted", () => {
    const summary = summariseStore([
      order(),
      order({ items: [line({ lineCost: null })] }),
    ]);

    const whey = summary.products.find((row) => row.variantId === "v1");
    // Half a margin is not a margin.
    expect(whey?.profit).toBeNull();
    expect(whey?.units).toBe(2);
  });

  it("has nothing to say about an empty month, without dividing by zero", () => {
    const summary = summariseStore([]);

    expect(summary.orders).toBe(0);
    expect(summary.profit).toBe(0);
    expect(summary.marginPercent).toBeNull();
    expect(summary.products).toEqual([]);
  });
});

/**
 * Which business a payment belongs to.
 *
 * The precedence is what keeps store revenue out of membership income. Getting
 * it wrong does not throw — it silently files a tub as a renewal.
 */
describe("membershipPaymentSource", () => {
  it("calls a payment against a plan a subscription", () => {
    expect(membershipPaymentSource({ subscriptionId: "s1" })).toBe(PaymentSource.SUBSCRIPTION);
  });

  it("prefers the plan when a row carries both a plan and a charge", () => {
    expect(membershipPaymentSource({ subscriptionId: "s1", chargeId: "c1" })).toBe(
      PaymentSource.SUBSCRIPTION,
    );
  });

  it("calls a payment against a charge a charge", () => {
    expect(membershipPaymentSource({ chargeId: "c1" })).toBe(PaymentSource.CHARGE);
  });

  // Not SUBSCRIPTION: a manual entry nobody attributed should land where it is
  // visible, rather than quietly inflating membership revenue.
  it("calls a payment against nothing other", () => {
    expect(membershipPaymentSource({})).toBe(PaymentSource.OTHER);
    expect(membershipPaymentSource({ subscriptionId: null, chargeId: null })).toBe(
      PaymentSource.OTHER,
    );
  });
});
