-- Documentation: Attach optional shifts to tenant members.
-- - Adds a nullable shift reference on TenantMembership so each member can be assigned to at most one shift.
-- - Existing members remain unassigned until a shift is selected.

ALTER TABLE "TenantMembership"
ADD COLUMN "shiftId" TEXT REFERENCES "Shift" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "TenantMembership_shiftId_idx" ON "TenantMembership"("shiftId");
