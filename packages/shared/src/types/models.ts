/**
 * Documentation: Shared domain model and payload interfaces.
 *
 * - Collects the DTOs used across authentication, tenants, members, payments, commerce, attendance, and other business areas.
 * - Treat this file as the typed contract surface for clients that consume the API rather than as a mirror of raw Prisma model output.
 * - Primary exports: User, TenantMembershipSummary, AuthResponse, TokenRefreshResponse, Tenant, CreateTenantAdminPayload, CreateTenantPayload, UpdateTenantPayload, PublicTenantDetail, PublicGymSummary, TenantMember, TenantProfile, AddMemberPayload, UpdateProfilePayload, MemberDetail, Subscription, CreateSubscriptionPayload, Payment, PaymentSummary, CreatePaymentPayload, UpdatePaymentPayload, PlatformPayment, RecordPlatformPaymentPayload, Product, CreateProductPayload, UpdateProductPayload, OrderItem, Order, PlaceOrderPayload, Exercise, WorkoutPlan, CreateWorkoutPlanPayload, UpdateWorkoutPlanPayload, AuditLog, Badge, CreateBadgePayload, UpdateBadgePayload, AssignBadgePayload, TenantSettings, UpdateTenantSettingsPayload, TenantCharge, CreateTenantChargePayload, UpdateTenantChargePayload, AttendanceRecord, AttendanceSummary, MarkAttendancePayload, MarkAllAttendancePayload.
 */
import type {
  PlatformRole,
  TenantRole,
  AccountStatus,
  PaymentStatus,
  OrderStatus,
  ShipmentStatus,
  ReturnStatus,
  TodoVisibility,
  AuditAction,
} from "./enums";

// ─── User / Auth ──────────────────────────────────────────────────────────────

export type Gender = "MALE" | "FEMALE" | "OTHER";

export interface User {
  id: string;
  name: string;
  email: string;
  gender?: Gender | null;
  phone?: string | null;
  avatarUrl?: string | null;
  platformRole: PlatformRole;
  status?: AccountStatus;
  createdAt?: string;
  membership?: TenantMembershipSummary;
  /** Effective capability list resolved by the API for this session. */
  permissions?: string[];
}

export interface TenantMembershipSummary {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  role: TenantRole;
  platformExpiresAt?: string | null;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface TokenRefreshResponse {
  accessToken: string;
  refreshToken: string;
}

// ─── Tenant ───────────────────────────────────────────────────────────────────

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  logoUrl?: string | null;
  /** Hex accent colour for this gym's pages. Null uses the platform default. */
  brandColor?: string | null;
  markdown?: string | null;
  description?: string | null;
  estd?: string | null;
  status: AccountStatus;
  platformExpiresAt?: string | null;
  createdAt: string;
}

export interface CreateTenantAdminPayload {
  name: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
}

export interface CreateTenantPayload {
  name: string;
  slug?: string;
  email?: string;
  phone?: string;
  address?: string;
  logoUrl?: string;
  markdown?: string;
  admin: CreateTenantAdminPayload;
}

export interface UpdateTenantPayload {
  name?: string;
  phone?: string | null;
  address?: string | null;
  logoUrl?: string | null;
  /** Hex accent colour. Null puts this gym back on the platform's own. */
  brandColor?: string | null;
  markdown?: string | null;
  description?: string | null;
}

// ─── Public Tenant Detail ─────────────────────────────────────────────────────

export interface PublicTenantDetail {
  id: string;
  name: string;
  slug: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  logoUrl?: string | null;
  markdown?: string | null;
  description?: string | null;
  estd?: string | null;
  createdAt: string;
  _count: { memberships: number };
  subscriptions: {
    id: string;
    title: string;
    description?: string | null;
    amount: number;
    durationDays: number;
  }[];
  shifts: Shift[];
}

export interface PublicGymSummary {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  address?: string | null;
  estd?: string | null;
  _count: { memberships: number };
}

// ─── Members ──────────────────────────────────────────────────────────────────

