-- Give every variant attributes that spell out its own name.
--
-- A variant's name is now derived from its attributes rather than typed, so a
-- seller describes what makes it different once instead of twice. For most of
-- the catalogue the attributes already produced the name exactly. For the rest
-- they did not, because the name carried something the attributes never held:
--
--   {"size":"S"}    named "Small"              -- the expansion
--   {"count":"60"}  named "60 softgels"        -- the unit
--   {"size":"M"}    named "Medium · 32-36in"   -- a whole second fact
--   {}              named "Standard"           -- everything
--
-- Deriving without this would have renamed those variants, five of them to an
-- empty string, on products people have already bought. So each row below gets
-- attributes whose values, joined with " · ", reproduce the name it already
-- has. Every name in the catalogue survives this untouched; they simply become
-- derivable from the attributes, which is what lets the name field go away.
--
-- Generated against the live catalogue, and verified row by row: the generator
-- refuses to emit a statement that would change a name.
--
-- 55 row(s) rewritten; 90 already derivable.

UPDATE "ProductVariant" SET "attributes" = '{"variant":"Shipper bottle with custom Logo"}' WHERE "id" = 'pv_cmninulus0000psp7bu6wunhz';
UPDATE "ProductVariant" SET "attributes" = '{"variant":"Standard"}' WHERE "id" = 'seed-ship-prod-bands-v1';
UPDATE "ProductVariant" SET "attributes" = '{"variant":"Standard"}' WHERE "id" = 'seed-ship-prod-mat-v1';
UPDATE "ProductVariant" SET "attributes" = '{"variant":"Standard"}' WHERE "id" = 'seed-ship-prod-shaker-v1';
UPDATE "ProductVariant" SET "attributes" = '{"variant":"Standard"}' WHERE "id" = 'seed-ship-prod-whey-v1';
UPDATE "ProductVariant" SET "attributes" = '{"size":"Extra Large","detail":"40-44in"}' WHERE "id" = 'seedstore_platform_lever-lifting-belt_extra-large-40-44in';
UPDATE "ProductVariant" SET "attributes" = '{"size":"Large","detail":"36-40in"}' WHERE "id" = 'seedstore_platform_lever-lifting-belt_large-36-40in';
UPDATE "ProductVariant" SET "attributes" = '{"size":"Medium","detail":"32-36in"}' WHERE "id" = 'seedstore_platform_lever-lifting-belt_medium-32-36in';
UPDATE "ProductVariant" SET "attributes" = '{"size":"Extra Large"}' WHERE "id" = 'seedstore_platform_lifting-gloves_extra-large';
UPDATE "ProductVariant" SET "attributes" = '{"size":"Large"}' WHERE "id" = 'seedstore_platform_lifting-gloves_large';
UPDATE "ProductVariant" SET "attributes" = '{"size":"Medium"}' WHERE "id" = 'seedstore_platform_lifting-gloves_medium';
UPDATE "ProductVariant" SET "attributes" = '{"size":"Small"}' WHERE "id" = 'seedstore_platform_lifting-gloves_small';
UPDATE "ProductVariant" SET "attributes" = '{"count":"120 softgels"}' WHERE "id" = 'seedstore_platform_omega-3-fish-oil_120-softgels';
UPDATE "ProductVariant" SET "attributes" = '{"count":"60 softgels"}' WHERE "id" = 'seedstore_platform_omega-3-fish-oil_60-softgels';
UPDATE "ProductVariant" SET "attributes" = '{"pack":"Set of 5"}' WHERE "id" = 'seedstore_platform_resistance-band-set_set-of-5';
UPDATE "ProductVariant" SET "attributes" = '{"size":"Extra Large","detail":"40-44in"}' WHERE "id" = 'seedstore_tenant_0001_lever-lifting-belt_extra-large-40-44in';
UPDATE "ProductVariant" SET "attributes" = '{"size":"Large","detail":"36-40in"}' WHERE "id" = 'seedstore_tenant_0001_lever-lifting-belt_large-36-40in';
UPDATE "ProductVariant" SET "attributes" = '{"size":"Medium","detail":"32-36in"}' WHERE "id" = 'seedstore_tenant_0001_lever-lifting-belt_medium-32-36in';
UPDATE "ProductVariant" SET "attributes" = '{"size":"Extra Large"}' WHERE "id" = 'seedstore_tenant_0001_lifting-gloves_extra-large';
UPDATE "ProductVariant" SET "attributes" = '{"size":"Large"}' WHERE "id" = 'seedstore_tenant_0001_lifting-gloves_large';
UPDATE "ProductVariant" SET "attributes" = '{"size":"Medium"}' WHERE "id" = 'seedstore_tenant_0001_lifting-gloves_medium';
UPDATE "ProductVariant" SET "attributes" = '{"size":"Small"}' WHERE "id" = 'seedstore_tenant_0001_lifting-gloves_small';
UPDATE "ProductVariant" SET "attributes" = '{"count":"120 softgels"}' WHERE "id" = 'seedstore_tenant_0001_omega-3-fish-oil_120-softgels';
UPDATE "ProductVariant" SET "attributes" = '{"count":"60 softgels"}' WHERE "id" = 'seedstore_tenant_0001_omega-3-fish-oil_60-softgels';
UPDATE "ProductVariant" SET "attributes" = '{"pack":"Set of 5"}' WHERE "id" = 'seedstore_tenant_0001_resistance-band-set_set-of-5';
UPDATE "ProductVariant" SET "attributes" = '{"size":"Extra Large","detail":"40-44in"}' WHERE "id" = 'seedstore_tenant_0002_lever-lifting-belt_extra-large-40-44in';
UPDATE "ProductVariant" SET "attributes" = '{"size":"Large","detail":"36-40in"}' WHERE "id" = 'seedstore_tenant_0002_lever-lifting-belt_large-36-40in';
UPDATE "ProductVariant" SET "attributes" = '{"size":"Medium","detail":"32-36in"}' WHERE "id" = 'seedstore_tenant_0002_lever-lifting-belt_medium-32-36in';
UPDATE "ProductVariant" SET "attributes" = '{"size":"Extra Large"}' WHERE "id" = 'seedstore_tenant_0002_lifting-gloves_extra-large';
UPDATE "ProductVariant" SET "attributes" = '{"size":"Large"}' WHERE "id" = 'seedstore_tenant_0002_lifting-gloves_large';
UPDATE "ProductVariant" SET "attributes" = '{"size":"Medium"}' WHERE "id" = 'seedstore_tenant_0002_lifting-gloves_medium';
UPDATE "ProductVariant" SET "attributes" = '{"size":"Small"}' WHERE "id" = 'seedstore_tenant_0002_lifting-gloves_small';
UPDATE "ProductVariant" SET "attributes" = '{"count":"120 softgels"}' WHERE "id" = 'seedstore_tenant_0002_omega-3-fish-oil_120-softgels';
UPDATE "ProductVariant" SET "attributes" = '{"count":"60 softgels"}' WHERE "id" = 'seedstore_tenant_0002_omega-3-fish-oil_60-softgels';
UPDATE "ProductVariant" SET "attributes" = '{"pack":"Set of 5"}' WHERE "id" = 'seedstore_tenant_0002_resistance-band-set_set-of-5';
UPDATE "ProductVariant" SET "attributes" = '{"size":"Extra Large","detail":"40-44in"}' WHERE "id" = 'seedstore_tenant_0003_lever-lifting-belt_extra-large-40-44in';
UPDATE "ProductVariant" SET "attributes" = '{"size":"Large","detail":"36-40in"}' WHERE "id" = 'seedstore_tenant_0003_lever-lifting-belt_large-36-40in';
UPDATE "ProductVariant" SET "attributes" = '{"size":"Medium","detail":"32-36in"}' WHERE "id" = 'seedstore_tenant_0003_lever-lifting-belt_medium-32-36in';
UPDATE "ProductVariant" SET "attributes" = '{"size":"Extra Large"}' WHERE "id" = 'seedstore_tenant_0003_lifting-gloves_extra-large';
UPDATE "ProductVariant" SET "attributes" = '{"size":"Large"}' WHERE "id" = 'seedstore_tenant_0003_lifting-gloves_large';
UPDATE "ProductVariant" SET "attributes" = '{"size":"Medium"}' WHERE "id" = 'seedstore_tenant_0003_lifting-gloves_medium';
UPDATE "ProductVariant" SET "attributes" = '{"size":"Small"}' WHERE "id" = 'seedstore_tenant_0003_lifting-gloves_small';
UPDATE "ProductVariant" SET "attributes" = '{"count":"120 softgels"}' WHERE "id" = 'seedstore_tenant_0003_omega-3-fish-oil_120-softgels';
UPDATE "ProductVariant" SET "attributes" = '{"count":"60 softgels"}' WHERE "id" = 'seedstore_tenant_0003_omega-3-fish-oil_60-softgels';
UPDATE "ProductVariant" SET "attributes" = '{"pack":"Set of 5"}' WHERE "id" = 'seedstore_tenant_0003_resistance-band-set_set-of-5';
UPDATE "ProductVariant" SET "attributes" = '{"size":"Extra Large","detail":"40-44in"}' WHERE "id" = 'seedstore_tenant_rudra-gym_lever-lifting-belt_extra-large-40-44in';
UPDATE "ProductVariant" SET "attributes" = '{"size":"Large","detail":"36-40in"}' WHERE "id" = 'seedstore_tenant_rudra-gym_lever-lifting-belt_large-36-40in';
UPDATE "ProductVariant" SET "attributes" = '{"size":"Medium","detail":"32-36in"}' WHERE "id" = 'seedstore_tenant_rudra-gym_lever-lifting-belt_medium-32-36in';
UPDATE "ProductVariant" SET "attributes" = '{"size":"Extra Large"}' WHERE "id" = 'seedstore_tenant_rudra-gym_lifting-gloves_extra-large';
UPDATE "ProductVariant" SET "attributes" = '{"size":"Large"}' WHERE "id" = 'seedstore_tenant_rudra-gym_lifting-gloves_large';
UPDATE "ProductVariant" SET "attributes" = '{"size":"Medium"}' WHERE "id" = 'seedstore_tenant_rudra-gym_lifting-gloves_medium';
UPDATE "ProductVariant" SET "attributes" = '{"size":"Small"}' WHERE "id" = 'seedstore_tenant_rudra-gym_lifting-gloves_small';
UPDATE "ProductVariant" SET "attributes" = '{"count":"120 softgels"}' WHERE "id" = 'seedstore_tenant_rudra-gym_omega-3-fish-oil_120-softgels';
UPDATE "ProductVariant" SET "attributes" = '{"count":"60 softgels"}' WHERE "id" = 'seedstore_tenant_rudra-gym_omega-3-fish-oil_60-softgels';
UPDATE "ProductVariant" SET "attributes" = '{"pack":"Set of 5"}' WHERE "id" = 'seedstore_tenant_rudra-gym_resistance-band-set_set-of-5';
