import { tenantsApi } from "@/api/tenants";
import type { TenantMember } from "@/types/api";

type LoadAllTenantMembersOptions = {
  role?: string;
  search?: string;
  status?: string;
  badge?: string;
  pageSize?: number;
};

export async function loadAllTenantMembers(
  tenantId: string,
  {
    role,
    search,
    status,
    badge,
    pageSize = 100,
  }: LoadAllTenantMembersOptions = {},
): Promise<TenantMember[]> {
  const firstPage = await tenantsApi.listMembers(
    tenantId,
    1,
    pageSize,
    role,
    search,
    status,
    badge,
  );
  const firstBatch = firstPage.data.data.members;
  const totalPages = firstPage.data.meta.totalPages;

  if (totalPages <= 1) return firstBatch;

  const remainingPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      tenantsApi.listMembers(tenantId, index + 2, pageSize, role, search, status, badge),
    ),
  );

  return [...firstBatch, ...remainingPages.flatMap((page) => page.data.data.members)];
}