export interface TenantMember {
  id: string;
  memberId: number;
  userId: string;
  name: string;
  email: string;
  gender?: Gender | null;
  phone?: string | null;
  avatarUrl?: string | null;
  /** Built-in (MEMBER/COACH/ADMIN) or a custom role key. */
  role: string;
  status: AccountStatus;
  joinedAt: string;
  isDue?: boolean;
  dueDate?: string | null;
  /** True while any payment against this member is still PENDING. */
  hasPendingPayment?: boolean;
  /** Sum of those pending rows, in rupees. */
  pendingPaymentAmount?: number;
  /** Badges awarded to this member. Ids alone — the roster filters on them. */
  badgeIds?: string[];
  shift?: Shift | null;
  referralCount?: number;
  referredBy?: MemberReferral | null;
}

export interface MemberReferral {
  id: string;
  memberId: number;
  userId: string;
  name: string;
  email: string;
  gender?: Gender | null;
  phone?: string | null;
  avatarUrl?: string | null;
  role: string;
  status: AccountStatus;
  joinedAt: string;
}

export interface MemberReferralLeader extends MemberReferral {
  referralCount: number;
  referrals: MemberReferral[];
}

export interface TenantProfile {
  id: string;
  /** Stable link to this member's card; contents render live. */
  idCardUrl?: string | null;
  memberId: number;
  userId: string;
  name: string;
  email: string;
  gender?: Gender | null;
  phone?: string | null;
  avatarUrl?: string | null;
  userCreatedAt: string;
  role: string;
  status: AccountStatus;
  joinedAt: string;
  dueDate?: string | null;
  /** Badges this member holds. Ids alone — the names live on the badge list. */
  badgeIds?: string[];
  shift?: Shift | null;
  payments?: PaymentSummary[];
}

export interface AddMemberPayload {
  name: string;
  email: string;
  phone: string;
  gender?: Gender;
  /** Built-in (MEMBER/COACH/ADMIN) or a custom role key. */
  role?: string;
  avatarUrl?: string;
  subscriptionId?: string;
  chargeIds?: string[];
  /**
   * A joining offer. The code only — the server decides what it is worth, so
   * a browser can never name its own discount.
   */
  couponCode?: string;
  shiftId?: string;
  referredByMembershipId?: string;
}

export interface UpdateProfilePayload {
  name?: string;
  phone?: string | null;
  gender?: Gender | null;
  avatarUrl?: string | null;
  currentPassword?: string;
  newPassword?: string;
}

export interface UpdateMemberPayload {
  name?: string;
  phone?: string | null;
  gender?: Gender | null;
  avatarUrl?: string | null;
  newPassword?: string;
  shiftId?: string | null;
}

export interface MemberDetail {
  id: string;
  /** Stable link to this member's card; contents render live. */
  idCardUrl?: string | null;
  memberId: number;
  userId: string;
  name: string;
  email: string;
  gender?: Gender | null;
  phone?: string | null;
  avatarUrl?: string | null;
  userCreatedAt: string;
  role: string;
  status: AccountStatus;
  joinedAt: string;
  dueDate?: string | null;
  shift?: Shift | null;
  referralCount: number;
  referredBy?: MemberReferral | null;
  referrals: MemberReferral[];
  payments: {
    id: string;
    amount: number;
    description?: string | null;
    status: PaymentStatus;
    paidAt?: string | null;
    validFrom?: string | null;
    validUntil?: string | null;
    createdAt: string;
    subscription?: { id: string; title: string } | null;
  }[];
  badges: {
    id: string;
    name: string;
    description?: string | null;
    color: string;
    icon?: string | null;
  }[];
  planAssignments: {
    id: string;
    assignedAt: string;
    plan: {
      id: string;
      title: string;
      description?: string | null;
    };
  }[];
}

/** What a member ID card prints. Re-read on every open, never stored. */
export interface MemberIdCard {
  member: {
    name: string;
    memberId: number;
    avatarUrl?: string | null;
    gender?: Gender | null;
    role: string;
    status: AccountStatus;
    joinedAt: string;
    validUntil?: string | null;
    shift?: { name: string; startTime: string; endTime: string } | null;
  };
  gym: {
    name: string;
    slug: string;
    logoUrl?: string | null;
    address?: string | null;
    phone?: string | null;
    /** The gym's own colour, so a printed card matches its walls and its website. */
    brandColor?: string | null;
  };
  issuedAt: string;
}

