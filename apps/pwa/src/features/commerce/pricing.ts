import { COMMERCE_DEFAULT_GST_RATE_PCT } from "@fitconnect/shared";

export const GST_RATE_PCT = COMMERCE_DEFAULT_GST_RATE_PCT;

export function calculateTotals(subtotalAmount: number, gstRatePct = GST_RATE_PCT) {
  const gstAmount = Math.round((subtotalAmount * gstRatePct) / 100);
  return {
    subtotalAmount,
    gstRatePct,
    gstAmount,
    totalAmount: subtotalAmount + gstAmount,
  };
}

export const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
  }).format(amount);
