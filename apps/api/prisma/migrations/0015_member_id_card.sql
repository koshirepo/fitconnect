-- Documentation: Shareable member ID cards.
-- - Each membership gets an unguessable token. The card lives at a public URL
--   keyed by that token, so a member can open it from a WhatsApp message or an
--   email on a phone that has never signed in.
-- - The token, not the membership id, is what the URL carries. Membership ids
--   are cuids and member numbers are sequential, so either would let anyone
--   walk the roster and collect names and photos.
-- - Nullable: memberships created before this migration get a token the first
--   time their card is asked for.

ALTER TABLE "TenantMembership" ADD COLUMN "idCardToken" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "TenantMembership_idCardToken_key"
  ON "TenantMembership" ("idCardToken");
