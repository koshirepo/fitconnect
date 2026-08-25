-- Documentation:
-- - Removes the global unique index on User.phone so family members can share a mobile number.
-- - Keep login and account lookup tied to email; phone becomes contact metadata only.

DROP INDEX IF EXISTS "User_phone_key";
