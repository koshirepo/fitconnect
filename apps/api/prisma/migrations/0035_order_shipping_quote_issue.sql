-- Documentation: Why an order shipped free, when it should not have.
-- - Carriage is quoted from Delhivery at order time and frozen on the row. Three
--   things can make that quote come out at zero without anything failing: no
--   courier token configured, nothing in the basket resolving to a warehouse, or
--   a warehouse carrying no pincode — the last of which is skipped silently
--   inside the pricing loop, one parcel at a time.
-- - Each of those is a real decision ("a courier that will not answer must not
--   block a sale"), and none of them should change. What was missing is that the
--   shop had no way to know it had happened: the order simply read "Shipping:
--   Free" and the carriage came out of margin, invisibly.
-- - So the reason is recorded rather than the outcome second-guessed. NULL is
--   the ordinary case — priced properly, nothing to say. A string means the
--   quote did not fully price this order, and says which of the three it was, so
--   the desk can re-price before dispatch instead of discovering it on an
--   invoice weeks later.
-- - Deliberately not a boolean. "Something was wrong" is not actionable; "no
--   warehouse pincode, 1 of 2 parcels unpriced" is.

ALTER TABLE "Order" ADD COLUMN "shippingQuoteIssue" TEXT;
