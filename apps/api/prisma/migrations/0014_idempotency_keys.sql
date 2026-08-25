-- Documentation: Idempotency keys for replayed writes.
-- - The PWA queues writes made offline and replays them when the connection
--   returns. If the server accepted one but the response never arrived, the
--   replay used to create a second record — two members, or worse, two payments
--   for one collection.
-- - Each queued write now carries a stable `Idempotency-Key` across every
--   attempt. This table remembers the keys already applied, so a repeat is
--   recognised and answered with the original result instead of being redone.
-- - Rows are disposable: they exist to cover the minutes between a lost
--   response and its retry, and can be pruned on any schedule.

CREATE TABLE IF NOT EXISTS "IdempotencyKey" (
  "key"        TEXT PRIMARY KEY,
  "userId"     TEXT NOT NULL,
  "method"     TEXT NOT NULL,
  "path"       TEXT NOT NULL,
  "statusCode" INTEGER NOT NULL,
  "response"   TEXT NOT NULL,
  "createdAt"  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "IdempotencyKey_createdAt_idx" ON "IdempotencyKey" ("createdAt");
