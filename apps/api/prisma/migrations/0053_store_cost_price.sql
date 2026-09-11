-- What a gym pays for what it sells, so the store can report profit.
--
-- `ProductVariant.costPrice` is the current purchase price, beside the current
-- selling price. Neither is read when reporting on a sale already made: both
-- are copied onto the order line at the moment of sale, the way `unitPrice` and
-- the product names already are. A supplier raising their rate, or a gym
-- dropping its price, changes what the next sale records and nothing before it.
--
-- All three columns are nullable and nothing is backfilled. A sale made before
-- a cost was recorded has no honest cost to give it — copying today's purchase
-- price onto last year's order would be exactly the rewrite this exists to
-- prevent — so those lines stay null and the books report them as uncosted
-- rather than as pure profit.
ALTER TABLE "ProductVariant" ADD COLUMN "costPrice" INTEGER;
ALTER TABLE "StoreOrderItem" ADD COLUMN "unitCost" INTEGER;
ALTER TABLE "StoreOrderItem" ADD COLUMN "lineCost" INTEGER;
