-- Documentation: Coupons, redemptions, and the coin ledger.
-- - A coupon grants one of three things: a discount off the price, coins to
--   spend on a later subscription, or bonus days of validity. Which one it is
--   comes from `type`; only the columns for that type are read.
-- - Conditions (first-timer, gender, badge, plan, minimum spend) narrow who may
--   use it. All of them are evaluated server-side against the member's record —
--   a client only ever sends a code.
-- - `redemptionCount` is incremented with a conditional UPDATE so two people
--   racing for the last use cannot both win. D1 has no row locks; the same
--   pattern already guards product stock in the commerce module.
-- - Coins are a liability, so they are a ledger rather than a balance: one row
--   per earn, spend, or reversal, and the balance is their sum. That is what
--   makes "why do I have 300 coins?" answerable and a refund reversible.

CREATE TABLE IF NOT EXISTS "Coupon" (
  "id"              TEXT PRIMARY KEY,
  "tenantId"        TEXT NOT NULL,
  "code"            TEXT NOT NULL,
  "description"     TEXT,
  -- "DISCOUNT" | "COINS" | "VALIDITY"
  "type"            TEXT NOT NULL,
  -- DISCOUNT: one of these two, with an optional cap on the percentage form.
  "percentOff"      INTEGER,
  "amountOff"       INTEGER,
  "maxDiscount"     INTEGER,
  -- COINS: how many coins a redemption grants.
  "coinsGranted"    INTEGER,
  -- VALIDITY: extra days added on top of the plan's own duration.
  "bonusDays"       INTEGER,
  -- Conditions.
  "firstTimeOnly"   INTEGER NOT NULL DEFAULT 0,
  "gender"          TEXT,
  "minAmount"       INTEGER,
  -- Limits.
  "maxRedemptions"  INTEGER,
  "redemptionCount" INTEGER NOT NULL DEFAULT 0,
  "maxPerMember"    INTEGER NOT NULL DEFAULT 1,
  "startsAt"        DATETIME,
  "endsAt"          DATETIME,
  "isActive"        INTEGER NOT NULL DEFAULT 1,
  "createdAt"       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE
);

-- One code per gym, not globally: two gyms may both run "NEWYEAR".
CREATE UNIQUE INDEX IF NOT EXISTS "Coupon_tenantId_code_key" ON "Coupon" ("tenantId", "code");
CREATE INDEX IF NOT EXISTS "Coupon_tenantId_isActive_idx" ON "Coupon" ("tenantId", "isActive");

-- Which badges a member must hold, and which plans a coupon applies to.
-- Empty means "no restriction" in both cases.
CREATE TABLE IF NOT EXISTS "_BadgeToCoupon" (
  "A" TEXT NOT NULL,
  "B" TEXT NOT NULL,
  FOREIGN KEY ("A") REFERENCES "Badge"("id") ON DELETE CASCADE,
  FOREIGN KEY ("B") REFERENCES "Coupon"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "_BadgeToCoupon_AB_unique" ON "_BadgeToCoupon" ("A", "B");
CREATE INDEX IF NOT EXISTS "_BadgeToCoupon_B_index" ON "_BadgeToCoupon" ("B");

CREATE TABLE IF NOT EXISTS "_CouponToSubscription" (
  "A" TEXT NOT NULL,
  "B" TEXT NOT NULL,
  FOREIGN KEY ("A") REFERENCES "Coupon"("id") ON DELETE CASCADE,
  FOREIGN KEY ("B") REFERENCES "Subscription"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "_CouponToSubscription_AB_unique" ON "_CouponToSubscription" ("A", "B");
CREATE INDEX IF NOT EXISTS "_CouponToSubscription_B_index" ON "_CouponToSubscription" ("B");

CREATE TABLE IF NOT EXISTS "CouponRedemption" (
  "id"             TEXT PRIMARY KEY,
  "couponId"       TEXT NOT NULL,
  "tenantId"       TEXT NOT NULL,
  "membershipId"   TEXT NOT NULL,
  "paymentId"      TEXT,
  -- Frozen at redemption: what the coupon was worth on the day it was used,
  -- so editing the coupon later cannot rewrite history.
  "discountAmount" INTEGER NOT NULL DEFAULT 0,
  "coinsGranted"   INTEGER NOT NULL DEFAULT 0,
  "bonusDays"      INTEGER NOT NULL DEFAULT 0,
  "appliedById"    TEXT,
  "reversedAt"     DATETIME,
  "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE,
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE,
  FOREIGN KEY ("membershipId") REFERENCES "TenantMembership"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "CouponRedemption_couponId_idx" ON "CouponRedemption" ("couponId");
CREATE INDEX IF NOT EXISTS "CouponRedemption_membershipId_idx" ON "CouponRedemption" ("membershipId");
CREATE INDEX IF NOT EXISTS "CouponRedemption_tenantId_idx" ON "CouponRedemption" ("tenantId");
-- The per-member limit is checked against this pair on every validation.
CREATE INDEX IF NOT EXISTS "CouponRedemption_couponId_membershipId_idx"
  ON "CouponRedemption" ("couponId", "membershipId");

CREATE TABLE IF NOT EXISTS "CoinLedgerEntry" (
  "id"                 TEXT PRIMARY KEY,
  "tenantId"           TEXT NOT NULL,
  "membershipId"       TEXT NOT NULL,
  -- Positive earns, negative spends. The balance is the sum of these.
  "amount"             INTEGER NOT NULL,
  -- "COUPON" | "REDEEMED" | "REVERSAL" | "ADJUSTMENT"
  "reason"             TEXT NOT NULL,
  "note"               TEXT,
  "couponRedemptionId" TEXT,
  "paymentId"          TEXT,
  "createdById"        TEXT,
  "createdAt"          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE,
  FOREIGN KEY ("membershipId") REFERENCES "TenantMembership"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "CoinLedgerEntry_membershipId_idx" ON "CoinLedgerEntry" ("membershipId");
CREATE INDEX IF NOT EXISTS "CoinLedgerEntry_tenantId_idx" ON "CoinLedgerEntry" ("tenantId");

-- What a payment was before a coupon and coins touched it. `amount` stays what
-- was actually collected, so every existing revenue query keeps working.
ALTER TABLE "Payment" ADD COLUMN "listAmount" INTEGER;
ALTER TABLE "Payment" ADD COLUMN "discountAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Payment" ADD COLUMN "coinsRedeemed" INTEGER NOT NULL DEFAULT 0;
