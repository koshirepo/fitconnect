-- Documentation: The record of chasing a member for money.
-- - One row per reminder that actually went out: a push the nightly cron sent,
--   or a WhatsApp message a member of staff pressed send on. WhatsApp is
--   recorded at the moment the link is opened, which is the last thing the app
--   can observe — delivery and reading happen inside WhatsApp.
-- - `paymentId` is null while the money is still outstanding and is filled in by
--   the payment that eventually arrives, so a settled payment carries the
--   history of what it took to collect. `targetPaymentId` is the pending row
--   that was being chased, kept separately because a renewal reminder chases a
--   date rather than an existing row.
-- - The `(membershipId, paymentId)` index is the claim query a new payment runs;
--   `(membershipId, reason, sentAt)` is how the cron decides whether it already
--   sent today's nudge.

CREATE TABLE IF NOT EXISTS "PaymentReminder" (
  "id"              TEXT PRIMARY KEY,
  "tenantId"        TEXT NOT NULL REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "membershipId"    TEXT NOT NULL REFERENCES "TenantMembership" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "channel"         TEXT NOT NULL,
  "reason"          TEXT NOT NULL,
  "message"         TEXT,
  "actorId"         TEXT REFERENCES "TenantMembership" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "targetPaymentId" TEXT,
  "paymentId"       TEXT REFERENCES "Payment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "sentAt"          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "PaymentReminder_tenantId_idx" ON "PaymentReminder" ("tenantId");
CREATE INDEX IF NOT EXISTS "PaymentReminder_paymentId_idx" ON "PaymentReminder" ("paymentId");
CREATE INDEX IF NOT EXISTS "PaymentReminder_membershipId_paymentId_idx" ON "PaymentReminder" ("membershipId", "paymentId");
CREATE INDEX IF NOT EXISTS "PaymentReminder_membershipId_reason_sentAt_idx" ON "PaymentReminder" ("membershipId", "reason", "sentAt");
