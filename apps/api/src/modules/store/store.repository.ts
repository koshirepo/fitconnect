/**
 * Documentation: Gym store repository.
 *
 * - Owns every Prisma query for a gym's catalogue: products, their variants, and stock.
 * - Each read is scoped by `tenantId` in its own `where`, never by a filter the caller is trusted to add. A gym's stock and prices are its own business, and one missing filter is all it takes to show them to another gym.
 * - Stock changes go through `decrementStock`, which is conditional: it only succeeds while enough remains. That is what makes two people buying the last tub at the same moment safe, rather than the read-then-write a service layer would otherwise do.
 * - Primary exports: storeRepository.
 */
import { prisma } from "../../lib/prisma";
import {
  catalogueRepository,
  tenantCatalogue,
} from "../catalogue/catalogue.repository";
import { toStorefrontProduct } from "../catalogue/catalogue.service";
import type {
  CreateProductInput,
  CreateVariantInput,
  ListProductsInput,
  UpdateProductInput,
  UpdateVariantInput,
} from "./store.schema";

/** What a storefront or catalogue row needs; never the whole record. */
export const storeRepository = {
  /**
   * A gym's catalogue.
   *
   * `includeInactive` is the staff view. A member's list hides retired products
   * and, within the ones that remain, retired variants.
   */
  async listProducts(tenantId: string, filters: ListProductsInput) {
    const { products } = await catalogueRepository.listProducts(tenantCatalogue(tenantId), {
      category: filters.category,
      search: filters.search,
      includeInactive: filters.includeInactive,
      orderBy: [{ name: "asc" }],
    });

    if (filters.includeInactive) return products.map(toStorefrontProduct);

    // A shopper sees only what can be bought, down to the variant.
    return products.map((product) =>
      toStorefrontProduct({
        ...product,
        variants: product.variants.filter((variant) => variant.isActive),
      }),
    );
  },

  async findProduct(tenantId: string, productId: string) {
    const product = await catalogueRepository.findProduct(tenantCatalogue(tenantId), productId);
    return product ? toStorefrontProduct(product) : null;
  },

  /**
   * Create a product and its variants together.
   *
   * One write so a product can never exist without something to sell — the
   * state that would show a buyer an empty product page.
   */
  async createProduct(tenantId: string, input: CreateProductInput) {
    const { variants, ...product } = input;

    const created = await catalogueRepository.createProduct(tenantCatalogue(tenantId), {
      ...product,
      photos: product.photos,
      variants: {
        create: variants.map((variant) => ({
          ...variant,
          attributes: variant.attributes ?? {},
        })),
      },
    });

    return toStorefrontProduct(created);
  },

  async updateProduct(tenantId: string, productId: string, input: UpdateProductInput) {
    const updated = await catalogueRepository.updateProduct(
      tenantCatalogue(tenantId),
      productId,
      input,
    );
    return updated ? toStorefrontProduct(updated) : null;
  },

  async deleteProduct(tenantId: string, productId: string) {
    return catalogueRepository.deleteProduct(tenantCatalogue(tenantId), productId);
  },

  /** Add a variant to a product this gym owns. */
  addVariant(tenantId: string, productId: string, input: CreateVariantInput) {
    return catalogueRepository.addVariant(tenantCatalogue(tenantId), productId, {
      ...input,
      attributes: input.attributes ?? {},
    });
  },

  updateVariant(tenantId: string, variantId: string, input: UpdateVariantInput) {
    return catalogueRepository.updateVariant(tenantCatalogue(tenantId), variantId, input);
  },

  deleteVariant(tenantId: string, variantId: string) {
    return catalogueRepository.deleteVariant(tenantCatalogue(tenantId), variantId);
  },

  adjustStock(tenantId: string, variantId: string, delta: number) {
    return catalogueRepository.adjustStock(tenantCatalogue(tenantId), variantId, delta);
  },

  decrementStock(tenantId: string, variantId: string, quantity: number) {
    return catalogueRepository.claimStock(tenantCatalogue(tenantId), variantId, quantity);
  },

  restoreStock(tenantId: string, variantId: string, quantity: number) {
    return catalogueRepository.releaseStock(tenantCatalogue(tenantId), variantId, quantity);
  },

  /** The variants a basket names, with what they cost and what they earn. */
  findVariantsForSale(tenantId: string, variantIds: string[]) {
    return prisma.productVariant.findMany({
      where: {
        id: { in: variantIds },
        isActive: true,
        product: { tenantId, isActive: true },
      },
      select: {
        id: true,
        name: true,
        attributes: true,
        price: true,
        stock: true,
        product: { select: { id: true, name: true, coinsGranted: true } },
      },
    });
  },
};
