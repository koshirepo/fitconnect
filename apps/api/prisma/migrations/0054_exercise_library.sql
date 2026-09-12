-- Two changes that belong together: the exercise library, and the one pair of
-- tables every like and comment in the app now lives in.
--
-- ─── The library ────────────────────────────────────────────────────────────
--
-- One catalogue of demonstration clips, owned by the platform and read by every
-- gym. No tenantId anywhere, deliberately: the clips are the same lift whoever
-- is watching, so one gym renaming "45 Degree Side Bend" would rename it for all
-- of them. Writing is a platform permission; reading needs only a session, the
-- same arrangement the occupation list has.
--
-- Both clips hang off one row. The library was filmed twice, once with a man and
-- once with a woman, and somebody searching "sit-ups" means one exercise either
-- way: one name, one muscle group, one comment thread, and a player that shows
-- whichever clip suits the viewer.
--
-- `maleVideoKey` and `femaleVideoKey` hold R2 object keys, never URLs. The API
-- turns a key into a playable address at read time, so moving the bucket or
-- putting a CDN in front of it never has to rewrite a stored row.
--
-- ─── Reactions ──────────────────────────────────────────────────────────────
--
-- `Reaction` and `Comment` replace four tables: ProductLike and ProductComment,
-- keyed by membership, and TenantLike and TenantComment, keyed by account. Three
-- subjects meant three copies of one set of rules, and a fourth pair would have
-- been written for the exercise library. Now a subject is two columns.
--
-- Existing rows are carried over before the old tables are dropped. Product
-- reactions are re-keyed from membership to account, which is what makes one
-- person one opinion even where they train at two gyms; their ids are kept, so
-- anything that recorded a comment id still resolves.

-- CreateTable
CREATE TABLE "Exercise" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "muscleGroup" TEXT NOT NULL,
    "secondaryMuscles" JSONB NOT NULL DEFAULT '[]',
    "equipment" TEXT,
    "description" TEXT,
    "maleVideoKey" TEXT,
    "femaleVideoKey" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Reaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Reaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Exercise_slug_key" ON "Exercise"("slug");

-- CreateIndex
CREATE INDEX "Exercise_muscleGroup_idx" ON "Exercise"("muscleGroup");

-- CreateIndex
CREATE INDEX "Exercise_isActive_idx" ON "Exercise"("isActive");

-- The shape the library page actually reads: one muscle group, live rows only.
-- CreateIndex
CREATE INDEX "Exercise_muscleGroup_isActive_idx" ON "Exercise"("muscleGroup", "isActive");

-- One like per person per thing, which is what makes the button a toggle.
-- CreateIndex
CREATE UNIQUE INDEX "Reaction_subjectType_subjectId_userId_key" ON "Reaction"("subjectType", "subjectId", "userId");

-- CreateIndex
CREATE INDEX "Reaction_subjectType_subjectId_idx" ON "Reaction"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "Reaction_userId_idx" ON "Reaction"("userId");

-- Newest first, per subject: exactly how a thread is read.
-- CreateIndex
CREATE INDEX "Comment_subjectType_subjectId_createdAt_idx" ON "Comment"("subjectType", "subjectId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_userId_idx" ON "Comment"("userId");

-- Carry the gym reactions over. Already keyed by account, so they move as they are.
INSERT INTO "Reaction" ("id", "subjectType", "subjectId", "userId", "createdAt")
SELECT "id", 'GYM', "tenantId", "userId", "createdAt" FROM "TenantLike";

INSERT INTO "Comment" ("id", "subjectType", "subjectId", "userId", "body", "createdAt", "updatedAt")
SELECT "id", 'GYM', "tenantId", "userId", "body", "createdAt", "updatedAt" FROM "TenantComment";

-- Product reactions, re-keyed from the membership that wrote them to the account
-- behind it. The join cannot lose a row: a membership always has a user.
INSERT INTO "Reaction" ("id", "subjectType", "subjectId", "userId", "createdAt")
SELECT l."id", 'PRODUCT', l."productId", m."userId", l."createdAt"
FROM "ProductLike" l
JOIN "TenantMembership" m ON m."id" = l."membershipId";

INSERT INTO "Comment" ("id", "subjectType", "subjectId", "userId", "body", "createdAt", "updatedAt")
SELECT c."id", 'PRODUCT', c."productId", m."userId", c."body", c."createdAt", c."updatedAt"
FROM "ProductComment" c
JOIN "TenantMembership" m ON m."id" = c."membershipId";

-- DropTable
DROP TABLE "ProductLike";

-- DropTable
DROP TABLE "ProductComment";

-- DropTable
DROP TABLE "TenantLike";

-- DropTable
DROP TABLE "TenantComment";
