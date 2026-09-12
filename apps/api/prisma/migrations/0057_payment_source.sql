-- Tell a protein tub from a renewal.
--
-- A gym sells two unrelated things through one payment ledger: time in the gym,
-- and things off a shelf. Both write a `Payment` row, which is what lets the
-- finance page reconcile a month, but nothing on the row said which was which.
-- The payments screen therefore listed a store sale beside a membership renewal
-- with only the description to tell them apart, and could not filter either out.
--
-- `source` stores the split every reader was already re-deriving, in the same
-- precedence `financeRepository.incomeTotals` has always used: a plan first,
-- then a one-off charge, then a linked store order, then nothing.
--
-- The default is OTHER rather than SUBSCRIPTION deliberately. A row inserted by
-- code that has not been taught to set this should land in the bucket that means
-- "nobody said", where it is visible, and not silently inflate membership
-- revenue.
ALTER TABLE "Payment" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'OTHER';

-- Backfill in precedence order, each step narrowing what the next can claim.
UPDATE "Payment" SET "source" = 'SUBSCRIPTION' WHERE "subscriptionId" IS NOT NULL;

UPDATE "Payment"
SET "source" = 'CHARGE'
WHERE "subscriptionId" IS NULL
  AND "chargeId" IS NOT NULL;

UPDATE "Payment"
SET "source" = 'STORE'
WHERE "subscriptionId" IS NULL
  AND "chargeId" IS NULL
  AND "id" IN (SELECT "paymentId" FROM "StoreOrder" WHERE "paymentId" IS NOT NULL);

-- How the payments screen reads: one gym, one business, newest first.
CREATE INDEX "Payment_tenantId_source_createdAt_idx" ON "Payment"("tenantId", "source", "createdAt");