export interface Shift {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
  startTime: string;
  endTime: string;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateShiftPayload {
  name: string;
  description?: string;
  startTime: string;
  endTime: string;
  isActive?: boolean;
}

export interface UpdateShiftPayload {
  name?: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  isActive?: boolean;
}

// ─── Subscriptions ────────────────────────────────────────────────────────────

export interface Subscription {
  id: string;
  title: string;
  description?: string | null;
  amount: number;
  durationDays: number;
  /** Days a term on this plan may be frozen for. 0 means it cannot be frozen. */
  freezeDays?: number;
  /** How many separate freezes that budget may be split across. */
  freezeCount?: number;
  isActive: boolean;
  badges: Pick<Badge, "id" | "name" | "color" | "icon" | "isActive">[];
}

export interface CreateSubscriptionPayload {
  title: string;
  description?: string;
  amount: number;
  durationDays?: number;
  freezeDays?: number;
  freezeCount?: number;
  badgeIds?: string[];
}

export interface UpdateSubscriptionPayload {
  title?: string;
  description?: string | null;
  amount?: number;
  durationDays?: number;
  freezeDays?: number;
  freezeCount?: number;
  isActive?: boolean;
  badgeIds?: string[];
}

// ─── Payments ─────────────────────────────────────────────────────────────────

export interface Payment {
  id: string;
  amount: number;
  status: PaymentStatus;
  paidAt?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
  description?: string | null;
  note?: string | null;
  createdAt: string;
  updatedAt?: string;
  member?: {
    id: string;
    memberId: number;
    userId: string;
    name: string;
    email: string;
    gender?: Gender | null;
    phone?: string | null;
    avatarUrl?: string | null;
    status?: AccountStatus;
    dueDate?: string | null;
  };
  collectedBy?: {
    id: string;
    userId: string;
    name: string;
    email: string;
    gender?: Gender | null;
    phone?: string | null;
    avatarUrl?: string | null;
  };
  subscription?: {
    id: string;
    title: string;
    amount?: number;
    durationDays?: number;
  };
  /** "RAZORPAY" for online payments; absent for cash and other manual entries. */
  gateway?: string | null;
  gatewayOrderId?: string | null;
  gatewayPaymentId?: string | null;
}

// ─── Payment gateway ──────────────────────────────────────────────────────────

/**
 * What the settings screen knows about a gym's gateway setup.
 *
 * Deliberately contains no secret. `keyId` is public — the checkout widget needs
 * it in the browser — and the two `has*` flags say only whether a secret is on
 * file, never what it is.
 */
export interface PaymentGatewayConfig {
  provider: "RAZORPAY";
  /** Whether an online payment can be taken right now, from either account. */
  enabled: boolean;
  /** TENANT when the gym collects into its own account, PLATFORM when it falls back. */
  source: "TENANT" | "PLATFORM" | null;
  /** The gym's own key id, if saved. */
  keyId: string | null;
  hasKeySecret: boolean;
  hasWebhookSecret: boolean;
  /** The key id money falls back to when the gym has not set up its own. */
  platformKeyId: string | null;
  platformConfigured: boolean;
  /** False when the API has no CREDENTIALS_KEY and so cannot store gym secrets. */
  canStoreOwnKeys: boolean;
  /** LIVE moves real money; TEST does not. Null when nothing is configured. */
  mode: "LIVE" | "TEST" | null;
}

export interface UpdateGatewayPayload {
  /** An empty string clears the gym's keys and returns it to the platform account. */
  keyId?: string;
  keySecret?: string;
  webhookSecret?: string;
}

/** Everything the browser needs to open Razorpay checkout for one payment. */
export interface CheckoutSession {
  paymentId: string;
  orderId: string;
  keyId: string;
  /** What the member pays: the plan plus any dues settled with it. */
  amount: number;
  currency: string;
  planTitle: string;
  /** The plan's own price, when the order also covers arrears. */
  planAmount?: number;
  outstandingAmount?: number;
  outstanding?: { id: string; amount: number; description?: string | null }[];
}

export interface VerifyCheckoutPayload {
  orderId: string;
  paymentId: string;
  signature: string;
}

// ─── Public self-signup ───────────────────────────────────────────────────────

/** What the public join form renders from: the gym and everything it offers. */
export interface SignupOptions {
  tenant: { id: string; name: string; slug: string; logoUrl?: string | null };
  plans: {
    id: string;
    title: string;
    description?: string | null;
    amount: number;
    durationDays: number;
  }[];
  charges: { id: string; name: string; amount: number; isMandatory: boolean }[];
  shifts: Shift[];
  /** False when the gym takes no cards yet — the signup then ends at the desk. */
  onlinePaymentsEnabled: boolean;
}

export interface SelfSignupPayload {
  name: string;
  email?: string;
  phone: string;
  gender: Gender;
  /** Required. Base64 data URL — there is no session to upload a file with. */
  avatarDataUrl: string;
  subscriptionId: string;
  chargeIds?: string[];
  /**
   * A joining offer. The code only — the server decides what it is worth, so
   * a browser can never name its own discount.
   */
  couponCode?: string;
  shiftId?: string;
  /**
   * How the joining fee is settled. Omitted means online, which is what every
   * client did before the choice existed. COUNTER creates the membership owing
   * the same money, with nothing sent to the gateway.
   */
  paymentMode?: "ONLINE" | "COUNTER";
  /**
   * Solved Turnstile token, verified server-side before the account is created.
   * Named as Cloudflare's widget posts it. Absent when the gym's deployment has
   * no Turnstile secret configured, in which case the API does not check it.
   */
  "cf-turnstile-response"?: string;
}

/**
 * The result of joining: an inactive membership, the bill, and — when the gym
 * takes cards — the order to pay it with. A null `checkout` means the member
 * was created and owes the money at the front desk.
 */
export interface SelfSignupResult {
  membership: { id: string; memberId: number; status: string };
  /**
   * A session for the account just created, so the app can sign the new member
   * in rather than sending them to a login form.
   */
  auth: { accessToken: string; refreshToken: string };
  loginEmail: string;
  total: number;
  lineItems: { description: string | null; amount: number }[];
  checkout: {
    orderId: string;
    keyId: string;
    amount: number;
    currency: string;
  } | null;
}

/**
 * A gym registering itself, instead of a platform admin creating it.
 *
 * Carries no status and no role: the server decides both. What the owner is
 * choosing here is the gym's identity, its public address, and their own login.
 */
export interface TenantSignupPayload {
  name: string;
  /** The gym's permanent public address, e.g. `rudra-gym` in `rudra-gym.fitconnect.co.in`. */
  slug: string;
  /** Required. Base64 data URL — there is no session to upload a file with. */
  logoDataUrl: string;
  email?: string;
  phone?: string;
  address?: string;
  description?: string;
  owner: {
    name: string;
    email: string;
    phone?: string;
    /** Required, for the same reason the gym's logo is. */
    avatarDataUrl: string;
    password: string;
  };
  /** Solved Turnstile token; absent when the deployment has none configured. */
  "cf-turnstile-response"?: string;
}

/**
 * The result of registering a gym: the gym itself, awaiting approval, and a
 * session for the owner so they land in their dashboard rather than at a
 * login form.
 */
export interface TenantSignupResult {
  tenant: { id: string; name: string; slug: string; status: string };
  auth: { accessToken: string; refreshToken: string };
  loginEmail: string;
}

/** Whether a gym address is free, and why not when it isn't. */
export interface TenantSlugCheck {
  slug: string;
  available: boolean;
  reason?: string;
}

export interface SignupVerifyResult {
  membership: {
    id: string;
    memberId: number;
    status: string;
    dueDate?: string | null;
  } | null;
  alreadySettled: boolean;
}

export interface PaymentSummary {
  id: string;
  amount: number;
  status: PaymentStatus;
  paidAt?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
  subscription?: { id: string; title: string };
}

export interface CreatePaymentPayload {
  membershipId: string;
  subscriptionId?: string;
  chargeId?: string;
  description?: string;
  note?: string;
  status?: "PENDING" | "COMPLETED";
  amount: number;
  /** Handed over now, when it is less than `amount`; the rest becomes a due. */
  paidAmount?: number;
  /** The code itself — the server prices it, never the client. */
  couponCode?: string;
  coinsToSpend?: number;
  /** Existing dues this collection settles alongside the plan. */
  settlePendingIds?: string[];
  validFrom?: string;
  validUntil?: string;
}

export interface UpdatePaymentPayload {
  amount?: number;
  description?: string;
  note?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
}

// ─── Platform Billing ─────────────────────────────────────────────────────────

export interface PlatformPayment {
  id: string;
  tenantId: string;
  amount: number;
  note?: string | null;
  extendsUntil: string;
  recordedBy: string;
  recordedByUser: { id: string; name: string };
  createdAt: string;
}

export interface RecordPlatformPaymentPayload {
  amount: number;
  note?: string;
  extendsUntil: string;
}

// ─── Workout Plans ────────────────────────────────────────────────────────────

export interface Product {
  id: string;
  name: string;
  description?: string | null;
  markdown?: string | null;
  photos: string[];
  videos: string[];
  category: string;
  price: number;
  stock: number;
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

export interface Exercise {
  name: string;
  sets?: number;
  reps?: number;
  durationMinutes?: number;
  notes?: string;
}

export interface WorkoutPlan {
  id: string;
  title: string;
  description?: string | null;
  exercises?: Exercise[];
  createdAt: string;
  updatedAt?: string;
  creator?: {
    id: string;
    name: string;
  };
  _count?: { assignments: number };
  assignments?: {
    id: string;
    assignedAt: string;
    membershipId: string;
    memberId: number;
    memberName: string;
  }[];
}

export interface CreateWorkoutPlanPayload {
  title: string;
  description?: string;
  exercises?: Exercise[];
}

export interface UpdateWorkoutPlanPayload {
  title?: string;
  description?: string;
  exercises?: Exercise[];
}

// ─── Audit Logs ───────────────────────────────────────────────────────────────

export interface AuditLog {
  id: string;
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  actorId?: string | null;
  tenantId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  createdAt: string;
  actor?: { id: string; name: string; email: string } | null;
}

// ─── Badges ───────────────────────────────────────────────────────────────────

export interface Badge {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
  color: string;
  icon?: string | null;
  /**
   * Whether handing this badge out needs `badges:assign:restricted`.
   *
   * For badges that confer standing rather than mark progress — a staff
   * credential, lifetime membership — which a coach should not be able to
   * grant or take away on the floor.
   */
  restricted: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
  _count?: { assignments: number };
}

export interface CreateBadgePayload {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  restricted?: boolean;
}

export interface UpdateBadgePayload {
  name?: string;
  description?: string;
  color?: string;
  icon?: string;
  restricted?: boolean;
  isActive?: boolean;
}

export interface AssignBadgePayload {
  membershipId: string;
}

export type WhatsAppTemplateKey =
  | "new_member_welcome"
  | "payment_reminder"
  | "pending_payment_reminder"
  | "payment_receipt";

export interface WhatsAppTemplate {
  key: WhatsAppTemplateKey;
  label: string;
  description: string;
  variables: string[];
  body: string;
  defaultBody: string;
  isCustom: boolean;
}

// ─── Tenant Settings ──────────────────────────────────────────────────────────

export interface TenantSettings {
  overdueDays: number;
  /** Coins the referrer earns on a referee's first subscription. 0 is off. */
  referralRewardCoins?: number;
  /** Coins the referred member earns at the same moment. */
  referralRefereeCoins?: number;
  whatsappTemplates: WhatsAppTemplate[];
  /**
   * Whether members can pay online, from either the gym's own gateway account
   * or the platform's. Readable by every member — it says nothing about which
   * account collects or what keys are behind it.
   */
  onlinePaymentsEnabled?: boolean;
}

export interface UpdateTenantSettingsPayload {
  overdueDays?: number;
  referralRewardCoins?: number;
  referralRefereeCoins?: number;
  whatsappTemplates?: Partial<Record<WhatsAppTemplateKey, string>>;
}

export interface TenantCharge {
  id: string;
  tenantId: string;
  name: string;
  amount: number;
  isMandatory: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateTenantChargePayload {
  name: string;
  amount: number;
  isMandatory?: boolean;
}

export interface UpdateTenantChargePayload {
  name?: string;
  amount?: number;
  isMandatory?: boolean;
  isActive?: boolean;
}

// ─── Attendance ───────────────────────────────────────────────────────────────

export interface TodoActor {
  membershipId: string;
  userId: string;
  memberId: number;
  name: string;
  avatarUrl?: string | null;
  role: string;
}

export interface Todo {
  id: string;
  tenantId: string;
  title: string;
  description?: string | null;
  visibility: TodoVisibility;
  isCompleted: boolean;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: TodoActor | null;
  updatedBy?: TodoActor | null;
  completedBy?: TodoActor | null;
}

export interface CreateTodoPayload {
  title: string;
  description?: string;
  visibility?: TodoVisibility;
}

export interface UpdateTodoPayload {
  title?: string;
  description?: string | null;
  visibility?: TodoVisibility;
  isCompleted?: boolean;
}

export interface AttendanceRecord {
  id: string;
  date: string;
  checkInAt: string;
  note?: string | null;
  membershipId?: string;
  memberId?: number;
  memberName?: string;
  memberAvatarUrl?: string | null;
  markedBy?: { id: string; name: string } | null;
}

export interface AttendanceSummary {
  thisMonth: number;
  thisWeek: number;
}

export interface MarkAttendancePayload {
  membershipId?: string;
  date?: string;
  note?: string;
}

export interface MarkAllAttendancePayload {
  membershipIds: string[];
  date?: string;
}

// ─── Coupons & coins ──────────────────────────────────────────────────────────

/** What a coupon gives. Only the fields for its own type are ever read. */
export type CouponType = "DISCOUNT" | "COINS" | "VALIDITY";

export interface Coupon {
  id: string;
  code: string;
  description?: string | null;
  type: CouponType;

