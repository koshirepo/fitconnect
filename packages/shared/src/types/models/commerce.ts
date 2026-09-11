/**
 * Documentation: The shop: products, orders, and getting them delivered.
 *
 * - One slice of the shared contract surface. `types/models.ts` re-exports every slice, so nothing that imports from there had to change when this was split out of it.
 * - Treat these as the shape the API promises, not as a mirror of Prisma's own models.
 */

import type { OrderStatus, PaymentStatus, ReturnStatus, ShipmentStatus } from "../enums";

// ─── Workout Plans ────────────────────────────────────────────────────────────

/** One buyable form of a product: a colour, a size, a flavour. */
export interface ProductVariant {
  id: string;
  name: string;
  attributes?: Record<string, string> | null;
  sku?: string | null;
  price: number;
  stock: number;
  isActive: boolean;
}

export interface Product {
  id: string;
  /** Null for the platform shop; a gym's id for that gym's store. */
  tenantId?: string | null;
  name: string;
  description?: string | null;
  markdown?: string | null;
  photos: string[];
  videos: string[];
  category: string;
  /** Every form this is sold in. At least one, always. */
  variants: ProductVariant[];
  /** Cheapest live variant. Derived by the API; not stored. */
  price: number;
  /** Total across live variants. Derived by the API; not stored. */
  stock: number;
  /** True where `price` is a "from", so a card can say "onwards". */
  hasChoice?: boolean;
  minOrderQty: number;
  maxOrderQty: number;
  /** Grams per unit. What the courier prices carriage on. */
  weightGrams?: number;
  /** Whether a buyer may send this back at all. False for anything hygiene
   *  or food-safety rules will not take back once opened. */
  isReturnable?: boolean;
  /** Whether a faulty one is swapped rather than refunded. Separate from
   *  returnable: a sealed tub can be replaceable without being returnable. */
  isReplaceable?: boolean;
  /** Days after delivery. Null follows the shop-wide window. */
  returnWindowDays?: number | null;
  /** The condition the flags cannot express — "unopened only". */
  returnPolicyNote?: string | null;
  /** Packed size in cm. Couriers bill the greater of mass and volume. */
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  /** Which warehouse ships it. Null uses the default warehouse. */
  warehouseId?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateProductPayload {
  name: string;
  description?: string;
  markdown?: string;
  photos: string[];
  videos?: string[];
  category: string;
  price: number;
  stock: number;
  minOrderQty: number;
  maxOrderQty: number;
  weightGrams?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  warehouseId?: string | null;
  /** Return and replacement policy. Omitted keeps the model defaults. */
  isReturnable?: boolean;
  isReplaceable?: boolean;
  /** Null follows the shop-wide window. */
  returnWindowDays?: number | null;
  returnPolicyNote?: string | null;
  isActive?: boolean;
}

export interface UpdateProductPayload {
  name?: string;
  description?: string;
  markdown?: string;
  photos?: string[];
  videos?: string[];
  category?: string;
  price?: number;
  stock?: number;
  minOrderQty?: number;
  maxOrderQty?: number;
  weightGrams?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  warehouseId?: string | null;
  isActive?: boolean;
}

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Order {
  id: string;
  userId?: string | null;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  buyerAddress: string;
  /** Null on orders placed before the shop shipped by courier. */
  buyerCity?: string | null;
  buyerState?: string | null;
  buyerPincode?: string | null;
  /** Fulfilment, not money. See `paymentStatus` for whether it was paid. */
  status: OrderStatus;
  subtotalAmount: number;
  gstRatePct: number;
  gstAmount: number;
  /** Carriage, quoted at checkout and frozen. Zero when nothing is shipped. */
  shippingAmount?: number;
  /**
   * Why carriage came out unpriced, when it did. Null is the ordinary case.
   * A zero-rated order is not necessarily wrong — a shop with no courier
   * configured really does charge nothing — so this says which it was.
   */
  shippingQuoteIssue?: string | null;
  totalAmount: number;
  /** PENDING until the gateway settles it; COMPLETED once it has. */
  paymentStatus?: PaymentStatus;
  paidAt?: string | null;
  refundAmount?: number | null;
  refundedAt?: string | null;
  confirmedAt?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  createdAt: string;
  updatedAt?: string;
  items: OrderItem[];
}

/** One courier scan, as the tracking timeline shows it. */
export interface ShipmentScan {
  status: string;
  detail: string;
  location: string;
  scannedAt: string;
}

/** A consignment: the parcel out to the buyer, or the one coming back. */
export interface Shipment {
  id: string;
  orderId: string;
  /** Which warehouse it left from, or comes back to. */
  warehouseId?: string | null;
  provider: string;
  kind: "FORWARD" | "REVERSE";
  /** The number the buyer quotes to the courier. */
  waybill: string;
  status: ShipmentStatus;
  statusDetail?: string | null;
  currentLocation?: string | null;
  pickupLocation?: string | null;
  estimatedDeliveryAt?: string | null;
  scans: ShipmentScan[];
  lastSyncedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export type ReturnReason =
  | "DAMAGED"
  | "WRONG_ITEM"
  | "NOT_AS_DESCRIBED"
  | "SIZE_OR_FIT"
  | "NO_LONGER_NEEDED"
  | "OTHER";

export interface ReturnRequest {
  id: string;
  orderId: string;
  status: ReturnStatus;
  reason: ReturnReason | string;
  comment?: string | null;
  /** The reverse consignment, once approval has booked one. */
  shipmentId?: string | null;
  decidedById?: string | null;
  decidedAt?: string | null;
  decisionNote?: string | null;
  refundAmount?: number | null;
  refundedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
  /** Present on the admin queue, which lists returns across orders. */
  order?: Pick<
    Order,
    "id" | "buyerName" | "buyerEmail" | "totalAmount" | "status" | "paymentStatus"
  >;
}

/**
 * Everything known about an order's journey, plus what the buyer may still do.
 *
 * The two flags are decided by the API — a return window and a dispatch state
 * are the server's business — so the page renders them rather than deriving
 * its own answer from timestamps.
 */
export interface OrderTracking {
  order: Order;
  shipments: Shipment[];
  returns: ReturnRequest[];
  canCancel: boolean;
  canRequestReturn: boolean;
  /** Why a return is or is not open, in the shop's own terms. */
  returnPolicy?: {
    returnable: boolean;
    /** Items that cannot go back, named so a refusal can say which. */
    blockedBy: string[];
    replaceable: boolean;
    /** The shortest window any item in the order allows. */
    windowDays: number;
    notes: string[];
  };
}

/**
 * A place parcels leave from, here and at the courier.
 *
 * `registeredAt` is the difference that matters: a warehouse can exist in this
 * app and be unknown to Delhivery, and only the registered ones can ship.
 */
export interface Warehouse {
  id: string;
  /** Immutable — Delhivery keys its pickup locations on this string. */
  name: string;
  contactPerson?: string | null;
  phone: string;
  email?: string | null;
  address: string;
  city: string;
  state: string;
  pincode: string;
  returnAddress?: string | null;
  returnCity?: string | null;
  returnState?: string | null;
  returnPincode?: string | null;
  /** Where products that name no warehouse ship from. Exactly one holds this. */
  isDefault: boolean;
  isActive: boolean;
  registeredAt?: string | null;
  /** What the courier said if it refused the registration. */
  registerError?: string | null;
  createdAt: string;
  updatedAt?: string;
  _count?: { products: number };
}

export interface CreateWarehousePayload {
  name: string;
  contactPerson?: string;
  phone: string;
  email?: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  returnAddress?: string;
  returnCity?: string;
  returnState?: string;
  returnPincode?: string;
  isDefault?: boolean;
  /**
   * Link a pickup location Delhivery already holds instead of creating one.
   * Delhivery cannot be asked what it has, so this is the only way a location
   * made in their panel becomes visible here. The name must match it exactly.
   */
  alreadyRegistered?: boolean;
}

export type UpdateWarehousePayload = Partial<Omit<CreateWarehousePayload, "name">> & {
  isActive?: boolean;
};

/** A collection the courier has been asked to make from one warehouse. */
export interface PickupRequest {
  id: string;
  warehouseId: string;
  /** Delhivery's own id for the collection, absent when it refused. */
  pickupId?: string | null;
  pickupDate: string;
  pickupTime: string;
  expectedPackageCount: number;
  status: "REQUESTED" | "FAILED" | string;
  note?: string | null;
  createdAt: string;
}

export interface SchedulePickupPayload {
  /** YYYY-MM-DD. */
  pickupDate: string;
  /** HH:MM, 24-hour. */
  pickupTime: string;
  /** Omit to let the server count what is manifested and waiting. */
  expectedPackageCount?: number;
}

/** What a courier says about one pincode. */
export interface PincodeServiceability {
  pincode: string;
  serviceable: boolean;
  city?: string | null;
  state?: string | null;
  prepaid: boolean;
  cod: boolean;
  /** Whether a return can be collected from there. */
  pickupAvailable: boolean;
  /** False when the deployment has no courier wired up at all. */
  courierConfigured: boolean;
}

/** What carriage costs for a basket, in whole rupees. */
export interface ShippingQuote {
  shippingAmount: number;
  courierConfigured: boolean;
  weightGrams?: number;
  /** True when volumetric weight, not mass, set the price. */
  volumetricUsed?: boolean;
  /** How many parcels the basket becomes — one per warehouse it draws on. */
  parcelCount?: number;
}

/**
 * What the browser needs to open the Razorpay widget for a shop order.
 *
 * The key id is public; the order was created server-side against the total the
 * database computed, so nothing here lets a browser name its own price.
 */
export interface OrderCheckoutSession {
  /** Razorpay's order id, not ours. */
  orderId: string;
  keyId: string;
  amount: number;
  currency: string;
}

export interface PlaceOrderPayload {
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  buyerAddress: string;
  buyerCity: string;
  buyerState: string;
  /** Six digits. The courier routes on this and nothing else. */
  buyerPincode: string;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
}

export interface CreateReturnPayload {
  reason: ReturnReason;
  comment?: string;
}
