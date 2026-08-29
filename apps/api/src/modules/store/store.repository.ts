/**
 * Documentation: Gym store repository.
 *
 * - Owns every Prisma query for a gym's catalogue: products, their variants, and stock.
 * - Each read is scoped by `tenantId` in its own `where`, never by a filter the caller is trusted to add. A gym's stock and prices are its own business, and one missing filter is all it takes to show them to another gym.
 * - Stock changes go through `decrementStock`, which is conditional: it only succeeds while enough remains. That is what makes two people buying the last tub at the same moment safe, rather than the read-then-write a service layer would otherwise do.
 * - Primary exports: storeRepository.
 */
import { prisma } from "../../lib/prisma";
import type {
  CreateProductInput,
  CreateVariantInput,
  ListProductsInput,
  UpdateProductInput,
  UpdateVariantInput,
} from "./store.schema";

/** What a storefront or catalogue row needs; never the whole record. */
const productSelect = {
  id: true,
  name: true,
  description: true,
  markdown: true,
  category: true,
  photos: true,
  videoUrl: true,
  coinsGranted: true,
  isActive: true,
  createdAt: true,
  // Counts rather than the rows: a catalogue page wants to say "12 likes", and
  // loading twelve rows per product to render one number would not scale past
  // a gym that is doing well.
  _count: { select: { likes: true, comments: true } },
  variants: {
    select: {
      id: true,
      name: true,
      attributes: true,
      sku: true,
      price: true,
      stock: true,
      isActive: true,
    },
    orderBy: { createdAt: "asc" },
  },
} as const;

/** What a product looks like straight out of `productSelect`. */
type SelectedProduct = { _count: { likes: number; comments: number } } & Record<string, unknown>;

/**
 * Flatten Prisma's `_count` into the two numbers a page actually renders.
 *
 * Done here rather than in each caller so the storefront, the public shop
 * window, and the admin catalogue cannot disagree about the shape.
 */
function shapeProduct<T extends SelectedProduct>({ _count, ...product }: T) {
  return { ...product, likeCount: _count.likes, commentCount: _count.comments };
}

export const storeRepository = {
  /**
   * A gym's catalogue.
   *
   * `includeInactive` is the staff view. A member's list hides retired products
   * and, within the ones that remain, retired variants.
   */
  async listProducts(tenantId: string, filters: ListProductsInput) {
    const products = await prisma.storeProduct.findMany({
      where: {
        tenantId,
        ...(filters.includeInactive ? {} : { isActive: true }),
        ...(filters.category ? { category: filters.category } : {}),
        ...(filters.search ? { name: { contains: filters.search } } : {}),
      },
      select: productSelect,
      orderBy: { name: "asc" },
    });

    if (filters.includeInactive) return products.map(shapeProduct);

    return products.map((product) =>
      shapeProduct({
        ...product,
        variants: product.variants.filter((variant) => variant.isActive),
      }),
    );
  },

  async findProduct(tenantId: string, productId: string) {
    const product = await prisma.storeProduct.findFirst({
      where: { id: productId, tenantId },
      select: productSelect,
    });

    return product ? shapeProduct(product) : null;
  },

  /**
   * Create a product and its variants together.
   *
   * One write so a product can never exist without something to sell — the
   * state that would show a buyer an empty product page.
   */
  async createProduct(tenantId: string, input: CreateProductInput) {
    const { variants, ...product } = input;

    const created = await prisma.storeProduct.create({
      data: {
        tenantId,
        ...product,
        photos: product.photos,
        variants: {
          create: variants.map((variant) => ({
            ...variant,
            attributes: variant.attributes ?? {},
          })),
        },
      },
      select: productSelect,
    });

    return shapeProduct(created);
  },

  async updateProduct(tenantId: string, productId: string, input: UpdateProductInput) {
    // Scoped update: `updateMany` takes a where clause, so another gym's id
    // matches nothing rather than updating a record it does not own.
    const result = await prisma.storeProduct.updateMany({
      where: { id: productId, tenantId },
      data: input,
    });
    if (result.count === 0) return null;

    return storeRepository.findProduct(tenantId, productId);
  },

  async deleteProduct(tenantId: string, productId: string) {
    const result = await prisma.storeProduct.deleteMany({
      where: { id: productId, tenantId },
    });
    return result.count > 0;
  },

  /** Add a variant to a product this gym owns. */
  async addVariant(tenantId: string, productId: string, input: CreateVariantInput) {
    const product = await prisma.storeProduct.findFirst({
      where: { id: productId, tenantId },
      select: { id: true },
    });
    if (!product) return null;

    return prisma.storeVariant.create({
      data: {
        productId,
        ...input,
        attributes: input.attributes ?? {},
      },
      select: {
        id: true,
        name: true,
        attributes: true,
        sku: true,
        price: true,
        stock: true,
        isActive: true,
      },
    });
  },

  async updateVariant(tenantId: string, variantId: string, input: UpdateVariantInput) {
    const result = await prisma.storeVariant.updateMany({
      // The tenant reaches this through the product it hangs from.
      where: { id: variantId, product: { tenantId } },
      data: input,
    });
    if (result.count === 0) return null;

    return prisma.storeVariant.findUnique({
      where: { id: variantId },
      select: {
        id: true,
        name: true,
        attributes: true,
        sku: true,
        price: true,
        stock: true,
        isActive: true,
      },
    });
  },

  async deleteVariant(tenantId: string, variantId: string) {
    const result = await prisma.storeVariant.deleteMany({
      where: { id: variantId, product: { tenantId } },
    });
    return result.count > 0;
  },

  /**
   * Move a variant's stock by a delta.
   *
   * A decrement is refused when it would go below zero, so a correction cannot
   * quietly create negative stock.
   */
  async adjustStock(tenantId: string, variantId: string, delta: number) {
    const result = await prisma.storeVariant.updateMany({
      where: {
        id: variantId,
        product: { tenantId },
        ...(delta < 0 ? { stock: { gte: -delta } } : {}),
      },
      data: { stock: { increment: delta } },
    });

    return result.count > 0;
  },

  /**
   * Take `quantity` off a variant, but only while that much remains.
   *
   * The condition lives in the WHERE clause rather than in a prior read, so two
   * sales of the last tub cannot both succeed: the second matches no row and is
   * told so. Returns false when the stock was not there.
   */
  async decrementStock(variantId: string, quantity: number) {
    const result = await prisma.storeVariant.updateMany({
      where: { id: variantId, stock: { gte: quantity } },
      data: { stock: { decrement: quantity } },
    });

    return result.count > 0;
  },

  /** Put stock back, for a cancelled or reversed sale. */
  async restoreStock(variantId: string, quantity: number) {
    await prisma.storeVariant.update({
      where: { id: variantId },
      data: { stock: { increment: quantity } },
    });
  },

  /** The variants a basket names, with what they cost and what they earn. */
  findVariantsForSale(tenantId: string, variantIds: string[]) {
    return prisma.storeVariant.findMany({
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
