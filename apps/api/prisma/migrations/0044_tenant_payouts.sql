-- Paying gyms what FitConnect collected for them.
--
-- A gym that has not configured its own Razorpay collects into the platform
-- account. That money is the gym's, less what Razorpay charged and what
-- FitConnect keeps, and until now there was no record of the debt and no way to
-- ask for it.
--
-- Entirely additive: two columns on Payment, two rates on Tenant, two new
-- tables. Nothing is rebuilt, so unlike 0042 there is no cascade to step around.

-- What Razorpay actually took, in PAISE.
--
-- Paise because a fee is ₹23.60 and a payout statement that rounded it to whole
-- rupees would not reconcile against Razorpay's own. Read from the
-- `payment.captured` webhook, which already carries both, so no extra API call.
-- Null on payments taken before this existed, and on anything paid in cash.
ALTER TABLE "Payment" ADD COLUMN "gatewayFeePaise" INTEGER;
ALTER TABLE "Payment" ADD COLUMN "gatewayTaxPaise" INTEGER;

-- What FitConnect keeps, per gym, in BASIS POINTS. 50 is 0.50%.
--
-- Two rates because the two sales are different businesses: a membership is
-- recurring revenue the gym already owns, a tub of protein is stock somebody
-- had to buy. Basis points rather than a percentage so 2.25% needs no float and
-- the arithmetic stays in integers.
ALTER TABLE "Tenant" ADD COLUMN "subscriptionCommissionBps" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "Tenant" ADD COLUMN "storeCommissionBps" INTEGER NOT NULL DEFAULT 50;

-- Where a gym wants its money sent. One per gym.
--
-- The account number is stored sealed, like the gateway secrets: it is the only
-- field here worth stealing, and every screen that shows an account needs no
-- more than the last four digits. Those are kept in the clear so a payout list
-- can be rendered without unsealing anything.
CREATE TABLE "TenantBankAccount" (
    "id"            TEXT NOT NULL PRIMARY KEY,
    "tenantId"      TEXT NOT NULL,
    "accountHolder" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountLast4"  TEXT NOT NULL,
    "ifsc"          TEXT NOT NULL,
    "bankName"      TEXT,
    "createdAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     DATETIME NOT NULL,
    CONSTRAINT "TenantBankAccount_tenantId_fkey" FOREIGN KEY ("tenantId")
      REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TenantBankAccount_tenantId_key" ON "TenantBankAccount"("tenantId");

-- A gym asking for its money, and the record of it being sent.
--
-- The app owns the ledger and the paperwork and never moves money: platform
-- staff make the transfer from their own bank and record the reference, which
-- is what PAID means here.
--
-- Every amount is in paise. The deductions are snapshotted rather than derived,
-- because a gym's rate can change and a settled payout has to keep saying what
-- was actually taken on the day it was settled.
CREATE TABLE "TenantPayout" (
    "id"              TEXT NOT NULL PRIMARY KEY,
    "tenantId"        TEXT NOT NULL,
    "status"          TEXT NOT NULL DEFAULT 'REQUESTED',
    "grossPaise"      INTEGER NOT NULL,
    "gatewayFeePaise" INTEGER NOT NULL,
    "commissionPaise" INTEGER NOT NULL,
    "commissionBps"   INTEGER NOT NULL,
    "netPaise"        INTEGER NOT NULL,
    "requestedById"   TEXT,
    "decidedById"     TEXT,
    "accountHolder"   TEXT NOT NULL,
    "accountLast4"    TEXT NOT NULL,
    "ifsc"            TEXT NOT NULL,
    "reference"       TEXT,
    "note"            TEXT,
    "requestedAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt"       DATETIME,
    "paidAt"          DATETIME,
    "updatedAt"       DATETIME NOT NULL,
    CONSTRAINT "TenantPayout_tenantId_fkey" FOREIGN KEY ("tenantId")
      REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TenantPayout_tenantId_idx" ON "TenantPayout"("tenantId");
CREATE INDEX "TenantPayout_tenantId_status_idx" ON "TenantPayout"("tenantId", "status");
CREATE INDEX "TenantPayout_status_idx" ON "TenantPayout"("status");
