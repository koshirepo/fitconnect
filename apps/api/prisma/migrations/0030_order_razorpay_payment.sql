-- Documentation: Paying for a platform shop order.
-- - The platform storefront took orders but never money: an order was created
--   PENDING and somebody settled it off-app. The gym storefront beside it has
--   taken cards since it was built, so the two halves of the same product
--   behaved differently for no reason a buyer could see.
-- - `status` keeps meaning fulfilment — PENDING, SHIPPED, DELIVERED — because
--   that is what every existing row and every admin screen already reads it as.
--   Money gets its own column rather than new values in that one, so an order
--   that is paid but not yet shipped can say so.
-- - Every existing row defaults to paymentStatus PENDING with no gateway ids,
--   which is precisely what those orders were: placed, unpaid, settled by hand.
-- - The index is for the one lookup that matters: finding an order by the
--   Razorpay order id, which is all the browser's return and the webhook carry.

ALTER TABLE "Order" ADD COLUMN "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Order" ADD COLUMN "gatewayOrderId" TEXT;
ALTER TABLE "Order" ADD COLUMN "gatewayPaymentId" TEXT;
ALTER TABLE "Order" ADD COLUMN "paidAt" DATETIME;

CREATE INDEX "Order_gatewayOrderId_idx" ON "Order"("gatewayOrderId");
