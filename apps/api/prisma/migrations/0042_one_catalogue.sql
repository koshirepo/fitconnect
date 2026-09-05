-- One catalogue for both storefronts.
--
-- Merges `StoreProduct` into `Product` and `StoreVariant` into a new
-- `ProductVariant`, so a product is owned by a gym (`tenantId` set) or by the
-- platform (`tenantId` NULL) and nothing else decides where it appears.
--
-- Ids are preserved on the way across. That is what keeps this migration cheap:
-- `StoreOrderItem.variantId` already points at rows whose ids do not change, so
-- a year of gym orders needs no rewriting and no downtime window.
--
-- Price and stock move off the product and onto variants, for both owners. A
-- platform product that had no variants gets exactly one, named after itself,
-- carrying the price and stock it already had — so nothing is priced twice and
-- nothing is priced from a column that no longer exists.
--
-- Written by hand rather than diffed. `prisma migrate diff` would drop
-- StoreProduct and its rows with it.

-- D1 enforces foreign keys and ignores `PRAGMA foreign_keys = OFF`. Only the
-- deferral below actually takes effect, which is why the platform defaults are
-- created after the rename rather than before: inserted first, they hung off the
-- old Product table and were cascade-deleted the moment it was dropped.
PRAGMA defer_foreign_keys = ON;

