-- Documentation: Packed size, so bulky items are priced like bulky items.
-- - Carriage was quoted on weight alone, which under-prices exactly the products
--   a gym shop sells most of: a yoga mat weighs 1.2kg and fills a box, and every
--   courier in India bills the greater of actual weight and volumetric weight.
-- - Volumetric weight is length × width × height ÷ 5000 (centimetres to
--   kilograms). The divisor is Delhivery's for surface freight; it lives in
--   config rather than here so a change of courier or service is a setting.
-- - Distance was never missing: Delhivery prices origin-to-destination as a zone
--   from the two pincodes, which is why the quote already asks per warehouse.
--   This adds the third input, not the second.
-- - 10cm cubed is the default for anything unmeasured — small enough that it
--   never inflates a quote on its own, and the same shape the manifest used to
--   hardcode.

ALTER TABLE "Product" ADD COLUMN "lengthCm" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "Product" ADD COLUMN "widthCm" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "Product" ADD COLUMN "heightCm" INTEGER NOT NULL DEFAULT 10;
