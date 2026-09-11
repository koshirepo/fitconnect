/**
 * Documentation: The gym's books for a month.
 *
 * - What came in, what went out, and what is left — then the two lists that make up the outgoing side: costs that recur every month, and everything else.
 * - Salary is shown as a share of the expense total rather than added to it. Every salary payment already wrote an expense row, so presenting them as separate figures to be summed would double the gym's apparent spending.
 * - Recurring costs are templates until somebody posts them. The page says plainly what is still unposted rather than quietly including it, because "rent is due and unpaid" and "rent is paid" are different facts and the total must not blur them.
 * - The salary line is a link, on the month being read. It names a figure this page deliberately will not break down, and the page that does was previously reachable only by knowing it existed.
 * - Laid out for a phone: the summary pairs off two-up with net across the bottom, and a recurring row keeps its amount beside its name while Pause and Delete shrink to icons. Five controls on one line fit a desktop and nothing else.
 * - Primary exports: ExpensesPage.
 */
import * as React from "react";
import { PageHeader } from "@/components/ui/page-header";
import { useSearchParams } from "react-router-dom";
import { useAppNavigate } from "@/lib/use-app-navigate";
import {
  useCreateExpense,
  useCreateRecurringExpense,
  useDeleteExpense,
  useDeleteRecurringExpense,
  useExpenses,
  useFinanceSummary,
  usePostRecurringExpense,
  useRecurringExpenses,
  useUpdateRecurringExpense,
} from "@/api/queries/finance";
import type { ExpenseCategory } from "@/api/finance";
import { getApiError } from "@/api/client";
import { getMonthStr, formatMonthLabel, withMonth } from "@/lib/month";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getTenantDashboardPath } from "@/lib/subdomain";
import { downloadCsv } from "@/lib/csv";
import { usePermissions } from "@/features/auth/permission-gate";
import { Permission } from "@fitconnect/shared/types/permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CardSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { MonthNav } from "@/components/ui/month-nav";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { IncomeBySourceCard, StoreProfitCard } from "./IncomeBreakdown";
import {
  BadgeIndianRupee,
  ChevronRight,
  Download,
  IndianRupee,
  Pause,
  Play,
  Plus,
  Receipt,
  Repeat,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";

const CATEGORIES: ExpenseCategory[] = [
  "RENT",
  "SALARY",
  "UTILITIES",
  "EQUIPMENT",
  "MAINTENANCE",
  "MARKETING",
  "SUPPLIES",
  "TAX",
  "OTHER",
];

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  RENT: "Rent",
  SALARY: "Salary",
  UTILITIES: "Utilities",
  EQUIPMENT: "Equipment",
  MAINTENANCE: "Maintenance",
  MARKETING: "Marketing",
  SUPPLIES: "Supplies",
  TAX: "Tax",
  OTHER: "Other",
};

/** A whole-rupee amount, or null when the box does not hold one yet. */
function parseAmount(value: string) {
  const n = Number(value);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : null;
}

