/**
 * Documentation: The gym's own counter, distinct from the platform shop.
 *
 * - One slice of the shared contract surface. `types/models.ts` re-exports every slice, so nothing that imports from there had to change when this was split out of it.
 * - Treat these as the shape the API promises, not as a mirror of Prisma's own models.
 */

// ─── Gym store ────────────────────────────────────────────────────────────────

/** What a gym sells. The sellable unit is the variant, not this. */
export interface StoreProduct {
  id: string;
  name: string;
  /** One plain line, shown on the storefront card. */
  description?: string | null;
  /** The long form, rendered as markdown on the product page. */
  markdown?: string | null;
  /** "SUPPLEMENT" | "ACCESSORY" */
  category: string;
  photos: string[];
  /** A single video, usually YouTube, stored as the gym pasted it. */
  videoUrl?: string | null;
  /** Coins the buyer earns per unit. Zero means no gift. */
  coinsGranted: number;
  isActive: boolean;
  createdAt: string;
  variants: StoreVariant[];
  /** Counts rather than the rows: a card renders a number, not a list. */
  likeCount: number;
  commentCount: number;
}

/**
 * Somebody's opinion, on a product or on a gym.
 *
 * One shape for both, because the two are the same thing to a reader: a name, a
 * face, and what they wrote. Only the author key differs, and that is the
 * server's problem — a product comment is tied to a membership, a gym comment
 * to an account, because the people with something to say about a gym include
 * those who have not joined it.
 */
export interface SocialComment {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: {
    id: string;
    name: string;
    avatarUrl?: string | null;
  };
}

/** What a like button needs to render itself after any change. */
export interface SocialState {
  liked: boolean;
  likeCount: number;
}

/** One buyable combination — a flavour and a size, or a size and a colour. */
export interface StoreVariant {
  id: string;
  name: string;
  /** e.g. `{ flavour: "Chocolate", size: "1kg" }`. */
  attributes: Record<string, string>;
  sku?: string | null;
  price: number;
  stock: number;
  isActive: boolean;
}

/** A line of a basket, as the browser holds it before checkout. */
export interface StoreBasketLine {
  variantId: string;
  quantity: number;
}

/** What a sale returns, whichever channel took the money. */
export interface StoreSaleResult {
  order: { id: string; totalAmount: number; coinsEarned: number; coinsRedeemed: number };
  paymentId: string;
  subtotal: number;
  discount: number;
  coinsRedeemed: number;
  total: number;
  coinsEarned: number;
  /** Null when coins and a coupon cleared the bill, so there is nothing to pay. */
  checkout?: {
    orderId: string;
    keyId: string;
    amount: number;
    currency: string;
  } | null;
}


/**
 * An RFID attendance machine on a gym's wall. A gym may have several.
 *
 * `online` is derived from `lastSeenAt` at read time rather than stored: these
 * devices poll on their own schedule, so when they last spoke is the only
 * honest signal that one is still plugged in.
 */
export interface AttendanceDevice {
  id: string;
  /** Printed on the back of the unit. What every punch is matched on. */
  serialNumber: string;
  name: string;
  location?: string | null;
  /** IANA zone the device's clock is set to. */
  timezone: string;
  isActive: boolean;
  online: boolean;
  lastSeenAt?: string | null;
  lastPunchAt?: string | null;
  createdAt: string;
}

export interface CreateAttendanceDevicePayload {
  serialNumber: string;
  name: string;
  location?: string;
  timezone?: string;
}

export type UpdateAttendanceDevicePayload = Partial<{
  name: string;
  location: string | null;
  timezone: string;
  isActive: boolean;
}>;
