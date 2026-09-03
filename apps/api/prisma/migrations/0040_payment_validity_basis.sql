-- Documentation: The price a payment's validity is a share of.
-- - Membership time is now granted in proportion to the money taken: ₹300 of a
--   ₹600 plan running 30 days buys 15 days, and paying the ₹300 balance later
--   buys the other 15. Before this, a part payment granted the whole period and
--   the shortfall was tracked only as a debt.
-- - The proportion needs a denominator, and after a row is split neither half
--   still knows it. A ₹600 row part-paid ₹300 becomes a ₹300 completed row and a
--   ₹300 balance; each looks like a payment in full of itself, so each would
--   grant the entire 30 days and the member would end up with sixty.
-- - So the payable is written down when the row is created and carried onto the
--   balance split from it. Days are then `durationDays × amount ÷ basis`, which
--   sums back to exactly one period however many instalments it arrives in.
-- - It is the *discounted* payable, not the list price. A ₹600 plan sold for
--   ₹500 with a coupon and paid in full is thirty days, not twenty-five.
-- - NULL means "the whole window", which is what every existing row was granted
--   under the old rule. The backfill therefore sets the basis to the row's own
--   amount for completed subscription payments, so their ratio is 1 and nothing
--   already granted is retrospectively cut.

ALTER TABLE "Payment" ADD COLUMN "validityBasisAmount" INTEGER;

UPDATE "Payment"
SET "validityBasisAmount" = "amount"
WHERE "subscriptionId" IS NOT NULL
  AND "amount" > 0;
