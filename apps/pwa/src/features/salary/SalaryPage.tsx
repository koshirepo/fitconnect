/**
 * Documentation: Everyone on payroll, for one month.
 *
 * - The admin view of staff pay: what each person is owed this month, what has gone out, and what is left. Opening a row goes to that person's month, where the money is actually recorded.
 * - Somebody with no agreed monthly figure still appears, marked as such. Leaving them out would hide the one thing that needs doing before they can be paid.
 * - Primary exports: SalaryPage.
 */
import { useSearchParams } from "react-router-dom";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { useSalaryList } from "@/api/queries/finance";
import { getApiError } from "@/api/client";
import { getMonthStr, formatMonthLabel, shiftMonth } from "@/lib/month";
import { formatCurrency } from "@/lib/utils";
import { getTenantDashboardPath } from "@/lib/subdomain";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CardSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { AvatarTile, PersonChip } from "@/components/ui/member-card";
import { cn } from "@/lib/utils";
import { BadgeIndianRupee, ChevronLeft, ChevronRight, CircleAlert, Wallet } from "lucide-react";

const STATUS_CLASS: Record<string, string> = {
  PAID: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  PARTIAL: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  PENDING: "bg-muted text-muted-foreground",
};

const STATUS_LABEL: Record<string, string> = {
  PAID: "Paid",
  PARTIAL: "Part paid",
  PENDING: "Unpaid",
};

export default function SalaryPage() {
  const navigate = useAppNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const month = searchParams.get("month") || getMonthStr(new Date());
  const isCurrentMonth = month >= getMonthStr(new Date());

  const query = useSalaryList(month);
  const staff = query.data?.staff ?? [];
  const totals = query.data?.totals;

  const goMonth = (delta: number) => setSearchParams({ month: shiftMonth(month, delta) });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Wallet className="h-6 w-6" />
          Staff salary
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What each person is owed this month, and what has been handed over.
        </p>
      </div>

      {query.isError && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {getApiError(query.error)}
        </p>
      )}

      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => goMonth(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-base font-semibold">{formatMonthLabel(month)}</h2>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => goMonth(1)}
          disabled={isCurrentMonth}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {query.isPending ? (
        <CardSkeleton />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Payable</p>
                <p className="mt-1 text-xl font-bold tabular-nums">
                  {formatCurrency(totals?.payable ?? 0)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Paid</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-emerald-600">
                  {formatCurrency(totals?.paid ?? 0)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Outstanding</p>
                <p
                  className={cn(
                    "mt-1 text-xl font-bold tabular-nums",
                    (totals?.outstanding ?? 0) > 0 ? "text-amber-600" : "text-muted-foreground",
                  )}
                >
                  {formatCurrency(totals?.outstanding ?? 0)}
                </p>
              </CardContent>
            </Card>
          </div>

          {staff.length === 0 ? (
            <EmptyState
              icon={BadgeIndianRupee}
              title="Nobody on payroll yet"
              description="Admins and coaches appear here. Set a monthly amount on somebody to start paying them."
            />
          ) : (
            <Card>
              <CardContent className="p-3 sm:p-4">
                <ul className="divide-y divide-border/60">
                  {staff.map((person) => (
                    <li key={person.membershipId}>
                      <button
                        type="button"
                        className="flex w-full items-start gap-3 rounded-lg py-2.5 text-left transition-colors hover:bg-muted/60"
                        onClick={() =>
                          navigate(
                            getTenantDashboardPath(
                              `/salary/${person.membershipId}?month=${month}`,
                            ),
                          )
                        }
                      >
                        <AvatarTile
                          person={{ name: person.name, avatarUrl: person.avatarUrl }}
                          size="sm"
                          stacked
                          className="h-10 w-10 rounded-lg"
                        />

                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center justify-between gap-2">
                            {person.hasCompensation ? (
                              <PersonChip
                                icon={BadgeIndianRupee}
                                className={STATUS_CLASS[person.status]}
                              >
                                {STATUS_LABEL[person.status]}
                              </PersonChip>
                            ) : (
                              <PersonChip
                                icon={CircleAlert}
                                className="bg-amber-500/10 text-amber-600 dark:text-amber-400"
                              >
                                No salary set
                              </PersonChip>
                            )}
                            <span className="shrink-0 text-[11px] whitespace-nowrap tabular-nums text-muted-foreground">
                              {formatCurrency(person.paid)} / {formatCurrency(person.payable)}
                            </span>
                          </div>

                          <p className="mt-1 truncate text-sm font-medium">
                            <span className="text-muted-foreground">#{person.memberId} </span>
                            {person.name}
                          </p>

                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {person.role}
                            {person.outstanding > 0
                              ? ` · ${formatCurrency(person.outstanding)} outstanding`
                              : ""}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
