import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { tenantsApi } from "@/api/tenants";
import { useAuthStore } from "@/stores/auth";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageLoader, Spinner } from "@/components/ui/spinner";
import { appendUniqueById, useInfiniteScroll } from "@/lib/use-infinite-scroll";
import { formatDate } from "@/lib/utils";
import { ArrowUpDown, Search, Sparkles, UserPlus, Users, X } from "lucide-react";
import type { MemberReferralLeader } from "@/types/api";
import AvatarCard from "@/components/ui/avatarCard";

export default function ReferralsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentTenantId, tenantRole } = useAuthStore();
  const role = tenantRole();
  const canViewReferrals = role === "ADMIN" || role === "COACH";

  const [leaders, setLeaders] = React.useState<MemberReferralLeader[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [hasMore, setHasMore] = React.useState(true);
  const [total, setTotal] = React.useState(0);

  const search = searchParams.get("search") ?? "";
  const order = searchParams.get("order") === "asc" ? "asc" : "desc";

  const updateParams = React.useCallback(
    (updates: Record<string, string>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(updates)) {
            if (value) {
              next.set(key, value);
            } else {
              next.delete(key);
            }
          }
          next.delete("page");
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const fetchLeaders = React.useCallback(
    async (nextPage: number, mode: "replace" | "append") => {
      if (!currentTenantId || !canViewReferrals) return;

      if (mode === "replace") {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      try {
        const res = await tenantsApi.listReferrals(
          currentTenantId,
          nextPage,
          20,
          search || undefined,
          order,
        );

        const nextLeaders = res.data.data.referrals;
        setLeaders((prev) =>
          mode === "replace" ? nextLeaders : appendUniqueById(prev, nextLeaders),
        );
        setTotal(res.data.meta.total);
        setPage(nextPage);
        setHasMore(nextPage < res.data.meta.totalPages);
      } catch {
        if (mode === "replace") {
          setLeaders([]);
          setTotal(0);
          setHasMore(false);
        }
      } finally {
        if (mode === "replace") {
          setLoading(false);
        } else {
          setLoadingMore(false);
        }
      }
    },
    [currentTenantId, canViewReferrals, search, order],
  );

  React.useEffect(() => {
    if (!currentTenantId || !canViewReferrals) {
      setLoading(false);
      setLeaders([]);
      setTotal(0);
      setHasMore(false);
      return;
    }

    setLeaders([]);
    setTotal(0);
    setHasMore(true);
    void fetchLeaders(1, "replace");
  }, [currentTenantId, canViewReferrals, search, order, fetchLeaders]);

  const loadMore = React.useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    void fetchLeaders(page + 1, "append");
  }, [loading, loadingMore, hasMore, page, fetchLeaders]);

  const loadMoreRef = useInfiniteScroll({
    hasMore,
    loading: loading || loadingMore,
    onLoadMore: loadMore,
    disabled: !canViewReferrals,
  });

  if (!canViewReferrals) {
    return (
      <EmptyState
        icon={Users}
        title="Referral insights are restricted"
        description="Only admins and trainers can view the referral leaderboard."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Referrals</h1>
          <p className="text-muted-foreground">
            Track which members bring the most friends into the gym.
          </p>
        </div>
        <div className="hidden rounded-xl border border-border/60 bg-card px-4 py-3 text-right shadow-sm sm:block">
          <p className="text-2xl font-bold">{total}</p>
          <p className="text-xs text-muted-foreground">
            {total === 1 ? "Active referrer" : "Active referrers"}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by member, phone, email, or referred friend..."
            value={search}
            onChange={(e) => updateParams({ search: e.target.value })}
            className="w-full rounded-md border border-input bg-background py-2 pl-10 pr-10 text-sm"
          />
          {search && (
            <button
              type="button"
              onClick={() => updateParams({ search: "" })}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              title="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <Select value={order} onValueChange={(value) => updateParams({ order: value ?? "" })}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="desc">Most referrals first</SelectItem>
            <SelectItem value="asc">Least referrals first</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <PageLoader />
      ) : leaders.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title={search ? "No matching referrers" : "No referrals yet"}
          description={
            search ? "Try a different search term." : "Members who refer friends will appear here."
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{leaders[0]?.referralCount ?? 0}</p>
                  <p className="text-sm text-muted-foreground">Top referral count on this page</p>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{total}</p>
                  <p className="text-sm text-muted-foreground">Referrers matching this filter</p>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-3">
                <ArrowUpDown className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-base font-semibold">
                    {order === "desc" ? "High to low" : "Low to high"}
                  </p>
                  <p className="text-sm text-muted-foreground">Sorted by referred friends</p>
                </div>
              </div>
            </Card>
          </div>

          <div className="space-y-3">
            {leaders.map((leader) => (
              <Card key={leader.id} className="overflow-hidden">
                <div className="flex flex-col gap-4 p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <button
                      type="button"
                      onClick={() => navigate(`/members/${leader.id}`)}
                      className="min-w-0 text-left"
                    >
                      <AvatarCard
                        name={leader.name}
                        avatarUrl={leader.avatarUrl}
                        memberId={leader.memberId}
                        variant="lg"
                        role={leader.role}
                        isActive={leader.status === "ACTIVE"}
                      >
                        <div className="space-y-1 text-sm text-muted-foreground">
                          <p className="truncate">{leader.email}</p>
                          <p>{leader.phone ?? "Phone not available"}</p>
                          <p>Joined {formatDate(leader.joinedAt)}</p>
                        </div>
                      </AvatarCard>
                    </button>

                    <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 lg:min-w-44">
                      <p className="text-3xl font-bold">{leader.referralCount}</p>
                      <p className="text-sm font-medium">Friends referred</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Rank is based on this count.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">Referred members</p>
                        <p className="text-xs text-muted-foreground">
                          Who joined through this member.
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-2 md:grid-cols-2">
                      {leader.referrals.map((referral) => (
                        <button
                          key={referral.id}
                          type="button"
                          onClick={() => navigate(`/members/${referral.id}`)}
                          className="rounded-lg border border-border/60 bg-background p-3 text-left transition-colors hover:bg-muted/40"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <AvatarCard
                              name={referral.name}
                              avatarUrl={referral.avatarUrl}
                              memberId={referral.memberId}
                              variant="md"
                              role={referral.role}
                              isActive={referral.status === "ACTIVE"}
                            >
                              <p className="truncate text-sm text-muted-foreground">
                                {referral.phone ?? referral.email}
                              </p>
                            </AvatarCard>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {formatDate(referral.joinedAt)}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {(hasMore || loadingMore) && (
            <div
              ref={loadMoreRef}
              className="flex items-center justify-center py-4 text-sm text-muted-foreground"
            >
              {loadingMore ? (
                <div className="flex items-center gap-2">
                  <Spinner size="sm" />
                  Loading more...
                </div>
              ) : (
                "Scroll to load more"
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
