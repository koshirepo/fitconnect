-- Documentation: Gender on the user record.
-- - Asked for on the member form, so both self-signup and admin-added members
--   carry it. Nullable, because every account that already exists predates the
--   question and there is nothing truthful to backfill it with.
-- - Stored as a plain string ("MALE", "FEMALE", "OTHER") to match how every
--   other enum in this schema is kept on SQLite.

ALTER TABLE "User" ADD COLUMN "gender" TEXT;
