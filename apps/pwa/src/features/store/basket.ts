/**
 * Documentation: A gym store's basket, held in the browser.
 *
 * - Lifted out of `PublicStorePage`'s component state so a product page can change it too. It used to live only on the storefront, which is why every other screen could offer nothing better than a link back with `?add=`: the basket did not exist anywhere they could reach.
 * - Keyed per gym. A member browsing two gyms on the same device has two baskets, and mixing them would build an order no single counter can hand over.
 * - Two baskets per gym, kept apart. The shop's is a shopper's cart: it survives a reload and a closed tab, like the platform shop's, because somebody who dropped their phone mid-shop should not start again. The counter's is a sale in progress at the desk: it lives in session storage, so it survives moving around the app and a reload but is gone once the app is closed — a basket rung up for yesterday's walk-in must not be waiting for whoever opens the till next. A coach who also shops never finds one in the other.
 * - Lines carry the product name, variant name and price they were added at, because the basket drawer renders without re-fetching a catalogue. Stock rides along so the stepper can stop at it.
 * - Primary exports: BasketEntry, BasketScope, readBasket, writeBasket, setBasketQuantity, clearBasket, basketTotalQuantity.
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

/** Which basket: the shopper's at `/shop`, or the sale being rung up at the counter. */
export type BasketScope = "shop" | "counter";

/** One key per gym and basket, so two gyms on one device do not share a counter. */
function storageKey(tenantId: string, scope: BasketScope) {
  return scope === "counter"
    ? `fitconnect-store-counter-v1:${tenantId}`
    : `fitconnect-store-basket-v1:${tenantId}`;
}

/** Where a basket is kept. See the file header for why the two differ. */
function storageFor(scope: BasketScope) {
  return scope === "counter" ? window.sessionStorage : window.localStorage;
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

export function readBasket(
  tenantId: string | null | undefined,
  scope: BasketScope = "shop",
): BasketEntry[] {
  if (typeof window === "undefined" || !tenantId) return [];
  try {
    const raw = storageFor(scope).getItem(storageKey(tenantId, scope));
    return raw ? sanitize(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function writeBasket(
  tenantId: string | null | undefined,
  entries: BasketEntry[],
  scope: BasketScope = "shop",
) {
  if (typeof window === "undefined" || !tenantId) return entries;
  const sanitized = sanitize(entries);

  try {
    const storage = storageFor(scope);
    const key = storageKey(tenantId, scope);
    if (sanitized.length === 0) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(sanitized));
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
  scope: BasketScope = "shop",
): BasketEntry[] {
  const current = readBasket(tenantId, scope);
  const wanted = Math.min(Math.max(Math.floor(quantity), 0), line.stock);

  const next =
    wanted <= 0
      ? current.filter((entry) => entry.variantId !== line.variantId)
      : current.some((entry) => entry.variantId === line.variantId)
        ? current.map((entry) =>
            entry.variantId === line.variantId ? { ...entry, ...line, quantity: wanted } : entry,
          )
        : [...current, { ...line, quantity: wanted }];

  return writeBasket(tenantId, next, scope);
}

export function clearBasket(tenantId: string | null | undefined, scope: BasketScope = "shop") {
  return writeBasket(tenantId, [], scope);
}

export function basketTotalQuantity(entries: BasketEntry[]) {
  return entries.reduce((sum, entry) => sum + entry.quantity, 0);
}
