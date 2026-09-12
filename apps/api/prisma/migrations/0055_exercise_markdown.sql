-- The long form of an exercise, as markdown.
--
-- `description` stays what it was: one plain line under the name on a card.
-- This is the page behind it — how the movement is done, which muscles do the
-- work, what to watch out for — written the same way a gym writes its own
-- profile and a product its full description, and rendered by the same viewer.
--
-- Nullable, and nothing is backfilled: the 329 exercises imported from the
-- clips have no prose yet, and an empty page is honest about that.
ALTER TABLE "Exercise" ADD COLUMN "markdown" TEXT;
