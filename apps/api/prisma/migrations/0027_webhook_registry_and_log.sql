-- Documentation: Registering Razorpay webhooks, and remembering what they sent.
-- - The webhook url carries a tenant id, so every gym needs its own webhook at
--   Razorpay. Registering them by hand does not scale and does not get done: a
--   gym that is missed has members whose payments sit PENDING whenever a browser
--   closes mid-payment, and nobody finds out until somebody complains.
-- - `razorpayWebhookId` remembers the webhook this app created for a gym, so a
--   second attempt updates it rather than stacking duplicates that each deliver
--   the same event.
-- - `WebhookDelivery` is the trail that was missing entirely. A rejected or
--   ignored delivery used to leave no record at all, so "why is this payment
--   still pending" could only be answered from Razorpay's own dashboard.
--   Kept deliberately small: what arrived, what was decided, and why.

ALTER TABLE "TenantSettings" ADD COLUMN "razorpayWebhookId" TEXT;

CREATE TABLE IF NOT EXISTS "WebhookDelivery" (
  "id"        TEXT PRIMARY KEY,
  "tenantId"  TEXT NOT NULL REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  -- "payment.captured", "order.paid", "refund.processed", …
  "event"     TEXT,
  -- Razorpay's own ids, for matching a row against their dashboard.
  "gatewayOrderId"   TEXT,
  "gatewayPaymentId" TEXT,
  -- "SETTLED" | "FAILED_ORDER" | "IGNORED" | "BAD_SIGNATURE" | "NO_SECRET"
  -- | "UNKNOWN_ORDER" | "ERROR"
  "outcome"   TEXT NOT NULL,
  -- One line saying why, in the words the desk would use.
  "detail"    TEXT,
  -- What was returned to Razorpay, so a retry loop is visible as a retry loop.
  "status"    INTEGER NOT NULL DEFAULT 200,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "WebhookDelivery_tenantId_createdAt_idx"
  ON "WebhookDelivery" ("tenantId", "createdAt");
-- The lookup behind "what happened to this payment".
CREATE INDEX "WebhookDelivery_gatewayOrderId_idx"
  ON "WebhookDelivery" ("gatewayOrderId");
