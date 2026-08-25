/**
 * Documentation: Platform-scope query hooks — tenants, audit logs, and commerce.
 *
 * - These are not gym-scoped, so they use plain queries and `useAppMutation` rather than the tenant-aware helpers.
 * - The current gym's own profile (`useTenant`) lives here too, since the sidebar and settings read it by id rather than through a membership.
 * - Primary exports: useTenants, useTenant, useTenantAuditLogs, usePlatformAuditLogs, and the commerce admin hooks.
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { tenantsApi } from "@/api/tenants";
import { auditApi } from "@/api/audit";
import { commerceApi } from "@/api/commerce";
import { queryKeys } from "@/lib/query-keys";
import type {
  CreateProductPayload,
  CreateTenantPayload,
  OrderStatus,
  UpdateProductPayload,
  UpdateTenantPayload,
} from "@/types/api";
import {
  unwrap,
  unwrapPaginated,
  useAppInfiniteQuery,
  useAppMutation,
  useCurrentTenantId,
  useTenantQuery,
} from "./shared";

// ─── Tenants ──────────────────────────────────────────────────────────────────

export function useTenants(page = 1, limit = 20, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...queryKeys.tenants.all(), page, limit],
    enabled: options.enabled ?? true,
    placeholderData: keepPreviousData,
    queryFn: async () => unwrapPaginated(await tenantsApi.list(page, limit)),
  });
}

/** All tenants, paged for the infinite-scroll list. */
export function useTenantsInfinite(limit = 20, options: { enabled?: boolean } = {}) {
  return useAppInfiniteQuery(
    [...queryKeys.tenants.all(), "infinite", limit],
    async (page) => {
      const { data, meta } = unwrapPaginated(await tenantsApi.list(page, limit));
      return { data: data.tenants, meta };
    },
    options,
  );
}

export function useTenant(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.tenants.detail(tenantId ?? "none"),
    enabled: Boolean(tenantId),
    queryFn: async () => unwrap(await tenantsApi.get(tenantId!)).tenant,
  });
}

/** The gym the signed-in user is acting in. */
export function useCurrentTenant() {
  return useTenantQuery(
    (tenantId) => queryKeys.tenants.detail(tenantId),
    async (tenantId) => unwrap(await tenantsApi.get(tenantId)).tenant,
  );
}

export function useCreateTenant() {
  return useAppMutation(
    async (payload: CreateTenantPayload) => unwrap(await tenantsApi.create(payload)),
    { invalidates: [queryKeys.tenants.all()] },
  );
}

export function useUpdateTenant() {
  return useAppMutation(
    async (vars: { tenantId: string; data: UpdateTenantPayload }) =>
      unwrap(await tenantsApi.update(vars.tenantId, vars.data)),
    { invalidates: [queryKeys.tenants.all()] },
  );
}

export function useUpdateTenantStatus() {
  return useAppMutation(
    async (vars: { tenantId: string; status: "ACTIVE" | "SUSPENDED" }) =>
      unwrap(await tenantsApi.updateStatus(vars.tenantId, vars.status)),
    { invalidates: [queryKeys.tenants.all()] },
  );
}

// ─── Audit ────────────────────────────────────────────────────────────────────

export function useTenantAuditLogs(
  filters: { page?: number; limit?: number } = {},
  options: { enabled?: boolean } = {},
) {
  return useTenantQuery(
    (tenantId) => queryKeys.audit.tenant(tenantId, filters),
    async (tenantId) =>
      unwrapPaginated(await auditApi.tenantLogs(tenantId, filters.page ?? 1, filters.limit ?? 50)),
    { placeholderData: keepPreviousData, ...options },
  );
}

export function usePlatformAuditLogs(
  filters: { page?: number; limit?: number; entity?: string; action?: string } = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: queryKeys.audit.platform(filters),
    enabled: options.enabled ?? true,
    placeholderData: keepPreviousData,
    queryFn: async () =>
      unwrapPaginated(
        await auditApi.platformLogs(
          filters.page ?? 1,
          filters.limit ?? 50,
          filters.entity,
          filters.action,
        ),
      ),
  });
}

/**
 * Audit logs paged for the infinite-scroll list, from whichever scope applies.
 * One hook rather than two, because the screen renders the same table either way
 * and only the source endpoint differs.
 */
