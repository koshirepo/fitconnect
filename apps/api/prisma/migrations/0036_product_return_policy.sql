-- Documentation: Per-product return and replacement policy.
-- - Returns were governed by one global window (RETURN_WINDOW_DAYS) applied to
--   every product alike. That is wrong for a shop that sells both equipment and
--   supplements: an unopened resistance band can come back, a tub of whey that
--   has been opened cannot, and hygiene and food-safety rules are the reason
--   rather than shop preference.
-- - So the policy moves onto the product, where the decision actually belongs.
--   Defaults keep every existing row behaving exactly as it did: returnable,
--   not separately replaceable, and on the global window.
-- - `returnWindowDays` is nullable on purpose. NULL means "whatever the shop's
--   window is", so changing RETURN_WINDOW_DAYS still moves every product that
--   never asked for something different — which is the whole point of having a
--   default. A number here is a deliberate exception, not a copy of the default
--   frozen at creation time.
-- - Returnable and replaceable are separate flags because they are separate
--   promises. A sealed supplement may be replaceable when it arrives damaged
--   while never being returnable for a change of mind, and collapsing the two
--   into one setting would make that impossible to express.

ALTER TABLE "Product" ADD COLUMN "isReturnable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Product" ADD COLUMN "isReplaceable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN "returnWindowDays" INTEGER;
ALTER TABLE "Product" ADD COLUMN "returnPolicyNote" TEXT;
