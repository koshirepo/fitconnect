-- Body metrics: a member's measurements over time.
--
-- One row per member per day, enforced by a unique index rather than by
-- application code, so a second reading on the same day is an edit of the
-- first instead of a new point on the chart.
--
-- Every measurement column is nullable and there are no defaults: a member who
-- only steps on a scale records a weight and nothing else, and a zero would be
-- a lie that charts as a real reading.

CREATE TABLE "BodyMetric" (
    "id"           TEXT NOT NULL PRIMARY KEY,
    "tenantId"     TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "measuredOn"   DATETIME NOT NULL,
    "recordedById" TEXT,
    "weightKg"     REAL,
    "heightCm"     REAL,
    "bodyFatPct"   REAL,
    "muscleMassKg" REAL,
    "chestCm"      REAL,
    "waistCm"      REAL,
    "hipsCm"       REAL,
    "armCm"        REAL,
    "thighCm"      REAL,
    "notes"        TEXT,
    "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    DATETIME NOT NULL,
    CONSTRAINT "BodyMetric_tenantId_fkey" FOREIGN KEY ("tenantId")
        REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BodyMetric_membershipId_fkey" FOREIGN KEY ("membershipId")
        REFERENCES "TenantMembership" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BodyMetric_recordedById_fkey" FOREIGN KEY ("recordedById")
        REFERENCES "TenantMembership" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "BodyMetric_membershipId_measuredOn_key"
    ON "BodyMetric" ("membershipId", "measuredOn");

-- The chart's own query: one member's readings, oldest first.
CREATE INDEX "BodyMetric_membershipId_measuredOn_idx"
    ON "BodyMetric" ("membershipId", "measuredOn");

CREATE INDEX "BodyMetric_tenantId_measuredOn_idx"
    ON "BodyMetric" ("tenantId", "measuredOn");

CREATE INDEX "BodyMetric_recordedById_idx"
    ON "BodyMetric" ("recordedById");
