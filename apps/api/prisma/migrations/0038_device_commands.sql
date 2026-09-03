-- Documentation: The queue that pushes members out to the machines.
-- - Assigning a card in the app changed nothing on the wall: a device only
--   learns about a person when somebody enrols them on its keypad. With several
--   readers that is the same enrolment done several times, and a card that works
--   at the front door and not upstairs is the normal result.
-- - These devices cannot be pushed to. They poll, and the protocol's answer to
--   that poll is where a command is handed over — so a command has to wait
--   somewhere until the device next asks. This table is that somewhere.
-- - One row per device per command, not one per change. Three readers means the
--   same enrolment is queued three times, because each has to be told
--   separately and each can fail separately. A device that is unplugged keeps
--   its queue and drains it when it comes back, which is the behaviour a gym
--   expects after a power cut.
-- - `sentAt` and `completedAt` are apart on purpose. Handed over is not the same
--   as applied: the device confirms separately, and a command that is sent and
--   never confirmed is exactly the failure worth being able to see.
-- - Commands are kept after completion rather than deleted, so "why does this
--   member's card not work" has an answer that outlives the moment.

CREATE TABLE "DeviceCommand" (
  "id"          TEXT PRIMARY KEY NOT NULL,
  "deviceId"    TEXT NOT NULL,
  "tenantId"    TEXT NOT NULL,
  -- The line handed to the device verbatim, minus its id prefix.
  "command"     TEXT NOT NULL,
  -- What this was for, so the queue is readable: USER_SET or USER_DELETE.
  "kind"        TEXT NOT NULL,
  -- The member it concerns, when it concerns one. Null survives their deletion.
  "membershipId" TEXT,
  "sentAt"      DATETIME,
  "completedAt" DATETIME,
  -- The device's own return code. 0 is success; anything else is worth reading.
  "resultCode"  TEXT,
  "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeviceCommand_deviceId_fkey"
    FOREIGN KEY ("deviceId") REFERENCES "AttendanceDevice"("id") ON DELETE CASCADE
);

-- The poll's own query: this device, not yet sent, oldest first.
CREATE INDEX "DeviceCommand_deviceId_sentAt_idx" ON "DeviceCommand"("deviceId", "sentAt");
CREATE INDEX "DeviceCommand_tenantId_idx" ON "DeviceCommand"("tenantId");
CREATE INDEX "DeviceCommand_membershipId_idx" ON "DeviceCommand"("membershipId");
