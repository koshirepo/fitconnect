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
    /**
     * Everything cached for one gym's store, as the prefix invalidation uses.
     *
     * Lives here rather than beside each hook because a cache-key root written
     * out twice is a root that can drift, and a drifted root does not error —
     * it quietly stops invalidating.
     */
    root: (tenantId: string | null | undefined) => ["store", tenantId ?? "none"] as const,
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
    detail: (tenantId: string, reminderId: string) =>
      ["reminders", tenantId, "detail", reminderId] as const,
    calendar: (tenantId: string, month: string) =>
      ["reminders", tenantId, "calendar", month] as const,
    member: (tenantId: string, membershipId: string) =>
      ["reminders", tenantId, "member", membershipId] as const,
    payment: (tenantId: string, paymentId: string) =>
      ["reminders", tenantId, "payment", paymentId] as const,
  },
  /** Reactions to the gym itself, which outlive any one store product. */
  social: {
    tenantComments: (tenantId: string) => ["social", tenantId, "comments"] as const,
  },
  /**
   * Platform shop reviews. Not gym-scoped: a product in the platform catalogue
   * is the same product whichever gym you came from, so these keys carry no
   * tenant id — unlike `store`, which is a gym's own catalogue.
   */
  reviews: {
    root: (productId: string) => ["reviews", productId] as const,
    list: (productId: string, page: number, limit: number) =>
      ["reviews", productId, "list", page, limit] as const,
    stats: (productId: string) => ["reviews", productId, "stats"] as const,
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
    /** Gym-wide, not per member. Under the coupon prefix so a coin adjustment
     *  invalidates the analytics along with the balance it changed. */
    coinOverview: (tenantId: string) => ["coupons", tenantId, "coins", "overview"] as const,
    coinHolders: (tenantId: string) => ["coupons", tenantId, "coins", "holders"] as const,
    coinActivity: (tenantId: string) => ["coupons", tenantId, "coins", "activity"] as const,
    analytics: (tenantId: string) => ["coupons", tenantId, "analytics"] as const,
    activity: (tenantId: string) => ["coupons", tenantId, "activity"] as const,
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
  finance: {
    // The month is in every key: paging back and forth reuses months already
    // fetched instead of refetching them.
    summary: (tenantId: string, month: string) => ["finance", tenantId, "summary", month] as const,
    expenses: (tenantId: string, month: string) =>
      ["finance", tenantId, "expenses", month] as const,
    recurring: (tenantId: string, month: string) =>
      ["finance", tenantId, "recurring", month] as const,
    /** Everything under this gym's books, for invalidating after a write. */
    all: (tenantId: string) => ["finance", tenantId] as const,
  },
  salary: {
    list: (tenantId: string, month: string) => ["salary", tenantId, "list", month] as const,
    cycle: (tenantId: string, membershipId: string, month: string) =>
      ["salary", tenantId, "cycle", membershipId, month] as const,
    history: (tenantId: string, membershipId: string) =>
      ["salary", tenantId, "history", membershipId] as const,
    mine: (tenantId: string) => ["salary", tenantId, "mine"] as const,
    all: (tenantId: string) => ["salary", tenantId] as const,
  },
} as const;