export default function ExpensesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useAppNavigate();
  const toast = useToast();
  const { can } = usePermissions();
  const canManage = can(Permission.FINANCE_MANAGE);
  const canReadSalary = can(Permission.SALARY_READ);

  const month = searchParams.get("month") || getMonthStr(new Date());

  const summaryQuery = useFinanceSummary(month);
  const expensesQuery = useExpenses(month);
  const recurringQuery = useRecurringExpenses(month);

  const createExpense = useCreateExpense();
  const deleteExpense = useDeleteExpense();
  const createRecurring = useCreateRecurringExpense();
  const updateRecurring = useUpdateRecurringExpense();
  const deleteRecurring = useDeleteRecurringExpense();
  const postRecurring = usePostRecurringExpense();

  const [showExpenseForm, setShowExpenseForm] = React.useState(false);
  const [showRecurringForm, setShowRecurringForm] = React.useState(false);
  const [removingExpense, setRemovingExpense] = React.useState<{
    id: string;
    label: string;
  } | null>(null);
  const [removingRecurring, setRemovingRecurring] = React.useState<{
    id: string;
    label: string;
  } | null>(null);

  const [label, setLabel] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [category, setCategory] = React.useState<ExpenseCategory>("OTHER");

  const [rLabel, setRLabel] = React.useState("");
  const [rAmount, setRAmount] = React.useState("");
  const [rCategory, setRCategory] = React.useState<ExpenseCategory>("RENT");
  const [rDay, setRDay] = React.useState("1");

  const summary = summaryQuery.data;
  const expenses = expensesQuery.data?.expenses ?? [];
  const recurring = recurringQuery.data?.recurring ?? [];

  /** The month a payroll link should land on — this one, not today's. */
  const salaryPath = getTenantDashboardPath(withMonth("/salary", month));

  /**
   * This month's spending, as a file.
   *
   * The books are the thing an accountant asks for, and this page had no way
   * to hand them over. Rows are what the month actually holds, so a salary line
   * exports as a salary line rather than being quietly folded away.
   */
  const handleExport = () => {
    if (expenses.length === 0) return;

    downloadCsv(
      `expenses-${month}.csv`,
      ["Date", "Label", "Category", "Amount", "RecordedBy", "FromRecurring", "SalaryPayment"],
      expenses.map((row) => ({
        Date: row.incurredOn,
        Label: row.label,
        Category: CATEGORY_LABELS[row.category],
        Amount: row.amount,
        RecordedBy: row.recordedByName ?? "",
        FromRecurring: row.recurringLabel ?? "",
        SalaryPayment: row.salaryPaymentId ? "Yes" : "",
      })),
    );
  };

  const resetExpenseForm = () => {
    setLabel("");
    setAmount("");
    setCategory("OTHER");
    setShowExpenseForm(false);
  };

  const submitExpense = async () => {
    const value = parseAmount(amount);
    if (!label.trim() || !value) {
      toast.error("A name and a whole-rupee amount are needed.");
      return;
    }

    try {
      await createExpense.mutateAsync({ label: label.trim(), amount: value, category });
      toast.success("Expense recorded.");
      resetExpenseForm();
    } catch (err) {
      toast.error(getApiError(err));
    }
  };

  const submitRecurring = async () => {
    const value = parseAmount(rAmount);
    const day = Number(rDay);
    if (!rLabel.trim() || !value || !Number.isInteger(day) || day < 1 || day > 31) {
      toast.error("A name, a whole-rupee amount and a day between 1 and 31 are needed.");
      return;
    }

    try {
      await createRecurring.mutateAsync({
        label: rLabel.trim(),
        amount: value,
        category: rCategory,
        dayOfMonth: day,
      });
      toast.success("Fixed expense added.");
      setRLabel("");
      setRAmount("");
      setRDay("1");
      setShowRecurringForm(false);
    } catch (err) {
      toast.error(getApiError(err));
    }
  };

  const post = async (recurringId: string, label: string) => {
    try {
      await postRecurring.mutateAsync({ recurringId, month });
      toast.success(`${label} posted for ${formatMonthLabel(month)}.`);
    } catch (err) {
      toast.error(getApiError(err));
    }
  };

  const loading = summaryQuery.isPending || expensesQuery.isPending || recurringQuery.isPending;
  const error = summaryQuery.isError ? getApiError(summaryQuery.error) : "";

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        icon={Wallet}
        title="Income &amp; expenses"
        description="What came in, what went out, what is left."
        actions={
          <>
            <Button
              variant="outline"
              className="shrink-0"
              onClick={handleExport}
              disabled={expenses.length === 0}
              aria-label={`Download ${formatMonthLabel(month)} expenses as CSV`}
              title={`Download ${formatMonthLabel(month)} expenses as CSV`}
            >
              <Download className="h-4 w-4" />
            </Button>
          </>
        }
      />

      {error && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <MonthNav month={month} onMonthChange={(next) => setSearchParams({ month: next })} />

      {loading ? (
        <CardSkeleton />
      ) : (
        <>
          {/* The three numbers the page exists for. Income and expenses pair
              off on a phone; net takes the full width under them, because it
              is the answer and the other two are its working. */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
            <Card>
              <CardContent>
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground sm:text-xs">
                  <TrendingUp className="size-3.5 shrink-0 text-emerald-600" />
                  Income
                </p>
                <p className="mt-1 truncate text-lg font-bold tabular-nums text-emerald-600 sm:text-xl">
                  {formatCurrency(summary?.income.total ?? 0)}
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground sm:text-[11px]">
                  {summary?.income.memberPaymentCount ?? 0} member payments
                  {(summary?.income.guestStoreCount ?? 0) > 0
                    ? ` · ${summary?.income.guestStoreCount} counter sales`
                    : ""}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground sm:text-xs">
                  <TrendingDown className="size-3.5 shrink-0 text-red-600" />
                  Expenses
                </p>
                <p className="mt-1 truncate text-lg font-bold tabular-nums text-red-600 sm:text-xl">
                  {formatCurrency(summary?.expenses.total ?? 0)}
                </p>
                {/* Part of the figure above, not on top of it — and now a way
                    through to the page that explains it, on the same month.
                    The line stated a number the reader could not go and check. */}
                {canReadSalary ? (
                  <button
                    type="button"
                    onClick={() => navigate(salaryPath)}
                    className="mt-1 flex items-center gap-0.5 text-left text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline sm:text-[11px]"
                  >
                    includes {formatCurrency(summary?.expenses.salaryPaid ?? 0)} salary
                    <ChevronRight className="size-3 shrink-0" />
                  </button>
                ) : (
                  <p className="mt-1 text-[10px] text-muted-foreground sm:text-[11px]">
                    includes {formatCurrency(summary?.expenses.salaryPaid ?? 0)} salary
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="col-span-2 sm:col-span-1">
              <CardContent>
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground sm:text-xs">
                  <IndianRupee className="size-3.5 shrink-0" />
                  Net
                </p>
                <p
                  className={cn(
                    "mt-1 truncate text-lg font-bold tabular-nums sm:text-xl",
                    (summary?.net ?? 0) >= 0 ? "text-emerald-600" : "text-red-600",
                  )}
                >
                  {formatCurrency(summary?.net ?? 0)}
                </p>
                {(summary?.unpostedTotal ?? 0) > 0 && (
                  <p className="mt-1 text-[10px] text-amber-600 sm:text-[11px]">
                    {formatCurrency(summary?.unpostedTotal ?? 0)} of fixed costs not yet posted
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Money in by what paid for it, and what the store made. Both come
              from the same summary as the tiles above, so the figures agree. */}
          {summary && (summary.income.bySource || summary.store) && (
            <div className="grid gap-2.5 sm:gap-3 lg:grid-cols-2">
              <IncomeBySourceCard income={summary.income} />
              {summary.store && <StoreProfitCard store={summary.store} />}
            </div>
          )}

          {/* Fixed monthly costs */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="flex items-center gap-2">
                <Repeat className="h-4 w-4" />
                Fixed monthly
              </CardTitle>
              {canManage && (
                <Button size="sm" variant="outline" onClick={() => setShowRecurringForm((v) => !v)}>
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {showRecurringForm && canManage && (
                <div className="space-y-3 rounded-lg border border-dashed p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="r-label">What is it</Label>
                      <Input
                        id="r-label"
                        value={rLabel}
                        onChange={(e) => setRLabel(e.target.value)}
                        placeholder="Shop rent"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="r-amount">Amount (₹)</Label>
                      <Input
                        id="r-amount"
                        inputMode="numeric"
                        value={rAmount}
                        onChange={(e) => setRAmount(e.target.value)}
                        placeholder="20000"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="r-category">Category</Label>
                      <select
                        id="r-category"
                        className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                        value={rCategory}
                        onChange={(e) => setRCategory(e.target.value as ExpenseCategory)}
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {CATEGORY_LABELS[c]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="r-day">Due on day</Label>
                      <Input
                        id="r-day"
                        inputMode="numeric"
                        value={rDay}
                        onChange={(e) => setRDay(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={submitRecurring}
                      disabled={createRecurring.isPending}
                    >
                      {createRecurring.isPending ? "Saving..." : "Save"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowRecurringForm(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {recurring.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">
                  Nothing recurring yet. Rent, electricity and the like go here so each month can be
                  posted with one tap.
                </p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {/* Four controls used to share one row with the label and the
                      amount, which does not fit a phone. The amount now sits
                      with the name, and Pause and Delete are icons — the row
                      reads left to right as: what, how much, what to do. */}
                  {recurring.map((row) => (
                    <li key={row.id} className="flex items-center gap-2 py-2.5 sm:gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate text-sm font-medium">
                            {row.label}
                            {!row.isActive && (
                              <span className="ml-1.5 text-[11px] text-muted-foreground">
                                paused
                              </span>
                            )}
                          </p>
                          <span className="shrink-0 text-sm font-semibold tabular-nums">
                            {formatCurrency(row.amount)}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {CATEGORY_LABELS[row.category]} · due {formatDate(row.dueOn)}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-0.5">
                        {row.postedExpenseId ? (
                          <Badge variant="secondary">Posted</Badge>
                        ) : canManage && row.isActive ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => post(row.id, row.label)}
                            disabled={postRecurring.isPending}
                          >
                            Post
                          </Button>
                        ) : null}

                        {canManage && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="size-9 p-0"
                              aria-label={
                                row.isActive ? `Pause ${row.label}` : `Resume ${row.label}`
                              }
                              title={row.isActive ? "Pause" : "Resume"}
                              onClick={() =>
                                updateRecurring.mutateAsync({
                                  recurringId: row.id,
                                  data: { isActive: !row.isActive },
                                })
                              }
                            >
                              {row.isActive ? (
                                <Pause className="size-3.5" />
                              ) : (
                                <Play className="size-3.5" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="size-9 p-0 text-destructive"
                              aria-label={`Remove ${row.label}`}
                              title="Remove"
                              onClick={() => setRemovingRecurring({ id: row.id, label: row.label })}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Everything else */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="flex min-w-0 items-center gap-2">
                <Receipt className="size-4 shrink-0" />
                <span className="truncate">Spent this month</span>
                <span className="shrink-0 text-xs font-normal tabular-nums text-muted-foreground">
                  {formatCurrency(expensesQuery.data?.total ?? 0)}
                </span>
              </CardTitle>
              {canManage && (
                <Button size="sm" variant="outline" onClick={() => setShowExpenseForm((v) => !v)}>
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {showExpenseForm && canManage && (
                <div className="space-y-3 rounded-lg border border-dashed p-3">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label htmlFor="e-label">What was it for</Label>
                      <Input
                        id="e-label"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        placeholder="Treadmill belt"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="e-amount">Amount (₹)</Label>
                      <Input
                        id="e-amount"
                        inputMode="numeric"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="2500"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="e-category">Category</Label>
                      <select
                        id="e-category"
                        className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                        value={category}
                        onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {CATEGORY_LABELS[c]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={submitExpense} disabled={createExpense.isPending}>
                      {createExpense.isPending ? "Saving..." : "Save"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={resetExpenseForm}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {expenses.length === 0 ? (
                <EmptyState
                  icon={Receipt}
                  title="Nothing spent yet this month"
                  description="Post a fixed cost above, or add a one-off expense."
                />
              ) : (
                <ul className="divide-y divide-border/60">
                  {expenses.map((row) => (
                    <li key={row.id} className="flex items-center gap-2 py-2.5 sm:gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{row.label}</p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {CATEGORY_LABELS[row.category]} · {formatDate(row.incurredOn)}
                          {row.recordedByName ? ` · by ${row.recordedByName}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">
                        {formatCurrency(row.amount)}
                      </span>
                      {/* A salary row is written by the payslip and cannot be
                          unpicked from here, so it gets a way through to the
                          page that owns it instead of a delete it must refuse. */}
                      {row.salaryPaymentId ? (
                        canReadSalary && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="size-9 shrink-0 p-0"
                            aria-label={`Open payroll for ${formatMonthLabel(month)}`}
                            title="Recorded on a payslip"
                            onClick={() => navigate(salaryPath)}
                          >
                            <BadgeIndianRupee className="size-3.5 text-muted-foreground" />
                          </Button>
                        )
                      ) : canManage ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="size-9 shrink-0 p-0 text-destructive"
                          aria-label={`Remove ${row.label}`}
                          title="Remove"
                          onClick={() => setRemovingExpense({ id: row.id, label: row.label })}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <ConfirmDialog
        open={Boolean(removingExpense)}
        onOpenChange={(open) => !open && setRemovingExpense(null)}
        title="Remove this expense?"
        description={`"${removingExpense?.label ?? ""}" will be taken off this month's books.`}
        confirmLabel="Remove"
        onConfirm={async () => {
          if (!removingExpense) return;
          try {
            await deleteExpense.mutateAsync(removingExpense.id);
            toast.success("Expense removed.");
          } catch (err) {
            toast.error(getApiError(err));
          } finally {
            setRemovingExpense(null);
          }
        }}
      />

      <ConfirmDialog
        open={Boolean(removingRecurring)}
        onOpenChange={(open) => !open && setRemovingRecurring(null)}
        title="Remove this fixed expense?"
        description={`"${removingRecurring?.label ?? ""}" will stop appearing each month. Months already posted from it stay on the books.`}
        confirmLabel="Remove"
        onConfirm={async () => {
          if (!removingRecurring) return;
          try {
            await deleteRecurring.mutateAsync(removingRecurring.id);
            toast.success("Fixed expense removed.");
          } catch (err) {
            toast.error(getApiError(err));
          } finally {
            setRemovingRecurring(null);
          }
        }}
      />
    </div>
  );
}
