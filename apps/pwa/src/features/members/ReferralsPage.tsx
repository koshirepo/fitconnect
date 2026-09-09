/**
 * Documentation: Who brings friends to the gym.
 *
 * - A ranked list of members by how many people joined through them, and who those people are.
 * - Built as a leaderboard rather than a stack of profile cards: the question this page answers is "who should we thank", which is a comparison between members, and a comparison is unreadable when each entry is a screen tall. One scannable row each, with the referred members behind a tap.
 * - Rank is only shown when the list is sorted highest-first. Numbering a list that runs low-to-high would label the least active referrer "#1".
 * - Primary exports: ReferralsPage.
 */
import * as React from "react";
import { usePermissions } from "@/features/auth/permission-gate";
import { Permission } from "@fitconnect/shared/types/permissions";
import { useSearchParams } from "react-router-dom";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { useReferralsInfinite } from "@/api/queries/members";
import { flattenPages } from "@/api/queries/shared";
import { getInitials } from "@fitconnect/shared/utils";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@/components/ui/avatar";
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
import { usePhoneDisplay } from "@/lib/use-phone-display";
import { cn, formatDate } from "@/lib/utils";
import { ChevronDown, Search, UserPlus, Users, X } from "lucide-react";
import type { MemberReferral, MemberReferralLeader } from "@/types/api";

/** How many faces the stacked strip shows before it starts counting instead. */
const FACES_SHOWN = 5;

/**
 * The podium colours, for the first three only.
 *
 * Past third place a rank is a number, not an achievement, and colouring all of
 * them would leave nothing to notice.
 */
const RANK_CLASS: Record<number, string> = {
  1: "bg-amber-400/15 text-amber-600 ring-amber-400/30 dark:text-amber-400",
  2: "bg-slate-400/15 text-slate-600 ring-slate-400/30 dark:text-slate-300",
  3: "bg-orange-600/15 text-orange-700 ring-orange-600/30 dark:text-orange-400",
};

/** One face in the stacked strip, or in the expanded list. */
function PersonAvatar({
  person,
  size = "default",
}: {
  person: Pick<MemberReferral, "name" | "avatarUrl">;
  size?: "sm" | "default";
}) {
  return (
    <Avatar size={size}>
      {person.avatarUrl && (
        <AvatarImage src={person.avatarUrl} alt={person.name} zoomable={false} />
      )}
      <AvatarFallback className="text-[10px]">{getInitials(person.name)}</AvatarFallback>
    </Avatar>
  );
}

