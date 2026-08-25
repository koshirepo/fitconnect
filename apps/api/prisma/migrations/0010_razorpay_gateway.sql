-- Documentation: Razorpay payment gateway support.
-- - Adds per-gym Razorpay credentials to TenantSettings. A gym that fills these
--   in collects into its own Razorpay account; a gym that leaves them null
--   falls back to the platform account configured in the Worker environment.
-- - `razorpayKeySecret` and `razorpayWebhookSecret` hold ciphertext produced by
--   `src/lib/secret-box.ts`, not raw secrets. `razorpayKeyId` is a public
--   identifier and is stored as-is because the browser needs it to open checkout.
-- - Adds gateway reconciliation columns to Payment. `gatewayOrderId` is unique
--   so a replayed verify request cannot settle the same order twice.

ALTER TABLE "TenantSettings" ADD COLUMN "razorpayKeyId" TEXT;
ALTER TABLE "TenantSettings" ADD COLUMN "razorpayKeySecret" TEXT;
ALTER TABLE "TenantSettings" ADD COLUMN "razorpayWebhookSecret" TEXT;

ALTER TABLE "Payment" ADD COLUMN "gateway" TEXT;
ALTER TABLE "Payment" ADD COLUMN "gatewayOrderId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "gatewayPaymentId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "gatewayAccount" TEXT;

CREATE UNIQUE INDEX "Payment_gatewayOrderId_key" ON "Payment" ("gatewayOrderId");
CREATE INDEX "Payment_gatewayOrderId_idx" ON "Payment" ("gatewayOrderId");
