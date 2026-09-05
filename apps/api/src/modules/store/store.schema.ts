/**
 * Documentation: Gym store request schemas.
 *
 * - Validates what a caller may send when managing a catalogue: the product, its variants, and stock movements.
 * - Prices and stock are whole numbers because every amount in this schema is whole rupees and every unit is a countable item. A fractional tub of protein is a typo, not an order.
 * - Nothing here decides what anything costs. Prices are read back from the database at sale time, so a request that names its own price changes nothing.
 * - Primary exports: the schemas, and the inferred input types.
 */
import { z } from "zod";

/**
 * Display text, not an enum.
 *
 * A gym used to be limited to SUPPLEMENT or ACCESSORY, which every screen then
 * translated back into a word. The platform shop next door already stored what
 * it wanted shown, and after the two catalogues merged into one table keeping
 * both conventions meant one column with two meanings. These are what the form
 * offers; a gym selling apparel or gift cards can type its own.
 */
export const STORE_CATEGORY_SUGGESTIONS = [
  "Supplements",
  "Accessories",
  "Apparel",
  "Equipment",
] as const;

const category = z.string().trim().min(1).max(40);

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

/**
 * A video link, stored as pasted.
 *
 * Whatever a gym copies out of YouTube — a share link, a watch link, a Shorts
 * link — is kept verbatim and turned into an embed by the player. Normalising
 * on the way in would mean guessing at a format that changes without notice.
 */
const videoUrl = z.string().trim().url().max(400);

/** The long form beside the one-line `description`, rendered as markdown. */
const markdown = z.string().trim().max(20000);

export const createProductSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  markdown: markdown.optional(),
  category,
  photos: z.array(z.string().url()).max(8).default([]),
  videoUrl: videoUrl.optional(),
  /** Coins the buyer earns per unit. Zero turns the gift off. */
  coinsGranted: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  /** A product with no sellable combination cannot be bought, so require one. */
  variants: z.array(createVariantSchema).min(1).max(50),
});

export const updateProductSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  // Nullable so a gym can clear a body or a video it no longer wants, which an
  // optional-only field cannot express: omitting it means "leave it alone".
  markdown: markdown.nullable().optional(),
  category: category.optional(),
  photos: z.array(z.string().url()).max(8).optional(),
  videoUrl: videoUrl.nullable().optional(),
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
  category: category.optional(),
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

/**
 * An online purchase a member makes for themselves.
 *
 * No `membershipId`: the buyer is whoever is signed in. Accepting one would let
 * a member put a purchase on somebody else's account.
 */
export const storeCheckoutSchema = counterSaleSchema.omit({ membershipId: true });

/** Settling an online purchase against what Razorpay signed. */
export const storeCheckoutVerifySchema = z.object({
  orderId: z.string().min(1),
  paymentId: z.string().min(1),
  signature: z.string().min(1),
});

export type StoreCheckoutInput = z.infer<typeof storeCheckoutSchema>;
export type StoreCheckoutVerifyInput = z.infer<typeof storeCheckoutVerifySchema>;

/**
 * A reservation placed from the public storefront by somebody who has not
 * joined the gym.
 *
 * No coupon and no coins: both hang off a membership this buyer does not have.
 * No address either — the store is collection-only, so the phone number is what
 * the desk calls and what the buyer quotes when they arrive.
 */
export const guestOrderSchema = z.object({
  items: z
    .array(
      z.object({
        variantId: z.string().min(1),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .min(1)
    .max(20),
  buyerName: z.string().trim().min(2).max(120),
  buyerPhone: z.string().trim().min(10).max(15),
  buyerEmail: z.string().trim().email().max(200).optional(),
  note: z.string().trim().max(500).optional(),
});

/**
 * Selling to a walk-in at the counter.
 *
 * The buyer's own details instead of a membership, and no coupon or coins,
 * because both hang off a membership this buyer does not have.
 */
export const guestCounterSaleSchema = guestOrderSchema;

export type GuestCounterSaleInput = z.infer<typeof guestCounterSaleSchema>;

/**
 * A member reserving to pay at the counter.
 *
 * Just the basket: the buyer is whoever is signed in, and no coupon or coins,
 * because nothing is being charged yet.
 */
export const storeReserveSchema = guestOrderSchema.pick({ items: true, note: true });

export type StoreReserveInput = z.infer<typeof storeReserveSchema>;

/** Settling a guest purchase against what Razorpay signed. */
export const guestCheckoutVerifySchema = z.object({
  orderId: z.string().min(1),
  paymentId: z.string().min(1),
  signature: z.string().min(1).max(200),
});

export type GuestCheckoutVerifyInput = z.infer<typeof guestCheckoutVerifySchema>;

/** Coming back to check on a reservation: the reference plus the phone. */
export const guestOrderLookupSchema = z.object({
  orderId: z.string().min(1),
  buyerPhone: z.string().trim().min(10).max(15),
});

export type GuestOrderInput = z.infer<typeof guestOrderSchema>;
export type GuestOrderLookupInput = z.infer<typeof guestOrderLookupSchema>;
