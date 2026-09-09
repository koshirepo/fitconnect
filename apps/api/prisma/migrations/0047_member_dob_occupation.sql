-- Two things a gym asks on the admission form and had nowhere to keep:
-- when a member was born, and what they do for a living.
--
-- Both hang off User rather than the membership: they are facts about the
-- person, like their gender and their phone, and neither changes when somebody
-- joins a second gym.
--
-- Occupation is a table, not a string on User. Free text would have made "how
-- many students train here" unanswerable across "Student", "student" and
-- "studnet", and every value has to resolve to an icon. The list is
-- platform-wide for the same reason: the answer should mean the same thing in
-- every gym.
--
-- Entirely additive — one new table and two nullable columns, no rebuild. Every
-- existing account reads as "not on file", which is what it is: nobody was
-- ever asked.

CREATE TABLE "Occupation" (
    "id"        TEXT    NOT NULL PRIMARY KEY,
    "name"      TEXT    NOT NULL,
    -- Icon key from the curated set the PWA draws, e.g. "graduation-cap".
    -- Null, or anything the PWA does not know, falls back to a briefcase.
    "icon"      TEXT,
    -- A retired occupation stays on the members who hold it and simply stops
    -- being offered on the form.
    "isActive"  BOOLEAN  NOT NULL DEFAULT true,
    "sortOrder" INTEGER  NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "Occupation_name_key" ON "Occupation"("name");
CREATE INDEX "Occupation_isActive_sortOrder_idx" ON "Occupation"("isActive", "sortOrder");

-- Stored at UTC midnight. A birthday has no time of day, and pinning every row
-- to the same instant is what lets "born on this day" be a plain equality
-- rather than a range that drifts with whoever is looking.
ALTER TABLE "User" ADD COLUMN "dateOfBirth" DATETIME;

-- ON DELETE SET NULL: removing an occupation must not remove the people who
-- held it. SQLite allows adding a column with a foreign key as long as its
-- default is NULL, which is the case here, so no table rebuild is needed.
ALTER TABLE "User" ADD COLUMN "occupationId" TEXT
  REFERENCES "Occupation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "User_occupationId_idx" ON "User"("occupationId");

-- The list every gym starts from. Fixed ids rather than generated ones so this
-- migration is re-runnable against a database that already has them, and so a
-- support conversation can name a row.
--
-- Ordered by how often an Indian gym's admission form actually sees them, with
-- OTHER last because it is the escape hatch rather than an answer.
INSERT OR IGNORE INTO "Occupation" ("id", "name", "icon", "isActive", "sortOrder")
VALUES
  ('occ_student',    'Student',        'graduation-cap', true,  10),
  ('occ_job',        'Job / Service',  'briefcase',      true,  20),
  ('occ_business',   'Business',       'store',          true,  30),
  ('occ_selfemp',    'Self-employed',  'hammer',         true,  40),
  ('occ_doctor',     'Doctor',         'stethoscope',    true,  50),
  ('occ_engineer',   'Engineer',       'cog',            true,  60),
  ('occ_teacher',    'Teacher',        'book-open',      true,  70),
  ('occ_homemaker',  'Homemaker',      'house',          true,  80),
  ('occ_government', 'Government',     'landmark',       true,  90),
  ('occ_retired',    'Retired',        'palm-tree',      true, 100),
  ('occ_other',      'Other',          'ellipsis',       true, 110);