export default function ReferralsPage() {
  const navigate = useAppNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { can } = usePermissions();
  const { format: formatPhone } = usePhoneDisplay();
  const canViewReferrals = can(Permission.MEMBERS_REFERRALS_READ);

  const search = searchParams.get("search") ?? "";
  const order = searchParams.get("order") === "asc" ? "asc" : "desc";

  const [expanded, setExpanded] = React.useState<string | null>(null);

  const updateParams = React.useCallback(
    (updates: Record<string, string>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(updates)) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          next.delete("page");
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Local box, URL 300ms behind it — the same arrangement the members and
  // payments lists use. Search is part of the query key, so writing every
  // keystroke straight to the URL refetched the whole leaderboard per letter.
  const [searchInput, setSearchInput] = React.useState(search);
  const searchTimer = React.useRef<number | undefined>(undefined);

  React.useEffect(() => () => window.clearTimeout(searchTimer.current), []);

  const onSearchChange = (value: string) => {
    setSearchInput(value);
    window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => updateParams({ search: value }), 300);
  };

  const clearSearch = () => {
    window.clearTimeout(searchTimer.current);
    setSearchInput("");
    updateParams({ search: "" });
  };

  const leadersQuery = useReferralsInfinite(
    { search: search || undefined, order },
    { enabled: canViewReferrals },
  );

  const leaders = React.useMemo(
    () => flattenPages<MemberReferralLeader>(leadersQuery.data?.pages),
    [leadersQuery.data],
  );
  const total = leadersQuery.data?.pages[0]?.meta.total ?? 0;
  const loading = leadersQuery.isPending;
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
    <div className="space-y-5">
      {/* The count sits with the title at every width. It used to be a card
          hidden below `sm`, which took the one number off the screen it matters
          most on. */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Referrals</h1>
          <p className="text-sm text-muted-foreground">
            {total > 0
              ? `${total} ${total === 1 ? "member has" : "members have"} brought a friend in.`
              : "Who brings friends to the gym."}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
        <div className="relative min-w-0">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by member, phone, email, or referred friend..."
            value={searchInput}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background pr-10 pl-10 text-sm outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
          />
          {searchInput && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              title="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <Select value={order} onValueChange={(value) => updateParams({ order: value ?? "" })}>
          <SelectTrigger className="h-10 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="desc">Most referrals first</SelectItem>
            <SelectItem value="asc">Least referrals first</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <ListPageSkeleton filters={1} />
      ) : leaders.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title={search ? "No matching referrers" : "No referrals yet"}
          description={
            search ? "Try a different search term." : "Members who refer friends will appear here."
          }
        />
      ) : (
        <div className="space-y-2">
          {leaders.map((leader, index) => {
            const rank = index + 1;
            const isOpen = expanded === leader.id;
            const shown = leader.referrals.slice(0, FACES_SHOWN);
            const rest = leader.referralCount - shown.length;

            return (
              <Card key={leader.id} className="overflow-hidden py-0">
                {/*
                  Two targets, side by side, rather than one inside the other.
                  The left half opens the member; the right half opens the
                  friends they brought. Nesting a link inside the toggle would
                  have been one control announcing itself as two.
                */}
                <div className="flex items-center gap-3 p-3">
                  {order === "desc" && (
                    <span
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums ring-1",
                        RANK_CLASS[rank] ?? "bg-muted text-muted-foreground ring-border",
                      )}
                    >
                      {rank}
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => navigate(`/members/${leader.id}`)}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left"
                  >
                    <PersonAvatar person={leader} size="default" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        <span className="text-muted-foreground">#{leader.memberId} – </span>
                        {leader.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {formatPhone(leader.phone, leader.userId) ?? leader.email}
                      </span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : leader.id)}
                    aria-expanded={isOpen}
                    aria-label={
                      isOpen
                        ? `Hide the ${leader.referralCount} friends ${leader.name} referred`
                        : `Show the ${leader.referralCount} friends ${leader.name} referred`
                    }
                    className="flex shrink-0 items-center gap-3 rounded-md px-1 py-1 transition-colors hover:bg-muted/60"
                  >
                    {/* The faces say who at a glance; the number says how many
                        without making anybody count avatars. */}
                    <AvatarGroup className="hidden sm:flex">
                      {shown.map((referral) => (
                        <PersonAvatar key={referral.id} person={referral} size="sm" />
                      ))}
                      {rest > 0 && <AvatarGroupCount className="size-6">+{rest}</AvatarGroupCount>}
                    </AvatarGroup>

                    <span className="text-right">
                      <span className="block text-lg leading-none font-bold tabular-nums">
                        {leader.referralCount}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
                        {leader.referralCount === 1 ? "friend" : "friends"}
                      </span>
                    </span>

                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 text-muted-foreground transition-transform",
                        isOpen && "rotate-180",
                      )}
                    />
                  </button>
                </div>

                {isOpen && (
                  <div className="border-t border-border/60 bg-muted/20 px-3 py-2">
                    <ul className="divide-y divide-border/40">
                      {leader.referrals.map((referral) => (
                        <li key={referral.id}>
                          <button
                            type="button"
                            onClick={() => navigate(`/members/${referral.id}`)}
                            className="flex w-full items-center gap-3 py-2 text-left"
                          >
                            <PersonAvatar person={referral} size="sm" />
                            <span className="min-w-0 flex-1 truncate text-sm">
                              <span className="text-muted-foreground">#{referral.memberId} – </span>
                              {referral.name}
                            </span>
                            <span
                              className={cn(
                                "shrink-0 rounded-full px-2 py-0.5 text-[11px]",
                                referral.status === "ACTIVE"
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                  : "bg-muted text-muted-foreground",
                              )}
                            >
                              {referral.status === "ACTIVE" ? "Active" : "Inactive"}
                            </span>
                            <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                              Joined {formatDate(referral.joinedAt)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            );
          })}

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
