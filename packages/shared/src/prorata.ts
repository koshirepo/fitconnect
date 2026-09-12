/**
 * Documentation: How much membership time a part payment buys.
 *
 * - Shared rather than server-only because the desk sees the answer before it commits to it: the record-payment screen draws the term it is about to sell across a calendar, and a client that worked the length out its own way would draw one term and save another.
 * - The rule is proportion, floored. A ₹600 plan running 30 days, part-paid ₹300, buys 15 days; the ₹300 balance buys the other 15 when it arrives, so however many instalments a period comes in, the shares add back to exactly one period and never more.
 * - Flooring is deliberate and always in the gym's favour: a rounding error must never hand out a day nobody paid for, and a payment too small to buy a whole day buys none rather than a token.
 * - A row with no basis is a payment in full of whatever it was for — which is what every row recorded before this rule existed.
 * - Primary exports: proratedDays.
 */

/**
 * Days a payment buys, in proportion to the money it carried.
 *
 * `basisAmount` is the whole payable the payment is a share of. Null, zero, or
 * a payment that covers it outright all mean "the full period".
 */
export function proratedDays(
  durationDays: number,
  paidAmount: number,
  basisAmount: number | null,
): number {
  if (!basisAmount || basisAmount <= 0) return durationDays;
  if (paidAmount >= basisAmount) return durationDays;

  return Math.max(0, Math.floor((durationDays * paidAmount) / basisAmount));
}
