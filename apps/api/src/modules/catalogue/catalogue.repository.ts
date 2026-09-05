/**
 * Documentation: The one way into the product catalogue.
 *
 * - `Product` holds the platform shop and every gym's store in one table, distinguished only by `tenantId`. Three repositories used to read it — commerce, store, and public — each with its own select, its own serializer, and its own memory of which rows it was allowed to see. This is the single place that knows.
 * - Every function takes a `CatalogueOwner` and there is no default. That is the point: a caller cannot forget to scope, because there is no call that compiles without saying whose catalogue it means. The filter itself is built in exactly one function, `ownerWhere`.
 * - This replaced discipline with structure after a real bug: `decrementStock` took a variant id alone, which was safe while gym variants lived in their own table and became a way to sell another gym's stock the moment they did not.
 * - Routes and authorization stay with the modules that own them. The platform shop is public and managed by platform staff; a gym's store is permission-gated per tenant. Those genuinely differ, and this file has no opinion about either.
 * - Primary exports: CatalogueOwner, PLATFORM_CATALOGUE, tenantCatalogue, catalogueRepository.
 */
import { prisma } from "../../lib/prisma";

/**
 * Whose catalogue a query means.
 *
 * A tagged union rather than `string | null`, so "the platform" is something a
 * caller states rather than something that happens when a variable is empty.
 * An accidental `undefined` cannot be mistaken for "the platform shop".
 */
export type CatalogueOwner =
  | { readonly kind: "platform" }
  | { readonly kind: "tenant"; readonly tenantId: string };

export const PLATFORM_CATALOGUE: CatalogueOwner = { kind: "platform" };

export function tenantCatalogue(tenantId: string): CatalogueOwner {
  return { kind: "tenant", tenantId };
}

/**
 * The only place the ownership filter is written.
 *
 * `tenantId: null` is the platform's own catalogue. Prisma treats an explicit
 * null as `IS NULL`, which is what makes a gym's rows invisible to the shop.
 */
function ownerWhere(owner: CatalogueOwner) {
  return owner.kind === "platform"
    ? { tenantId: null }
    : { tenantId: owner.tenantId };
}

/** The same filter, reached through a product relation. */
function ownerWhereVia(owner: CatalogueOwner) {
  return { product: ownerWhere(owner) };
}

/**
 * One product shape for both storefronts.
 *
 * The union of what the two used to select. A gym does not use warehouses and
 * the shop does not grant coins, but one shape is what stops the two drifting
 * apart again, and the unused columns cost a byte each.
 */
export const catalogueProductSelect = {
  id: true,
  tenantId: true,
  name: true,
  description: true,
  markdown: true,
  category: true,
  photos: true,
  videoUrl: true,
  coinsGranted: true,
  minOrderQty: true,
  maxOrderQty: true,
  isReturnable: true,
  isReplaceable: true,
  returnWindowDays: true,
  returnPolicyNote: true,
  weightGrams: true,
  lengthCm: true,
  widthCm: true,
  heightCm: true,
  warehouseId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
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
    orderBy: { createdAt: "asc" as const },
  },
} as const;

