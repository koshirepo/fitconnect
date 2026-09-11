-- What time it is where the gym is.
--
-- Every timestamp in this database is UTC, which is right for storage and
-- useless for a question like "when is the floor busiest". A gym in India
-- filling up at 6am has its rush stored at 00:30 the same day; bucket those
-- instants by hour without knowing the zone and the morning rush appears at
-- midnight.
--
-- Until now the only zone anywhere in the schema was on AttendanceDevice,
-- where it exists for a narrower reason: the reader on the wall reports local
-- wall-clock time with no offset, so iclock.service needs the zone to work out
-- which instant a punch was. That is per-device by necessity — a chain could
-- run readers in two cities — but it leaves a gym with no reader with no zone
-- at all, and there is no reason a report should be unavailable to a gym that
-- marks attendance by hand.
--
-- So the gym's own zone belongs here, next to overdueDays and the rest of what
-- a gym decides for itself. The device keeps its own: that one answers "what
-- did this machine mean by 09:15", this one answers "what does this gym call
-- morning".
--
-- Backfilled from the gym's oldest reader where there is one, because that zone
-- was already chosen deliberately by whoever registered it. Everyone else gets
-- Asia/Kolkata, which is both the device default and where every gym on the
-- platform is today; a gym elsewhere can change it on the settings screen.
ALTER TABLE "TenantSettings" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata';

UPDATE "TenantSettings"
SET "timezone" = COALESCE(
  (
    SELECT d."timezone"
    FROM "AttendanceDevice" d
    WHERE d."tenantId" = "TenantSettings"."tenantId"
    ORDER BY d."createdAt" ASC
    LIMIT 1
  ),
  'Asia/Kolkata'
);
