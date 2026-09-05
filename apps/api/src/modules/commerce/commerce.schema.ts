/**
 * Documentation: Commerce schema definitions.
 *
 * - Defines the Zod schemas and inferred TypeScript input types used to validate requests for product catalog management, ordering, and admin order operations.
 * - When a request payload or query contract changes, update this file first and then adjust the controller/service code that consumes the parsed input.
 * - Primary exports: createProductSchema, updateProductSchema, placeOrderSchema, serviceabilityQuerySchema, shippingQuoteSchema, cancelOrderSchema, createReturnSchema, decideReturnSchema, refundOrderSchema, verifyOrderPaymentSchema, updateOrderStatusSchema, RETURN_REASONS, CreateProductInput, UpdateProductInput, PlaceOrderInput, VerifyOrderPaymentInput, UpdateOrderStatusInput, ShippingQuoteInput, CancelOrderInput, CreateReturnInput, DecideReturnInput, RefundOrderInput.
 */
import { z } from "zod";

/**
 * Define or support the `is youtube url` validation contract for the commerce module.
 * Schema helpers keep input parsing rules colocated with the module that consumes them.
 */
function isYoutubeUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return host === "youtu.be" || host.endsWith("youtube.com");
  } catch {
    return false;
  }
}

const youtubeUrlSchema = z
  .string()
  .url()
  .refine((value) => isYoutubeUrl(value), "Only YouTube video URLs are allowed.");

const productCoreSchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().max(4000).optional(),
  markdown: z.string().max(20000).optional(),
  photos: z.array(z.string().url()).min(1).max(10),
  videos: z.array(youtubeUrlSchema).max(8).optional(),
  category: z.string().min(2).max(100),
  price: z.number().int().min(0),
  stock: z.number().int().min(0),
  minOrderQty: z.number().int().min(1),
  maxOrderQty: z.number().int().min(1),
  /** Grams, per unit. What the courier prices on; defaults to 500g unstated. */
  /**
   * Return and replacement policy, per product.
   *
   * Two flags rather than one setting: they are separate promises. A sealed tub
   * can be replaceable when it arrives damaged while never being returnable for
   * a change of mind, and one field could not say that.
   */
  isReturnable: z.boolean().optional(),
  isReplaceable: z.boolean().optional(),
  /** Days after delivery. Omitted follows the shop-wide window. */
  returnWindowDays: z.number().int().min(1).max(365).nullable().optional(),
  returnPolicyNote: z.string().trim().max(300).nullable().optional(),
  weightGrams: z.number().int().min(1).max(50000).optional(),
  /** Packed size in centimetres. Bulk is billed even when mass is not. */
  lengthCm: z.number().int().min(1).max(200).optional(),
  widthCm: z.number().int().min(1).max(200).optional(),
  heightCm: z.number().int().min(1).max(200).optional(),
  /** Which warehouse ships it. Null puts it back on the default warehouse. */
  warehouseId: z.string().min(1).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const createProductSchema = productCoreSchema.superRefine((data, ctx) => {
  if (data.maxOrderQty < data.minOrderQty) {
    ctx.addIssue({
      code: "custom",
      path: ["maxOrderQty"],
      message: "maxOrderQty must be greater than or equal to minOrderQty.",
    });
  }
});

export const updateProductSchema = productCoreSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one product field must be provided.",
  });

const orderItemSchema = z.object({
  productId: z.string(),
  /**
   * Which form is being bought.
   *
   * Optional, not absent: a product sold in one form needs no choice and the
   * server resolves it, while a product sold in several is refused without one
   * rather than guessed at. Also lets a cart saved before variants existed
   * still check out.
   */
  variantId: z.string().optional(),
  quantity: z.number().int().min(1),
});

/** Six digits, which is every Indian pincode and nothing else. */
const pincodeSchema = z.string().regex(/^[1-9][0-9]{5}$/, "Enter a valid 6-digit pincode.");

/**
 * What an order needs to reach someone.
 *
 * City, state and pincode are required because a courier cannot route on a
 * free-text line, and the shop now books couriers. Orders placed before that
 * kept only the line, which is why the database column is still nullable.
 */
/**
 * Every message here is written to be shown to the buyer.
 *
 * These land in a checkout form, and Zod's own wording ("Too small: expected
 * string to have >=10 characters") tells someone entering an address nothing
 * they can act on.
 */
export const placeOrderSchema = z.object({
  buyerName: z.string().min(2, "Enter the full name for this delivery.").max(120),
  buyerEmail: z.string().email("Enter a valid email address."),
  buyerPhone: z
    .string()
    .min(8, "Enter a phone number the courier can call.")
    .max(20, "That phone number is too long."),
  buyerAddress: z
    .string()
    .min(10, "Enter the full street address — house or flat, street, and landmark.")
    .max(500, "That address is too long."),
  buyerCity: z.string().min(2, "Enter the city.").max(80),
  buyerState: z.string().min(2, "Enter the state.").max(80),
  buyerPincode: pincodeSchema,
  items: z.array(orderItemSchema).min(1, "Your cart is empty.").max(100),
});

