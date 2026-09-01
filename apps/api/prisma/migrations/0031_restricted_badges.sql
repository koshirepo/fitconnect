-- Documentation: Badges not everyone may hand out.
-- - Assigning a badge was one capability, `badges:assign`, held by coaches and
--   admins alike. That is right for "100 sessions" and wrong for anything that
--   confers standing — a staff credential, a lifetime membership, a founder
--   badge that a coach could otherwise grant themselves on the floor.
-- - One flag per badge rather than a separate admin-only badge table: a badge
--   is the same object either way, and the gym decides which of its own badges
--   carry weight. Enforced against the new `badges:assign:restricted`, which
--   only ADMIN holds by default and which a gym can grant to a custom role
--   through the existing role-permission overrides.
-- - Defaults to false, so every badge that exists today keeps behaving exactly
--   as it does now and no gym loses the ability to assign anything.

ALTER TABLE "Badge" ADD COLUMN "restricted" BOOLEAN NOT NULL DEFAULT false;
