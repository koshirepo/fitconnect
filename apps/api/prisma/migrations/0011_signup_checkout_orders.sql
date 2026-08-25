-- Documentation: One gateway order covering several payment rows.
-- - Self-signup pays for a plan and its mandatory charges in a single Razorpay
--   order, so several Payment rows now share one `gatewayOrderId`. The unique
--   index added in 0010 allowed only one row per order and has to go.
-- - The plain index stays: every gateway lookup is by order id, and the settle
--   paths are idempotent on their own (a row already COMPLETED is left alone),
--   so uniqueness was never what stopped a replayed verify from paying twice.

DROP INDEX IF EXISTS "Payment_gatewayOrderId_key";
