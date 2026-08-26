-- Documentation: Membership freezes.
-- - A freeze pauses a term and gives the days back at the end. It is not a
--   refund: the money stays with the gym and the member keeps the days.
-- - The allowance lives on the plan, so a gym can be generous on one plan
--   without that leaking into every other. Zero — the default — means a plan
--   cannot be frozen at all, which is what every existing plan gets.
-- - A freeze attaches to the payment whose validity it extends, not to the
--   membership. That is what makes the budget belong to the term: a new payment
--   is a new term with a fresh budget, and reversing a freeze knows exactly
--   which `validUntil` to put back.
-- - `daysUsed` is written optimistically at booking and corrected when the
--   freeze actually ends, so the member's end date is truthful from the moment
--   they book rather than only once they return.

ALTER TABLE "Subscription" ADD COLUMN "freezeDays" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Subscription" ADD COLUMN "freezeCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "MembershipFreeze" (
  "id"            TEXT PRIMARY KEY,
  "tenantId"      TEXT NOT NULL,
  "membershipId"  TEXT NOT NULL,
  -- The payment this freeze extends. Its plan supplies the budget.
  "paymentId"     TEXT NOT NULL,
  "startsOn"      DATETIME NOT NULL,
  -- What was booked.
  "plannedEndsOn" DATETIME NOT NULL,
  -- What was actually used. Null while the freeze is still running.
  "endedOn"       DATETIME,
  -- Days charged against the budget: the booked count until the freeze ends,
  -- then the real one.
  "daysUsed"      INTEGER NOT NULL,
  "reason"        TEXT,
  -- "ENDED_EARLY" | "ATTENDED" | null while running or when it ran its course.
  "endedBy"       TEXT,
  "createdById"   TEXT,
  "createdAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE,
  FOREIGN KEY ("membershipId") REFERENCES "TenantMembership"("id") ON DELETE CASCADE,
  FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "MembershipFreeze_membershipId_idx" ON "MembershipFreeze" ("membershipId");
CREATE INDEX IF NOT EXISTS "MembershipFreeze_paymentId_idx" ON "MembershipFreeze" ("paymentId");
CREATE INDEX IF NOT EXISTS "MembershipFreeze_tenantId_idx" ON "MembershipFreeze" ("tenantId");
