/**
 * Documentation: The platform shop's cart, held in the browser.
 *
 * - A line is a *variant*, not a product. Two colours of the same bottle are two lines, which is the whole point of variants and was impossible while the key was `productId`.
 * - `productId` travels alongside so a page can find the product a line belongs to without another lookup. The identity is the variant.
 * - Carts that predate variants are migrated on read rather than dropped: somebody who left a bottle in their cart last week should still find it there. A legacy line has no variant, so it is kept with `variantId: null` and resolved against the product's sole variant at checkout — the same rule the API applies.
 * - The storage key is unchanged on purpose. Bumping it would have emptied every cart in every browser, which is a worse outcome than carrying two shapes for a while.
 * - Primary exports: CartItem, getCartItems, saveCartItems, upsertCartItem, removeCartItem, clearCartItems, getCartTotalQuantity, cartLineKey.
 */

export type CartItem = {
  productId: string;
  /**
   * Which form was chosen. Null only for a line saved before variants existed;
   * checkout resolves those against the product's single variant.
   */
  variantId: string | null;
  quantity: number;
};

const CART_STORAGE_KEY = "gms-commerce-cart-v1";

/** What identifies a line. Two variants of one product are two lines. */
export function cartLineKey(item: { productId: string; variantId: string | null }) {
  return item.variantId ?? `product:${item.productId}`;
}

function sanitizeCart(items: unknown): CartItem[] {
  if (!Array.isArray(items)) return [];

  const byLine = new Map<string, CartItem>();
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as {
      productId?: unknown;
      variantId?: unknown;
      quantity?: unknown;
    };
    if (typeof candidate.productId !== "string" || !candidate.productId.trim()) continue;

    const quantity = Number(candidate.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    // A cart written before variants has no `variantId` at all; that reads as
    // null rather than being thrown away.
    const variantId =
      typeof candidate.variantId === "string" && candidate.variantId.trim()
        ? candidate.variantId
        : null;

    const line = { productId: candidate.productId, variantId, quantity: Math.floor(quantity) };
    byLine.set(cartLineKey(line), line);
  }

  return [...byLine.values()];
}

export function getCartItems(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    return sanitizeCart(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveCartItems(items: CartItem[]) {
  if (typeof window === "undefined") return;
  const sanitized = sanitizeCart(items);
  if (sanitized.length === 0) {
    window.localStorage.removeItem(CART_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(sanitized));
}

export function upsertCartItem(
  productId: string,
  variantId: string | null,
  quantity: number,
): CartItem[] {
  const cart = getCartItems();
  const nextQty = Math.floor(quantity);
  const key = cartLineKey({ productId, variantId });

  const updated =
    nextQty <= 0
      ? cart.filter((item) => cartLineKey(item) !== key)
      : cart.some((item) => cartLineKey(item) === key)
        ? cart.map((item) =>
            cartLineKey(item) === key ? { ...item, quantity: nextQty } : item,
          )
        : [...cart, { productId, variantId, quantity: nextQty }];

  saveCartItems(updated);
  return updated;
}

export function removeCartItem(productId: string, variantId: string | null): CartItem[] {
  const key = cartLineKey({ productId, variantId });
  const updated = getCartItems().filter((item) => cartLineKey(item) !== key);
  saveCartItems(updated);
  return updated;
}

export function clearCartItems() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CART_STORAGE_KEY);
}

export function getCartTotalQuantity(items: CartItem[]) {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}
