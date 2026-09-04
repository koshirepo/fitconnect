/**
 * Documentation: A staff member's own payslips.
 *
 * - Every month they have been paid for, newest first: what it came to, what was added or taken off, and each payment as it was handed over.
 * - Read-only by design. This is the half of the feature the person being paid sees, and it answers "what am I owed" without giving them anything to change.
 * - It calls the endpoint that takes no membership id, so it works for anybody on payroll without them holding permission to read a colleague's pay.
 * - Primary exports: MySalaryPage.
 */
import { useMySalary } from "@/api/queries/finance";
import { getApiError } from "@/api/client";
import { formatMonthLabel } from "@/lib/month";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CardSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { PersonChip } from "@/components/ui/member-card";
import { cn } from "@/lib/utils";
import { BadgeIndianRupee, Wallet } from "lucide-react";

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

export default function MySalaryPage() {
  const query = useMySalary();
  const data = query.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Wallet className="h-6 w-6" />
          My salary
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What you are owed each month, and what has been paid.
        </p>
      </div>

      {query.isError && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {getApiError(query.error)}
        </p>
      )}

      {query.isPending ? (
        <CardSkeleton />
      ) : !data?.compensation && (data?.cycles.length ?? 0) === 0 ? (
        <EmptyState
          icon={BadgeIndianRupee}
          title="No salary on file"
          description="Once the gym sets your monthly amount, your payslips appear here."
        />
      ) : (
        <>
          {data?.compensation && (
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Monthly salary</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">
                  {formatCurrency(data.compensation.monthlyAmount)}
                </p>
              </CardContent>
            </Card>
          )}

          {data?.cycles.length === 0 ? (
            <EmptyState
              icon={BadgeIndianRupee}
              title="No months recorded yet"
              description="Your first payslip appears once the gym opens a pay month for you."
            />
          ) : (
            data?.cycles.map((cycle) => (
              <Card key={cycle.id}>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                  <CardTitle className="text-base">{formatMonthLabel(cycle.month)}</CardTitle>
                  <PersonChip icon={BadgeIndianRupee} className={STATUS_CLASS[cycle.status]}>
                    {STATUS_LABEL[cycle.status]}
                  </PersonChip>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Base</span>
                      <span className="tabular-nums">{formatCurrency(cycle.baseAmount)}</span>
                    </div>

                    {cycle.components.map((component) => (
                      <div
                        key={component.id}
                        className={cn(
                          "flex justify-between",
                          component.kind === "DEDUCTION" ? "text-red-600" : "text-emerald-600",
                        )}
                      >
                        <span className="truncate">{component.label}</span>
                        <span className="shrink-0 tabular-nums">
                          {component.kind === "DEDUCTION" ? "−" : "+"}{" "}
                          {formatCurrency(component.amount)}
                        </span>
                      </div>
                    ))}

                    <div className="flex justify-between border-t pt-1 font-semibold">
                      <span>Payable</span>
                      <span className="tabular-nums">{formatCurrency(cycle.payable)}</span>
                    </div>
                    <div className="flex justify-between text-emerald-600">
                      <span>Paid</span>
                      <span className="tabular-nums">{formatCurrency(cycle.paid)}</span>
                    </div>
                    {cycle.outstanding > 0 && (
                      <div className="flex justify-between font-semibold text-amber-600">
                        <span>Outstanding</span>
                        <span className="tabular-nums">{formatCurrency(cycle.outstanding)}</span>
                      </div>
                    )}
                  </div>

                  {cycle.payments.length > 0 && (
                    <div className="border-t pt-2">
                      <p className="mb-1 text-xs font-medium text-muted-foreground">Payments</p>
                      <ul className="space-y-1">
                        {cycle.payments.map((payment) => (
                          <li key={payment.id} className="flex justify-between text-[11px]">
                            <span className="truncate text-muted-foreground">
                              {formatDate(payment.paidAt)} · {payment.method}
                              {payment.note ? ` · ${payment.note}` : ""}
                            </span>
                            <span className="shrink-0 tabular-nums">
                              {formatCurrency(payment.amount)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </>
      )}
    </div>
  );
}
