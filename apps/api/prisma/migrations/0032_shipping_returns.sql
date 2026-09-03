-- Documentation: Shipping, returns and refunds for the platform shop.
-- - The shop could take an order and take money for it, and then the trail went
--   cold: no address a courier could read, no consignment, no way back for a
--   buyer who wanted to return what arrived. This adds the whole tail of the
--   order — dispatch, delivery, return, refund.
-- - The address gains city, state and pincode as nullable columns because rows
--   placed before this migration only ever had one free-text line, and there is
--   nothing to back-fill them from. New orders always carry all three; a
--   shipment cannot be booked without a pincode.
-- - `shippingAmount` is frozen on the order rather than recomputed, so a later
--   change to courier rates cannot re-price an order that is already placed.
-- - Shipment is its own table because one order can produce more than one
--   consignment: the parcel out, and a reverse pickup when it comes back.
-- - ReturnRequest keeps rejected and cancelled rows. What was refused, and why,
--   is the part anyone asks about later.

ALTER TABLE "Order" ADD COLUMN "buyerCity" TEXT;
ALTER TABLE "Order" ADD COLUMN "buyerState" TEXT;
ALTER TABLE "Order" ADD COLUMN "buyerPincode" TEXT;
ALTER TABLE "Order" ADD COLUMN "shippingAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "gatewayRefundId" TEXT;
ALTER TABLE "Order" ADD COLUMN "refundAmount" INTEGER;
ALTER TABLE "Order" ADD COLUMN "refundedAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "confirmedAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "shippedAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "deliveredAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "cancelledAt" DATETIME;
ALTER TABLE "Order" ADD COLUMN "cancelReason" TEXT;

-- Couriers price on weight. 500g is the shop's assumption for anything nobody
-- has measured yet, and it is editable per product.
ALTER TABLE "Product" ADD COLUMN "weightGrams" INTEGER NOT NULL DEFAULT 500;

CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'DELHIVERY',
    "kind" TEXT NOT NULL DEFAULT 'FORWARD',
    "waybill" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "statusDetail" TEXT,
    "currentLocation" TEXT,
    "pickupLocation" TEXT,
    "estimatedDeliveryAt" DATETIME,
    "scans" JSONB NOT NULL DEFAULT '[]',
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Shipment_provider_waybill_key" ON "Shipment"("provider", "waybill");
CREATE INDEX "Shipment_orderId_idx" ON "Shipment"("orderId");
CREATE INDEX "Shipment_status_idx" ON "Shipment"("status");

CREATE TABLE "ReturnRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT NOT NULL,
    "comment" TEXT,
    "shipmentId" TEXT,
    "decidedById" TEXT,
    "decidedAt" DATETIME,
    "decisionNote" TEXT,
    "refundAmount" INTEGER,
    "refundedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReturnRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReturnRequest_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ReturnRequest_orderId_idx" ON "ReturnRequest"("orderId");
CREATE INDEX "ReturnRequest_status_idx" ON "ReturnRequest"("status");
CREATE INDEX "ReturnRequest_createdAt_idx" ON "ReturnRequest"("createdAt");
