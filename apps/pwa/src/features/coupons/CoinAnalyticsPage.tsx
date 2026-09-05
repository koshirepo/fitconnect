/**
 * Documentation: A gym's coins, taken as a whole.
 *
 * - Coins are a liability, not a feature: every one issued is a rupee promised away, and until this page the only way to see them was to open one member at a time.
 * - Issued and spent are shown side by side rather than netted. "12,400 outstanding" says nothing about whether the scheme works; twelve thousand issued against eleven spent is a very different gym from twelve thousand against two hundred.
 * - Where they came from is the second question. A gym that finds most of its coins came from hand adjustments rather than coupons has learned something about its own front desk.
 * - Separate from the coupon page on purpose. Coupons produce coins, but coins also come from referrals and gifts, and a page that answered both questions would answer neither well.
 * - Primary exports: CoinAnalyticsPage.
 */
import { useCoinActivity, useCoinHolders, useCoinOverview } from "@/api/queries/coupons";
import { useCurrentTenantId } from "@/api/queries/shared";
import { getApiError } from "@/api/client";
import * as React from "react";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { formatDateTime, cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { CardsGridSkeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { getInitials } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight, Coins, Hourglass, Search, Users } from "lucide-react";

/** Plain words for a ledger reason, because the stored value is shouted. */
const REASON_LABELS: Record<string, string> = {
  COUPON: "From coupons",
  REFERRAL: "From referrals",
  ADJUSTMENT: "Given by staff",
  REDEEMED: "Spent by members",
  REVERSAL: "Returned by a reversal",
  EXPIRED: "Expired",
};

function reasonLabel(reason: string) {
  return REASON_LABELS[reason] ?? reason;
}

/** The "any reason" option, and not a value the ledger ever stores. */
const ALL_REASONS = "";

function Stat({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof Coins;
  tone?: "default" | "positive" | "warning";
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        <p
          className={cn(
            "text-2xl font-bold tabular-nums",
            tone === "positive" && "text-emerald-600 dark:text-emerald-400",
            tone === "warning" && "text-amber-600 dark:text-amber-400",
          )}
        >
          {value}
        </p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export default function CoinAnalyticsPage() {
  const navigate = useAppNavigate();
  const tenantId = useCurrentTenantId();
  const [query, setQuery] = React.useState("");
  const [reason, setReason] = React.useState<string>(ALL_REASONS);
  const overviewQuery = useCoinOverview();
  const holdersQuery = useCoinHolders();
  const activityQuery = useCoinActivity();

  // A tenant-scoped query with no gym selected is disabled, and a disabled
  // query is `isPending` forever — which rendered a skeleton that never
  // resolved for platform staff who hold no membership here. Say so instead.
  if (!tenantId) {
    return (
      <EmptyState
        icon={Coins}
        title="No gym selected"
        description="Coins belong to a gym. Pick one to see what it has issued and what it still owes."
      />
    );
  }

  if (overviewQuery.isPending) return <CardsGridSkeleton count={4} />;

  if (overviewQuery.isError) {
    return (
      <EmptyState
        icon={Coins}
        title="Coins could not be loaded"
        description={getApiError(overviewQuery.error)}
      />
    );
  }

  const overview = overviewQuery.data;
  const holders = holdersQuery.data ?? [];
  const allActivity = activityQuery.data ?? [];

  /**
   * Filtered in the browser, not the API.
   *
   * The whole ledger is already here — the endpoint returns every entry — so a
   * round trip per keystroke would be slower and no more correct. If a gym ever
   * outgrows the cap this moves server-side, and the shape of the call does not
   * change when it does.
   */
  const activity = allActivity.filter((entry) => {
    if (reason !== ALL_REASONS && entry.reason !== reason) return false;
    if (!query.trim()) return true;

    const needle = query.trim().toLowerCase();
    return [entry.memberName, entry.actedByName, entry.note]
      .filter(Boolean)
      .some((field) => field!.toLowerCase().includes(needle));
  });

  /** Only offer a filter for reasons this gym actually has entries for. */
  const reasonOptions = [...new Set(allActivity.map((entry) => entry.reason))].sort();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Coins</h1>
        <p className="text-muted-foreground">
          What this gym has given away, what members have spent, and what is still owed.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={ArrowUpRight}
          label="Issued"
          value={overview.issued.toLocaleString("en-IN")}
          hint="Every coin ever granted"
          tone="positive"
        />
        <Stat
          icon={ArrowDownRight}
          label="Spent"
          value={overview.spent.toLocaleString("en-IN")}
          hint="Redeemed, reversed, or expired"
        />
        <Stat
          icon={Coins}
          label="Outstanding"
          value={overview.outstanding.toLocaleString("en-IN")}
          hint="What members could still redeem"
          tone="warning"
        />
        <Stat
          icon={Users}
          label="Holders"
          value={overview.holderCount.toLocaleString("en-IN")}
          hint={
            overview.largestBalance > 0
              ? `Largest balance ${overview.largestBalance.toLocaleString("en-IN")}`
              : "Nobody is holding coins"
          }
        />
      </div>

      {/* Expiry is a setting most gyms never touch, so it is stated rather than
          buried: a gym running an unbounded liability should know it is. */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-4 text-sm">
          <Hourglass className="h-4 w-4 text-muted-foreground" />
          {overview.expiryDays > 0 ? (
            <span>
              Coins expire <strong>{overview.expiryDays} days</strong> after they are earned.
            </span>
          ) : (
            <span className="text-muted-foreground">
              Coins never expire. Everything outstanding above stays owed until it is spent —
              set an expiry in gym settings to cap it.
            </span>
          )}
        </CardContent>
      </Card>

      {overview.byReason.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Where they came from, and went</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {overview.byReason.map((row) => (
              <div
                key={row.reason}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium">{reasonLabel(row.reason)}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.entries} {row.entries === 1 ? "entry" : "entries"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-4 tabular-nums">
                  {row.issued > 0 && (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      +{row.issued.toLocaleString("en-IN")}
                    </span>
                  )}
                  {row.spent > 0 && (
                    <span className="text-muted-foreground">
                      −{row.spent.toLocaleString("en-IN")}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Biggest balances</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {holders.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nobody is holding coins yet.
              </p>
            ) : (
              holders.map((holder) => (
                <button
                  key={holder.membershipId}
                  type="button"
                  onClick={() => navigate(`/members/${holder.membershipId}`)}
                  className="flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors hover:border-primary/40"
                >
                  <Avatar className="h-8 w-8 shrink-0">
                    {holder.avatarUrl && <AvatarImage src={holder.avatarUrl} alt="" />}
                    <AvatarFallback>{getInitials(holder.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{holder.name}</p>
                    {holder.memberId != null && (
                      <p className="text-xs text-muted-foreground">#{holder.memberId}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {holder.balance.toLocaleString("en-IN")}
                  </span>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Every transaction
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {activity.length === allActivity.length
                  ? allActivity.length
                  : `${activity.length} of ${allActivity.length}`}
              </span>
            </CardTitle>

            {allActivity.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search a member, staff name, or note"
                    aria-label="Search transactions"
                    className="pl-9"
                  />
                </div>

                {/* Only the reasons this gym has. Offering "Expired" to a gym
                    whose coins never expire is a filter that can only ever
                    return nothing. */}
                <select
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  aria-label="Filter by reason"
                  className="h-9 shrink-0 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50"
                >
                  <option value={ALL_REASONS}>All reasons</option>
                  {reasonOptions.map((value) => (
                    <option key={value} value={value}>
                      {reasonLabel(value)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </CardHeader>
          {/* The whole ledger, scrolled rather than truncated. A preview of the
              last twelve is no use to somebody asking who gave what to whom. */}
          <CardContent className="max-h-[32rem] space-y-2 overflow-y-auto">
            {activity.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No coins have moved yet.
              </p>
            ) : (
              activity.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nothing matches that search.
                </p>
              ) : (
              activity.map((entry) => (
                <div key={entry.id} className="rounded-lg border px-3 py-2 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => navigate(`/members/${entry.membershipId}`)}
                      className="min-w-0 truncate text-left font-medium hover:text-primary hover:underline"
                    >
                      {entry.memberName}
                    </button>
                    <span
                      className={cn(
                        "shrink-0 font-semibold tabular-nums",
                        entry.amount >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-muted-foreground",
                      )}
                    >
                      {entry.amount >= 0 ? "+" : "−"}
                      {Math.abs(entry.amount).toLocaleString("en-IN")}
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    {reasonLabel(entry.reason)}
                    {/* Only a hand adjustment has somebody to name. A coupon or
                        a referral was granted by the rules, and putting a staff
                        name against those would credit a decision nobody made. */}
                    {entry.actedByName && (
                      <>
                        {" by "}
                        {/* Platform staff acting inside a gym they do not belong
                            to have no profile here, so their name stays text
                            rather than a link that would go nowhere. */}
                        {entry.actedByMembershipId ? (
                          <button
                            type="button"
                            onClick={() =>
                              navigate(`/members/${entry.actedByMembershipId}`)
                            }
                            className="font-medium text-foreground hover:text-primary hover:underline"
                          >
                            {entry.actedByName}
                          </button>
                        ) : (
                          <span className="font-medium text-foreground">{entry.actedByName}</span>
                        )}
                      </>
                    )}{" "}
                    · {formatDateTime(entry.createdAt)}
                  </p>

                  {entry.note && (
                    <p className="mt-1 text-xs break-words text-muted-foreground">
                      &ldquo;{entry.note}&rdquo;
                    </p>
                  )}
                </div>
              ))
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
