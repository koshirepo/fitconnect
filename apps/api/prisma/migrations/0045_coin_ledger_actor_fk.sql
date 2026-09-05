-- Name the person behind a hand-made coin adjustment.
--
-- `CoinLedgerEntry.createdById` has always held a user id, but with no foreign
-- key behind it: nothing stopped it pointing at an account that no longer
-- exists, and reading a name out of it meant a second query and a hand-rolled
-- join. This makes it a real relation.
--
-- SQLite cannot add a foreign key to an existing table, so the table is rebuilt.
-- Safe to do here, unlike the Product rebuild in 0042: nothing references
-- CoinLedgerEntry, so dropping it cascades to nothing, and the rows are copied
-- across before the old table goes.
--
-- `ON DELETE SET NULL`, deliberately. Deleting a staff account must not delete
-- the record of what they did to somebody's balance — what happened to a
-- member's coins outlives whoever recorded it.

PRAGMA defer_foreign_keys = ON;

CREATE TABLE "new_CoinLedgerEntry" (
    "id"                 TEXT NOT NULL PRIMARY KEY,
    "tenantId"           TEXT NOT NULL,
    "membershipId"       TEXT NOT NULL,
    "amount"             INTEGER NOT NULL,
    "reason"             TEXT NOT NULL,
    "note"               TEXT,
    "couponRedemptionId" TEXT,
    "paymentId"          TEXT,
    "createdById"        TEXT,
    "createdAt"          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CoinLedgerEntry_tenantId_fkey" FOREIGN KEY ("tenantId")
      REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CoinLedgerEntry_membershipId_fkey" FOREIGN KEY ("membershipId")
      REFERENCES "TenantMembership" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CoinLedgerEntry_createdById_fkey" FOREIGN KEY ("createdById")
      REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- An id that no longer names a user is nulled on the way across, or the new
-- constraint would refuse the row and take the ledger entry with it.
INSERT INTO "new_CoinLedgerEntry" (
  "id", "tenantId", "membershipId", "amount", "reason", "note",
  "couponRedemptionId", "paymentId", "createdById", "createdAt"
)
SELECT
  "id", "tenantId", "membershipId", "amount", "reason", "note",
  "couponRedemptionId", "paymentId",
  CASE
    WHEN "createdById" IN (SELECT "id" FROM "User") THEN "createdById"
    ELSE NULL
  END,
  "createdAt"
FROM "CoinLedgerEntry";

DROP TABLE "CoinLedgerEntry";
ALTER TABLE "new_CoinLedgerEntry" RENAME TO "CoinLedgerEntry";

CREATE INDEX "CoinLedgerEntry_membershipId_idx" ON "CoinLedgerEntry"("membershipId");
CREATE INDEX "CoinLedgerEntry_tenantId_idx" ON "CoinLedgerEntry"("tenantId");
CREATE INDEX "CoinLedgerEntry_tenantId_createdAt_idx" ON "CoinLedgerEntry"("tenantId", "createdAt");
-- New: the coins page reads every entry a person made, newest first.
CREATE INDEX "CoinLedgerEntry_createdById_idx" ON "CoinLedgerEntry"("createdById");

PRAGMA defer_foreign_keys = OFF;
