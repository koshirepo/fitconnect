import * as React from "react";
import { usePermissions } from "@/features/auth/permission-gate";
import { Permission } from "@fitconnect/shared/types/permissions";
import { useSearchParams } from "react-router-dom";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { useReferralsInfinite } from "@/api/queries/members";
import { flattenPages } from "@/api/queries/shared";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ListPageSkeleton } from "@/components/ui/skeleton";
import { useInfiniteScroll } from "@/lib/use-infinite-scroll";
import { formatDate } from "@/lib/utils";
import { ArrowUpDown, Search, Sparkles, UserPlus, Users, X } from "lucide-react";
import type { MemberReferralLeader } from "@/types/api";
import AvatarCard from "@/components/ui/avatarCard";

export default function ReferralsPage() {
  const navigate = useAppNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { can } = usePermissions();
  const canViewReferrals = can(Permission.MEMBERS_REFERRALS_READ);

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

  // Search and sort are part of the cache key, so changing either refetches from
  // page one without any manual reset.
  const leadersQuery = useReferralsInfinite(
    { search: search || undefined, order },
    { enabled: canViewReferrals },
  );

  const leaders = React.useMemo(
    () => flattenPages<MemberReferralLeader>(leadersQuery.data?.pages),
    [leadersQuery.data],
  );
  const total = leadersQuery.data?.pages[0]?.meta.total ?? 0;
  const loading = leadersQuery.isLoading;
  const loadingMore = leadersQuery.isFetchingNextPage;
  const hasMore = Boolean(leadersQuery.hasNextPage);

  const loadMoreRef = useInfiniteScroll({
    hasMore,
    loading: loading || loadingMore,
    onLoadMore: () => {
      if (leadersQuery.hasNextPage && !leadersQuery.isFetchingNextPage) {
        void leadersQuery.fetchNextPage();
      }
    },
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
        <ListPageSkeleton />
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
                        gender={leader.gender}
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
                              gender={referral.gender}
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
