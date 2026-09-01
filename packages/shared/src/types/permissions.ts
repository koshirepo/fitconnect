/**
 * Documentation: Fine-grained permission catalog.
 *
 * - Defines every discrete capability the API can authorize, plus the static role-to-permission grants for platform roles and tenant roles.
 * - Routes and UI must gate on permissions from this file rather than comparing role strings, so a policy change happens in exactly one place.
 * - Permissions are derived from roles at request time and are never embedded in the JWT, so revoking a capability takes effect on the next request instead of the next token refresh.
 * - Primary exports: Permission, PLATFORM_ROLE_PERMISSIONS, TENANT_ROLE_PERMISSIONS, resolvePermissions, hasPermission, hasAnyPermission, hasAllPermissions.
 */
import { PlatformRole, TenantRole } from "./enums";

// ─── Permission Catalog ───────────────────────────────────────────────────────
// Naming convention: "<resource>:<action>[:<qualifier>]".
// The ":self" qualifier means the actor may only reach their own records; the
// service layer still enforces the ownership filter, this only opens the door.

export const Permission = {
  // Tenant profile
  TENANT_READ: "tenant:read",
  TENANT_UPDATE: "tenant:update",

  // Members
  MEMBERS_READ: "members:read",
  MEMBERS_READ_DETAIL: "members:read:detail",
  MEMBERS_CREATE: "members:create",
  MEMBERS_UPDATE: "members:update",
  MEMBERS_DELETE: "members:delete",
  MEMBERS_ROLE_UPDATE: "members:role:update",
  MEMBERS_STATUS_UPDATE: "members:status:update",
  MEMBERS_PASSWORD_RESET: "members:password:reset",
  MEMBERS_REPORT_GENERATE: "members:report:generate",
  MEMBERS_REFERRALS_READ: "members:referrals:read",

  // Own membership profile
  PROFILE_READ_SELF: "profile:read:self",
  PROFILE_UPDATE_SELF: "profile:update:self",

  // Attendance
  ATTENDANCE_READ: "attendance:read",
  ATTENDANCE_READ_SELF: "attendance:read:self",
  ATTENDANCE_CHECKIN_SELF: "attendance:checkin:self",
  ATTENDANCE_MARK: "attendance:mark",
  ATTENDANCE_DELETE: "attendance:delete",
  ATTENDANCE_CALENDAR_READ: "attendance:calendar:read",
  ATTENDANCE_QR_MANAGE: "attendance:qr:manage",

  // Payments
  PAYMENTS_READ: "payments:read",
  PAYMENTS_READ_SELF: "payments:read:self",
  PAYMENTS_CREATE: "payments:create",
  /**
   * Settle a payment that is still pending — approve the money as received, or
   * mark that it never arrived. Separate from `PAYMENTS_UPDATE` because taking
   * cash at the desk is floor work, while rewriting an amount or a validity
   * window, or refunding, is the gym's own books.
   */
  PAYMENTS_SETTLE: "payments:settle",
  PAYMENTS_UPDATE: "payments:update",
  PAYMENTS_DELETE: "payments:delete",
  PAYMENTS_ANALYTICS_READ: "payments:analytics:read",
  /** Start an online payment for oneself through the gym's payment gateway. */
  PAYMENTS_CHECKOUT_SELF: "payments:checkout:self",
  /** See which gateway account the gym collects into, and its public key id. */
  PAYMENTS_GATEWAY_READ: "payments:gateway:read",
  /** Replace the gym's own gateway credentials. Never reveals the secret. */
  PAYMENTS_GATEWAY_UPDATE: "payments:gateway:update",

  // Subscriptions (tenant plans)
  SUBSCRIPTIONS_READ: "subscriptions:read",
  SUBSCRIPTIONS_CREATE: "subscriptions:create",
  SUBSCRIPTIONS_UPDATE: "subscriptions:update",
  SUBSCRIPTIONS_DELETE: "subscriptions:delete",

  // Workout plans
  WORKOUTS_READ: "workouts:read",
  WORKOUTS_CREATE: "workouts:create",
  WORKOUTS_UPDATE: "workouts:update",
  WORKOUTS_DELETE: "workouts:delete",
  WORKOUTS_ASSIGN: "workouts:assign",

  /// Freeze or unfreeze a membership. A desk action, not a plan-editing one.
  MEMBERS_FREEZE: "members:freeze",
  /// Freeze their own membership. Opens the door; the controller still checks
  /// the membership belongs to the caller.
  MEMBERS_FREEZE_SELF: "members:freeze:self",

  // Coupons
  COUPONS_READ: "coupons:read",
  COUPONS_CREATE: "coupons:create",
  COUPONS_UPDATE: "coupons:update",
  COUPONS_DELETE: "coupons:delete",
  /// Apply a coupon or spend coins while taking a payment.
  COUPONS_APPLY: "coupons:apply",

  // Gym store
  STORE_READ: "store:read",
  STORE_MANAGE: "store:manage",
  /// Buy from the gym store for oneself.
  STORE_BUY_SELF: "store:buy:self",
  /// Ring up a sale for a member at the counter.
  STORE_SELL: "store:sell",
  /// See what the gym has sold, beyond one's own purchases.
  STORE_ORDERS_READ: "store:orders:read",

  // Badges
  BADGES_READ: "badges:read",
  BADGES_CREATE: "badges:create",
  BADGES_UPDATE: "badges:update",
  BADGES_DELETE: "badges:delete",
  BADGES_ASSIGN: "badges:assign",
  /** Assigning a badge its gym marked restricted — see `Badge.restricted`. */
  BADGES_ASSIGN_RESTRICTED: "badges:assign:restricted",
  BADGES_ASSIGNMENTS_READ: "badges:assignments:read",

  // Todos
  TODOS_READ: "todos:read",
  TODOS_CREATE: "todos:create",
  TODOS_UPDATE: "todos:update",
  TODOS_DELETE: "todos:delete",

  // Tenant settings and charges
  SETTINGS_READ: "settings:read",
  SETTINGS_UPDATE: "settings:update",
  CHARGES_READ: "charges:read",
  CHARGES_CREATE: "charges:create",
  CHARGES_UPDATE: "charges:update",
  CHARGES_DELETE: "charges:delete",

  // Shifts
  SHIFTS_READ: "shifts:read",
  SHIFTS_CREATE: "shifts:create",
  SHIFTS_UPDATE: "shifts:update",
  SHIFTS_DELETE: "shifts:delete",

  // Role administration (tenant scope)
  ROLES_READ: "roles:read",
  ROLES_UPDATE: "roles:update",

  // Audit
  AUDIT_TENANT_READ: "audit:tenant:read",
  AUDIT_PLATFORM_READ: "audit:platform:read",

  // Account-level capabilities (available to every authenticated user)
  ORDERS_READ_SELF: "orders:read:self",
  REVIEWS_VOTE: "reviews:vote",
  UPLOADS_WRITE: "uploads:write",
  PUSH_SUBSCRIBE: "push:subscribe",

  // Platform administration
  PLATFORM_TENANTS_READ: "platform:tenants:read",
  PLATFORM_TENANTS_CREATE: "platform:tenants:create",
  PLATFORM_TENANTS_STATUS_UPDATE: "platform:tenants:status:update",
  PLATFORM_PAYMENTS_READ: "platform:payments:read",
  PLATFORM_PAYMENTS_CREATE: "platform:payments:create",
  PLATFORM_USERS_CREATE: "platform:users:create",
  PLATFORM_PRODUCTS_READ: "platform:products:read",
  PLATFORM_PRODUCTS_CREATE: "platform:products:create",
  PLATFORM_PRODUCTS_UPDATE: "platform:products:update",
  PLATFORM_PRODUCTS_DELETE: "platform:products:delete",
  PLATFORM_ORDERS_READ: "platform:orders:read",
  PLATFORM_ORDERS_UPDATE: "platform:orders:update",
  PLATFORM_ORDERS_DELETE: "platform:orders:delete",
  PLATFORM_ROLES_READ: "platform:roles:read",
  PLATFORM_ROLES_UPDATE: "platform:roles:update",
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

export const ALL_PERMISSIONS = Object.values(Permission) as Permission[];

function dedupe(permissions: Permission[]): Permission[] {
  return Array.from(new Set(permissions));
}

// ─── Tenant role grants ───────────────────────────────────────────────────────

/** Capabilities every tenant member holds, regardless of role. */
const MEMBER_PERMISSIONS: Permission[] = [
  Permission.TENANT_READ,
  Permission.MEMBERS_READ_DETAIL,
  Permission.PROFILE_READ_SELF,
  Permission.PROFILE_UPDATE_SELF,
  Permission.ATTENDANCE_READ_SELF,
  Permission.ATTENDANCE_CHECKIN_SELF,
  Permission.PAYMENTS_READ_SELF,
  Permission.PAYMENTS_CHECKOUT_SELF,
  Permission.SUBSCRIPTIONS_READ,
  Permission.WORKOUTS_READ,
  Permission.BADGES_READ,
  Permission.MEMBERS_FREEZE_SELF,
  Permission.COUPONS_READ,
  Permission.STORE_READ,
  Permission.STORE_BUY_SELF,
  Permission.SETTINGS_READ,
  Permission.SHIFTS_READ,
];

/** Coaches add day-to-day floor operations on top of the member baseline. */
const COACH_PERMISSIONS: Permission[] = [
  ...MEMBER_PERMISSIONS,
  Permission.COUPONS_APPLY,
  Permission.STORE_SELL,
  Permission.STORE_ORDERS_READ,
  Permission.MEMBERS_FREEZE,
  Permission.MEMBERS_READ,
  Permission.MEMBERS_CREATE,
  Permission.MEMBERS_UPDATE,
  Permission.MEMBERS_REFERRALS_READ,
  Permission.ATTENDANCE_READ,
  Permission.ATTENDANCE_MARK,
  Permission.ATTENDANCE_CALENDAR_READ,
  Permission.ATTENDANCE_QR_MANAGE,
  Permission.PAYMENTS_READ,
  Permission.PAYMENTS_CREATE,
  Permission.PAYMENTS_SETTLE,
  Permission.WORKOUTS_CREATE,
  Permission.WORKOUTS_UPDATE,
  Permission.WORKOUTS_ASSIGN,
  Permission.BADGES_ASSIGN,
  Permission.BADGES_ASSIGNMENTS_READ,
  Permission.TODOS_READ,
  Permission.TODOS_CREATE,
  Permission.TODOS_UPDATE,
  Permission.TODOS_DELETE,
  Permission.CHARGES_READ,
];

/** Tenant admins hold every tenant-scoped capability. */
const ADMIN_PERMISSIONS: Permission[] = [
  ...COACH_PERMISSIONS,
  Permission.COUPONS_CREATE,
  Permission.COUPONS_UPDATE,
  Permission.COUPONS_DELETE,
  Permission.STORE_MANAGE,
  Permission.TENANT_UPDATE,
  Permission.MEMBERS_DELETE,
  Permission.MEMBERS_ROLE_UPDATE,
  Permission.MEMBERS_STATUS_UPDATE,
  Permission.MEMBERS_PASSWORD_RESET,
  Permission.MEMBERS_REPORT_GENERATE,
  Permission.ATTENDANCE_DELETE,
  Permission.PAYMENTS_UPDATE,
  Permission.PAYMENTS_DELETE,
  Permission.PAYMENTS_ANALYTICS_READ,
  Permission.PAYMENTS_GATEWAY_READ,
  Permission.PAYMENTS_GATEWAY_UPDATE,
  Permission.SUBSCRIPTIONS_CREATE,
  Permission.SUBSCRIPTIONS_UPDATE,
  Permission.SUBSCRIPTIONS_DELETE,
  Permission.WORKOUTS_DELETE,
  Permission.BADGES_CREATE,
  Permission.BADGES_UPDATE,
  Permission.BADGES_DELETE,
  Permission.BADGES_ASSIGN_RESTRICTED,
  Permission.SETTINGS_UPDATE,
  Permission.CHARGES_CREATE,
  Permission.CHARGES_UPDATE,
  Permission.CHARGES_DELETE,
  Permission.SHIFTS_CREATE,
  Permission.SHIFTS_UPDATE,
  Permission.SHIFTS_DELETE,
  Permission.AUDIT_TENANT_READ,
  Permission.ROLES_READ,
  Permission.ROLES_UPDATE,
];

export const TENANT_ROLE_PERMISSIONS: Record<TenantRole, readonly Permission[]> = {
  [TenantRole.MEMBER]: dedupe(MEMBER_PERMISSIONS),
  [TenantRole.COACH]: dedupe(COACH_PERMISSIONS),
  [TenantRole.ADMIN]: dedupe(ADMIN_PERMISSIONS),
};

// ─── Platform role grants ─────────────────────────────────────────────────────

/** Capabilities that belong to any signed-in account, tenant membership or not. */
const ACCOUNT_PERMISSIONS: Permission[] = [
  Permission.ORDERS_READ_SELF,
  Permission.REVIEWS_VOTE,
  Permission.UPLOADS_WRITE,
  Permission.PUSH_SUBSCRIBE,
];

/** Read-only cross-tenant visibility granted to platform support staff. */
const TENANT_READ_ONLY_PERMISSIONS: Permission[] = [
  Permission.TENANT_READ,
  Permission.MEMBERS_READ,
  Permission.MEMBERS_READ_DETAIL,
  Permission.MEMBERS_REFERRALS_READ,
  Permission.ATTENDANCE_READ,
  Permission.ATTENDANCE_CALENDAR_READ,
  Permission.PAYMENTS_READ,
  Permission.PAYMENTS_ANALYTICS_READ,
  Permission.SUBSCRIPTIONS_READ,
  Permission.WORKOUTS_READ,
  Permission.BADGES_READ,
  Permission.BADGES_ASSIGNMENTS_READ,
  Permission.TODOS_READ,
  Permission.SETTINGS_READ,
  Permission.CHARGES_READ,
  Permission.SHIFTS_READ,
  Permission.AUDIT_TENANT_READ,
  Permission.ROLES_READ,
];

const SUPPORT_PERMISSIONS: Permission[] = [
  ...ACCOUNT_PERMISSIONS,
  ...TENANT_READ_ONLY_PERMISSIONS,
  Permission.AUDIT_PLATFORM_READ,
  Permission.PLATFORM_ROLES_READ,
  Permission.PLATFORM_TENANTS_READ,
  Permission.PLATFORM_PAYMENTS_READ,
  Permission.PLATFORM_PRODUCTS_READ,
  Permission.PLATFORM_PRODUCTS_CREATE,
  Permission.PLATFORM_PRODUCTS_UPDATE,
  Permission.PLATFORM_PRODUCTS_DELETE,
];

export const PLATFORM_ROLE_PERMISSIONS: Record<PlatformRole, readonly Permission[]> = {
  // A plain account holds no tenant capability by itself — those come from the
  // tenant membership role resolved per request.
  [PlatformRole.USER]: dedupe(ACCOUNT_PERMISSIONS),
  [PlatformRole.SUPPORT]: dedupe(SUPPORT_PERMISSIONS),
  [PlatformRole.SUPER_ADMIN]: ALL_PERMISSIONS,
};

/** Platform roles that may act inside any tenant without holding a membership. */
export const PLATFORM_STAFF_ROLES: readonly PlatformRole[] = [
  PlatformRole.SUPER_ADMIN,
  PlatformRole.SUPPORT,
];

export function isPlatformStaffRole(role: PlatformRole | null | undefined) {
  return Boolean(role) && PLATFORM_STAFF_ROLES.includes(role as PlatformRole);
}

// ─── Resolution helpers ───────────────────────────────────────────────────────

/**
 * Build the effective permission set for an actor.
 * Platform-role grants and tenant-role grants are unioned so platform staff keep
 * cross-tenant reach while tenant members stay scoped to their own gym.
 */
export function resolvePermissions(input: {
  platformRole?: PlatformRole | null;
  tenantRole?: TenantRole | null;
  overrides?: readonly RolePermissionOverride[];
}): Set<Permission> {
  return resolveEffectivePermissions(input);
}

// ─── Runtime overrides ────────────────────────────────────────────────────────
// The maps above are the baseline. Platform staff and gym admins can layer
// grants/revocations on top through the role-management endpoints; those rows
// are applied here so every consumer resolves permissions the same way.

export type PermissionScope = "PLATFORM" | "TENANT";

export type RolePermissionOverride = {
  scope: PermissionScope;
  role: string;
  permission: string;
  allowed: boolean;
};

/**
 * Permissions that can never be revoked from a role, because removing them
 * would lock the role out of the screen that grants permissions back.
 */
export const LOCKED_ROLE_PERMISSIONS: Record<string, readonly Permission[]> = {
  [TenantRole.ADMIN]: [Permission.TENANT_READ, Permission.ROLES_READ, Permission.ROLES_UPDATE],
  [TenantRole.COACH]: [Permission.PROFILE_READ_SELF],
  [TenantRole.MEMBER]: [Permission.PROFILE_READ_SELF],
  [PlatformRole.SUPPORT]: [Permission.PLATFORM_TENANTS_READ],
};

/** Roles whose permission set is fixed and not editable through the UI. */
export const IMMUTABLE_ROLES: readonly string[] = [PlatformRole.SUPER_ADMIN];

/**
 * Permissions a gym admin may tune for their own gym.
 * Platform-scoped capabilities are excluded so a tenant cannot grant itself
 * cross-tenant reach.
 */
export const TENANT_MANAGEABLE_PERMISSIONS: readonly Permission[] = ALL_PERMISSIONS.filter(
  (permission) => !permission.startsWith("platform:"),
);

function isLocked(role: string, permission: Permission) {
  return (LOCKED_ROLE_PERMISSIONS[role] ?? []).includes(permission);
}

/**
 * Apply override rows to a role's baseline permission list.
 * Locked permissions survive a revoke so a role can never be stranded, and
 * immutable roles ignore overrides entirely.
 * Rows are applied in array order, so callers must pass platform-wide defaults
 * before gym-specific rows for the gym-specific ones to win.
 */
export function applyOverrides(
  scope: PermissionScope,
  role: string,
  baseline: readonly Permission[],
  overrides: readonly RolePermissionOverride[],
): Permission[] {
  if (IMMUTABLE_ROLES.includes(role)) {
    return [...baseline];
  }

  const effective = new Set<Permission>(baseline);

  for (const override of overrides) {
    if (override.scope !== scope || override.role !== role) continue;
    const permission = override.permission as Permission;
    if (!ALL_PERMISSIONS.includes(permission)) continue;

    if (override.allowed) {
      effective.add(permission);
    } else if (!isLocked(role, permission)) {
      effective.delete(permission);
    }
  }

  return Array.from(effective);
}

/**
 * Baseline permissions for a role, before overrides.
 * Returns an empty list for an unrecognized role rather than throwing, so a
 * stale role value in the database cannot take the request path down.
 */
export function baselinePermissions(scope: PermissionScope, role: string): readonly Permission[] {
  if (scope === "PLATFORM") {
    return PLATFORM_ROLE_PERMISSIONS[role as PlatformRole] ?? [];
  }
  return TENANT_ROLE_PERMISSIONS[role as TenantRole] ?? [];
}

/**
 * Build the effective permission set for an actor, applying override rows.
 * Tenant-scoped overrides for the acting gym are layered over platform-wide
 * defaults, which are in turn layered over the static catalog.
 */
export function resolveEffectivePermissions(input: {
  platformRole?: PlatformRole | null;
  tenantRole?: TenantRole | null;
  overrides?: readonly RolePermissionOverride[];
}): Set<Permission> {
  const overrides = input.overrides ?? [];
  const set = new Set<Permission>();

  if (input.platformRole) {
    for (const permission of applyOverrides(
      "PLATFORM",
      input.platformRole,
      baselinePermissions("PLATFORM", input.platformRole),
      overrides,
    )) {
      set.add(permission);
    }
  }

  if (input.tenantRole) {
    for (const permission of applyOverrides(
      "TENANT",
      input.tenantRole,
      baselinePermissions("TENANT", input.tenantRole),
      overrides,
    )) {
      set.add(permission);
    }
  }

  return set;
}

export function hasPermission(granted: ReadonlySet<Permission>, permission: Permission) {
  return granted.has(permission);
}

export function hasAnyPermission(
  granted: ReadonlySet<Permission>,
  permissions: readonly Permission[],
) {
  return permissions.some((permission) => granted.has(permission));
}

export function hasAllPermissions(
  granted: ReadonlySet<Permission>,
  permissions: readonly Permission[],
) {
  return permissions.every((permission) => granted.has(permission));
}

/** Human-readable labels for permission listings in admin UIs. */
export const PERMISSION_LABELS: Record<string, string> = {
  [Permission.TENANT_READ]: "View gym profile",
  [Permission.TENANT_UPDATE]: "Edit gym profile",
  [Permission.MEMBERS_READ]: "View member list",
  [Permission.MEMBERS_READ_DETAIL]: "View member details",
  [Permission.MEMBERS_CREATE]: "Add members",
  [Permission.MEMBERS_UPDATE]: "Edit members",
  [Permission.MEMBERS_DELETE]: "Remove members",
  [Permission.MEMBERS_ROLE_UPDATE]: "Change member roles",
  [Permission.MEMBERS_STATUS_UPDATE]: "Change member status",
  [Permission.MEMBERS_PASSWORD_RESET]: "Reset member passwords",
  [Permission.MEMBERS_REPORT_GENERATE]: "Generate member reports",
  [Permission.MEMBERS_REFERRALS_READ]: "View referrals",
  [Permission.PROFILE_READ_SELF]: "View own profile",
  [Permission.PROFILE_UPDATE_SELF]: "Edit own profile",
  [Permission.ATTENDANCE_READ]: "View gym attendance",
  [Permission.ATTENDANCE_READ_SELF]: "View own attendance",
  [Permission.ATTENDANCE_CHECKIN_SELF]: "Check in",
  [Permission.ATTENDANCE_MARK]: "Mark attendance for members",
  [Permission.ATTENDANCE_DELETE]: "Delete attendance records",
  [Permission.ATTENDANCE_CALENDAR_READ]: "View attendance calendar",
  [Permission.ATTENDANCE_QR_MANAGE]: "Run QR check-in",
  [Permission.PAYMENTS_READ]: "View all payments",
  [Permission.PAYMENTS_READ_SELF]: "View own payments",
  [Permission.PAYMENTS_CREATE]: "Record payments",
  [Permission.PAYMENTS_SETTLE]: "Approve or reject pending payments",
  [Permission.PAYMENTS_UPDATE]: "Edit payments",
  [Permission.PAYMENTS_DELETE]: "Delete payments",
  [Permission.PAYMENTS_ANALYTICS_READ]: "View finance reports",
  [Permission.PAYMENTS_CHECKOUT_SELF]: "Pay online for own membership",
  [Permission.PAYMENTS_GATEWAY_READ]: "View payment gateway setup",
  [Permission.PAYMENTS_GATEWAY_UPDATE]: "Change payment gateway keys",
  [Permission.STORE_READ]: "Browse the gym store",
  [Permission.STORE_MANAGE]: "Manage store products and stock",
  [Permission.STORE_BUY_SELF]: "Buy from the gym store",
  [Permission.STORE_SELL]: "Sell at the counter",
  [Permission.STORE_ORDERS_READ]: "View store sales",
  [Permission.SUBSCRIPTIONS_READ]: "View plans",
  [Permission.SUBSCRIPTIONS_CREATE]: "Create plans",
  [Permission.SUBSCRIPTIONS_UPDATE]: "Edit plans",
  [Permission.SUBSCRIPTIONS_DELETE]: "Delete plans",
  [Permission.WORKOUTS_READ]: "View workout plans",
  [Permission.WORKOUTS_CREATE]: "Create workout plans",
  [Permission.WORKOUTS_UPDATE]: "Edit workout plans",
  [Permission.WORKOUTS_DELETE]: "Delete workout plans",
  [Permission.WORKOUTS_ASSIGN]: "Assign workout plans",
  [Permission.BADGES_READ]: "View badges",
  [Permission.BADGES_CREATE]: "Create badges",
  [Permission.BADGES_UPDATE]: "Edit badges",
  [Permission.BADGES_DELETE]: "Delete badges",
  [Permission.BADGES_ASSIGN]: "Assign badges",
  [Permission.BADGES_ASSIGN_RESTRICTED]: "Assign restricted badges",
  [Permission.BADGES_ASSIGNMENTS_READ]: "View badge assignments",
  [Permission.TODOS_READ]: "View todos",
  [Permission.TODOS_CREATE]: "Create todos",
  [Permission.TODOS_UPDATE]: "Edit todos",
  [Permission.TODOS_DELETE]: "Delete todos",
  [Permission.SETTINGS_READ]: "View gym settings",
  [Permission.SETTINGS_UPDATE]: "Edit gym settings",
  [Permission.CHARGES_READ]: "View extra charges",
  [Permission.CHARGES_CREATE]: "Create extra charges",
  [Permission.CHARGES_UPDATE]: "Edit extra charges",
  [Permission.CHARGES_DELETE]: "Delete extra charges",
  [Permission.SHIFTS_READ]: "View shifts",
  [Permission.SHIFTS_CREATE]: "Create shifts",
  [Permission.SHIFTS_UPDATE]: "Edit shifts",
  [Permission.SHIFTS_DELETE]: "Delete shifts",
  [Permission.ROLES_READ]: "View gym roles and permissions",
  [Permission.ROLES_UPDATE]: "Edit gym role permissions",
  [Permission.AUDIT_TENANT_READ]: "View gym audit log",
  [Permission.AUDIT_PLATFORM_READ]: "View platform audit log",
  [Permission.ORDERS_READ_SELF]: "View own orders",
  [Permission.REVIEWS_VOTE]: "Vote on reviews",
  [Permission.UPLOADS_WRITE]: "Upload files",
  [Permission.PUSH_SUBSCRIBE]: "Manage push notifications",
  [Permission.PLATFORM_TENANTS_READ]: "View tenants",
  [Permission.PLATFORM_TENANTS_CREATE]: "Create tenants",
  [Permission.PLATFORM_TENANTS_STATUS_UPDATE]: "Change tenant status",
  [Permission.PLATFORM_PAYMENTS_READ]: "View platform payments",
  [Permission.PLATFORM_PAYMENTS_CREATE]: "Record platform payments",
  [Permission.PLATFORM_USERS_CREATE]: "Create platform users",
  [Permission.PLATFORM_PRODUCTS_READ]: "View platform products",
  [Permission.PLATFORM_PRODUCTS_CREATE]: "Create platform products",
  [Permission.PLATFORM_PRODUCTS_UPDATE]: "Edit platform products",
  [Permission.PLATFORM_PRODUCTS_DELETE]: "Delete platform products",
  [Permission.PLATFORM_ORDERS_READ]: "View platform orders",
  [Permission.PLATFORM_ORDERS_UPDATE]: "Update platform orders",
  [Permission.PLATFORM_ORDERS_DELETE]: "Delete platform orders",
  [Permission.PLATFORM_ROLES_READ]: "View platform roles and permissions",
  [Permission.PLATFORM_ROLES_UPDATE]: "Edit platform role permissions",
};

/** Grouping used by the role-management screens to render the permission list. */
export const PERMISSION_GROUPS: { key: string; label: string; prefixes: string[] }[] = [
  { key: "tenant", label: "Gym profile", prefixes: ["tenant:"] },
  { key: "members", label: "Members", prefixes: ["members:", "profile:"] },
  { key: "attendance", label: "Attendance", prefixes: ["attendance:"] },
  { key: "payments", label: "Payments & plans", prefixes: ["payments:", "subscriptions:", "charges:"] },
  { key: "workouts", label: "Workouts", prefixes: ["workouts:"] },
  { key: "coupons", label: "Coupons & coins", prefixes: ["coupons:"] },
  { key: "store", label: "Gym store", prefixes: ["store:"] },
  { key: "badges", label: "Badges", prefixes: ["badges:"] },
  { key: "todos", label: "Todos", prefixes: ["todos:"] },
  { key: "operations", label: "Settings, shifts & roles", prefixes: ["settings:", "shifts:", "roles:"] },
  { key: "audit", label: "Audit", prefixes: ["audit:"] },
  { key: "account", label: "Account", prefixes: ["orders:", "reviews:", "uploads:", "push:"] },
  { key: "platform", label: "Platform administration", prefixes: ["platform:"] },
];

/** Resolve the group a permission belongs to, for grouped rendering. */
export function permissionGroupKey(permission: string) {
  const group = PERMISSION_GROUPS.find((candidate) =>
    candidate.prefixes.some((prefix) => permission.startsWith(prefix)),
  );
  return group?.key ?? "other";
}
