/**
 * Documentation: Shop pricing and line-item rules.
 *
 * - The arithmetic the storefront shows and the quantity rules it enforces, in one place so the cart, the checkout, and the product page cannot disagree about what a basket costs or what a valid quantity is.
 * - The API recomputes all of this from the database before taking money. Nothing here is trusted; it exists so the buyer sees the same figure the server will charge.
 * - `formatCurrency` is re-exported rather than redefined: it is the platform-wide rupee format from the shared package, and a second copy here is how two screens end up rounding differently.
 * - Primary exports: GST_RATE_PCT, calculateTotals, validateQuantity, formatCurrency.
 */
import { COMMERCE_DEFAULT_GST_RATE_PCT } from "@fitconnect/shared";
import { formatCurrency } from "@fitconnect/shared/utils";
import type { Product } from "@/types/api";

export { formatCurrency };

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

/**
 * Why this quantity cannot be ordered, or an empty string when it can.
 *
 * Returns the message rather than a boolean because every caller shows it, and
 * a shared rule that produced different wording per screen would be no better
 * than the copies this replaced.
 */
export function validateQuantity(product: Product, quantity: number) {
  if (quantity < product.minOrderQty || quantity > product.maxOrderQty) {
    return `Allowed quantity is ${product.minOrderQty} to ${product.maxOrderQty}.`;
  }
  if (quantity > product.stock) {
    return `Only ${product.stock} units are available.`;
  }
  if (!product.isActive) {
    return "Product is currently inactive.";
  }
  return "";
}
