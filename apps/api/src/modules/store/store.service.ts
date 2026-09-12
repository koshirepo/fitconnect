/**
 * Documentation: Gym store catalogue service.
 *
 * - Business rules for managing what a gym sells: what may be retired, what a member is allowed to see, and how stock moves.
 * - Selling is not here. This module owns the catalogue; the sale — pricing, coupons, coins, payment, and the conditional stock decrement — lands in the checkout service alongside the existing gateway code, so there is one place where money is taken.
 * - What a variant costs the gym is added here, and only for a caller who manages the store. It is not in the shared catalogue select, because that shape also feeds the member storefront and the public one.
 * - Primary exports: storeService.
 */
import { storeRepository } from "./store.repository";
import { reactionRepository } from "../reactions/reactions.repository";
import type {
  AdjustStockInput,
  CreateProductInput,
  CreateVariantInput,
  ListProductsInput,
  UpdateProductInput,
  UpdateVariantInput,
} from "./store.schema";

type ServiceError = { error: string; status: 400 | 404 | 409 };

/**
 * Add each variant's purchase price, for a caller allowed to see it.
 *
 * Merged in after the catalogue read rather than selected with it, so the only
 * way a cost reaches a response is through a method that was told the caller
 * manages the store. `productId` narrows the lookup when only one product is
 * being returned.
 */
async function withCosts<T extends { variants: { id: string }[] }>(
  tenantId: string,
  products: T[],
  productId?: string,
) {
  const costs = await storeRepository.findVariantCosts(tenantId, { productId });

  return products.map((product) => ({
    ...product,
    variants: product.variants.map((variant) => ({
      ...variant,
      costPrice: costs.get(variant.id) ?? null,
    })),
  }));
}

/** The same, for a single variant a management write just returned. */
async function variantWithCost<T extends { id: string }>(tenantId: string, variant: T) {
  const costs = await storeRepository.findVariantCosts(tenantId, { variantId: variant.id });
  return { ...variant, costPrice: costs.get(variant.id) ?? null };
}

export const storeService = {
  /**
   * The catalogue.
   *
   * `canManage` decides whether retired products and variants are included, and
   * whether purchase prices are: staff need to see what they have turned off and
   * what they paid, a member should only ever see what is for sale and its price.
   */
  async listProducts(tenantId: string, filters: ListProductsInput, canManage: boolean) {
    const products = await storeRepository.listProducts(tenantId, {
      ...filters,
      includeInactive: canManage && Boolean(filters.includeInactive),
    });

    return { data: { products: canManage ? await withCosts(tenantId, products) : products } };
  },

  /** One product. Purchase prices are included only when `canManage`. */
  async getProduct(tenantId: string, productId: string, canManage = false) {
    const product = await storeRepository.findProduct(tenantId, productId);
    if (!product) return { error: "Product not found.", status: 404 as const };

    if (!canManage) return { data: { product } };

    const [withCost] = await withCosts(tenantId, [product], productId);
    return { data: { product: withCost! } };
  },

  // Creating and editing are management routes, so their replies carry costs
  // the same way the edit form's own read does.
  async createProduct(tenantId: string, input: CreateProductInput) {
    const created = await storeRepository.createProduct(tenantId, input);
    const [product] = await withCosts(tenantId, [created], created.id);

    return { data: { product: product! } };
  },

  async updateProduct(tenantId: string, productId: string, input: UpdateProductInput) {
    const updated = await storeRepository.updateProduct(tenantId, productId, input);
    if (!updated) return { error: "Product not found.", status: 404 as const };

    const [product] = await withCosts(tenantId, [updated], productId);
    return { data: { product: product! } };
  },

  /**
   * Retire or delete a product.
   *
   * A product that has never sold is deleted outright. One that appears on a
   * receipt is deactivated instead — `StoreOrderItem` restricts the delete, and
   * rightly so: a member's order history should not develop holes because the
   * gym stopped stocking something.
   */
  async deleteProduct(tenantId: string, productId: string) {
    const existing = await storeRepository.findProduct(tenantId, productId);
    if (!existing) return { error: "Product not found.", status: 404 as const };

    try {
      const deleted = await storeRepository.deleteProduct(tenantId, productId);
      if (!deleted) return { error: "Product not found.", status: 404 as const };

      // Reactions point at a subject by id rather than by foreign key, so the
      // rows a deleted product leaves behind have to be cleared here or they
      // are unreachable for ever.
      await reactionRepository.deleteForSubject({
        subjectType: "PRODUCT",
        subjectId: productId,
      });

      return { data: { deleted: true, retained: false } };
    } catch {
      // Foreign key from a sold line. Retiring keeps the history readable.
      await storeRepository.updateProduct(tenantId, productId, { isActive: false });
      return { data: { deleted: false, retained: true } };
    }
  },

  async addVariant(tenantId: string, productId: string, input: CreateVariantInput) {
    const variant = await storeRepository.addVariant(tenantId, productId, input);
    if (!variant) return { error: "Product not found.", status: 404 as const };

    return { data: { variant: await variantWithCost(tenantId, variant) } };
  },

  /**
   * Edit a variant, including what it sells for and what it costs.
   *
   * Repricing only moves the next sale. Every order line already written kept
   * its own copy of both prices, so the books for past months do not change.
   */
  async updateVariant(tenantId: string, variantId: string, input: UpdateVariantInput) {
    const variant = await storeRepository.updateVariant(tenantId, variantId, input);
    if (!variant) return { error: "Variant not found.", status: 404 as const };

    return { data: { variant: await variantWithCost(tenantId, variant) } };
  },

  /** Same reasoning as a product: delete what never sold, retire what did. */
  async deleteVariant(tenantId: string, variantId: string) {
    try {
      const deleted = await storeRepository.deleteVariant(tenantId, variantId);
      if (!deleted) return { error: "Variant not found.", status: 404 as const };

      return { data: { deleted: true, retained: false } };
    } catch {
      const variant = await storeRepository.updateVariant(tenantId, variantId, {
        isActive: false,
      });
      if (!variant) return { error: "Variant not found.", status: 404 as const };

      return { data: { deleted: false, retained: true } };
    }
  },

  /**
   * Move stock by a delta — a delivery arriving, or a miscount corrected.
   *
   * Refused when it would take the count below zero, which is a correction
   * someone has got wrong rather than a state worth recording.
   */
  async adjustStock(
    tenantId: string,
    variantId: string,
    input: AdjustStockInput,
  ): Promise<{ data: { variantId: string; delta: number } } | ServiceError> {
    const moved = await storeRepository.adjustStock(tenantId, variantId, input.delta);
    if (!moved) {
      return {
        error:
          input.delta < 0
            ? "That would take stock below zero. Recount and try again."
            : "Variant not found.",
        status: input.delta < 0 ? (409 as const) : (404 as const),
      };
    }

    return { data: { variantId, delta: input.delta } };
  },
};
