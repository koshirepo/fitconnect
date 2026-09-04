/**
 * Documentation: Finance and salary queries.
 *
 * - Reads and writes for the gym's books and for staff pay.
 * - Every salary write invalidates the finance keys as well. Paying somebody writes an expense row, so a books page left on its old cache would show a month that has already changed — the two features share a ledger and have to share their invalidation.
 * - Primary exports: the `useFinance*` and `useSalary*` hooks.
 */
import { financeApi, salaryApi } from "@/api/finance";
import type {
  ExpenseCategory,
  SalaryComponentKind,
  SalaryPaymentMethod,
} from "@/api/finance";
import { queryKeys } from "@/lib/query-keys";
import { unwrap, useCurrentTenantId, useTenantMutation, useTenantQuery } from "./shared";

export function useFinanceSummary(month: string) {
  return useTenantQuery(
    (tenantId) => queryKeys.finance.summary(tenantId, month),
    async (tenantId) => unwrap(await financeApi.summary(tenantId, month)),
  );
}

export function useExpenses(month: string) {
  return useTenantQuery(
    (tenantId) => queryKeys.finance.expenses(tenantId, month),
    async (tenantId) => unwrap(await financeApi.listExpenses(tenantId, month)),
  );
}

export function useRecurringExpenses(month: string) {
  return useTenantQuery(
    (tenantId) => queryKeys.finance.recurring(tenantId, month),
    async (tenantId) => unwrap(await financeApi.listRecurring(tenantId, month)),
  );
}

/** Everything the books show, so one write refreshes the whole page. */
function financeKeys(tenantId: string | null | undefined) {
  return tenantId ? [queryKeys.finance.all(tenantId)] : [];
}

export function useCreateExpense() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (
      tid,
      body: {
        label: string;
        amount: number;
        category: ExpenseCategory;
        incurredOn?: string;
        note?: string;
      },
    ) => unwrap(await financeApi.createExpense(tid, body)),
    { invalidates: financeKeys(tenantId) },
  );
}

export function useUpdateExpense() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (
      tid,
      vars: {
        expenseId: string;
        data: Partial<{
          label: string;
          amount: number;
          category: ExpenseCategory;
          incurredOn: string;
          note: string | null;
        }>;
      },
    ) => unwrap(await financeApi.updateExpense(tid, vars.expenseId, vars.data)),
    { invalidates: financeKeys(tenantId) },
  );
}

export function useDeleteExpense() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (tid, expenseId: string) => unwrap(await financeApi.deleteExpense(tid, expenseId)),
    { invalidates: financeKeys(tenantId) },
  );
}

export function useCreateRecurringExpense() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (
      tid,
      body: {
        label: string;
        amount: number;
        category: ExpenseCategory;
        dayOfMonth: number;
        note?: string;
      },
    ) => unwrap(await financeApi.createRecurring(tid, body)),
    { invalidates: financeKeys(tenantId) },
  );
}

export function useUpdateRecurringExpense() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (
      tid,
      vars: {
        recurringId: string;
        data: Partial<{
          label: string;
          amount: number;
          category: ExpenseCategory;
          dayOfMonth: number;
          isActive: boolean;
          note: string | null;
        }>;
      },
    ) => unwrap(await financeApi.updateRecurring(tid, vars.recurringId, vars.data)),
    { invalidates: financeKeys(tenantId) },
  );
}

export function useDeleteRecurringExpense() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (tid, recurringId: string) => unwrap(await financeApi.deleteRecurring(tid, recurringId)),
    { invalidates: financeKeys(tenantId) },
  );
}

export function usePostRecurringExpense() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (tid, vars: { recurringId: string; month: string; amount?: number; note?: string }) =>
      unwrap(
        await financeApi.postRecurring(tid, vars.recurringId, {
          month: vars.month,
          amount: vars.amount,
          note: vars.note,
        }),
      ),
    { invalidates: financeKeys(tenantId) },
  );
}

// ─── Staff pay ───────────────────────────────────────────────────────────────

export function useSalaryList(month: string) {
  return useTenantQuery(
    (tenantId) => queryKeys.salary.list(tenantId, month),
    async (tenantId) => unwrap(await salaryApi.list(tenantId, month)),
  );
}

export function useSalaryCycle(membershipId: string | undefined, month: string) {
  return useTenantQuery(
    (tenantId) => queryKeys.salary.cycle(tenantId, membershipId ?? "none", month),
    async (tenantId) => unwrap(await salaryApi.getCycle(tenantId, membershipId!, month)),
    { enabled: Boolean(membershipId) },
  );
}

/** The signed-in staff member's own payslips. */
export function useMySalary() {
  return useTenantQuery(
    (tenantId) => queryKeys.salary.mine(tenantId),
    async (tenantId) => unwrap(await salaryApi.mine(tenantId)),
  );
}

export function useSalaryHistory(membershipId: string | undefined) {
  return useTenantQuery(
    (tenantId) => queryKeys.salary.history(tenantId, membershipId ?? "none"),
    async (tenantId) => unwrap(await salaryApi.history(tenantId, membershipId!)),
    { enabled: Boolean(membershipId) },
  );
}

/**
 * Pay writes to both ledgers, so both caches go.
 *
 * A salary payment creates an expense row; refreshing only the payslip would
 * leave the books showing a month that has already moved.
 */
function payKeys(tenantId: string | null | undefined) {
  return tenantId ? [queryKeys.salary.all(tenantId), queryKeys.finance.all(tenantId)] : [];
}

export function useSetCompensation() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (
      tid,
      vars: {
        membershipId: string;
        monthlyAmount: number;
        isActive?: boolean;
        note?: string | null;
      },
    ) =>
      unwrap(
        await salaryApi.setCompensation(tid, vars.membershipId, {
          monthlyAmount: vars.monthlyAmount,
          isActive: vars.isActive,
          note: vars.note,
        }),
      ),
    { invalidates: payKeys(tenantId) },
  );
}

export function useAddSalaryComponent() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (
      tid,
      vars: { cycleId: string; kind: SalaryComponentKind; label: string; amount: number },
    ) =>
      unwrap(
        await salaryApi.addComponent(tid, vars.cycleId, {
          kind: vars.kind,
          label: vars.label,
          amount: vars.amount,
        }),
      ),
    { invalidates: payKeys(tenantId) },
  );
}

export function useRemoveSalaryComponent() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (tid, componentId: string) => unwrap(await salaryApi.removeComponent(tid, componentId)),
    { invalidates: payKeys(tenantId) },
  );
}

export function useRecordSalaryPayment() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (
      tid,
      vars: { cycleId: string; amount: number; method: SalaryPaymentMethod; note?: string },
    ) =>
      unwrap(
        await salaryApi.recordPayment(tid, vars.cycleId, {
          amount: vars.amount,
          method: vars.method,
          note: vars.note,
        }),
      ),
    { invalidates: payKeys(tenantId) },
  );
}

export function useDeleteSalaryPayment() {
  const tenantId = useCurrentTenantId();
  return useTenantMutation(
    async (tid, paymentId: string) => unwrap(await salaryApi.deletePayment(tid, paymentId)),
    { invalidates: payKeys(tenantId) },
  );
}
