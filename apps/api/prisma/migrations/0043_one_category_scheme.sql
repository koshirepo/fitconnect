-- One category scheme for both storefronts.
--
-- The merged `Product` table inherited two incompatible conventions: the
-- platform shop stored display text ("Accessories", "Equipment", "Shipper
-- bottle") and a gym's store stored an enum of exactly two values, SUPPLEMENT
-- and ACCESSORY, which every screen then translated back into words.
--
-- Display text wins, for two reasons. It is what the larger half of the table
-- already holds, so this migration touches only gym rows. And a gym that sells
-- apparel, merch, or gift cards can now say so, where the enum forced it to
-- file everything under one of two headings that were never a decision anybody
-- made about that gym's catalogue.
--
-- Nothing needs a mapping layer afterwards: the string in the column is the
-- string on the chip.

UPDATE "Product"
SET "category" = 'Supplements'
WHERE "tenantId" IS NOT NULL AND "category" = 'SUPPLEMENT';

UPDATE "Product"
SET "category" = 'Accessories'
WHERE "tenantId" IS NOT NULL AND "category" = 'ACCESSORY';
