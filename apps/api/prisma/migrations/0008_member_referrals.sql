-- Documentation: Add member referral tracking.
-- - Stores which existing tenant member referred a newly added member.
-- - Allows referral leaderboard and member-level attribution features.

ALTER TABLE "TenantMembership"
ADD COLUMN "referredByMembershipId" TEXT REFERENCES "TenantMembership" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "TenantMembership_referredByMembershipId_idx" ON "TenantMembership"("referredByMembershipId");
