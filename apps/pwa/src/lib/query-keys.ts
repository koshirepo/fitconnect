/**
 * Documentation: Query key factory.
 *
 * - Central registry of TanStack Query cache keys so invalidation targets the same tuples the hooks subscribe with.
 * - Every tenant-scoped key carries the tenant id as its second element, which lets `invalidateTenantQueries` clear one gym without touching another.
 * - Primary exports: queryKeys.
 */

export const queryKeys = {
  auth: {
    me: () => ["auth", "me"] as const,
  },
  roles: {
    tenant: (tenantId: string) => ["roles", tenantId] as const,
    platform: () => ["roles", "platform"] as const,
  },
  tenants: {
    all: () => ["tenants"] as const,
    detail: (tenantId: string) => ["tenants", tenantId] as const,
  },
  members: {
    list: (tenantId: string, params?: unknown) => ["members", tenantId, params ?? null] as const,
    detail: (tenantId: string, membershipId: string) =>
      ["members", tenantId, "detail", membershipId] as const,
  },
  payments: {
    list: (tenantId: string, params?: unknown) => ["payments", tenantId, params ?? null] as const,
    detail: (tenantId: string, paymentId: string) =>
      ["payments", tenantId, "detail", paymentId] as const,
    mine: (tenantId: string) => ["payments", tenantId, "mine"] as const,
    analytics: (tenantId: string, params?: unknown) =>
      ["payments", tenantId, "analytics", params ?? null] as const,
    gateway: (tenantId: string) => ["payments", tenantId, "gateway"] as const,
  },
  subscriptions: {
    list: (tenantId: string, includeInactive: boolean) =>
      ["subscriptions", tenantId, includeInactive] as const,
  },
  shifts: {
    list: (tenantId: string, includeInactive: boolean) =>
      ["shifts", tenantId, includeInactive] as const,
  },
  store: {
    products: (tenantId: string, params?: unknown) =>
      ["store", tenantId, "products", params ?? null] as const,
    product: (tenantId: string, productId: string) =>
      ["store", tenantId, "product", productId] as const,
    // Under the same "store" prefix as the catalogue, so a sale or an edit that
    // invalidates the store also refreshes the counts shown beside a product.
    productComments: (tenantId: string, productId: string) =>
      ["store", tenantId, "product", productId, "comments"] as const,
  },
  /** The record of chasing a member for money, by member and by payment. */
  reminders: {
    member: (tenantId: string, membershipId: string) =>
      ["reminders", tenantId, "member", membershipId] as const,
    payment: (tenantId: string, paymentId: string) =>
      ["reminders", tenantId, "payment", paymentId] as const,
  },
  /** Reactions to the gym itself, which outlive any one store product. */
  social: {
    tenantComments: (tenantId: string) => ["social", tenantId, "comments"] as const,
  },
  attendance: {
    byDate: (tenantId: string, date: string) => ["attendance", tenantId, "date", date] as const,
    member: (tenantId: string, membershipId: string) =>
      ["attendance", tenantId, "member", membershipId] as const,
    calendar: (tenantId: string, month: string) =>
      ["attendance", tenantId, "calendar", month] as const,
  },
  workouts: {
    list: (tenantId: string) => ["workouts", tenantId] as const,
    detail: (tenantId: string, planId: string) => ["workouts", tenantId, planId] as const,
  },
  badges: {
    list: (tenantId: string) => ["badges", tenantId] as const,
  },
  coupons: {
    list: (tenantId: string, includeInactive: boolean) =>
      ["coupons", tenantId, includeInactive] as const,
    detail: (tenantId: string, couponId: string) =>
      ["coupons", tenantId, "detail", couponId] as const,
    coins: (tenantId: string, membershipId: string) =>
      ["coupons", tenantId, "coins", membershipId] as const,
  },
  todos: {
    list: (tenantId: string) => ["todos", tenantId] as const,
  },
  settings: {
    detail: (tenantId: string) => ["settings", tenantId] as const,
    charges: (tenantId: string) => ["settings", tenantId, "charges"] as const,
  },
  audit: {
    tenant: (tenantId: string, params?: unknown) =>
      ["audit", tenantId, params ?? null] as const,
    platform: (params?: unknown) => ["audit", "platform", params ?? null] as const,
  },
} as const;
