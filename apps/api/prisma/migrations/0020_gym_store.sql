-- Documentation: Gym store.
-- - Gives each gym its own catalogue and sales, separate from the platform
--   storefront (`Product`/`Order`). Those carry buyer shipping details a counter
--   sale has no use for, have no tenant column at all, and have no variants —
--   so a gym store built on them would make every existing query correct only
--   by remembering a filter, and would drag the working platform store into a
--   redesign it does not need.
-- - The sellable unit is `StoreVariant`, not `StoreProduct`: a supplement is
--   bought as a flavour and a size. Price and stock therefore live on the
--   variant, because chocolate 1kg and vanilla 2kg sell independently.
-- - `StoreOrderItem` copies the product name, variant name, and attributes at
--   the time of sale. Renaming a flavour or retiring a variant later cannot
--   rewrite a receipt somebody already holds.
-- - `StoreOrder.paymentId` links a sale to the same `Payment` ledger as
--   memberships and charges, so store revenue reaches the finance page instead
--   of becoming invisible money.
-- - `Coupon.appliesTo` lets one coupon registry serve both subscriptions and the
--   store. It defaults to SUBSCRIPTION, which is what every coupon written
--   before this migration is.

CREATE TABLE IF NOT EXISTS "StoreProduct" (
  "id"           TEXT PRIMARY KEY,
  "tenantId"     TEXT NOT NULL REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "name"         TEXT NOT NULL,
  "description"  TEXT,
  "category"     TEXT NOT NULL,
  "photos"       JSONB NOT NULL DEFAULT '[]',
  "coinsGranted" INTEGER NOT NULL DEFAULT 0,
  "isActive"     INTEGER NOT NULL DEFAULT 1,
  "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    DATETIME NOT NULL
);

CREATE INDEX "StoreProduct_tenantId_idx" ON "StoreProduct"("tenantId");
CREATE INDEX "StoreProduct_tenantId_isActive_idx" ON "StoreProduct"("tenantId", "isActive");
CREATE INDEX "StoreProduct_tenantId_category_idx" ON "StoreProduct"("tenantId", "category");

CREATE TABLE IF NOT EXISTS "StoreVariant" (
  "id"         TEXT PRIMARY KEY,
  "productId"  TEXT NOT NULL REFERENCES "StoreProduct" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "name"       TEXT NOT NULL,
  "attributes" JSONB NOT NULL DEFAULT '{}',
  "sku"        TEXT,
  "price"      INTEGER NOT NULL,
  "stock"      INTEGER NOT NULL DEFAULT 0,
  "isActive"   INTEGER NOT NULL DEFAULT 1,
  "createdAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  DATETIME NOT NULL
);

CREATE INDEX "StoreVariant_productId_idx" ON "StoreVariant"("productId");
CREATE INDEX "StoreVariant_productId_isActive_idx" ON "StoreVariant"("productId", "isActive");

CREATE TABLE IF NOT EXISTS "StoreOrder" (
  "id"             TEXT PRIMARY KEY,
  "tenantId"       TEXT NOT NULL REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "membershipId"   TEXT NOT NULL REFERENCES "TenantMembership" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "soldById"       TEXT REFERENCES "TenantMembership" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "status"         TEXT NOT NULL DEFAULT 'PENDING',
  "channel"        TEXT NOT NULL,
  "subtotalAmount" INTEGER NOT NULL,
  "discountAmount" INTEGER NOT NULL DEFAULT 0,
  "coinsRedeemed"  INTEGER NOT NULL DEFAULT 0,
  "totalAmount"    INTEGER NOT NULL,
  "coinsEarned"    INTEGER NOT NULL DEFAULT 0,
  "paymentId"      TEXT REFERENCES "Payment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "note"           TEXT,
  "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      DATETIME NOT NULL
);

CREATE UNIQUE INDEX "StoreOrder_paymentId_key" ON "StoreOrder"("paymentId");
CREATE INDEX "StoreOrder_tenantId_idx" ON "StoreOrder"("tenantId");
CREATE INDEX "StoreOrder_tenantId_status_idx" ON "StoreOrder"("tenantId", "status");
CREATE INDEX "StoreOrder_membershipId_idx" ON "StoreOrder"("membershipId");
CREATE INDEX "StoreOrder_tenantId_createdAt_idx" ON "StoreOrder"("tenantId", "createdAt");

CREATE TABLE IF NOT EXISTS "StoreOrderItem" (
  "id"          TEXT PRIMARY KEY,
  "orderId"     TEXT NOT NULL REFERENCES "StoreOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "variantId"   TEXT NOT NULL REFERENCES "StoreVariant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "productName" TEXT NOT NULL,
  "variantName" TEXT NOT NULL,
  "attributes"  JSONB NOT NULL DEFAULT '{}',
  "quantity"    INTEGER NOT NULL,
  "unitPrice"   INTEGER NOT NULL,
  "lineTotal"   INTEGER NOT NULL,
  "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "StoreOrderItem_orderId_idx" ON "StoreOrderItem"("orderId");
CREATE INDEX "StoreOrderItem_variantId_idx" ON "StoreOrderItem"("variantId");

ALTER TABLE "Coupon" ADD COLUMN "appliesTo" TEXT NOT NULL DEFAULT 'SUBSCRIPTION';
