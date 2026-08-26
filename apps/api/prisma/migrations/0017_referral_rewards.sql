-- Documentation: Coins for referring a member.
-- - A gym sets how many coins a referrer earns, and optionally how many the
--   person they brought in earns too. Zero, the default, turns the whole thing
--   off — an existing gym sees no change until it decides otherwise.
-- - The reward lands when the referred member's first subscription payment
--   completes, not when they sign up. Rewarding a signup pays for names in a
--   form; rewarding a payment pays for members.
-- - Coins are the currency because they already exist as a ledger, so a
--   referral reward is auditable and reversible like every other coin.

ALTER TABLE "TenantSettings" ADD COLUMN "referralRewardCoins" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TenantSettings" ADD COLUMN "referralRefereeCoins" INTEGER NOT NULL DEFAULT 0;
