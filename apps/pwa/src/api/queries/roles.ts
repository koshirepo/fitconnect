/**
 * Documentation: Role/permission query hooks.
 *
 * - Wraps `rolesApi` in TanStack Query hooks so the management screens get caching, dedupe, and cache invalidation for free while axios stays the transport.
 * - A successful write invalidates both the matrix it changed and the session's `/auth/me`, because a permission change alters what the current user may do.
 * - Primary exports: useTenantRoleMatrix, usePlatformRoleMatrix, useUpdateTenantRole, useResetTenantRole, useUpdatePlatformRole, useResetPlatformRole.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { rolesApi, type RoleMatrix } from "@/api/roles";
import { queryKeys } from "@/lib/query-keys";
import { useAuthStore } from "@/stores/auth";
import type { PermissionScope } from "@fitconnect/shared/types/permissions";

/** Refresh the signed-in user's capability list after a policy change. */
function useRefreshSession() {
  const queryClient = useQueryClient();
  const fetchMe = useAuthStore((state) => state.fetchMe);

  return async () => {
    await fetchMe();
    await queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() });
  };
}

export function useTenantRoleMatrix(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.roles.tenant(tenantId ?? "none"),
    enabled: Boolean(tenantId),
    queryFn: async (): Promise<RoleMatrix> => {
      const res = await rolesApi.getTenantMatrix(tenantId!);
      return res.data.data;
    },
  });
}

export function usePlatformRoleMatrix(enabled = true) {
  return useQuery({
    queryKey: queryKeys.roles.platform(),
    enabled,
    queryFn: async (): Promise<RoleMatrix> => {
      const res = await rolesApi.getPlatformMatrix();
      return res.data.data;
    },
  });
}

export function useUpdateTenantRole(tenantId: string | null | undefined) {
  const queryClient = useQueryClient();
  const refreshSession = useRefreshSession();

  return useMutation({
    mutationFn: async (input: { role: string; permissions: string[] }) => {
      const res = await rolesApi.updateTenantRole(tenantId!, input.role, input.permissions);
      return res.data.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.roles.tenant(tenantId ?? "none"),
      });
      await refreshSession();
    },
  });
}

export function useResetTenantRole(tenantId: string | null | undefined) {
  const queryClient = useQueryClient();
  const refreshSession = useRefreshSession();

  return useMutation({
    mutationFn: async (role: string) => {
      const res = await rolesApi.resetTenantRole(tenantId!, role);
      return res.data.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.roles.tenant(tenantId ?? "none"),
      });
      await refreshSession();
    },
  });
}

export function useUpdatePlatformRole() {
  const queryClient = useQueryClient();
  const refreshSession = useRefreshSession();

  return useMutation({
    mutationFn: async (input: {
      scope: PermissionScope;
      role: string;
      permissions: string[];
    }) => {
      const res = await rolesApi.updatePlatformRole(input.scope, input.role, input.permissions);
      return res.data.data;
    },
    onSuccess: async () => {
      // A platform-wide default feeds every gym's matrix, so drop them all.
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
      await refreshSession();
    },
  });
}

export function useResetPlatformRole() {
  const queryClient = useQueryClient();
  const refreshSession = useRefreshSession();

  return useMutation({
    mutationFn: async (input: { scope: PermissionScope; role: string }) => {
      const res = await rolesApi.resetPlatformRole(input.scope, input.role);
      return res.data.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
      await refreshSession();
    },
  });
}

export function useCreateTenantRole(tenantId: string | null | undefined) {
  const queryClient = useQueryClient();
  const refreshSession = useRefreshSession();

  return useMutation({
    mutationFn: async (input: {
      name: string;
      description?: string;
      permissions: string[];
    }) => {
      const res = await rolesApi.createTenantRole(tenantId!, input);
      return res.data.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.roles.tenant(tenantId ?? "none"),
      });
      await refreshSession();
    },
  });
}

export function useDeleteTenantRole(tenantId: string | null | undefined) {
  const queryClient = useQueryClient();
  const refreshSession = useRefreshSession();

  return useMutation({
    mutationFn: async (role: string) => {
      const res = await rolesApi.deleteTenantRole(tenantId!, role);
      return res.data.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.roles.tenant(tenantId ?? "none"),
      });
      await refreshSession();
    },
  });
}

export function useCreatePlatformRole() {
  const queryClient = useQueryClient();
  const refreshSession = useRefreshSession();

  return useMutation({
    mutationFn: async (input: { name: string; description?: string; permissions: string[] }) => {
      const res = await rolesApi.createPlatformRole(input);
      return res.data.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
      await refreshSession();
    },
  });
}

export function useUpdateTenantRoleDetails(tenantId: string | null | undefined) {
  const queryClient = useQueryClient();
  const refreshSession = useRefreshSession();

  return useMutation({
    mutationFn: async (input: { role: string; name?: string; description?: string | null }) => {
      const res = await rolesApi.updateTenantRoleDetails(tenantId!, input.role, {
        name: input.name,
        description: input.description,
      });
      return res.data.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.roles.tenant(tenantId ?? "none"),
      });
      await refreshSession();
    },
  });
}

export function useUpdatePlatformRoleDetails() {
  const queryClient = useQueryClient();
  const refreshSession = useRefreshSession();

  return useMutation({
    mutationFn: async (input: {
      scope: PermissionScope;
      role: string;
      name?: string;
      description?: string | null;
    }) => {
      const res = await rolesApi.updatePlatformRoleDetails(input.scope, input.role, {
        name: input.name,
        description: input.description,
      });
      return res.data.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
      await refreshSession();
    },
  });
}

export function useDeletePlatformRole() {
  const queryClient = useQueryClient();
  const refreshSession = useRefreshSession();

  return useMutation({
    mutationFn: async (input: { scope: PermissionScope; role: string }) => {
      const res = await rolesApi.deletePlatformRole(input.scope, input.role);
      return res.data.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
      await refreshSession();
    },
  });
}
