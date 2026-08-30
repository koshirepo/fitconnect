-- Documentation: A gym's own colour.
-- - Until now every gym's pages were painted in the platform's orange. A gym
--   with its own identity — and a logo already on the page — looked like it was
--   borrowing somebody else's software, which on the public storefront and the
--   signup page is exactly the wrong impression.
-- - One nullable column holding a hex string. Null means the platform default,
--   which is what every gym looked like before this existed, so nothing changes
--   for a gym that never sets one.
-- - The derived shades — the gradient's second stop, the readable text colour
--   on top of it — are computed in the browser rather than stored. Storing them
--   would mean three columns that can disagree with each other.

ALTER TABLE "Tenant" ADD COLUMN "brandColor" TEXT;
