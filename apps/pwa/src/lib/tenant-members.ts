import { tenantsApi } from "@/api/tenants";
import { getNetworkQuality } from "@/lib/network-status";
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
    // A roster too big for the 5MB quota is the case this hits, and the write
    // that failed leaves whatever was there before — an older, smaller, and now
    // wrong roster that would be served as though it were current. Dropping it
    // costs one refetch; keeping it serves stale members indefinitely.
    try {
      window.localStorage.removeItem(getTenantMembersCacheKey(tenantId));
    } catch {
      // Storage is refusing everything — a private window, or site data
      // blocked. Nothing is cached, which is the safe state anyway.
    }
  }
}

export async function loadAllTenantMembers(
  tenantId: string,
  {
    role,
    search,
    status,
    badge,
    pageSize = 500,
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

  // Downloading the whole roster is what keeps search and the tab counts
  // instant, and it is a fair trade on a usable connection. On 2G, or with Data
  // Saver on, it is a fair trade no longer: the reader waits on twenty parallel
  // requests to see the first row. They get the first page and the list works,
  // narrower, straight away.
  const { isSlow } = getNetworkQuality();
  if (isSlow && totalPages > 1) {
    return firstBatch;
  }

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
