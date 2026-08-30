/**
 * Documentation: Gym store queries and mutations.
 *
 * - Wraps `storeApi` so screens declare what they need rather than orchestrating fetches, loading flags, and refetch-after-write by hand.
 * - Every write invalidates `["store", tenantId]`, which covers the catalogue, its filtered variants, and any product detail in one call. Stock is the reason this matters: a sale that did not refresh the list would offer a tub the gym no longer has.
 * - Primary exports: useStoreProducts, useStoreProduct, and the catalogue, stock, and sale mutations.
 */
import { storeApi, type StoreProductPayload, type StoreVariantPayload } from "@/api/store";
import { queryKeys } from "@/lib/query-keys";
import type { StoreBasketLine, StoreProduct } from "@fitconnect/shared/types/models";
import { unwrap, useCurrentTenantId, useTenantMutation, useTenantQuery } from "./shared";

/**
 * Every store query for one gym.
 *
 * Prefix-matched, so this clears the catalogue, its filtered variants, and any
 * product detail in one call. Stock is why that matters: a sale that did not
 * refresh the list would offer a tub the gym no longer has.
 */
function storeRoot(tenantId: string | null | undefined) {
  return ["store", tenantId ?? "none"];
}

/**
 * The gym's catalogue.
 *
 * `includeInactive` is only honoured for a caller who may manage the store; the
 * API decides that, not this hook.
 */
export function useStoreProducts(
  params: { category?: string; includeInactive?: boolean } = {},
  options: { enabled?: boolean } = {},
) {
  return useTenantQuery(
    (tenantId) => queryKeys.store.products(tenantId, params),
    async (tenantId): Promise<StoreProduct[]> =>
      unwrap(await storeApi.listProducts(tenantId, params)).products,
    options,
  );
}

export function useStoreProduct(productId: string | undefined) {
  return useTenantQuery(
    (tenantId) => queryKeys.store.product(tenantId, productId ?? "none"),
    async (tenantId): Promise<StoreProduct> =>
      unwrap(await storeApi.getProduct(tenantId, productId!)).product,
    { enabled: Boolean(productId) },
  );
}

// ─── Catalogue management ────────────────────────────────────────────────────

export function useCreateStoreProduct() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, payload: StoreProductPayload) =>
      unwrap(await storeApi.createProduct(id, payload)).product,
    { invalidates: [storeRoot(tenantId)] },
  );
}

export function useUpdateStoreProduct() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (
      id,
      input: { productId: string; payload: Partial<Omit<StoreProductPayload, "variants">> },
    ) => unwrap(await storeApi.updateProduct(id, input.productId, input.payload)).product,
    { invalidates: [storeRoot(tenantId)] },
  );
}

export function useDeleteStoreProduct() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, productId: string) => unwrap(await storeApi.deleteProduct(id, productId)),
    { invalidates: [storeRoot(tenantId)] },
  );
}

export function useAddStoreVariant() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, input: { productId: string; payload: StoreVariantPayload }) =>
      unwrap(await storeApi.addVariant(id, input.productId, input.payload)).variant,
    { invalidates: [storeRoot(tenantId)] },
  );
}

export function useUpdateStoreVariant() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, input: { variantId: string; payload: Partial<StoreVariantPayload> }) =>
      unwrap(await storeApi.updateVariant(id, input.variantId, input.payload)).variant,
    { invalidates: [storeRoot(tenantId)] },
  );
}

export function useDeleteStoreVariant() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, variantId: string) => unwrap(await storeApi.deleteVariant(id, variantId)),
    { invalidates: [storeRoot(tenantId)] },
  );
}

export function useAdjustStoreStock() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, input: { variantId: string; delta: number; note?: string }) =>
      unwrap(await storeApi.adjustStock(id, input.variantId, input.delta, input.note)),
    { invalidates: [storeRoot(tenantId)] },
  );
}

// ─── Selling ─────────────────────────────────────────────────────────────────

/** Staff ringing up a sale for a member at the desk. */
export function useSellAtCounter() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (
      id,
      input: {
        membershipId: string;
        items: StoreBasketLine[];
        couponCode?: string;
        coinsToSpend?: number;
        note?: string;
      },
    ) => unwrap(await storeApi.sellAtCounter(id, input)),
    // Stock moved and coins changed hands.
    { invalidates: [storeRoot(tenantId)] },
  );
}

/** A member buying for themselves. */
export function useStartStoreCheckout() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (
      id,
      input: { items: StoreBasketLine[]; couponCode?: string; coinsToSpend?: number },
    ) => unwrap(await storeApi.startCheckout(id, input)),
    { invalidates: [storeRoot(tenantId)] },
  );
}

/** Selling to a walk-in at the counter. */
export function useSellToGuest() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (
      id,
      input: {
        items: StoreBasketLine[];
        buyerName: string;
        buyerPhone: string;
        buyerEmail?: string;
        note?: string;
      },
    ) => unwrap(await storeApi.sellToGuest(id, input)),
    // Stock moved.
    { invalidates: [storeRoot(tenantId)] },
  );
}

/** The desk's order queue. */
export function useStoreOrders(filters: { status?: string; channel?: string } = {}) {
  return useTenantQuery(
    (tenantId) => [...storeRoot(tenantId), "orders", filters],
    async (tenantId) => unwrap(await storeApi.listOrders(tenantId, filters)).orders,
  );
}

/** Handing a reservation over. Moves stock, so it invalidates the catalogue. */
export function useCompleteStoreOrder() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, orderId: string) => unwrap(await storeApi.completeOrder(id, orderId)),
    { invalidates: [storeRoot(tenantId)] },
  );
}

export function useRejectStoreOrder() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, orderId: string) => unwrap(await storeApi.rejectOrder(id, orderId)),
    { invalidates: [storeRoot(tenantId)] },
  );
}

/** A member reserving to pay at the counter. */
export function useReserveStoreOrder() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, input: { items: StoreBasketLine[]; note?: string }) =>
      unwrap(await storeApi.reserve(id, input)),
    { invalidates: [storeRoot(tenantId)] },
  );
}

export function useVerifyStoreCheckout() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, input: { orderId: string; paymentId: string; signature: string }) =>
      unwrap(await storeApi.verifyCheckout(id, input)),
    { invalidates: [storeRoot(tenantId)] },
  );
}

/** Called when a member closes the payment window, to free the held stock. */
export function useCancelStoreOrder() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (id, orderId: string) => unwrap(await storeApi.cancelOrder(id, orderId)),
    { invalidates: [storeRoot(tenantId)] },
  );
}