  percentOff?: number | null;
  amountOff?: number | null;
  maxDiscount?: number | null;
  coinsGranted?: number | null;
  bonusDays?: number | null;

  firstTimeOnly: boolean;
  gender?: Gender | null;
  minAmount?: number | null;
  badges: { id: string; name: string; color: string; icon?: string | null }[];
  subscriptions: { id: string; title: string }[];

  maxRedemptions?: number | null;
  redemptionCount: number;
  maxPerMember: number;
  startsAt?: string | null;
  endsAt?: string | null;
  isActive: boolean;
  createdAt: string;
  _count: { redemptions: number };
}

export interface CouponPayload {
  code: string;
  description?: string;
  type: CouponType;
  percentOff?: number | null;
  amountOff?: number | null;
  maxDiscount?: number | null;
  coinsGranted?: number | null;
  bonusDays?: number | null;
  firstTimeOnly?: boolean;
  gender?: Gender | null;
  minAmount?: number | null;
  badgeIds?: string[];
  subscriptionIds?: string[];
  maxRedemptions?: number | null;
  maxPerMember?: number;
  startsAt?: string | null;
  endsAt?: string | null;
  isActive?: boolean;
}

export interface CouponRedemption {
  id: string;
  discountAmount: number;
  coinsGranted: number;
  bonusDays: number;
  reversedAt?: string | null;
  createdAt: string;
  membership: { id: string; memberId: number; user: { name: string } };
}

/** What a purchase costs once a coupon and any coins are applied. */
export interface CouponQuote {
  listAmount: number;
  discountAmount: number;
  coinsRedeemed: number;
  netAmount: number;
  bonusDays: number;
  coinsGranted: number;
  coupon: {
    id: string;
    code: string;
    type: CouponType;
    description?: string | null;
  } | null;
}

export interface CoinEntry {
  id: string;
  amount: number;
  reason: string;
  note?: string | null;
  createdAt: string;
}


// ─── Membership freezes ───────────────────────────────────────────────────────

export interface MembershipFreeze {
  id: string;
  startsOn: string;
  plannedEndsOn: string;
  endedOn?: string | null;
  daysUsed: number;
  reason?: string | null;
  /** "ENDED_EARLY" | "ATTENDED", or null when it ran its course. */
  endedBy?: string | null;
  createdAt: string;
}

/** Everything a screen needs to decide whether to offer a freeze. */
export interface FreezeStatus {
  canFreeze: boolean;
  reason?: string | null;
  planTitle?: string;
  allowanceDays: number;
  usedDays: number;
  remainingDays: number;
  allowedFreezes: number;
  usedFreezes: number;
  currentFreeze: MembershipFreeze | null;
  history: MembershipFreeze[];
  termEndsOn?: string | null;
}

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
