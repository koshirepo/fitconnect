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
  amount: number;
  currency: string;
  planTitle: string;
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
  shiftId?: string;
}

/**
 * The result of joining: an inactive membership, the bill, and — when the gym
 * takes cards — the order to pay it with. A null `checkout` means the member
 * was created and owes the money at the front desk.
 */
export interface SelfSignupResult {
  membership: { id: string; memberId: number; status: string };
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
  status: OrderStatus;
  subtotalAmount: number;
  gstRatePct: number;
  gstAmount: number;
  totalAmount: number;
  createdAt: string;
  updatedAt?: string;
  items: OrderItem[];
}

export interface PlaceOrderPayload {
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  buyerAddress: string;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
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
}

export interface UpdateBadgePayload {
  name?: string;
  description?: string;
  color?: string;
  icon?: string;
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
