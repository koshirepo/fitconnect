-- Which mailbox a gym's email goes out from.
--
-- Every transactional email — password resets, welcome messages, suspension
-- notices, payslips, member reports — currently leaves from the one SMTP
-- account in the Worker environment. So a member joining "Rudra Gym" gets a
-- welcome email from the platform's address, and a reply goes nowhere the gym
-- will ever read.
--
-- This is the same arrangement the payment gateway already has: a gym that
-- saves its own credentials sends from its own mailbox, and a gym that has not
-- falls back to the platform's silently at send time and visibly on the
-- settings screen. `gateway.service` resolves those; `lib/mailer` resolves
-- these, the same way and for the same reason.
--
-- `emailPassword` is sealed with AES-GCM by `lib/secret-box`, exactly like
-- `razorpayKeySecret`, and is only unsealed inside the request that sends. It
-- never travels back to a caller — the settings screen is told whether a
-- password is on file, never what it is.
--
-- Every column is nullable, and null means "not configured". A half-filled row
-- falls back rather than failing, because an email that goes out from the
-- platform address is recoverable and one that never goes out is not.
ALTER TABLE "TenantSettings" ADD COLUMN "emailHost" TEXT;
ALTER TABLE "TenantSettings" ADD COLUMN "emailPort" INTEGER;
ALTER TABLE "TenantSettings" ADD COLUMN "emailSecure" BOOLEAN;
ALTER TABLE "TenantSettings" ADD COLUMN "emailUser" TEXT;
ALTER TABLE "TenantSettings" ADD COLUMN "emailPassword" TEXT;
ALTER TABLE "TenantSettings" ADD COLUMN "emailFrom" TEXT;
