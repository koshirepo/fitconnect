-- Documentation: Warehouses, and parcels that know where they came from.
-- - Shipping was configured with a single pickup location in `wrangler.toml`,
--   which said the shop ships everything from one place. It does not: different
--   warehouses hold different products, and an order drawing on two of them is
--   two parcels with two waybills, because Delhivery manifests one consignment
--   per pickup location.
-- - `Warehouse.name` is unique because it is the join between this database and
--   Delhivery's: a manifest names the warehouse as a string, and a name Delhivery
--   does not recognise is a refused shipment.
-- - `registeredAt` separates "we have a warehouse" from "Delhivery has it on
--   file". Only the second one can ship, and the difference is worth being able
--   to see.
-- - `Product.warehouseId` and `Shipment.warehouseId` are both nullable: every
--   product and every parcel that existed before this migration came from the
--   one warehouse in the config, and there is nothing to back-fill them from
--   until that warehouse is entered as a record.
-- - `isDefault` is the fallback for products that name no warehouse. Enforced in
--   application code rather than by a constraint, because SQLite cannot express
--   "at most one row where isDefault = 1" without a partial unique index, and
--   the write path that sets it is the same one place either way.

CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "contactPerson" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "returnAddress" TEXT,
    "returnCity" TEXT,
    "returnState" TEXT,
    "returnPincode" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "registeredAt" DATETIME,
    "registerError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "Warehouse_name_key" ON "Warehouse"("name");
CREATE INDEX "Warehouse_isActive_idx" ON "Warehouse"("isActive");

CREATE TABLE "PickupRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "warehouseId" TEXT NOT NULL,
    "pickupId" TEXT,
    "pickupDate" TEXT NOT NULL,
    "pickupTime" TEXT NOT NULL,
    "expectedPackageCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "note" TEXT,
    "requestedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PickupRequest_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "PickupRequest_warehouseId_idx" ON "PickupRequest"("warehouseId");
CREATE INDEX "PickupRequest_pickupDate_idx" ON "PickupRequest"("pickupDate");

ALTER TABLE "Product" ADD COLUMN "warehouseId" TEXT REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Product_warehouseId_idx" ON "Product"("warehouseId");

ALTER TABLE "Shipment" ADD COLUMN "warehouseId" TEXT REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Shipment_warehouseId_idx" ON "Shipment"("warehouseId");
