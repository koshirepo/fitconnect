-- Documentation: Covering indexes for the members roster reads.
-- - The roster is read one gym at a time, filtered by status, newest member
--   first. `TenantMembership` carried only `(tenantId)`, so every status tab
--   scanned all of a gym's memberships and sorted the survivors in memory. The
--   unique `(tenantId, memberId)` index rescued the unfiltered list alone.
-- - `(tenantId, status, memberId)` serves the Active/Inactive tabs: SQLite
--   seeks the gym and status, then walks memberId in order and stops at the
--   page size. `(tenantId, status, dueDate)` serves the Due tab, which is
--   status = ACTIVE with dueDate in the past.
-- - Payment already carries the equivalent pair; this brings memberships in
--   line with it.

CREATE INDEX IF NOT EXISTS "TenantMembership_tenantId_status_memberId_idx"
  ON "TenantMembership" ("tenantId", "status", "memberId");

CREATE INDEX IF NOT EXISTS "TenantMembership_tenantId_status_dueDate_idx"
  ON "TenantMembership" ("tenantId", "status", "dueDate");