-- ── The shared variant table ────────────────────────────────────────────────
CREATE TABLE "ProductVariant" (
    "id"         TEXT NOT NULL PRIMARY KEY,
    "productId"  TEXT NOT NULL,
    "name"       TEXT NOT NULL,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "sku"        TEXT,
    "price"      INTEGER NOT NULL,
    "stock"      INTEGER NOT NULL DEFAULT 0,
    "isActive"   BOOLEAN NOT NULL DEFAULT true,
    "createdAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  DATETIME NOT NULL,
    CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId")
      REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Price and stock are about to stop existing on Product, and the variants that
-- inherit them cannot be written yet — a row pointing at the old table dies with
-- it. Park them here and plant them after the rename.
CREATE TABLE "_platform_price" (
    "id"       TEXT NOT NULL PRIMARY KEY,
    "name"     TEXT NOT NULL,
    "price"    INTEGER NOT NULL,
    "stock"    INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL
);
INSERT INTO "_platform_price" ("id", "name", "price", "stock", "isActive")
SELECT "id", "name", "price", "stock", "isActive" FROM "Product";

-- ── Product gains an owner and the gym-store fields; loses price and stock ──
CREATE TABLE "new_Product" (
    "id"               TEXT NOT NULL PRIMARY KEY,
    "tenantId"         TEXT,
    "name"             TEXT NOT NULL,
    "description"      TEXT,
    "markdown"         TEXT,
    "photos"           JSONB NOT NULL DEFAULT '[]',
    "category"         TEXT NOT NULL,
    "videoUrl"         TEXT,
    "coinsGranted"     INTEGER NOT NULL DEFAULT 0,
    "minOrderQty"      INTEGER NOT NULL DEFAULT 1,
    "maxOrderQty"      INTEGER NOT NULL DEFAULT 100,
    "weightGrams"      INTEGER NOT NULL DEFAULT 500,
    "lengthCm"         INTEGER NOT NULL DEFAULT 10,
    "widthCm"          INTEGER NOT NULL DEFAULT 10,
    "heightCm"         INTEGER NOT NULL DEFAULT 10,
    "warehouseId"      TEXT,
    "isReturnable"     BOOLEAN NOT NULL DEFAULT true,
    "isReplaceable"    BOOLEAN NOT NULL DEFAULT false,
    "returnWindowDays" INTEGER,
    "returnPolicyNote" TEXT,
    "isActive"         BOOLEAN NOT NULL DEFAULT true,
    "createdAt"        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        DATETIME NOT NULL,
    CONSTRAINT "Product_tenantId_fkey" FOREIGN KEY ("tenantId")
      REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Product_warehouseId_fkey" FOREIGN KEY ("warehouseId")
      REFERENCES "Warehouse" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Platform products keep their ids and gain a NULL owner.
INSERT INTO "new_Product" (
  "id", "tenantId", "name", "description", "markdown", "photos", "category",
  "minOrderQty", "maxOrderQty", "weightGrams", "lengthCm", "widthCm", "heightCm",
  "warehouseId", "isReturnable", "isReplaceable", "returnWindowDays",
  "returnPolicyNote", "isActive", "createdAt", "updatedAt"
)
SELECT
  "id", NULL, "name", "description", "markdown", "photos", "category",
  "minOrderQty", "maxOrderQty", "weightGrams", "lengthCm", "widthCm", "heightCm",
  "warehouseId", "isReturnable", "isReplaceable", "returnWindowDays",
  "returnPolicyNote", "isActive", "createdAt", "updatedAt"
FROM "Product";

-- Gym products cross over, keeping their ids and gaining their owner.
INSERT INTO "new_Product" (
  "id", "tenantId", "name", "description", "markdown", "photos", "category",
  "videoUrl", "coinsGranted", "isActive", "createdAt", "updatedAt"
)
SELECT
  "id", "tenantId", "name", "description", "markdown", "photos", "category",
  "videoUrl", "coinsGranted", "isActive", "createdAt", "updatedAt"
FROM "StoreProduct";

-- Gym variants cross over with their ids intact, which is what lets
-- StoreOrderItem keep pointing at them untouched.
INSERT INTO "ProductVariant" ("id", "productId", "name", "attributes", "sku", "price", "stock", "isActive", "createdAt", "updatedAt")
SELECT "id", "productId", "name", "attributes", "sku", "price", "stock", "isActive", "createdAt", "updatedAt"
FROM "StoreVariant";

DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";

CREATE INDEX "Product_isActive_idx" ON "Product"("isActive");
CREATE INDEX "Product_tenantId_idx" ON "Product"("tenantId");
CREATE INDEX "Product_tenantId_isActive_idx" ON "Product"("tenantId", "isActive");
CREATE INDEX "Product_tenantId_category_idx" ON "Product"("tenantId", "category");

-- Each platform product becomes its own single variant, carrying the price and
-- stock it used to hold itself. The id is derived from the product's, so the
-- OrderItem backfill below finds it without a lookup table.
INSERT INTO "ProductVariant" ("id", "productId", "name", "price", "stock", "isActive", "updatedAt")
SELECT 'pv_' || "id", "id", "name", "price", "stock", "isActive", CURRENT_TIMESTAMP
FROM "_platform_price";

DROP TABLE "_platform_price";

CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant"("productId");
CREATE INDEX "ProductVariant_productId_isActive_idx" ON "ProductVariant"("productId", "isActive");

-- ── Order lines now name the variant they bought ───────────────────────────
CREATE TABLE "new_OrderItem" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "orderId"     TEXT NOT NULL,
    "productId"   TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "variantId"   TEXT NOT NULL,
    "variantName" TEXT NOT NULL,
    "quantity"    INTEGER NOT NULL,
    "unitPrice"   INTEGER NOT NULL,
    "lineTotal"   INTEGER NOT NULL,
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId")
      REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId")
      REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_variantId_fkey" FOREIGN KEY ("variantId")
      REFERENCES "ProductVariant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Every existing line was bought before variants existed, so it belongs to the
-- single variant its product just acquired. `productName` is reused as the
-- variant name because that is exactly what the buyer was shown.
INSERT INTO "new_OrderItem" ("id", "orderId", "productId", "productName", "variantId", "variantName", "quantity", "unitPrice", "lineTotal", "createdAt")
SELECT "id", "orderId", "productId", "productName", 'pv_' || "productId", "productName", "quantity", "unitPrice", "lineTotal", "createdAt"
FROM "OrderItem";

DROP TABLE "OrderItem";
ALTER TABLE "new_OrderItem" RENAME TO "OrderItem";

CREATE UNIQUE INDEX "OrderItem_orderId_variantId_key" ON "OrderItem"("orderId", "variantId");
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");
CREATE INDEX "OrderItem_variantId_idx" ON "OrderItem"("variantId");

-- ── Likes and comments hang off the shared product ─────────────────────────
CREATE TABLE "ProductLike" (
    "id"           TEXT NOT NULL PRIMARY KEY,
    "productId"    TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductLike_productId_fkey" FOREIGN KEY ("productId")
      REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductLike_membershipId_fkey" FOREIGN KEY ("membershipId")
      REFERENCES "TenantMembership" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "ProductLike" ("id", "productId", "membershipId", "createdAt")
SELECT "id", "productId", "membershipId", "createdAt" FROM "StoreProductLike";

CREATE UNIQUE INDEX "ProductLike_productId_membershipId_key" ON "ProductLike"("productId", "membershipId");
CREATE INDEX "ProductLike_productId_idx" ON "ProductLike"("productId");
CREATE INDEX "ProductLike_membershipId_idx" ON "ProductLike"("membershipId");

CREATE TABLE "ProductComment" (
    "id"           TEXT NOT NULL PRIMARY KEY,
    "productId"    TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "body"         TEXT NOT NULL,
    "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    DATETIME NOT NULL,
    CONSTRAINT "ProductComment_productId_fkey" FOREIGN KEY ("productId")
      REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductComment_membershipId_fkey" FOREIGN KEY ("membershipId")
      REFERENCES "TenantMembership" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "ProductComment" ("id", "productId", "membershipId", "body", "createdAt", "updatedAt")
SELECT "id", "productId", "membershipId", "body", "createdAt", "updatedAt" FROM "StoreProductComment";

CREATE INDEX "ProductComment_productId_createdAt_idx" ON "ProductComment"("productId", "createdAt");
CREATE INDEX "ProductComment_membershipId_idx" ON "ProductComment"("membershipId");

-- ── The old tables, now empty of meaning ───────────────────────────────────
DROP TABLE "StoreProductComment";
DROP TABLE "StoreProductLike";
DROP TABLE "StoreVariant";
DROP TABLE "StoreProduct";

PRAGMA defer_foreign_keys = OFF;
