/**
 * Documentation: Finance repository.
 *
 * - Prisma queries for the gym's books: expenses, the recurring templates they are posted from, and the income figures the summary is built out of.
 * - Income deliberately reads two sources and not three. A member's store order already writes a `Payment` row — see `StoreOrder.paymentId` — so summing payments and orders together would count every member sale twice. Only guest orders, which write no payment, are added on top.
 * - Month bounds are half-open: `>= first of the month` and `< first of the next`. An inclusive upper bound built from "last day of month" silently drops anything recorded during that final day.
 * - Primary exports: financeRepository, monthRange.
 */
import { prisma } from "../../lib/prisma";
import { PaymentStatus } from "@fitconnect/shared/types/enums";
import type {
  CreateExpenseInput,
  CreateRecurringExpenseInput,
  UpdateExpenseInput,
  UpdateRecurringExpenseInput,
} from "./finance.schema";

const recordedBySelect = {
  id: true,
  memberId: true,
  user: { select: { name: true, avatarUrl: true } },
} as const;

/** The half-open [from, to) bounds of a "YYYY-MM" month. */
export function monthRange(month: string) {
  const [year, mon] = month.split("-").map(Number);
  return {
    from: new Date(Date.UTC(year, mon - 1, 1)),
    to: new Date(Date.UTC(year, mon, 1)),
  };
}

export const financeRepository = {
  listExpenses(tenantId: string, month: string) {
    const { from, to } = monthRange(month);
    return prisma.expense.findMany({
      where: { tenantId, incurredOn: { gte: from, lt: to } },
      orderBy: { incurredOn: "desc" },
      include: {
        recordedBy: { select: recordedBySelect },
        recurringExpense: { select: { id: true, label: true } },
        salaryPayment: { select: { id: true, cycleId: true } },
      },
    });
  },

  findExpense(tenantId: string, expenseId: string) {
    return prisma.expense.findFirst({
      where: { id: expenseId, tenantId },
      include: { salaryPayment: { select: { id: true } } },
    });
  },

  createExpense(
    tenantId: string,
    // The date arrives as a string on the wire and as a Date here, so the field
    // is replaced rather than intersected — `string & Date` is uninhabitable.
    input: Omit<CreateExpenseInput, "incurredOn"> & { incurredOn: Date },
    recordedById: string | null,
  ) {
    return prisma.expense.create({
      data: {
        tenantId,
        label: input.label,
        amount: input.amount,
        category: input.category,
        incurredOn: input.incurredOn,
        note: input.note ?? null,
        recordedById,
      },
    });
  },

  updateExpense(expenseId: string, input: UpdateExpenseInput) {
    return prisma.expense.update({
      where: { id: expenseId },
      data: {
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.amount !== undefined ? { amount: input.amount } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.incurredOn !== undefined ? { incurredOn: new Date(input.incurredOn) } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
      },
    });
  },

  deleteExpense(expenseId: string) {
    return prisma.expense.delete({ where: { id: expenseId } });
  },

  listRecurring(tenantId: string) {
    return prisma.recurringExpense.findMany({
      where: { tenantId },
      orderBy: [{ isActive: "desc" }, { dayOfMonth: "asc" }, { label: "asc" }],
    });
  },

  findRecurring(tenantId: string, id: string) {
    return prisma.recurringExpense.findFirst({ where: { id, tenantId } });
  },

  createRecurring(tenantId: string, input: CreateRecurringExpenseInput) {
    return prisma.recurringExpense.create({
      data: {
        tenantId,
        label: input.label,
        amount: input.amount,
        category: input.category,
        dayOfMonth: input.dayOfMonth,
        note: input.note ?? null,
      },
    });
  },

  updateRecurring(id: string, input: UpdateRecurringExpenseInput) {
    return prisma.recurringExpense.update({
      where: { id },
      data: {
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.amount !== undefined ? { amount: input.amount } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.dayOfMonth !== undefined ? { dayOfMonth: input.dayOfMonth } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
      },
    });
  },

  deleteRecurring(id: string) {
    return prisma.recurringExpense.delete({ where: { id } });
  },

  /** Which templates have already been posted for a month, so the page can say so. */
  postedRecurringIds(tenantId: string, month: string) {
    return prisma.expense.findMany({
      where: { tenantId, periodMonth: month, recurringExpenseId: { not: null } },
      select: { id: true, recurringExpenseId: true, amount: true },
    });
  },

  postRecurring(args: {
    tenantId: string;
    recurringExpenseId: string;
    month: string;
    label: string;
    amount: number;
    category: string;
    incurredOn: Date;
    note: string | null;
    recordedById: string | null;
  }) {
    return prisma.expense.create({
      data: {
        tenantId: args.tenantId,
        label: args.label,
        amount: args.amount,
        category: args.category,
        incurredOn: args.incurredOn,
        recurringExpenseId: args.recurringExpenseId,
        periodMonth: args.month,
        note: args.note,
        recordedById: args.recordedById,
      },
    });
  },

  /** Expense total for a month, split by category. */
  async expenseTotals(tenantId: string, month: string) {
    const { from, to } = monthRange(month);
    const rows = await prisma.expense.groupBy({
      by: ["category"],
      where: { tenantId, incurredOn: { gte: from, lt: to } },
      _sum: { amount: true },
    });

    return rows.map((row) => ({ category: row.category, amount: row._sum.amount ?? 0 }));
  },

  /**
   * What the gym took in during a month.
   *
   * `payments` covers memberships, admission charges and member store orders
   * alike, because all three write a Payment row. `guestStoreSales` picks up the
   * counter sales to people who are not members, which are the only completed
   * orders with no payment behind them.
   */
  async incomeTotals(tenantId: string, month: string) {
    const { from, to } = monthRange(month);

    const [payments, guestOrders] = await Promise.all([
      prisma.payment.aggregate({
        where: {
          tenantId,
          status: PaymentStatus.COMPLETED,
          paidAt: { gte: from, lt: to },
        },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.storeOrder.aggregate({
        where: {
          tenantId,
          status: "COMPLETED",
          paymentId: null,
          createdAt: { gte: from, lt: to },
        },
        _sum: { totalAmount: true },
        _count: true,
      }),
    ]);

    return {
      payments: payments._sum.amount ?? 0,
      paymentCount: payments._count,
      guestStoreSales: guestOrders._sum.totalAmount ?? 0,
      guestStoreCount: guestOrders._count,
    };
  },
};
