import { tenantsApi } from "@/api/tenants";
import type { TenantMember } from "@/types/api";

type LoadAllTenantMembersOptions = {
  role?: string;
  search?: string;
  status?: string;
  badge?: string;
  pageSize?: number;
  forceRefresh?: boolean;
};

const CACHE_TTL_MS = 5 * 60 * 1000;

function getTenantMembersCacheKey(tenantId: string) {
  return `fitconnect:tenant-members:${tenantId}`;
}

function readCachedTenantMembers(tenantId: string): TenantMember[] | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(getTenantMembersCacheKey(tenantId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { expiresAt?: number; members?: TenantMember[] };
    if (!parsed.members || !parsed.expiresAt) return null;
    if (Date.now() > parsed.expiresAt) {
      window.localStorage.removeItem(getTenantMembersCacheKey(tenantId));
      return null;
    }

    return parsed.members;
  } catch {
    return null;
  }
}

function writeCachedTenantMembers(tenantId: string, members: TenantMember[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      getTenantMembersCacheKey(tenantId),
      JSON.stringify({
        members,
        expiresAt: Date.now() + CACHE_TTL_MS,
      }),
    );
  } catch {
    // ignore quota issues
  }
}

export async function loadAllTenantMembers(
  tenantId: string,
  {
    role,
    search,
    status,
    badge,
    pageSize = 200,
    forceRefresh = false,
  }: LoadAllTenantMembersOptions = {},
): Promise<TenantMember[]> {
  const hasFilters = Boolean(role || search || status || badge);

  if (!forceRefresh && !hasFilters) {
    const cached = readCachedTenantMembers(tenantId);
    if (cached) return cached;
  }

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

  const allMembers =
    totalPages <= 1
      ? firstBatch
      : [
          firstBatch,
          ...(await Promise.all(
            Array.from({ length: totalPages - 1 }, (_, index) =>
              tenantsApi.listMembers(tenantId, index + 2, pageSize, role, search, status, badge),
            ),
          )).flatMap((page) => page.data.data.members),
        ].flat();

  if (!hasFilters) {
    writeCachedTenantMembers(tenantId, allMembers);
  }

  return allMembers;
}
