/**
 * Documentation: Finance and salary API client.
 *
 * - Calls for the gym's books — income, expenses, and the recurring templates they are posted from — and for staff pay.
 * - Amounts are whole rupees everywhere, matching the rest of the app. Nothing here divides by 100.
 * - `salaryApi.mine` takes no membership id on purpose: it answers about whoever is signed in, so a staff member can read their own payslips without holding permission to read anybody else's.
 * - Primary exports: financeApi, salaryApi, and the response types.
 */
import { api } from "./client";
import type { ApiResponse } from "@/types/api";

export type ExpenseCategory =
  | "RENT"
  | "SALARY"
  | "UTILITIES"
  | "EQUIPMENT"
  | "MAINTENANCE"
  | "MARKETING"
  | "SUPPLIES"
  | "TAX"
  | "OTHER";

export type SalaryComponentKind = "BONUS" | "INCENTIVE" | "BENEFIT" | "DEDUCTION";
export type SalaryPaymentMethod = "CASH" | "BANK" | "UPI" | "OTHER";

export type FinanceSummary = {
  month: string;
  income: {
    total: number;
    memberPayments: number;
    memberPaymentCount: number;
    guestStoreSales: number;
    guestStoreCount: number;
  };
  expenses: {
    total: number;
    byCategory: { category: ExpenseCategory; amount: number }[];
    count: number;
    /** A share of `total`, not an addition to it. */
    salaryPaid: number;
  };
  net: number;
  unpostedRecurring: {
    id: string;
    label: string;
    amount: number;
    category: ExpenseCategory;
    dueOn: string;
  }[];
  unpostedTotal: number;
};

export type Expense = {
  id: string;
  label: string;
  amount: number;
  category: ExpenseCategory;
  incurredOn: string;
  note: string | null;
  periodMonth: string | null;
  recurringExpenseId: string | null;
  recurringLabel: string | null;
  /** Set when this row came from a payslip, and cannot be edited here. */
  salaryPaymentId: string | null;
  recordedByName: string | null;
};

export type RecurringExpense = {
  id: string;
  label: string;
  amount: number;
  category: ExpenseCategory;
  dayOfMonth: number;
  isActive: boolean;
  note: string | null;
  dueOn: string;
  postedExpenseId: string | null;
  postedAmount: number | null;
};

export type SalaryComponent = {
  id: string;
  kind: SalaryComponentKind;
  label: string;
  amount: number;
  createdAt: string;
};

export type SalaryPaymentRow = {
  id: string;
  amount: number;
  method: SalaryPaymentMethod;
  paidAt: string;
  note: string | null;
  recordedByName: string | null;
};

export type SalaryCycle = {
  id: string;
  month: string;
  note: string | null;
  baseAmount: number;
  additions: number;
  deductions: number;
  payable: number;
  paid: number;
  outstanding: number;
  status: "PENDING" | "PARTIAL" | "PAID";
  components: SalaryComponent[];
  payments: SalaryPaymentRow[];
  member: {
    membershipId: string;
    memberId: number;
    role: string;
    name: string;
    avatarUrl: string | null;
  };
};

export type SalaryStaffRow = {
  membershipId: string;
  memberId: number;
  name: string;
  avatarUrl: string | null;
  role: string;
  monthlyAmount: number;
  hasCompensation: boolean;
  cycleId: string | null;
  baseAmount: number;
  additions: number;
  deductions: number;
  payable: number;
  paid: number;
  outstanding: number;
  status: "PENDING" | "PARTIAL" | "PAID";
};

export type StaffCompensation = {
  id: string;
  monthlyAmount: number;
  effectiveFrom: string;
  isActive: boolean;
  note: string | null;
};

/**
 * What a salary write sends back.
 *
 * `whatsappText` is rendered by the API but not sent by it — this app has no
 * WhatsApp Business credentials, so the message is handed to the browser to open
 * as a `wa.me` link, the same way member admissions and receipts already work.
 */
export type SalaryWriteResult<T> = T & {
  whatsappText: string | null;
  phone: string | null;
};

export type SalaryMember = {
  membershipId: string;
  memberId: number;
  name: string;
  avatarUrl: string | null;
  role: string;
};