export const serviceabilityQuerySchema = z.object({ pincode: pincodeSchema });

/**
 * Ask what carriage costs before committing to an order.
 *
 * Takes the basket rather than a weight: the weight is the products' business
 * and is read from the database, never from the browser.
 */
export const shippingQuoteSchema = z.object({
  pincode: pincodeSchema,
  items: z.array(orderItemSchema).min(1).max(100),
});

export const cancelOrderSchema = z.object({
  reason: z.string().min(3).max(300),
});

export const RETURN_REASONS = [
  "DAMAGED",
  "WRONG_ITEM",
  "NOT_AS_DESCRIBED",
  "SIZE_OR_FIT",
  "NO_LONGER_NEEDED",
  "OTHER",
] as const;

export const createReturnSchema = z.object({
  reason: z.enum(RETURN_REASONS),
  comment: z.string().max(1000).optional(),
});

export const decideReturnSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  note: z.string().max(500).optional(),
});

/**
 * Refunding by hand.
 *
 * The amount is optional and defaults to the whole order; an admin refunding
 * part of one — a damaged item out of three — says how much.
 */
export const refundOrderSchema = z.object({
  amount: z.number().int().positive().optional(),
  reason: z.string().max(300).optional(),
});

/**
 * What the checkout widget hands back when a payment succeeds.
 *
 * No amount and no order of ours: the Razorpay order id is looked up on our
 * side, and the signature is checked against our key secret. Nothing a browser
 * can say here decides whether an order is paid.
 */
export const verifyOrderPaymentSchema = z.object({
  /** Razorpay's order id, not ours. */
  orderId: z.string().min(1),
  paymentId: z.string().min(1),
  signature: z.string().min(1),
});

/**
 * A pickup location, as both this app and Delhivery understand one.
 *
 * `name` is immutable after creation because Delhivery keys on it: renaming
 * would orphan every parcel already manifested under the old name.
 */
const warehouseCoreSchema = z.object({
  contactPerson: z.string().min(2).max(120).optional(),
  phone: z.string().min(8, "Enter a phone number the driver can call.").max(20),
  email: z.string().email().optional(),
  address: z.string().min(10, "Enter the full warehouse address.").max(500),
  city: z.string().min(2).max(80),
  state: z.string().min(2).max(80),
  pincode: pincodeSchema,
  returnAddress: z.string().max(500).optional(),
  returnCity: z.string().max(80).optional(),
  returnState: z.string().max(80).optional(),
  returnPincode: pincodeSchema.optional(),
  isDefault: z.boolean().optional(),
});

export const createWarehouseSchema = warehouseCoreSchema.extend({
  name: z
    .string()
    .min(3, "Give the warehouse a name.")
    .max(80)
    .regex(
      /^[A-Za-z0-9 _.\-&]+$/,
      "Use letters, numbers, spaces and - _ . & only — Delhivery rejects anything else.",
    ),
  /**
   * This pickup location is already on Delhivery's books.
   *
   * Delhivery offers no way to read back the pickup locations it holds — only
   * create and edit — so a location made in their panel, or by an earlier
   * deployment, is invisible to this app until somebody says it exists. Set,
   * the name is taken as given and nothing is sent to the courier: registering
   * it again would either be refused or quietly make a duplicate.
   *
   * The name must match the panel character for character, because that is
   * what every manifest is keyed on.
   */
  alreadyRegistered: z.boolean().optional(),
});

export const updateWarehouseSchema = warehouseCoreSchema
  .extend({ isActive: z.boolean().optional() })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided.",
  });

/** A collection asked of the courier: a date, a time, and how much is waiting. */
export const schedulePickupSchema = z.object({
  pickupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-09-03."),
  pickupTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Use a 24-hour time like 14:00."),
  /** Omitted means "whatever is manifested and waiting", counted server-side. */
  expectedPackageCount: z.number().int().min(1).max(500).optional(),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum([
    "PENDING",
    "CONFIRMED",
    "PACKED",
    "SHIPPED",
    "IN_TRANSIT",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "CANCELLED",
    "RETURNED",
  ]),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
export type VerifyOrderPaymentInput = z.infer<typeof verifyOrderPaymentSchema>;
export type ShippingQuoteInput = z.infer<typeof shippingQuoteSchema>;
export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;
export type UpdateWarehouseInput = z.infer<typeof updateWarehouseSchema>;
export type SchedulePickupInput = z.infer<typeof schedulePickupSchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
export type CreateReturnInput = z.infer<typeof createReturnSchema>;
export type DecideReturnInput = z.infer<typeof decideReturnSchema>;
export type RefundOrderInput = z.infer<typeof refundOrderSchema>;
