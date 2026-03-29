import type {
  PlatformRole,
  TenantRole,
  AccountStatus,
  PaymentStatus,
  OrderStatus,
  AuditAction,
} from "./enums";

// ─── User / Auth ──────────────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  avatarUrl?: string | null;
  platformRole: PlatformRole;
  status?: AccountStatus;
  createdAt?: string;
  membership?: TenantMembershipSummary;
}

export interface TenantMembershipSummary {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  role: TenantRole;
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
  email?: string;
  phone?: string;
  address?: string;
  logoUrl?: string;
  markdown?: string;
  description?: string;
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
  phone?: string | null;
  avatarUrl?: string | null;
  role: TenantRole;
  status: AccountStatus;
  joinedAt: string;
  isDue?: boolean;
  dueDate?: string | null;
  shift?: Shift | null;
}

export interface TenantProfile {
  id: string;
  memberId: number;
  userId: string;
  name: string;
  email: string;
  phone?: string | null;
  avatarUrl?: string | null;
  userCreatedAt: string;
  role: TenantRole;
  status: AccountStatus;
  joinedAt: string;
  shift?: Shift | null;
  payments?: PaymentSummary[];
}

export interface AddMemberPayload {
  name: string;
  email: string;
  phone: string;
  role?: TenantRole;
  avatarUrl?: string;
  subscriptionId?: string;
  chargeIds?: string[];
  shiftId?: string;
  referredByMembershipId?: string;
}

export interface UpdateProfilePayload {
  name?: string;
  phone?: string | null;
  avatarUrl?: string | null;
  currentPassword?: string;
  newPassword?: string;
}

export interface UpdateMemberPayload {
  name?: string;
  phone?: string | null;
  avatarUrl?: string | null;
  newPassword?: string;
  shiftId?: string | null;
}

export interface MemberDetail {
  id: string;
  memberId: number;
  userId: string;
  name: string;
  email: string;
  phone?: string | null;
  avatarUrl?: string | null;
  userCreatedAt: string;
  role: TenantRole;
  status: AccountStatus;
  joinedAt: string;
  shift?: Shift | null;
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
  isActive: boolean;
}

export interface CreateSubscriptionPayload {
  title: string;
  description?: string;
  amount: number;
  durationDays?: number;
}

export interface UpdateSubscriptionPayload {
  title?: string;
  description?: string | null;
  amount?: number;
  durationDays?: number;
  isActive?: boolean;
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
    phone?: string | null;
    avatarUrl?: string | null;
  };
  collectedBy?: {
    id: string;
    userId: string;
    name: string;
    email: string;
    phone?: string | null;
  };
  subscription?: {
    id: string;
    title: string;
    amount?: number;
    durationDays?: number;
  };
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

// ─── Tenant Settings ──────────────────────────────────────────────────────────

export interface TenantSettings {
  overdueDays: number;
}

export interface UpdateTenantSettingsPayload {
  overdueDays?: number;
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
