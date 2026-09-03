-- Documentation: RFID attendance machines, and the members they recognise.
-- - A gym can have several: a door reader at the entrance, another at the studio
--   upstairs. Each is its own row, all pointing at one tenant, and a punch from
--   any of them is the same member arriving. The existing unique key on
--   (tenantId, membershipId, date) is what makes that safe — two readers on one
--   morning collapse to one attendance record rather than two.
-- - `serialNumber` is globally unique rather than unique per tenant, because it
--   is the only thing on an incoming punch that says which gym it belongs to.
--   ZKTeco and eSSL devices authenticate with nothing else: the serial is sent
--   as a query parameter and there is no secret, no signature and no session.
--   So the serial has to resolve to exactly one gym, and a serial nobody has
--   registered is refused rather than guessed at.
-- - `deviceUserPin` is the number the machine actually reports. Its enrolment
--   record holds the card, and its attendance log holds only the PIN, so the PIN
--   is the join between a punch and a member. `rfidCardNumber` is stored beside
--   it because that is what is printed on the card in somebody's hand, and it is
--   what the desk searches by when a member says their card stopped working.
-- - Both are unique per tenant, not globally: two gyms will hand out card number
--   1 to their first member, and neither is wrong.
-- - `lastSeenAt` is separate from `lastPunchAt` on purpose. These devices poll
--   for commands every few seconds even when the gym is empty, so a device that
--   is online but quiet looks identical to one that is unplugged unless the two
--   are recorded apart.

CREATE TABLE "AttendanceDevice" (
  "id"           TEXT PRIMARY KEY NOT NULL,
  "tenantId"     TEXT NOT NULL,
  "serialNumber" TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "location"     TEXT,
  -- The zone the device's own clock is set to. Its punches carry a local
  -- timestamp with no offset, so without this they cannot be placed in time.
  "timezone"     TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  "isActive"     INTEGER NOT NULL DEFAULT 1,
  -- Last contact of any kind, including an idle command poll.
  "lastSeenAt"   DATETIME,
  -- Last actual punch, which is the one that says the door is being used.
  "lastPunchAt"  DATETIME,
  -- The device's own upload cursor, echoed back so it does not resend history.
  "stamp"        TEXT,
  "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AttendanceDevice_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "AttendanceDevice_serialNumber_key" ON "AttendanceDevice"("serialNumber");
CREATE INDEX "AttendanceDevice_tenantId_idx" ON "AttendanceDevice"("tenantId");

ALTER TABLE "TenantMembership" ADD COLUMN "deviceUserPin" INTEGER;
ALTER TABLE "TenantMembership" ADD COLUMN "rfidCardNumber" TEXT;

CREATE UNIQUE INDEX "TenantMembership_tenantId_deviceUserPin_key"
  ON "TenantMembership"("tenantId", "deviceUserPin");
CREATE UNIQUE INDEX "TenantMembership_tenantId_rfidCardNumber_key"
  ON "TenantMembership"("tenantId", "rfidCardNumber");
