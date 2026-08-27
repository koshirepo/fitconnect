/**
 * Documentation: Gym store catalogue service.
 *
 * - Business rules for managing what a gym sells: what may be retired, what a member is allowed to see, and how stock moves.
 * - Selling is not here. This module owns the catalogue; the sale — pricing, coupons, coins, payment, and the conditional stock decrement — lands in the checkout service alongside the existing gateway code, so there is one place where money is taken.
 * - Primary exports: storeService.
 */
import { storeRepository } from "./store.repository";
import type {
  AdjustStockInput,
  CreateProductInput,
  CreateVariantInput,
  ListProductsInput,
  UpdateProductInput,
  UpdateVariantInput,
} from "./store.schema";

type ServiceError = { error: string; status: 400 | 404 | 409 };

export const storeService = {
  /**
   * The catalogue.
   *
   * `canManage` decides whether retired products and variants are included:
   * staff need to see what they have turned off, a member should only ever see
   * what is actually for sale.
   */
  async listProducts(tenantId: string, filters: ListProductsInput, canManage: boolean) {
    const products = await storeRepository.listProducts(tenantId, {
      ...filters,
      includeInactive: canManage && Boolean(filters.includeInactive),
    });

    return { data: { products } };
  },

  async getProduct(tenantId: string, productId: string) {
    const product = await storeRepository.findProduct(tenantId, productId);
    if (!product) return { error: "Product not found.", status: 404 as const };

    return { data: { product } };
  },

  async createProduct(tenantId: string, input: CreateProductInput) {
    const product = await storeRepository.createProduct(tenantId, input);
    return { data: { product } };
  },

  async updateProduct(tenantId: string, productId: string, input: UpdateProductInput) {
    const product = await storeRepository.updateProduct(tenantId, productId, input);
    if (!product) return { error: "Product not found.", status: 404 as const };

    return { data: { product } };
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

    return { data: { variant } };
  },

  async updateVariant(tenantId: string, variantId: string, input: UpdateVariantInput) {
    const variant = await storeRepository.updateVariant(tenantId, variantId, input);
    if (!variant) return { error: "Variant not found.", status: 404 as const };

    return { data: { variant } };
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
