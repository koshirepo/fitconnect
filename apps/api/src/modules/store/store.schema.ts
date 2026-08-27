/**
 * Documentation: Gym store request schemas.
 *
 * - Validates what a caller may send when managing a catalogue: the product, its variants, and stock movements.
 * - Prices and stock are whole numbers because every amount in this schema is whole rupees and every unit is a countable item. A fractional tub of protein is a typo, not an order.
 * - Nothing here decides what anything costs. Prices are read back from the database at sale time, so a request that names its own price changes nothing.
 * - Primary exports: the schemas, and the inferred input types.
 */
import { z } from "zod";

/** What a gym sells. Extendable, but these two cover supplements and kit. */
export const STORE_CATEGORIES = ["SUPPLEMENT", "ACCESSORY"] as const;

const attributes = z
  .record(z.string().min(1).max(40), z.string().min(1).max(60))
  .refine((value) => Object.keys(value).length <= 6, {
    message: "A variant may have at most 6 attributes.",
  });

export const createVariantSchema = z.object({
  name: z.string().trim().min(1).max(120),
  /** e.g. `{ "flavour": "Chocolate", "size": "1kg" }`. */
  attributes: attributes.optional(),
  sku: z.string().trim().max(60).optional(),
  price: z.number().int().min(0),
  stock: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const updateVariantSchema = createVariantSchema.partial();

export const createProductSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  category: z.enum(STORE_CATEGORIES),
  photos: z.array(z.string().url()).max(6).default([]),
  /** Coins the buyer earns per unit. Zero turns the gift off. */
  coinsGranted: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  /** A product with no sellable combination cannot be bought, so require one. */
  variants: z.array(createVariantSchema).min(1).max(50),
});

export const updateProductSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  category: z.enum(STORE_CATEGORIES).optional(),
  photos: z.array(z.string().url()).max(6).optional(),
  coinsGranted: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

/**
 * A stock movement, applied as a delta rather than a new total.
 *
 * Two people counting the same shelf at once both send what they added, and
 * both land. Sending an absolute figure would make the second silently discard
 * the first.
 */
export const adjustStockSchema = z.object({
  delta: z.number().int().refine((value) => value !== 0, {
    message: "A stock adjustment must move the count.",
  }),
  note: z.string().trim().max(200).optional(),
});

export const listProductsSchema = z.object({
  category: z.enum(STORE_CATEGORIES).optional(),
  /** Staff can see retired products; a member never should. */
  includeInactive: z.coerce.boolean().optional(),
  search: z.string().trim().max(80).optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type CreateVariantInput = z.infer<typeof createVariantSchema>;
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
export type ListProductsInput = z.infer<typeof listProductsSchema>;

/**
 * A counter sale.
 *
 * The basket names variants and quantities only. Prices, coin grants, and the
 * coupon's benefit are all read from the database at sale time — a request that
 * could name its own total could buy a ₹5,000 tub for a rupee.
 */
export const counterSaleSchema = z.object({
  /** The member being sold to. Staff sell on someone's behalf, never anonymously. */
  membershipId: z.string().min(1),
  items: z
    .array(
      z.object({
        variantId: z.string().min(1),
        quantity: z.number().int().min(1).max(100),
      }),
    )
    .min(1)
    .max(50),
  couponCode: z.string().trim().min(1).max(40).optional(),
  /** Coins the member chose to spend. Capped at their balance and the bill. */
  coinsToSpend: z.number().int().min(0).optional(),
  note: z.string().trim().max(200).optional(),
});

export type CounterSaleInput = z.infer<typeof counterSaleSchema>;
