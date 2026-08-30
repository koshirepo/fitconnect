-- Documentation: Coins that expire, and coins a gym can correct.
-- - `coinsOutstanding` appears on the finance page as a liability, and until now
--   it could only ever grow: nothing in the app ever removed a coin except
--   spending one. A gym that ran a generous referral promotion carried that
--   promise on its books forever.
-- - `coinExpiryDays` is opt-in per gym. Zero — the default, and what every gym
--   has today — means coins never expire, which is exactly the behaviour that
--   existed before this column, so nothing changes for anyone who ignores it.
-- - The sweep writes an ordinary negative ledger row with reason 'EXPIRED', so
--   an expiry is as explainable and as reversible as any other movement. The
--   ledger stays the only truth about a balance.

ALTER TABLE "TenantSettings" ADD COLUMN "coinExpiryDays" INTEGER NOT NULL DEFAULT 0;

-- The sweep asks "which earns are older than N days and not yet expired", per
-- gym. Without this it is a full scan of the ledger every night.
CREATE INDEX IF NOT EXISTS "CoinLedgerEntry_tenantId_createdAt_idx"
  ON "CoinLedgerEntry" ("tenantId", "createdAt");
