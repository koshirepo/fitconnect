-- Documentation: Composite index matching how payments are actually queried.
-- - Every hot payment read filters on tenant and status together — the ledger
--   tabs, the pending-payment totals behind the member list, the finance
--   summaries. Separate single-column indexes let SQLite use only one of them
--   per scan, so the second predicate always fell back to filtering rows.
-- - `tenantId, createdAt` covers the other shape: one gym's ledger, newest
--   first, which is how the payments page and its CSV export read it.

CREATE INDEX IF NOT EXISTS "Payment_tenantId_status_idx" ON "Payment" ("tenantId", "status");
CREATE INDEX IF NOT EXISTS "Payment_tenantId_createdAt_idx" ON "Payment" ("tenantId", "createdAt");
