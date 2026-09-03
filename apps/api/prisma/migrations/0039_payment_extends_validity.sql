-- Documentation: Which payments buy membership time, and which only settle a debt.
-- - Most subscription payments buy a period. A balance does not: when somebody
--   pays ₹500 of ₹600, the ₹500 row already carried the membership its full
--   window, and the ₹100 remainder is money owed against time already granted.
--   Paying it must not extend anything a second time.
-- - That was true by accident until now. Balance rows were written with no
--   validity and nothing ever added one, so the distinction lived in the fact
--   that the settle path did not stamp dates. It does now — a counter-settled
--   signup had to get a due date from somewhere — and with it the accident
--   became a bug: settling a ₹100 remainder would have granted another month.
-- - So the rule is written down instead of inferred. `extendsValidity` is true
--   for a payment that buys a period and false for one that settles a debt, and
--   the settle path reads it rather than guessing from the description.
-- - The backfill matches on the description because that is the only mark those
--   rows carry. It is narrow on purpose: only rows that are for a subscription,
--   have no validity of their own, and are named as a balance.

ALTER TABLE "Payment" ADD COLUMN "extendsValidity" BOOLEAN NOT NULL DEFAULT 1;

UPDATE "Payment"
SET "extendsValidity" = 0
WHERE "subscriptionId" IS NOT NULL
  AND "validUntil" IS NULL
  AND ("description" LIKE 'Balance — %' OR "description" = 'Balance');