export function useAuditLogsInfinite(
  scope: "platform" | "tenant",
  filters: { action?: string; entity?: string } = {},
  options: { enabled?: boolean; limit?: number } = {},
) {
  const { limit = 20 } = options;
  const tenantId = useCurrentTenantId();
  const isPlatform = scope === "platform";

  return useAppInfiniteQuery(
    isPlatform
      ? [...queryKeys.audit.platform(filters), "infinite", limit]
      : [...queryKeys.audit.tenant(tenantId ?? "none", filters), "infinite", limit],
    async (page) => {
      const response = isPlatform
        ? await auditApi.platformLogs(page, limit, filters.entity, filters.action)
        : await auditApi.tenantLogs(tenantId!, page, limit);
      const { data, meta } = unwrapPaginated(response);
      return { data: data.logs, meta };
    },
    // A tenant-scoped read needs a gym; a platform-scoped one does not.
    { enabled: (options.enabled ?? true) && (isPlatform || Boolean(tenantId)) },
  );
}

// ─── Commerce (platform admin) ────────────────────────────────────────────────

const COMMERCE_KEY = ["commerce"] as const;

export function useAdminProducts(
  filters: { page?: number; limit?: number; category?: string; search?: string } = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: [...COMMERCE_KEY, "products", filters],
    enabled: options.enabled ?? true,
    placeholderData: keepPreviousData,
    queryFn: async () =>
      unwrapPaginated(
        await commerceApi.listAdminProducts(
          filters.page ?? 1,
          filters.limit ?? 20,
          true,
          filters.category,
          filters.search,
        ),
      ),
  });
}

export function useAdminProduct(productId: string | undefined) {
  return useQuery({
    queryKey: [...COMMERCE_KEY, "products", productId ?? "none"],
    enabled: Boolean(productId),
    queryFn: async () => unwrap(await commerceApi.getAdminProductById(productId!)).product,
  });
}

export function useAdminOrders(
  filters: { page?: number; limit?: number; status?: OrderStatus; productId?: string } = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: [...COMMERCE_KEY, "orders", filters],
    enabled: options.enabled ?? true,
    placeholderData: keepPreviousData,
    queryFn: async () =>
      unwrapPaginated(
        await commerceApi.listAdminOrders(
          filters.page ?? 1,
          filters.limit ?? 20,
          filters.status,
          filters.productId,
        ),
      ),
  });
}

export function useAdminOrder(orderId: string | undefined) {
  return useQuery({
    queryKey: [...COMMERCE_KEY, "orders", orderId ?? "none"],
    enabled: Boolean(orderId),
    queryFn: async () => unwrap(await commerceApi.getAdminOrderById(orderId!)).order,
  });
}

export function useMyOrders(page = 1, limit = 20) {
  return useQuery({
    queryKey: [...COMMERCE_KEY, "orders", "mine", page, limit],
    placeholderData: keepPreviousData,
    queryFn: async () => unwrapPaginated(await commerceApi.listMyOrders(page, limit)),
  });
}

export function useCreateProduct() {
  return useAppMutation(
    async (payload: CreateProductPayload) => unwrap(await commerceApi.createProduct(payload)),
    { invalidates: [[...COMMERCE_KEY, "products"]] },
  );
}

export function useUpdateProduct() {
  return useAppMutation(
    async (vars: { productId: string; data: UpdateProductPayload }) =>
      unwrap(await commerceApi.updateProduct(vars.productId, vars.data)),
    { invalidates: [[...COMMERCE_KEY, "products"]] },
  );
}

export function useDeleteProduct() {
  return useAppMutation(
    async (productId: string) => {
      await commerceApi.deleteProduct(productId);
    },
    { invalidates: [[...COMMERCE_KEY, "products"]] },
  );
}

export function useUpdateOrderStatus() {
  return useAppMutation(
    async (vars: { orderId: string; status: OrderStatus }) =>
      unwrap(await commerceApi.updateOrderStatus(vars.orderId, vars.status)),
    { invalidates: [[...COMMERCE_KEY, "orders"]] },
  );
}

export function useDeleteAdminOrder() {
  return useAppMutation(
    async (orderId: string) => {
      await commerceApi.deleteAdminOrder(orderId);
    },
    { invalidates: [[...COMMERCE_KEY, "orders"]] },
  );
}
