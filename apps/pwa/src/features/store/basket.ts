/**
 * Documentation: A gym store's basket, held in the browser.
 *
 * - Lifted out of `PublicStorePage`'s component state so a product page can change it too. It used to live only on the storefront, which is why every other screen could offer nothing better than a link back with `?add=`: the basket did not exist anywhere they could reach.
 * - Keyed per gym. A member browsing two gyms on the same device has two baskets, and mixing them would build an order no single counter can hand over.
 * - Lines carry the product name, variant name and price they were added at, because the basket drawer renders without re-fetching a catalogue. Stock rides along so the stepper can stop at it.
 * - Survives a reload, like the platform shop's cart. Somebody who dropped their phone mid-shop should not start again.
 * - Primary exports: BasketEntry, readBasket, writeBasket, setBasketQuantity, clearBasket, basketTotalQuantity.
 */

export type BasketEntry = {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  unitPrice: number;
  stock: number;
  quantity: number;
  photo?: string;
};

/** One key per gym, so two gyms on one device do not share a counter. */
function storageKey(tenantId: string) {
  return `fitconnect-store-basket-v1:${tenantId}`;
}

function sanitize(value: unknown): BasketEntry[] {
  if (!Array.isArray(value)) return [];

  const byVariant = new Map<string, BasketEntry>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Partial<BasketEntry>;
    if (typeof entry.variantId !== "string" || !entry.variantId) continue;
    if (typeof entry.productId !== "string" || !entry.productId) continue;

    const quantity = Number(entry.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    byVariant.set(entry.variantId, {
      variantId: entry.variantId,
      productId: entry.productId,
      productName: String(entry.productName ?? ""),
      variantName: String(entry.variantName ?? ""),
      unitPrice: Number(entry.unitPrice) || 0,
      stock: Number(entry.stock) || 0,
      quantity: Math.floor(quantity),
      ...(typeof entry.photo === "string" ? { photo: entry.photo } : {}),
    });
  }

  return [...byVariant.values()];
}

export function readBasket(tenantId: string | null | undefined): BasketEntry[] {
  if (typeof window === "undefined" || !tenantId) return [];
  try {
    const raw = window.localStorage.getItem(storageKey(tenantId));
    return raw ? sanitize(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function writeBasket(tenantId: string | null | undefined, entries: BasketEntry[]) {
  if (typeof window === "undefined" || !tenantId) return entries;
  const sanitized = sanitize(entries);

  try {
    if (sanitized.length === 0) window.localStorage.removeItem(storageKey(tenantId));
    else window.localStorage.setItem(storageKey(tenantId), JSON.stringify(sanitized));
  } catch {
    // A private window with storage blocked still gets a working basket for
    // this page; it just will not survive the reload.
  }

  return sanitized;
}

/**
 * Set one line to an exact quantity.
 *
 * Zero removes it, which is what the stepper's minus does at one. Clamped to
 * stock here as well as in the control, because the control is not the only
 * caller and the gym's counter is the thing that has to be right.
 */
export function setBasketQuantity(
  tenantId: string | null | undefined,
  line: Omit<BasketEntry, "quantity">,
  quantity: number,
): BasketEntry[] {
  const current = readBasket(tenantId);
  const wanted = Math.min(Math.max(Math.floor(quantity), 0), line.stock);

  const next =
    wanted <= 0
      ? current.filter((entry) => entry.variantId !== line.variantId)
      : current.some((entry) => entry.variantId === line.variantId)
        ? current.map((entry) =>
            entry.variantId === line.variantId ? { ...entry, ...line, quantity: wanted } : entry,
          )
        : [...current, { ...line, quantity: wanted }];

  return writeBasket(tenantId, next);
}

export function clearBasket(tenantId: string | null | undefined) {
  return writeBasket(tenantId, []);
}

export function basketTotalQuantity(entries: BasketEntry[]) {
  return entries.reduce((sum, entry) => sum + entry.quantity, 0);
}