export const catalogueRepository = {
  /**
   * A catalogue, filtered.
   *
   * `includeInactive` is the staff view; a shopper's list hides retired
   * products and, within those that remain, retired variants.
   */
  async listProducts(
    owner: CatalogueOwner,
    filters: {
      category?: string;
      search?: string;
      includeInactive?: boolean;
      skip?: number;
      take?: number;
      orderBy?: Array<Record<string, "asc" | "desc">>;
    } = {},
  ) {
    const where = {
      ...ownerWhere(owner),
      ...(filters.includeInactive ? {} : { isActive: true }),
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: "insensitive" as const } },
              { category: { contains: filters.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        ...(filters.skip !== undefined ? { skip: filters.skip } : {}),
        ...(filters.take !== undefined ? { take: filters.take } : {}),
        orderBy: filters.orderBy ?? [{ createdAt: "desc" as const }],
        select: catalogueProductSelect,
      }),
      prisma.product.count({ where }),
    ]);

    return { products, total };
  },

  findProduct(owner: CatalogueOwner, productId: string) {
    return prisma.product.findFirst({
      where: { id: productId, ...ownerWhere(owner) },
      select: catalogueProductSelect,
    });
  },

  /** The same, but only if it is actually for sale. */
  findSellableProduct(owner: CatalogueOwner, productId: string) {
    return prisma.product.findFirst({
      where: { id: productId, isActive: true, ...ownerWhere(owner) },
      select: catalogueProductSelect,
    });
  },

  createProduct(owner: CatalogueOwner, data: Record<string, unknown>) {
    return prisma.product.create({
      // The owner is written here, not taken from the caller's payload: a
      // create that trusted its input could plant a row in another catalogue.
      data: { ...data, ...ownerWhere(owner) } as never,
      select: catalogueProductSelect,
    });
  },

  /**
   * Update a product, refusing rows outside the owner's catalogue.
   *
   * `updateMany` rather than `update` on purpose: a unique-id update cannot
   * carry the ownership filter, so it would edit any row whose id was guessed.
   * Returns null when nothing matched, which callers read as "not yours".
   */
  async updateProduct(owner: CatalogueOwner, productId: string, data: Record<string, unknown>) {
    const result = await prisma.product.updateMany({
      where: { id: productId, ...ownerWhere(owner) },
      data: data as never,
    });
    if (result.count === 0) return null;
    return this.findProduct(owner, productId);
  },

  async deleteProduct(owner: CatalogueOwner, productId: string) {
    const result = await prisma.product.deleteMany({
      where: { id: productId, ...ownerWhere(owner) },
    });
    return result.count > 0;
  },

  // ─── Variants ──────────────────────────────────────────────────────────────

  /** Add a variant, but only to a product the owner actually has. */
  async addVariant(owner: CatalogueOwner, productId: string, data: Record<string, unknown>) {
    const product = await prisma.product.findFirst({
      where: { id: productId, ...ownerWhere(owner) },
      select: { id: true },
    });
    if (!product) return null;

    return prisma.productVariant.create({
      data: { ...data, productId } as never,
      select: catalogueProductSelect.variants.select,
    });
  },

  async updateVariant(owner: CatalogueOwner, variantId: string, data: Record<string, unknown>) {
    const result = await prisma.productVariant.updateMany({
      where: { id: variantId, ...ownerWhereVia(owner) },
      data: data as never,
    });
    if (result.count === 0) return null;

    return prisma.productVariant.findFirst({
      where: { id: variantId, ...ownerWhereVia(owner) },
      select: catalogueProductSelect.variants.select,
    });
  },

  async deleteVariant(owner: CatalogueOwner, variantId: string) {
    const result = await prisma.productVariant.deleteMany({
      where: { id: variantId, ...ownerWhereVia(owner) },
    });
    return result.count > 0;
  },

  findVariants(owner: CatalogueOwner, variantIds: string[]) {
    return prisma.productVariant.findMany({
      where: { id: { in: variantIds }, ...ownerWhereVia(owner) },
      select: {
        ...catalogueProductSelect.variants.select,
        product: {
          select: {
            id: true,
            name: true,
            isActive: true,
            coinsGranted: true,
            minOrderQty: true,
            maxOrderQty: true,
          },
        },
      },
    });
  },

  // ─── Stock ─────────────────────────────────────────────────────────────────

  /**
   * Move a variant's stock by a delta.
   *
   * A decrement is refused when it would go below zero, so a correction cannot
   * quietly create negative stock.
   */
  async adjustStock(owner: CatalogueOwner, variantId: string, delta: number) {
    const result = await prisma.productVariant.updateMany({
      where: {
        id: variantId,
        ...ownerWhereVia(owner),
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
  async claimStock(owner: CatalogueOwner, variantId: string, quantity: number) {
    const result = await prisma.productVariant.updateMany({
      where: { id: variantId, ...ownerWhereVia(owner), stock: { gte: quantity } },
      data: { stock: { decrement: quantity } },
    });
    return result.count > 0;
  },

  /** Put stock back, for a cancelled, failed, or reversed sale. */
  async releaseStock(owner: CatalogueOwner, variantId: string, quantity: number) {
    await prisma.productVariant.updateMany({
      where: { id: variantId, ...ownerWhereVia(owner) },
      data: { stock: { increment: quantity } },
    });
  },
};
