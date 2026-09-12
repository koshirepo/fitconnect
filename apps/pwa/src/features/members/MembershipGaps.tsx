/**
 * Documentation: The days a member was covered, and the days they were not.
 *
 * - Answers a question the due date cannot: not "are they lapsed today" but "do they do this every time". A member who takes five days off between every term is a pattern worth seeing, and it is invisible in a list of payments sorted by date.
 * - Built from every payment the member has ever made, not the ten on the page above, because a gap history missing its older half is worse than none — it reports holes where the terms simply were not loaded.
 * - Frozen time is cover, not a gap. Freezing a term pushes its end date out, so a paused fortnight sits inside the window the member paid for, which is exactly what they bought.
 * - The wait between joining and paying the first time is shown apart from the lapses, and left out of the average. It says something about signing up, not about renewing.
 * - Primary exports: MembershipGapsCard.
 */
import { useMembershipCoverage } from "@/api/queries/members";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CalendarRange } from "lucide-react";

/** "12 Mar 2026", the way the rest of this page writes a date. */
function day(value: string) {
  return new Date(`${value}T00:00:00.000Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/** One row of the timeline: a covered term, or the hole after it. */
function Row({
  from,
  to,
  days,
  kind,
  note,
}: {
  from: string;
  to: string;
  days: number;
  kind: "term" | "gap";
  note?: string;
}) {
  const isGap = kind === "gap";

  return (
    <li className="flex items-start gap-3">
      <span
        className={cn(
          "mt-1.5 h-2 w-2 shrink-0 rounded-full",
          isGap ? "bg-amber-500" : "bg-emerald-500",
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <span className={cn("text-sm", isGap ? "text-amber-700 dark:text-amber-400" : "")}>
            {from === to ? day(from) : `${day(from)} → ${day(to)}`}
          </span>
          <span
            className={cn(
              "text-xs font-semibold tabular-nums",
              isGap ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground",
            )}
          >
            {plural(days, "day")}
          </span>
        </div>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </div>
    </li>
  );
}

export function MembershipGapsCard({ membershipId }: { membershipId: string }) {
  const query = useMembershipCoverage(membershipId);
  const coverage = query.data;

  if (query.isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5" />
            Membership gaps
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </CardContent>
      </Card>
    );
  }

  // A member with no paid term and no join date on record has nothing to plot.
  if (!coverage || (coverage.terms.length === 0 && coverage.gaps.length === 0)) {
    return null;
  }

  const { totals } = coverage;

  /**
   * The terms and the gaps woven back into one list, newest first.
   *
   * Two separate lists would make the reader do the interleaving in their head,
   * and the whole point is to see a term, then the hole, then the next term.
   *
   * Newest at the top because the payments table further down this page is
   * ordered that way too, and two histories of the same member running in
   * opposite directions is a good way to misread both. It also puts the row
   * that matters most — where this member stands right now — where the eye
   * lands rather than at the end of a year of history.
   */
  const timeline = [
    ...coverage.terms.map((t) => ({ ...t, kind: "term" as const, note: undefined as string | undefined })),
    ...coverage.gaps.map((g) => ({
      ...g,
      kind: "gap" as const,
      note: g.beforeFirstTerm
        ? "Between joining and the first payment"
        : g.open
          ? "No cover — still running"
          : "No cover between terms",
    })),
  ].sort((a, b) => b.from.localeCompare(a.from));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <CalendarRange className="h-5 w-5" />
          Membership gaps
        </CardTitle>
        <CardDescription className="text-xs">
          Every term this member has paid for, and the days in between. Frozen time counts as
          covered.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Days covered</p>
            <p className="text-base font-bold tabular-nums text-emerald-600">
              {totals.coveredDays}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Days uncovered</p>
            <p
              className={cn(
                "text-base font-bold tabular-nums",
                totals.gapDays > 0 ? "text-amber-600" : "",
              )}
            >
              {totals.gapDays}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Longest gap</p>
            <p className="text-base font-bold tabular-nums">
              {totals.longestGapDays || "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Typical gap</p>
            {/* Null when they have never let a term run out, which is a
                different thing from a gap of zero days. */}
            <p className="text-base font-bold tabular-nums">
              {totals.averageGapDays === null ? "—" : totals.averageGapDays}
            </p>
          </div>
        </div>

        {totals.currentlyUncovered && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            No paid term is running right now.
          </p>
        )}

        {totals.gapCount === 0 ? (
          <p className="text-sm text-muted-foreground">
            Unbroken cover — this member has never let a term run out.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {timeline.map((row) => (
              <Row key={`${row.kind}-${row.from}`} {...row} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
