-- Documentation: Guest orders for the gym store.
-- - A visitor who has never joined the gym can now buy from the public
--   storefront. The buyer was previously always a member, which is why
--   `membershipId` was NOT NULL; it becomes optional, and a guest order carries
--   the name and phone the buyer typed instead.
-- - Collection is at the counter — this gym store has no delivery — so no
--   address is recorded. `buyerPhone` is what the desk calls to say it is
--   ready, and what identifies the buyer when they turn up.
-- - SQLite cannot relax a NOT NULL column in place, so the table is rebuilt.
--   `StoreOrderItem` references it with ON DELETE CASCADE, hence the deferred
--   foreign keys: without them, dropping the old table would take every line
--   item with it.
-- - `Payment` is deliberately untouched. A guest sale writes no payment row,
--   because relaxing `Payment.membershipId` would mean rebuilding a table that
--   four others point at and making `payment.member` optional in 32 places.
--   Guest revenue reaches the finance page from `StoreOrder` instead.

PRAGMA defer_foreign_keys = ON;

CREATE TABLE "StoreOrder_new" (
  "id"             TEXT PRIMARY KEY,
  "tenantId"       TEXT NOT NULL REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  -- Null for a guest: somebody who bought without joining.
  "membershipId"   TEXT REFERENCES "TenantMembership" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "soldById"       TEXT REFERENCES "TenantMembership" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  -- Who to call when the order is ready. Set only when membershipId is null.
  "buyerName"      TEXT,
  "buyerPhone"     TEXT,
  "buyerEmail"     TEXT,
  "status"         TEXT NOT NULL DEFAULT 'PENDING',
  "channel"        TEXT NOT NULL,
  "subtotalAmount" INTEGER NOT NULL,
  "discountAmount" INTEGER NOT NULL DEFAULT 0,
  "coinsRedeemed"  INTEGER NOT NULL DEFAULT 0,
  "totalAmount"    INTEGER NOT NULL,
  "coinsEarned"    INTEGER NOT NULL DEFAULT 0,
  "paymentId"      TEXT REFERENCES "Payment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  -- A guest sale writes no Payment row, so the gateway trail lives here. Null
  -- on a member order, whose trail is on its payment as before.
  "gateway"          TEXT,
  "gatewayOrderId"   TEXT,
  "gatewayPaymentId" TEXT,
  "note"           TEXT,
  "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      DATETIME NOT NULL
);

INSERT INTO "StoreOrder_new" (
  "id", "tenantId", "membershipId", "soldById",
  "buyerName", "buyerPhone", "buyerEmail",
  "status", "channel", "subtotalAmount", "discountAmount", "coinsRedeemed",
  "totalAmount", "coinsEarned", "paymentId",
  "gateway", "gatewayOrderId", "gatewayPaymentId",
  "note", "createdAt", "updatedAt"
)
SELECT
  "id", "tenantId", "membershipId", "soldById",
  NULL, NULL, NULL,
  "status", "channel", "subtotalAmount", "discountAmount", "coinsRedeemed",
  "totalAmount", "coinsEarned", "paymentId",
  NULL, NULL, NULL,
  "note", "createdAt", "updatedAt"
FROM "StoreOrder";

DROP TABLE "StoreOrder";

ALTER TABLE "StoreOrder_new" RENAME TO "StoreOrder";

CREATE UNIQUE INDEX "StoreOrder_paymentId_key" ON "StoreOrder"("paymentId");
CREATE INDEX "StoreOrder_tenantId_idx" ON "StoreOrder"("tenantId");
CREATE INDEX "StoreOrder_tenantId_status_idx" ON "StoreOrder"("tenantId", "status");
CREATE INDEX "StoreOrder_membershipId_idx" ON "StoreOrder"("membershipId");
CREATE INDEX "StoreOrder_tenantId_createdAt_idx" ON "StoreOrder"("tenantId", "createdAt");
-- The desk looks a guest order up by the phone number the buyer gives.
CREATE INDEX "StoreOrder_tenantId_buyerPhone_idx" ON "StoreOrder"("tenantId", "buyerPhone");
-- How a settlement finds the order it belongs to.
CREATE INDEX "StoreOrder_gatewayOrderId_idx" ON "StoreOrder"("gatewayOrderId");

PRAGMA defer_foreign_keys = OFF;
