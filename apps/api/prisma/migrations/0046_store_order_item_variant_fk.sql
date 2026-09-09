-- Repoint StoreOrderItem's variant foreign key at ProductVariant.
--
-- 0042 merged the gym store into the platform catalogue and dropped
-- `StoreVariant`, reasoning that "gym variants cross over with their ids
-- intact, which is what lets StoreOrderItem keep pointing at them untouched".
-- That is true of the *rows* — every id was preserved, so no order line was
-- orphaned — but a SQLite foreign key names the table it references, not the
-- rows. `StoreOrderItem.variantId` was left declaring
--
--   REFERENCES "StoreVariant" ("id")
--
-- against a table that no longer exists, so every insert failed with
-- `The table main.StoreVariant does not exist in the current database`. In the
-- app that is a 500 on the counter sale: selling to a walk-in customer wrote
-- the StoreOrder, then died creating its lines.
--
-- SQLite cannot alter a foreign key in place, so the table is rebuilt. The data
-- copies across unchanged — the ids in `variantId` already name ProductVariant
-- rows, which is exactly what 0042 arranged.

CREATE TABLE "new_StoreOrderItem" (
  "id"          TEXT PRIMARY KEY,
  "orderId"     TEXT NOT NULL REFERENCES "StoreOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "variantId"   TEXT NOT NULL REFERENCES "ProductVariant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "productName" TEXT NOT NULL,
  "variantName" TEXT NOT NULL,
  "attributes"  JSONB NOT NULL DEFAULT '{}',
  "quantity"    INTEGER NOT NULL,
  "unitPrice"   INTEGER NOT NULL,
  "lineTotal"   INTEGER NOT NULL,
  "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "new_StoreOrderItem" (
  "id", "orderId", "variantId", "productName", "variantName",
  "attributes", "quantity", "unitPrice", "lineTotal", "createdAt"
)
SELECT
  "id", "orderId", "variantId", "productName", "variantName",
  "attributes", "quantity", "unitPrice", "lineTotal", "createdAt"
FROM "StoreOrderItem";

DROP TABLE "StoreOrderItem";
ALTER TABLE "new_StoreOrderItem" RENAME TO "StoreOrderItem";

CREATE INDEX "StoreOrderItem_orderId_idx" ON "StoreOrderItem"("orderId");
CREATE INDEX "StoreOrderItem_variantId_idx" ON "StoreOrderItem"("variantId");
