/**
 * Documentation: Everyone on payroll, for one month.
 *
 * - The admin view of staff pay: what each person is owed this month, what has gone out, and what is left. Opening a row goes to that person's month, where the money is actually recorded.
 * - Somebody with no agreed monthly figure still appears, marked as such. Leaving them out would hide the one thing that needs doing before they can be paid.
 * - Laid out for a phone: payable and paid pair off with outstanding across the bottom, and each person's row carries its own progress bar, so "how far through payroll am I" is answerable without opening anybody.
 * - Primary exports: SalaryPage.
 */
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/ui/page-header";
import { useAppNavigate } from "@/lib/use-app-navigate";
import { useSalaryList } from "@/api/queries/finance";
import { getApiError } from "@/api/client";
import { getMonthStr, formatMonthLabel, withMonth } from "@/lib/month";
import { formatCurrency } from "@/lib/utils";
import { getTenantDashboardPath } from "@/lib/subdomain";
import { downloadCsv } from "@/lib/csv";
import { usePermissions } from "@/features/auth/permission-gate";
import { Permission } from "@fitconnect/shared/types/permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CardSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { MonthNav } from "@/components/ui/month-nav";
import { AvatarTile, PersonChip } from "@/components/ui/member-card";
import { cn } from "@/lib/utils";
import { BadgeIndianRupee, CircleAlert, Download, Wallet } from "lucide-react";

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
  const { can } = usePermissions();
  const canReadBooks = can(Permission.FINANCE_READ);

  const month = searchParams.get("month") || getMonthStr(new Date());

  const query = useSalaryList(month);
  const staff = query.data?.staff ?? [];
  const totals = query.data?.totals;

  /** How much of the month's payroll has actually gone out, 0–100. */
  const paidPercent =
    totals && totals.payable > 0 ? Math.round((totals.paid / totals.payable) * 100) : 0;

  /**
   * The month's payroll, as a file.
   *
   * One row per person including anybody with no agreed figure, who exports as
   * a zero rather than being dropped — they are the row that needs acting on.
   */
  const handleExport = () => {
    if (staff.length === 0) return;

    downloadCsv(
      `salary-${month}.csv`,
      ["MemberId", "Name", "Role", "Monthly", "Payable", "Paid", "Outstanding", "Status"],
      staff.map((person) => ({
        MemberId: person.memberId,
        Name: person.name,
        Role: person.role,
        Monthly: person.hasCompensation ? person.monthlyAmount : "",
        Payable: person.payable,
        Paid: person.paid,
        Outstanding: person.outstanding,
        Status: person.hasCompensation ? STATUS_LABEL[person.status] : "No salary set",
      })),
    );
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        icon={Wallet}
        title="Staff salary"
        description="What each person is owed, and what has gone out."
        actions={
          <>
            <div className="flex shrink-0 items-center gap-2">
              {/* The other half of the same month's books. This page and the
                        expense page each showed a figure the other explains, with no way
                        across between them. */}
              {canReadBooks && (
                <Button
                  variant="outline"
                  onClick={() => navigate(getTenantDashboardPath(withMonth("/expenses", month)))}
                  aria-label="Income and expenses for this month"
                  title="Income & expenses"
                >
                  <Wallet className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="outline"
                onClick={handleExport}
                disabled={staff.length === 0}
                aria-label={`Download ${formatMonthLabel(month)} payroll as CSV`}
                title={`Download ${formatMonthLabel(month)} payroll as CSV`}
              >
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </>
        }
      />

      {query.isError && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {getApiError(query.error)}
        </p>
      )}

      <MonthNav month={month} onMonthChange={(next) => setSearchParams({ month: next })} />

      {query.isPending ? (
        <CardSkeleton />
      ) : (
        <>
          {/* Payable and paid pair off on a phone; outstanding takes the full
              width under them, since it is the number that decides whether
              anybody still has to do something today. */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
            <Card>
              <CardContent>
                <p className="text-[11px] text-muted-foreground sm:text-xs">Payable</p>
                <p className="mt-1 truncate text-lg font-bold tabular-nums sm:text-xl">
                  {formatCurrency(totals?.payable ?? 0)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <p className="text-[11px] text-muted-foreground sm:text-xs">Paid</p>
                <p className="mt-1 truncate text-lg font-bold tabular-nums text-emerald-600 sm:text-xl">
                  {formatCurrency(totals?.paid ?? 0)}
                </p>
              </CardContent>
            </Card>
            <Card className="col-span-2 sm:col-span-1">
              <CardContent>
                <p className="text-[11px] text-muted-foreground sm:text-xs">Outstanding</p>
                <p
                  className={cn(
                    "mt-1 truncate text-lg font-bold tabular-nums sm:text-xl",
                    (totals?.outstanding ?? 0) > 0 ? "text-amber-600" : "text-muted-foreground",
                  )}
                >
                  {formatCurrency(totals?.outstanding ?? 0)}
                </p>
                {(totals?.payable ?? 0) > 0 && (
                  <>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-[width]"
                        style={{ width: `${paidPercent}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground sm:text-[11px]">
                      {paidPercent}% of this month's payroll paid
                    </p>
                  </>
                )}
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
                  {staff.map((person) => {
                    const percent =
                      person.payable > 0
                        ? Math.min(100, Math.round((person.paid / person.payable) * 100))
                        : 0;

                    return (
                      <li key={person.membershipId}>
                        <button
                          type="button"
                          className="flex w-full items-start gap-3 rounded-lg py-2.5 text-left transition-colors hover:bg-muted/60"
                          onClick={() =>
                            navigate(
                              getTenantDashboardPath(
                                withMonth(`/salary/${person.membershipId}`, month),
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
                              <span className="shrink-0 text-[10px] whitespace-nowrap tabular-nums text-muted-foreground sm:text-[11px]">
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

                            {/* Two currency figures side by side take reading;
                                the bar answers "is this person done" at a
                                glance, which is what scanning payroll on a
                                phone is actually for. */}
                            {person.payable > 0 && (
                              <div
                                className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted"
                                role="presentation"
                              >
                                <div
                                  className={cn(
                                    "h-full rounded-full",
                                    percent >= 100 ? "bg-emerald-500" : "bg-amber-500",
                                  )}
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
