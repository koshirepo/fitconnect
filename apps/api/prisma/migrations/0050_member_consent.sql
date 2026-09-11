-- What the member agreed to, and when.
--
-- A gym asks people to accept something before they train — a health
-- declaration, the house rules, a liability waiver. The wording belongs to the
-- gym: what a boxing gym needs somebody to acknowledge is not what a yoga
-- studio does, and neither of them wants a sentence this platform wrote.
--
-- So `TenantSettings.consentText` is the gym's own wording, and the three
-- columns on the membership are the record of one person accepting it.
--
-- The wording is SNAPSHOTTED onto the membership rather than referenced. That
-- is the whole point of the record: a gym that revises its terms next March
-- must still be able to say what this member agreed to last September. A
-- foreign key to the live settings row would quietly rewrite history every
-- time somebody edited the textarea, which is the one thing a consent record
-- must never do.
--
-- `consentRecordedById` is null when the member accepted it themselves on the
-- public signup form, and carries the staff membership when somebody at the
-- desk confirmed it on their behalf — usually because it was signed on paper.
-- Those are different evidentiary weights and the column is what tells them
-- apart.
--
-- Entirely additive. Every membership that predates this reads as "no consent
-- on file", which is exactly what it is: nobody was ever asked.
ALTER TABLE "TenantSettings" ADD COLUMN "consentText" TEXT;

ALTER TABLE "TenantMembership" ADD COLUMN "consentAcceptedAt" DATETIME;
ALTER TABLE "TenantMembership" ADD COLUMN "consentText" TEXT;
ALTER TABLE "TenantMembership" ADD COLUMN "consentRecordedById" TEXT;
