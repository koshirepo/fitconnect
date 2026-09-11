/**
 * Documentation: The sale being rung up at the counter — its lines, and whether its cart is open.
 *
 * - Lifted out of `CounterSale` so the store page can put the one cart button where it belongs, as the main action in its own header, while the grid and the cart panel stay in the component. The page reads the count and total from here; the component reads and changes the lines.
 * - Kept for the session only, through the counter scope in `basket.ts`: it survives moving around the app and a reload, and is gone once the app is closed.
 * - Capped at what is on the shelf now rather than when a line was added, because the catalogue refreshes after every sale.
 * - Primary exports: useCounterCart, type CounterCart.
 */
import * as React from "react";
import type { StoreProduct, StoreVariant } from "@fitconnect/shared/types/models";
import { useCurrentTenantId } from "@/api/queries/shared";
import { basketTotalQuantity, readBasket, writeBasket, type BasketEntry } from "./basket";

export function useCounterCart(products: StoreProduct[]) {
  const tenantId = useCurrentTenantId();
  const [lines, setLines] = React.useState<BasketEntry[]>(() => readBasket(tenantId, "counter"));
  const [open, setOpen] = React.useState(false);

  /** Every change goes through storage, so a reload finds the same cart. */
  const update = (next: (prev: BasketEntry[]) => BasketEntry[]) => {
    setLines((prev) => writeBasket(tenantId, next(prev), "counter"));
  };

  /** What is on the shelf now, by variant. */
  const shelf = React.useMemo(() => {
    const stock = new Map<string, number>();
    for (const product of products) {
      for (const variant of product.variants) stock.set(variant.id, variant.stock);
    }
    return stock;
  }, [products]);

  const stockFor = (entry: BasketEntry) => shelf.get(entry.variantId) ?? entry.stock;

  const quantityOf = (variantId: string) =>
    lines.find((entry) => entry.variantId === variantId)?.quantity ?? 0;

  /** Set a variant to an exact quantity. Zero takes it out; the shelf caps it. */
  const setQuantity = (product: StoreProduct, variant: StoreVariant, quantity: number) => {
    const wanted = Math.min(Math.max(Math.floor(quantity), 0), variant.stock);
    const photo = Array.isArray(product.photos) ? product.photos[0] : undefined;

    update((prev) => {
      if (wanted === 0) return prev.filter((entry) => entry.variantId !== variant.id);

      const line: BasketEntry = {
        variantId: variant.id,
        productId: product.id,
        productName: product.name,
        variantName: variant.name,
        unitPrice: variant.price,
        stock: variant.stock,
        quantity: wanted,
        ...(photo ? { photo } : {}),
      };

      // Kept in place, so the cart does not reshuffle under a thumb.
      return prev.some((entry) => entry.variantId === variant.id)
        ? prev.map((entry) => (entry.variantId === variant.id ? line : entry))
        : [...prev, line];
    });
  };

  /** One more or one fewer of a line already in the cart. */
  const changeLine = (entry: BasketEntry, delta: number) => {
    const quantity = Math.min(Math.max(entry.quantity + delta, 0), stockFor(entry));

    update((prev) =>
      prev.flatMap((line) => {
        if (line.variantId !== entry.variantId) return [line];
        return quantity === 0 ? [] : [{ ...line, quantity }];
      }),
    );
  };

  const clear = () => setLines(writeBasket(tenantId, [], "counter"));

  return {
    lines,
    itemCount: basketTotalQuantity(lines),
    subtotal: lines.reduce((sum, entry) => sum + entry.unitPrice * entry.quantity, 0),
    open,
    setOpen,
    stockFor,
    quantityOf,
    setQuantity,
    changeLine,
    clear,
  };
}

export type CounterCart = ReturnType<typeof useCounterCart>;
