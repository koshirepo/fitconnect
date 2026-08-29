-- Documentation: Product media, and what members say about it.
-- - `videoUrl` holds whatever a gym pasted — a YouTube share link or a watch
--   link. The player turns it into an embed, so both work and neither has to be
--   normalised on the way in.
-- - `markdown` is the long form, beside the one-line `description` the
--   storefront card already shows. Matches how `Tenant` and the platform
--   `Product` already split a tagline from a rich body.
-- - Photos need no column: `StoreProduct.photos` is already a JSON array.
-- - A like is one row per member per product, and the unique key is what makes
--   the button a toggle rather than a counter anyone can run up. Both tables
--   cascade from the product and from the membership, so removing either takes
--   its opinions with it.

ALTER TABLE "StoreProduct" ADD COLUMN "videoUrl" TEXT;
ALTER TABLE "StoreProduct" ADD COLUMN "markdown" TEXT;

CREATE TABLE IF NOT EXISTS "StoreProductLike" (
  "id"           TEXT PRIMARY KEY,
  "productId"    TEXT NOT NULL REFERENCES "StoreProduct" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "membershipId" TEXT NOT NULL REFERENCES "TenantMembership" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "StoreProductLike_productId_membershipId_key"
  ON "StoreProductLike"("productId", "membershipId");
CREATE INDEX "StoreProductLike_productId_idx" ON "StoreProductLike"("productId");
CREATE INDEX "StoreProductLike_membershipId_idx" ON "StoreProductLike"("membershipId");

CREATE TABLE IF NOT EXISTS "StoreProductComment" (
  "id"           TEXT PRIMARY KEY,
  "productId"    TEXT NOT NULL REFERENCES "StoreProduct" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "membershipId" TEXT NOT NULL REFERENCES "TenantMembership" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "body"         TEXT NOT NULL,
  "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    DATETIME NOT NULL
);

CREATE INDEX "StoreProductComment_productId_createdAt_idx"
  ON "StoreProductComment"("productId", "createdAt");
CREATE INDEX "StoreProductComment_membershipId_idx" ON "StoreProductComment"("membershipId");

-- Reactions to a gym itself, from its public profile.
--
-- Keyed by user rather than membership, unlike the product tables above: the
-- people who react to a gym's page include prospects deciding whether to join,
-- and a membership id would shut exactly those people out.

CREATE TABLE IF NOT EXISTS "TenantLike" (
  "id"        TEXT PRIMARY KEY,
  "tenantId"  TEXT NOT NULL REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "userId"    TEXT NOT NULL REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "TenantLike_tenantId_userId_key" ON "TenantLike"("tenantId", "userId");
CREATE INDEX "TenantLike_tenantId_idx" ON "TenantLike"("tenantId");
CREATE INDEX "TenantLike_userId_idx" ON "TenantLike"("userId");

CREATE TABLE IF NOT EXISTS "TenantComment" (
  "id"        TEXT PRIMARY KEY,
  "tenantId"  TEXT NOT NULL REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "userId"    TEXT NOT NULL REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "body"      TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "TenantComment_tenantId_createdAt_idx" ON "TenantComment"("tenantId", "createdAt");
CREATE INDEX "TenantComment_userId_idx" ON "TenantComment"("userId");
