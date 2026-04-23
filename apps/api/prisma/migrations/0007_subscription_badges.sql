-- Documentation: Add badge-scoped subscriptions.
-- - Introduces a many-to-many relation so subscription plans can be targeted to one or more badges.
-- - Plans without any badge links remain available to all members.

CREATE TABLE "_BadgeToSubscription" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_BadgeToSubscription_A_fkey" FOREIGN KEY ("A") REFERENCES "Badge" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_BadgeToSubscription_B_fkey" FOREIGN KEY ("B") REFERENCES "Subscription" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "_BadgeToSubscription_AB_unique" ON "_BadgeToSubscription"("A", "B");
CREATE INDEX "_BadgeToSubscription_B_index" ON "_BadgeToSubscription"("B");
