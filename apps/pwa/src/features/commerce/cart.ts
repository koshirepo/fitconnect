export type CartItem = {
  productId: string;
  quantity: number;
};

const CART_STORAGE_KEY = "gms-commerce-cart-v1";

function sanitizeCart(items: unknown): CartItem[] {
  if (!Array.isArray(items)) return [];

  const byProduct = new Map<string, number>();
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as { productId?: unknown; quantity?: unknown };
    if (typeof candidate.productId !== "string" || !candidate.productId.trim()) continue;
    const quantity = Number(candidate.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    byProduct.set(candidate.productId, Math.floor(quantity));
  }

  return [...byProduct.entries()].map(([productId, quantity]) => ({
    productId,
    quantity,
  }));
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

export function upsertCartItem(productId: string, quantity: number): CartItem[] {
  const cart = getCartItems();
  const nextQty = Math.floor(quantity);
  const updated =
    nextQty <= 0
      ? cart.filter((item) => item.productId !== productId)
      : (() => {
          const existing = cart.find((item) => item.productId === productId);
          if (!existing) {
            return [...cart, { productId, quantity: nextQty }];
          }
          return cart.map((item) =>
            item.productId === productId ? { ...item, quantity: nextQty } : item,
          );
        })();

  saveCartItems(updated);
  return updated;
}

export function removeCartItem(productId: string): CartItem[] {
  const updated = getCartItems().filter((item) => item.productId !== productId);
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