export const financeApi = {
  summary: (tenantId: string, month: string) =>
    api.get<ApiResponse<FinanceSummary>>(`/tenants/${tenantId}/finance/summary`, {
      params: { month },
    }),

  listExpenses: (tenantId: string, month: string) =>
    api.get<ApiResponse<{ month: string; expenses: Expense[]; total: number }>>(
      `/tenants/${tenantId}/finance/expenses`,
      { params: { month } },
    ),

  createExpense: (
    tenantId: string,
    body: {
      label: string;
      amount: number;
      category: ExpenseCategory;
      incurredOn?: string;
      note?: string;
    },
  ) => api.post<ApiResponse<Expense>>(`/tenants/${tenantId}/finance/expenses`, body),

  updateExpense: (
    tenantId: string,
    expenseId: string,
    body: Partial<{
      label: string;
      amount: number;
      category: ExpenseCategory;
      incurredOn: string;
      note: string | null;
    }>,
  ) => api.patch<ApiResponse<Expense>>(`/tenants/${tenantId}/finance/expenses/${expenseId}`, body),

  deleteExpense: (tenantId: string, expenseId: string) =>
    api.delete<ApiResponse<{ id: string }>>(`/tenants/${tenantId}/finance/expenses/${expenseId}`),

  listRecurring: (tenantId: string, month: string) =>
    api.get<ApiResponse<{ month: string; recurring: RecurringExpense[] }>>(
      `/tenants/${tenantId}/finance/recurring`,
      { params: { month } },
    ),

  createRecurring: (
    tenantId: string,
    body: {
      label: string;
      amount: number;
      category: ExpenseCategory;
      dayOfMonth: number;
      note?: string;
    },
  ) => api.post<ApiResponse<RecurringExpense>>(`/tenants/${tenantId}/finance/recurring`, body),

  updateRecurring: (
    tenantId: string,
    recurringId: string,
    body: Partial<{
      label: string;
      amount: number;
      category: ExpenseCategory;
      dayOfMonth: number;
      isActive: boolean;
      note: string | null;
    }>,
  ) =>
    api.patch<ApiResponse<RecurringExpense>>(
      `/tenants/${tenantId}/finance/recurring/${recurringId}`,
      body,
    ),

  deleteRecurring: (tenantId: string, recurringId: string) =>
    api.delete<ApiResponse<{ id: string }>>(
      `/tenants/${tenantId}/finance/recurring/${recurringId}`,
    ),

  postRecurring: (
    tenantId: string,
    recurringId: string,
    body: { month: string; amount?: number; note?: string },
  ) =>
    api.post<ApiResponse<Expense>>(
      `/tenants/${tenantId}/finance/recurring/${recurringId}/post`,
      body,
    ),
};

export const salaryApi = {
  list: (tenantId: string, month: string) =>
    api.get<
      ApiResponse<{
        month: string;
        staff: SalaryStaffRow[];
        totals: { payable: number; paid: number; outstanding: number };
      }>
    >(`/tenants/${tenantId}/salary`, { params: { month } }),

  getCycle: (tenantId: string, membershipId: string, month: string) =>
    api.get<
      ApiResponse<{
        member: SalaryMember;
        compensation: StaffCompensation | null;
        month: string;
        cycle: SalaryCycle | null;
      }>
    >(`/tenants/${tenantId}/salary/staff/${membershipId}`, { params: { month } }),

  /** Whoever is signed in. No id to substitute, so staff can call it for themselves. */
  mine: (tenantId: string) =>
    api.get<
      ApiResponse<{
        member: SalaryMember;
        compensation: StaffCompensation | null;
        cycles: SalaryCycle[];
      }>
    >(`/tenants/${tenantId}/salary/me`),

  history: (tenantId: string, membershipId: string) =>
    api.get<
      ApiResponse<{
        member: SalaryMember;
        compensation: StaffCompensation | null;
        cycles: SalaryCycle[];
      }>
    >(`/tenants/${tenantId}/salary/staff/${membershipId}/history`),

  setCompensation: (
    tenantId: string,
    membershipId: string,
    body: { monthlyAmount: number; effectiveFrom?: string; isActive?: boolean; note?: string | null },
  ) =>
    api.put<ApiResponse<SalaryWriteResult<StaffCompensation>>>(
      `/tenants/${tenantId}/salary/staff/${membershipId}/compensation`,
      body,
    ),

  addComponent: (
    tenantId: string,
    cycleId: string,
    body: { kind: SalaryComponentKind; label: string; amount: number },
  ) =>
    api.post<ApiResponse<SalaryWriteResult<SalaryCycle>>>(
      `/tenants/${tenantId}/salary/cycles/${cycleId}/components`,
      body,
    ),

  removeComponent: (tenantId: string, componentId: string) =>
    api.delete<ApiResponse<SalaryCycle>>(
      `/tenants/${tenantId}/salary/components/${componentId}`,
    ),

  recordPayment: (
    tenantId: string,
    cycleId: string,
    body: { amount: number; method: SalaryPaymentMethod; paidAt?: string; note?: string },
  ) =>
    api.post<ApiResponse<SalaryWriteResult<SalaryCycle>>>(
      `/tenants/${tenantId}/salary/cycles/${cycleId}/payments`,
      body,
    ),

  deletePayment: (tenantId: string, paymentId: string) =>
    api.delete<ApiResponse<SalaryCycle>>(`/tenants/${tenantId}/salary/payments/${paymentId}`),
};
