-- Attendance becomes a session: a check-in, a check-out, and the shift it belongs to.
--
-- Until now a row was one visit per member per day and carried only an arrival
-- time, so a gym running a morning and an evening shift could record at most
-- one of them and never how long anybody stayed.
--
-- The unique key moves with it. It was (tenant, member, date), which is exactly
-- what limited a member to one visit a day; it becomes (tenant, member, date,
-- shiftKey), so each shift gets its own session while a replayed punch still
-- rewrites the row it belongs to rather than opening a second one.

-- The gym's own clock. Shift windows are local wall-clock times, so resolving a
-- punch against them requires knowing the zone the gym runs in. Matches the
-- default already used by attendance devices.
ALTER TABLE "Tenant" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata';

-- The last tap of a session. Null while somebody is still inside, and on any
-- session nobody ever closed.
ALTER TABLE "Attendance" ADD COLUMN "checkOutAt" DATETIME;

-- Which shift the session belongs to. Nullable, because a punch can land
-- outside every window and is still a visit that happened.
ALTER TABLE "Attendance" ADD COLUMN "shiftId" TEXT REFERENCES "Shift"("id") ON DELETE SET NULL;

-- The same thing again as a non-null discriminator, because the unique key
-- needs one: SQLite treats NULLs as distinct, so a nullable shiftId would let
-- every out-of-hours punch open a new row instead of updating its own session.
ALTER TABLE "Attendance" ADD COLUMN "shiftKey" TEXT NOT NULL DEFAULT 'none';

-- Set by the nightly sweep on a session nobody checked out of. checkOutAt stays
-- null there on purpose: a manufactured leaving time is indistinguishable from
-- a real one once it is in the table, and hours reports would bill it.
ALTER TABLE "Attendance" ADD COLUMN "closedAutomatically" INTEGER NOT NULL DEFAULT 0;

-- Everything recorded before this migration is a check-in with no check-out and
-- no shift. Marking it closed is what stops all of history from reading as
-- "still in the gym" the moment the open-session query goes live.
UPDATE "Attendance" SET "closedAutomatically" = 1;

DROP INDEX IF EXISTS "Attendance_tenantId_membershipId_date_key";

CREATE UNIQUE INDEX "Attendance_tenantId_membershipId_date_shiftKey_key"
  ON "Attendance"("tenantId", "membershipId", "date", "shiftKey");

-- Who is still inside.
CREATE INDEX "Attendance_membershipId_checkOutAt_idx"
  ON "Attendance"("membershipId", "checkOutAt");
